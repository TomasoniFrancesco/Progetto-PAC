import React, { useState } from 'react'
import { API, C } from './shared'

// Tabella scorte con rifornimento rapido inline.
export default function GestioneScorte({ scorte, onAggiornato }) {
    const [pannelloScorte, setPannelloScorte] = useState(null)
    const [caricamentoRifornimento, setCaricamentoRifornimento] = useState({})
    const [quantitaRifornimento, setQuantitaRifornimento] = useState({})

    async function rifornisci(voceId, quantita) {
        if (!quantita || quantita <= 0) return
        setCaricamentoRifornimento(prev => ({ ...prev, [voceId]: true }))
        try {
            await fetch(`${API}/scorte/${voceId}/rifornimento`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantita: parseInt(quantita) })
            })
            setQuantitaRifornimento(prev => ({ ...prev, [voceId]: '' }))
            onAggiornato()
        } catch (err) { console.error(err) }
        finally { setCaricamentoRifornimento(prev => ({ ...prev, [voceId]: false })) }
    }

    return (
        <div>
            <div style={{ fontFamily: 'Public Sans, sans-serif', fontSize: '1.1rem', fontWeight: 800, color: C.primary, marginBottom: 16 }}>
                Gestione Scorte
            </div>
            {scorte.length === 0 ? (
                <div style={{ color: C.onSurfaceVariant, padding: 20 }}>Nessun articolo in scorta</div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table className="pietanze-tabella">
                        <thead>
                            <tr>
                                <th>Articolo</th>
                                <th>Quantità</th>
                                <th>Soglia Giallo</th>
                                <th>Soglia Rosso</th>
                                <th style={{ background: '#fffbea', color: '#8B6914', fontWeight: 700 }}>Stato Giallo</th>
                                <th style={{ background: '#ffedea', color: '#8B3E36', fontWeight: 700 }}>Stato Critico</th>
                                <th>Azioni</th>
                            </tr>
                        </thead>
                        <tbody>
                            {scorte.map(item => (
                                <tr key={item.voce_id}>
                                    <td style={{ fontWeight: 600 }}>{item.nome}</td>
                                    <td>
                                        <span style={{
                                            padding: '4px 8px', borderRadius: 6, background:
                                            item.quantita === 0 ? '#f5f3f7' :
                                            item.quantita <= item.soglia_rosso ? '#ffedea' :
                                            item.quantita <= item.soglia_giallo ? '#fffbea' :
                                            '#e7f6f5',
                                            fontWeight: 600
                                        }}>
                                            {item.quantita}
                                        </span>
                                    </td>
                                    <td>{item.soglia_giallo}</td>
                                    <td>{item.soglia_rosso}</td>
                                    <td style={{ textAlign: 'center', background: '#fffbea', color: item.quantita > item.soglia_giallo ? '#ccc' : '#F4A460', fontWeight: 700 }}>
                                        {item.quantita <= item.soglia_giallo && item.quantita > item.soglia_rosso ? '⚠' : '—'}
                                    </td>
                                    <td style={{ textAlign: 'center', background: '#ffedea', color: item.quantita > item.soglia_rosso ? '#ccc' : '#DC143C', fontWeight: 700 }}>
                                        {item.quantita <= item.soglia_rosso ? '🔴' : '—'}
                                    </td>
                                    <td>
                                        <button
                                            onClick={() => setPannelloScorte(pannelloScorte === item.voce_id ? null : item.voce_id)}
                                            style={{ padding: '6px 12px', background: C.primary, color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                                        >
                                            Rifornisci
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {pannelloScorte && (
                <div style={{ marginTop: 32, padding: 20, background: C.surface, border: `1px solid ${C.surfaceHigh}`, borderRadius: 12 }}>
                    {(() => {
                        const item = scorte.find(s => s.voce_id === pannelloScorte)
                        return item ? (
                            <div>
                                <div style={{ fontWeight: 600, marginBottom: 16, color: C.primary }}>{item.nome}</div>
                                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                                    <div style={{ flex: 1 }}>
                                        <label className="campo-label">Quantità da aggiungere</label>
                                        <input
                                            className="campo-input"
                                            type="number"
                                            min="1"
                                            value={quantitaRifornimento[pannelloScorte] || ''}
                                            onChange={e => setQuantitaRifornimento(prev => ({ ...prev, [pannelloScorte]: e.target.value }))}
                                            placeholder="Inserisci quantità"
                                        />
                                    </div>
                                    <button
                                        onClick={() => rifornisci(pannelloScorte, quantitaRifornimento[pannelloScorte])}
                                        disabled={caricamentoRifornimento[pannelloScorte]}
                                        style={{ padding: '10px 20px', background: C.primary, color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
                                    >
                                        {caricamentoRifornimento[pannelloScorte] ? 'Salvataggio...' : 'Salva'}
                                    </button>
                                    <button
                                        onClick={() => setPannelloScorte(null)}
                                        style={{ padding: '10px 20px', background: C.surfaceHigh, color: C.onSurface, border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
                                    >
                                        Chiudi
                                    </button>
                                </div>
                            </div>
                        ) : null
                    })()}
                </div>
            )}
        </div>
    )
}
