const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/ordini - lista ordini del giorno con righe
router.get('/', async (req, res) => {
    try {
        const [ordini] = await db.query(
            `SELECT id, tavolo, stato, asporto, sconto, tipo_sconto, totale, importo_pagato, timestamp
             FROM ordine
             WHERE DATE(timestamp) = CURDATE()
             ORDER BY timestamp DESC`
        );

        for (const ordine of ordini) {
            const [righe] = await db.query(
                `SELECT r.voce_id, r.quantita, v.nome, v.prezzo
                 FROM ordine_riga r
                 JOIN voce v ON r.voce_id = v.id
                 WHERE r.ordine_id = ?`,
                [ordine.id]
            );
            ordine.righe = righe;
        }

        res.json(ordini);
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// GET /api/ordini/:id - dettaglio ordine con righe
router.get('/:id', async (req, res) => {
    try {
        const [ordine] = await db.query('SELECT * FROM ordine WHERE id = ?', [req.params.id]);
        if (!ordine.length) return res.status(404).json({ errore: 'Ordine non trovato' });

        const [righe] = await db.query(
            `SELECT r.*, v.nome, v.prezzo, v.settore_stampa
             FROM ordine_riga r
             JOIN voce v ON r.voce_id = v.id
             WHERE r.ordine_id = ?`,
            [req.params.id]
        );

        // Per ogni riga prendiamo le note
        for (const riga of righe) {
            const [note] = await db.query(
                'SELECT * FROM ordine_riga_nota WHERE riga_id = ? ORDER BY numero_porzione',
                [riga.id]
            );
            riga.note = note;
        }

        res.json({ ...ordine[0], righe });
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// POST /api/ordini - crea nuovo ordine
router.post('/', async (req, res) => {
    const { tavolo, righe } = req.body;

    if (!righe || !righe.length) {
        return res.status(400).json({ errore: 'Nessuna voce nell ordine' });
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [risultato] = await conn.query(
            'INSERT INTO ordine (tavolo, stato) VALUES (?, "in_composizione")',
            [tavolo || null]
        );
        const ordineId = risultato.insertId;

        for (const riga of righe) {
            const [r] = await conn.query(
                'INSERT INTO ordine_riga (ordine_id, voce_id, quantita) VALUES (?, ?, ?)',
                [ordineId, riga.voce_id, riga.quantita]
            );
            const rigaId = r.insertId;

            if (riga.note && riga.note.length) {
                for (const nota of riga.note) {
                    await conn.query(
                        'INSERT INTO ordine_riga_nota (riga_id, numero_porzione, testo, costo_aggiuntivo) VALUES (?, ?, ?, ?)',
                        [rigaId, nota.numero_porzione, nota.testo, nota.costo_aggiuntivo || 0]
                    );
                }
            }
        }

        await conn.commit();
        res.status(201).json({ id: ordineId });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ errore: err.message });
    } finally {
        conn.release();
    }
});

// POST /api/ordini/:id/conferma - conferma ordine, aggiorna scorte, avvia stampa
router.post('/:id/conferma', async (req, res) => {
    const { sconto, tipo_sconto, asporto, importo_pagato } = req.body;
    const io = req.app.locals.io;

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Recupera le righe dell'ordine
        const [righe] = await conn.query(
            `SELECT r.voce_id, r.quantita, v.nome
             FROM ordine_riga r
             JOIN voce v ON r.voce_id = v.id
             WHERE r.ordine_id = ?`,
            [req.params.id]
        );

        if (!righe.length) {
            await conn.rollback();
            return res.status(400).json({ errore: 'Ordine vuoto' });
        }

        // Aggiorna le scorte per ogni voce
        for (const riga of righe) {
            await conn.query(
                `UPDATE scorta SET quantita = GREATEST(0, quantita - ?) 
                 WHERE voce_id = ? AND attiva = 1`,
                [riga.quantita, riga.voce_id]
            );
        }

        // Aggiorna lo stato dell'ordine
        await conn.query(
            `UPDATE ordine SET 
                stato = 'confermato',
                asporto = ?,
                sconto = ?,
                tipo_sconto = ?,
                importo_pagato = ?
             WHERE id = ?`,
            [asporto ? 1 : 0, sconto || 0, tipo_sconto || 'percentuale', importo_pagato || null, req.params.id]
        );

        await conn.commit();

        // Notifica tutti i client connessi che le scorte sono cambiate
        const [scorteAggiornate] = await db.query(
            'SELECT s.*, v.nome FROM scorta s JOIN voce v ON s.voce_id = v.id'
        );
        io.emit('scorte_aggiornate', scorteAggiornate);

        // TODO: integrare qui la chiamata al modulo di stampa ESC/POS

        res.json({ messaggio: 'Ordine confermato', id: req.params.id });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ errore: err.message });
    } finally {
        conn.release();
    }
});

module.exports = router;
