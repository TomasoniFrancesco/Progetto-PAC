const express = require('express');
const router = express.Router();
const voci = require('../repositories/voce.repo');

// GET /api/menu - tutte le voci visibili (per la cassa)
router.get('/', async (req, res) => {
    try {
        res.json(await voci.elencaVisibiliPerCassa());
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// GET /api/menu/settori - lista distinta dei settori con conteggio voci
router.get('/settori', async (req, res) => {
    try {
        res.json(await voci.elencaSettori());
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// GET /api/menu/tutti-allergeni - mappa voce_id -> [allergeni] (per precarico frontend)
router.get('/tutti-allergeni', async (req, res) => {
    try {
        res.json(await voci.mappaTuttiAllergeni());
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// GET /api/menu/opzioni - valori distinti per i campi dropdown
router.get('/opzioni', async (req, res) => {
    try {
        res.json(await voci.opzioniDistinte());
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// GET /api/menu/tutte - tutte le voci incluse le nascoste (per admin), con flag aggregata
router.get('/tutte', async (req, res) => {
    try {
        res.json(await voci.elencaTutte());
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// GET /api/menu/:id/allergeni
router.get('/:id/allergeni', async (req, res) => {
    try {
        res.json(await voci.allergeniPerVoce(req.params.id));
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// GET /api/menu/:id/composizione - componenti di una pietanza aggregata
router.get('/:id/composizione', async (req, res) => {
    try {
        res.json(await voci.componentiPerVoce(req.params.id));
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// POST /api/menu - aggiunge voce singola (admin) — codice auto-generato
router.post('/', async (req, res) => {
    if (!req.body.nome?.trim()) {
        return res.status(400).json({ errore: 'Il nome è obbligatorio' });
    }

    try {
        const { id, codice } = await voci.creaVoceSingola(req.body);
        res.status(201).json({ id, codice });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ errore: 'Codice generato già in uso, riprovare' });
        }
        res.status(500).json({ errore: err.message });
    }
});

// POST /api/menu/aggregata - crea pietanza aggregata con componenti
router.post('/aggregata', async (req, res) => {
    const { nome, componenti } = req.body;

    if (!nome?.trim()) {
        return res.status(400).json({ errore: 'Il nome è obbligatorio' });
    }
    if (!componenti || !Array.isArray(componenti) || componenti.length < 2) {
        return res.status(400).json({ errore: 'Selezionare almeno 2 componenti' });
    }

    try {
        const { id, codice } = await voci.creaVoceAggregata(req.body);
        res.status(201).json({ id, codice });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ errore: 'Codice generato già in uso, riprovare' });
        }
        res.status(500).json({ errore: err.message });
    }
});

// PUT /api/menu/settori/rinomina - rinomina un settore (aggiorna tutte le voci)
router.put('/settori/rinomina', async (req, res) => {
    const { vecchio_nome, nuovo_nome } = req.body;

    if (!vecchio_nome || !nuovo_nome) {
        return res.status(400).json({ errore: 'Specificare vecchio_nome e nuovo_nome' });
    }

    try {
        const vociAggiornate = await voci.rinominaSettore(vecchio_nome, nuovo_nome);
        res.json({ messaggio: 'Settore rinominato', voci_aggiornate: vociAggiornate });
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// PUT /api/menu/:id - modifica voce (admin)
router.put('/:id', async (req, res) => {
    try {
        const aggiornata = await voci.aggiornaVoce(req.params.id, req.body);
        if (!aggiornata) {
            return res.status(400).json({ errore: 'Nessun campo valido da aggiornare' });
        }
        res.json({ messaggio: 'Voce aggiornata' });
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// PUT /api/menu/:id/composizione - aggiorna componenti di una pietanza aggregata
router.put('/:id/composizione', async (req, res) => {
    const { componenti } = req.body;

    if (!componenti || !Array.isArray(componenti) || componenti.length < 2) {
        return res.status(400).json({ errore: 'Selezionare almeno 2 componenti' });
    }

    try {
        await voci.aggiornaComposizione(req.params.id, componenti);
        res.json({ messaggio: 'Composizione aggiornata' });
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// DELETE /api/menu/settori/:nome - elimina un settore e tutte le sue voci
router.delete('/settori/:nome', async (req, res) => {
    try {
        const vociEliminate = await voci.eliminaSettore(decodeURIComponent(req.params.nome));
        res.json({ messaggio: 'Settore eliminato', voci_eliminate: vociEliminate });
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// DELETE /api/menu/:id - elimina voce (admin)
router.delete('/:id', async (req, res) => {
    try {
        await voci.eliminaVoce(req.params.id);
        res.json({ messaggio: 'Voce eliminata' });
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

module.exports = router;
