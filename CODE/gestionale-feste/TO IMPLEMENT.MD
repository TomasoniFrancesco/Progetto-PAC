# Prompt per Implementazione Algoritmo: Predittore Dinamico di Riordino Scorte

**Ruolo:** Sei un Software Engineer esperto. [cite_start]Il tuo compito è implementare nella nostra codebase l'algoritmo "Predittore Dinamico di Riordino Scorte" (UC5b), progettato per la gestione reattiva delle scorte in sistemi POS per la ristorazione ad alta variabilità[cite: 185, 187].

## 1. Contesto e Obiettivo
[cite_start]Nei sistemi tradizionali, la gestione si basa su soglie statiche, causando reattività ritardata e mancanza di previsione[cite: 188, 189, 190, 191]. [cite_start]Questo algoritmo supera il problema introducendo un modello di stima del consumo atteso basato su una media pesata multi-finestra temporale, integrata con un indice di urgenza dinamico per determinare la priorità di rifornimento per ogni voce attiva del menu[cite: 192]. [cite_start]L'obiettivo è massimizzare il preavviso utile prima dell'esaurimento[cite: 220].

## 2. Strutture Dati e Parametri di Input
[cite_start]Ogni voce attiva del menu deve essere valutata considerando i seguenti parametri[cite: 202]:
* [cite_start]**quantita_attuale**: Quantità corrente disponibile[cite: 203].
* **consumo_ultimi_15_min**: Unità vendute negli ultimi 15 minuti (cattura i picchi)[cite: 203].
* **consumo_ultima_ora**: Unità vendute nell'ultima ora (trend a medio termine)[cite: 203].
* [cite_start]**media_storica_fascia**: Media storica nella stessa fascia oraria[cite: 203].
* [cite_start]**tempo_residuo_evento**: Tempo rimanente alla chiusura dell'evento (in secondi)[cite: 203].
* **tempo_riapprovvigionamento**: Tempo stimato per completare un rifornimento[cite: 203].
* **priorita_voce**: Peso della voce (alta, media, bassa)[cite: 203].
* **stato_scorta**: Flag (disponibile, soglia_giallo, soglia_rosso, esaurito)[cite: 203].
* **ingredienti_condivisi**: Lista di ingredienti comuni ad altre voci (per aggregazione)[cite: 203].
* **categoria_reparto**: Reparto di appartenenza[cite: 203].

## 3. Formule di Calcolo (Core Logic)

### A. Consumo Atteso (Passo 5)
[cite_start]Modello basato su media pesata a tre componenti temporali[cite: 205, 206]:
[cite_start]$$consumo\_atteso = \alpha \cdot consumo\_ultimi\_15\_min + \beta \cdot consumo\_ultima\_ora + \gamma \cdot media\_storica\_stessa\_fascia\_oraria$$ [cite: 207, 208, 209]
* **Condizioni normali:** $\alpha = 0.5$, $\beta = 0.3$, $\gamma = 0.2$[cite: 210].
* [cite_start]**Modalità picco:** Se `consumo_ultimi_15_min > 2 * media_storica`, allora $\alpha = 0.8$, $\beta = 0.15$, $\gamma = 0.05$[cite: 211, 293, 294].
* [cite_start]**Modalità prudente:** Se mancano dati storici sufficienti, $\gamma = 0$ e si usano le soglie statiche[cite: 229].

### B. Tempo Stimato di Esaurimento (Passo 5)
[cite_start]$$tempo\_esaurimento = \frac{quantita\_attuale}{consumo\_atteso}$$ [cite: 213, 272]
[cite_start]*(Se il consumo atteso è $\le 0$, il tempo di esaurimento è $\infty$) [cite: 236]*

### C. Indice di Urgenza U (Passo 6)
[cite_start]Quantifica il rischio di esaurimento prima del rifornimento[cite: 214]:
[cite_start]$$U = \max(0, tempo\_riapprovvigionamento - tempo\_esaurimento) \cdot priorita\_voce$$ [cite: 215, 273, 274]

## 4. Flusso dell'Algoritmo (Da implementare step-by-step)
1. [cite_start]**Raccolta Dati:** Leggi tutti i parametri per ogni voce attiva (escludi le voci 'non vendibili')[cite: 221, 222, 223].
2. [cite_start]**Aggregazione:** Per voci con ingredienti condivisi, calcola il consumo effettivo sommando i consumi di tutte le pietanze collegate[cite: 224, 225, 226].
3. **Selezione Modalità:** Verifica la disponibilità dello storico. [cite_start]Se insufficiente (< 3 occorrenze storiche), attiva la *modalità prudente* ($\gamma=0$)[cite: 228, 229].
4. [cite_start]**Rilevamento Picco:** Se il consumo a 15 min supera del doppio la media storica, attiva la *modalità picco* (alza $\alpha$ a 0.8)[cite: 230, 231, 232].
5. [cite_start]**Calcolo Consumo e Tempo:** Applica le formule per ottenere `consumo_atteso` e `tempo_esaurimento`[cite: 234, 235, 236].
6. **Calcolo Indice U:** Applica la formula dell'urgenza. [cite_start]Aggiungi un moltiplicatore di contesto se la scorta si esaurirà prima del termine dell'evento (`tempo_esaurimento < tempo_residuo_evento`)[cite: 237, 238, 239].
7. [cite_start]**Classificazione:** [cite: 240, 241, 243]
   * [cite_start]**Stabile:** Se $U = 0$ e `stato_scorta = disponibile`[cite: 243, 301].
   * [cite_start]**Attenzione:** Se $U > 0$ ma $\le$ `soglia_warn`[cite: 243, 302].
   * **Urgente:** Se $U >$ `soglia_warn`. [cite_start]Genera suggerimento di rifornimento: `quantità consigliata = ceil(consumo_atteso * tempo_riapprovvigionamento * 1.3)`[cite: 242, 243, 277].
   * **Critico / Esaurito:** Se `quantita_attuale = 0`. Marca come non vendibile e notifica la cassa[cite: 243, 300].

## 5. Casi Limite e Prestazioni
* [cite_start]**Reparto Offline:** Mantieni l'ultimo consumo noto, emetti un warning di staleness e attiva la modalità prudente[cite: 249].
* [cite_start]**Complessità Asintotica:** Scrivi il codice mantenendo una complessità target per ciclo pari a $O(n \cdot (h + s))$, dove $n$ sono le voci attive, $h$ i record nello storico e $s$ gli ingredienti condivisi[cite: 251, 252, 253]. [cite_start]Separa la logica in funzioni come `PredictReorder` (main loop), `AggregaConsumo`, `CalcolaPesi` e `Classifica`[cite: 258, 283, 292, 299].