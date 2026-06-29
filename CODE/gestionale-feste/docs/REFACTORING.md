# Refactoring — Sintesi

Rifattorizzazione guidata da metriche (ESLint *complexity*, madge, analisi SLOC/AST),
con comportamento **preservato e verificato** (suite di test backend 23/23 + 30/30 in
Docker; build Vite del frontend verde). Confronto **Prima/Dopo** nei grafici in
[`docs/metrics/comparison/`](metrics/comparison/dashboard.html).

## Cosa è stato fatto

- **Disaccoppiamento dati (backend).** La SQL inline nei route handler è stata spostata
  in un layer **Repository** (`backend/src/repositories/`), con un unico confine di
  accesso al DB. I servizi e le route non toccano più direttamente il pool.
- **Façade del sottosistema di stampa.** La catena `smistatore → formatter →
  printer-dispatcher → escpos` è incapsulata in `services/stampa/`; le route dipendono
  solo dalla façade.
- **Riduzione complessità (backend).** Il parser ESC/POS `parsaFlusso` è stato riscritto
  con una *dispatch table* (CC 51→11); `eseguiPredizione` scomposto in funzioni pure
  (`valutaVoce`, `derivaStatoVisivo`).
- **Scomposizione UI (frontend).** I due "God Component" `Admin.jsx` (1489 righe) e
  `Cassa.jsx` (742) sono stati divisi in ~20 componenti/hook a responsabilità singola,
  con client API centralizzato (`src/api/client.js`) e validazione/payload estratti.

## Risultati (Prima → Dopo)

| Metrica | Prima | Dopo |
|---|---:|---:|
| Funzioni con complessità ciclomatica > 15 | 11 | **5** |
| Complessità ciclomatica massima | 55 | **37** |
| `Ca(db.js)` — moduli accoppiati al DB | 10 | **2** |
| Dipendenze circolari | 0 | **0** |
| Modulo più grande (SLOC) | 1328 | **331** |
| Numero di moduli (responsabilità singola) | 19 | **50** |

> **Nota sulla coesione.** La metrica LCOM (coesione di classe) non è significativa su
> codice funzionale/React (risulta piatta, 1,45 → 1,45). La coesione è quindi
> rappresentata dalla **decomposizione dei moduli** (file più piccoli, una responsabilità
> ciascuno).

## Grafici

- [01-complessita.svg](metrics/comparison/01-complessita.svg) — complessità delle funzioni critiche
- [02-accoppiamento.svg](metrics/comparison/02-accoppiamento.svg) — accoppiamento al DB e fan-out
- [03-coesione.svg](metrics/comparison/03-coesione.svg) — dimensione dei moduli
