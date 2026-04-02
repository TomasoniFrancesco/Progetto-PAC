GESTIONALE FESTE DI PAESE
Guida all'installazione e avvio
===============================

PREREQUISITI
------------

Installare Docker Desktop sul proprio computer.

Mac (Intel e Apple Silicon):
  https://docs.docker.com/desktop/install/mac-install/

Windows:
  https://docs.docker.com/desktop/install/windows-install/

Durante l'installazione su Windows potrebbe chiedere di abilitare WSL 2,
confermate pure. Docker Desktop include gia tutto il necessario, non serve
installare altro.

Dopo l'installazione avviate Docker Desktop e aspettate che l'icona della
balena nella barra di sistema diventi stabile (non animata). Significa che
Docker e pronto.


OTTENERE IL CODICE
------------------

Quando il repository sara su GitHub, clonate il progetto con:

  git clone https://github.com/NOMEUTENTE/gestionale-feste.git

Oppure scaricate lo zip da GitHub e estraetelo.

Poi entrate nella cartella:

  cd gestionale-feste


AVVIO
-----

La prima volta lanciate:

  docker compose up --build

Docker scarichera le immagini necessarie (Node.js e MariaDB) e installera
tutte le dipendenze. Ci vogliono circa 3-5 minuti dipende dalla connessione.

Sapete che e tutto pronto quando nel terminale vedete queste righe:

  gestionale_backend  | Database connesso correttamente
  gestionale_backend  | Backend avviato su porta 3001

A quel punto aprite il browser e andate su:

  Cassa:   http://localhost:5173/cassa
  Admin:   http://localhost:5173/admin
  API:     http://localhost:3001/api/health


DALLA SECONDA VOLTA IN POI
--------------------------

Non serve piu il --build, basta:

  docker compose up

Per fermare tutto: CTRL+C nel terminale dove gira Docker, oppure da un
altro terminale:

  docker compose down


RESET COMPLETO DEL DATABASE
----------------------------

Se volete ripartire da zero cancellando tutti i dati:

  docker compose down -v
  docker compose up --build

Il -v cancella il volume del database. Al riavvio vengono ricreate le
tabelle e i dati di esempio dall'init.sql.


PROBLEMI COMUNI
---------------

Porta 3306 occupata
  Se avete MAMP, XAMPP o MySQL installato sul computer, la porta 3306
  potrebbe essere occupata. Nel docker-compose.yml la porta del database
  e gia mappata su 3307 verso l'esterno quindi non dovrebbe dare problemi.
  Se comunque da errore, chiudete MAMP/XAMPP prima di avviare Docker.

Schermata nera senza tasti
  Aspettate qualche secondo e ricaricate la pagina. Il backend potrebbe
  non essere ancora completamente pronto al primo avvio.

Errore "address already in use" su porta 5173 o 3001
  Qualche altro processo occupa quelle porte. Trovate il processo con:
    Mac/Linux:  lsof -i :5173
    Windows:    netstat -ano | findstr :5173
  E terminate il processo con il PID trovato.

Docker Desktop non parte su Windows
  Assicuratevi che la virtualizzazione sia abilitata nel BIOS e che WSL 2
  sia installato. Docker Desktop vi guida nell'installazione di WSL 2 se
  mancante.


STRUTTURA DEL PROGETTO
-----------------------

  gestionale-feste/
  |
  +-- docker-compose.yml       orchestrazione dei container
  |
  +-- database/
  |   +-- Dockerfile
  |   +-- init.sql             schema del database e dati di esempio
  |
  +-- backend/
  |   +-- Dockerfile
  |   +-- package.json
  |   +-- src/
  |       +-- index.js         entry point Express + Socket.io
  |       +-- db.js            connessione MariaDB
  |       +-- routes/
  |           +-- ordini.js
  |           +-- menu.js
  |           +-- scorte.js
  |           +-- stampanti.js
  |
  +-- frontend/
      +-- Dockerfile
      +-- package.json
      +-- vite.config.js
      +-- src/
          +-- main.jsx
          +-- pages/
              +-- Cassa.jsx
              +-- Admin.jsx


CREDENZIALI DATABASE (solo per sviluppo)
-----------------------------------------

  Host:     localhost:3307
  Database: gestionale_feste
  Utente:   gestionale
  Password: gestionale_password

Per connettersi con TablePlus, DBeaver o simili usate queste credenziali
e host localhost porta 3307.


NOTE
----

Ogni modifica al codice richiede un rebuild per essere applicata:

  docker compose down
  docker compose up --build

I log in tempo reale si vedono con:

  docker compose logs -f backend
  docker compose logs -f frontend
  docker compose logs -f database