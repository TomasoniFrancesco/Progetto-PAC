const db = require('./db');

// Esegue `lavoro(conn)` dentro una transazione: commit se ok, rollback su errore.
// Centralizza il pattern getConnection/begin/commit/rollback/release così che i
// route handler non debbano più toccare direttamente il pool.
async function withTransaction(lavoro) {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const risultato = await lavoro(conn);
        await conn.commit();
        return risultato;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

// Errore di dominio con codice di stato HTTP, così i route possono mappare
// le validazioni (es. 400) distinguendole dagli errori generici (500).
class ErroreDominio extends Error {
    constructor(messaggio, status = 400) {
        super(messaggio);
        this.name = 'ErroreDominio';
        this.status = status;
    }
}

module.exports = { withTransaction, ErroreDominio };
