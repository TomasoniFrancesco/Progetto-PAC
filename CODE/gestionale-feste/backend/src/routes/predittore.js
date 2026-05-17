const express = require('express')
const router = express.Router()
const db = require('../db')
const predittore = require('../services/predittore')

// GET /api/predittore/scorte
//  Query opzionali:
//   ?stato=urgente,esaurito  (filtra per stato — csv)
//   ?reparto=cucina          (filtra per reparto)
router.get('/scorte', async (req, res) => {
    try {
        const risposta = await predittore.eseguiPredizione()

        let predizioni = risposta.predizioni
        if (req.query.stato) {
            const stati = String(req.query.stato).split(',').map(s => s.trim())
            predizioni = predizioni.filter(p => stati.includes(p.stato))
        }
        if (req.query.reparto) {
            predizioni = predizioni.filter(p => p.reparto === req.query.reparto)
        }

        // Ordina per U decrescente (le più urgenti in cima)
        predizioni.sort((a, b) => b.U - a.U)

        res.json({
            generato_a: risposta.generato_a,
            configurazione: risposta.configurazione,
            conteggi: {
                totale: predizioni.length,
                stabile: predizioni.filter(p => p.stato === 'stabile').length,
                attenzione: predizioni.filter(p => p.stato === 'attenzione').length,
                urgente: predizioni.filter(p => p.stato === 'urgente').length,
                esaurito: predizioni.filter(p => p.stato === 'esaurito').length,
            },
            predizioni,
        })
    } catch (err) {
        res.status(500).json({ errore: err.message })
    }
})

// GET /api/predittore/scorte/:voce_id  — dettaglio singola voce
router.get('/scorte/:voce_id', async (req, res) => {
    try {
        const id = parseInt(req.params.voce_id)
        const p = await predittore.eseguiPredizionePerVoce(id)
        if (!p) return res.status(404).json({ errore: 'Voce non trovata o non attiva' })
        res.json(p)
    } catch (err) {
        res.status(500).json({ errore: err.message })
    }
})

// GET /api/predittore/configurazione
router.get('/configurazione', async (req, res) => {
    try {
        const [righe] = await db.query('SELECT chiave, valore FROM configurazione')
        const mappa = {}
        for (const r of righe) mappa[r.chiave] = r.valore
        res.json(mappa)
    } catch (err) {
        res.status(500).json({ errore: err.message })
    }
})

// PUT /api/predittore/configurazione/:chiave  body: { valore }
router.put('/configurazione/:chiave', async (req, res) => {
    try {
        const { chiave } = req.params
        const { valore } = req.body
        if (valore == null) return res.status(400).json({ errore: 'valore obbligatorio' })
        await db.query(
            `INSERT INTO configurazione (chiave, valore) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE valore = VALUES(valore)`,
            [chiave, String(valore)]
        )
        res.json({ chiave, valore })
    } catch (err) {
        res.status(500).json({ errore: err.message })
    }
})

// PUT /api/predittore/voce/:id  body: { tempo_riapprovvigionamento?, priorita_voce? }
router.put('/voce/:id', async (req, res) => {
    try {
        const { tempo_riapprovvigionamento, priorita_voce } = req.body
        const updates = []
        const params = []
        if (typeof tempo_riapprovvigionamento === 'number') {
            updates.push('tempo_riapprovvigionamento = ?')
            params.push(tempo_riapprovvigionamento)
        }
        if (priorita_voce && ['bassa', 'media', 'alta'].includes(priorita_voce)) {
            updates.push('priorita_voce = ?')
            params.push(priorita_voce)
        }
        if (!updates.length) return res.status(400).json({ errore: 'nessun campo valido' })
        params.push(parseInt(req.params.id))
        await db.query(`UPDATE voce SET ${updates.join(', ')} WHERE id = ?`, params)
        res.json({ ok: true })
    } catch (err) {
        res.status(500).json({ errore: err.message })
    }
})

module.exports = router
