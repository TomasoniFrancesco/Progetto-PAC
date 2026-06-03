import React from 'react'
import { C, overlayStyle, modaleStyle } from './theme'

// Cronologia degli ordini di oggi.
export default function ModaleCronologia({ caricamento, ordini, onChiudi }) {
    return (
        <div style={overlayStyle} onClick={onChiudi}>
            <div style={{ ...modaleStyle, minWidth: 520, maxWidth: 700 }} onClick={e => e.stopPropagation()}>
                <h3 style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 800, fontSize: 20, margin: '0 0 20px', color: C.primary }}>
                    Cronologia ordini di oggi
                </h3>
                {caricamento ? (
                    <div style={{ textAlign: 'center', padding: 28, color: C.onSurfaceVariant }}>Caricamento...</div>
                ) : ordini.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 28, color: C.onSurfaceVariant }}>Nessun ordine oggi</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {ordini.map(o => {
                            const ora = new Date(o.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                            const statoColor = o.stato === 'confermato' ? C.primary : C.onSurfaceVariant
                            const statoBg = o.stato === 'confermato' ? 'rgba(0,81,71,0.08)' : C.surfaceLow
                            return (
                                <div key={o.id} style={{ background: C.surfaceLow, borderRadius: 12, padding: '14px 16px', border: `1px solid ${C.surfaceHigh}` }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 900, fontSize: 15, color: C.onSurface }}>
                                                #{o.id}
                                            </span>
                                            <span style={{ fontSize: 12, color: C.onSurfaceVariant }}>{ora}</span>
                                            {o.asporto === 1 && <span style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>ASPORTO</span>}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span style={{ fontSize: 11, background: statoBg, color: statoColor, padding: '3px 10px', borderRadius: 20, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{o.stato}</span>
                                            <span style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 900, fontSize: 17, color: C.primary }}>€ {parseFloat(o.totale || 0).toFixed(2)}</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {(o.righe || []).map((r, i) => (
                                            <span key={i} style={{ background: C.surface, border: `1px solid ${C.surfaceHigh}`, padding: '3px 10px', borderRadius: 20, fontSize: 12, color: C.onSurface }}>
                                                {r.quantita}× {r.nome}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
                <button onClick={onChiudi}
                    style={{ marginTop: 18, width: '100%', padding: 12, border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, background: C.surfaceHigh, color: C.onSurface }}>
                    Chiudi
                </button>
            </div>
        </div>
    )
}
