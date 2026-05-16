const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const db = require('./db');
const ordiniRouter = require('./routes/ordini');
const menuRouter = require('./routes/menu');
const scorteRouter = require('./routes/scorte');
const stampantiRouter = require('./routes/stampanti');
const smistatoreRouter = require('./routes/smistatore');
const smistatore = require('./services/smistatore');

const app = express();
const server = http.createServer(app);

// Socket.io: permette ai client di ricevere aggiornamenti in tempo reale
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Rendiamo io disponibile nelle route tramite app.locals
app.locals.io = io;

app.use(cors());
app.use(express.json());

// Route API
app.use('/api/ordini', ordiniRouter);
app.use('/api/menu', menuRouter);
app.use('/api/scorte', scorteRouter);
app.use('/api/stampanti', stampantiRouter);
app.use('/api/smistatore', smistatoreRouter);

// Healthcheck
app.get('/api/health', (req, res) => {
    res.json({ stato: 'ok', timestamp: new Date().toISOString() });
});

// Gestione connessioni WebSocket
io.on('connection', (socket) => {
    console.log(`Client connesso: ${socket.id}`);

    socket.on('disconnect', () => {
        console.log(`Client disconnesso: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3001;

// Aspettiamo che il database sia pronto prima di avviare il server
async function avviaServer() {
    let tentativi = 0;
    while (tentativi < 10) {
        try {
            await db.query('SELECT 1');
            console.log('Database connesso correttamente');

            // Migrazione: crea tabella voce_composizione se non esiste
            await db.query(`
                CREATE TABLE IF NOT EXISTS voce_composizione (
                    voce_aggregata_id INT NOT NULL,
                    voce_componente_id INT NOT NULL,
                    PRIMARY KEY (voce_aggregata_id, voce_componente_id),
                    FOREIGN KEY (voce_aggregata_id) REFERENCES voce(id) ON DELETE CASCADE,
                    FOREIGN KEY (voce_componente_id) REFERENCES voce(id) ON DELETE CASCADE
                )
            `);

            // Migrazione: crea tabella scorta_storico se non esiste
            await db.query(`
                CREATE TABLE IF NOT EXISTS scorta_storico (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    voce_id INT NOT NULL,
                    quantita INT NOT NULL,
                    data_rifornimento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    note VARCHAR(255),
                    FOREIGN KEY (voce_id) REFERENCES voce(id) ON DELETE CASCADE
                )
            `);

            // Migrazione: fix duplicati scorta e aggiunta vincolo UNIQUE su voce_id
            try {
                // Verifica se il vincolo UNIQUE esiste già
                const [indexes] = await db.query(
                    `SHOW INDEX FROM scorta WHERE Column_name = 'voce_id' AND Non_unique = 0`
                );
                if (indexes.length === 0) {
                    // Rimuovi righe duplicate (tieni quella con id più alto per ogni voce)
                    await db.query(`
                        DELETE s1 FROM scorta s1
                        INNER JOIN scorta s2 ON s1.voce_id = s2.voce_id AND s1.id < s2.id
                    `);
                    // Aggiungi vincolo UNIQUE
                    await db.query('ALTER TABLE scorta ADD UNIQUE KEY uk_voce_id (voce_id)');
                    console.log('Migrazione scorta: vincolo UNIQUE aggiunto su voce_id');
                }
            } catch (errMigrazione) {
                console.log('Migrazione scorta UNIQUE:', errMigrazione.message);
            }

            // Migrazione: rimappa TUTTI i colori al più vicino nella palette soft
            try {
                const PALETTE = ['#4A90D9', '#5BA85E', '#D45454', '#E8B84B', '#9370BE', '#4A4E5A'];

                function hexToRgb(hex) {
                    const h = hex.replace('#', '');
                    return [parseInt(h.substr(0,2),16), parseInt(h.substr(2,2),16), parseInt(h.substr(4,2),16)];
                }
                function distanza(a, b) {
                    return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);
                }
                function coloreVicino(hex) {
                    try {
                        const rgb = hexToRgb(hex);
                        return PALETTE.reduce((best, p) => distanza(rgb, hexToRgb(p)) < distanza(rgb, hexToRgb(best)) ? p : best);
                    } catch { return '#4A90D9'; }
                }

                const [voci] = await db.query('SELECT id, colore_tasto FROM voce');
                for (const voce of voci) {
                    const nuovo = coloreVicino(voce.colore_tasto || '#4A90D9');
                    if (nuovo !== voce.colore_tasto) {
                        await db.query('UPDATE voce SET colore_tasto = ? WHERE id = ?', [nuovo, voce.id]);
                    }
                }
                console.log('Migrazione palette: colori normalizzati');
            } catch (errMigrazione) {
                console.log('Migrazione palette:', errMigrazione.message);
            }

            // Migrazione: aggiunge colonna tempo_preparazione su voce (per lo smistatore)
            try {
                const [cols] = await db.query(
                    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'voce' AND COLUMN_NAME = 'tempo_preparazione'`
                );
                if (cols.length === 0) {
                    await db.query(`ALTER TABLE voce ADD COLUMN tempo_preparazione INT NOT NULL DEFAULT 60`);
                    console.log('Migrazione voce: colonna tempo_preparazione aggiunta');
                }
            } catch (errMigrazione) {
                console.log('Migrazione tempo_preparazione:', errMigrazione.message);
            }

            // Migrazione: nuove colonne su stampante (modello, nome, primaria, attiva)
            try {
                const colonneRichieste = [
                    { nome: 'nome', ddl: 'ADD COLUMN nome VARCHAR(50)' },
                    { nome: 'modello', ddl: "ADD COLUMN modello VARCHAR(20) NOT NULL DEFAULT 'EPSON'" },
                    { nome: 'primaria', ddl: 'ADD COLUMN primaria TINYINT(1) NOT NULL DEFAULT 1' },
                    { nome: 'attiva', ddl: 'ADD COLUMN attiva TINYINT(1) NOT NULL DEFAULT 1' },
                ];
                const [cols] = await db.query(
                    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stampante'`
                );
                const presenti = new Set(cols.map(c => c.COLUMN_NAME));
                for (const col of colonneRichieste) {
                    if (!presenti.has(col.nome)) {
                        await db.query(`ALTER TABLE stampante ${col.ddl}`);
                        console.log(`Migrazione stampante: colonna ${col.nome} aggiunta`);
                    }
                }
            } catch (errMigrazione) {
                console.log('Migrazione stampante:', errMigrazione.message);
            }

            // Migrazione: riporta le stampanti su 127.0.0.1 (emulatore locale) se sono
            // ancora puntate ai placeholder 192.168.1.x del dataset di esempio originale.
            try {
                const mapping = [
                    { reparto: 'cucina', porta: 9100, nome: 'Stampante Cucina' },
                    { reparto: 'bar', porta: 9101, nome: 'Stampante Bar' },
                    { reparto: 'griglia', porta: 9102, nome: 'Stampante Griglia' },
                ];
                for (const m of mapping) {
                    await db.query(
                        `UPDATE stampante
                         SET indirizzo_ip = '127.0.0.1', porta = ?, nome = COALESCE(nome, ?)
                         WHERE reparto = ? AND indirizzo_ip LIKE '192.168.%'`,
                        [m.porta, m.nome, m.reparto]
                    );
                }
            } catch (errMigrazione) {
                console.log('Migrazione IP stampanti:', errMigrazione.message);
            }

            // Migrazione: crea tabella stampa_eseguita (audit log delle stampe)
            try {
                await db.query(`
                    CREATE TABLE IF NOT EXISTS stampa_eseguita (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        ordine_id INT NOT NULL,
                        stampante_id INT,
                        reparto VARCHAR(50) NOT NULL,
                        payload JSON,
                        esito ENUM('ok', 'errore', 'offline_rerouted', 'no_stampante') NOT NULL,
                        errore TEXT,
                        durata_ms INT,
                        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (ordine_id) REFERENCES ordine(id) ON DELETE CASCADE,
                        FOREIGN KEY (stampante_id) REFERENCES stampante(id) ON DELETE SET NULL,
                        INDEX idx_ordine (ordine_id),
                        INDEX idx_timestamp (timestamp)
                    )
                `);
            } catch (errMigrazione) {
                console.log('Migrazione stampa_eseguita:', errMigrazione.message);
            }

            // Inizializzazione smistatore: carica stato stampanti dal DB
            try {
                const [stampanti] = await db.query('SELECT reparto, stato FROM stampante');
                for (const s of stampanti) {
                    smistatore.setStatoStampante(s.reparto, s.stato === 'offline' ? 'offline' : 'online');
                }
                console.log(`Smistatore: caricate ${stampanti.length} stampanti`);
            } catch (errInit) {
                console.log('Init smistatore:', errInit.message);
            }

            // Migrazione: inizializza scorte a 10 per tutti i prodotti
            try {
                // Aggiorna scorte esistenti a 10
                await db.query(`UPDATE scorta SET quantita = 10`);

                // Crea scorte mancanti per i prodotti che non le hanno
                await db.query(`
                    INSERT INTO scorta (voce_id, quantita, soglia_giallo, soglia_rosso, attiva)
                    SELECT id, 10, 10, 3, 1 FROM voce v
                    WHERE NOT EXISTS (SELECT 1 FROM scorta s WHERE s.voce_id = v.id)
                `);
                console.log('Migrazione scorte: tutte impostate a quantità 10');
            } catch (errMigrazione) {
                console.log('Migrazione scorte default:', errMigrazione.message);
            }

            console.log('Migrazione completata');

            break;
        } catch (err) {
            tentativi++;
            console.log(`Attesa database... tentativo ${tentativi}/10`);
            await new Promise(r => setTimeout(r, 3000));
        }
    }

    server.listen(PORT, () => {
        console.log(`Backend avviato su porta ${PORT}`);
    });
}

avviaServer();
