# Metriche Pre-Refactoring — Baseline

Questa cartella contiene gli artefatti **grezzi** prodotti dai tool di analisi
statica, usati come base oggettiva per `refactoring-plan.md` (root del progetto).
Data di generazione: **2026-06-01**. Nessun file sorgente è stato modificato.

## Tool eseguiti

| Tool | Versione | Scopo | Comando |
|------|----------|-------|---------|
| es6-plato | 1.2.3 | Manutenibilità (MI), Halstead, SLOC | `npx es6-plato -r -d <out> <src>` |
| madge | 8.0.0 | Coupling + dipendenze circolari | `npx madge --circular / --json <src>` |
| eslint (`complexity`) | 8.57.1 | Complessità ciclomatica per funzione | `eslint --rule complexity:[warn,0]` |

## Artefatti

| File / cartella | Contenuto |
|-----------------|-----------|
| `plato-backend/index.html` | Dashboard HTML Plato (backend) — apri nel browser |
| `plato-frontend/index.html` | Dashboard HTML Plato (frontend) |
| `plato-*/report.json` | Dati MI/complessità in JSON |
| `coupling-backend.json` | Grafo dipendenze `madge --json` (backend) |
| `coupling-frontend.json` | Grafo dipendenze `madge --json` (frontend) |
| `eslint-complexity.json` | CC per ogni funzione (output `eslint -f json`) |
| `.eslintrc.complexity.json` | Config usata per la misura della complessità |

## ⚠️ Limiti noti della misurazione (lette con onestà)

1. **Graphviz non installato** sul sistema (`dot` assente): l'SVG richiesto per
   madge non è generabile, quindi il coupling è stato estratto in **JSON**
   (`coupling-*.json`), che contiene gli stessi dati del grafo.

2. **Parser di Plato obsoleto (babylon)**: non comprende la sintassi JS moderna
   (optional chaining `?.`, separatori numerici) né JSX. Di conseguenza Plato ha
   **saltato i file più grandi e critici**:
   - Backend non analizzati da Plato: `index.js`, `services/predittore.js`,
     `services/escpos-emulator.js`, `services/printer-dispatcher.js`,
     `services/smistatore.js` (8 file su 13 analizzati).
   - Frontend: solo `main.jsx` è stato analizzato; **tutte e 4 le pagine JSX**
     (`Admin`, `Cassa`, `Predittore`, `Simulazione`) sono state saltate.

   Per **colmare questo buco** è stato eseguito ESLint con la regola
   `complexity` (lo stesso motore che Plato usa internamente), che analizza
   correttamente sintassi moderna + JSX. I dati di complessità ciclomatica del
   piano provengono quindi da `eslint-complexity.json`, mentre la
   manutenibilità (MI) deriva da Plato dove disponibile.

## Come riprodurre

```bash
mkdir -p docs/metrics/pre-refactoring
npx es6-plato -r -d docs/metrics/pre-refactoring/plato-backend backend/src
npx es6-plato -r -d docs/metrics/pre-refactoring/plato-frontend frontend/src
npx madge --circular backend/src ; npx madge --json backend/src  > docs/metrics/pre-refactoring/coupling-backend.json
npx madge --extensions js,jsx --circular frontend/src
npx madge --extensions js,jsx --json frontend/src > docs/metrics/pre-refactoring/coupling-frontend.json
npx eslint@8 --no-eslintrc -c docs/metrics/pre-refactoring/.eslintrc.complexity.json \
  -f json --ext .js,.jsx backend/src frontend/src > docs/metrics/pre-refactoring/eslint-complexity.json
```
