const express = require('express');
const router = express.Router();
const ordini = require('../repositories/ordine.repo');
const scorte = require('../repositories/scorta.repo');
const stampa = require('../services/stampa');
const predittore = require('../services/predittore');

// GET /api/ordini - lista ordini del giorno con righe e note
router.get('/', async (req, res) => {
    try {
        res.json(await ordini.elencaDelGiorno());
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// GET /api/ordini/:id - dettaglio ordine con righe e note
router.get('/:id', async (req, res) => {
    try {
        const ordine = await ordini.dettaglio(req.params.id);
        if (!ordine) return res.status(404).json({ errore: 'Ordine non trovato' });
        res.json(ordine);
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

    try {
        const id = await ordini.crea(righe);
        res.status(201).json({ id });
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// POST /api/ordini/:id/conferma - conferma ordine, calcola totale, aggiorna scorte
router.post('/:id/conferma', async (req, res) => {
    const { sconto, tipo_sconto, asporto, importo_pagato } = req.body;
    const io = req.app.locals.io;

    try {
        // Fase transazionale: carica righe+note, calcola totale, scala scorte e
        // conferma l'ordine atomicamente. Le validazioni interrompono con 400.
        const dati = await ordini.withTransaction(async (conn) => {
            const righe = await ordini.righePerConferma(req.params.id, conn);
            if (!righe.length) {
                throw new ordini.ErroreDominio('Ordine vuoto', 400);
            }

            const notePerRiga = await ordini.notePerRighe(righe.map(r => r.riga_id), conn);
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

            const importoPagatoNum = parseFloat(importo_pagato);
            if (!Number.isFinite(importoPagatoNum) || importoPagatoNum <= 0) {
                throw new ordini.ErroreDominio('Importo pagato obbligatorio', 400);
            }

            // Aggiorna scorte
            for (const riga of righe) {
                await ordini.scalaScorta(riga.voce_id, riga.quantita, conn);
            }

            // Aggiorna ordine con totale calcolato
            await ordini.aggiornaConferma({
                ordineId: req.params.id, totale, asporto, scontoNum, tipoSconto, importoPagatoNum,
            }, conn);

            return { righe, totale, scontoNum, tipoSconto, importoPagatoNum };
        });

        const { righe, totale, importoPagatoNum } = dati;

        // Smistatore: routing dinamico verso i reparti di stampa
        const { comande, bloccati } = stampa.routeOrder({
            ordine_id: parseInt(req.params.id),
            righe,
            asporto: !!asporto,
        });

        // Emette comande verso i client (dashboard reparto) e le invia in stampa.
        // inviaComanda è fire-and-forget: non blocca la risposta al client.
        for (const comanda of comande) {
            io.emit('comanda_nuova', comanda);
            stampa.inviaComanda(comanda).catch(err =>
                console.error(`Stampa comanda ordine ${comanda.ordine_id}/${comanda.reparto} fallita:`, err.message)
            );
        }
        if (bloccati.length) io.emit('task_bloccati', bloccati);

        const righeCopiaCliente = righe.filter(r => r.copia_scontrino_cliente);
        if (righeCopiaCliente.length) {
            const resto = importoPagatoNum > totale
                ? parseFloat((importoPagatoNum - totale).toFixed(2))
                : null
            const copiaCliente = {
                ordine_id: parseInt(req.params.id),
                asporto: !!asporto,
                totale,
                importo_pagato: importoPagatoNum,
                resto,
                timestamp: Date.now(),
                righe: righeCopiaCliente.map(r => ({
                    nome: r.nome,
                    quantita: r.quantita,
                    prezzo: parseFloat(r.prezzo),
                    note: r.note,
                })),
            }
            stampa.inviaCopiaCliente(copiaCliente).catch(err =>
                console.error(`Stampa copia cliente ordine ${copiaCliente.ordine_id} fallita:`, err.message)
            )
        }

        // Notifica scorte aggiornate via WebSocket
        io.emit('scorte_aggiornate', await scorte.snapshotConStato());

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
        res.status(err.status || 500).json({ errore: err.message });
    }
});

module.exports = router;
