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
const stampanteRepo = require('../repositories/stampante.repo')

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

// Dispatch dei comandi ESC (0x1B). Ogni handler riceve (buffer, i, ctx) e
// ritorna il nuovo indice i. Se mancano i byte del parametro si comporta come
// l'originale: il comando viene saltato avanzando di 2 byte.
// ctx = { scontrini, scontrino, stato, rigaCorrente } — gli handler possono
// riassegnare ctx.stato / ctx.scontrino (per questo si usa un contenitore).
const ESC_HANDLERS = {
    // ESC @ → reset
    0x40: (buffer, i, ctx) => {
        ctx.stato = nuovoStato()
        ctx.rigaCorrente.statoIniziale = copiaStato(ctx.stato)
        return i + 2
    },
    // ESC a n → allineamento (si applica alla riga corrente)
    0x61: (buffer, i, ctx) => {
        if (i + 2 >= buffer.length) return i + 2
        const n = buffer[i + 2]
        ctx.stato.allineamento = n === 1 ? 'center' : n === 2 ? 'right' : 'left'
        ctx.rigaCorrente.statoIniziale.allineamento = ctx.stato.allineamento
        return i + 3
    },
    // ESC ! n → print mode (font + bold + size)
    0x21: (buffer, i, ctx) => {
        if (i + 2 >= buffer.length) return i + 2
        const n = buffer[i + 2]
        ctx.stato.bold = (n & 0x08) !== 0
        ctx.stato.doppia_altezza = (n & 0x10) !== 0
        ctx.stato.doppia_larghezza = (n & 0x20) !== 0
        ctx.stato.sottolineato = (n & 0x80) !== 0
        ctx.rigaCorrente.statoIniziale = copiaStato(ctx.stato)
        return i + 3
    },
    // ESC E n → bold on/off
    0x45: (buffer, i, ctx) => {
        if (i + 2 >= buffer.length) return i + 2
        ctx.stato.bold = buffer[i + 2] !== 0
        ctx.rigaCorrente.statoIniziale.bold = ctx.stato.bold
        return i + 3
    },
    // ESC - n → underline
    0x2d: (buffer, i, ctx) => {
        if (i + 2 >= buffer.length) return i + 2
        ctx.stato.sottolineato = buffer[i + 2] !== 0
        ctx.rigaCorrente.statoIniziale.sottolineato = ctx.stato.sottolineato
        return i + 3
    },
    // ESC t n → set code page (ignorato, usiamo CP858 fisso)
    0x74: (buffer, i) => (i + 2 < buffer.length ? i + 3 : i + 2),
    // ESC R n → international char set (ignorato)
    0x52: (buffer, i) => (i + 2 < buffer.length ? i + 3 : i + 2),
    // ESC 2 → spaziatura riga di default (ignorato, nessun parametro)
    0x32: (buffer, i) => i + 2,
    // ESC 3 n → spaziatura riga (ignorato)
    0x33: (buffer, i) => (i + 2 < buffer.length ? i + 3 : i + 2),
    // ESC d n → feed n lines
    0x64: (buffer, i, ctx) => {
        if (i + 2 >= buffer.length) return i + 2
        const n = buffer[i + 2]
        for (let k = 0; k < n; k++) chiudiRiga(ctx.rigaCorrente, ctx.stato, ctx.scontrino)
        return i + 3
    },
    // ESC J n → print and feed n dots (ignorato come line feed singolo)
    0x4a: (buffer, i) => (i + 2 < buffer.length ? i + 3 : i + 2),
}

// Dispatch dei comandi GS (0x1D). Stessa convenzione di ESC_HANDLERS.
const GS_HANDLERS = {
    // GS V m / GS V m n → taglio carta: flush riga e chiude lo scontrino corrente
    0x56: (buffer, i, ctx) => {
        const m = buffer[i + 2]
        // Forme: GS V m (1 param) o GS V m n (2 param, con offset)
        const nuovoI = (m === 0x41 || m === 0x42 || m === 0x61 || m === 0x62) ? i + 4 : i + 3
        if (ctx.rigaCorrente.bytes.length > 0) chiudiRiga(ctx.rigaCorrente, ctx.stato, ctx.scontrino)
        if (ctx.scontrino.righe.length > 0) {
            ctx.scontrini.push(ctx.scontrino)
            ctx.scontrino = { righe: [] }
        }
        return nuovoI
    },
    // GS ! n → set character size
    0x21: (buffer, i, ctx) => {
        if (i + 2 >= buffer.length) return i + 2
        const n = buffer[i + 2]
        const width = (n >> 4) & 0x0f
        const height = n & 0x0f
        ctx.stato.doppia_larghezza = width >= 1
        ctx.stato.doppia_altezza = height >= 1
        ctx.rigaCorrente.statoIniziale = copiaStato(ctx.stato)
        return i + 3
    },
    // GS B n → reverse mode (ignorato)
    0x42: (buffer, i) => (i + 2 < buffer.length ? i + 3 : i + 2),
    // GS L nL nH → left margin (ignorato)
    0x4c: (buffer, i) => (i + 3 < buffer.length ? i + 4 : i + 2),
    // GS W nL nH → print area width (ignorato)
    0x57: (buffer, i) => (i + 3 < buffer.length ? i + 4 : i + 2),
    // GS r n → status (ignorato)
    0x72: (buffer, i) => (i + 2 < buffer.length ? i + 3 : i + 2),
}

// ESC/GS sconosciuto: skip 2 byte e prosegui (come l'originale).
function gestisciEsc(buffer, i, ctx) {
    const handler = ESC_HANDLERS[buffer[i + 1]]
    return handler ? handler(buffer, i, ctx) : i + 2
}
function gestisciGs(buffer, i, ctx) {
    const handler = GS_HANDLERS[buffer[i + 1]]
    return handler ? handler(buffer, i, ctx) : i + 2
}

// Parsa un flusso di byte ESC/POS in una lista di scontrini.
// Ritorna { scontrini: [...], scontrinoParziale: ... rimasto (incompleto) }
function parsaFlusso(buffer) {
    const scontrini = []
    const ctx = {
        scontrini,
        scontrino: { righe: [] },
        stato: nuovoStato(),
        rigaCorrente: null,
    }
    ctx.rigaCorrente = { bytes: [], statoIniziale: copiaStato(ctx.stato) }

    let i = 0
    while (i < buffer.length) {
        const b = buffer[i]

        if (b === 0x0a) {                                 // LF: nuova riga
            chiudiRiga(ctx.rigaCorrente, ctx.stato, ctx.scontrino)
            i++
        } else if (b === 0x0d) {                          // CR: ignorato
            i++
        } else if (b === 0x1b && i + 1 < buffer.length) { // ESC ...
            i = gestisciEsc(buffer, i, ctx)
        } else if (b === 0x1d && i + 1 < buffer.length) { // GS ...
            i = gestisciGs(buffer, i, ctx)
        } else if (b === 0x1c && i + 1 < buffer.length) { // FS: skip 3 conservativi
            i += 3
        } else {                                          // testo stampabile
            ctx.rigaCorrente.bytes.push(Buffer.from([b]))
            i++
        }
    }

    // Flush eventuale riga residua come scontrino "incompleto" — gestito dal chiamante
    if (ctx.rigaCorrente.bytes.length > 0) {
        chiudiRiga(ctx.rigaCorrente, ctx.stato, ctx.scontrino)
    }
    return { scontrini, scontrinoParziale: ctx.scontrino }
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
    // Rimuovi righe vuote in coda (il cut() ESC/POS le inserisce come padding
    // per far avanzare la carta prima del taglio, ma sulla UI sono inutili)
    const righe = [...scontrino.righe]
    while (righe.length > 0 && (righe[righe.length - 1].testo || '').trim() === '') {
        righe.pop()
    }
    if (righe.length === 0) return  // scontrino completamente vuoto: ignora
    emit('stampa_renderizzata', {
        stampante_id: stampante.id,
        reparto: stampante.reparto,
        nome: stampante.nome,
        timestamp: Date.now(),
        righe,
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
async function avviaEmulatori() {
    const stampanti = await stampanteRepo.elencaLocaliAttive()
    let avviati = 0
    for (const s of stampanti) {
        if (serverPerStampante.has(s.id)) continue
        avviaServerStampante(s)
        avviati++
    }
    return avviati
}

// Avvia emulatori per stampanti locali non ancora in ascolto (es. dopo migrazione cassa)
async function sincronizzaEmulatori() {
    return avviaEmulatori()
}

// Spegne l'emulatore di una stampante (simula guasto: TCP rifiuta connessioni)
async function spegniStampante(stampante_id) {
    return fermaServerStampante(stampante_id)
}

// Riaccende l'emulatore
async function accendiStampante(stampante_id) {
    if (serverPerStampante.has(stampante_id)) return true
    const stampante = await stampanteRepo.trovaPerId(stampante_id)
    if (!stampante) return false
    avviaServerStampante(stampante)
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
    sincronizzaEmulatori,
    spegniStampante,
    accendiStampante,
    statoEmulatori,
    // Esposti per test
    _parsaFlusso: parsaFlusso,
}
