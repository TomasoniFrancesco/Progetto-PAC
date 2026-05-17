# Gestionale Feste di Paese

Sistema POS per la gestione di feste di paese e sagre locali, con due algoritmi
intelligenti per il routing dinamico delle comande e la previsione delle scorte.

## Stack

- Frontend: React + Vite + Socket.io client
- Backend: Node.js + Express + Socket.io + node-thermal-printer
- Database: MariaDB
- Infrastruttura: Docker + Docker Compose

## Prerequisiti

Installare Docker Desktop sul proprio sistema:
- Mac (Intel e Apple Silicon): https://docs.docker.com/desktop/install/mac-install/
- Windows: https://docs.docker.com/desktop/install/windows-install/

Docker Desktop include gia Docker Compose. Non serve installare nient'altro.

## Avvio

Clonare il repository, entrare nella cartella e lanciare:

    docker compose up --build

La prima volta l'avvio richiede qualche minuto perche Docker scarica le immagini
e installa le dipendenze npm.

A regime i quattro pagine principali saranno accessibili a:

| Pagina               | URL                                  |
|----------------------|--------------------------------------|
| Cassa                | http://localhost:5173/cassa          |
| Admin                | http://localhost:5173/admin          |
| Simulazione stampanti| http://localhost:5173/simulazione    |
| Predittore scorte    | http://localhost:5173/predittore     |
| API backend          | http://localhost:3001/api            |

## Funzionalità implementate

### Operative (cassa e magazzino)
- Componi ordine con tasti colorati per pietanza, divisi per settore
- Modifica quantità/note per porzione, scontistica, asporto, tastierino numerico
- Tabella allergeni per ogni voce nell'ordine corrente
- Cronologia ordini del giorno
- Admin: CRUD voci di menu (singole e aggregate), gestione settori, gestione
  stampanti, gestione scorte con storico rifornimenti e soglie
- Aggiornamento scorte in tempo reale via WebSocket

### Algoritmo 1 — Smistatore Intelligente Multi-Reparto
Bilanciamento dinamico del carico operativo verso i reparti di stampa.
- Calcolo del carico per reparto: `n_task × t_prep × α_stress × β_stampante`
- Selezione greedy del reparto a minor carico con tie-break su last-task
  timestamp
- Ranking della priorità di lavorazione P:
  `A·t_attesa + B·π_asporto + C·s − D·carico − E·rischio_scorte`
- Batching per voce nella stessa finestra temporale
- Fallback bidirezionale tra reparti compatibili (es. `cucina ↔ cucina_2`)
- Generazione e instradamento di una comanda per reparto coinvolto
- Service: [backend/src/services/smistatore.js](backend/src/services/smistatore.js)
- API: `GET /api/smistatore/stato`, `POST /api/smistatore/completa`,
  `PUT /api/smistatore/fallback/:reparto`

### Algoritmo 2 — Predittore Dinamico di Riordino Scorte
Stima il rischio di esaurimento per ogni voce attiva del menu.
- Consumo atteso come media pesata: `α·c_15min + β·c_1h + γ·media_storica`
- Tre modalità auto-selezionate:
  - **Normale** (α=0.5, β=0.3, γ=0.2) in condizioni standard
  - **Picco** (α=0.8, β=0.15, γ=0.05) se consumo recente > 2× media storica
  - **Prudente** (γ=0) se mancano dati storici sufficienti (<3 occorrenze)
- Tempo di esaurimento = quantità / consumo atteso (∞ se consumo nullo)
- Indice di urgenza:
  `U = max(0, t_riapp − t_esaur) × priorità × moltiplicatore_contesto`
- Classificazione in 4 stati: stabile / attenzione / urgente / esaurito
- Suggerimento di quantità da riordinare per le voci urgenti
- Aggregazione consumi per ingredienti condivisi (es. polenta)
- Alert WebSocket real-time post-conferma ordine
- Service: [backend/src/services/predittore.js](backend/src/services/predittore.js)
- API: `GET /api/predittore/scorte`, `GET /api/predittore/scorte/:voce_id`,
  `GET /api/predittore/configurazione`

### Stampa scontrini con emulatore TCP ESC/POS
Sistema di stampa "pronto per hardware reale". In modalità demo, ogni
"stampante" è un server TCP locale che parsa i byte ESC/POS inviati dal
dispatcher e ricostruisce uno scontrino visivamente fedele su `/simulazione`.
Il giorno della migrazione a stampanti termiche fisiche basta aggiornare
gli `indirizzo_ip` nella tabella `stampante` e impostare `EMULATORE_ATTIVO=0`:
zero modifiche al codice.

- Formatter ESC/POS: [backend/src/services/formatter.js](backend/src/services/formatter.js)
- Dispatcher: [backend/src/services/printer-dispatcher.js](backend/src/services/printer-dispatcher.js)
- Emulatore TCP: [backend/src/services/escpos-emulator.js](backend/src/services/escpos-emulator.js)
- Audit completo: `GET /api/stampe?ordine_id=N`
- Test pagina e controllo on/off da UI di simulazione

## Test

Due suite di test (53 assertion totali, zero dipendenze esterne):

    # Smistatore (23 test)
    docker exec gestionale_backend node tests/test-smistatore.js

    # Predittore (30 test)
    docker exec gestionale_backend node tests/test-predittore.js

Coprono formule numeriche, casi limite, routing greedy con fallback,
batching, classificazione 4-stati, modalità picco/prudente, integrazione
HTTP end-to-end.

## Struttura del progetto

    gestionale-feste/
    ├── docker-compose.yml
    ├── PIANO_STAMPA.md            piano implementazione stampa ESC/POS
    ├── PIANO_PREDITTORE.md        piano implementazione predittore scorte
    ├── database/
    │   └── init.sql               schema completo + seed
    ├── backend/
    │   ├── Dockerfile
    │   ├── package.json
    │   ├── src/
    │   │   ├── index.js           bootstrap Express + Socket.io + migrazioni
    │   │   ├── db.js              connessione MariaDB
    │   │   ├── routes/
    │   │   │   ├── ordini.js
    │   │   │   ├── menu.js
    │   │   │   ├── scorte.js
    │   │   │   ├── stampanti.js
    │   │   │   ├── smistatore.js  endpoint stato/fallback/completa
    │   │   │   ├── stampe.js      audit log + controllo emulatori
    │   │   │   └── predittore.js  endpoint predizioni + configurazione
    │   │   └── services/
    │   │       ├── smistatore.js          algoritmo routing
    │   │       ├── printer-dispatcher.js  orchestratore stampa
    │   │       ├── escpos-emulator.js     server TCP per demo
    │   │       ├── formatter.js           ESC/POS buffer generator
    │   │       └── predittore.js          algoritmo predizione scorte
    │   └── tests/
    │       ├── test-smistatore.js
    │       └── test-predittore.js
    └── frontend/
        ├── Dockerfile
        ├── package.json
        ├── vite.config.js
        ├── index.html
        └── src/
            ├── main.jsx
            ├── index.css
            └── pages/
                ├── Cassa.jsx
                ├── Admin.jsx
                ├── Simulazione.jsx
                └── Predittore.jsx

## Comandi utili

Avviare in background:

    docker compose up -d --build

Fermare tutto:

    docker compose down

Fermare e cancellare anche il database (reset completo):

    docker compose down -v

Vedere i log del backend in tempo reale:

    docker compose logs -f backend

Aprire una shell nel container backend (per debug):

    docker compose exec backend sh

## Migrazione da emulatore TCP a stampanti reali

Quando si collegheranno stampanti termiche ESC/POS fisiche:

1. Aggiornare gli IP nella tabella `stampante`:

       UPDATE stampante SET indirizzo_ip='192.168.1.101', porta=9100 WHERE reparto='cucina';

2. Impostare in `docker-compose.yml`:

       EMULATORE_ATTIVO: "0"

3. Riavviare: `docker compose restart backend`

Il dispatcher userà gli stessi byte ESC/POS già verificati in demo. Nessuna
modifica al codice di business.

## Credenziali database di sviluppo

    host:     localhost:3306
    database: gestionale_feste
    user:     gestionale
    password: gestionale_password

## Note di sviluppo

Il proxy Vite (vite.config.js) redirige automaticamente le chiamate /api
e /socket.io al backend, quindi non serve specificare host e porta
nelle fetch del frontend.

Le modifiche ai file di frontend sono riflesse in tempo reale grazie ai volumi
Docker. Per il backend, dopo modifiche al codice, rieseguire:

    docker compose up -d --build backend
