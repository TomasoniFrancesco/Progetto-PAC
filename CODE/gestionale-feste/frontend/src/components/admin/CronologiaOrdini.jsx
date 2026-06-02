import React, { useState } from 'react'
import { C } from './shared'

// Lista espandibile della cronologia ordini con dettaglio righe e totali.
export default function CronologiaOrdini({ ordini }) {
    const [expandedOrderId, setExpandedOrderId] = useState(null)

    function formatTime(isoString) {
        const date = new Date(isoString)
        return date.toLocaleString('it-IT')
    }

    function formatMoney(val) {
        return parseFloat(val || 0).toFixed(2)
    }

    function calcolaTotaleLordo(righe) {
        if (!righe) return 0
        return righe.reduce((acc, r) => acc + (r.quantita * parseFloat(r.prezzo || 0)), 0)
    }

    return (
        <div>
            <div style={{ fontFamily: 'Public Sans, sans-serif', fontSize: '1.1rem', fontWeight: 800, color: C.primary, marginBottom: 16 }}>
                Cronologia Ordini ({ordini.length})
            </div>
            {ordini.length === 0 ? (
                <div style={{ color: C.onSurfaceVariant, padding: 20 }}>Nessun ordine registrato</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {ordini.map(order => {
                        const totaleLordo = calcolaTotaleLordo(order.righe)
                        const scontoImporto = order.tipo_sconto === 'percentuale'
                            ? totaleLordo * (parseFloat(order.sconto || 0) / 100)
                            : parseFloat(order.sconto || 0)

                        return (
                            <div key={order.id} style={{ border: `1px solid ${C.surfaceHigh}`, borderRadius: 12, overflow: 'hidden', background: C.surface }}>
                                <div
                                    onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                                    style={{ padding: 16, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: expandedOrderId === order.id ? C.surfaceLow : C.surface, borderBottom: expandedOrderId === order.id ? `1px solid ${C.surfaceHigh}` : 'none' }}
                                >
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, color: C.primary, marginBottom: 4 }}>
                                            Ordine #{order.id}
                                        </div>
                                        <div style={{ fontSize: 12, color: C.onSurfaceVariant }}>
                                            {formatTime(order.timestamp)}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontWeight: 700, fontSize: 14, color: C.primary }}>
                                                {formatMoney(order.totale)} €
                                            </div>
                                            <div style={{ fontSize: 11, color: C.onSurfaceVariant }}>
                                                {order.righe ? order.righe.length : 0} articoli
                                            </div>
                                        </div>
                                        <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.primary }}>
                                            {expandedOrderId === order.id ? '▼' : '▶'}
                                        </div>
                                    </div>
                                </div>

                                {expandedOrderId === order.id && (
                                    <div style={{ padding: 16, borderTop: `1px solid ${C.surfaceHigh}`, background: C.surfaceLow }}>
                                        <div style={{ marginBottom: 12 }}>
                                            <div style={{ fontSize: 12, color: C.onSurfaceVariant, marginBottom: 8 }}>Articoli:</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                {order.righe && order.righe.map((riga, idx) => (
                                                    <div key={idx} style={{ padding: 8, background: C.surface, borderRadius: 6, fontSize: 13 }}>
                                                        <div style={{ fontWeight: 600, color: C.onSurface }}>
                                                            {riga.nome} × {riga.quantita}
                                                        </div>
                                                        {riga.prezzo && (
                                                            <div style={{ fontSize: 11, color: C.onSurfaceVariant, marginTop: 4 }}>
                                                                Prezzo: {formatMoney(riga.prezzo)} €
                                                            </div>
                                                        )}
                                                        {riga.note && riga.note.length > 0 && (
                                                            <div style={{ fontSize: 11, color: C.onSurfaceVariant, marginTop: 4 }}>
                                                                {riga.note.map((nota, nIdx) => (
                                                                    <div key={nIdx}>Note: {nota.testo}</div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div style={{ borderTop: `1px solid ${C.surfaceHigh}`, paddingTop: 12, marginTop: 12 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                                                <span>Totale lordo:</span>
                                                <span>{formatMoney(totaleLordo)} €</span>
                                            </div>
                                            {scontoImporto > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#D87D4C', marginBottom: 6 }}>
                                                    <span>Sconto:</span>
                                                    <span>-{formatMoney(scontoImporto)} €</span>
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14, color: C.primary }}>
                                                <span>Totale:</span>
                                                <span>{formatMoney(order.totale)} €</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
