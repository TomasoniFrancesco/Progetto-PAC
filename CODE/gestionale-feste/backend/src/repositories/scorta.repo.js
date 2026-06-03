const db = require('./db');
const { withTransaction } = require('./_tx');

// Espressione SQL condivisa: deriva lo stato visivo della scorta dalle soglie.
// Era duplicata in routes/scorte.js (×3) e routes/ordini.js.
const STATO_VISIVO = `
    CASE
        WHEN s.quantita = 0 THEN 'esaurito'
        WHEN s.quantita <= s.soglia_rosso THEN 'critico'
        WHEN s.quantita <= s.soglia_giallo THEN 'attenzione'
        ELSE 'disponibile'
    END AS stato_visivo`;

// Tutte le scorte attive con nome/codice voce e stato visivo (per la pagina scorte).
async function elencaAttiveConVoce() {
    const [scorte] = await db.query(
        `SELECT s.*, v.nome, v.codice,${STATO_VISIVO}
         FROM scorta s
         JOIN voce v ON s.voce_id = v.id
         WHERE s.attiva = 1`
    );
    return scorte;
}

// Scorta singola di una voce con stato visivo (null se assente).
async function trovaPerVoce(voceId) {
    const [righe] = await db.query(
        `SELECT s.*,${STATO_VISIVO}
         FROM scorta s WHERE s.voce_id = ?`,
        [voceId]
    );
    return righe.length > 0 ? righe[0] : null;
}

// Storico rifornimenti di una voce (ultimi 50).
async function storicoPerVoce(voceId) {
    const [storico] = await db.query(
        `SELECT * FROM scorta_storico WHERE voce_id = ? ORDER BY data_rifornimento DESC LIMIT 50`,
        [voceId]
    );
    return storico;
}

// Upsert della scorta di una voce (admin).
async function impostaScorta({ voceId, quantita, soglia_giallo, soglia_rosso, attiva }) {
    await db.query(
        `INSERT INTO scorta (voce_id, quantita, soglia_giallo, soglia_rosso, attiva)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         quantita = VALUES(quantita),
         soglia_giallo = VALUES(soglia_giallo),
         soglia_rosso = VALUES(soglia_rosso),
         attiva = VALUES(attiva)`,
        [voceId, quantita, soglia_giallo || 10, soglia_rosso || 3, attiva !== false ? 1 : 0]
    );
}

// Registra un rifornimento in modo atomico: assicura la riga scorta, incrementa
// la quantità e scrive lo storico.
async function registraRifornimento({ voceId, quantita, note }) {
    await withTransaction(async (conn) => {
        await conn.query(
            `INSERT INTO scorta (voce_id, quantita, attiva) VALUES (?, 0, 1)
             ON DUPLICATE KEY UPDATE voce_id = voce_id`,
            [voceId]
        );
        await conn.query(
            'UPDATE scorta SET quantita = quantita + ?, attiva = 1 WHERE voce_id = ?',
            [quantita, voceId]
        );
        await conn.query(
            'INSERT INTO scorta_storico (voce_id, quantita, note) VALUES (?, ?, ?)',
            [voceId, quantita, note || null]
        );
    });
}

// Snapshot scorte attive con nome voce e stato visivo (per la notifica WebSocket
// dopo modifiche da scorte). Variante con JOIN voce e filtro attiva.
async function snapshotAttiveConNome() {
    const [scorte] = await db.query(
        `SELECT s.*, v.nome,${STATO_VISIVO}
         FROM scorta s JOIN voce v ON s.voce_id = v.id WHERE s.attiva = 1`
    );
    return scorte;
}

// Snapshot di tutte le scorte con stato visivo, senza JOIN (per la notifica dopo
// la conferma di un ordine: stesso SELECT usato in routes/ordini.js).
async function snapshotConStato() {
    const [scorte] = await db.query(
        `SELECT s.*,${STATO_VISIVO}
         FROM scorta s`
    );
    return scorte;
}

module.exports = {
    elencaAttiveConVoce,
    trovaPerVoce,
    storicoPerVoce,
    impostaScorta,
    registraRifornimento,
    snapshotAttiveConNome,
    snapshotConStato,
};
