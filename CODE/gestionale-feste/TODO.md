## Cosa e implementato in questo scheletro

- Schema database completo da Class Diagram (Iterazione 1)
- API REST per ordini, menu, scorte, stampanti
- Aggiornamento scorte in tempo reale via WebSocket
- Interfaccia cassa con tasti per settore, riepilogo, conferma ordine
- Calcolo totale e resto
- Flag asporto
- Pannello admin con elenco voci e toggle visibilita

## Cosa resta da implementare
> Aggiorna manualmente le voci spuntando le checkbox `[x]` man mano che completi ogni punto.

---

## 1. Database e struttura del menù

- [ ] Possibilità di creare prodotti "fittizi" (senza ingredienti reali)

---

## 2. Interfaccia — parte sinistra (menù)

- [ ] Layout a colonne (max 6), larghezza adattiva (~2/3 dello schermo)
- [ ] Altezza celle auto-ridimensionata per riempire tutta la colonna
- [ ] Intestazione fissa in cima ad ogni colonna con nome settore
- [ ] Tasto per ogni pietanza con colore personalizzabile
- [ ] Ogni clic aggiunge la pietanza al riepilogo (o incrementa quantità se già presente)
- [ ] Visualizzare solo le pietanze con flag `visualizzare_schermo` attivo
- [ ] Ordinamento celle: crescente per `ordine_schermo`, parità → alfabetico

---

## 3. Interfaccia — parte destra (riepilogo ordine)

- [ ] Tabella riepilogo aggiornata in tempo reale: prodotto, quantità, prezzo riga
- [ ] Importo totale ordine sempre visibile
- [ ] Tasto "Azzera ordine" (cancellazione completa)
- [ ] Tasto "Scontistica" per applicare sconti
- [ ] Campo "cifra pagata" + calcolo automatico del resto
- [ ] Clic su riga del riepilogo → apertura schermata modifica quantità/note
- [ ] Tasto "Asporto" toggle: cambia colore se attivo, deselezionabile in qualsiasi momento
- [ ] Tasto "Allergeni"
- [ ] Tasto "Quantità limitate" (apre tabella gestione stock)
- [ ] Tasto conferma/stampa ordine

---

## 4. Modifica quantità e note

- [ ] Schermata modifica: riepilogo nome piatto, prezzo e quantità
- [ ] Tasti rapidi di decremento: da -1 a -N (N = quantità ordinata) + tasto +1
- [ ] Tasto cancellazione completa della pietanza
- [ ] Menu "aggiunte rapide" con note preimpostate per pietanza (colonna centrale)
- [ ] Campo nota libera editabile per ogni singola porzione (colonna destra)
- [ ] Numero di campi nota = numero di porzioni ordinate
- [ ] Selezione nota preimpostata → inserita nel campo nota della porzione selezionata
- [ ] Note preimpostate con costo aggiuntivo opzionale (incrementa totale ordine)
- [ ] Note stampate sullo scontrino

---

## 5. Gestione stampanti e stampa

- [ ] Tabella associazione settore di stampa → una o più stampanti fisiche
- [ ] Alla conferma ordine: raggruppamento pietanze per settore di stampa
- [ ] Invio biglietto separato per ogni settore alle stampanti associate
- [ ] Gestione modalità "stampa singola quantità singola" (N biglietti per N porzioni)
- [ ] Gestione modalità "stampa singola quantità multipla" (1 biglietto con totale)
- [ ] Gestione modalità "stampa doppia copia"
- [ ] Generazione "copia cliente" su stampante cassa per prodotti con flag `copia_scontrino_cliente`

---

## 6. Gestione asporto

- [ ] Tasto "Asporto" toggle: cambia colore se attivo, deselezionabile in qualsiasi momento
- [ ] Aggiunta titolo "ASPORTO" a caratteri grandi in testa al biglietto
- [ ] Alert non bloccante se nell'ordine asporto sono presenti pietanze "non da asporto"
- [ ] Pietanze "non da asporto" posizionate in coda al biglietto con separatore "NON ASPORTO"

---

## 7. Gestione quantità limitate

- [ ] Tasto che apre tabella per impostare la quantità residua per ogni prodotto a stock
- [ ] Decremento automatico dello stock ad ogni ordine
- [ ] Tasto lampeggiante giallo quando residuo ≤ soglia X (impostabile)
- [ ] Tasto lampeggiante rosso quando residuo ≤ soglia Y (impostabile, con Y < X)
- [ ] Tasto grigio scuro e non selezionabile quando residuo = 0
- [ ] Tabella parametrica per impostare X e Y globalmente
- [ ] Contatori aggregati per ingredienti condivisi (es. polenta)
- [ ] Contatore aggregato decrementato da tutti i prodotti associati
- [ ] All'azzeramento contatore aggregato: tasti associati diventano grigio chiaro ma selezionabili
- [ ] Alert non bloccante alla selezione di prodotto con contatore aggregato esaurito

---

## 8. Gestione allergeni

- [ ] Tabella allergeni compilabile per ogni prodotto (in fase di programmazione)
- [ ] Tasto "Allergeni" che apre finestra con elenco prodotti suddivisi per settore
- [ ] Selezione prodotto nella finestra → visualizzazione allergeni contenuti
- [ ] Stampa lista completa prodotti + allergeni (tutti i piatti)
- [ ] Stampa singolo prodotto con relativi allergeni