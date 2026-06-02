const db = require('./db');

// Voci attive (visibili) con i dati di scorta, opzionalmente filtrate per id.
async function elencaVociAttive(filtroVociIds = null) {
    let query = `
        SELECT v.id, v.codice, v.nome, v.settore_stampa, v.tempo_riapprovvigionamento,
               v.priorita_voce, s.quantita, s.soglia_giallo, s.soglia_rosso, s.attiva
        FROM voce v
        LEFT JOIN scorta s ON s.voce_id = v.id
        WHERE v.visibile = 1`;
    const params = [];
    if (filtroVociIds && filtroVociIds.length) {
        query += ' AND v.id IN (?)';
        params.push(filtroVociIds);
    }
    const [voci] = await db.query(query, params);
    return voci;
}

// Somma quantità vendute (ordini confermati) per voce in una finestra di minuti.
async function consumiFinestra(minutiIndietro) {
    const [righe] = await db.query(
        `SELECT r.voce_id, COALESCE(SUM(r.quantita), 0) AS totale
         FROM ordine_riga r
         JOIN ordine o ON o.id = r.ordine_id
         WHERE o.stato = 'confermato'
           AND o.timestamp >= (NOW() - INTERVAL ? MINUTE)
         GROUP BY r.voce_id`,
        [minutiIndietro]
    );
    return righe;
}

// Media giornaliera delle quantità per voce, nella fascia oraria indicata, sui
// giorni passati (esclusa l'ultima ora).
async function mediaStorica(oraCorrente, giorniLookback) {
    const [righe] = await db.query(
        `SELECT voce_id, AVG(somma_giornaliera) AS media_unita_ora, COUNT(*) AS occorrenze
         FROM (
             SELECT r.voce_id, DATE(o.timestamp) AS giorno,
                    SUM(r.quantita) AS somma_giornaliera
             FROM ordine_riga r
             JOIN ordine o ON o.id = r.ordine_id
             WHERE o.stato = 'confermato'
               AND HOUR(o.timestamp) = ?
               AND o.timestamp >= (NOW() - INTERVAL ? DAY)
               AND o.timestamp <  (NOW() - INTERVAL 1 HOUR)
             GROUP BY r.voce_id, DATE(o.timestamp)
         ) AS t
         GROUP BY voce_id`,
        [oraCorrente, giorniLookback]
    );
    return righe;
}

// Gruppi di voci che condividono un contatore aggregato (tabella voce_contatore).
async function gruppiContatore() {
    const [righe] = await db.query(
        `SELECT contatore_id, GROUP_CONCAT(voce_id) AS voci
         FROM voce_contatore
         GROUP BY contatore_id`
    );
    return righe;
}

module.exports = { elencaVociAttive, consumiFinestra, mediaStorica, gruppiContatore };
