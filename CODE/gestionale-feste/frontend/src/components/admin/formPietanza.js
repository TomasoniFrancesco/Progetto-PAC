// Validazione e costruzione payload per le pietanze (singola e aggregata),
// estratte dalle funzioni `salva` dei rispettivi modali.

// Ritorna un messaggio di errore o null se il form pietanza singola è valido.
export function validaPietanza(form) {
    if (!form.nome.trim()) return 'Il nome è obbligatorio'
    if (form.prezzo !== '' && (isNaN(form.prezzo) || parseFloat(form.prezzo) < 0)) {
        return 'Inserire un prezzo valido'
    }
    return null
}

// Costruisce il corpo della richiesta per creare/modificare una pietanza singola.
export function payloadPietanza(form, settoreDefault) {
    return {
        nome: form.nome.trim(),
        prezzo: form.prezzo !== '' ? parseFloat(form.prezzo) : 0,
        categoria: form.categoria.trim() || null,
        settore_visualizzazione: form.settore_visualizzazione.trim() || settoreDefault,
        settore_stampa: form.settore_stampa.trim() || null,
        colore_tasto: form.colore_tasto,
        copia_scontrino_cliente: form.copia_scontrino_cliente ? 1 : 0,
        asportabile: form.asportabile ? 1 : 0,
        modalita_stampa: form.modalita_stampa,
    }
}

// Ritorna un messaggio di errore o null se il form aggregata è valido.
export function validaAggregata(form, componentiSelezionati) {
    if (!form.nome.trim()) return 'Il nome è obbligatorio'
    if (componentiSelezionati.length < 2) return 'Selezionare almeno 2 componenti'
    return null
}

// Costruisce i campi base (senza componenti) di una pietanza aggregata.
export function payloadAggregata(form, settoreDefault, prezzoComponenti) {
    return {
        nome: form.nome.trim(),
        prezzo: form.prezzo !== '' ? parseFloat(form.prezzo) : prezzoComponenti,
        categoria: form.categoria.trim() || null,
        settore_visualizzazione: form.settore_visualizzazione.trim() || settoreDefault,
        settore_stampa: form.settore_stampa.trim() || null,
        colore_tasto: form.colore_tasto,
    }
}
