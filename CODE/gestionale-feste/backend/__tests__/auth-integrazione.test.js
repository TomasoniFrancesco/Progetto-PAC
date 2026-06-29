// Test di integrazione HTTP dell'autenticazione Admin (Iterazione 3).
// Richiedono il backend attivo su localhost:3001 (docker compose up).
// In CI senza Docker vengono saltati automaticamente.
//
// Eseguili localmente con:
//   docker compose up -d --build
//   cd backend && npm test -- __tests__/auth-integrazione.test.js

import { describe, it, expect } from 'vitest'
import http from 'node:http'

// ───── Helper HTTP (con supporto header Authorization) ──────────────────────
function http_(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null
        const req = http.request({
            host: '127.0.0.1', port: 3001, path, method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
            },
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

const PASSWORD_DEFAULT = '1111'

// ───── Verifica se il backend è raggiungibile ──────────────────────────────
let backendOnline = false
try {
    const r = await http_('GET', '/api/health')
    backendOnline = r.status === 200
} catch {
    backendOnline = false
}

// ═══════════════════════════════════════════════════════════════════════════
describe.skipIf(!backendOnline)('Integrazione HTTP autenticazione Admin', () => {

    it('POST /api/auth/admin/login con password corretta → 200 + token', async () => {
        const r = await http_('POST', '/api/auth/admin/login', { password: PASSWORD_DEFAULT })
        expect(r.status).toBe(200)
        expect(r.body).toHaveProperty('token')
        expect(r.body.ruolo).toBe('admin')
        expect(typeof r.body.scadenza).toBe('number')
    })

    it('POST /api/auth/admin/login con password errata → 401', async () => {
        const r = await http_('POST', '/api/auth/admin/login', { password: 'password-sbagliata' })
        expect(r.status).toBe(401)
        expect(r.body).toHaveProperty('errore')
    })

    it('POST /api/auth/admin/login senza password → 400', async () => {
        const r = await http_('POST', '/api/auth/admin/login', {})
        expect(r.status).toBe(400)
    })

    it('GET /api/auth/admin/verifica con token valido → 200 valido:true', async () => {
        const login = await http_('POST', '/api/auth/admin/login', { password: PASSWORD_DEFAULT })
        const r = await http_('GET', '/api/auth/admin/verifica', null, login.body.token)
        expect(r.status).toBe(200)
        expect(r.body.valido).toBe(true)
    })

    it('GET /api/auth/admin/verifica senza token → 401', async () => {
        const r = await http_('GET', '/api/auth/admin/verifica')
        expect(r.status).toBe(401)
    })

    it('POST /api/auth/admin/logout invalida il token', async () => {
        const login = await http_('POST', '/api/auth/admin/login', { password: PASSWORD_DEFAULT })
        const out = await http_('POST', '/api/auth/admin/logout', null, login.body.token)
        expect(out.status).toBe(200)
        // Dopo il logout il token non è più valido
        const dopo = await http_('GET', '/api/auth/admin/verifica', null, login.body.token)
        expect(dopo.status).toBe(401)
    })

    it('PUT /api/auth/admin/password cambia la password e poi la ripristina', async () => {
        const NUOVA = '2222'
        // Login con la password di default
        const login = await http_('POST', '/api/auth/admin/login', { password: PASSWORD_DEFAULT })
        const token = login.body.token

        // Cambio password (operazione protetta dal token)
        const cambio = await http_('PUT', '/api/auth/admin/password',
            { password_attuale: PASSWORD_DEFAULT, nuova_password: NUOVA }, token)
        expect(cambio.status).toBe(200)

        // La vecchia password non funziona più, la nuova sì
        expect((await http_('POST', '/api/auth/admin/login', { password: PASSWORD_DEFAULT })).status).toBe(401)
        const loginNuovo = await http_('POST', '/api/auth/admin/login', { password: NUOVA })
        expect(loginNuovo.status).toBe(200)

        // Ripristino della password di default per non alterare lo stato
        const ripristino = await http_('PUT', '/api/auth/admin/password',
            { password_attuale: NUOVA, nuova_password: PASSWORD_DEFAULT }, loginNuovo.body.token)
        expect(ripristino.status).toBe(200)
        expect((await http_('POST', '/api/auth/admin/login', { password: PASSWORD_DEFAULT })).status).toBe(200)
    })

    it('PUT /api/auth/admin/password senza token → 401', async () => {
        const r = await http_('PUT', '/api/auth/admin/password',
            { password_attuale: PASSWORD_DEFAULT, nuova_password: '9999' })
        expect(r.status).toBe(401)
    })
})
