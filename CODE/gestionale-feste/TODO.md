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

- [x] Possibilità di creare prodotti "fittizi" (senza ingredienti reali) ## esiste sistema "pietanze aggregate" (voce_composizione + ModalePietanzaAggregata), da verificare se copre il caso

---

## 2. Interfaccia — parte sinistra (menù)

- [x] Layout a colonne (max 6), larghezza adattiva (~2/3 dello schermo)
- [x] Altezza celle auto-ridimensionata per riempire tutta la colonna
- [x] Intestazione fissa in cima ad ogni colonna con nome settore
- [x] Tasto per ogni pietanza con colore personalizzabile ## questa opzione l'ho messa in admin
- [x] Ogni clic aggiunge la pietanza al riepilogo (o incrementa quantità se già presente)
- [x] Visualizzare solo le pietanze con flag `visualizzare_schermo` attivo ## anche questo è in 
## admin ma con il flag 'visibile'
- [x] Ordinamento celle: crescente per `ordine_schermo`, a parità di `ordine_schermo` → alfabetico ## io ho inteso così per parità, spero sia giusto, se hanno ordine uguale sono ordinati per ordine alfabetico
---

## 3. Interfaccia — parte destra (riepilogo ordine)

- [x] Tabella riepilogo aggiornata in tempo reale: prodotto, quantità, prezzo riga
- [x] Importo totale ordine sempre visibile
- [x] Tasto "Azzera ordine" (cancellazione completa)
- [x] Tasto "Scontistica" per applicare sconti
- [x] Campo "cifra pagata" + calcolo automatico del resto
- [x] Clic su riga del riepilogo → apertura schermata modifica quantità/note
- [x] Tasto "Asporto" toggle: cambia colore se attivo, deselezionabile in qualsiasi momento
- [x] Tasto "Allergeni"
- [ ] Tasto "Quantità limitate" (apre tabella gestione stock) ## gestione stock presente solo in Admin, non in Cassa
- [ ] Tasto conferma/stampa ordine ## conferma OK, stampa NON implementata

---

## 4. Modifica quantità e note

- [x] Schermata modifica: riepilogo nome piatto, prezzo e quantità ## implementata inline nella riga aperta
- [ ] Tasti rapidi di decremento: da -1 a -N (N = quantità ordinata) + tasto +1 ## solo +1/-1, mancano -2..-N
- [x] Tasto cancellazione completa della pietanza
- [ ] Menu "aggiunte rapide" con note preimpostate per pietanza (colonna centrale) ## tabella nota_preimpostata esiste in DB, nessuna UI
- [x] Campo nota libera editabile per ogni singola porzione (colonna destra)
- [x] Numero di campi nota = numero di porzioni ordinate
- [ ] Selezione nota preimpostata → inserita nel campo nota della porzione selezionata
- [ ] Note preimpostate con costo aggiuntivo opzionale (incrementa totale ordine) ## costo_aggiuntivo hardcoded a 0
- [ ] Note stampate sullo scontrino ## nessuna stampa implementata

---

## 5. Gestione stampanti e stampa

- [x] Tabella associazione settore di stampa → una o più stampanti fisiche
- [x] Alla conferma ordine: raggruppamento pietanze per settore di stampa
- [x] Invio biglietto separato per ogni settore alle stampanti associate
- [x] Gestione modalità "stampa singola quantità singola" (N biglietti per N porzioni)
- [x] Gestione modalità "stampa singola quantità multipla" (1 biglietto con totale)
- [x] Gestione modalità "stampa doppia copia"
- [x] Generazione "copia cliente" su stampante cassa per prodotti con flag `copia_scontrino_cliente`

---

## 6. Gestione asporto

- [x] Tasto "Asporto" toggle: cambia colore se attivo, deselezionabile in qualsiasi momento ## duplicato della sez.3
- [x] Aggiunta titolo "ASPORTO" a caratteri grandi in testa al biglietto ## implementata nel formatter
- [ ] Alert non bloccante se nell'ordine asporto sono presenti pietanze "non da asporto" ## flag asportabile in DB ma mai controllato in Cassa
- [ ] Pietanze "non da asporto" posizionate in coda al biglietto con separatore "NON ASPORTO" ## no stampa

---

## 7. Gestione quantità limitate

- [ ] Tasto che apre tabella per impostare la quantità residua per ogni prodotto a stock ## solo da Admin, non da Cassa
- [x] Decremento automatico dello stock ad ogni ordine
- [ ] Tasto lampeggiante giallo quando residuo ≤ soglia X (impostabile) ## colore giallo statico OK, manca animazione lampeggio
- [ ] Tasto lampeggiante rosso quando residuo ≤ soglia Y (impostabile, con Y < X) ## colore rosso statico OK, manca animazione lampeggio
- [x] Tasto grigio scuro e non selezionabile quando residuo = 0
- [ ] Tabella parametrica per impostare X e Y globalmente ## soglie solo per-prodotto in Admin
- [ ] Contatori aggregati per ingredienti condivisi (es. polenta) ## tabelle contatore_aggregato e voce_contatore in DB, nessuna UI
- [ ] Contatore aggregato decrementato da tutti i prodotti associati
- [ ] All'azzeramento contatore aggregato: tasti associati diventano grigio chiaro ma selezionabili
- [ ] Alert non bloccante alla selezione di prodotto con contatore aggregato esaurito

---

## 8. Gestione allergeni

- [ ] Tabella allergeni compilabile per ogni prodotto (in fase di programmazione) ## endpoint GET esiste, manca UI di gestione in Admin
- [ ] Tasto "Allergeni" che apre finestra con elenco prodotti suddivisi per settore ## modale presente ma mostra solo l'ordine corrente, non tutti i prodotti per settore
- [x] Selezione prodotto nella finestra → visualizzazione allergeni contenuti ## funziona per le voci dell'ordine corrente
- [ ] Stampa lista completa prodotti + allergeni (tutti i piatti) ## no stampa
- [ ] Stampa singolo prodotto con relativi allergeni ## no stampa