const express = require('express');
const router = express.Router();
const scorte = require('../repositories/scorta.repo');

// GET /api/scorte - tutte le scorte attive con stato visivo calcolato
router.get('/', async (req, res) => {
    try {
        res.json(await scorte.elencaAttiveConVoce());
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// GET /api/scorte/:voce_id - scorta singola di una voce
router.get('/:voce_id', async (req, res) => {
    try {
        res.json(await scorte.trovaPerVoce(req.params.voce_id));
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// GET /api/scorte/:voce_id/storico - storico rifornimenti di una voce
router.get('/:voce_id/storico', async (req, res) => {
    try {
        res.json(await scorte.storicoPerVoce(req.params.voce_id));
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// PUT /api/scorte/:voce_id - imposta scorta (admin)
router.put('/:voce_id', async (req, res) => {
    const { quantita, soglia_giallo, soglia_rosso, attiva } = req.body;
    const io = req.app.locals.io;

    try {
        await scorte.impostaScorta({ voceId: req.params.voce_id, quantita, soglia_giallo, soglia_rosso, attiva });

        // Notifica tutti i client del cambiamento scorte
        io.emit('scorte_aggiornate', await scorte.snapshotAttiveConNome());

        res.json({ messaggio: 'Scorta aggiornata' });
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// POST /api/scorte/:voce_id/rifornimento - registra un rifornimento (aggiunge quantità + storico)
router.post('/:voce_id/rifornimento', async (req, res) => {
    const { quantita, note } = req.body;
    const io = req.app.locals.io;

    if (!quantita || quantita <= 0) {
        return res.status(400).json({ errore: 'Quantità deve essere maggiore di 0' });
    }

    try {
        await scorte.registraRifornimento({ voceId: req.params.voce_id, quantita, note });

        // Notifica i client
        io.emit('scorte_aggiornate', await scorte.snapshotAttiveConNome());

        res.status(201).json({ messaggio: 'Rifornimento registrato' });
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

module.exports = router;
