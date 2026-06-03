# Gestionale Feste di Paese

Sistema POS per sagre e feste di paese: cassa, gestione menu e scorte, e stampa
delle comande verso i reparti. Gira tutto in Docker, quindi per provarlo basta
Docker Desktop, non serve installare Node, MariaDB o altro a mano.

Stack: React + Vite (frontend), Node.js + Express + Socket.io (backend),
MariaDB (database).

## Cosa serve

Solo Docker Desktop:

- Mac (Intel e Apple Silicon): https://docs.docker.com/desktop/install/mac-install/
- Windows: https://docs.docker.com/desktop/install/windows-install/

Su Windows durante l'installazione può chiedere di abilitare WSL 2: confermate.
Dopo aver installato, avviate Docker Desktop e aspettate che l'icona della balena
smetta di animarsi: vuol dire che è pronto.

## Avvio

Clonate il repository (o scaricate lo zip ed estraetelo), entrate nella cartella
e lanciate:

    docker compose up --build

La prima volta ci mette qualche minuto, perché scarica le immagini e installa le
dipendenze. È tutto pronto quando nel terminale compaiono queste righe:

    gestionale_backend  | Database connesso correttamente
    gestionale_backend  | Backend avviato su porta 3001

A quel punto aprite il browser:

| Pagina                | Indirizzo                          |
|-----------------------|------------------------------------|
| Cassa                 | http://localhost:5173/cassa        |
| Admin                 | http://localhost:5173/admin        |
| Simulazione stampanti | http://localhost:5173/simulazione  |
| Predittore scorte     | http://localhost:5173/predittore   |
| API backend           | http://localhost:3001/api          |

Dalla seconda volta in poi non serve più `--build`: basta `docker compose up`.

## Comandi utili

    docker compose up -d --build      # avvia in background
    docker compose down               # ferma tutto
    docker compose down -v            # ferma e azzera il database (reset completo)
    docker compose logs -f backend    # log del backend in tempo reale
    docker compose exec backend sh    # shell dentro il container backend

Dopo aver modificato il codice del backend, ricostruite solo quello:

    docker compose up -d --build backend

Il frontend invece si aggiorna da solo grazie ai volumi Docker.

## Cosa fa

**Cassa.** Si compone l'ordine con i tasti colorati divisi per settore, si
gestiscono quantità, note per porzione, sconto, asporto e l'incasso con il
tastierino. C'è anche la tabella allergeni e la cronologia degli ordini del
giorno. Le scorte si aggiornano in tempo reale via WebSocket.

**Admin.** Gestione del menu (voci singole e aggregate), dei settori, delle
stampanti e delle scorte con storico dei rifornimenti e soglie di allerta.

**Smistatore comande.** Quando si conferma un ordine, le righe vengono smistate
ai reparti di stampa bilanciando il carico: ogni comanda va al reparto più
scarico, con batching per voce e fallback tra reparti compatibili (es. le due
cucine si scambiano gli ordini in base al carico).

**Predittore scorte.** Stima per ogni voce quanto manca all'esaurimento usando i
consumi recenti e lo storico, e segnala le voci a rischio (stabile / attenzione /
urgente / esaurito) con un suggerimento sulla quantità da riordinare.

**Stampa.** Le stampanti sono emulate da piccoli server TCP locali che
interpretano i byte ESC/POS e ricostruiscono lo scontrino nella pagina di
simulazione. Il codice è già pronto per stampanti termiche reali (vedi sotto).

## Test

Due suite, senza dipendenze esterne, da lanciare col backend attivo:

    docker compose exec backend node tests/test-smistatore.js
    docker compose exec backend node tests/test-predittore.js

## Problemi comuni

**Porta 3306 occupata.** Se avete MAMP, XAMPP o MySQL già installati, potrebbero
tenere occupata la 3306. Il database qui è esposto sulla 3307, quindi di solito
non dà fastidio; se comunque va in errore, chiudete MAMP/XAMPP prima di avviare.

**Schermata nera o senza tasti.** Al primo avvio il backend potrebbe non essere
ancora pronto: aspettate qualche secondo e ricaricate la pagina.

**"address already in use" sulla 5173 o 3001.** Qualcos'altro occupa quelle
porte. Trovate il processo e chiudetelo:

    lsof -i :5173                  # Mac/Linux
    netstat -ano | findstr :5173   # Windows

**Docker non parte su Windows.** Serve la virtualizzazione abilitata nel BIOS e
WSL 2 installato; Docker Desktop guida nell'installazione di WSL 2 se manca.

## Passare a stampanti reali

Il sistema usa gli stessi byte ESC/POS sia in demo che con hardware vero, quindi
per collegare stampanti termiche fisiche bastano tre passi, senza toccare il
codice:

1. Aggiornare IP e porta nella tabella `stampante`:

       UPDATE stampante SET indirizzo_ip='192.168.1.101', porta=9100 WHERE reparto='cucina';

2. Nel `docker-compose.yml`, impostare `EMULATORE_ATTIVO: "0"`.
3. Riavviare il backend: `docker compose restart backend`.

## Database (sviluppo)

Per collegarsi con TablePlus, DBeaver o simili:

    host:     localhost
    porta:    3307
    database: gestionale_feste
    utente:   gestionale
    password: gestionale_password

Al primo avvio lo schema e i dati di esempio vengono creati da `database/init.sql`.

## Struttura del progetto

    gestionale-feste/
    ├── docker-compose.yml
    ├── database/
    │   └── init.sql              schema + dati di esempio
    ├── backend/
    │   └── src/
    │       ├── index.js          avvio Express, Socket.io e migrazioni
    │       ├── routes/           endpoint HTTP (ordini, menu, scorte, ...)
    │       ├── repositories/     accesso al database (query SQL)
    │       └── services/         logica: smistatore, predittore, stampa
    └── frontend/
        └── src/
            ├── pages/            Cassa, Admin, Simulazione, Predittore
            ├── components/       componenti riusabili
            ├── hooks/            hook condivisi
            └── api/              client per le chiamate al backend

Una nota tecnica: il proxy di Vite inoltra da solo le chiamate `/api` e
`/socket.io` al backend, perciò nel frontend non serve indicare host e porta.
