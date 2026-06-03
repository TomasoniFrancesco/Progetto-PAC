const db = require('./db');
const { withTransaction } = require('./_tx');

const INSERT_VOCE = `INSERT INTO voce
     (codice, nome, prezzo, categoria, settore_visualizzazione, settore_stampa, colore_tasto, copia_scontrino_cliente, asportabile, modalita_stampa)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const INSERT_SCORTA_DEFAULT = `INSERT INTO scorta (voce_id, quantita, soglia_giallo, soglia_rosso, attiva)
     VALUES (?, ?, ?, ?, ?)`;

// Mappa il body di una voce nei parametri posizionali di INSERT_VOCE.
function paramsVoce(codice, v) {
    return [
        codice, v.nome.trim(), v.prezzo || 0, v.categoria || null,
        v.settore_visualizzazione || null, v.settore_stampa || null,
        v.colore_tasto || '#4A90D9', v.copia_scontrino_cliente ? 1 : 0,
        v.asportabile !== false ? 1 : 0, v.modalita_stampa || 'singola_multipla',
    ];
}

// ── Letture ────────────────────────────────────────────────────────────────

// Voci visibili per la cassa, con dati scorta.
async function elencaVisibiliPerCassa() {
    const [voci] = await db.query(
        `SELECT v.*, s.quantita as scorta_quantita, s.soglia_giallo, s.soglia_rosso, s.attiva as scorta_attiva
         FROM voce v
         LEFT JOIN scorta s ON s.voce_id = v.id
         WHERE v.visibile = 1
         ORDER BY v.settore_visualizzazione, v.nome`
    );
    return voci;
}

// Tutte le voci (incluse nascoste) per l'admin, con conteggio componenti.
async function elencaTutte() {
    const [voci] = await db.query(
        `SELECT v.*,
            s.quantita as scorta_quantita, s.soglia_giallo, s.soglia_rosso, s.attiva as scorta_attiva,
            (SELECT COUNT(*) FROM voce_composizione vc WHERE vc.voce_aggregata_id = v.id) as num_componenti
         FROM voce v
         LEFT JOIN scorta s ON s.voce_id = v.id
         ORDER BY v.settore_visualizzazione, v.nome`
    );
    return voci;
}

// Settori distinti con conteggio voci e colore predominante.
async function elencaSettori() {
    const [settori] = await db.query(
        `SELECT
            settore_visualizzazione,
            COUNT(*) as num_pietanze,
            (SELECT colore_tasto FROM voce v2
             WHERE v2.settore_visualizzazione = voce.settore_visualizzazione
             GROUP BY colore_tasto ORDER BY COUNT(*) DESC LIMIT 1
            ) as colore
         FROM voce
         WHERE settore_visualizzazione IS NOT NULL AND settore_visualizzazione != ''
         GROUP BY settore_visualizzazione
         ORDER BY settore_visualizzazione`
    );
    return settori;
}

// Valori distinti per i dropdown (categorie, settori stampa/visualizzazione).
async function opzioniDistinte() {
    const [categorie] = await db.query(
        `SELECT DISTINCT categoria FROM voce WHERE categoria IS NOT NULL AND categoria != '' ORDER BY categoria`
    );
    const [settoriStampa] = await db.query(
        `SELECT DISTINCT settore_stampa FROM voce WHERE settore_stampa IS NOT NULL AND settore_stampa != '' ORDER BY settore_stampa`
    );
    const [settoriVis] = await db.query(
        `SELECT DISTINCT settore_visualizzazione FROM voce WHERE settore_visualizzazione IS NOT NULL AND settore_visualizzazione != '' ORDER BY settore_visualizzazione`
    );
    return {
        categorie: categorie.map(r => r.categoria),
        settori_stampa: settoriStampa.map(r => r.settore_stampa),
        settori_visualizzazione: settoriVis.map(r => r.settore_visualizzazione),
    };
}

// Mappa voce_id -> [allergeni] per il precarico del frontend.
async function mappaTuttiAllergeni() {
    const [righe] = await db.query(
        `SELECT va.voce_id, a.id, a.nome, a.descr
         FROM voce_allergene va
         JOIN allergene a ON a.id = va.allergene_id
         ORDER BY va.voce_id, a.nome`
    );
    const mappa = {};
    righe.forEach(r => {
        if (!mappa[r.voce_id]) mappa[r.voce_id] = [];
        mappa[r.voce_id].push({ id: r.id, nome: r.nome, descr: r.descr });
    });
    return mappa;
}

// Allergeni di una voce.
async function allergeniPerVoce(voceId) {
    const [allergeni] = await db.query(
        `SELECT a.* FROM allergene a
         JOIN voce_allergene va ON va.allergene_id = a.id
         WHERE va.voce_id = ?`,
        [voceId]
    );
    return allergeni;
}

// Componenti di una pietanza aggregata.
async function componentiPerVoce(voceId) {
    const [componenti] = await db.query(
        `SELECT v.id, v.codice, v.nome, v.prezzo, v.categoria, v.settore_visualizzazione
         FROM voce v
         JOIN voce_composizione vc ON vc.voce_componente_id = v.id
         WHERE vc.voce_aggregata_id = ?
         ORDER BY v.nome`,
        [voceId]
    );
    return componenti;
}

// ── Scritture ────────────────────────────────────────────────────────────────

// Genera un codice voce progressivo a partire dall'iniziale della categoria.
// Accetta un executor opzionale per restare dentro una transazione.
async function generaCodice(categoria, exec = db) {
    const prefisso = (categoria && categoria.trim().length > 0)
        ? categoria.trim()[0].toUpperCase()
        : 'X';

    const [maxCodice] = await exec.query(
        `SELECT codice FROM voce WHERE codice LIKE ? ORDER BY codice DESC LIMIT 1`,
        [`${prefisso}%`]
    );

    let numero = 1;
    if (maxCodice.length > 0) {
        const match = maxCodice[0].codice.match(/\d+$/);
        if (match) numero = parseInt(match[0]) + 1;
    }

    return `${prefisso}${String(numero).padStart(3, '0')}`;
}

// Crea una voce singola con scorta di default (10 unità). Ritorna { id, codice }.
async function creaVoceSingola(body) {
    const codice = await generaCodice(body.categoria);
    const [risultato] = await db.query(INSERT_VOCE, paramsVoce(codice, body));
    const voceId = risultato.insertId;
    await db.query(INSERT_SCORTA_DEFAULT, [voceId, 10, 10, 3, 1]);
    return { id: voceId, codice };
}

// Crea una voce aggregata con i suoi componenti e scorta di default, atomico.
async function creaVoceAggregata(body) {
    return withTransaction(async (conn) => {
        const codice = await generaCodice(body.categoria, conn);
        const [risultato] = await conn.query(INSERT_VOCE, paramsVoce(codice, body));
        const voceId = risultato.insertId;
        for (const compId of body.componenti) {
            await conn.query(
                'INSERT INTO voce_composizione (voce_aggregata_id, voce_componente_id) VALUES (?, ?)',
                [voceId, compId]
            );
        }
        await conn.query(INSERT_SCORTA_DEFAULT, [voceId, 10, 10, 3, 1]);
        return { id: voceId, codice };
    });
}

// Aggiorna i campi consentiti di una voce. Ritorna false se nessun campo valido.
async function aggiornaVoce(voceId, campi) {
    const campiConsentiti = ['nome', 'prezzo', 'categoria', 'settore_visualizzazione', 'settore_stampa', 'colore_tasto', 'copia_scontrino_cliente', 'visibile', 'asportabile', 'modalita_stampa'];

    const aggiornamenti = Object.keys(campi)
        .filter(k => campiConsentiti.includes(k))
        .map(k => `${k} = ?`);

    if (!aggiornamenti.length) return false;

    await db.query(
        `UPDATE voce SET ${aggiornamenti.join(', ')} WHERE id = ?`,
        [...aggiornamenti.map(a => campi[a.split(' ')[0]]), voceId]
    );
    return true;
}

// Sostituisce i componenti di una pietanza aggregata, atomico.
async function aggiornaComposizione(voceId, componenti) {
    await withTransaction(async (conn) => {
        await conn.query('DELETE FROM voce_composizione WHERE voce_aggregata_id = ?', [voceId]);
        for (const compId of componenti) {
            await conn.query(
                'INSERT INTO voce_composizione (voce_aggregata_id, voce_componente_id) VALUES (?, ?)',
                [voceId, compId]
            );
        }
    });
}

// Rinomina un settore su tutte le voci. Ritorna il numero di voci aggiornate.
async function rinominaSettore(vecchioNome, nuovoNome) {
    const [risultato] = await db.query(
        'UPDATE voce SET settore_visualizzazione = ? WHERE settore_visualizzazione = ?',
        [nuovoNome, vecchioNome]
    );
    return risultato.affectedRows;
}

// Elimina un settore e tutte le sue voci. Ritorna il numero di voci eliminate.
async function eliminaSettore(nomeSettore) {
    const [risultato] = await db.query(
        'DELETE FROM voce WHERE settore_visualizzazione = ?',
        [nomeSettore]
    );
    return risultato.affectedRows;
}

// Elimina una voce.
async function eliminaVoce(voceId) {
    await db.query('DELETE FROM voce WHERE id = ?', [voceId]);
}

// Aggiorna i campi predittore (tempo riapprovvigionamento / priorità) di una voce.
// `updates`/`params` sono già preparati dal chiamante.
async function aggiornaCampiPredittore(updates, params) {
    await db.query(`UPDATE voce SET ${updates.join(', ')} WHERE id = ?`, params);
}

module.exports = {
    elencaVisibiliPerCassa,
    elencaTutte,
    elencaSettori,
    opzioniDistinte,
    mappaTuttiAllergeni,
    allergeniPerVoce,
    componentiPerVoce,
    generaCodice,
    creaVoceSingola,
    creaVoceAggregata,
    aggiornaVoce,
    aggiornaComposizione,
    rinominaSettore,
    eliminaSettore,
    eliminaVoce,
    aggiornaCampiPredittore,
};
