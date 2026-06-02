import React from 'react'
import { C, overlayStyle, modaleStyle } from './theme'

// Allergeni di tutte le voci dell'ordine corrente.
export function ModaleAllergeniOrdine({ righe, allergeniPerVoce, onChiudi }) {
    return (
        <div style={overlayStyle} onClick={onChiudi}>
            <div style={modaleStyle} onClick={e => e.stopPropagation()}>
                <h3 style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 800, fontSize: 20, margin: '0 0 20px', color: C.primary }}>Allergeni dell'ordine</h3>
                {righe.map(riga => {
                    const all = allergeniPerVoce[riga.voce_id] || []
                    return (
                        <div key={riga.voce_id} style={{ marginBottom: 14, padding: '12px 14px', background: C.surfaceLow, borderRadius: 10 }}>
                            <div style={{ fontWeight: 700, marginBottom: 8, color: C.onSurface }}>{riga.nome}</div>
                            {all.length === 0
                                ? <span style={{ fontSize: 13, color: C.onSurfaceVariant }}>Nessun allergene registrato</span>
                                : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {all.map((a, i) => (
                                        <span key={i} style={{ background: '#fde8e8', color: C.tertiary, padding: '3px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>{a.nome}</span>
                                    ))}
                                </div>
                            }
                        </div>
                    )
                })}
                <button onClick={onChiudi}
                    style={{ marginTop: 8, width: '100%', padding: 12, border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, background: C.surfaceHigh, color: C.onSurface }}>
                    Chiudi
                </button>
            </div>
        </div>
    )
}

// Allergeni di una singola voce (aperta dal badge "i" sulla griglia prodotti).
export function ModaleAllergeniVoce({ voce, allergeniPerVoce, onChiudi }) {
    const all = allergeniPerVoce[voce.id] || []
    return (
        <div style={overlayStyle} onClick={onChiudi}>
            <div style={{ ...modaleStyle, minWidth: 320, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
                <h3 style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 800, fontSize: 20, margin: '0 0 18px', color: C.primary }}>
                    Allergeni
                </h3>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, marginBottom: 16 }}>{voce.nome}</div>
                {all.length === 0
                    ? <div style={{ padding: '12px 14px', background: C.surfaceLow, borderRadius: 10, fontSize: 14, color: C.onSurfaceVariant }}>
                        Nessun allergene registrato
                    </div>
                    : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {all.map((a, i) => (
                            <span key={i} style={{ background: '#fde8e8', color: C.tertiary, padding: '6px 16px', borderRadius: 20, fontSize: 14, fontWeight: 600 }}>{a.nome}</span>
                        ))}
                    </div>
                }
                <button onClick={onChiudi}
                    style={{ marginTop: 20, width: '100%', padding: 12, border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, background: C.surfaceHigh, color: C.onSurface }}>
                    Chiudi
                </button>
            </div>
        </div>
    )
}
