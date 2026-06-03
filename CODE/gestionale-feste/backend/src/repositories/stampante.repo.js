const db = require('./db');

// Tutte le stampanti configurate.
async function elenca() {
    const [stampanti] = await db.query('SELECT * FROM stampante');
    return stampanti;
}

// Aggiunge una stampante. Ritorna l'id inserito.
async function crea({ reparto, indirizzo_ip, porta }) {
    const [r] = await db.query(
        'INSERT INTO stampante (reparto, indirizzo_ip, porta) VALUES (?, ?, ?)',
        [reparto, indirizzo_ip, porta || 9100]
    );
    return r.insertId;
}

// Aggiorna i dati di una stampante.
async function aggiorna(id, { reparto, indirizzo_ip, porta }) {
    await db.query(
        'UPDATE stampante SET reparto = ?, indirizzo_ip = ?, porta = ? WHERE id = ?',
        [reparto, indirizzo_ip, porta || 9100, id]
    );
}

// Rimuove una stampante.
async function elimina(id) {
    await db.query('DELETE FROM stampante WHERE id = ?', [id]);
}

// Imposta lo stato (online/offline) di tutte le stampanti di un reparto.
// Persistenza opzionale: il chiamante ignora eventuali errori.
async function aggiornaStatoPerReparto(reparto, stato) {
    await db.query('UPDATE stampante SET stato = ? WHERE reparto = ?', [stato, reparto]);
}

// Stampante primaria attiva di un reparto (o null).
async function trovaPrimariaAttiva(reparto) {
    const [righe] = await db.query(
        `SELECT * FROM stampante
         WHERE reparto = ? AND primaria = 1 AND attiva = 1
         ORDER BY id ASC LIMIT 1`,
        [reparto]
    );
    return righe[0] || null;
}

// Stampante per id (o null).
async function trovaPerId(id) {
    const [righe] = await db.query('SELECT * FROM stampante WHERE id = ?', [id]);
    return righe[0] || null;
}

// Stampanti locali (emulabili) ancora attive.
async function elencaLocaliAttive() {
    const [stampanti] = await db.query(
        `SELECT * FROM stampante WHERE indirizzo_ip = '127.0.0.1' AND attiva = 1`
    );
    return stampanti;
}

// Imposta lo stato di una singola stampante.
async function impostaStato(id, stato) {
    await db.query('UPDATE stampante SET stato = ? WHERE id = ?', [stato, id]);
}

// Imposta lo stato solo se diverso da quello attuale (evita UPDATE inutili).
async function impostaStatoSeDiverso(id, stato) {
    await db.query('UPDATE stampante SET stato = ? WHERE id = ? AND stato != ?', [stato, id, stato]);
}

module.exports = {
    elenca,
    crea,
    aggiorna,
    elimina,
    aggiornaStatoPerReparto,
    trovaPrimariaAttiva,
    trovaPerId,
    elencaLocaliAttive,
    impostaStato,
    impostaStatoSeDiverso,
};
