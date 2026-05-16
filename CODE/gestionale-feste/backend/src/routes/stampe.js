const express = require('express')
const router = express.Router()
const db = require('../db')
const dispatcher = require('../services/printer-dispatcher')
const emulatore = require('../services/escpos-emulator')

// GET /api/stampe?ordine_id=N  → storico stampe di un ordine
router.get('/', async (req, res) => {
    try {
        const { ordine_id } = req.query
        let righe
        if (ordine_id) {
            [righe] = await db.query(
                `SELECT se.*, s.nome AS stampante_nome, s.indirizzo_ip, s.porta
                 FROM stampa_eseguita se
                 LEFT JOIN stampante s ON s.id = se.stampante_id
                 WHERE se.ordine_id = ?
                 ORDER BY se.timestamp DESC`,
                [ordine_id]
            )
        } else {
            [righe] = await db.query(
                `SELECT se.*, s.nome AS stampante_nome, s.indirizzo_ip, s.porta
                 FROM stampa_eseguita se
                 LEFT JOIN stampante s ON s.id = se.stampante_id
                 ORDER BY se.timestamp DESC LIMIT 100`
            )
        }
        res.json(righe)
    } catch (err) {
        res.status(500).json({ errore: err.message })
    }
})

// GET /api/stampe/recenti?limit=50
router.get('/recenti', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 500)
        const [righe] = await db.query(
            `SELECT se.id, se.ordine_id, se.stampante_id, se.reparto, se.esito,
                    se.errore, se.durata_ms, se.timestamp, s.nome AS stampante_nome
             FROM stampa_eseguita se
             LEFT JOIN stampante s ON s.id = se.stampante_id
             ORDER BY se.timestamp DESC LIMIT ?`,
            [limit]
        )
        res.json(righe)
    } catch (err) {
        res.status(500).json({ errore: err.message })
    }
})

// POST /api/stampe/:id/ristampa  → reinvia una stampa precedente
router.post('/:id/ristampa', async (req, res) => {
    try {
        const [righe] = await db.query('SELECT * FROM stampa_eseguita WHERE id = ?', [req.params.id])
        const stampa = righe[0]
        if (!stampa) return res.status(404).json({ errore: 'Stampa non trovata' })
        if (!stampa.payload) return res.status(400).json({ errore: 'Payload non disponibile per ristampa' })

        const comanda = typeof stampa.payload === 'string' ? JSON.parse(stampa.payload) : stampa.payload
        const ris = await dispatcher.inviaComanda(comanda)
        res.json({ ristampa: ris })
    } catch (err) {
        res.status(500).json({ errore: err.message })
    }
})

// POST /api/stampanti/:id/test  → invia pagina di test alla stampante
router.post('/test/:id', async (req, res) => {
    try {
        const ris = await dispatcher.stampaTestPage(parseInt(req.params.id))
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
        await emulatore.spegniStampante(id)
        await db.query("UPDATE stampante SET stato='offline' WHERE id=?", [id])
        res.json({ ok: true, stampante_id: id, stato: 'offline' })
    } catch (err) {
        res.status(500).json({ errore: err.message })
    }
})

// POST /api/stampe/emulatore/:stampante_id/accendi
router.post('/emulatore/:stampante_id/accendi', async (req, res) => {
    try {
        const id = parseInt(req.params.stampante_id)
        const ok = await emulatore.accendiStampante(id, db)
        await db.query("UPDATE stampante SET stato='online' WHERE id=?", [id])
        res.json({ ok, stampante_id: id, stato: 'online' })
    } catch (err) {
        res.status(500).json({ errore: err.message })
    }
})

// GET /api/stampe/emulatore/stato
router.get('/emulatore/stato', (req, res) => {
    res.json(emulatore.statoEmulatori())
})

module.exports = router
