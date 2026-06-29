const db = require('./db');

// Accesso ai dati degli utenti del sistema (tabella `utente`).
//
// L'autenticazione Admin (Iterazione 3) usa una SINGOLA password senza username:
// esiste una sola riga con ruolo 'admin' e la verifica avviene confrontando la
// password inserita con il suo `password_hash`. Questo repository è il solo punto
// che conosce la tabella `utente`; route e service vi delegano la persistenza.

// Ritorna l'utente amministratore (l'unica riga con ruolo 'admin') o null.
async function trovaAdmin() {
    const [righe] = await db.query(
        `SELECT id, username, password_hash, ruolo
         FROM utente WHERE ruolo = 'admin' ORDER BY id LIMIT 1`
    );
    return righe.length > 0 ? righe[0] : null;
}

// Aggiorna l'hash della password dell'amministratore.
async function aggiornaPasswordAdmin(passwordHash) {
    const [esito] = await db.query(
        `UPDATE utente SET password_hash = ? WHERE ruolo = 'admin'`,
        [passwordHash]
    );
    return esito.affectedRows;
}

// Garantisce l'esistenza dell'utente admin con un determinato hash.
// Se la riga admin manca, la crea; se esiste ma l'hash è ancora il placeholder
// dello schema iniziale, lo sostituisce con quello fornito. Restituisce true se
// ha scritto sul database. Usata dalla migrazione di boot per impostare la
// password di default (1111).
async function assicuraAdmin(passwordHash, { username = 'admin' } = {}) {
    const admin = await trovaAdmin();
    if (!admin) {
        await db.query(
            `INSERT INTO utente (username, password_hash, ruolo) VALUES (?, ?, 'admin')`,
            [username, passwordHash]
        );
        return true;
    }
    // Hash non ancora inizializzato (placeholder dello schema di esempio).
    if (!admin.password_hash || admin.password_hash.includes('placeholder')) {
        await aggiornaPasswordAdmin(passwordHash);
        return true;
    }
    return false;
}

module.exports = { trovaAdmin, aggiornaPasswordAdmin, assicuraAdmin };
