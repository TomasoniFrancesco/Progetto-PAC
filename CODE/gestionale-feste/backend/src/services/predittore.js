// Predittore Dinamico di Riordino Scorte (UC5b)
//
// Per ogni voce attiva del menu calcola:
//  - consumo atteso (media pesata multi-finestra)
//  - tempo stimato di esaurimento
//  - indice di urgenza U
//  - classificazione: stabile | attenzione | urgente | esaurito
//
// Formule (vedi PIANO_PREDITTORE.md):
//   consumo_atteso = α·c_15min + β·c_1h + γ·media_storica
//   tempo_esaur    = quantita / consumo_atteso
//   U              = max(0, t_riapp - t_esaur) · priorita_voce
//                    × moltiplicatore_contesto se t_esaur < t_residuo_evento
//
// Unità interne: tassi in unità/minuto, tempi in secondi.

const db = require('../db')

// ───── Costanti dell'algoritmo ─────────────────────────────────────────────
const PESI_NORMALE = { alpha: 0.5, beta: 0.3, gamma: 0.2 }
const PESI_PICCO = { alpha: 0.8, beta: 0.15, gamma: 0.05 }
const SOGLIA_PICCO_MULT = 2.0           // c_15min > 2 × media_storica → picco
const MIN_OCCORRENZE_STORICHE = 3       // sotto questo → modalità prudente
const MOLTIPLICATORE_CONTESTO = 1.2     // se esaur < residuo evento
const MOLTIPLICATORE_SUGGERIMENTO = 1.3 // ceil(consumo · t_riapp · 1.3)
const PRIORITA_VALORE = { bassa: 0.5, media: 1.0, alta: 1.5 }

// ───── Lettura configurazione runtime dal DB ───────────────────────────────
async function leggiConfigurazione() {
    const [righe] = await db.query('SELECT chiave, valore FROM configurazione')
    const mappa = {}
    for (const r of righe) mappa[r.chiave] = r.valore
    return {
        evento_fine_oggi: mappa.evento_fine_oggi || '23:30',
        soglia_warn_urgenza: parseFloat(mappa.soglia_warn_urgenza || '300'),
        giorni_storico: parseInt(mappa.giorni_storico || '30'),
    }
}

// Calcola secondi residui all'evento (config "HH:MM" oggi).
// Se siamo già oltre l'orario, ritorna 0.
function tempoResiduoEventoSec(orarioHHMM, adesso = new Date()) {
    const [hh, mm] = String(orarioHHMM).split(':').map(s => parseInt(s, 10))
    if (isNaN(hh) || isNaN(mm)) return 0
    const fine = new Date(adesso)
    fine.setHours(hh, mm, 0, 0)
    const diffMs = fine.getTime() - adesso.getTime()
    return Math.max(0, Math.floor(diffMs / 1000))
}

// ───── Aggregazione consumi: SOMMA quantità vendute in una finestra ───────
// Ritorna: Map<voce_id, somma>
async function aggregaConsumiFinestra(minutiIndietro) {
    const [righe] = await db.query(
        `SELECT r.voce_id, COALESCE(SUM(r.quantita), 0) AS totale
         FROM ordine_riga r
         JOIN ordine o ON o.id = r.ordine_id
         WHERE o.stato = 'confermato'
           AND o.timestamp >= (NOW() - INTERVAL ? MINUTE)
         GROUP BY r.voce_id`,
        [minutiIndietro]
    )
    const mappa = new Map()
    for (const r of righe) mappa.set(r.voce_id, Number(r.totale))
    return mappa
}

// Media storica per la fascia oraria CORRENTE (HOUR(NOW())):
// per ogni voce, media delle SOMME quantità raggruppate per data, considerando
// solo gli ordini confermati nei `giorniLookback` giorni passati nella stessa
// ora del giorno.
// Ritorna: Map<voce_id, { media_unita_ora, occorrenze }>
async function mediaStoricaFascia(giorniLookback, adesso = new Date()) {
    const oraCorrente = adesso.getHours()
    const [righe] = await db.query(
        `SELECT voce_id, AVG(somma_giornaliera) AS media_unita_ora, COUNT(*) AS occorrenze
         FROM (
             SELECT r.voce_id, DATE(o.timestamp) AS giorno,
                    SUM(r.quantita) AS somma_giornaliera
             FROM ordine_riga r
             JOIN ordine o ON o.id = r.ordine_id
             WHERE o.stato = 'confermato'
               AND HOUR(o.timestamp) = ?
               AND o.timestamp >= (NOW() - INTERVAL ? DAY)
               AND o.timestamp <  (NOW() - INTERVAL 1 HOUR)
             GROUP BY r.voce_id, DATE(o.timestamp)
         ) AS t
         GROUP BY voce_id`,
        [oraCorrente, giorniLookback]
    )
    const mappa = new Map()
    for (const r of righe) {
        mappa.set(r.voce_id, {
            media_unita_ora: Number(r.media_unita_ora) || 0,
            occorrenze: Number(r.occorrenze) || 0,
        })
    }
    return mappa
}

// ───── Calcolo pesi (modalità) ─────────────────────────────────────────────
function calcolaPesi({ consumo15Min, mediaStoricaUnitaOra, occorrenzeStoriche }) {
    // Modalità prudente: pochi dati storici → ignoriamo γ e ridistribuiamo
    if (occorrenzeStoriche < MIN_OCCORRENZE_STORICHE) {
        return { alpha: PESI_NORMALE.alpha + PESI_NORMALE.gamma * (5 / 7),
                 beta:  PESI_NORMALE.beta  + PESI_NORMALE.gamma * (2 / 7),
                 gamma: 0,
                 modalita: 'prudente' }
    }
    // Modalità picco: c_15min > 2 × media_storica (su scala unità/min comparabile)
    // c_15min è già unità in 15min → tasso = c_15min / 15
    // media_storica_unita_ora → tasso = media / 60
    const tasso15 = consumo15Min / 15
    const tassoStorico = mediaStoricaUnitaOra / 60
    if (tassoStorico > 0 && tasso15 > SOGLIA_PICCO_MULT * tassoStorico) {
        return { ...PESI_PICCO, modalita: 'picco' }
    }
    return { ...PESI_NORMALE, modalita: 'normale' }
}

// ───── Consumo atteso (tasso unità/minuto) ─────────────────────────────────
function consumoAtteso(pesi, consumo15Min, consumo1h, mediaStoricaUnitaOra) {
    // Tutti i contributi normalizzati a unità/minuto per omogeneità
    const tasso15 = consumo15Min / 15
    const tasso1h = consumo1h / 60
    const tassoStorico = mediaStoricaUnitaOra / 60
    return pesi.alpha * tasso15 + pesi.beta * tasso1h + pesi.gamma * tassoStorico
}

// ───── Tempo di esaurimento (in secondi) ───────────────────────────────────
function tempoEsaurimentoSec(quantita, consumoAttesoUnitaMin) {
    if (!consumoAttesoUnitaMin || consumoAttesoUnitaMin <= 0) return Infinity
    const minuti = quantita / consumoAttesoUnitaMin
    return minuti * 60
}

// ───── Indice di urgenza U ─────────────────────────────────────────────────
function calcolaU({ tempoRiappSec, tempoEsaurSec, priorita, tempoResiduoEventoSec: tRes }) {
    const moltPriorita = PRIORITA_VALORE[priorita] || 1.0
    const tEsaur = tempoEsaurSec === Infinity ? Number.MAX_SAFE_INTEGER : tempoEsaurSec
    let U = Math.max(0, tempoRiappSec - tEsaur) * moltPriorita
    // Moltiplicatore di contesto: l'esaurimento avverrà prima della fine evento?
    if (tEsaur < tRes && tEsaur < Number.MAX_SAFE_INTEGER) {
        U *= MOLTIPLICATORE_CONTESTO
    }
    return U
}

// ───── Classificazione ─────────────────────────────────────────────────────
function classifica({ quantita, U, statoScorta, sogliaWarn }) {
    if (quantita <= 0) return 'esaurito'
    if (U === 0 && (statoScorta === 'disponibile' || statoScorta === 'sconosciuto')) return 'stabile'
    if (U > 0 && U <= sogliaWarn) return 'attenzione'
    if (U > sogliaWarn) return 'urgente'
    return 'stabile'
}

function quantitaSuggerita(consumoAttesoUnitaMin, tempoRiappSec) {
    const tempoRiappMin = tempoRiappSec / 60
    return Math.ceil(consumoAttesoUnitaMin * tempoRiappMin * MOLTIPLICATORE_SUGGERIMENTO)
}

// ───── Aggregazione ingredienti condivisi ─────────────────────────────────
// Se più voci condividono un contatore aggregato (tabella voce_contatore),
// il consumo "effettivo" che impatta la scorta condivisa è la somma di tutte
// le voci collegate. Aggiorniamo i consumi delle voci coinvolte per riflettere
// questo, in modo che il loro indice U sia calcolato sul consumo aggregato.
async function indiciCondivisione() {
    try {
        const [righe] = await db.query(
            `SELECT contatore_id, GROUP_CONCAT(voce_id) AS voci
             FROM voce_contatore
             GROUP BY contatore_id`
        )
        const gruppi = []
        for (const r of righe) {
            const voci = String(r.voci).split(',').map(Number).filter(Boolean)
            if (voci.length > 1) gruppi.push(voci)
        }
        return gruppi
    } catch {
        return []
    }
}

function aggregaConsumiCondivisi(consumiMap, gruppiCondivisi) {
    // Per ogni gruppo, somma i consumi e riassegna ad ogni voce del gruppo
    // il totale aggregato (così l'urgenza riflette la pressione condivisa)
    const aggregato = new Map()
    for (const [voce_id, valore] of consumiMap) aggregato.set(voce_id, valore)
    for (const gruppo of gruppiCondivisi) {
        let somma = 0
        for (const v of gruppo) somma += consumiMap.get(v) || 0
        for (const v of gruppo) aggregato.set(v, somma)
    }
    return aggregato
}

// ───── Main: eseguiPredizione() ───────────────────────────────────────────
async function eseguiPredizione({ filtroVociIds = null } = {}) {
    const config = await leggiConfigurazione()
    const tRes = tempoResiduoEventoSec(config.evento_fine_oggi)

    // Carica voci attive (visibili + scorta attiva) — escludi non vendibili
    let queryVoci = `
        SELECT v.id, v.codice, v.nome, v.settore_stampa, v.tempo_riapprovvigionamento,
               v.priorita_voce, s.quantita, s.soglia_giallo, s.soglia_rosso, s.attiva
        FROM voce v
        LEFT JOIN scorta s ON s.voce_id = v.id
        WHERE v.visibile = 1`
    const params = []
    if (filtroVociIds && filtroVociIds.length) {
        queryVoci += ' AND v.id IN (?)'
        params.push(filtroVociIds)
    }
    const [voci] = await db.query(queryVoci, params)

    // Consumi finestre temporali e storico
    const [c15, c1h, storico, gruppiCondivisi] = await Promise.all([
        aggregaConsumiFinestra(15),
        aggregaConsumiFinestra(60),
        mediaStoricaFascia(config.giorni_storico),
        indiciCondivisione(),
    ])

    // Aggregazione ingredienti condivisi: applico ai consumi 15min e 1h
    const c15Agg = aggregaConsumiCondivisi(c15, gruppiCondivisi)
    const c1hAgg = aggregaConsumiCondivisi(c1h, gruppiCondivisi)

    const risultati = []
    for (const v of voci) {
        const consumo15 = c15Agg.get(v.id) || 0
        const consumo1h = c1hAgg.get(v.id) || 0
        const storicoVoce = storico.get(v.id) || { media_unita_ora: 0, occorrenze: 0 }

        const pesi = calcolaPesi({
            consumo15Min: consumo15,
            mediaStoricaUnitaOra: storicoVoce.media_unita_ora,
            occorrenzeStoriche: storicoVoce.occorrenze,
        })

        const consumoAttUnitaMin = consumoAtteso(pesi, consumo15, consumo1h, storicoVoce.media_unita_ora)
        const tempoEsaurSec = tempoEsaurimentoSec(v.quantita || 0, consumoAttUnitaMin)

        const U = calcolaU({
            tempoRiappSec: v.tempo_riapprovvigionamento,
            tempoEsaurSec,
            priorita: v.priorita_voce,
            tempoResiduoEventoSec: tRes,
        })

        // Stato visivo derivato per la classificazione
        let statoVisivo = 'sconosciuto'
        if (!v.attiva) statoVisivo = 'sconosciuto'
        else if ((v.quantita || 0) === 0) statoVisivo = 'esaurito'
        else if ((v.quantita || 0) <= (v.soglia_rosso || 0)) statoVisivo = 'critico'
        else if ((v.quantita || 0) <= (v.soglia_giallo || 0)) statoVisivo = 'attenzione'
        else statoVisivo = 'disponibile'

        const stato = classifica({
            quantita: v.quantita || 0,
            U,
            statoScorta: statoVisivo,
            sogliaWarn: config.soglia_warn_urgenza,
        })

        risultati.push({
            voce_id: v.id,
            codice: v.codice,
            nome: v.nome,
            reparto: v.settore_stampa,
            priorita: v.priorita_voce,
            quantita_attuale: v.quantita || 0,
            scorta_attiva: !!v.attiva,
            stato_scorta_corrente: statoVisivo,
            consumo_15min: consumo15,
            consumo_1h: consumo1h,
            media_storica_unita_ora: parseFloat(storicoVoce.media_unita_ora.toFixed(2)),
            occorrenze_storiche: storicoVoce.occorrenze,
            modalita: pesi.modalita,
            pesi: { alpha: pesi.alpha, beta: pesi.beta, gamma: pesi.gamma },
            consumo_atteso_unita_min: parseFloat(consumoAttUnitaMin.toFixed(4)),
            tempo_esaurimento_sec: tempoEsaurSec === Infinity ? null : Math.round(tempoEsaurSec),
            tempo_residuo_evento_sec: tRes,
            tempo_riapprovvigionamento_sec: v.tempo_riapprovvigionamento,
            U: parseFloat(U.toFixed(2)),
            stato,
            suggerimento: stato === 'urgente'
                ? { quantita: quantitaSuggerita(consumoAttUnitaMin, v.tempo_riapprovvigionamento) }
                : null,
        })
    }

    return { configurazione: config, generato_a: new Date().toISOString(), predizioni: risultati }
}

async function eseguiPredizionePerVoce(voce_id) {
    const res = await eseguiPredizione({ filtroVociIds: [voce_id] })
    return res.predizioni[0] || null
}

module.exports = {
    eseguiPredizione,
    eseguiPredizionePerVoce,
    // Esposti per i test unitari
    _interno: {
        calcolaPesi,
        consumoAtteso,
        tempoEsaurimentoSec,
        calcolaU,
        classifica,
        quantitaSuggerita,
        tempoResiduoEventoSec,
        aggregaConsumiCondivisi,
        PESI_NORMALE,
        PESI_PICCO,
        PRIORITA_VALORE,
        SOGLIA_PICCO_MULT,
        MIN_OCCORRENZE_STORICHE,
        MOLTIPLICATORE_CONTESTO,
        MOLTIPLICATORE_SUGGERIMENTO,
    },
}
