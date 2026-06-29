import React from 'react'
import { C, statusInfo, getTextColorForBackground } from './theme'

// Griglia dei prodotti raggruppati per settore, con bilanciamento delle colonne.
// onAggiungi(voce) aggiunge la voce all'ordine; onApriAllergeniVoce({id,nome})
// apre la modale allergeni della singola voce dal badge "i".
export default function GrigliaProdotti({ vociPerSettore, scorteMap, allergeniPerVoce, onAggiungi, onApriAllergeniVoce }) {
    return (
        <div style={{ display: 'flex', gap: 14, height: '100%', overflow: 'hidden' }}>
            {Object.entries(vociPerSettore).map(([settore, vociSettore]) => {
                const numArticoli = vociSettore.length || 1
                const maxRighe = 6
                const numColonne = Math.ceil(numArticoli / maxRighe)
                const righeEffettive = Math.ceil(numArticoli / numColonne)

                return (
                    <div key={settore} style={{ flex: numColonne, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, minHeight: 0 }}>
                        <div style={{ paddingBottom: 8, borderBottom: `3px solid ${C.primary}` }}>
                            <span style={{ fontSize: 14, fontWeight: 900, color: C.primary, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'Public Sans, sans-serif' }}>
                                {settore}
                            </span>
                        </div>

                        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 8 }}>
                            {Array.from({ length: numColonne }, (_, i) => {
                                const colonnaItems = vociSettore.slice(i * righeEffettive, (i + 1) * righeEffettive)
                                return (
                                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
                                        {colonnaItems.map(voce => (
                                            <BottoneVoce
                                                key={voce.id}
                                                voce={voce}
                                                scorteMap={scorteMap}
                                                haAllergeni={(allergeniPerVoce[voce.id] || []).length > 0}
                                                onAggiungi={onAggiungi}
                                                onApriAllergeniVoce={onApriAllergeniVoce}
                                            />
                                        ))}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

function BottoneVoce({ voce, scorteMap, haAllergeni, onAggiungi, onApriAllergeniVoce }) {
    const { color, label, disabled } = statusInfo(voce, scorteMap)
    const backgroundColor = voce.colore_tasto || C.surfaceLowest
    const textColor = getTextColorForBackground(backgroundColor)
    const isCustomColor = voce.colore_tasto && voce.colore_tasto !== C.surfaceLowest
    const nomeLungo = (voce.nome || '').length > 18
    const fontSizeNome = nomeLungo ? 'clamp(11.5px, 1.1vw, 15px)' : 'clamp(13px, 1.3vw, 18px)'
    const fontSizePrezzo = 'clamp(13px, 1.2vw, 16px)'

    return (
        <button onClick={() => onAggiungi(voce)} disabled={disabled}
            style={{ position: 'relative', background: backgroundColor, border: 'none', borderRadius: 12, padding: '8px 8px 7px', textAlign: 'left', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', transition: 'transform 0.1s, box-shadow 0.1s', minHeight: 0, overflow: 'hidden', flex: 1 }}
            onMouseDown={e => { if (!disabled) { e.currentTarget.style.transform = 'scale(0.95)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,81,71,0.12)' } }}
            onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)' }}
        >
            <span
                onClick={e => { e.stopPropagation(); onApriAllergeniVoce({ id: voce.id, nome: voce.nome }) }}
                style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: haAllergeni ? 'rgba(0,0,0,0.52)' : 'rgba(0,0,0,0.18)', color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 2, lineHeight: 1, userSelect: 'none', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}
            >i</span>
            <h3 style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 800, fontSize: fontSizeNome, color: isCustomColor ? textColor : C.onSurface, margin: 0, lineHeight: 1.15, textAlign: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflowWrap: 'anywhere', wordBreak: 'break-word', padding: '0 2px' }}>{voce.nome}</h3>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800, color: isCustomColor ? textColor : C.onSurfaceVariant, opacity: 0.9 }}>{label}</span>
                </div>
                <p style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 900, fontSize: fontSizePrezzo, color: isCustomColor ? textColor : C.primary, margin: 0, opacity: isCustomColor ? 0.9 : 1, whiteSpace: 'nowrap' }}>€ {parseFloat(voce.prezzo).toFixed(2)}</p>
            </div>
        </button>
    )
}
