const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/scorte - tutte le scorte attive con stato visivo calcolato
router.get('/', async (req, res) => {
    try {
        const [scorte] = await db.query(
            `SELECT s.*, v.nome, v.codice,
                CASE
                    WHEN s.quantita = 0 THEN 'esaurito'
                    WHEN s.quantita <= s.soglia_rosso THEN 'critico'
                    WHEN s.quantita <= s.soglia_giallo THEN 'attenzione'
                    ELSE 'disponibile'
                END AS stato_visivo
             FROM scorta s
             JOIN voce v ON s.voce_id = v.id
             WHERE s.attiva = 1`
        );
        res.json(scorte);
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// GET /api/scorte/:voce_id - scorta singola di una voce
router.get('/:voce_id', async (req, res) => {
    try {
        const [righe] = await db.query(
            `SELECT s.*,
                CASE
                    WHEN s.quantita = 0 THEN 'esaurito'
                    WHEN s.quantita <= s.soglia_rosso THEN 'critico'
                    WHEN s.quantita <= s.soglia_giallo THEN 'attenzione'
                    ELSE 'disponibile'
                END AS stato_visivo
             FROM scorta s WHERE s.voce_id = ?`,
            [req.params.voce_id]
        );
        res.json(righe.length > 0 ? righe[0] : null);
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// GET /api/scorte/:voce_id/storico - storico rifornimenti di una voce
router.get('/:voce_id/storico', async (req, res) => {
    try {
        const [storico] = await db.query(
            `SELECT * FROM scorta_storico WHERE voce_id = ? ORDER BY data_rifornimento DESC LIMIT 50`,
            [req.params.voce_id]
        );
        res.json(storico);
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// PUT /api/scorte/:voce_id - imposta scorta (admin)
router.put('/:voce_id', async (req, res) => {
    const { quantita, soglia_giallo, soglia_rosso, attiva } = req.body;
    const io = req.app.locals.io;

    try {
        await db.query(
            `INSERT INTO scorta (voce_id, quantita, soglia_giallo, soglia_rosso, attiva)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
             quantita = VALUES(quantita),
             soglia_giallo = VALUES(soglia_giallo),
             soglia_rosso = VALUES(soglia_rosso),
             attiva = VALUES(attiva)`,
            [req.params.voce_id, quantita, soglia_giallo || 10, soglia_rosso || 3, attiva !== false ? 1 : 0]
        );

        // Notifica tutti i client del cambiamento scorte
        const [scorteAggiornate] = await db.query(
            `SELECT s.*, v.nome,
                CASE
                    WHEN s.quantita = 0 THEN 'esaurito'
                    WHEN s.quantita <= s.soglia_rosso THEN 'critico'
                    WHEN s.quantita <= s.soglia_giallo THEN 'attenzione'
                    ELSE 'disponibile'
                END AS stato_visivo
             FROM scorta s JOIN voce v ON s.voce_id = v.id WHERE s.attiva = 1`
        );
        io.emit('scorte_aggiornate', scorteAggiornate);

        res.json({ messaggio: 'Scorta aggiornata' });
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// POST /api/scorte/:voce_id/rifornimento - registra un rifornimento (aggiunge quantità + storico)
router.post('/:voce_id/rifornimento', async (req, res) => {
    const { quantita, note } = req.body;
    const voceId = req.params.voce_id;
    const io = req.app.locals.io;

    if (!quantita || quantita <= 0) {
        return res.status(400).json({ errore: 'Quantità deve essere maggiore di 0' });
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Assicura che la riga scorta esista
        await conn.query(
            `INSERT INTO scorta (voce_id, quantita, attiva) VALUES (?, 0, 1)
             ON DUPLICATE KEY UPDATE voce_id = voce_id`,
            [voceId]
        );

        // Incrementa la quantità corrente
        await conn.query(
            'UPDATE scorta SET quantita = quantita + ?, attiva = 1 WHERE voce_id = ?',
            [quantita, voceId]
        );

        // Registra nello storico
        await conn.query(
            'INSERT INTO scorta_storico (voce_id, quantita, note) VALUES (?, ?, ?)',
            [voceId, quantita, note || null]
        );

        await conn.commit();

        // Notifica i client
        const [scorteAggiornate] = await db.query(
            `SELECT s.*, v.nome,
                CASE
                    WHEN s.quantita = 0 THEN 'esaurito'
                    WHEN s.quantita <= s.soglia_rosso THEN 'critico'
                    WHEN s.quantita <= s.soglia_giallo THEN 'attenzione'
                    ELSE 'disponibile'
                END AS stato_visivo
             FROM scorta s JOIN voce v ON s.voce_id = v.id WHERE s.attiva = 1`
        );
        io.emit('scorte_aggiornate', scorteAggiornate);

        res.status(201).json({ messaggio: 'Rifornimento registrato' });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ errore: err.message });
    } finally {
        conn.release();
    }
});

module.exports = router;
