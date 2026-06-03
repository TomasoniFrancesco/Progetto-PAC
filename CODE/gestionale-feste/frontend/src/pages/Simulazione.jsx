import React, { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'

const API = '/api'
const socket = io('/', { path: '/socket.io' })

const C = {
    primary: '#005147',
    primaryContainer: '#006b5e',
    surface: '#f5f3f7',
    surfaceLow: '#efedf1',
    onSurface: '#1b1b1e',
    onSurfaceVariant: '#3e4946',
    outline: '#bec9c5',
    success: '#22c55e',
    danger: '#ef4444',
}

const MAX_SCONTRINI_PER_COLONNA = 20

export default function Simulazione() {
    const [stampanti, setStampanti] = useState([])
    const [scontriniPerStampante, setScontriniPerStampante] = useState({})  // stampante_id -> [scontrini]
    const [statoEmulatori, setStatoEmulatori] = useState({})                // stampante_id -> true/false
    const [popup, setPopup] = useState(null)
    const colonneRef = useRef({})

    function mostraPopup(messaggio, tipo = 'info') {
        setPopup({ messaggio, tipo })
        setTimeout(() => setPopup(null), 2500)
    }

    useEffect(() => {
        caricaStampanti()
        caricaStatoEmulatori()

        socket.on('stampa_renderizzata', (scontrino) => {
            setScontriniPerStampante(prev => {
                const id = scontrino.stampante_id
                const corrente = prev[id] || []
                const aggiornato = [{ ...scontrino, _id: Date.now() + Math.random() }, ...corrente].slice(0, MAX_SCONTRINI_PER_COLONNA)
                return { ...prev, [id]: aggiornato }
            })
        })

        socket.on('stampante_offline', (e) => {
            mostraPopup(`Stampante ${e.reparto} offline: ${e.errore || ''}`, 'error')
        })

        socket.on('stampa_fallita', (e) => {
            mostraPopup(`Stampa fallita su ${e.reparto} (${e.motivo})`, 'error')
        })

        return () => {
            socket.off('stampa_renderizzata')
            socket.off('stampante_offline')
            socket.off('stampa_fallita')
        }
    }, [])

    async function caricaStampanti() {
        try {
            const res = await fetch(`${API}/stampanti`)
            const dati = await res.json()
            dati.sort((a, b) => (a.porta || 0) - (b.porta || 0))
            setStampanti(dati)
        } catch (err) { console.error('Errore stampanti', err) }
    }

    async function caricaStatoEmulatori() {
        try {
            const res = await fetch(`${API}/stampe/emulatore/stato`)
            const dati = await res.json()
            const mappa = {}
            for (const e of dati) mappa[e.stampante_id] = true
            setStatoEmulatori(mappa)
        } catch (err) { console.error('Errore stato emulatori', err) }
    }

    async function toggleEmulatore(stampante) {
        const online = !!statoEmulatori[stampante.id]
        const azione = online ? 'spegni' : 'accendi'
        try {
            await fetch(`${API}/stampe/emulatore/${stampante.id}/${azione}`, { method: 'POST' })
            setStatoEmulatori(prev => ({ ...prev, [stampante.id]: !online }))
            mostraPopup(`${stampante.nome || stampante.reparto}: ${online ? 'spenta' : 'accesa'}`, 'success')
        } catch (err) {
            mostraPopup('Errore: ' + err.message, 'error')
        }
    }

    async function inviaTest(stampante) {
        try {
            const res = await fetch(`${API}/stampe/test/${stampante.id}`, { method: 'POST' })
            const dati = await res.json()
            if (dati.ok) mostraPopup(`Test inviato a ${stampante.nome}`, 'success')
            else mostraPopup(`Test fallito: ${dati.errore || dati.motivo}`, 'error')
        } catch (err) {
            mostraPopup('Errore: ' + err.message, 'error')
        }
    }

    function pulisciColonna(stampante_id) {
        setScontriniPerStampante(prev => ({ ...prev, [stampante_id]: [] }))
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.surfaceLow, fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>

            {/* Header */}
            <header style={{ padding: '14px 20px', background: C.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h1 style={{ margin: 0, fontFamily: 'Public Sans, sans-serif', fontSize: 20, fontWeight: 900 }}>🖨 Simulazione Stampanti</h1>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button type="button" onClick={() => { caricaStampanti(); caricaStatoEmulatori() }}
                        style={{ color: '#fff', border: 'none', padding: '8px 14px', background: 'rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                        ↻ Aggiorna
                    </button>
                    <a href="/cassa" style={{ color: '#fff', textDecoration: 'none', padding: '8px 14px', background: 'rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>← Torna alla Cassa</a>
                </div>
            </header>

            {/* Colonne stampanti */}
            <main style={{ flex: 1, display: 'flex', gap: 14, padding: 14, overflowX: 'auto', overflowY: 'hidden' }}>
                {stampanti.length === 0 && (
                    <div style={{ width: '100%', textAlign: 'center', color: C.onSurfaceVariant, marginTop: 60 }}>
                        Nessuna stampante configurata.<br />
                        <span style={{ fontSize: 12 }}>Riavvia il backend: alla partenza viene creata anche la stampante <strong>cassa</strong> (porta 9104).</span>
                    </div>
                )}
                {stampanti.length > 0 && !stampanti.some(s => s.reparto === 'cassa') && (
                    <div style={{ flex: '0 0 280px', padding: 16, background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 12, color: '#664d03', fontSize: 13, alignSelf: 'flex-start' }}>
                        <strong>Stampante cassa assente.</strong> Riavvia il backend Node: la migrazione la aggiunge al database. Poi clicca ↻ Aggiorna.
                    </div>
                )}
                {stampanti.map(stampante => (
                    <ColonnaStampante
                        key={stampante.id}
                        stampante={stampante}
                        scontrini={scontriniPerStampante[stampante.id] || []}
                        online={!!statoEmulatori[stampante.id]}
                        onToggle={() => toggleEmulatore(stampante)}
                        onTest={() => inviaTest(stampante)}
                        onPulisci={() => pulisciColonna(stampante.id)}
                    />
                ))}
            </main>

            {/* Popup */}
            {popup && (
                <div style={{ position: 'fixed', bottom: 20, right: 20, padding: '12px 20px', background: popup.tipo === 'error' ? C.danger : popup.tipo === 'success' ? C.success : C.primary, color: '#fff', borderRadius: 10, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 100, maxWidth: 360 }}>
                    {popup.messaggio}
                </div>
            )}
        </div>
    )
}

// ──────────────────────────────────────────────────────────────────────────────
function ColonnaStampante({ stampante, scontrini, online, onToggle, onTest, onPulisci }) {
    return (
        <section style={{ flex: '1 1 320px', minWidth: 300, maxWidth: 380, display: 'flex', flexDirection: 'column', background: C.surface, border: `1px solid ${C.outline}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>

            {/* Header colonna */}
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.outline}`, background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <h2 style={{ margin: 0, fontFamily: 'Public Sans, sans-serif', fontSize: 16, fontWeight: 900, color: C.primary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {stampante.nome || stampante.reparto}
                    </h2>
                    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: online ? '#dcfce7' : '#fee2e2', color: online ? '#166534' : '#991b1b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {online ? '● Online' : '○ Offline'}
                    </span>
                </div>
                <div style={{ fontSize: 11, color: C.onSurfaceVariant, marginBottom: 8 }}>
                    {stampante.reparto} • {stampante.indirizzo_ip}:{stampante.porta} • {stampante.modello}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={onToggle} style={btnSecondario(online ? '#fee2e2' : '#dcfce7', online ? '#991b1b' : '#166534')}>
                        {online ? '⏻ Spegni' : '⏻ Accendi'}
                    </button>
                    <button onClick={onTest} disabled={!online} style={btnSecondario(C.surfaceLow, C.onSurface, !online)}>
                        🖨 Test
                    </button>
                    <button onClick={onPulisci} style={btnSecondario(C.surfaceLow, C.onSurfaceVariant)}>
                        🗑 Pulisci
                    </button>
                </div>
            </div>

            {/* Lista scontrini */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, background: 'repeating-linear-gradient(45deg, #f5f3f7, #f5f3f7 10px, #eeece f 10px, #eeecef 20px)' }}>
                {scontrini.length === 0 && (
                    <div style={{ textAlign: 'center', color: C.onSurfaceVariant, marginTop: 40, fontSize: 13 }}>
                        <div style={{ fontSize: 40, opacity: 0.4, marginBottom: 8 }}>🧾</div>
                        Nessuno scontrino<br />ancora stampato
                    </div>
                )}
                {scontrini.map((sc, idx) => (
                    <React.Fragment key={sc._id}>
                        <Scontrino scontrino={sc} />
                        {idx === 0 && scontrini.length > 0 && <Taglio />}
                    </React.Fragment>
                ))}
            </div>
        </section>
    )
}

// ──────────────────────────────────────────────────────────────────────────────
function Scontrino({ scontrino }) {
    return (
        <div style={{ background: '#fff', borderRadius: 6, padding: '14px 14px 8px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontFamily: '"Courier New", Courier, monospace', fontSize: 13, color: '#222', lineHeight: 1.35, position: 'relative' }}>
            <div style={{ fontSize: 10, color: '#888', marginBottom: 8, textAlign: 'right' }}>
                {new Date(scontrino.timestamp).toLocaleTimeString('it-IT')}
            </div>
            {scontrino.righe.map((r, i) => (
                <RigaScontrino key={i} riga={r} />
            ))}
            <div style={{ marginTop: 8, textAlign: 'center', fontSize: 14, color: '#888' }}>✂</div>
        </div>
    )
}

function RigaScontrino({ riga }) {
    const style = {
        textAlign: riga.allineamento || 'left',
        fontWeight: riga.stili?.includes('bold') ? 700 : 400,
        fontSize: riga.stili?.includes('h2') ? 18 : 13,
        letterSpacing: riga.stili?.includes('w2') ? '0.1em' : 'normal',
        transform: riga.stili?.includes('w2') ? 'scaleX(1.4)' : 'none',
        transformOrigin: riga.allineamento === 'center' ? 'center' : riga.allineamento === 'right' ? 'right' : 'left',
        textDecoration: riga.stili?.includes('underline') ? 'underline' : 'none',
        whiteSpace: 'pre',
        minHeight: '1em',
    }
    return <div style={style}>{riga.testo || ' '}</div>
}

function Taglio() {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#666', fontSize: 11, padding: '2px 0' }}>
            <div style={{ flex: 1, borderTop: '2px dashed #c0c0c0' }} />
            <span>✂</span>
            <div style={{ flex: 1, borderTop: '2px dashed #c0c0c0' }} />
        </div>
    )
}

// ──────────────────────────────────────────────────────────────────────────────
function btnSecondario(bg, color, disabled) {
    return {
        flex: 1, padding: '6px 8px', border: 'none', borderRadius: 6,
        background: bg, color, fontWeight: 700, fontSize: 11, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1, textTransform: 'uppercase', letterSpacing: '0.04em',
        fontFamily: 'inherit',
    }
}
