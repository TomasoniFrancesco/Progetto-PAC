<div align="center">
  <img src="logo.png" alt="Gestionale Feste di Paese" width="220" />

  # Gestionale Feste di Paese

  Sistema POS per sagre e feste di paese: cassa, gestione menu e scorte,
  predittore di esaurimento e stampa delle comande verso i reparti.
</div>

---

## Descrizione

Applicazione web per gestire la cassa di una sagra o festa di paese, pensata
per girare interamente in Docker: basta Docker Desktop, niente da installare a
mano. Composizione ordini per settore, scorte aggiornate in tempo reale via
WebSocket, smistamento automatico delle comande ai reparti di stampa e
previsione delle scorte in esaurimento.

**Stack:** React + Vite (frontend) · Node.js + Express + Socket.io (backend) · MariaDB (database). Tutto containerizzato con Docker.

## Funzionalità

- **Cassa** — composizione ordini con tasti per settore, quantità, note, sconto, asporto e incasso con tastierino; tabella allergeni e scorte in tempo reale.
- **Admin** — gestione menu, settori, stampanti e scorte con storico rifornimenti e soglie di allerta.
- **Smistatore comande** — distribuisce le righe ai reparti di stampa bilanciando il carico, con batching e fallback tra reparti compatibili.
- **Predittore scorte** — stima quanto manca all'esaurimento di ogni voce e segnala quelle a rischio con un suggerimento di riordino.
- **Stampa** — stampanti emulate via ESC/POS in demo, già pronte per stampanti termiche reali.

## Come avviarlo

Serve solo **Docker Desktop**. Dalla cartella del progetto:

```bash
cd CODE/gestionale-feste
docker compose up --build
```

La prima volta impiega qualche minuto. È pronto quando nel terminale compare:

```
gestionale_backend  | Backend avviato su porta 3001
```

Poi apri il browser:

| Pagina   | Indirizzo                     |
|----------|-------------------------------|
| Cassa    | http://localhost:5173/cassa   |
| Admin    | http://localhost:5173/admin   |
| API      | http://localhost:3001/api/health |

Dalla seconda volta basta `docker compose up` (senza `--build`).

## Comandi utili

```bash
docker compose up -d --build      # avvia in background
docker compose down               # ferma tutto
docker compose down -v            # ferma e azzera il database (reset completo)
docker compose logs -f backend    # log del backend in tempo reale
docker compose exec backend npm test   # esegue i test
```

## Struttura del progetto

```
Progetto-PAC/
├── logo.png
├── README.md
└── CODE/
    └── gestionale-feste/
        ├── docker-compose.yml
        ├── database/   schema + dati di esempio
        ├── backend/    Express, Socket.io, smistatore e predittore
        └── frontend/   React: Cassa, Admin, Simulazione, Predittore
```

## Documentazione

Guida completa (test, coverage, stampanti reali, troubleshooting, struttura)
in [`CODE/gestionale-feste/README.md`](CODE/gestionale-feste/README.md).
