const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const db = require('./db');
const ordiniRouter = require('./routes/ordini');
const menuRouter = require('./routes/menu');
const scorteRouter = require('./routes/scorte');
const stampantiRouter = require('./routes/stampanti');

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
