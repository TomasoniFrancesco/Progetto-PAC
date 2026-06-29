// Façade del sottosistema di stampa.
//
// Incapsula la catena smistatore → formatter → printer-dispatcher → escpos
// dietro un'unica interfaccia di alto livello. Le route (ordini, stampe,
// smistatore) dipendono SOLO da questo modulo invece di importare i singoli
// servizi: il confine del sottosistema è uno solo.
//
// Nota: il formatter è usato internamente dal dispatcher, quindi non è esposto.

const smistatore = require('../smistatore')
const dispatcher = require('../printer-dispatcher')
const emulatore = require('../escpos-emulator')
const stampanteRepo = require('../../repositories/stampante.repo')

// ── Wiring Socket.io (chiamato dal bootstrap) ───────────────────────────────
function collegaIo(io) {
    dispatcher.setIo(io)
    emulatore.setIo(io)
}

// ── Routing e code (smistatore, stato in memoria) ───────────────────────────
const routeOrder = (...a) => smistatore.routeOrder(...a)
const snapshotCode = () => smistatore.snapshot()
const completaTask = (...a) => smistatore.completaTask(...a)
const setStatoStampante = (...a) => smistatore.setStatoStampante(...a)
const setFallback = (...a) => smistatore.setFallback(...a)

// ── Stampa fisica (dispatcher) ──────────────────────────────────────────────
const inviaComanda = (...a) => dispatcher.inviaComanda(...a)
const inviaCopiaCliente = (...a) => dispatcher.inviaCopiaCliente(...a)
const stampaTestPage = (...a) => dispatcher.stampaTestPage(...a)

// ── Emulatore ESC/POS ───────────────────────────────────────────────────────
const statoEmulatori = () => emulatore.statoEmulatori()
const avviaEmulatori = () => emulatore.avviaEmulatori()
const sincronizzaEmulatori = () => emulatore.sincronizzaEmulatori()

// Spegne l'emulatore di una stampante, ne persiste lo stato e allinea lo
// smistatore. Ritorna il reparto coinvolto (per la notifica WebSocket lato route).
async function spegniEmulatore(stampanteId) {
    await emulatore.spegniStampante(stampanteId)
    await stampanteRepo.impostaStato(stampanteId, 'offline')
    const stampante = await stampanteRepo.trovaPerId(stampanteId)
    if (stampante) smistatore.setStatoStampante(stampante.reparto, 'offline')
    return { reparto: stampante ? stampante.reparto : null }
}

// Riaccende l'emulatore di una stampante, ne persiste lo stato e allinea lo
// smistatore. Ritorna { ok, reparto }.
async function accendiEmulatore(stampanteId) {
    const ok = await emulatore.accendiStampante(stampanteId)
    await stampanteRepo.impostaStato(stampanteId, 'online')
    const stampante = await stampanteRepo.trovaPerId(stampanteId)
    if (stampante) smistatore.setStatoStampante(stampante.reparto, 'online')
    return { ok, reparto: stampante ? stampante.reparto : null }
}

module.exports = {
    collegaIo,
    // routing/code
    routeOrder,
    snapshotCode,
    completaTask,
    setStatoStampante,
    setFallback,
    // stampa fisica
    inviaComanda,
    inviaCopiaCliente,
    stampaTestPage,
    // emulatore
    statoEmulatori,
    avviaEmulatori,
    sincronizzaEmulatori,
    spegniEmulatore,
    accendiEmulatore,
}
