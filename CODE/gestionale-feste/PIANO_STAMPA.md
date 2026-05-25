# Piano di Implementazione — Sistema di Stampa con Emulatore TCP ESC/POS

**Branch:** `feature/smistatore-e-stampa`
**Obiettivo:** Collegare lo Smistatore (già implementato) a un sistema di stampa che funzioni **identicamente** in due modalità:
1. **Demo / sviluppo locale** — stampanti emulate via TCP su `127.0.0.1`, scontrini renderizzati in una pagina browser
2. **Produzione con hardware** — stampanti termiche reali, raggiunte via TCP sulla rete locale

Il passaggio da modalità 1 a modalità 2 deve richiedere **solo modifiche di configurazione** (IP nel DB), zero modifiche al codice.

---

## Principio architetturale: Ports & Adapters

```
                          ┌──────────────────────┐
                          │      Smistatore      │  (già fatto)
                          │  - routing greedy    │
                          │  - ranking P         │
                          │  - batching          │
                          └──────────┬───────────┘
                                     │ Comanda (JSON)
                                     ▼
                          ┌──────────────────────┐
                          │      Formatter       │
                          │  Comanda → bytes     │
                          │  ESC/POS standard    │
                          └──────────┬───────────┘
                                     │ Buffer
                                     ▼
                          ┌──────────────────────┐
                          │       Transport      │
                          │  TCP socket raw      │
                          │  (net.connect)       │
                          └──────────┬───────────┘
                                     │
                ┌────────────────────┼────────────────────┐
                ▼                    ▼                    ▼
       ┌───────────────┐    ┌───────────────┐    ┌───────────────┐
       │ Emulatore TCP │    │ Emulatore TCP │    │ Emulatore TCP │
       │   127.0.0.1   │    │   127.0.0.1   │    │   127.0.0.1   │
       │     :9100     │    │     :9101     │    │     :9102     │
       │   "cucina"    │    │     "bar"     │    │   "griglia"   │
       └───────┬───────┘    └───────┬───────┘    └───────┬───────┘
               │ parser ESC/POS     │ parser ESC/POS     │ parser ESC/POS
               └────────────────────┼────────────────────┘
                                    │ WebSocket: "stampa_renderizzata"
                                    ▼
                          ┌──────────────────────┐
                          │  Pagina Simulazione  │
                          │  /simulazione        │
                          │                      │
                          │  ┌────┐ ┌────┐ ┌────┐│
                          │  │cuci│ │bar │ │gri ││
                          │  │na  │ │    │ │glia││
                          │  │    │ │    │ │    ││
                          │  └────┘ └────┘ └────┘│
                          └──────────────────────┘
```

**Punto chiave:** Formatter e Transport sono identici tra demo e produzione. In produzione gli emulatori si spengono e il Transport si collega agli IP delle stampanti reali. Tutto il resto resta invariato.

---

## Task list (in ordine di esecuzione)

### T1 — Dipendenza npm
**File:** `backend/package.json`
- Aggiungere `node-thermal-printer` (v4.x) come dipendenza
- `docker compose build backend` per installarla

### T2 — Migrazioni schema DB
**File:** `backend/src/index.js` (sezione migrazioni), `database/init.sql` (per fresh install)

#### T2.1 — Aggiornare tabella `stampante`
Aggiungere colonne:
- `modello VARCHAR(20) NOT NULL DEFAULT 'EPSON'` — usato dal formatter per generare byte ESC/POS corretti (Epson/Star/Custom hanno piccole varianti)
- `nome VARCHAR(50)` — etichetta per UI (es. "Stampante Cucina Sala")
- `attiva TINYINT(1) NOT NULL DEFAULT 1` — flag per disabilitare temporaneamente
- `primaria TINYINT(1) NOT NULL DEFAULT 1` — se più stampanti condividono lo stesso reparto, solo le primarie stampano (le altre sono backup)

Aggiornare i 3 record esistenti:
- `cucina` → `127.0.0.1:9100`
- `bar` → `127.0.0.1:9101`
- `griglia` → `127.0.0.1:9102`

#### T2.2 — Nuova tabella `stampa_eseguita` (audit log)
```sql
CREATE TABLE stampa_eseguita (
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
    FOREIGN KEY (stampante_id) REFERENCES stampante(id) ON DELETE SET NULL
);
```

### T3 — Formatter ESC/POS
**File:** `backend/src/services/formatter.js`

Funzioni:
- `formattaComanda(comanda, opzioni)` → `Buffer` di byte ESC/POS

Logica:
- Usa `node-thermal-printer` per costruire il payload
- Se `comanda.asporto === true`: titolo grande centrato "ASPORTO" in cima
- Intestazione: `Ordine #N` + ora + reparto
- Righe: `Nx Nome pietanza`
- Note: indentate sotto la riga, prefisso `>`
- Voci con `asportabile=0` (futura estensione) separate da `─── NON ASPORTO ───`
- Footer: linea + taglio carta
- Code page CP858 per accentate italiane

Funzione separata `pagineDaInviare(comanda, modalita_stampa)`:
- `singola_multipla` → 1 buffer
- `singola_singola` → N buffer (uno per porzione)
- `doppia_copia` → 2 buffer identici

### T4 — Printer Dispatcher
**File:** `backend/src/services/printer-dispatcher.js`

Funzioni esposte:
- `inviaComanda(comanda)` → orchestra il flusso, non lancia (logga e basta)
- `stampaTestPage(stampante_id)` → utile per debug
- `stato()` → snapshot delle stampanti note + ultimi errori

Logica per ogni comanda:
1. Risolve stampante primaria del reparto: `SELECT * FROM stampante WHERE reparto=? AND primaria=1 AND attiva=1 LIMIT 1`
2. Se nessuna trovata: logga `esito='no_stampante'` in `stampa_eseguita`, emette WS `stampa_fallita`, esce
3. Chiama `formatter.formattaComanda` → ottiene buffer ESC/POS
4. Apre socket TCP a `ip:porta`, scrive il buffer, chiude. Timeout 5s.
5. **Successo:** logga `esito='ok'` con `durata_ms`, emette WS `comanda_stampata`
6. **Errore TCP** (ECONNREFUSED / timeout):
   - Marca stampante offline nel DB e nello smistatore
   - Se reparto ha fallback configurato → ritenta su quel reparto (max 1 hop)
   - Se fallisce anche il fallback → logga `esito='errore'`, emette WS `stampa_fallita` con dettagli
7. Tutto l'I/O del dispatcher è fire-and-forget: non blocca mai la risposta della cassa

### T5 — Emulatore TCP ESC/POS
**File:** `backend/src/services/escpos-emulator.js`

#### Avvio
All'avvio del backend, leggere tutte le stampanti dal DB. Per ogni stampante con `indirizzo_ip='127.0.0.1'` aprire un `net.createServer()` sulla sua porta.
Controllabile via env var `EMULATORE_ATTIVO=1` (default `1`).

#### Per ogni connessione TCP entrante
1. Accumula i byte ricevuti in un buffer
2. Quando vede il comando taglio (`\x1d\x56\xNN`) o quando la connessione si chiude → flusha
3. Parser sequenziale:
   - `\x1b\x40` reset → resetta stato
   - `\x1b\x61\x00/01/02` align left/center/right
   - `\x1b\x21\x30` font grande (double height + width)
   - `\x1b\x21\x10/20` double height / double width
   - `\x1b\x21\x00` font normale
   - `\x1b\x45\x00/01` bold off/on
   - `\x1d\x21\xNN` set char size (decodifica nibble alto/basso)
   - `\x1d\x56\xNN` taglio carta → emit
   - `\x0a` newline → flush riga
   - Altri byte stampabili → testo
4. Costruisce una struttura JSON tipo:
```js
{
    stampante_id: 1,
    reparto: 'cucina',
    timestamp: 1234567890,
    righe: [
        { testo: 'ASPORTO', allineamento: 'center', stile: ['big','bold'] },
        { testo: 'Ordine #5  14:32', allineamento: 'left', stile: [] },
        { testo: '─────────────────', allineamento: 'left', stile: [] },
        { testo: '3x Patatine fritte', allineamento: 'left', stile: [] },
        ...
    ]
}
```
5. Emit via WS `stampa_renderizzata` con questa struttura

#### Decoding code page
Decodificare i byte testo come CP858 → UTF-8 per gestire `à è é ò ù €` correttamente. Usare `iconv-lite`.

#### Controllo stato (per simulare guasti)
Esporre funzioni:
- `spegniStampante(stampante_id)` → chiude il server TCP, le prossime `connect()` falliranno con ECONNREFUSED
- `accendiStampante(stampante_id)` → riavvia il server

Questo permette di **simulare guasti** dal frontend (un tasto "Spegni" su ogni colonna della simulazione).

### T6 — Router API stampe
**File:** `backend/src/routes/stampe.js`

- `GET /api/stampe?ordine_id=N` — storico stampe di un ordine
- `GET /api/stampe/recenti?limit=50` — ultime stampe
- `POST /api/stampe/:id/ristampa` — invio manuale di una stampa fallita
- `POST /api/stampanti/:id/test` — pagina test (chiama `dispatcher.stampaTestPage`)
- `POST /api/emulatore/:stampante_id/spegni` — spegne emulatore (per simulare guasto)
- `POST /api/emulatore/:stampante_id/accendi` — riaccende emulatore

### T7 — Integrazione nello smistatore + ordini
**File:** `backend/src/routes/ordini.js`, `backend/src/index.js`

In `index.js`:
- Importare e avviare l'emulatore dopo aver connesso al DB
- Importare il dispatcher
- Montare il router `stampe`

In `ordini.js`/`conferma`:
- Dopo `smistatore.routeOrder`, per ogni comanda chiamare `dispatcher.inviaComanda(comanda)` in fire-and-forget
- L'emit WS `comanda_nuova` resta (lo smistatore lo fa già) — non lo tocchiamo

### T8 — Pagina Simulazione frontend
**File:** `frontend/src/pages/Simulazione.jsx`, route in `frontend/src/main.jsx`

#### Layout
Griglia orizzontale con N colonne, una per ogni stampante presente nel DB. Caricamento iniziale: `GET /api/stampanti`.

Ogni colonna mostra:
- Header: nome stampante, reparto, IP:porta, badge stato (verde/rosso)
- Tasto "Spegni" / "Accendi" (chiama API emulatore)
- Tasto "Test" (chiama API test page)
- Lista scontrini in arrivo, dal più recente in cima

#### Scontrino renderizzato
Stile carta termica: sfondo bianco, font monospace, larghezza fissa ~280px. Per ogni riga:
- Applica `text-align` dalla struttura
- Applica stile (grande/bold/double width) come CSS

Tra uno scontrino e l'altro, una linea tratteggiata con icona forbice (✂) per simulare il taglio carta.

Auto-scroll quando arriva nuovo scontrino. Limite 20 scontrini per colonna (poi FIFO).

#### Eventi WS in ascolto
- `stampa_renderizzata` → aggiungi card scontrino alla colonna corrispondente
- `stampante_offline` → cambia badge a rosso
- `stampante_online` → cambia badge a verde

### T9 — Test end-to-end
Procedura manuale:
1. `docker compose build backend && docker compose up -d`
2. Aprire 2 tab: `/` (cassa) e `/simulazione`
3. Confermare un ordine misto → vedere 3 scontrini apparire nelle 3 colonne
4. Cliccare "Spegni" su cucina nella simulazione
5. Configurare fallback cucina→griglia via curl
6. Confermare un altro ordine cucina → scontrino appare in colonna griglia
7. Verificare `GET /api/stampe?ordine_id=X` ritorna l'audit log corretto

---

## Cosa NON è in questo piano

- Voci `asportabile=0` e relativi separatori (è una feature del TODO sez. 6 — facciamo dopo se serve)
- `copia_scontrino_cliente` (TODO sez. 5 — dopo)
- UI admin per gestire stampanti (configurazione via DB diretto / docker exec per ora)
- Persistenza code smistatore (in-memory è ok per la demo)
- Auto-reconnect quando stampante torna online (manuale via API)

Questi punti restano nel TODO.md originale e si potranno fare separatamente in commit successivi.

---

## Mapping demo → produzione

Per il giorno in cui collegherai stampanti vere:

1. Spegni gli emulatori: `EMULATORE_ATTIVO=0` in `docker-compose.yml`
2. Aggiorna gli IP nel DB:
   ```sql
   UPDATE stampante SET indirizzo_ip='192.168.1.101', porta=9100 WHERE reparto='cucina';
   UPDATE stampante SET indirizzo_ip='192.168.1.102', porta=9100 WHERE reparto='bar';
   UPDATE stampante SET indirizzo_ip='192.168.1.103', porta=9100 WHERE reparto='griglia';
   ```
3. Riavvia: `docker compose restart backend`
4. Test stampa da `POST /api/stampanti/:id/test` → carta esce dalla stampante fisica

Il codice non cambia di una riga.

---

## Strategia di commit

Un commit per ogni task T1-T9 (eventualmente raggruppando T3+T4, T5+T6, T7+T8 se sono piccoli). Messaggi in italiano, descrittivi.

PR finale: `feature/smistatore-e-stampa` → `main` con descrizione completa.
