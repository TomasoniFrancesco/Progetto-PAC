// Calcoli derivati dell'ordine: subtotale, sconto, netto, validità importo e resto.
// Pura funzione di stato → nessun effetto, ricalcola a ogni render come prima.
export function useCalcoloOrdine({ righe, scontoValore, scontoTipo, importoPagato }) {
    const totale = righe.reduce((acc, r) => acc + r.prezzo * r.quantita, 0)
    const scontoNum = parseFloat(scontoValore) || 0
    const scontoImporto = scontoNum > 0
        ? (scontoTipo === 'percentuale' ? totale * (scontoNum / 100) : Math.min(scontoNum, totale))
        : 0
    const totaleNetto = totale - scontoImporto
    const importoPagatoValido = importoPagato !== '' && Number.isFinite(parseFloat(importoPagato)) && parseFloat(importoPagato) > 0
    const resto = importoPagatoValido ? (parseFloat(importoPagato) - totaleNetto).toFixed(2) : null

    return { totale, scontoNum, scontoImporto, totaleNetto, importoPagatoValido, resto }
}
