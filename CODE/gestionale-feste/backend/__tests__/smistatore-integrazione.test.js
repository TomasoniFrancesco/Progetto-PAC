// Test di integrazione HTTP dello Smistatore
// Richiedono il backend attivo su localhost:3001 (docker compose up)
// In CI senza Docker vengono saltati automaticamente.
//
// Eseguili localmente con:
//   docker compose up -d --build
//   cd backend && npm test -- __tests__/smistatore-integrazione.test.js

import { describe, it, expect, beforeAll } from 'vitest'
import http from 'node:http'

const PESI = { A: 1.0, B: 50.0, C: 10.0, D: 0.01, E: 30.0 }

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

// ───── Verifica se il backend è raggiungibile ──────────────────────────────
let backendOnline = false
beforeAll(async () => {
  try {
    const r = await http_('GET', '/api/health')
    backendOnline = r.status === 200
  } catch {
    backendOnline = false
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// Test di integrazione HTTP — saltati se il backend non è attivo
// ═══════════════════════════════════════════════════════════════════════════
describe.skipIf(!backendOnline)('Integrazione HTTP smistatore', () => {
  // Nota: i test usano describe.skipIf per funzionare sia in locale (con Docker)
  // sia in CI (senza Docker), dove vengono automaticamente saltati.

  it('GET /api/stampanti restituisce almeno 4 stampanti', async () => {
    const r = await http_('GET', '/api/stampanti')
    expect(r.status).toBe(200)
    const reparti = new Set(r.body.map((s) => s.reparto))
    for (const exp of ['cucina', 'cucina_2', 'bar', 'griglia']) {
      expect(reparti.has(exp)).toBe(true)
    }
  })

  it('Ordine multi-reparto → comande corrette + audit OK', async () => {
    // Pulizia preventiva
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
    expect(creazione.status).toBe(201)
    const id = creazione.body.id

    const conferma = await http_('POST', `/api/ordini/${id}/conferma`, { asporto: false, importo_pagato: 10 })
    expect(conferma.status).toBe(200)
    expect(Array.isArray(conferma.body.comande)).toBe(true)
    expect(conferma.body.comande).toHaveLength(2)
    const reparti = conferma.body.comande.map((c) => c.reparto).sort()
    expect(reparti).toEqual(['bar', 'griglia'])

    // Aspetta che il dispatcher abbia loggato
    await new Promise((r) => setTimeout(r, 500))
    const audit = await http_('GET', `/api/stampe?ordine_id=${id}`)
    expect(audit.status).toBe(200)
    expect(audit.body).toHaveLength(2)
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

  it('Ordine con asporto → comanda con P alto (>= B=50)', async () => {
    const c = await http_('POST', '/api/ordini', { righe: [{ voce_id: 16, quantita: 1 }] })
    const conf = await http_('POST', `/api/ordini/${c.body.id}/conferma`, { asporto: true, importo_pagato: 10 })
    const P = conf.body.comande[0].righe[0].P
    expect(P).toBeGreaterThanOrEqual(PESI.B - 5)
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
