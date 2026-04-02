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

module.exports = router;
