const express = require('express');
const router = express.Router();
const db = require('../db');
const smistatore = require('../services/smistatore');

// GET /api/smistatore/stato — snapshot delle code per reparto
router.get('/stato', (req, res) => {
    res.json(smistatore.snapshot());
});

// POST /api/smistatore/completa — rimuove un task dalla coda (reparto + voce_id + ordine_id)
router.post('/completa', (req, res) => {
    const { reparto, voce_id, ordine_id } = req.body;
    if (!reparto || !voce_id) return res.status(400).json({ errore: 'reparto e voce_id obbligatori' });
    const rimosso = smistatore.completaTask(reparto, parseInt(voce_id), ordine_id ? parseInt(ordine_id) : null);
    res.json({ rimosso });
});

// PUT /api/smistatore/stampante/:reparto — imposta stato stampante (online/offline)
router.put('/stampante/:reparto', async (req, res) => {
    const { stato } = req.body;
    const reparto = req.params.reparto;
    const valore = stato === 'offline' ? 'offline' : 'online';
    smistatore.setStatoStampante(reparto, valore);
    try {
        await db.query('UPDATE stampante SET stato = ? WHERE reparto = ?', [valore, reparto]);
    } catch (err) {
        // Persistenza opzionale: se fallisce, lo stato resta valido in memoria
    }
    res.json({ reparto, stato: valore });
});

// PUT /api/smistatore/fallback/:reparto — imposta reparti alternativi (es. body: { fallback: ["griglia"] })
router.put('/fallback/:reparto', (req, res) => {
    const { fallback } = req.body;
    smistatore.setFallback(req.params.reparto, Array.isArray(fallback) ? fallback : []);
    res.json({ reparto: req.params.reparto, fallback: fallback || [] });
});

module.exports = router;
