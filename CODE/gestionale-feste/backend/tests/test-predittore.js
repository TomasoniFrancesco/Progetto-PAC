// Suite di test per il Predittore Dinamico di Riordino Scorte (UC5b).
//
// Esegui con:
//   docker exec gestionale_backend node tests/test-predittore.js

const assert = require('assert')
const http = require('http')
const predittore = require('../src/services/predittore')
const { _interno } = predittore

// ───── Mini test runner (stesso schema di test-smistatore.js) ──────────────
const stato = { sezione: '', superati: 0, falliti: 0, errori: [] }
const C = { reset: '\x1b[0m', verde: '\x1b[32m', rosso: '\x1b[31m', giallo: '\x1b[33m', blu: '\x1b[36m', grigio: '\x1b[90m' }

function sezione(nome) { stato.sezione = nome; console.log(`\n${C.blu}━━━ ${nome} ━━━${C.reset}`) }
async function test(descrizione, fn) {
    try {
        await fn()
        stato.superati++
        console.log(`  ${C.verde}✓${C.reset} ${descrizione}`)
    } catch (e) {
        stato.falliti++
        stato.errori.push({ sezione: stato.sezione, descrizione, errore: e.message })
        console.log(`  ${C.rosso}✗${C.reset} ${descrizione}`)
        console.log(`    ${C.grigio}${e.message}${C.reset}`)
    }
}
function reportFinale() {
    const totale = stato.superati + stato.falliti
    const colore = stato.falliti === 0 ? C.verde : C.rosso
    console.log(`\n${colore}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`)
    console.log(`${colore}Risultato: ${stato.superati}/${totale} test superati${C.reset}`)
    if (stato.falliti > 0) {
        console.log(`\n${C.rosso}Fallimenti:${C.reset}`)
        for (const e of stato.errori) console.log(`  ${e.sezione} → ${e.descrizione}\n    ${e.errore}`)
        process.exit(1)
    }
    process.exit(0)
}

function http_(method, path, body) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null
        const req = http.request({
            host: '127.0.0.1', port: 3001, path, method,
            headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
        }, res => {
            let raw = ''; res.on('data', c => raw += c)
            res.on('end', () => { try { resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null }) } catch { resolve({ status: res.statusCode, body: raw }) } })
        })
        req.on('error', reject)
        if (data) req.write(data)
        req.end()
    })
}

// ──────────────────────────────────────────────────────────────────────────
async function main() {
    // ═════ FASE 1: UNIT TEST ═════════════════════════════════════════════════
    sezione('calcolaPesi: selezione modalità')

    await test('storico sufficiente + consumo normale → modalità "normale" (α=0.5)', () => {
        const p = _interno.calcolaPesi({ consumo15Min: 5, mediaStoricaUnitaOra: 30, occorrenzeStoriche: 10 })
        // tasso15 = 5/15 = 0.33, tassoStorico = 30/60 = 0.5
        // 0.33 < 2*0.5 = 1.0 → NORMALE
        assert.strictEqual(p.modalita, 'normale')
        assert.strictEqual(p.alpha, 0.5)
        assert.strictEqual(p.beta, 0.3)
        assert.strictEqual(p.gamma, 0.2)
    })

    await test('storico sufficiente + consumo a picco (>2× storico) → modalità "picco" (α=0.8)', () => {
        // tasso15 = 30/15 = 2.0, tassoStorico = 30/60 = 0.5
        // 2.0 > 2*0.5 = 1.0 → PICCO
        const p = _interno.calcolaPesi({ consumo15Min: 30, mediaStoricaUnitaOra: 30, occorrenzeStoriche: 10 })
        assert.strictEqual(p.modalita, 'picco')
        assert.strictEqual(p.alpha, 0.8)
        assert.strictEqual(p.beta, 0.15)
        assert.strictEqual(p.gamma, 0.05)
    })

    await test('occorrenze storiche < 3 → modalità "prudente" (γ=0)', () => {
        const p = _interno.calcolaPesi({ consumo15Min: 10, mediaStoricaUnitaOra: 20, occorrenzeStoriche: 2 })
        assert.strictEqual(p.modalita, 'prudente')
        assert.strictEqual(p.gamma, 0)
        // I pesi devono comunque sommare ≈ 1
        const somma = p.alpha + p.beta + p.gamma
        assert.ok(Math.abs(somma - 1.0) < 0.01, `pesi sommano ${somma}, atteso ≈ 1.0`)
    })

    await test('storico = 0 → niente picco anche con consumo alto (no divisione su 0)', () => {
        const p = _interno.calcolaPesi({ consumo15Min: 100, mediaStoricaUnitaOra: 0, occorrenzeStoriche: 5 })
        assert.strictEqual(p.modalita, 'normale')
    })

    // ────────────────────────────────────────────────────────────────────────
    sezione('consumoAtteso: applica formula')

    await test('α·c15/15 + β·c1h/60 + γ·storico/60', () => {
        const pesi = { alpha: 0.5, beta: 0.3, gamma: 0.2 }
        // c15=15 → tasso=1.0; c1h=60 → tasso=1.0; storico=60 → tasso=1.0
        // atteso = 0.5*1 + 0.3*1 + 0.2*1 = 1.0
        const c = _interno.consumoAtteso(pesi, 15, 60, 60)
        assert.ok(Math.abs(c - 1.0) < 0.001, `atteso 1.0, ottenuto ${c}`)
    })

    await test('zero consumo ovunque → 0', () => {
        const c = _interno.consumoAtteso({ alpha: 0.5, beta: 0.3, gamma: 0.2 }, 0, 0, 0)
        assert.strictEqual(c, 0)
    })

    // ────────────────────────────────────────────────────────────────────────
    sezione('tempoEsaurimentoSec')

    await test('quantita=10 + consumo=1 unità/min → 600 secondi', () => {
        const t = _interno.tempoEsaurimentoSec(10, 1)
        assert.strictEqual(t, 600)
    })

    await test('consumo ≤ 0 → Infinity', () => {
        assert.strictEqual(_interno.tempoEsaurimentoSec(10, 0), Infinity)
        assert.strictEqual(_interno.tempoEsaurimentoSec(10, -1), Infinity)
    })

    await test('quantita=0 → 0 secondi', () => {
        assert.strictEqual(_interno.tempoEsaurimentoSec(0, 1), 0)
    })

    // ────────────────────────────────────────────────────────────────────────
    sezione('calcolaU: indice di urgenza')

    await test('tempo_esaur > tempo_riapp → U = 0 (nessuna urgenza)', () => {
        const U = _interno.calcolaU({ tempoRiappSec: 600, tempoEsaurSec: 1800, priorita: 'media', tempoResiduoEventoSec: 10000 })
        assert.strictEqual(U, 0)
    })

    await test('tempo_esaur < tempo_riapp con priorità media → U = (riapp - esaur) × 1.0 (× 1.2 se contesto)', () => {
        // riapp=600, esaur=300 → base = 300
        // esaur (300) < tempoResiduoEvento (10000) → moltiplicatore contesto attivo (1.2)
        const U = _interno.calcolaU({ tempoRiappSec: 600, tempoEsaurSec: 300, priorita: 'media', tempoResiduoEventoSec: 10000 })
        assert.strictEqual(U, 300 * 1.0 * 1.2)
    })

    await test('priorità alta moltiplica U per 1.5', () => {
        const U = _interno.calcolaU({ tempoRiappSec: 600, tempoEsaurSec: 300, priorita: 'alta', tempoResiduoEventoSec: 10000 })
        // 300 * 1.5 * 1.2 = 540
        assert.strictEqual(U, 540)
    })

    await test('priorità bassa moltiplica U per 0.5', () => {
        const U = _interno.calcolaU({ tempoRiappSec: 600, tempoEsaurSec: 300, priorita: 'bassa', tempoResiduoEventoSec: 10000 })
        assert.strictEqual(U, 300 * 0.5 * 1.2)
    })

    await test('moltiplicatore contesto NON attivo se esaur > residuo evento', () => {
        // esaur=5000, residuo=1000 → esaurimento dopo fine evento → niente contesto
        const U = _interno.calcolaU({ tempoRiappSec: 600, tempoEsaurSec: 5000, priorita: 'media', tempoResiduoEventoSec: 1000 })
        // riapp(600) - esaur(5000) = -4400 → max(0, ...) = 0
        // Anche se mettiamo tempi diversi: riapp=10000, esaur=5000 → base = 5000 × 1.0 = 5000 senza contesto
        const U2 = _interno.calcolaU({ tempoRiappSec: 10000, tempoEsaurSec: 5000, priorita: 'media', tempoResiduoEventoSec: 1000 })
        assert.strictEqual(U2, 5000)  // niente × 1.2
    })

    // ────────────────────────────────────────────────────────────────────────
    sezione('classifica: 4 stati')

    await test('quantita = 0 → "esaurito"', () => {
        const s = _interno.classifica({ quantita: 0, U: 100, statoScorta: 'disponibile', sogliaWarn: 300 })
        assert.strictEqual(s, 'esaurito')
    })

    await test('U = 0 + scorta disponibile → "stabile"', () => {
        const s = _interno.classifica({ quantita: 50, U: 0, statoScorta: 'disponibile', sogliaWarn: 300 })
        assert.strictEqual(s, 'stabile')
    })

    await test('U > 0 ma ≤ soglia_warn → "attenzione"', () => {
        const s = _interno.classifica({ quantita: 10, U: 150, statoScorta: 'attenzione', sogliaWarn: 300 })
        assert.strictEqual(s, 'attenzione')
    })

    await test('U > soglia_warn → "urgente"', () => {
        const s = _interno.classifica({ quantita: 5, U: 500, statoScorta: 'critico', sogliaWarn: 300 })
        assert.strictEqual(s, 'urgente')
    })

    // ────────────────────────────────────────────────────────────────────────
    sezione('quantitaSuggerita: formula ceil(consumo · t_riapp · 1.3)')

    await test('consumo=0.5 unità/min, t_riapp=600s (10min) → ceil(0.5 × 10 × 1.3) = 7', () => {
        const q = _interno.quantitaSuggerita(0.5, 600)
        assert.strictEqual(q, 7)
    })

    await test('consumo=2 unità/min, t_riapp=900s (15min) → ceil(2 × 15 × 1.3) = 39', () => {
        const q = _interno.quantitaSuggerita(2, 900)
        assert.strictEqual(q, 39)
    })

    // ────────────────────────────────────────────────────────────────────────
    sezione('aggregaConsumiCondivisi: ingredienti comuni')

    await test('voci [1,2] condivise → entrambe vedono la somma dei consumi', () => {
        const consumi = new Map([[1, 5], [2, 3], [3, 10]])
        const gruppi = [[1, 2]]
        const r = _interno.aggregaConsumiCondivisi(consumi, gruppi)
        assert.strictEqual(r.get(1), 8)  // 5 + 3
        assert.strictEqual(r.get(2), 8)
        assert.strictEqual(r.get(3), 10)  // non condivisa
    })

    // ────────────────────────────────────────────────────────────────────────
    sezione('tempoResiduoEventoSec')

    await test('orario futuro nello stesso giorno → secondi positivi', () => {
        const adesso = new Date('2026-05-17T20:00:00')
        const sec = _interno.tempoResiduoEventoSec('23:30', adesso)
        assert.strictEqual(sec, 3.5 * 3600)  // 3h30m = 12600s
    })

    await test('orario passato → 0', () => {
        const adesso = new Date('2026-05-17T23:45:00')
        const sec = _interno.tempoResiduoEventoSec('23:30', adesso)
        assert.strictEqual(sec, 0)
    })

    // ═════ FASE 2: TEST INTEGRAZIONE HTTP ═══════════════════════════════════
    sezione('Integrazione HTTP')

    let healthy
    try { healthy = await http_('GET', '/api/health') } catch { healthy = null }
    if (!healthy || healthy.status !== 200) {
        console.log(`  ${C.giallo}⚠ backend non raggiungibile su :3001 — salto i test HTTP${C.reset}`)
    } else {
        await test('GET /api/predittore/scorte ritorna lista voci con tutti i campi', async () => {
            const r = await http_('GET', '/api/predittore/scorte')
            assert.strictEqual(r.status, 200)
            assert.ok(Array.isArray(r.body.predizioni))
            assert.ok(r.body.predizioni.length > 0, 'attese voci attive')
            assert.ok(r.body.conteggi)
            const p = r.body.predizioni[0]
            for (const k of ['voce_id', 'nome', 'quantita_attuale', 'consumo_15min', 'consumo_1h',
                              'media_storica_unita_ora', 'modalita', 'pesi', 'consumo_atteso_unita_min',
                              'U', 'stato']) {
                assert.ok(k in p, `manca campo ${k}`)
            }
        })

        await test('GET /api/predittore/scorte?stato=stabile filtra correttamente', async () => {
            const r = await http_('GET', '/api/predittore/scorte?stato=stabile')
            for (const p of r.body.predizioni) {
                assert.strictEqual(p.stato, 'stabile')
            }
        })

        await test('GET /api/predittore/configurazione ritorna i 3 parametri default', async () => {
            const r = await http_('GET', '/api/predittore/configurazione')
            assert.strictEqual(r.status, 200)
            assert.ok('evento_fine_oggi' in r.body)
            assert.ok('soglia_warn_urgenza' in r.body)
            assert.ok('giorni_storico' in r.body)
        })

        await test('PUT /api/predittore/configurazione/:k aggiorna il valore', async () => {
            await http_('PUT', '/api/predittore/configurazione/soglia_warn_urgenza', { valore: 250 })
            const r = await http_('GET', '/api/predittore/configurazione')
            assert.strictEqual(r.body.soglia_warn_urgenza, '250')
            // Ripristina
            await http_('PUT', '/api/predittore/configurazione/soglia_warn_urgenza', { valore: 300 })
        })

        await test('Voce con quantita=0 → stato="esaurito" nella predizione HTTP', async () => {
            // Acqua = id 17. Imposto a 0.
            await http_('PUT', '/api/scorte/17', { quantita: 0, soglia_giallo: 5, soglia_rosso: 1, attiva: true })
            const r = await http_('GET', '/api/predittore/scorte/17')
            assert.strictEqual(r.body.stato, 'esaurito')
            // Ripristino
            await http_('PUT', '/api/scorte/17', { quantita: 50, soglia_giallo: 5, soglia_rosso: 1, attiva: true })
        })

        await test('Voce senza consumo recente → tempo_esaurimento_sec = null (Infinity)', async () => {
            // Prendi una voce qualsiasi con scorta ma senza ordini recenti
            const r = await http_('GET', '/api/predittore/scorte')
            const senzaConsumo = r.body.predizioni.find(p => p.consumo_15min === 0 && p.consumo_1h === 0
                                                              && p.media_storica_unita_ora === 0 && p.quantita_attuale > 0)
            if (senzaConsumo) {
                assert.strictEqual(senzaConsumo.tempo_esaurimento_sec, null)
                assert.strictEqual(senzaConsumo.stato, 'stabile')
            } else {
                console.log(`    ${C.giallo}skip: tutte le voci hanno consumo${C.reset}`)
            }
        })

        await test('Conteggi rispondono al totale predizioni', async () => {
            const r = await http_('GET', '/api/predittore/scorte')
            const { conteggi, predizioni } = r.body
            const calc = conteggi.stabile + conteggi.attenzione + conteggi.urgente + conteggi.esaurito
            assert.strictEqual(calc, predizioni.length)
            assert.strictEqual(conteggi.totale, predizioni.length)
        })
    }

    reportFinale()
}

main().catch(e => { console.error(C.rosso + 'ERRORE FATALE:' + C.reset, e); process.exit(2) })
