const db = require('./db');

// Registra l'esito di una stampa nell'audit log (stampa_eseguita).
async function registra({ ordine_id, stampante_id, reparto, payload, esito, errore, durata_ms }) {
    await db.query(
        `INSERT INTO stampa_eseguita (ordine_id, stampante_id, reparto, payload, esito, errore, durata_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [ordine_id, stampante_id || null, reparto, JSON.stringify(payload || null), esito, errore || null, durata_ms || null]
    );
}

// Storico stampe di un ordine specifico (con dati stampante).
async function storicoPerOrdine(ordineId) {
    const [righe] = await db.query(
        `SELECT se.*, s.nome AS stampante_nome, s.indirizzo_ip, s.porta
         FROM stampa_eseguita se
         LEFT JOIN stampante s ON s.id = se.stampante_id
         WHERE se.ordine_id = ?
         ORDER BY se.timestamp DESC`,
        [ordineId]
    );
    return righe;
}

// Ultime 100 stampe (con dati stampante).
async function storicoTutti() {
    const [righe] = await db.query(
        `SELECT se.*, s.nome AS stampante_nome, s.indirizzo_ip, s.porta
         FROM stampa_eseguita se
         LEFT JOIN stampante s ON s.id = se.stampante_id
         ORDER BY se.timestamp DESC LIMIT 100`
    );
    return righe;
}

// Stampe recenti (campi ridotti) fino a `limit`.
async function recenti(limit) {
    const [righe] = await db.query(
        `SELECT se.id, se.ordine_id, se.stampante_id, se.reparto, se.esito,
                se.errore, se.durata_ms, se.timestamp, s.nome AS stampante_nome
         FROM stampa_eseguita se
         LEFT JOIN stampante s ON s.id = se.stampante_id
         ORDER BY se.timestamp DESC LIMIT ?`,
        [limit]
    );
    return righe;
}

// Singola stampa per id (per la ristampa).
async function trovaPerId(id) {
    const [righe] = await db.query('SELECT * FROM stampa_eseguita WHERE id = ?', [id]);
    return righe[0] || null;
}

module.exports = { registra, storicoPerOrdine, storicoTutti, recenti, trovaPerId };
