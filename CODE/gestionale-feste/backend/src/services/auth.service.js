const crypto = require('crypto');
const bcrypt = require('bcrypt');

// Servizio di autenticazione Admin (Iterazione 3).
//
// Responsabilità:
//   1. Verifica/hashing della password tramite bcrypt (funzioni pure, testabili
//      in isolamento dal database).
//   2. Gestione di token di sessione opachi tenuti in memoria: alla login viene
//      emesso un token con scadenza; un middleware (richiediAdmin) protegge le
//      route riservate. I token sono volatili: un riavvio del server li invalida,
//      scelta adeguata al contesto (sessione di una singola festa/evento).
//
// Nota di sicurezza: non si usano password in chiaro né hash con algoritmi
// veloci; bcrypt applica un salt per-hash e un fattore di costo configurabile.

const COSTO_BCRYPT = 10;
// Durata di una sessione admin: 8 ore, copre un turno di servizio.
const DURATA_TOKEN_MS = 8 * 60 * 60 * 1000;

// Store in memoria dei token attivi: token -> { ruolo, scadenza (epoch ms) }.
const sessioni = new Map();

// ─── Password ──────────────────────────────────────────────────────────────

// Calcola l'hash bcrypt di una password in chiaro.
function hashPassword(passwordInChiaro) {
    return bcrypt.hash(String(passwordInChiaro), COSTO_BCRYPT);
}

// Verifica una password in chiaro contro un hash bcrypt.
// Ritorna false (senza lanciare) se l'hash è assente o malformato.
async function verificaPassword(passwordInChiaro, hash) {
    if (!hash || typeof passwordInChiaro !== 'string' && typeof passwordInChiaro !== 'number') {
        return false;
    }
    try {
        return await bcrypt.compare(String(passwordInChiaro), hash);
    } catch {
        return false;
    }
}

// ─── Token di sessione ───────────────────────────────────────────────────────

// Crea un token opaco per un ruolo e lo registra con la sua scadenza.
function creaToken(ruolo, { durataMs = DURATA_TOKEN_MS, ora = Date.now() } = {}) {
    const token = crypto.randomBytes(32).toString('hex');
    const scadenza = ora + durataMs;
    sessioni.set(token, { ruolo, scadenza });
    return { token, scadenza };
}

// Valida un token: ritorna la sessione { ruolo, scadenza } se valido e non
// scaduto, altrimenti null. I token scaduti vengono rimossi (lazy cleanup).
function validaToken(token, { ora = Date.now() } = {}) {
    if (!token) return null;
    const sessione = sessioni.get(token);
    if (!sessione) return null;
    if (sessione.scadenza <= ora) {
        sessioni.delete(token);
        return null;
    }
    return sessione;
}

// Revoca esplicitamente un token (logout). Ritorna true se esisteva.
function revocaToken(token) {
    return sessioni.delete(token);
}

// Estrae il token dall'header Authorization: "Bearer <token>".
function estraiToken(req) {
    const header = req.headers?.authorization || '';
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    return match ? match[1] : null;
}

// Middleware Express: consente l'accesso solo a chi presenta un token admin
// valido. Risponde 401 altrimenti. Espone req.utente = { ruolo }.
function richiediAdmin(req, res, next) {
    const token = estraiToken(req);
    const sessione = validaToken(token);
    if (!sessione || sessione.ruolo !== 'admin') {
        return res.status(401).json({ errore: 'Autenticazione admin richiesta' });
    }
    req.utente = { ruolo: sessione.ruolo };
    req.token = token;
    next();
}

// Helper di test: svuota lo store dei token.
function _reset() {
    sessioni.clear();
}

module.exports = {
    COSTO_BCRYPT,
    DURATA_TOKEN_MS,
    hashPassword,
    verificaPassword,
    creaToken,
    validaToken,
    revocaToken,
    estraiToken,
    richiediAdmin,
    _reset,
};
