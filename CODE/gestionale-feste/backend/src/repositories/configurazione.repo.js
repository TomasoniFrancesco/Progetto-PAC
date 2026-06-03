const db = require('./db');

// Tutta la configurazione come mappa chiave -> valore.
async function leggiMappa() {
    const [righe] = await db.query('SELECT chiave, valore FROM configurazione');
    const mappa = {};
    for (const r of righe) mappa[r.chiave] = r.valore;
    return mappa;
}

// Upsert di una chiave di configurazione.
async function imposta(chiave, valore) {
    await db.query(
        `INSERT INTO configurazione (chiave, valore) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE valore = VALUES(valore)`,
        [chiave, String(valore)]
    );
}

module.exports = { leggiMappa, imposta };
