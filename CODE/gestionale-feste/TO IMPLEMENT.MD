Ecco il file Markdown formattato e strutturato che puoi fornire a Claude (o a qualsiasi altro LLM) per guidarlo nell'implementazione dell'algoritmo nella tua codebase.

Ho strutturato il prompt includendo contesto, strutture dati, formule matematiche e il flusso logico esatto derivato dalla tua documentazione.

```markdown
# Prompt per Implementazione Algoritmo: Smistatore Intelligente Multi-Reparto

**Ruolo:** Sei un Software Engineer esperto. [cite_start]Il tuo compito è implementare nella nostra codebase l'algoritmo "Smistatore Intelligente Multi-Reparto", progettato per il bilanciamento dinamico del carico operativo in un sistema POS per la ristorazione[cite: 4].

## 1. Contesto e Obiettivo
[cite_start]Nei sistemi POS tradizionali, gli ordini vengono instradati in modo statico, causando colli di bottiglia (saturazione asimmetrica) e mancando di adattività dinamica[cite: 5, 7, 8]. [cite_start]Questo algoritmo risolve il problema introducendo un modello di scoring dinamico per assegnare ogni task al reparto ottimale in base al carico reale istantaneo[cite: 9]. [cite_start]L'obiettivo è minimizzare il carico massimo tra i reparti e massimizzare la reattività[cite: 26].

## 2. Strutture Dati e Parametri di Input
[cite_start]Ogni riga dell'ordine in ingresso deve essere convertita in un `Task` indipendente[cite: 29]. [cite_start]Per il routing e il ranking, considera i seguenti parametri per ogni task/reparto[cite: 20, 22]:
* [cite_start]**settore_stampa**: Reparto primario di destinazione[cite: 22].
* [cite_start]**numero_task_in_coda**: Numero di task in attesa per reparto[cite: 22].
* [cite_start]**tempo_preparazione** ($t_{prep}$): Tempo stimato in secondi[cite: 22].
* [cite_start]**quantità**: Porzioni richieste (utile per i batch)[cite: 22].
* [cite_start]**timestamp**: Arrivo dell'ordine, utile per calcolare l'attesa[cite: 22].
* [cite_start]**stato_stampante**: Online/Offline (gestione fallback)[cite: 22].
* [cite_start]**disponibilità_scorte**: Quantità residua (blocca il task se insufficiente)[cite: 22].
* [cite_start]**priorità_ordine**: Tavolo, asporto, urgenza[cite: 22].

## 3. Formule di Calcolo (Core Logic)

### A. Calcolo del Carico per Reparto (Passo 5)
[cite_start]Per quantificare lo stress operativo, utilizza questa formula[cite: 38]:
[cite_start]$$carico\_reparto=n_{task}\times t_{prep\_residuo}\times\alpha_{stress}\times\beta_{stampante}$$ [cite: 40]
*Dove:*
* [cite_start]$n_{task}$ = numero di task in coda[cite: 40].
* [cite_start]$t_{prep\_residuo}$ = somma del tempo residuo di tutti i task in secondi[cite: 40].
* [cite_start]$\alpha_{stress}$ = costante $\in[1.0, 1.5]$ (moltiplicatore per reparto in stress)[cite: 40].
* [cite_start]$\beta_{stampante}$ = costante $\in[1.0, 2.0]$ (moltiplicatore per stampante offline)[cite: 40].

### B. Regola di Selezione (Passo 6)
[cite_start]Il task va assegnato al reparto con il carico minore tra quelli compatibili[cite: 42]:
[cite_start]$$\text{reparto\_scelto} = \arg\min_{\text{reparti\_compatibili}} \text{carico\_reparto}(r)$$ [cite: 44, 45, 47]

### C. Calcolo del Ranking P (Passo 7)
[cite_start]Determina l'ordine di elaborazione in coda (valori più alti = elaborazione anticipata)[cite: 49, 50]:
[cite_start]$$P=A\cdot t_{attesa}+B\cdot \pi_{a}+C\cdot s-D\cdot carico(r)-E\cdot rischio\_scorte(task)$$ [cite: 51, 178]
*Dove le variabili interne (dallo pseudocodice) sono:*
* [cite_start]$t_{attesa} = \text{Now} - \text{task.timestamp}$[cite: 171].
* [cite_start]$\pi_{a}$ = $1.0$ se priorità è ASPORTO, altrimenti $0.0$[cite: 173].
* [cite_start]$s = 1.0 / (t_{prep} + 1)$ (indice di semplicità/velocità)[cite: 175].
* [cite_start]$A, B, C, D, E$ sono pesi configurabili che riflettono urgenza, priorità, semplicità, penalità di carico e rischio esaurimento scorte[cite: 53].

## 4. Flusso dell'Algoritmo (Da implementare step-by-step)
1.  [cite_start]**Ricezione**: Leggi tutte le righe dell'ordine e i relativi metadati[cite: 27, 28].
2.  [cite_start]**Conversione**: Normalizza ogni riga in un oggetto `Task` uniforme[cite: 30, 31].
3.  [cite_start]**Verifica Scorte**: Se la scorta è insufficiente, blocca il task e notifica la cassa (le altre righe proseguono)[cite: 32, 34].
4.  [cite_start]**Identificazione Reparti**: Trova i reparti compatibili (primario + eventuali alternativi)[cite: 36, 37].
5.  [cite_start]**Calcolo Carico**: Applica la formula del `carico_reparto` per i reparti compatibili[cite: 38, 40].
6.  [cite_start]**Selezione Greedy**: Assegna al reparto con carico minore[cite: 42]. [cite_start]*Tie-breaker:* a parità di carico, scegli il reparto con il timestamp dell'ultimo task più vecchio[cite: 43].
7.  [cite_start]**Ranking P**: Calcola il punteggio $P$ per l'ordinamento in coda[cite: 49, 51].
8.  **Raggruppamento e Batching**: Raggruppa i task per reparto. [cite_start]Se pietanze identiche arrivano entro una determinata `FINESTRA_BATCH`, aggregale in un unico task cumulato[cite: 56, 57].
9.  [cite_start]**Generazione Comande**: Genera comande indipendenti per ogni reparto coinvolto (es. COMANDA BAR, COMANDA CUCINA)[cite: 58, 59].
10. [cite_start]**Ordinamento e Invio**: Ordina le comande per punteggio $P$ decrescente e inviale[cite: 60].
11. [cite_start]**Loop**: Verifica la presenza di task residui e ripeti dal passo 7 se necessario, finché l'ordine non è completamente evaso[cite: 63, 64].

## 5. Casi Limite e Gestione Eccezioni
[cite_start]Assicurati di gestire le seguenti condizioni[cite: 76]:
* [cite_start]**Stampante offline**: Fallback su stampante secondaria o dashboard admin[cite: 76].
* [cite_start]**Reparto saturo**: Assegnazione al meno saturo; degradazione a coda FIFO con priorità per attesa massima[cite: 76].
* [cite_start]**Reparto unico disponibile**: Routing forzato con scheduling FIFO[cite: 76].
* [cite_start]**Notifica cruscotto/dashboard**: Se non c'è fallback per la stampante offline, richiedi conferma manuale su dashboard[cite: 62].

[cite_start]Scrivi il codice implementando funzioni separate per il main loop (`RouteOrder`), il calcolo del carico (`SelectMinCarico`), e il ranking (`CalcolaRanking`) mantenendo una complessità asintotica per ordine pari a $O(n\cdot m+k\log k)$, dove $n$ è il numero di reparti, $m$ i task in coda e $k$ le righe dell'ordine[cite: 69, 79].

```