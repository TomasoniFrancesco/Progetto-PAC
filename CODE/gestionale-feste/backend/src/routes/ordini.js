const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/ordini - lista ordini del giorno con righe e note
router.get('/', async (req, res) => {
    try {
        const [ordini] = await db.query(
            `SELECT id, stato, asporto, sconto, tipo_sconto, totale, importo_pagato, timestamp
             FROM ordine
             WHERE DATE(timestamp) = CURDATE()
             ORDER BY timestamp DESC`
        );

        for (const ordine of ordini) {
            const [righe] = await db.query(
                `SELECT r.id, r.voce_id, r.quantita, v.nome, v.prezzo
                 FROM ordine_riga r
                 JOIN voce v ON r.voce_id = v.id
                 WHERE r.ordine_id = ?`,
                [ordine.id]
            );
            for (const riga of righe) {
                const [note] = await db.query(
                    'SELECT numero_porzione, testo, costo_aggiuntivo FROM ordine_riga_nota WHERE riga_id = ? ORDER BY numero_porzione',
                    [riga.id]
                );
                riga.note = note;
                delete riga.id; // id interno, non serve al client
            }
            ordine.righe = righe;
        }

        res.json(ordini);
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// GET /api/ordini/:id - dettaglio ordine con righe e note
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, stato, asporto, sconto, tipo_sconto, totale, importo_pagato, timestamp
             FROM ordine WHERE id = ?`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ errore: 'Ordine non trovato' });

        const [righe] = await db.query(
            `SELECT r.id, r.voce_id, r.quantita, v.nome, v.prezzo, v.settore_stampa
             FROM ordine_riga r
             JOIN voce v ON r.voce_id = v.id
             WHERE r.ordine_id = ?`,
            [req.params.id]
        );

        for (const riga of righe) {
            const [note] = await db.query(
                'SELECT numero_porzione, testo, costo_aggiuntivo FROM ordine_riga_nota WHERE riga_id = ? ORDER BY numero_porzione',
                [riga.id]
            );
            riga.note = note;
            delete riga.id;
        }

        res.json({ ...rows[0], righe });
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// POST /api/ordini - crea nuovo ordine
router.post('/', async (req, res) => {
    const { righe } = req.body;

    if (!righe || !righe.length) {
        return res.status(400).json({ errore: 'Nessuna voce nell ordine' });
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [risultato] = await conn.query(
            'INSERT INTO ordine (stato) VALUES ("in_composizione")'
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

// POST /api/ordini/:id/conferma - conferma ordine, calcola totale, aggiorna scorte
router.post('/:id/conferma', async (req, res) => {
    const { sconto, tipo_sconto, asporto, importo_pagato } = req.body;
    const io = req.app.locals.io;

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Recupera righe con prezzi per calcolare il totale
        const [righe] = await conn.query(
            `SELECT r.voce_id, r.quantita, v.nome, v.prezzo
             FROM ordine_riga r
             JOIN voce v ON r.voce_id = v.id
             WHERE r.ordine_id = ?`,
            [req.params.id]
        );

        if (!righe.length) {
            await conn.rollback();
            return res.status(400).json({ errore: 'Ordine vuoto' });
        }

        // Calcola totale lordo
        const totaleLordo = righe.reduce((acc, r) => acc + (r.quantita * parseFloat(r.prezzo)), 0);

        // Applica sconto
        const scontoNum = parseFloat(sconto) || 0;
        const tipoSconto = tipo_sconto || 'percentuale';
        const scontoImporto = tipoSconto === 'percentuale'
            ? totaleLordo * (scontoNum / 100)
            : Math.min(scontoNum, totaleLordo);
        const totale = parseFloat((totaleLordo - scontoImporto).toFixed(2));

        // Aggiorna scorte
        for (const riga of righe) {
            await conn.query(
                `UPDATE scorta SET quantita = GREATEST(0, quantita - ?) WHERE voce_id = ? AND attiva = 1`,
                [riga.quantita, riga.voce_id]
            );
        }

        // Aggiorna ordine con totale calcolato
        await conn.query(
            `UPDATE ordine SET
                stato = 'confermato',
                totale = ?,
                asporto = ?,
                sconto = ?,
                tipo_sconto = ?,
                importo_pagato = ?
             WHERE id = ?`,
            [totale, asporto ? 1 : 0, scontoNum, tipoSconto, importo_pagato || null, req.params.id]
        );

        await conn.commit();

        // Notifica scorte aggiornate via WebSocket
        const [scorteAggiornate] = await db.query(
            'SELECT s.*, v.nome FROM scorta s JOIN voce v ON s.voce_id = v.id'
        );
        io.emit('scorte_aggiornate', scorteAggiornate);

        res.json({ messaggio: 'Ordine confermato', id: parseInt(req.params.id), totale });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ errore: err.message });
    } finally {
        conn.release();
    }
});

module.exports = router;
