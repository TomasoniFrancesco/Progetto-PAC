# Gestionale Feste di Paese

Sistema POS per la gestione di feste di paese e sagre locali.

## Stack

- Frontend: React + Vite + Socket.io client
- Backend: Node.js + Express + Socket.io
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

A regime i tre servizi saranno accessibili a:

| Servizio   | URL                       |
|------------|---------------------------|
| Cassa      | http://localhost:5173/cassa |
| Admin      | http://localhost:5173/admin |
| API backend| http://localhost:3001/api  |
| API ordini | http://localhost:3001/api/ordini  |
## Struttura del progetto

    gestionale-feste/
    ├── docker-compose.yml
    ├── database/
    │   └── init.sql          schema + dati di esempio
    ├── backend/
    │   ├── Dockerfile
    │   ├── package.json
    │   └── src/
    │       ├── index.js      entry point Express + Socket.io
    │       ├── db.js         connessione MariaDB
    │       └── routes/
    │           ├── ordini.js
    │           ├── menu.js
    │           ├── scorte.js
    │           └── stampanti.js
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
                └── Admin.jsx

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

## Credenziali database di sviluppo

    host:     localhost:3306
    database: gestionale_feste
    user:     gestionale
    password: gestionale_password

## Note di sviluppo

Il proxy Vite (vite.config.js) redirige automaticamente le chiamate /api
e /socket.io al backend, quindi non serve specificare host e porta
nelle fetch del frontend.

Le modifiche ai file di backend e frontend sono riflesse in tempo reale
grazie ai volumi Docker configurati nel docker-compose.yml.


