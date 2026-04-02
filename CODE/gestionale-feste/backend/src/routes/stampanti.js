const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/stampanti
router.get('/', async (req, res) => {
    try {
        const [stampanti] = await db.query('SELECT * FROM stampante');
        res.json(stampanti);
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// POST /api/stampanti - aggiunge stampante (admin)
router.post('/', async (req, res) => {
    const { reparto, indirizzo_ip, porta } = req.body;
    try {
        const [r] = await db.query(
            'INSERT INTO stampante (reparto, indirizzo_ip, porta) VALUES (?, ?, ?)',
            [reparto, indirizzo_ip, porta || 9100]
        );
        res.status(201).json({ id: r.insertId });
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// PUT /api/stampanti/:id
router.put('/:id', async (req, res) => {
    const { reparto, indirizzo_ip, porta } = req.body;
    try {
        await db.query(
            'UPDATE stampante SET reparto = ?, indirizzo_ip = ?, porta = ? WHERE id = ?',
            [reparto, indirizzo_ip, porta || 9100, req.params.id]
        );
        res.json({ messaggio: 'Stampante aggiornata' });
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// DELETE /api/stampanti/:id
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM stampante WHERE id = ?', [req.params.id]);
        res.json({ messaggio: 'Stampante rimossa' });
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

module.exports = router;
