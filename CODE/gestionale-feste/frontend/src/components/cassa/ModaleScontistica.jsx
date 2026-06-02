import React from 'react'
import { C, overlayStyle, modaleStyle } from './theme'

// Modale per impostare uno sconto (percentuale o importo fisso).
export default function ModaleScontistica({ scontoTipo, setScontoTipo, scontoValore, setScontoValore, scontoNum, scontoImporto, totaleNetto, onRimuovi, onChiudi }) {
    return (
        <div style={overlayStyle} onClick={onChiudi}>
            <div style={modaleStyle} onClick={e => e.stopPropagation()}>
                <h3 style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 800, fontSize: 20, margin: '0 0 20px', color: C.primary }}>Scontistica</h3>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    {['percentuale', 'fisso'].map(tipo => (
                        <button key={tipo} onClick={() => setScontoTipo(tipo)}
                            style={{ flex: 1, padding: '10px 0', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14, background: scontoTipo === tipo ? C.primary : C.surfaceHigh, color: scontoTipo === tipo ? '#fff' : C.onSurface }}>
                            {tipo === 'percentuale' ? 'Percentuale (%)' : 'Importo fisso (€)'}
                        </button>
                    ))}
                </div>
                <input type="number" min="0" autoFocus
                    placeholder={scontoTipo === 'percentuale' ? 'Es. 10 (= 10%)' : 'Es. 5 (= 5 €)'}
                    value={scontoValore} onChange={e => setScontoValore(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${C.outline}`, background: C.surfaceLow, color: C.onSurface, fontSize: 15, marginBottom: 12, boxSizing: 'border-box', outline: 'none' }} />
                {scontoNum > 0 && (
                    <div style={{ padding: '10px 14px', background: '#fef3c7', borderRadius: 8, fontSize: 14, color: '#92400e', fontWeight: 600, marginBottom: 16 }}>
                        Sconto: −€ {scontoImporto.toFixed(2)} → Netto: € {totaleNetto.toFixed(2)}
                    </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={onRimuovi}
                        style={{ flex: 1, padding: 12, border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, background: C.surfaceHigh, color: C.onSurface }}>
                        Rimuovi sconto
                    </button>
                    <button onClick={onChiudi}
                        style={{ flex: 1, padding: 12, border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, background: C.primary, color: '#fff' }}>
                        Applica
                    </button>
                </div>
            </div>
        </div>
    )
}
