// Formatter ESC/POS: converte una Comanda (oggetto JSON generato dallo smistatore)
// in un Buffer di byte conforme allo standard ESC/POS, pronto per essere inviato
// via TCP raw socket a una stampante termica (o all'emulatore di sviluppo).

const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer')

// Mappa modello → tipo libreria
const MODELLI = {
    EPSON: PrinterTypes.EPSON,
    STAR: PrinterTypes.STAR,
    CUSTOM: PrinterTypes.CUSTOM,
    DARUMA: PrinterTypes.DARUMA,
}

function risolviTipo(modello) {
    return MODELLI[(modello || 'EPSON').toUpperCase()] || PrinterTypes.EPSON
}

function intestazione(printer, comanda) {
    if (comanda.asporto) {
        printer.alignCenter()
        printer.setTextDoubleHeight()
        printer.setTextDoubleWidth()
        printer.bold(true)
        printer.println('ASPORTO')
        printer.bold(false)
        printer.setTextNormal()
    }
    printer.alignCenter()
    printer.bold(true)
    printer.println(`REPARTO ${String(comanda.reparto || '').toUpperCase()}`)
    printer.bold(false)
    printer.drawLine()
}

function meta(printer, comanda) {
    const data = new Date(comanda.timestamp || Date.now())
    const ora = data.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    printer.alignLeft()
    printer.println(`Ordine #${comanda.ordine_id}    ${ora}`)
    if (typeof comanda.tavolo === 'number') {
        printer.println(`Tavolo: ${comanda.tavolo}`)
    }
    printer.drawLine()
}

function corpo(printer, comanda) {
    printer.alignLeft()
    // Righe ordinate per P decrescente (lo smistatore già le passa così)
    for (const riga of comanda.righe || []) {
        printer.bold(true)
        printer.println(`${riga.quantita}x  ${riga.nome}`)
        printer.bold(false)
        // Note per porzione: deduplica per non stampare la stessa nota N volte
        const noteUniche = new Map()
        for (const n of (riga.note || [])) {
            const k = `${n.numero_porzione || 0}|${n.testo}`
            if (!noteUniche.has(k)) noteUniche.set(k, n)
        }
        for (const n of noteUniche.values()) {
            const prefisso = n.numero_porzione ? `  [${n.numero_porzione}] > ` : '  > '
            printer.println(`${prefisso}${n.testo}`)
        }
    }
}

function piede(printer) {
    printer.drawLine()
    printer.alignCenter()
    printer.println('** FINE COMANDA **')
    printer.cut()
}

function intestazioneCopiaCliente(printer, dati) {
    if (dati.asporto) {
        printer.alignCenter()
        printer.setTextDoubleHeight()
        printer.setTextDoubleWidth()
        printer.bold(true)
        printer.println('ASPORTO')
        printer.bold(false)
        printer.setTextNormal()
    }
    printer.alignCenter()
    printer.bold(true)
    printer.println('COPIA CLIENTE')
    printer.bold(false)
    printer.drawLine()
}

function corpoCopiaCliente(printer, dati) {
    printer.alignLeft()
    for (const riga of dati.righe || []) {
        const prezzo = parseFloat(riga.prezzo || 0)
        const subtotale = parseFloat((riga.quantita * prezzo).toFixed(2))
        printer.bold(true)
        printer.println(`${riga.quantita}x  ${riga.nome}`)
        printer.bold(false)
        printer.println(`    ${prezzo.toFixed(2)} EUR  =  ${subtotale.toFixed(2)} EUR`)
        const noteUniche = new Map()
        for (const n of (riga.note || [])) {
            const k = `${n.numero_porzione || 0}|${n.testo}`
            if (!noteUniche.has(k)) noteUniche.set(k, n)
        }
        for (const n of noteUniche.values()) {
            const prefisso = n.numero_porzione ? `  [${n.numero_porzione}] > ` : '  > '
            printer.println(`${prefisso}${n.testo}`)
        }
    }
    printer.drawLine()
    printer.bold(true)
    printer.println(`TOTALE:     ${parseFloat(dati.totale || 0).toFixed(2)} EUR`)
    printer.println(`PAGATO:     ${parseFloat(dati.importo_pagato || 0).toFixed(2)} EUR`)
    if (dati.resto != null && dati.resto > 0) {
        printer.println(`RESTO:      ${dati.resto.toFixed(2)} EUR`)
    }
    printer.bold(false)
}

async function formattaCopiaCliente(dati, opzioni = {}) {
    const printer = new ThermalPrinter({
        type: risolviTipo(opzioni.modello),
        interface: 'tcp://127.0.0.1:1',
        characterSet: 'PC858_EURO',
        removeSpecialCharacters: false,
        lineCharacter: '-',
        width: opzioni.larghezza_caratteri || 32,
    })

    intestazioneCopiaCliente(printer, dati)
    meta(printer, dati)
    corpoCopiaCliente(printer, dati)
    printer.drawLine()
    printer.alignCenter()
    printer.println('** FINE SCONTRINO **')
    printer.cut()

    return printer.getBuffer()
}

// Costruisce un buffer ESC/POS per la comanda data.
// L'oggetto opzioni può specificare: modello, larghezza_caratteri (default 32).
async function formattaComanda(comanda, opzioni = {}) {
    // interface fittizia: la libreria la richiede per istanziare, ma noi usiamo
    // solo getBuffer() — l'I/O reale lo gestisce il dispatcher via net.Socket().
    const printer = new ThermalPrinter({
        type: risolviTipo(opzioni.modello),
        interface: 'tcp://127.0.0.1:1',
        characterSet: 'PC858_EURO',
        removeSpecialCharacters: false,
        lineCharacter: '-',
        width: opzioni.larghezza_caratteri || 32,
    })

    intestazione(printer, comanda)
    meta(printer, comanda)
    corpo(printer, comanda)
    piede(printer)

    return printer.getBuffer()
}

// Espande una comanda in N buffer secondo la modalità di stampa.
// - singola_multipla (default): 1 buffer con tutte le righe
// - singola_singola: N buffer (uno per porzione di ogni riga)
// - doppia_copia: 2 buffer identici
async function pagineDaInviare(comanda, modalita_stampa = 'singola_multipla', opzioni = {}) {
    const modalita = String(modalita_stampa || 'singola_multipla').toLowerCase()

    if (modalita === 'doppia_copia') {
        const buf = await formattaComanda(comanda, opzioni)
        return [buf, buf]
    }

    if (modalita === 'singola_singola') {
        const pagine = []
        for (const riga of (comanda.righe || [])) {
            for (let i = 1; i <= riga.quantita; i++) {
                const notePorzione = (riga.note || []).filter(n => !n.numero_porzione || n.numero_porzione === i)
                const comandaPorzione = {
                    ...comanda,
                    righe: [{ ...riga, quantita: 1, note: notePorzione.map(n => ({ ...n, numero_porzione: undefined })) }],
                }
                pagine.push(await formattaComanda(comandaPorzione, opzioni))
            }
        }
        return pagine.length > 0 ? pagine : [await formattaComanda(comanda, opzioni)]
    }

    // singola_multipla
    return [await formattaComanda(comanda, opzioni)]
}

// Pagina di test (richiesta da admin per verificare connessione + carta)
async function pagineDiTest(stampante) {
    const comandaTest = {
        ordine_id: 0,
        reparto: stampante.reparto,
        asporto: false,
        timestamp: Date.now(),
        righe: [
            { quantita: 1, nome: 'PAGINA DI TEST', note: [] },
            { quantita: 1, nome: `${stampante.nome || stampante.reparto}`, note: [{ testo: `${stampante.indirizzo_ip}:${stampante.porta}` }] },
            { quantita: 1, nome: 'Stampa OK se leggi questo', note: [] },
        ],
    }
    return pagineDaInviare(comandaTest, 'singola_multipla', { modello: stampante.modello })
}

module.exports = {
    formattaComanda,
    formattaCopiaCliente,
    pagineDaInviare,
    pagineDiTest,
}
