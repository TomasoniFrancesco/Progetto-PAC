// Smistatore Intelligente Multi-Reparto
// Routing dinamico delle righe ordine ai reparti di stampa con bilanciamento del carico.
// Stato code mantenuto in memoria: alla conferma ordine si calcola carico, si assegna il
// reparto a carico minore, si batcha per voce, si ranka per priorità P e si emettono comande.

const PESI = { A: 1.0, B: 50.0, C: 10.0, D: 0.01, E: 30.0 }
const ALPHA_STRESS = 1.3
const BETA_OFFLINE = 2.0
const SOGLIA_STRESS_TASK = 5
const FINESTRA_BATCH_MS = 30_000
const TEMPO_PREP_DEFAULT = 60

// reparto -> array di task in coda
const code = new Map()
// reparto -> 'online' | 'offline'
const statoStampanti = new Map()
// reparto -> array di reparti fallback (es. { cucina: ['griglia'] })
const fallbackReparti = new Map()

function getCoda(reparto) {
    if (!code.has(reparto)) code.set(reparto, [])
    return code.get(reparto)
}

function stampanteOnline(reparto) {
    return statoStampanti.get(reparto) !== 'offline'
}

// carico_reparto = n_task * t_prep_residuo * α_stress * β_stampante
function caricoReparto(reparto) {
    const tasks = getCoda(reparto)
    const n = tasks.length
    if (n === 0) return 0
    const tPrep = tasks.reduce((acc, t) => acc + (t.tempo_preparazione_residuo || 0), 0)
    const alpha = n >= SOGLIA_STRESS_TASK ? ALPHA_STRESS : 1.0
    const beta = stampanteOnline(reparto) ? 1.0 : BETA_OFFLINE
    return n * tPrep * alpha * beta
}

// arg min su reparti compatibili; tie-break: timestamp ultimo task più vecchio
function selectMinCarico(repartiCompatibili) {
    let scelto = null, caricoMin = Infinity, lastTsMin = Infinity
    for (const r of repartiCompatibili) {
        const c = caricoReparto(r)
        const coda = getCoda(r)
        const lastTs = coda.length ? coda[coda.length - 1].timestamp : 0
        if (c < caricoMin || (c === caricoMin && lastTs < lastTsMin)) {
            caricoMin = c
            lastTsMin = lastTs
            scelto = r
        }
    }
    return scelto
}

// P = A·t_attesa + B·π_a + C·s − D·carico(r) − E·rischio_scorte
function calcolaRanking(task, reparto, ora = Date.now()) {
    const tAttesa = (ora - task.timestamp) / 1000
    const piAsporto = task.priorita === 'asporto' ? 1.0 : 0.0
    const s = 1.0 / ((task.tempo_preparazione || TEMPO_PREP_DEFAULT) + 1)
    const carico = caricoReparto(reparto)
    const rischio = task.rischio_scorte || 0
    return PESI.A * tAttesa + PESI.B * piAsporto + PESI.C * s - PESI.D * carico - PESI.E * rischio
}

function repartiCompatibili(task) {
    const primario = task.settore_stampa || 'default'
    const fallback = fallbackReparti.get(primario) || []
    const candidati = [primario, ...fallback]
    // Se il primario è offline e ha fallback, escludi primario; altrimenti si forza il routing
    const online = candidati.filter(stampanteOnline)
    if (online.length > 0) return online
    return [primario]
}

function rigaToTasks(riga, ordineId, asporto, ora) {
    const scortaInsufficiente = riga.scorta_attiva && riga.scorta_quantita != null && riga.scorta_quantita < riga.quantita
    if (scortaInsufficiente) {
        return { bloccato: { ordine_id: ordineId, voce_id: riga.voce_id, nome: riga.nome, motivo: 'scorta insufficiente', richiesta: riga.quantita, disponibile: riga.scorta_quantita } }
    }
    const tPrep = riga.tempo_preparazione || TEMPO_PREP_DEFAULT
    // singola_singola → 1 task per porzione, altrimenti 1 task con quantità cumulata
    const esplodi = riga.modalita_stampa === 'singola_singola'
    const nTask = esplodi ? riga.quantita : 1
    const qta = esplodi ? 1 : riga.quantita
    const rischio = riga.scorta_attiva && riga.scorta_quantita != null && riga.scorta_quantita <= (riga.soglia_rosso || 3) ? 1.0 : 0.0
    const tasks = []
    for (let i = 0; i < nTask; i++) {
        tasks.push({
            ordine_id: ordineId,
            voce_id: riga.voce_id,
            nome: riga.nome,
            prezzo: parseFloat(riga.prezzo || 0),
            quantita: qta,
            tempo_preparazione: tPrep,
            tempo_preparazione_residuo: tPrep,
            timestamp: ora,
            settore_stampa: riga.settore_stampa,
            priorita: asporto ? 'asporto' : 'tavolo',
            note: riga.note || [],
            rischio_scorte: rischio,
        })
    }
    return { tasks }
}

function batchPerReparto(taskAssegnati, ora) {
    const perReparto = new Map()
    for (const t of taskAssegnati) {
        if (!perReparto.has(t.reparto_assegnato)) perReparto.set(t.reparto_assegnato, [])
        perReparto.get(t.reparto_assegnato).push(t)
    }
    const risultato = new Map()
    for (const [reparto, lista] of perReparto) {
        const aggregati = new Map()
        for (const t of lista) {
            const chiave = t.voce_id
            const esistente = aggregati.get(chiave)
            if (esistente && (ora - esistente.timestamp) <= FINESTRA_BATCH_MS) {
                esistente.quantita += t.quantita
                esistente.note = [...esistente.note, ...t.note]
                esistente.P = Math.max(esistente.P, t.P)
            } else {
                aggregati.set(chiave, { ...t, note: [...t.note] })
            }
        }
        risultato.set(reparto, [...aggregati.values()].sort((a, b) => b.P - a.P))
    }
    return risultato
}

// Routing principale di un ordine: ritorna { comande, bloccati }
function routeOrder({ ordine_id, righe, asporto = false }) {
    const ora = Date.now()
    const tasks = []
    const bloccati = []

    for (const riga of righe) {
        const { tasks: ts, bloccato } = rigaToTasks(riga, ordine_id, asporto, ora)
        if (bloccato) { bloccati.push(bloccato); continue }
        tasks.push(...ts)
    }

    // Assegnazione greedy: ogni task aggiorna lo stato della coda per i task successivi
    const assegnati = []
    for (const t of tasks) {
        const reparti = repartiCompatibili(t)
        const repartoScelto = selectMinCarico(reparti) || reparti[0]
        getCoda(repartoScelto).push(t)
        const conReparto = { ...t, reparto_assegnato: repartoScelto }
        conReparto.P = calcolaRanking(conReparto, repartoScelto, ora)
        assegnati.push(conReparto)
    }

    const perReparto = batchPerReparto(assegnati, ora)

    const comande = []
    for (const [reparto, righeBatch] of perReparto) {
        comande.push({
            ordine_id,
            reparto,
            asporto,
            timestamp: ora,
            stampante_online: stampanteOnline(reparto),
            righe: righeBatch.map(r => ({
                voce_id: r.voce_id,
                nome: r.nome,
                quantita: r.quantita,
                note: r.note,
                P: parseFloat(r.P.toFixed(3)),
            })),
        })
    }
    // Ordinamento globale per priorità: comanda con riga di P massimo per prima
    comande.sort((a, b) => {
        const pa = a.righe.length ? a.righe[0].P : -Infinity
        const pb = b.righe.length ? b.righe[0].P : -Infinity
        return pb - pa
    })

    return { comande, bloccati }
}

// Libera un task dalla coda (da chiamare quando il reparto lo ha completato)
function completaTask(reparto, voce_id, ordine_id) {
    const coda = getCoda(reparto)
    const idx = coda.findIndex(t => t.voce_id === voce_id && (!ordine_id || t.ordine_id === ordine_id))
    if (idx >= 0) coda.splice(idx, 1)
    return idx >= 0
}

function setStatoStampante(reparto, stato) {
    statoStampanti.set(reparto, stato === 'offline' ? 'offline' : 'online')
}

function setFallback(reparto, repartiAlternativi) {
    fallbackReparti.set(reparto, Array.isArray(repartiAlternativi) ? repartiAlternativi : [])
}

function snapshot() {
    const code_snapshot = {}
    for (const [reparto, tasks] of code) {
        code_snapshot[reparto] = {
            numero_task: tasks.length,
            carico: parseFloat(caricoReparto(reparto).toFixed(2)),
            stampante: stampanteOnline(reparto) ? 'online' : 'offline',
            task: tasks.map(t => ({
                ordine_id: t.ordine_id,
                voce_id: t.voce_id,
                nome: t.nome,
                quantita: t.quantita,
                timestamp: t.timestamp,
            })),
        }
    }
    return code_snapshot
}

function reset() {
    code.clear()
}

module.exports = {
    routeOrder,
    completaTask,
    setStatoStampante,
    setFallback,
    snapshot,
    reset,
    // Esposti per test/debug
    _carichi: { caricoReparto, selectMinCarico, calcolaRanking },
}
