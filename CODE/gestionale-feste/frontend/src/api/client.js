// Client API centralizzato: unico punto in cui vivono gli URL degli endpoint.
// Le pagine non costruiscono più stringhe `${API}/...` né chiamano fetch a mano.
const API = '/api'

// Helper interni. Preservano il comportamento originale delle pagine: ritornano
// il JSON della risposta senza lanciare su status HTTP non-2xx (la gestione
// errori resta nei try/catch dei chiamanti, come prima).
const getJson = (url) => fetch(url).then((r) => r.json())
const sendJson = (url, method, body) =>
    fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }).then((r) => r.json())

export const apiMenu = {
    voci: () => getJson(`${API}/menu`),
    tutte: () => getJson(`${API}/menu/tutte`),
    opzioni: () => getJson(`${API}/menu/opzioni`),
    settori: () => getJson(`${API}/menu/settori`),
    tuttiAllergeni: () => getJson(`${API}/menu/tutti-allergeni`),
    allergeni: (id) => getJson(`${API}/menu/${id}/allergeni`),
    composizione: (id) => getJson(`${API}/menu/${id}/composizione`),
    crea: (body) => sendJson(`${API}/menu`, 'POST', body),
    creaAggregata: (body) => sendJson(`${API}/menu/aggregata`, 'POST', body),
    aggiorna: (id, body) => sendJson(`${API}/menu/${id}`, 'PUT', body),
    aggiornaComposizione: (id, body) => sendJson(`${API}/menu/${id}/composizione`, 'PUT', body),
    elimina: (id) => fetch(`${API}/menu/${id}`, { method: 'DELETE' }).then((r) => r.json()),
    rinominaSettore: (body) => sendJson(`${API}/menu/settori/rinomina`, 'PUT', body),
    eliminaSettore: (nome) =>
        fetch(`${API}/menu/settori/${encodeURIComponent(nome)}`, { method: 'DELETE' }).then((r) => r.json()),
}

export const apiScorte = {
    tutte: () => getJson(`${API}/scorte`),
    perVoce: (id) => getJson(`${API}/scorte/${id}`),
    storico: (id) => getJson(`${API}/scorte/${id}/storico`),
    imposta: (id, body) => sendJson(`${API}/scorte/${id}`, 'PUT', body),
    rifornimento: (id, body) => sendJson(`${API}/scorte/${id}/rifornimento`, 'POST', body),
}

export const apiOrdini = {
    lista: () => getJson(`${API}/ordini`),
    crea: (body) => sendJson(`${API}/ordini`, 'POST', body),
    conferma: (id, body) => sendJson(`${API}/ordini/${id}/conferma`, 'POST', body),
}

export const apiStampanti = {
    tutte: () => getJson(`${API}/stampanti`),
}

// ─── Autenticazione Admin (Iterazione 3) ─────────────────────────────────────
// Il token di sessione è conservato in localStorage e inviato nell'header
// Authorization. Le funzioni ritornano { ok, status, body } così che il
// chiamante possa distinguere il successo (200) dalla password errata (401).
const TOKEN_KEY = 'admin_token'

export const tokenAdmin = {
    leggi: () => localStorage.getItem(TOKEN_KEY),
    salva: (t) => localStorage.setItem(TOKEN_KEY, t),
    rimuovi: () => localStorage.removeItem(TOKEN_KEY),
}

const authHeaders = () => {
    const t = tokenAdmin.leggi()
    return t ? { Authorization: `Bearer ${t}` } : {}
}

async function richiesta(url, method, body) {
    const res = await fetch(url, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    })
    let parsed = null
    try { parsed = await res.json() } catch { parsed = null }
    return { ok: res.ok, status: res.status, body: parsed }
}

export const apiAuth = {
    // Login con sola password: salva il token in caso di successo.
    login: async (password) => {
        const r = await richiesta(`${API}/auth/admin/login`, 'POST', { password })
        if (r.ok && r.body?.token) tokenAdmin.salva(r.body.token)
        return r
    },
    // Verifica che il token corrente sia ancora valido.
    verifica: () => richiesta(`${API}/auth/admin/verifica`, 'GET'),
    // Logout: revoca il token lato server e lo rimuove in locale.
    logout: async () => {
        const r = await richiesta(`${API}/auth/admin/logout`, 'POST')
        tokenAdmin.rimuovi()
        return r
    },
    // Cambio password admin.
    cambioPassword: (password_attuale, nuova_password) =>
        richiesta(`${API}/auth/admin/password`, 'PUT', { password_attuale, nuova_password }),
}
