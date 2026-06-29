import React from 'react'
import { C, getTextColorForBackground } from './theme'

// Pannello laterale dell'ordine: intestazione, lista righe, riepilogo costi,
// pagamento e conferma. Riceve stato e callback dalla pagina Cassa.
export default function PannelloOrdine({
    righe, rigaAperta, onToggleRiga, onCambiaQuantita, onRimuovi, onSalvaNote,
    asporto, onToggleAsporto, scontoImporto, scontoTipo, scontoValore,
    totale, totaleNetto, importoPagato, importoPagatoValido, resto,
    onAzzera, onApriSconto, onApriAllergeni, onApriCronologia, onApriTastierino, onConferma,
}) {
    return (
        <aside style={{ width: '26%', minWidth: 350, background: C.surface, borderLeft: `1px solid ${C.surfaceHigh}`, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.04)', zIndex: 10 }}>

            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.surfaceHigh}`, background: `${C.surfaceLow}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <h2 style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 900, fontSize: 20, color: C.primary, margin: 0 }}>
                        {asporto ? '🥡 ASPORTO' : '📝 ORDINE'}
                    </h2>
                    <button onClick={onApriCronologia}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', border: `1px solid ${C.outline}`, borderRadius: 8, background: C.surfaceHighest, color: C.onSurfaceVariant, fontFamily: 'Public Sans, sans-serif', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer' }}>
                        🕓 Cronologia
                    </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ margin: 0, fontSize: 13, color: C.onSurfaceVariant, fontWeight: 600 }}>
                        {righe.length} {righe.length === 1 ? 'prodotto' : 'prodotti'}
                    </p>
                    <span style={{ padding: '4px 10px', background: righe.length > 0 ? C.primaryFixed : C.surfaceHigh, color: righe.length > 0 ? C.onPrimaryFixed : C.onSurfaceVariant, fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', borderRadius: 20 }}>
                        {righe.length > 0 ? 'In Corso' : 'Vuoto'}
                    </span>
                </div>
            </div>

            {/* Lista righe */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
                {righe.length === 0 && (
                    <div style={{ textAlign: 'center', color: C.onSurfaceVariant, marginTop: 48, fontSize: 14 }}>
                        <div style={{ fontSize: 36, marginBottom: 10 }}>🧾</div>
                        Nessuna voce selezionata
                    </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[...righe].sort((a, b) => a.nome.localeCompare(b.nome, 'it')).map(riga => (
                        <RigaOrdine
                            key={riga.voce_id}
                            riga={riga}
                            aperta={rigaAperta === riga.voce_id}
                            onToggle={() => onToggleRiga(riga.voce_id)}
                            onCambiaQuantita={onCambiaQuantita}
                            onRimuovi={onRimuovi}
                            onSalvaNote={onSalvaNote}
                        />
                    ))}
                </div>
            </div>

            {/* Azioni e Pagamento */}
            <div style={{ padding: '16px 20px', borderTop: `1px solid ${C.surfaceHigh}`, background: C.surfaceLow, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button onClick={onAzzera} style={{ padding: '12px 6px', background: C.surfaceHigh, color: C.onSurface, border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 11, cursor: 'pointer', fontFamily: 'Public Sans, sans-serif', textTransform: 'uppercase' }}>
                        ✕ Azzera
                    </button>
                    <button onClick={onApriSconto}
                        style={{ padding: '12px 6px', background: scontoImporto > 0 ? C.secondary : C.surfaceHigh, color: scontoImporto > 0 ? '#fff' : C.onSurface, border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 11, cursor: 'pointer', fontFamily: 'Public Sans, sans-serif', textTransform: 'uppercase' }}>
                        🏷 Sconto {scontoImporto > 0 ? (scontoTipo === 'percentuale' ? `(${scontoValore}%)` : `(€${scontoValore})`) : ''}
                    </button>
                    <button onClick={onToggleAsporto}
                        style={{ padding: '10px 6px', background: asporto ? C.surfaceHighest : C.surfaceHigh, color: asporto ? C.primary : C.onSurface, border: `2px solid ${asporto ? C.primary : 'transparent'}`, borderRadius: 10, fontWeight: 800, fontSize: 11, cursor: 'pointer', fontFamily: 'Public Sans, sans-serif', textTransform: 'uppercase', boxSizing: 'border-box' }}>
                        🥡 Asporto
                    </button>
                    <button onClick={righe.length ? onApriAllergeni : undefined} disabled={!righe.length}
                        style={{ padding: '12px 6px', background: C.surfaceHigh, color: C.onSurface, border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 11, cursor: righe.length ? 'pointer' : 'default', opacity: righe.length ? 1 : 0.4, fontFamily: 'Public Sans, sans-serif', textTransform: 'uppercase' }}>
                        ℹ Allergeni
                    </button>
                </div>

                <div style={{ background: C.surface, padding: '14px 16px', borderRadius: 12, border: `1px solid ${C.surfaceHigh}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: C.onSurfaceVariant, fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                        <span>Subtotale</span><span>€ {totale.toFixed(2)}</span>
                    </div>
                    {scontoImporto > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: C.tertiary, fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                            <span>Sconto</span><span>−€ {scontoImporto.toFixed(2)}</span>
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 6, marginTop: 4, borderTop: `1px dashed ${C.surfaceHigh}` }}>
                        <span style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 800, fontSize: 16, color: C.onSurface }}>TOTALE</span>
                        <span style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 900, fontSize: 26, color: C.primary, lineHeight: 1 }}>€ {totaleNetto.toFixed(2)}</span>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div onClick={onApriTastierino}
                            style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${righe.length && !importoPagatoValido ? C.tertiary : C.outline}`, background: C.surfaceLowest, color: importoPagatoValido ? C.onSurface : '#aaa', fontSize: 15, fontWeight: 600, boxSizing: 'border-box', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
                            <span>{importoPagato ? `€ ${importoPagato}` : 'Importo pagato (€)'}</span>
                            <span style={{ fontSize: 18, opacity: 0.7 }}>⌨️</span>
                        </div>
                        {resto !== null && (
                            <div style={{ background: parseFloat(resto) >= 0 ? '#dcfce7' : '#fee2e2', color: parseFloat(resto) >= 0 ? '#166534' : '#991b1b', padding: '12px 14px', borderRadius: 10, fontWeight: 800, fontSize: 15, minWidth: 90, textAlign: 'center', border: `1px solid ${parseFloat(resto) >= 0 ? '#bbf7d0' : '#fecaca'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                R: € {resto}
                            </div>
                        )}
                    </div>

                    <button onClick={onConferma} disabled={!righe.length || !importoPagatoValido}
                        style={{ width: '100%', padding: '16px', background: righe.length && importoPagatoValido ? `linear-gradient(135deg, ${C.primary}, ${C.primaryContainer})` : C.surfaceHigh, color: righe.length && importoPagatoValido ? '#fff' : C.onSurfaceVariant, border: 'none', borderRadius: 10, fontFamily: 'Public Sans, sans-serif', fontWeight: 900, fontSize: 16, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: righe.length && importoPagatoValido ? 'pointer' : 'default', boxShadow: righe.length && importoPagatoValido ? '0 4px 16px rgba(0,81,71,0.2)' : 'none', transition: 'all 0.15s' }}>
                        CONFERMA ORDINE ✓
                    </button>
                </div>
            </div>
        </aside>
    )
}

// Singola riga dell'ordine con controlli quantità e note per porzione.
function RigaOrdine({ riga, aperta, onToggle, onCambiaQuantita, onRimuovi, onSalvaNote }) {
    const backgroundColor = riga.colore_tasto || C.surfaceLowest
    const textColor = getTextColorForBackground(backgroundColor)
    const isCustomColor = riga.colore_tasto && riga.colore_tasto !== C.surfaceLowest
    return (
        <div style={{ background: backgroundColor, borderRadius: 12, border: `1px solid ${aperta ? C.outline : 'transparent'}`, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', gap: 10 }}>
                <div style={{ flex: 1, cursor: 'pointer' }} onClick={onToggle}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: isCustomColor ? textColor : C.onSurface, lineHeight: 1.3 }}>{riga.nome}</div>
                    <div style={{ fontSize: 13, color: isCustomColor ? textColor : C.primaryContainer, fontWeight: 600, marginTop: 2 }}>€ {(riga.prezzo * riga.quantita).toFixed(2)}</div>
                    {riga.note.length > 0 && (
                        <div style={{ fontSize: 11, color: isCustomColor ? textColor : C.onSurfaceVariant, marginTop: 2, opacity: isCustomColor ? 0.8 : 1 }}>📝 {riga.note.length} nota{riga.note.length > 1 ? 'e' : ''}</div>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button onClick={() => onCambiaQuantita(riga.voce_id, -1)}
                        style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: C.secondaryContainer, color: C.onSecondaryContainer, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, lineHeight: 1 }}>
                        −
                    </button>
                    <span style={{ fontWeight: 900, fontSize: 15, minWidth: 22, textAlign: 'center' }}>{riga.quantita}</span>
                    <button onClick={() => onCambiaQuantita(riga.voce_id, +1)}
                        style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: C.secondaryContainer, color: C.onSecondaryContainer, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, lineHeight: 1 }}>
                        +
                    </button>
                    <button onClick={() => onRimuovi(riga.voce_id)}
                        style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#fde8e8', color: C.tertiary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                        ✕
                    </button>
                </div>
            </div>
            {aperta && (
                <div style={{ padding: '10px 14px 14px', borderTop: `1px solid ${C.surfaceHigh}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Note per porzione</div>
                    {Array.from({ length: riga.quantita }, (_, i) => i + 1).map(n => (
                        <div key={n} style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 11, color: C.onSurfaceVariant, marginBottom: 3 }}>Porzione {n}</div>
                            <input type="text" placeholder="Es. senza cipolla"
                                value={riga.note.find(no => no.numero_porzione === n)?.testo || ''}
                                onChange={e => onSalvaNote(riga.voce_id, n, e.target.value)}
                                style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.outline}`, background: C.surfaceLow, color: C.onSurface, fontSize: 13, boxSizing: 'border-box', outline: 'none' }}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
