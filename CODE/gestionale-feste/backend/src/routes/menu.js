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

// GET /api/menu/tutte - tutte le voci incluse le nascoste (per admin)
router.get('/tutte', async (req, res) => {
    try {
        const [voci] = await db.query(
            `SELECT v.*, s.quantita as scorta_quantita, s.soglia_giallo, s.soglia_rosso, s.attiva as scorta_attiva
             FROM voce v
             LEFT JOIN scorta s ON s.voce_id = v.id
             ORDER BY v.settore_visualizzazione, v.ordine_schermo, v.nome`
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

// POST /api/menu - aggiunge voce (admin)
router.post('/', async (req, res) => {
    const { codice, nome, prezzo, categoria, settore_visualizzazione, settore_stampa, colore_tasto, ordine_schermo, asportabile, modalita_stampa } = req.body;

    try {
        const [risultato] = await db.query(
            `INSERT INTO voce 
             (codice, nome, prezzo, categoria, settore_visualizzazione, settore_stampa, colore_tasto, ordine_schermo, asportabile, modalita_stampa)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [codice, nome, prezzo, categoria, settore_visualizzazione, settore_stampa, colore_tasto || '#4A90D9', ordine_schermo || 0, asportabile !== false ? 1 : 0, modalita_stampa || 'singola_multipla']
        );
        res.status(201).json({ id: risultato.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ errore: 'Codice piatto gia esistente' });
        }
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
