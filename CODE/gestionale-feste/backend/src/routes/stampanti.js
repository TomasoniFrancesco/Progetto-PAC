const express = require('express');
const router = express.Router();
const stampanti = require('../repositories/stampante.repo');

// GET /api/stampanti
router.get('/', async (req, res) => {
    try {
        res.json(await stampanti.elenca());
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// POST /api/stampanti - aggiunge stampante (admin)
router.post('/', async (req, res) => {
    try {
        const id = await stampanti.crea(req.body);
        res.status(201).json({ id });
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// PUT /api/stampanti/:id
router.put('/:id', async (req, res) => {
    try {
        await stampanti.aggiorna(req.params.id, req.body);
        res.json({ messaggio: 'Stampante aggiornata' });
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// DELETE /api/stampanti/:id
router.delete('/:id', async (req, res) => {
    try {
        await stampanti.elimina(req.params.id);
        res.json({ messaggio: 'Stampante rimossa' });
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

module.exports = router;
