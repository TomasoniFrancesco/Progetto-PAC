# Piano di Implementazione — Predittore Dinamico di Riordino Scorte (UC5b)

**Branch:** `feature/smistatore-e-stampa` (lo stesso del lavoro Smistatore + Stampa)
**Obiettivo:** Implementare l'algoritmo predittivo che, per ogni voce attiva del menu, stima il consumo atteso (media pesata multi-finestra), calcola un indice di urgenza U e classifica la voce in 4 stati con eventuali suggerimenti di riordino.

---

## Architettura

```
┌──────────────────────────────────────────────────────┐
│                  Predittore                          │
│  ┌────────────────────────────────────────────────┐  │
│  │ 1. Raccolta dati (per ogni voce attiva)       │  │
│  │    - quantità attuale (DB scorta)             │  │
│  │    - consumi 15min/1h (DB ordine_riga)        │  │
│  │    - media storica stessa fascia oraria       │  │
│  │    - tempo riapprovvigionamento (voce)        │  │
│  │    - priorità voce (alta/media/bassa)         │  │
│  └────────────────────────────────────────────────┘  │
│                       ↓                              │
│  ┌────────────────────────────────────────────────┐  │
│  │ 2. Aggregazione consumi ingredienti condivisi │  │
│  │    (via voce_contatore esistente)             │  │
│  └────────────────────────────────────────────────┘  │
│                       ↓                              │
│  ┌────────────────────────────────────────────────┐  │
│  │ 3. Selezione modalità (normale/prudente/picco)│  │
│  └────────────────────────────────────────────────┘  │
│                       ↓                              │
│  ┌────────────────────────────────────────────────┐  │
│  │ 4. Calcolo consumo_atteso, tempo_esaurimento  │  │
│  │ 5. Calcolo indice U + moltiplicatore contesto │  │
│  │ 6. Classificazione + quantità suggerita       │  │
│  └────────────────────────────────────────────────┘  │
│                       ↓                              │
│         Lista predizioni per voce                    │
└──────────────────────────────────────────────────────┘
              ↓
   GET /api/predittore/scorte
              ↓
   Pagina /predittore (admin)
              ↓
   Polling 30s + alert sonori per "urgente"/"esaurito"
```

**Quando viene eseguito:** on-demand via HTTP (chiamato dalla pagina admin con polling). Niente cron job per non sporcare il backend.

---

## Formule (riepilogo dalla spec)

### A. Consumo atteso
```
consumo_atteso = α · consumo_15min + β · consumo_1h + γ · media_storica_fascia

normale:   α=0.5  β=0.3  γ=0.2
picco:     α=0.8  β=0.15 γ=0.05    (se consumo_15min > 2·media_storica)
prudente:  α e β normalizzati, γ=0  (se < 3 occorrenze storiche)
```

### B. Tempo esaurimento
```
tempo_esaurimento = quantita_attuale / consumo_atteso (secondi)
(se consumo_atteso ≤ 0 → +∞)
```

### C. Indice di urgenza U
```
U = max(0, tempo_riapprovvigionamento - tempo_esaurimento) · priorita_voce
+ moltiplicatore contesto se tempo_esaurimento < tempo_residuo_evento (× 1.2)
```

### D. Classificazione
| Condizione | Stato |
|---|---|
| `quantita_attuale = 0` | **esaurito** (non vendibile) |
| `U = 0` AND `stato_scorta = disponibile` | **stabile** |
| `0 < U ≤ soglia_warn` | **attenzione** |
| `U > soglia_warn` | **urgente** → suggerisci `ceil(consumo_atteso · t_riapprovvigionamento · 1.3)` |

---

## Task list

### T1 — Migrazioni schema DB
**File:** `backend/src/index.js` (sezione migrazioni), `database/init.sql`

Aggiungere alla tabella `voce`:
- `tempo_riapprovvigionamento INT NOT NULL DEFAULT 600` — secondi (10 min default)
- `priorita_voce ENUM('bassa','media','alta') NOT NULL DEFAULT 'media'` — moltiplicatore U

Indice su `ordine.timestamp` (probabilmente già implicito ma confermiamo) e su `ordine_riga.voce_id` per accelerare le query di consumo.

Nuova tabella opzionale `configurazione` per parametri runtime:
```sql
CREATE TABLE configurazione (
    chiave VARCHAR(50) PRIMARY KEY,
    valore VARCHAR(255) NOT NULL
);
```
Con righe seed:
- `evento_fine_oggi` = `23:30` (orario fine evento, formato HH:MM)
- `soglia_warn_urgenza` = `300` (sopra quale U si entra in "urgente")
- `giorni_storico` = `30`

### T2 — Service `predittore.js`
**File:** `backend/src/services/predittore.js`

Funzioni esposte:
- `eseguiPredizione()` → array di oggetti `{voce_id, nome, reparto, quantita_attuale, consumo_15min, consumo_1h, media_storica, consumo_atteso, tempo_esaurimento_s, U, stato, modalita, suggerimento}`
- `eseguiPredizionePerVoce(voce_id)` → singolo oggetto

Funzioni interne (testabili):
- `aggregaConsumo(voceId, finestraMinuti)` → SUM da `ordine_riga` su ordini confermati
- `mediaStoricaFascia(voceId, ora, giorniLookback)` → AVG su occorrenze passate stessa ora
- `calcolaPesi(consumo15, mediaStorica, storicoSufficiente)` → `{α, β, γ, modalita}`
- `consumoAtteso(consumi, pesi)` → numero (unità/secondo, vediamo se conviene normalizzare)
- `tempoEsaurimento(quantita, consumoAtteso)` → secondi o `Infinity`
- `calcolaU(tempoRiapp, tempoEsaur, priorita, tempoResiduoEvento)` → numero
- `classifica(U, quantita, stato_scorta, sogliaWarn)` → `'stabile'|'attenzione'|'urgente'|'esaurito'`
- `aggregaIngredientiCondivisi(voci)` → modifica i consumi per voci con `voce_contatore` condiviso

**Decisione unità di misura del consumo:**
La spec parla di "unità vendute negli ultimi N min", quindi è un *conteggio totale* nella finestra. Per il `tempo_esaurimento = quantita / consumo_atteso`, il `consumo_atteso` deve essere espresso come **unità per finestra di riferimento**. Per semplicità userò **unità/minuto** come tasso, derivato da:
- `consumo_15min` → tasso = somma / 15
- `consumo_1h` → tasso = somma / 60
- `media_storica` → media oraria / 60 = tasso

E `tempo_esaurimento` in **minuti**, poi convertito in secondi per il calcolo di U.

### T3 — Route `routes/predittore.js`
**File:** `backend/src/routes/predittore.js`

Endpoint:
- `GET /api/predittore/scorte` — esegue per tutte le voci attive
  - Query string `?stato=urgente,esaurito` per filtrare
  - `?reparto=cucina` per filtrare per reparto
- `GET /api/predittore/scorte/:voce_id` — dettaglio singola voce
- `GET /api/predittore/configurazione` — leggi config corrente
- `PUT /api/predittore/configurazione/:chiave` — modifica una config

Inoltre, sull'evento WebSocket: dopo ogni conferma ordine, ri-eseguire il predittore per le voci dell'ordine e, se classificate `urgente`/`esaurito`, emettere `predittore_alert` per i client.

### T4 — Integrazione bootstrap
**File:** `backend/src/index.js`

- Importare `predittoreRouter`
- Mount su `/api/predittore`
- Hook in `routes/ordini.js`: dopo `dispatcher.inviaComanda`, chiamare `predittore.eseguiPredizionePerVoce` per le voci impattate e emettere alert se necessario

### T5 — Pagina frontend `/predittore`
**File:** `frontend/src/pages/Predittore.jsx`, route in `frontend/src/main.jsx`

Layout:
- Tabella con tutte le voci, una riga per voce
- Colonne: Nome | Reparto | Qty attuale | Consumo 15min/1h | Modalità | Tempo esaurimento | U | Stato (badge colorato) | Suggerimento
- Filtri: per stato (tabs), per reparto
- Polling ogni 30s (configurabile via select)
- Badge colorati:
  - 🟢 stabile (verde)
  - 🟡 attenzione (giallo)
  - 🔴 urgente (rosso, lampeggia)
  - ⚫ esaurito (grigio scuro)
- Modalità mostrata come piccola etichetta sotto il nome ("PICCO 🔥" se attiva)
- Per voci urgenti: tasto "Rifornisci ora" che apre il pannello scorte esistente in admin con la quantità suggerita pre-compilata

### T6 — Suite di test
**File:** `backend/tests/test-predittore.js`

Test unitari:
- `calcolaPesi`: ritorna pesi giusti in modalità normale, picco, prudente
- `consumoAtteso`: applica la formula correttamente
- `tempoEsaurimento`: gestisce consumo_atteso=0 → Infinity
- `calcolaU`: 0 se tempo_esaurimento > tempo_riapp; positivo altrimenti; moltiplicato per priorita
- `classifica`: tutti e 4 i casi (esaurito, stabile, attenzione, urgente)

Test integrazione HTTP:
- `GET /predittore/scorte` ritorna array con tutte le voci attive
- Voce con scorta 0 → stato='esaurito'
- Voce con consumo recente alto + scorta bassa → stato='urgente' + suggerimento positivo
- Voce con consumo nullo → tempo_esaurimento='infinito', stato='stabile'

Tutti gli assert basati sulle costanti dell'algoritmo:
- α=0.5/0.8, β=0.3/0.15, γ=0.2/0.05
- Moltiplicatore contesto = 1.2
- Moltiplicatore quantità consigliata = 1.3
- Priorita: alta=1.5, media=1.0, bassa=0.5

---

## Strategia di commit (uno per task, raggruppabile)

| Commit | Task |
|--------|------|
| 1 | T1 — Migrazioni DB + configurazione |
| 2 | T2 — Service predittore |
| 3 | T3 — Router HTTP |
| 4 | T4 — Hook integrazione ordini |
| 5 | T5 — Pagina frontend Predittore |
| 6 | T6 — Test suite |

---

## Cosa NON è in questo piano (rimandato)

- UI per configurare priorità per voce (per ora si imposta via API o SQL diretto)
- Notifiche sonore/push per alert (solo badge visivo)
- Auto-suggerimento di azioni a cucina/magazzino (solo "quantità consigliata")
- Storico delle predizioni (snapshot per audit)
- Grafici trend consumo (è un nice-to-have, non in MVP)

---

## Dipendenze tra Smistatore e Predittore

Sono **due algoritmi indipendenti** che leggono entrambi le stesse tabelle (`ordine`, `ordine_riga`, `scorta`, `voce`). Possono coesistere senza conflitti:
- Smistatore: usa `voce.settore_stampa`, `voce.modalita_stampa`, `voce.tempo_preparazione`
- Predittore: usa `voce.tempo_riapprovvigionamento` (nuovo), `voce.priorita_voce` (nuovo)

Punto di intersezione: dopo `smistatore.routeOrder` + `dispatcher.inviaComanda`, vogliamo che il predittore aggiorni le stime per le voci coinvolte (T4).
