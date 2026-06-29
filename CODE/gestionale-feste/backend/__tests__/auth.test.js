// Test unitari dell'autenticazione Admin (Iterazione 3).
// Coprono le funzioni pure del servizio di autenticazione: verifica della
// password con bcrypt, ciclo di vita dei token di sessione e middleware di
// protezione. Non richiedono database né backend in esecuzione.

import { describe, it, expect, beforeEach } from 'vitest'
import auth from '../src/services/auth.service.js'

describe('auth.service — password', () => {
    it('hashPassword produce un hash bcrypt verificabile', async () => {
        const hash = await auth.hashPassword('1111')
        expect(typeof hash).toBe('string')
        expect(hash).toMatch(/^\$2[aby]\$/) // formato bcrypt
        expect(hash).not.toBe('1111')       // non in chiaro
    })

    it('verificaPassword ritorna true con la password corretta', async () => {
        const hash = await auth.hashPassword('1111')
        expect(await auth.verificaPassword('1111', hash)).toBe(true)
    })

    it('verificaPassword ritorna false con password errata', async () => {
        const hash = await auth.hashPassword('1111')
        expect(await auth.verificaPassword('0000', hash)).toBe(false)
        expect(await auth.verificaPassword('11111', hash)).toBe(false)
    })

    it('verificaPassword ritorna false (senza lanciare) con hash assente o malformato', async () => {
        expect(await auth.verificaPassword('1111', null)).toBe(false)
        expect(await auth.verificaPassword('1111', '')).toBe(false)
        expect(await auth.verificaPassword('1111', 'non-un-hash')).toBe(false)
    })

    it('accetta la password anche se passata come numero', async () => {
        const hash = await auth.hashPassword(1111)
        expect(await auth.verificaPassword(1111, hash)).toBe(true)
    })
})

describe('auth.service — token di sessione', () => {
    beforeEach(() => auth._reset())

    it('creaToken restituisce un token e una scadenza futura', () => {
        const { token, scadenza } = auth.creaToken('admin')
        expect(token).toMatch(/^[0-9a-f]{64}$/) // 32 byte esadecimali
        expect(scadenza).toBeGreaterThan(Date.now())
    })

    it('validaToken riconosce un token valido e ne legge il ruolo', () => {
        const { token } = auth.creaToken('admin')
        const sessione = auth.validaToken(token)
        expect(sessione).not.toBeNull()
        expect(sessione.ruolo).toBe('admin')
    })

    it('validaToken ritorna null per token inesistente o assente', () => {
        expect(auth.validaToken('inesistente')).toBeNull()
        expect(auth.validaToken(null)).toBeNull()
        expect(auth.validaToken(undefined)).toBeNull()
    })

    it('validaToken ritorna null per token scaduto e lo rimuove', () => {
        const base = 1_000_000
        const { token } = auth.creaToken('admin', { durataMs: 1000, ora: base })
        // Ancora valido un istante prima della scadenza
        expect(auth.validaToken(token, { ora: base + 999 })).not.toBeNull()
        // Scaduto al raggiungimento della scadenza
        expect(auth.validaToken(token, { ora: base + 1000 })).toBeNull()
        // Rimosso: anche una verifica successiva fallisce
        expect(auth.validaToken(token)).toBeNull()
    })

    it('revocaToken invalida il token (logout)', () => {
        const { token } = auth.creaToken('admin')
        expect(auth.revocaToken(token)).toBe(true)
        expect(auth.validaToken(token)).toBeNull()
        expect(auth.revocaToken(token)).toBe(false) // già revocato
    })
})

describe('auth.service — estraiToken', () => {
    it('estrae il token dall\'header Authorization Bearer', () => {
        expect(auth.estraiToken({ headers: { authorization: 'Bearer abc123' } })).toBe('abc123')
        expect(auth.estraiToken({ headers: { authorization: 'bearer abc123' } })).toBe('abc123')
    })

    it('ritorna null in assenza di header o con formato errato', () => {
        expect(auth.estraiToken({ headers: {} })).toBeNull()
        expect(auth.estraiToken({})).toBeNull()
        expect(auth.estraiToken({ headers: { authorization: 'Token abc' } })).toBeNull()
    })
})

describe('auth.service — middleware richiediAdmin', () => {
    beforeEach(() => auth._reset())

    function fakeRes() {
        return {
            statusCode: null,
            payload: null,
            status(c) { this.statusCode = c; return this },
            json(b) { this.payload = b; return this },
        }
    }

    it('chiama next() e popola req.utente con un token admin valido', () => {
        const { token } = auth.creaToken('admin')
        const req = { headers: { authorization: `Bearer ${token}` } }
        const res = fakeRes()
        let chiamato = false
        auth.richiediAdmin(req, res, () => { chiamato = true })
        expect(chiamato).toBe(true)
        expect(req.utente).toEqual({ ruolo: 'admin' })
        expect(req.token).toBe(token)
    })

    it('risponde 401 senza token', () => {
        const req = { headers: {} }
        const res = fakeRes()
        let chiamato = false
        auth.richiediAdmin(req, res, () => { chiamato = true })
        expect(chiamato).toBe(false)
        expect(res.statusCode).toBe(401)
        expect(res.payload).toHaveProperty('errore')
    })

    it('risponde 401 con un token di ruolo non admin', () => {
        const { token } = auth.creaToken('cassiere')
        const req = { headers: { authorization: `Bearer ${token}` } }
        const res = fakeRes()
        let chiamato = false
        auth.richiediAdmin(req, res, () => { chiamato = true })
        expect(chiamato).toBe(false)
        expect(res.statusCode).toBe(401)
    })
})
