import React from 'react'
import { C, overlayStyle, modaleStyle } from './theme'

// Tastierino numerico per inserire l'importo pagato.
export default function ModaleTastierino({ importoTemp, gestisci, onAzzera, onConferma, onChiudi }) {
    return (
        <div style={overlayStyle} onClick={onChiudi}>
            <div style={{ ...modaleStyle, minWidth: 320, maxWidth: 360, padding: 24 }} onClick={e => e.stopPropagation()}>
                <h3 style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 800, fontSize: 18, margin: '0 0 16px', color: C.primary, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Inserisci Importo
                </h3>

                <div style={{ background: C.surfaceLowest, border: `2px solid ${C.outline}`, borderRadius: 12, padding: '16px', fontSize: 28, fontWeight: 900, color: C.onSurface, textAlign: 'right', marginBottom: 20, minHeight: 64, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontFamily: 'monospace', boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.04)' }}>
                    {importoTemp ? `€ ${importoTemp}` : '0.00'}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
                    {['7', '8', '9', '4', '5', '6', '1', '2', '3', ',', '0', 'DEL'].map(tasto => (
                        <button key={tasto} onClick={() => gestisci(tasto)}
                            style={{ background: tasto === 'DEL' ? '#fee2e2' : C.surfaceHigh, color: tasto === 'DEL' ? '#991b1b' : C.onSurface, border: 'none', borderRadius: 12, padding: '18px 0', fontSize: 22, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.1s, background 0.1s', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
                            onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.92)'; e.currentTarget.style.background = tasto === 'DEL' ? '#fca5a5' : C.surfaceHighest; }}
                            onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = tasto === 'DEL' ? '#fee2e2' : C.surfaceHigh; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = tasto === 'DEL' ? '#fee2e2' : C.surfaceHigh; }}
                        >
                            {tasto === 'DEL' ? '⌫' : tasto}
                        </button>
                    ))}
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={onAzzera}
                        style={{ flex: 1, padding: 16, border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 800, fontSize: 16, background: C.surfaceHigh, color: C.onSurface, transition: 'background 0.1s' }}
                        onMouseDown={e => e.currentTarget.style.background = C.surfaceHighest}
                        onMouseUp={e => e.currentTarget.style.background = C.surfaceHigh}
                        onMouseLeave={e => e.currentTarget.style.background = C.surfaceHigh}>
                        AZZERA
                    </button>
                    <button onClick={onConferma}
                        style={{ flex: 2, padding: 16, border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 900, fontSize: 16, background: `linear-gradient(135deg, ${C.primary}, ${C.primaryContainer})`, color: '#fff', boxShadow: '0 4px 12px rgba(0,81,71,0.2)' }}>
                        CONFERMA ✓
                    </button>
                </div>
            </div>
        </div>
    )
}
