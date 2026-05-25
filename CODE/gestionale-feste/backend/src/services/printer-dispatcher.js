// Printer Dispatcher: orchestra il flusso dalla comanda (generata dallo smistatore)
// al buffer ESC/POS (prodotto dal formatter) fino alla stampante fisica (via TCP raw).
//
// Punto chiave architetturale: il transport TCP è SEMPRE lo stesso, sia che la
// stampante sia un emulatore locale su 127.0.0.1 sia che sia hardware reale
// in produzione. Cambia solo il record nella tabella stampante.

const net = require('net')
const db = require('../db')
const formatter = require('./formatter')
const smistatore = require('./smistatore')

const TIMEOUT_TCP_MS = 5000
let ioRef = null

function setIo(io) { ioRef = io }

function emit(event, payload) {
    if (ioRef) ioRef.emit(event, payload)
}

// Invia un buffer alla stampante via TCP raw socket.
// Risolve con { ok:true, durata_ms } o { ok:false, errore, codice }.
function inviaBuffer(stampante, buffer) {
    return new Promise((resolve) => {
        const inizio = Date.now()
        let risolto = false
        const fine = (esito) => {
            if (risolto) return
            risolto = true
            esito.durata_ms = Date.now() - inizio
            resolve(esito)
        }

        const socket = new net.Socket()
        socket.setTimeout(TIMEOUT_TCP_MS)

        socket.once('error', (err) => {
            fine({ ok: false, errore: err.message, codice: err.code || 'ERR' })
            try { socket.destroy() } catch {}
        })
        socket.once('timeout', () => {
            fine({ ok: false, errore: 'timeout', codice: 'ETIMEDOUT' })
            try { socket.destroy() } catch {}
        })
        socket.once('close', () => {
            // Se chiude prima che abbiamo concluso scrittura → errore
            fine({ ok: true })
        })

        socket.connect(stampante.porta, stampante.indirizzo_ip, () => {
            socket.write(buffer, (err) => {
                if (err) {
                    fine({ ok: false, errore: err.message, codice: err.code || 'EWRITE' })
                    try { socket.destroy() } catch {}
                    return
                }
                // Diamo un breve attimo alla stampante per assorbire, poi chiudiamo
                socket.end()
            })
        })
    })
}

async function risolviStampantePrimaria(reparto) {
    const [righe] = await db.query(
        `SELECT * FROM stampante
         WHERE reparto = ? AND primaria = 1 AND attiva = 1
         ORDER BY id ASC LIMIT 1`,
        [reparto]
    )
    return righe[0] || null
}

async function logStampa({ ordine_id, stampante_id, reparto, payload, esito, errore, durata_ms }) {
    try {
        await db.query(
            `INSERT INTO stampa_eseguita (ordine_id, stampante_id, reparto, payload, esito, errore, durata_ms)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [ordine_id, stampante_id || null, reparto, JSON.stringify(payload || null), esito, errore || null, durata_ms || null]
        )
    } catch (err) {
        console.error('logStampa errore:', err.message)
    }
}

// Funzione principale: invia una comanda alla stampante del reparto.
// Fire-and-forget: non lancia mai eccezioni verso il chiamante.
async function inviaComanda(comanda, opzioni = {}) {
    const reparto = comanda.reparto
    const ordine_id = comanda.ordine_id

    // Risolvi stampante primaria del reparto
    const stampante = await risolviStampantePrimaria(reparto)
    if (!stampante) {
        await logStampa({ ordine_id, reparto, payload: comanda, esito: 'no_stampante', errore: `Nessuna stampante primaria attiva per il reparto ${reparto}` })
        emit('stampa_fallita', { ordine_id, reparto, motivo: 'no_stampante' })
        return { ok: false, motivo: 'no_stampante' }
    }

    // Modalità di stampa: ricavata dalla prima riga della comanda (tutte le righe
    // dello stesso reparto hanno la stessa modalita), default singola_multipla.
    const modalita = opzioni.modalita_stampa || comanda.modalita_stampa || 'singola_multipla'

    let pagine
    try {
        pagine = await formatter.pagineDaInviare(comanda, modalita, { modello: stampante.modello })
    } catch (err) {
        await logStampa({ ordine_id, stampante_id: stampante.id, reparto, payload: comanda, esito: 'errore', errore: `Formattazione fallita: ${err.message}` })
        emit('stampa_fallita', { ordine_id, reparto, motivo: 'formattazione', errore: err.message })
        return { ok: false, motivo: 'formattazione' }
    }

    // Invia in sequenza (i modelli economici non amano connessioni concorrenti)
    let durataTotale = 0
    for (const buffer of pagine) {
        const ris = await inviaBuffer(stampante, buffer)
        durataTotale += ris.durata_ms || 0

        if (!ris.ok) {
            // Marca stampante offline
            try {
                await db.query("UPDATE stampante SET stato='offline' WHERE id=?", [stampante.id])
            } catch {}
            smistatore.setStatoStampante(reparto, 'offline')
            emit('stampante_offline', { reparto, stampante_id: stampante.id, errore: ris.errore })

            await logStampa({ ordine_id, stampante_id: stampante.id, reparto, payload: comanda, esito: 'errore', errore: `${ris.codice}: ${ris.errore}`, durata_ms: durataTotale })
            emit('stampa_fallita', { ordine_id, reparto, motivo: 'tcp', codice: ris.codice, errore: ris.errore })
            return { ok: false, motivo: 'tcp', codice: ris.codice }
        }
    }

    // Successo: assicurati che lo stato sia online (potrebbe essere stato spento prima)
    try {
        await db.query("UPDATE stampante SET stato='online' WHERE id=? AND stato!='online'", [stampante.id])
    } catch {}
    smistatore.setStatoStampante(reparto, 'online')

    await logStampa({ ordine_id, stampante_id: stampante.id, reparto, payload: comanda, esito: 'ok', durata_ms: durataTotale })
    emit('comanda_stampata', { ordine_id, reparto, stampante_id: stampante.id, durata_ms: durataTotale, pagine: pagine.length })
    return { ok: true, durata_ms: durataTotale, pagine: pagine.length }
}

// Pagina di test per una stampante specifica (utile dall'UI admin)
async function stampaTestPage(stampante_id) {
    const [righe] = await db.query('SELECT * FROM stampante WHERE id = ?', [stampante_id])
    const stampante = righe[0]
    if (!stampante) return { ok: false, motivo: 'stampante_inesistente' }

    const pagine = await formatter.pagineDiTest(stampante)
    for (const buf of pagine) {
        const ris = await inviaBuffer(stampante, buf)
        if (!ris.ok) {
            await logStampa({ ordine_id: 0, stampante_id, reparto: stampante.reparto, payload: { test: true }, esito: 'errore', errore: ris.errore, durata_ms: ris.durata_ms })
            return { ok: false, motivo: 'tcp', codice: ris.codice, errore: ris.errore }
        }
    }
    await logStampa({ ordine_id: 0, stampante_id, reparto: stampante.reparto, payload: { test: true }, esito: 'ok' })
    return { ok: true }
}

module.exports = {
    setIo,
    inviaComanda,
    stampaTestPage,
}
