const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/menu - tutte le voci visibili (per la cassa)
router.get('/', async (req, res) => {
    try {
        const [voci] = await db.query(
            `SELECT v.*, s.quantita as scorta_quantita, s.soglia_giallo, s.soglia_rosso, s.attiva as scorta_attiva
             FROM voce v
             LEFT JOIN scorta s ON s.voce_id = v.id
             WHERE v.visibile = 1
             ORDER BY v.settore_visualizzazione, v.ordine_schermo, v.nome`
        );
        res.json(voci);
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// GET /api/menu/settori - lista distinta dei settori con conteggio voci
router.get('/settori', async (req, res) => {
    try {
        const [settori] = await db.query(
            `SELECT 
                settore_visualizzazione,
                COUNT(*) as num_pietanze,
                (SELECT colore_tasto FROM voce v2 
                 WHERE v2.settore_visualizzazione = voce.settore_visualizzazione 
                 GROUP BY colore_tasto ORDER BY COUNT(*) DESC LIMIT 1
                ) as colore
             FROM voce
             WHERE settore_visualizzazione IS NOT NULL AND settore_visualizzazione != ''
             GROUP BY settore_visualizzazione
             ORDER BY settore_visualizzazione`
        );
        res.json(settori);
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// GET /api/menu/opzioni - valori distinti per i campi dropdown
router.get('/opzioni', async (req, res) => {
    try {
        const [categorie] = await db.query(
            `SELECT DISTINCT categoria FROM voce WHERE categoria IS NOT NULL AND categoria != '' ORDER BY categoria`
        );
        const [settoriStampa] = await db.query(
            `SELECT DISTINCT settore_stampa FROM voce WHERE settore_stampa IS NOT NULL AND settore_stampa != '' ORDER BY settore_stampa`
        );
        const [settoriVis] = await db.query(
            `SELECT DISTINCT settore_visualizzazione FROM voce WHERE settore_visualizzazione IS NOT NULL AND settore_visualizzazione != '' ORDER BY settore_visualizzazione`
        );
        res.json({
            categorie: categorie.map(r => r.categoria),
            settori_stampa: settoriStampa.map(r => r.settore_stampa),
            settori_visualizzazione: settoriVis.map(r => r.settore_visualizzazione)
        });
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// GET /api/menu/tutte - tutte le voci incluse le nascoste (per admin), con flag aggregata
router.get('/tutte', async (req, res) => {
    try {
        const [voci] = await db.query(
            `SELECT v.*, 
                s.quantita as scorta_quantita, s.soglia_giallo, s.soglia_rosso, s.attiva as scorta_attiva,
                (SELECT COUNT(*) FROM voce_composizione vc WHERE vc.voce_aggregata_id = v.id) as num_componenti
             FROM voce v
             LEFT JOIN scorta s ON s.voce_id = v.id
             ORDER BY v.settore_visualizzazione, v.nome`
        );
        res.json(voci);
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// GET /api/menu/:id/allergeni
router.get('/:id/allergeni', async (req, res) => {
    try {
        const [allergeni] = await db.query(
            `SELECT a.* FROM allergene a
             JOIN voce_allergene va ON va.allergene_id = a.id
             WHERE va.voce_id = ?`,
            [req.params.id]
        );
        res.json(allergeni);
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// GET /api/menu/:id/composizione - componenti di una pietanza aggregata
router.get('/:id/composizione', async (req, res) => {
    try {
        const [componenti] = await db.query(
            `SELECT v.id, v.codice, v.nome, v.prezzo, v.categoria, v.settore_visualizzazione
             FROM voce v
             JOIN voce_composizione vc ON vc.voce_componente_id = v.id
             WHERE vc.voce_aggregata_id = ?
             ORDER BY v.nome`,
            [req.params.id]
        );
        res.json(componenti);
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// Funzione helper per auto-generare il codice
async function generaCodice(categoria) {
    const prefisso = (categoria && categoria.trim().length > 0)
        ? categoria.trim()[0].toUpperCase()
        : 'X';

    const [maxCodice] = await db.query(
        `SELECT codice FROM voce WHERE codice LIKE ? ORDER BY codice DESC LIMIT 1`,
        [`${prefisso}%`]
    );

    let numero = 1;
    if (maxCodice.length > 0) {
        const match = maxCodice[0].codice.match(/\d+$/);
        if (match) numero = parseInt(match[0]) + 1;
    }

    return `${prefisso}${String(numero).padStart(3, '0')}`;
}

// POST /api/menu - aggiunge voce singola (admin) — codice auto-generato
router.post('/', async (req, res) => {
    const { nome, prezzo, categoria, settore_visualizzazione, settore_stampa, colore_tasto, ordine_schermo, asportabile, modalita_stampa } = req.body;

    if (!nome || !nome.trim()) {
        return res.status(400).json({ errore: 'Il nome è obbligatorio' });
    }

    try {
        const codice = await generaCodice(categoria);

        const [risultato] = await db.query(
            `INSERT INTO voce 
             (codice, nome, prezzo, categoria, settore_visualizzazione, settore_stampa, colore_tasto, ordine_schermo, asportabile, modalita_stampa)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [codice, nome.trim(), prezzo || 0, categoria || null, settore_visualizzazione || null, settore_stampa || null, colore_tasto || '#4A90D9', ordine_schermo || 0, asportabile !== false ? 1 : 0, modalita_stampa || 'singola_multipla']
        );
        res.status(201).json({ id: risultato.insertId, codice });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ errore: 'Codice generato già in uso, riprovare' });
        }
        res.status(500).json({ errore: err.message });
    }
});

// POST /api/menu/aggregata - crea pietanza aggregata con componenti
router.post('/aggregata', async (req, res) => {
    const { nome, prezzo, categoria, settore_visualizzazione, settore_stampa, colore_tasto, ordine_schermo, asportabile, modalita_stampa, componenti } = req.body;

    if (!nome || !nome.trim()) {
        return res.status(400).json({ errore: 'Il nome è obbligatorio' });
    }
    if (!componenti || !Array.isArray(componenti) || componenti.length < 2) {
        return res.status(400).json({ errore: 'Selezionare almeno 2 componenti' });
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const codice = await generaCodice(categoria);

        const [risultato] = await conn.query(
            `INSERT INTO voce 
             (codice, nome, prezzo, categoria, settore_visualizzazione, settore_stampa, colore_tasto, ordine_schermo, asportabile, modalita_stampa)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [codice, nome.trim(), prezzo || 0, categoria || null, settore_visualizzazione || null, settore_stampa || null, colore_tasto || '#4A90D9', ordine_schermo || 0, asportabile !== false ? 1 : 0, modalita_stampa || 'singola_multipla']
        );

        const voceId = risultato.insertId;

        // Inserisci associazioni con i componenti
        for (const compId of componenti) {
            await conn.query(
                'INSERT INTO voce_composizione (voce_aggregata_id, voce_componente_id) VALUES (?, ?)',
                [voceId, compId]
            );
        }

        await conn.commit();
        res.status(201).json({ id: voceId, codice });
    } catch (err) {
        await conn.rollback();
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ errore: 'Codice generato già in uso, riprovare' });
        }
        res.status(500).json({ errore: err.message });
    } finally {
        conn.release();
    }
});

// PUT /api/menu/settori/rinomina - rinomina un settore (aggiorna tutte le voci)
router.put('/settori/rinomina', async (req, res) => {
    const { vecchio_nome, nuovo_nome } = req.body;

    if (!vecchio_nome || !nuovo_nome) {
        return res.status(400).json({ errore: 'Specificare vecchio_nome e nuovo_nome' });
    }

    try {
        const [risultato] = await db.query(
            'UPDATE voce SET settore_visualizzazione = ? WHERE settore_visualizzazione = ?',
            [nuovo_nome, vecchio_nome]
        );
        res.json({ messaggio: 'Settore rinominato', voci_aggiornate: risultato.affectedRows });
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// PUT /api/menu/:id - modifica voce (admin)
router.put('/:id', async (req, res) => {
    const campi = req.body;
    const campiConsentiti = ['nome', 'prezzo', 'categoria', 'settore_visualizzazione', 'settore_stampa', 'colore_tasto', 'ordine_schermo', 'visibile', 'asportabile', 'modalita_stampa'];

    const aggiornamenti = Object.keys(campi)
        .filter(k => campiConsentiti.includes(k))
        .map(k => `${k} = ?`);

    if (!aggiornamenti.length) {
        return res.status(400).json({ errore: 'Nessun campo valido da aggiornare' });
    }

    try {
        await db.query(
            `UPDATE voce SET ${aggiornamenti.join(', ')} WHERE id = ?`,
            [...aggiornamenti.map(a => campi[a.split(' ')[0]]), req.params.id]
        );
        res.json({ messaggio: 'Voce aggiornata' });
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// PUT /api/menu/:id/composizione - aggiorna componenti di una pietanza aggregata
router.put('/:id/composizione', async (req, res) => {
    const { componenti } = req.body;
    const voceId = req.params.id;

    if (!componenti || !Array.isArray(componenti) || componenti.length < 2) {
        return res.status(400).json({ errore: 'Selezionare almeno 2 componenti' });
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Elimina associazioni esistenti
        await conn.query('DELETE FROM voce_composizione WHERE voce_aggregata_id = ?', [voceId]);

        // Inserisci nuove associazioni
        for (const compId of componenti) {
            await conn.query(
                'INSERT INTO voce_composizione (voce_aggregata_id, voce_componente_id) VALUES (?, ?)',
                [voceId, compId]
            );
        }

        await conn.commit();
        res.json({ messaggio: 'Composizione aggiornata' });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ errore: err.message });
    } finally {
        conn.release();
    }
});

// DELETE /api/menu/settori/:nome - elimina un settore e tutte le sue voci
router.delete('/settori/:nome', async (req, res) => {
    const nomeSettore = decodeURIComponent(req.params.nome);

    try {
        const [risultato] = await db.query(
            'DELETE FROM voce WHERE settore_visualizzazione = ?',
            [nomeSettore]
        );
        res.json({ messaggio: 'Settore eliminato', voci_eliminate: risultato.affectedRows });
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// DELETE /api/menu/:id - elimina voce (admin)
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM voce WHERE id = ?', [req.params.id]);
        res.json({ messaggio: 'Voce eliminata' });
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

module.exports = router;
