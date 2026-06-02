const express = require('express')
const router = express.Router()
const stampa = require('../services/stampa')
const stampeRepo = require('../repositories/stampa.repo')

// GET /api/stampe?ordine_id=N  → storico stampe di un ordine
router.get('/', async (req, res) => {
    try {
        const { ordine_id } = req.query
        const righe = ordine_id
            ? await stampeRepo.storicoPerOrdine(ordine_id)
            : await stampeRepo.storicoTutti()
        res.json(righe)
    } catch (err) {
        res.status(500).json({ errore: err.message })
    }
})

// GET /api/stampe/recenti?limit=50
router.get('/recenti', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 500)
        res.json(await stampeRepo.recenti(limit))
    } catch (err) {
        res.status(500).json({ errore: err.message })
    }
})

// POST /api/stampe/:id/ristampa  → reinvia una stampa precedente
router.post('/:id/ristampa', async (req, res) => {
    try {
        const stampaEseguita = await stampeRepo.trovaPerId(req.params.id)
        if (!stampaEseguita) return res.status(404).json({ errore: 'Stampa non trovata' })
        if (!stampaEseguita.payload) return res.status(400).json({ errore: 'Payload non disponibile per ristampa' })

        const comanda = typeof stampaEseguita.payload === 'string' ? JSON.parse(stampaEseguita.payload) : stampaEseguita.payload
        const ris = await stampa.inviaComanda(comanda)
        res.json({ ristampa: ris })
    } catch (err) {
        res.status(500).json({ errore: err.message })
    }
})

// POST /api/stampanti/:id/test  → invia pagina di test alla stampante
router.post('/test/:id', async (req, res) => {
    try {
        const ris = await stampa.stampaTestPage(parseInt(req.params.id))
        res.json(ris)
    } catch (err) {
        res.status(500).json({ errore: err.message })
    }
})

// ─── Controllo emulatore (per simulare guasti dalla UI) ─────────────────────
// POST /api/stampe/emulatore/:stampante_id/spegni
router.post('/emulatore/:stampante_id/spegni', async (req, res) => {
    try {
        const id = parseInt(req.params.stampante_id)
        const { reparto } = await stampa.spegniEmulatore(id)
        // Notifica subito lo smistatore così i prossimi ordini vengono routati al fallback
        if (reparto) req.app.locals.io?.emit('stampante_offline', { reparto, stampante_id: id })
        res.json({ ok: true, stampante_id: id, stato: 'offline' })
    } catch (err) {
        res.status(500).json({ errore: err.message })
    }
})

// POST /api/stampe/emulatore/:stampante_id/accendi
router.post('/emulatore/:stampante_id/accendi', async (req, res) => {
    try {
        const id = parseInt(req.params.stampante_id)
        const { ok, reparto } = await stampa.accendiEmulatore(id)
        if (reparto) req.app.locals.io?.emit('stampante_online', { reparto, stampante_id: id })
        res.json({ ok, stampante_id: id, stato: 'online' })
    } catch (err) {
        res.status(500).json({ errore: err.message })
    }
})

// GET /api/stampe/emulatore/stato
router.get('/emulatore/stato', (req, res) => {
    res.json(stampa.statoEmulatori())
})

module.exports = router
