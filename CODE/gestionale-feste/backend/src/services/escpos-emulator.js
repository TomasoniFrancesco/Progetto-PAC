// Emulatore TCP ESC/POS
// Avvia N server TCP (uno per stampante locale) sulle porte configurate nel DB.
// Quando il dispatcher si connette e scrive byte ESC/POS, l'emulatore li parsa,
// ricostruisce la struttura logica dello scontrino e la pubblica via WebSocket
// alla pagina /simulazione del frontend.
//
// È la controparte demo dell'hardware reale: scambiarli richiede solo cambiare
// gli IP/porte nel DB (e spegnere gli emulatori).

const net = require('net')
const iconv = require('iconv-lite')

// Mappa stampante_id → { server, stampante }
const serverPerStampante = new Map()
let ioRef = null

function setIo(io) { ioRef = io }
function emit(event, payload) {
    if (ioRef) ioRef.emit(event, payload)
}

// ─── Parser ESC/POS ──────────────────────────────────────────────────────────
// Stato corrente: allineamento, bold, font grande, etc.
function nuovoStato() {
    return {
        allineamento: 'left',  // 'left' | 'center' | 'right'
        bold: false,
        doppia_altezza: false,
        doppia_larghezza: false,
        sottolineato: false,
    }
}

function copiaStato(s) { return { ...s } }

function chiudiRiga(rigaCorrente, stato, scontrino) {
    const testo = Buffer.concat(rigaCorrente.bytes).toString('binary')
    const decoded = iconv.decode(Buffer.from(testo, 'binary'), 'cp858')
    scontrino.righe.push({
        testo: decoded,
        allineamento: rigaCorrente.statoIniziale.allineamento,
        stili: stiliDaStato(rigaCorrente.statoIniziale),
    })
    rigaCorrente.bytes = []
    rigaCorrente.statoIniziale = copiaStato(stato)
}

function stiliDaStato(s) {
    const stili = []
    if (s.bold) stili.push('bold')
    if (s.doppia_altezza) stili.push('h2')
    if (s.doppia_larghezza) stili.push('w2')
    if (s.sottolineato) stili.push('underline')
    return stili
}

// Parsa un flusso di byte ESC/POS in una lista di scontrini.
// Ritorna { scontrini: [...], avanzo: Buffer rimasto (incompleto) }
function parsaFlusso(buffer) {
    const scontrini = []
    let scontrino = { righe: [] }
    let stato = nuovoStato()
    let rigaCorrente = { bytes: [], statoIniziale: copiaStato(stato) }

    let i = 0
    while (i < buffer.length) {
        const b = buffer[i]

        // LF: nuova riga
        if (b === 0x0a) {
            chiudiRiga(rigaCorrente, stato, scontrino)
            i++
            continue
        }
        // CR: ignorato
        if (b === 0x0d) { i++; continue }

        // ESC (0x1B) ...
        if (b === 0x1b && i + 1 < buffer.length) {
            const cmd = buffer[i + 1]

            // ESC @ → reset
            if (cmd === 0x40) {
                stato = nuovoStato()
                rigaCorrente.statoIniziale = copiaStato(stato)
                i += 2
                continue
            }
            // ESC a n → allineamento
            if (cmd === 0x61 && i + 2 < buffer.length) {
                const n = buffer[i + 2]
                stato.allineamento = n === 1 ? 'center' : n === 2 ? 'right' : 'left'
                // L'allineamento si applica alla riga corrente
                rigaCorrente.statoIniziale.allineamento = stato.allineamento
                i += 3
                continue
            }
            // ESC ! n → print mode (font + bold + size)
            if (cmd === 0x21 && i + 2 < buffer.length) {
                const n = buffer[i + 2]
                stato.bold = (n & 0x08) !== 0
                stato.doppia_altezza = (n & 0x10) !== 0
                stato.doppia_larghezza = (n & 0x20) !== 0
                stato.sottolineato = (n & 0x80) !== 0
                rigaCorrente.statoIniziale = copiaStato(stato)
                i += 3
                continue
            }
            // ESC E n → bold on/off
            if (cmd === 0x45 && i + 2 < buffer.length) {
                stato.bold = buffer[i + 2] !== 0
                rigaCorrente.statoIniziale.bold = stato.bold
                i += 3
                continue
            }
            // ESC - n → underline
            if (cmd === 0x2d && i + 2 < buffer.length) {
                stato.sottolineato = buffer[i + 2] !== 0
                rigaCorrente.statoIniziale.sottolineato = stato.sottolineato
                i += 3
                continue
            }
            // ESC t n → set code page (ignorato, usiamo CP858 fisso)
            if (cmd === 0x74 && i + 2 < buffer.length) { i += 3; continue }
            // ESC R n → international char set (ignorato)
            if (cmd === 0x52 && i + 2 < buffer.length) { i += 3; continue }
            // ESC 2 / ESC 3 → spaziatura riga (ignorato)
            if (cmd === 0x32) { i += 2; continue }
            if (cmd === 0x33 && i + 2 < buffer.length) { i += 3; continue }
            // ESC d n → feed n lines
            if (cmd === 0x64 && i + 2 < buffer.length) {
                const n = buffer[i + 2]
                for (let k = 0; k < n; k++) chiudiRiga(rigaCorrente, stato, scontrino)
                i += 3
                continue
            }
            // ESC J n → print and feed n dots (ignorato come line feed singolo)
            if (cmd === 0x4a && i + 2 < buffer.length) { i += 3; continue }
            // Comando ESC sconosciuto: skip 2 byte e prosegui
            i += 2
            continue
        }

        // GS (0x1D) ...
        if (b === 0x1d && i + 1 < buffer.length) {
            const cmd = buffer[i + 1]
            // GS V n / GS V m n → taglio carta
            if (cmd === 0x56) {
                // Forme: GS V m (1 param) o GS V m n (2 param)
                const m = buffer[i + 2]
                if (m === 0x41 || m === 0x42 || m === 0x61 || m === 0x62) {
                    i += 4  // forma con offset
                } else {
                    i += 3
                }
                // Flush della riga corrente se ha contenuto, poi chiudi scontrino
                if (rigaCorrente.bytes.length > 0) chiudiRiga(rigaCorrente, stato, scontrino)
                if (scontrino.righe.length > 0) {
                    scontrini.push(scontrino)
                    scontrino = { righe: [] }
                }
                continue
            }
            // GS ! n → set character size
            if (cmd === 0x21 && i + 2 < buffer.length) {
                const n = buffer[i + 2]
                const width = (n >> 4) & 0x0f
                const height = n & 0x0f
                stato.doppia_larghezza = width >= 1
                stato.doppia_altezza = height >= 1
                rigaCorrente.statoIniziale = copiaStato(stato)
                i += 3
                continue
            }
            // GS B n → reverse mode (ignorato)
            if (cmd === 0x42 && i + 2 < buffer.length) { i += 3; continue }
            // GS L nL nH → left margin (ignorato)
            if (cmd === 0x4c && i + 3 < buffer.length) { i += 4; continue }
            // GS W nL nH → print area width (ignorato)
            if (cmd === 0x57 && i + 3 < buffer.length) { i += 4; continue }
            // GS r n → status (ignorato)
            if (cmd === 0x72 && i + 2 < buffer.length) { i += 3; continue }
            // GS sconosciuto: skip 2
            i += 2
            continue
        }

        // FS (0x1C) - prefisso comandi internazionali (ignoro 2 byte)
        if (b === 0x1c && i + 1 < buffer.length) {
            // FS ! n / FS p n m / FS C n etc. — skip 3 conservativamente
            i += 3
            continue
        }

        // Byte stampabile o testo: accumula nella riga corrente
        rigaCorrente.bytes.push(Buffer.from([b]))
        i++
    }

    // Flush eventuale riga residua come scontrino "incompleto" — gestito dal chiamante
    if (rigaCorrente.bytes.length > 0) {
        chiudiRiga(rigaCorrente, stato, scontrino)
    }
    return { scontrini, scontrinoParziale: scontrino }
}

// ─── Server TCP per singola stampante ────────────────────────────────────────
function avviaServerStampante(stampante) {
    if (serverPerStampante.has(stampante.id)) return // già attivo

    const server = net.createServer((socket) => {
        let buffer = Buffer.alloc(0)
        socket.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk])
            const { scontrini, scontrinoParziale } = parsaFlusso(buffer)
            // Tengo come "avanzo" eventuale scontrino non chiuso (mai inviato finché non arriva cut)
            buffer = Buffer.alloc(0)
            for (const sc of scontrini) {
                pubblicaScontrino(stampante, sc)
            }
            // Conservo il parziale per la prossima ricezione
            if (scontrinoParziale && scontrinoParziale.righe.length > 0) {
                // Re-encode come testo grezzo - in pratica con node-thermal-printer
                // il cut arriva sempre nello stesso pacchetto, quindi è raro.
                // Lo flushiamo alla chiusura della connessione.
                serverPerStampante.get(stampante.id).scontrinoParziale = scontrinoParziale
            }
        })
        socket.on('close', () => {
            const ref = serverPerStampante.get(stampante.id)
            if (ref?.scontrinoParziale && ref.scontrinoParziale.righe.length > 0) {
                pubblicaScontrino(stampante, ref.scontrinoParziale)
                ref.scontrinoParziale = null
            }
        })
        socket.on('error', () => { /* tipicamente reset dal client */ })
    })

    server.listen(stampante.porta, '127.0.0.1', () => {
        console.log(`Emulatore stampante: ${stampante.nome || stampante.reparto} in ascolto su 127.0.0.1:${stampante.porta}`)
    })
    server.on('error', (err) => {
        console.error(`Emulatore ${stampante.reparto} errore:`, err.message)
    })

    serverPerStampante.set(stampante.id, { server, stampante, scontrinoParziale: null })
}

function pubblicaScontrino(stampante, scontrino) {
    emit('stampa_renderizzata', {
        stampante_id: stampante.id,
        reparto: stampante.reparto,
        nome: stampante.nome,
        timestamp: Date.now(),
        righe: scontrino.righe,
    })
}

function fermaServerStampante(stampante_id) {
    const ref = serverPerStampante.get(stampante_id)
    if (!ref) return false
    return new Promise((resolve) => {
        ref.server.close(() => {
            serverPerStampante.delete(stampante_id)
            resolve(true)
        })
    })
}

// ─── API pubblica ────────────────────────────────────────────────────────────
async function avviaEmulatori(db) {
    const [stampanti] = await db.query(
        `SELECT * FROM stampante WHERE indirizzo_ip = '127.0.0.1' AND attiva = 1`
    )
    for (const s of stampanti) avviaServerStampante(s)
    return stampanti.length
}

// Spegne l'emulatore di una stampante (simula guasto: TCP rifiuta connessioni)
async function spegniStampante(stampante_id) {
    return fermaServerStampante(stampante_id)
}

// Riaccende l'emulatore
async function accendiStampante(stampante_id, db) {
    if (serverPerStampante.has(stampante_id)) return true
    const [righe] = await db.query('SELECT * FROM stampante WHERE id = ?', [stampante_id])
    if (!righe[0]) return false
    avviaServerStampante(righe[0])
    return true
}

function statoEmulatori() {
    const result = []
    for (const [id, ref] of serverPerStampante) {
        result.push({
            stampante_id: id,
            reparto: ref.stampante.reparto,
            nome: ref.stampante.nome,
            porta: ref.stampante.porta,
            in_ascolto: true,
        })
    }
    return result
}

module.exports = {
    setIo,
    avviaEmulatori,
    spegniStampante,
    accendiStampante,
    statoEmulatori,
    // Esposti per test
    _parsaFlusso: parsaFlusso,
}
