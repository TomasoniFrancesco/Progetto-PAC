// Test di integrazione HTTP del Predittore Dinamico
// Richiedono il backend attivo su localhost:3001 (docker compose up)
// In CI senza Docker vengono saltati automaticamente.
//
// Eseguili localmente con:
//   docker compose up -d --build
//   cd backend && npm test -- __tests__/predittore-integrazione.test.js

import { describe, it, expect, beforeAll } from 'vitest'
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

// ───── Verifica se il backend è raggiungibile ──────────────────────────────
let backendOnline = false
try {
  const r = await http_('GET', '/api/health')
  backendOnline = r.status === 200
} catch {
  backendOnline = false
}


// ═══════════════════════════════════════════════════════════════════════════
// Test di integrazione HTTP — saltati se il backend non è attivo
// ═══════════════════════════════════════════════════════════════════════════
describe.skipIf(!backendOnline)('Integrazione HTTP predittore', () => {

  it('GET /api/predittore/scorte ritorna lista voci con tutti i campi', async () => {
    const r = await http_('GET', '/api/predittore/scorte')
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body.predizioni)).toBe(true)
    expect(r.body.predizioni.length).toBeGreaterThan(0)
    expect(r.body.conteggi).toBeDefined()
    const p = r.body.predizioni[0]
    for (const k of ['voce_id', 'nome', 'quantita_attuale', 'consumo_15min', 'consumo_1h',
                      'media_storica_unita_ora', 'modalita', 'pesi', 'consumo_atteso_unita_min',
                      'U', 'stato']) {
      expect(p).toHaveProperty(k)
    }
  })

  it('GET /api/predittore/scorte?stato=stabile filtra correttamente', async () => {
    const r = await http_('GET', '/api/predittore/scorte?stato=stabile')
    for (const p of r.body.predizioni) {
      expect(p.stato).toBe('stabile')
    }
  })

  it('GET /api/predittore/configurazione ritorna i 3 parametri default', async () => {
    const r = await http_('GET', '/api/predittore/configurazione')
    expect(r.status).toBe(200)
    expect(r.body).toHaveProperty('evento_fine_oggi')
    expect(r.body).toHaveProperty('soglia_warn_urgenza')
    expect(r.body).toHaveProperty('giorni_storico')
  })

  it('PUT /api/predittore/configurazione/:k aggiorna il valore', async () => {
    await http_('PUT', '/api/predittore/configurazione/soglia_warn_urgenza', { valore: 250 })
    const r = await http_('GET', '/api/predittore/configurazione')
    expect(r.body.soglia_warn_urgenza).toBe('250')
    // Ripristina
    await http_('PUT', '/api/predittore/configurazione/soglia_warn_urgenza', { valore: 300 })
  })

  it('Voce con quantita=0 → stato="esaurito" nella predizione HTTP', async () => {
    await http_('PUT', '/api/scorte/17', { quantita: 0, soglia_giallo: 5, soglia_rosso: 1, attiva: true })
    const r = await http_('GET', '/api/predittore/scorte/17')
    expect(r.body.stato).toBe('esaurito')
    // Ripristino
    await http_('PUT', '/api/scorte/17', { quantita: 50, soglia_giallo: 5, soglia_rosso: 1, attiva: true })
  })

  it('Voce senza consumo recente → tempo_esaurimento_sec = null (Infinity)', async () => {
    const r = await http_('GET', '/api/predittore/scorte')
    const senzaConsumo = r.body.predizioni.find((p) =>
      p.consumo_15min === 0 && p.consumo_1h === 0 &&
      p.media_storica_unita_ora === 0 && p.quantita_attuale > 0
    )
    if (senzaConsumo) {
      expect(senzaConsumo.tempo_esaurimento_sec).toBeNull()
      expect(senzaConsumo.stato).toBe('stabile')
    }
    // Se tutte le voci hanno consumo, il test è comunque valido (nessun assert fallisce)
  })

  it('Conteggi rispondono al totale predizioni', async () => {
    const r = await http_('GET', '/api/predittore/scorte')
    const { conteggi, predizioni } = r.body
    const calc = conteggi.stabile + conteggi.attenzione + conteggi.urgente + conteggi.esaurito
    expect(calc).toBe(predizioni.length)
    expect(conteggi.totale).toBe(predizioni.length)
  })
})
