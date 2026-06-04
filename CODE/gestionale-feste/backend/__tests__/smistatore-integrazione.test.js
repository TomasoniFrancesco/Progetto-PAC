// Test di integrazione HTTP dello Smistatore
// Richiedono il backend attivo su localhost:3001 (docker compose up)
// In CI senza Docker vengono saltati automaticamente.
//
// Eseguili localmente con:
//   docker compose up -d --build
//   cd backend && npm test -- __tests__/smistatore-integrazione.test.js
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import http from 'node:http'

// ───── Helper HTTP ─────────────────────────────────────────────────────────
function http_(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = http.request({
      host: '127.0.0.1', port: 3001, path, method,
      headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
    }, (res) => {
      let raw = ''
      res.on('data', (c) => raw += c)
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

// ───── Verifica se il backend è raggiungibile (Top-level per skipIf) ───────
let backendOnline = false
try {
  const r = await http_('GET', '/api/health')
  backendOnline = r.status === 200
} catch {
  backendOnline = false
}

// Costanti utili per i test (es. PESI se usati nei calcoli di P)
const PESI = { B: 50 } // Adeguato ai valori reali del tuo progetto se differisce

// ═══════════════════════════════════════════════════════════════════════════
// Test di integrazione HTTP — Smistatore
// ═══════════════════════════════════════════════════════════════════════════
describe.skipIf(!backendOnline)('Integrazione HTTP smistatore', () => {

  // Questo beforeEach pulisce lo stato PRIMA di ogni test per evitare conflitti
  beforeEach(async () => {
    // 1. Riaccendi tutte le stampanti (ripristino da run precedenti interrotte)
    try {
      const stampanti = await http_('GET', '/api/stampanti')
      if (stampanti.body && Array.isArray(stampanti.body)) {
        for (const s of stampanti.body) {
          await http_('POST', `/api/stampe/emulatore/${s.id}/accendi`)
        }
      }
    } catch (err) {
      console.warn("Setup beforeEach (stampanti) non riuscito:", err.message)
    }

    // 2. Ripristina le scorte per tutte le voci usate nei test
    //    Senza questo step, le scorte si esauriscono dopo più esecuzioni
    //    e tutte le righe finiscono in "bloccati" invece che in "comande".
    const scorteDefault = [
      { voce_id: 13, quantita: 100, soglia_giallo: 10, soglia_rosso: 3, attiva: true },
      { voce_id: 14, quantita: 100, soglia_giallo: 10, soglia_rosso: 3, attiva: true },
      { voce_id: 16, quantita: 100, soglia_giallo: 10, soglia_rosso: 3, attiva: true },
      { voce_id: 17, quantita: 100, soglia_giallo: 10, soglia_rosso: 3, attiva: true },
    ]
    try {
      for (const s of scorteDefault) {
        await http_('PUT', `/api/scorte/${s.voce_id}`, s)
      }
    } catch (err) {
      console.warn("Setup beforeEach (scorte) non riuscito:", err.message)
    }

    // 3. Drena le code per i voce_id reali usati nei test
    const vociUsate = [13, 14, 16, 17]
    const reparti = ['cucina', 'cucina_2', 'bar', 'griglia']
    try {
      for (const vId of vociUsate) {
        for (const rep of reparti) {
          for (let i = 0; i < 5; i++) {
            await http_('POST', '/api/smistatore/completa', { reparto: rep, voce_id: vId })
          }
        }
      }
    } catch (err) {
      console.warn("Setup beforeEach (drenaggio) non riuscito:", err.message)
    }
  })

  // ─── Adesso lascia i tuoi test sotto, rimuovendo i vecchi cicli di cleanup manuali ───
  
  it('GET /api/stampanti restituisce almeno 4 stampanti', async () => {
    const r = await http_('GET', '/api/stampanti')
    expect(r.status).toBe(200)
    expect(r.body.length).toBeGreaterThanOrEqual(4)
  })

  it('Ordine multi-reparto → comande corrette + audit OK', async () => {
    const creazione = await http_('POST', '/api/ordini', {
      righe: [
        { voce_id: 16, quantita: 1, note: [] },  // bar
        { voce_id: 14, quantita: 1, note: [] },  // griglia
      ],
    })
    expect(creazione.status).toBe(201)
    const id = creazione.body.id

    const conferma = await http_('POST', `/api/ordini/${id}/conferma`, { asporto: false, importo_pagato: 10 })
    expect(conferma.status).toBe(200)
    expect(Array.isArray(conferma.body.comande)).toBe(true)
    expect(conferma.body.comande).toHaveLength(2)
    const reparti = conferma.body.comande.map((c) => c.reparto).sort()
    expect(reparti).toEqual(['bar', 'griglia'])

    // Aspetta che il dispatcher abbia loggato (inclusa eventuale copia cliente)
    await new Promise((r) => setTimeout(r, 800))
    
    const audit = await http_('GET', `/api/stampe?ordine_id=${id}`)
    expect(audit.status).toBe(200)
    
    // Il sistema potrebbe generare anche una copia cliente (reparto "cassa"),
    // quindi filtriamo per i reparti effettivi dell'ordine.
    const logReparti = audit.body.filter(r => r.reparto === 'bar' || r.reparto === 'griglia')
    
    // Devono esserci esattamente 2 stampe per i reparti dell'ordine
    expect(logReparti).toHaveLength(2)
    for (const r of logReparti) {
      expect(r.esito).toBe('ok')
    }
    
    // Eventuali log extra (es. copia cliente su "cassa") devono comunque essere ok
    for (const r of audit.body) {
      expect(r.esito).toBe('ok')
    }
  })

  it('Stampante spenta + ordine cucina → routing automatico su cucina_2', async () => {
    await http_('POST', '/api/stampe/emulatore/1/spegni')
    await new Promise((r) => setTimeout(r, 200))

    const c = await http_('POST', '/api/ordini', { righe: [{ voce_id: 13, quantita: 1, note: [] }] })
    const conf = await http_('POST', `/api/ordini/${c.body.id}/conferma`, { asporto: false, importo_pagato: 10 })
    expect(conf.body.comande[0].reparto).toBe('cucina_2')

    await new Promise((r) => setTimeout(r, 500))
    const audit = await http_('GET', `/api/stampe?ordine_id=${c.body.id}`)
    expect(audit.body).toHaveLength(1)
    expect(audit.body[0].reparto).toBe('cucina_2')
    expect(audit.body[0].esito).toBe('ok')

    await http_('POST', '/api/stampe/emulatore/1/accendi')
  })

  it('Ordine con asporto → comanda con P più alto rispetto a ordine tavolo', async () => {
    // Crea ordine TAVOLO (non asporto)
    const cTavolo = await http_('POST', '/api/ordini', { righe: [{ voce_id: 16, quantita: 1 }] })
    const confTavolo = await http_('POST', `/api/ordini/${cTavolo.body.id}/conferma`, { asporto: false, importo_pagato: 10 })
    const pTavolo = confTavolo.body.comande[0].righe[0].P

    // Crea ordine ASPORTO
    const cAsporto = await http_('POST', '/api/ordini', { righe: [{ voce_id: 16, quantita: 1 }] })
    const confAsporto = await http_('POST', `/api/ordini/${cAsporto.body.id}/conferma`, { asporto: true, importo_pagato: 10 })
    const pAsporto = confAsporto.body.comande[0].righe[0].P

    // Il bonus asporto (B=50) deve rendere P significativamente più alto
    // La differenza attesa è circa B=50 (meno un piccolo delta dovuto al carico)
    expect(pAsporto).toBeGreaterThan(pTavolo)
    expect(pAsporto - pTavolo).toBeGreaterThanOrEqual(40)
  })

  it('Scorta esaurita → riga in bloccati, le altre proseguono', async () => {
    await http_('PUT', '/api/scorte/17', { quantita: 1, soglia_giallo: 5, soglia_rosso: 1, attiva: true })
    const c = await http_('POST', '/api/ordini', {
      righe: [{ voce_id: 17, quantita: 10 }, { voce_id: 14, quantita: 1 }],
    })
    const conf = await http_('POST', `/api/ordini/${c.body.id}/conferma`, { asporto: false, importo_pagato: 10 })
    expect(conf.body.bloccati).toHaveLength(1)
    expect(conf.body.bloccati[0].voce_id).toBe(17)
    expect(conf.body.comande).toHaveLength(1)
    expect(conf.body.comande[0].reparto).toBe('griglia')

    await http_('PUT', '/api/scorte/17', { quantita: 50, soglia_giallo: 5, soglia_rosso: 1, attiva: true })
  })
})
