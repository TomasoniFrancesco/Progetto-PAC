const db = require('./db');
const { withTransaction, ErroreDominio } = require('./_tx');

// Carica le note di una riga ordine (ordinate per porzione).
async function noteDiRiga(rigaId, exec = db) {
    const [note] = await exec.query(
        'SELECT numero_porzione, testo, costo_aggiuntivo FROM ordine_riga_nota WHERE riga_id = ? ORDER BY numero_porzione',
        [rigaId]
    );
    return note;
}

// Assembla le righe (con note) di un ordine, rimuovendo l'id interno della riga.
async function righeConNote(ordineId, selectRighe, exec = db) {
    const [righe] = await exec.query(selectRighe, [ordineId]);
    for (const riga of righe) {
        riga.note = await noteDiRiga(riga.id, exec);
        delete riga.id; // id interno, non serve al client
    }
    return righe;
}

const SELECT_RIGHE_LISTA = `SELECT r.id, r.voce_id, r.quantita, v.nome, v.prezzo
     FROM ordine_riga r
     JOIN voce v ON r.voce_id = v.id
     WHERE r.ordine_id = ?`;

const SELECT_RIGHE_DETTAGLIO = `SELECT r.id, r.voce_id, r.quantita, v.nome, v.prezzo, v.settore_stampa
     FROM ordine_riga r
     JOIN voce v ON r.voce_id = v.id
     WHERE r.ordine_id = ?`;

// Lista ordini del giorno con righe e note.
async function elencaDelGiorno() {
    const [ordini] = await db.query(
        `SELECT id, stato, asporto, sconto, tipo_sconto, totale, importo_pagato, timestamp
         FROM ordine
         WHERE DATE(timestamp) = CURDATE()
         ORDER BY timestamp DESC`
    );
    for (const ordine of ordini) {
        ordine.righe = await righeConNote(ordine.id, SELECT_RIGHE_LISTA);
    }
    return ordini;
}

// Dettaglio di un ordine con righe e note, o null se non esiste.
async function dettaglio(ordineId) {
    const [rows] = await db.query(
        `SELECT id, stato, asporto, sconto, tipo_sconto, totale, importo_pagato, timestamp
         FROM ordine WHERE id = ?`,
        [ordineId]
    );
    if (!rows.length) return null;
    const righe = await righeConNote(ordineId, SELECT_RIGHE_DETTAGLIO);
    return { ...rows[0], righe };
}

// Crea un nuovo ordine in stato "in_composizione" con righe e note. Ritorna l'id.
async function crea(righe) {
    return withTransaction(async (conn) => {
        const [risultato] = await conn.query(
            'INSERT INTO ordine (stato) VALUES ("in_composizione")'
        );
        const ordineId = risultato.insertId;

        for (const riga of righe) {
            const [r] = await conn.query(
                'INSERT INTO ordine_riga (ordine_id, voce_id, quantita) VALUES (?, ?, ?)',
                [ordineId, riga.voce_id, riga.quantita]
            );
            const rigaId = r.insertId;

            if (riga.note && riga.note.length) {
                for (const nota of riga.note) {
                    await conn.query(
                        'INSERT INTO ordine_riga_nota (riga_id, numero_porzione, testo, costo_aggiuntivo) VALUES (?, ?, ?, ?)',
                        [rigaId, nota.numero_porzione, nota.testo, nota.costo_aggiuntivo || 0]
                    );
                }
            }
        }
        return ordineId;
    });
}

// ── Conferma ordine: metodi granulari che accettano l'executor della transazione

// Righe con prezzi, dati di stampa e scorte (necessari allo smistatore).
async function righePerConferma(ordineId, exec) {
    const [righe] = await exec.query(
        `SELECT r.id AS riga_id, r.voce_id, r.quantita,
                v.nome, v.prezzo, v.settore_stampa, v.modalita_stampa, v.tempo_preparazione,
                v.copia_scontrino_cliente,
                s.quantita AS scorta_quantita, s.soglia_giallo, s.soglia_rosso, s.attiva AS scorta_attiva
         FROM ordine_riga r
         JOIN voce v ON r.voce_id = v.id
         LEFT JOIN scorta s ON s.voce_id = v.id
         WHERE r.ordine_id = ?`,
        [ordineId]
    );
    return righe;
}

// Note di tutte le righe indicate, raggruppate per riga_id (Map).
async function notePerRighe(rigaIds, exec) {
    const [tutteLeNote] = rigaIds.length
        ? await exec.query(
            'SELECT riga_id, numero_porzione, testo, costo_aggiuntivo FROM ordine_riga_nota WHERE riga_id IN (?)',
            [rigaIds]
        )
        : [[]];
    const notePerRiga = new Map();
    for (const n of tutteLeNote) {
        if (!notePerRiga.has(n.riga_id)) notePerRiga.set(n.riga_id, []);
        notePerRiga.get(n.riga_id).push({ numero_porzione: n.numero_porzione, testo: n.testo, costo_aggiuntivo: parseFloat(n.costo_aggiuntivo || 0) });
    }
    return notePerRiga;
}

// Scala la scorta di una voce (mai sotto zero), solo se attiva.
async function scalaScorta(voceId, quantita, exec) {
    await exec.query(
        `UPDATE scorta SET quantita = GREATEST(0, quantita - ?) WHERE voce_id = ? AND attiva = 1`,
        [quantita, voceId]
    );
}

// Aggiorna l'ordine con i dati di conferma calcolati.
async function aggiornaConferma({ ordineId, totale, asporto, scontoNum, tipoSconto, importoPagatoNum }, exec) {
    await exec.query(
        `UPDATE ordine SET
            stato = 'confermato',
            totale = ?,
            asporto = ?,
            sconto = ?,
            tipo_sconto = ?,
            importo_pagato = ?
         WHERE id = ?`,
        [totale, asporto ? 1 : 0, scontoNum, tipoSconto, importoPagatoNum, ordineId]
    );
}

module.exports = {
    withTransaction,
    ErroreDominio,
    elencaDelGiorno,
    dettaglio,
    crea,
    righePerConferma,
    notePerRighe,
    scalaScorta,
    aggiornaConferma,
};
