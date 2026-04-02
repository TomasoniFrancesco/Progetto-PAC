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
