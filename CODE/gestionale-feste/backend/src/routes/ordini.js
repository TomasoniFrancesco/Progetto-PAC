const express = require('express');
const router = express.Router();
const db = require('../db');
const smistatore = require('../services/smistatore');
const dispatcher = require('../services/printer-dispatcher');
const predittore = require('../services/predittore');

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

        // Recupera righe con prezzi, dati di stampa e scorte (necessari allo smistatore)
        const [righe] = await conn.query(
            `SELECT r.id AS riga_id, r.voce_id, r.quantita,
                    v.nome, v.prezzo, v.settore_stampa, v.modalita_stampa, v.tempo_preparazione,
                    s.quantita AS scorta_quantita, s.soglia_giallo, s.soglia_rosso, s.attiva AS scorta_attiva
             FROM ordine_riga r
             JOIN voce v ON r.voce_id = v.id
             LEFT JOIN scorta s ON s.voce_id = v.id
             WHERE r.ordine_id = ?`,
            [req.params.id]
        );

        if (!righe.length) {
            await conn.rollback();
            return res.status(400).json({ errore: 'Ordine vuoto' });
        }

        // Carica le note per riga (servono al routing per la generazione comande)
        const rigaIds = righe.map(r => r.riga_id);
        const [tutteLeNote] = rigaIds.length
            ? await conn.query(
                'SELECT riga_id, numero_porzione, testo, costo_aggiuntivo FROM ordine_riga_nota WHERE riga_id IN (?)',
                [rigaIds]
            )
            : [[]];
        const notePerRiga = new Map();
        for (const n of tutteLeNote) {
            if (!notePerRiga.has(n.riga_id)) notePerRiga.set(n.riga_id, []);
            notePerRiga.get(n.riga_id).push({ numero_porzione: n.numero_porzione, testo: n.testo, costo_aggiuntivo: parseFloat(n.costo_aggiuntivo || 0) });
        }
        for (const r of righe) {
            r.note = notePerRiga.get(r.riga_id) || [];
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

        // Smistatore: routing dinamico verso i reparti di stampa
        const { comande, bloccati } = smistatore.routeOrder({
            ordine_id: parseInt(req.params.id),
            righe,
            asporto: !!asporto,
        });

        // Emette comande verso i client (dashboard reparto) e le invia in stampa.
        // dispatcher.inviaComanda è fire-and-forget: non blocca la risposta al client.
        for (const comanda of comande) {
            io.emit('comanda_nuova', comanda);
            dispatcher.inviaComanda(comanda).catch(err =>
                console.error(`Stampa comanda ordine ${comanda.ordine_id}/${comanda.reparto} fallita:`, err.message)
            );
        }
        if (bloccati.length) io.emit('task_bloccati', bloccati);

        // Notifica scorte aggiornate via WebSocket
        const [scorteAggiornate] = await db.query(
            `SELECT s.*,
                CASE
                    WHEN s.quantita = 0 THEN 'esaurito'
                    WHEN s.quantita <= s.soglia_rosso THEN 'critico'
                    WHEN s.quantita <= s.soglia_giallo THEN 'attenzione'
                    ELSE 'disponibile'
                END AS stato_visivo
             FROM scorta s`
        );
        io.emit('scorte_aggiornate', scorteAggiornate);

        // Predittore Scorte: ri-valuta le voci impattate da questo ordine.
        // Se qualcuna passa a 'urgente' o 'esaurito' emette un alert WebSocket
        // così i client (pagina /predittore, eventualmente cassa) possono reagire.
        const vociImpattate = [...new Set(righe.map(r => r.voce_id))];
        Promise.all(vociImpattate.map(id => predittore.eseguiPredizionePerVoce(id)))
            .then(predizioni => {
                const alert = predizioni.filter(p => p && (p.stato === 'urgente' || p.stato === 'esaurito'));
                if (alert.length > 0) io.emit('predittore_alert', alert);
            })
            .catch(err => console.error('Predittore post-conferma:', err.message));

        res.json({ messaggio: 'Ordine confermato', id: parseInt(req.params.id), totale, comande, bloccati });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ errore: err.message });
    } finally {
        conn.release();
    }
});

module.exports = router;
