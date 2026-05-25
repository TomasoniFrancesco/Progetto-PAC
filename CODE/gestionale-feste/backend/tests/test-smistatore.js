// Suite di test per lo Smistatore Intelligente Multi-Reparto.
//
// Esegui con:
//   docker exec gestionale_backend node tests/test-smistatore.js
//
// Verifica:
//   - Formula del carico (n × t_prep × α × β)
//   - selectMinCarico (arg-min + tie-break)
//   - Routing greedy (1 task per riga, esplosione singola_singola, batching)
//   - Blocco scorte
//   - Ranking P (asporto, rischio scorte, carico)
//   - Bilanciamento end-to-end con fallback bidirezionale
//   - HTTP integrazione: comande generate, audit log, stati emulatori

const assert = require('assert')
const http = require('http')
const smistatore = require('../src/services/smistatore')

// ───── Mini test runner ────────────────────────────────────────────────────
const stato = { sezione: '', superati: 0, falliti: 0, errori: [] }
const C = { reset: '\x1b[0m', verde: '\x1b[32m', rosso: '\x1b[31m', giallo: '\x1b[33m', blu: '\x1b[36m', grigio: '\x1b[90m' }

function sezione(nome) {
    stato.sezione = nome
    console.log(`\n${C.blu}━━━ ${nome} ━━━${C.reset}`)
}
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

// ───── Helper: HTTP requests ───────────────────────────────────────────────
function http_(method, path, body) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null
        const req = http.request({
            host: '127.0.0.1', port: 3001, path, method,
            headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
        }, res => {
            let raw = ''
            res.on('data', c => raw += c)
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null }) }
                catch { resolve({ status: res.statusCode, body: raw }) }
            })
        })
        req.on('error', reject)
        if (data) req.write(data)
        req.end()
    })
}

// ───── Costanti algoritmo (devono allinearsi con services/smistatore.js) ──
const PESI = { A: 1.0, B: 50.0, C: 10.0, D: 0.01, E: 30.0 }
const ALPHA_STRESS = 1.3
const BETA_OFFLINE = 2.0
const SOGLIA_STRESS = 5
const TEMPO_PREP_DEFAULT = 60

// ──────────────────────────────────────────────────────────────────────────
async function main() {
    // ═════ FASE 1: UNIT TEST DEL MODULO SMISTATORE ════════════════════════
    sezione('Formula del carico')

    await test('reparto vuoto → carico 0', () => {
        smistatore.reset()
        const c = smistatore._carichi.caricoReparto('cucina')
        assert.strictEqual(c, 0)
    })

    await test('1 task tprep=60 → carico = 60', () => {
        smistatore.reset()
        // Inietto 1 task via routeOrder, è il modo pulito
        smistatore.routeOrder({
            ordine_id: 1,
            righe: [{ voce_id: 100, nome: 'X', quantita: 1, settore_stampa: 'cucina', tempo_preparazione: 60, scorta_attiva: 0 }],
        })
        assert.strictEqual(smistatore._carichi.caricoReparto('cucina'), 1 * 60 * 1.0 * 1.0)
    })

    await test('5 task tprep=60 → α=1.3 ATTIVO → carico = 1950', () => {
        smistatore.reset()
        for (let i = 0; i < 5; i++) {
            smistatore.routeOrder({
                ordine_id: i + 1,
                righe: [{ voce_id: 100, nome: 'X', quantita: 1, settore_stampa: 'cucina', tempo_preparazione: 60, scorta_attiva: 0 }],
            })
        }
        const c = smistatore._carichi.caricoReparto('cucina')
        assert.strictEqual(c, 5 * (5 * 60) * ALPHA_STRESS * 1.0, `atteso 1950, ottenuto ${c}`)
    })

    await test('4 task tprep=60 → α NON attivo → carico = 4·240 = 960', () => {
        smistatore.reset()
        for (let i = 0; i < 4; i++) {
            smistatore.routeOrder({
                ordine_id: i + 1,
                righe: [{ voce_id: 100, nome: 'X', quantita: 1, settore_stampa: 'cucina', tempo_preparazione: 60, scorta_attiva: 0 }],
            })
        }
        assert.strictEqual(smistatore._carichi.caricoReparto('cucina'), 4 * 240 * 1.0 * 1.0)
    })

    await test('stampante offline → β = 2.0', () => {
        smistatore.reset()
        smistatore.setStatoStampante('cucina', 'offline')
        smistatore.routeOrder({
            ordine_id: 1,
            righe: [{ voce_id: 100, nome: 'X', quantita: 1, settore_stampa: 'cucina', tempo_preparazione: 60, scorta_attiva: 0 }],
        })
        assert.strictEqual(smistatore._carichi.caricoReparto('cucina'), 1 * 60 * 1.0 * BETA_OFFLINE)
        smistatore.setStatoStampante('cucina', 'online')
    })

    // ────────────────────────────────────────────────────────────────────────
    sezione('selectMinCarico (arg-min + tie-break)')

    await test('sceglie il reparto con carico minore', () => {
        smistatore.reset()
        // Carico cucina_a alto, cucina_b vuoto
        for (let i = 0; i < 3; i++) {
            smistatore.routeOrder({
                ordine_id: i + 1,
                righe: [{ voce_id: 100, nome: 'X', quantita: 1, settore_stampa: 'cucina_a', tempo_preparazione: 60, scorta_attiva: 0 }],
            })
        }
        const scelto = smistatore._carichi.selectMinCarico(['cucina_a', 'cucina_b'])
        assert.strictEqual(scelto, 'cucina_b')
    })

    await test('tie-break: a parità di carico, sceglie il reparto col last-task più vecchio', () => {
        smistatore.reset()
        // Riempi cucina_a per primo
        smistatore.routeOrder({
            ordine_id: 1,
            righe: [{ voce_id: 100, nome: 'X', quantita: 1, settore_stampa: 'cucina_a', tempo_preparazione: 60, scorta_attiva: 0 }],
        })
        // Aspetta 5ms per avere timestamp diversi
        const dt = Date.now() + 5
        while (Date.now() < dt) { /* busy wait */ }
        smistatore.routeOrder({
            ordine_id: 2,
            righe: [{ voce_id: 200, nome: 'Y', quantita: 1, settore_stampa: 'cucina_b', tempo_preparazione: 60, scorta_attiva: 0 }],
        })
        // Entrambi hanno carico=60. cucina_a è "più vecchio" → vince
        const scelto = smistatore._carichi.selectMinCarico(['cucina_a', 'cucina_b'])
        assert.strictEqual(scelto, 'cucina_a')
    })

    await test('tutti offline → ritorna comunque il primo candidato', () => {
        smistatore.reset()
        smistatore.setStatoStampante('x', 'offline')
        const scelto = smistatore._carichi.selectMinCarico(['x'])
        assert.strictEqual(scelto, 'x')
        smistatore.setStatoStampante('x', 'online')
    })

    // ────────────────────────────────────────────────────────────────────────
    sezione('Routing (routeOrder)')

    await test('riga con scorta sufficiente → 1 task generato', () => {
        smistatore.reset()
        const r = smistatore.routeOrder({
            ordine_id: 1,
            righe: [{ voce_id: 1, nome: 'A', quantita: 1, settore_stampa: 'cucina', tempo_preparazione: 60,
                      scorta_attiva: 1, scorta_quantita: 5 }],
        })
        assert.strictEqual(r.bloccati.length, 0)
        assert.strictEqual(r.comande.length, 1)
        assert.strictEqual(r.comande[0].righe[0].quantita, 1)
    })

    await test('riga con scorta INSUFFICIENTE → finisce in bloccati, NON in comande', () => {
        smistatore.reset()
        const r = smistatore.routeOrder({
            ordine_id: 1,
            righe: [
                { voce_id: 1, nome: 'A', quantita: 10, settore_stampa: 'bar', tempo_preparazione: 60, scorta_attiva: 1, scorta_quantita: 2 },
                { voce_id: 2, nome: 'B', quantita: 1, settore_stampa: 'bar', tempo_preparazione: 60, scorta_attiva: 0 },
            ],
        })
        assert.strictEqual(r.bloccati.length, 1)
        assert.strictEqual(r.bloccati[0].voce_id, 1)
        assert.strictEqual(r.bloccati[0].richiesta, 10)
        assert.strictEqual(r.bloccati[0].disponibile, 2)
        // L'altra riga deve essere comunque generata
        assert.strictEqual(r.comande.length, 1)
        assert.strictEqual(r.comande[0].righe[0].voce_id, 2)
    })

    await test('quantita=3 + singola_multipla → 1 task con quantita=3', () => {
        smistatore.reset()
        const r = smistatore.routeOrder({
            ordine_id: 1,
            righe: [{ voce_id: 1, nome: 'A', quantita: 3, settore_stampa: 'cucina',
                      modalita_stampa: 'singola_multipla', tempo_preparazione: 60, scorta_attiva: 0 }],
        })
        assert.strictEqual(r.comande.length, 1)
        assert.strictEqual(r.comande[0].righe[0].quantita, 3)
        // 1 task in coda con tprep=60 → carico 60
        assert.strictEqual(smistatore._carichi.caricoReparto('cucina'), 60)
    })

    await test('quantita=3 + singola_singola → 3 task in coda, batchati in 1 comanda qta=3', () => {
        smistatore.reset()
        const r = smistatore.routeOrder({
            ordine_id: 1,
            righe: [{ voce_id: 1, nome: 'A', quantita: 3, settore_stampa: 'cucina',
                      modalita_stampa: 'singola_singola', tempo_preparazione: 60, scorta_attiva: 0 }],
        })
        // 3 task in coda
        assert.strictEqual(smistatore._carichi.caricoReparto('cucina'), 3 * (3 * 60) * 1.0 * 1.0)  // n=3, tprep=180
        // batching: 1 sola riga di comanda con qta totale 3
        assert.strictEqual(r.comande.length, 1)
        assert.strictEqual(r.comande[0].righe.length, 1)
        assert.strictEqual(r.comande[0].righe[0].quantita, 3)
    })

    await test('batching: due voci diverse, stesso reparto → 1 comanda con 2 righe', () => {
        smistatore.reset()
        const r = smistatore.routeOrder({
            ordine_id: 1,
            righe: [
                { voce_id: 1, nome: 'A', quantita: 2, settore_stampa: 'cucina', tempo_preparazione: 60, scorta_attiva: 0 },
                { voce_id: 2, nome: 'B', quantita: 1, settore_stampa: 'cucina', tempo_preparazione: 60, scorta_attiva: 0 },
            ],
        })
        assert.strictEqual(r.comande.length, 1)
        assert.strictEqual(r.comande[0].reparto, 'cucina')
        assert.strictEqual(r.comande[0].righe.length, 2)
    })

    // ────────────────────────────────────────────────────────────────────────
    sezione('Ranking P')

    await test('asporto incrementa P di B=50 rispetto a non-asporto', () => {
        smistatore.reset()
        const a = smistatore.routeOrder({
            ordine_id: 1, asporto: true,
            righe: [{ voce_id: 1, nome: 'X', quantita: 1, settore_stampa: 'bar', tempo_preparazione: 60, scorta_attiva: 0 }],
        })
        smistatore.reset()
        const b = smistatore.routeOrder({
            ordine_id: 2, asporto: false,
            righe: [{ voce_id: 1, nome: 'X', quantita: 1, settore_stampa: 'bar', tempo_preparazione: 60, scorta_attiva: 0 }],
        })
        const Pa = a.comande[0].righe[0].P
        const Pb = b.comande[0].righe[0].P
        const delta = Pa - Pb
        assert.ok(Math.abs(delta - PESI.B) < 0.5, `delta atteso ~${PESI.B}, ottenuto ${delta.toFixed(2)}`)
    })

    await test('rischio scorte (sotto soglia rosso) penalizza P di E=30', () => {
        smistatore.reset()
        const senza = smistatore.routeOrder({
            ordine_id: 1, asporto: false,
            righe: [{ voce_id: 1, nome: 'X', quantita: 1, settore_stampa: 'bar', tempo_preparazione: 60,
                      scorta_attiva: 1, scorta_quantita: 100, soglia_rosso: 3 }],
        })
        smistatore.reset()
        const con = smistatore.routeOrder({
            ordine_id: 2, asporto: false,
            righe: [{ voce_id: 1, nome: 'X', quantita: 1, settore_stampa: 'bar', tempo_preparazione: 60,
                      scorta_attiva: 1, scorta_quantita: 2, soglia_rosso: 3 }],
        })
        const delta = senza.comande[0].righe[0].P - con.comande[0].righe[0].P
        assert.ok(Math.abs(delta - PESI.E) < 0.5, `delta atteso ~${PESI.E}, ottenuto ${delta.toFixed(2)}`)
    })

    // ────────────────────────────────────────────────────────────────────────
    sezione('Bilanciamento end-to-end con fallback bidirezionale')

    await test('6 ordini cucina con fallback ↔ cucina_2 → distribuzione 3-3', () => {
        smistatore.reset()
        smistatore.setFallback('cucina', ['cucina_2'])
        smistatore.setFallback('cucina_2', ['cucina'])
        const counts = { cucina: 0, cucina_2: 0 }
        for (let i = 1; i <= 6; i++) {
            const r = smistatore.routeOrder({
                ordine_id: i,
                righe: [{ voce_id: 100, nome: 'P', quantita: 1, settore_stampa: 'cucina', tempo_preparazione: 60, scorta_attiva: 0 }],
            })
            counts[r.comande[0].reparto]++
        }
        assert.strictEqual(counts.cucina, 3, `cucina atteso 3, ottenuto ${counts.cucina}`)
        assert.strictEqual(counts.cucina_2, 3, `cucina_2 atteso 3, ottenuto ${counts.cucina_2}`)
        // Carico finale identico
        assert.strictEqual(
            smistatore._carichi.caricoReparto('cucina'),
            smistatore._carichi.caricoReparto('cucina_2'),
            'carichi finali non uguali'
        )
    })

    await test('primario offline + fallback online → routing va al fallback', () => {
        smistatore.reset()
        smistatore.setStatoStampante('cucina', 'offline')
        smistatore.setFallback('cucina', ['cucina_2'])
        const r = smistatore.routeOrder({
            ordine_id: 1,
            righe: [{ voce_id: 1, nome: 'X', quantita: 1, settore_stampa: 'cucina', tempo_preparazione: 60, scorta_attiva: 0 }],
        })
        assert.strictEqual(r.comande[0].reparto, 'cucina_2')
        smistatore.setStatoStampante('cucina', 'online')
    })

    await test('tutti offline → routing forzato sul primario', () => {
        smistatore.reset()
        smistatore.setStatoStampante('cucina', 'offline')
        smistatore.setStatoStampante('cucina_2', 'offline')
        smistatore.setFallback('cucina', ['cucina_2'])
        const r = smistatore.routeOrder({
            ordine_id: 1,
            righe: [{ voce_id: 1, nome: 'X', quantita: 1, settore_stampa: 'cucina', tempo_preparazione: 60, scorta_attiva: 0 }],
        })
        assert.strictEqual(r.comande[0].reparto, 'cucina')
        smistatore.setStatoStampante('cucina', 'online')
        smistatore.setStatoStampante('cucina_2', 'online')
    })

    // ═════ FASE 2: TEST DI INTEGRAZIONE HTTP ═════════════════════════════════
    sezione('Integrazione HTTP')

    let healthy
    try { healthy = await http_('GET', '/api/health') } catch { healthy = null }
    if (!healthy || healthy.status !== 200) {
        console.log(`  ${C.giallo}⚠ backend non raggiungibile su :3001 — salto i test HTTP${C.reset}`)
    } else {
        await test('GET /api/stampanti restituisce 4 stampanti (cucina, cucina_2, bar, griglia)', async () => {
            const r = await http_('GET', '/api/stampanti')
            assert.strictEqual(r.status, 200)
            const reparti = new Set(r.body.map(s => s.reparto))
            for (const exp of ['cucina', 'cucina_2', 'bar', 'griglia']) {
                assert.ok(reparti.has(exp), `manca reparto ${exp}`)
            }
        })

        await test('Ordine multi-reparto → comande corrette + audit OK', async () => {
            // Pulizia preventiva: completo eventuali task pendenti
            for (const reparto of ['cucina', 'cucina_2', 'bar', 'griglia']) {
                for (let i = 0; i < 20; i++) {
                    await http_('POST', '/api/smistatore/completa', { reparto, voce_id: 999 })
                }
            }

            const creazione = await http_('POST', '/api/ordini', {
                righe: [
                    { voce_id: 16, quantita: 1, note: [] },  // bar
                    { voce_id: 14, quantita: 1, note: [] },  // griglia
                ],
            })
            assert.strictEqual(creazione.status, 201)
            const id = creazione.body.id

            const conferma = await http_('POST', `/api/ordini/${id}/conferma`, { asporto: false })
            assert.strictEqual(conferma.status, 200)
            assert.ok(Array.isArray(conferma.body.comande))
            assert.strictEqual(conferma.body.comande.length, 2)
            const reparti = conferma.body.comande.map(c => c.reparto).sort()
            assert.deepStrictEqual(reparti, ['bar', 'griglia'])

            // Aspetta un attimo che il dispatcher abbia loggato
            await new Promise(r => setTimeout(r, 500))
            const audit = await http_('GET', `/api/stampe?ordine_id=${id}`)
            assert.strictEqual(audit.status, 200)
            assert.strictEqual(audit.body.length, 2)
            for (const r of audit.body) assert.strictEqual(r.esito, 'ok', `audit esito atteso ok, ottenuto ${r.esito}`)
        })

        await test('Stampante spenta + ordine cucina → routing automatico su cucina_2', async () => {
            // Spegni cucina (id=1)
            await http_('POST', '/api/stampe/emulatore/1/spegni')
            // Aspetta che si propaghi
            await new Promise(r => setTimeout(r, 200))

            const c = await http_('POST', '/api/ordini', { righe: [{ voce_id: 13, quantita: 1, note: [] }] })  // Insalata (cucina)
            const conf = await http_('POST', `/api/ordini/${c.body.id}/conferma`, { asporto: false })
            assert.strictEqual(conf.body.comande[0].reparto, 'cucina_2', `atteso cucina_2, ottenuto ${conf.body.comande[0].reparto}`)

            // Verifica audit: la stampa deve essere ok (perché va su cucina_2 che è online)
            await new Promise(r => setTimeout(r, 500))
            const audit = await http_('GET', `/api/stampe?ordine_id=${c.body.id}`)
            assert.strictEqual(audit.body.length, 1)
            assert.strictEqual(audit.body[0].reparto, 'cucina_2')
            assert.strictEqual(audit.body[0].esito, 'ok')

            // Riaccendi cucina
            await http_('POST', '/api/stampe/emulatore/1/accendi')
        })

        await test('Ordine con asporto → comanda con P alto (>= B=50)', async () => {
            const c = await http_('POST', '/api/ordini', { righe: [{ voce_id: 16, quantita: 1 }] })  // Birra
            const conf = await http_('POST', `/api/ordini/${c.body.id}/conferma`, { asporto: true })
            const P = conf.body.comande[0].righe[0].P
            assert.ok(P >= PESI.B - 5, `P atteso >= ${PESI.B - 5}, ottenuto ${P}`)
        })

        await test('Scorta esaurita → riga in bloccati, le altre proseguono', async () => {
            // Imposto scorta acqua (id=17) a 1
            await http_('PUT', '/api/scorte/17', { quantita: 1, soglia_giallo: 5, soglia_rosso: 1, attiva: true })
            const c = await http_('POST', '/api/ordini', {
                righe: [{ voce_id: 17, quantita: 10 }, { voce_id: 14, quantita: 1 }],  // 10 acque + 1 verdura
            })
            const conf = await http_('POST', `/api/ordini/${c.body.id}/conferma`, { asporto: false })
            assert.strictEqual(conf.body.bloccati.length, 1)
            assert.strictEqual(conf.body.bloccati[0].voce_id, 17)
            assert.strictEqual(conf.body.comande.length, 1)
            assert.strictEqual(conf.body.comande[0].reparto, 'griglia')

            // Ripristina scorta
            await http_('PUT', '/api/scorte/17', { quantita: 50, soglia_giallo: 5, soglia_rosso: 1, attiva: true })
        })
    }

    reportFinale()
}

main().catch(e => { console.error(C.rosso + 'ERRORE FATALE:' + C.reset, e); process.exit(2) })
