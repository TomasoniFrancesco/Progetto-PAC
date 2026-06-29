import React, { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'

const API = '/api'
const socket = io('/', { path: '/socket.io' })

const C = {
    primary: '#005147',
    primaryContainer: '#006b5e',
    surface: '#faf9fc',
    surfaceLow: '#f5f3f7',
    surfaceHigh: '#e9e7eb',
    onSurface: '#1b1b1e',
    onSurfaceVariant: '#3e4946',
    outline: '#bec9c5',
    stabile: '#22c55e',
    attenzione: '#eab308',
    urgente: '#ef4444',
    esaurito: '#52525b',
}

const ICONA_STATO = { stabile: '🟢', attenzione: '🟡', urgente: '🔴', esaurito: '⚫' }

const INTERVALLI_POLLING = [
    { label: '10s', valore: 10 },
    { label: '30s', valore: 30 },
    { label: '60s', valore: 60 },
    { label: 'Manuale', valore: 0 },
]

export default function Predittore() {
    const [risposta, setRisposta] = useState(null)
    const [errore, setErrore] = useState(null)
    const [caricamento, setCaricamento] = useState(true)
    const [filtroStato, setFiltroStato] = useState('tutti')
    const [filtroReparto, setFiltroReparto] = useState('tutti')
    const [intervalloPolling, setIntervalloPolling] = useState(30)
    const [vociLampeggio, setVociLampeggio] = useState(new Set())
    const intervalRef = useRef(null)

    useEffect(() => {
        carica()
        socket.on('predittore_alert', payload => {
            // Marca le voci alert per lampeggio
            const ids = new Set(payload.map(p => p.voce_id))
            setVociLampeggio(prev => new Set([...prev, ...ids]))
            // Ricarica subito
            carica()
            // Spegni lampeggio dopo 5s
            setTimeout(() => {
                setVociLampeggio(prev => {
                    const ns = new Set(prev)
                    for (const id of ids) ns.delete(id)
                    return ns
                })
            }, 5000)
        })
        return () => socket.off('predittore_alert')
    }, [])

    useEffect(() => {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
        if (intervalloPolling > 0) {
            intervalRef.current = setInterval(carica, intervalloPolling * 1000)
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
    }, [intervalloPolling])

    async function carica() {
        try {
            const r = await fetch(`${API}/predittore/scorte`)
            const dati = await r.json()
            setRisposta(dati)
            setErrore(null)
        } catch (err) {
            setErrore(err.message)
        } finally { setCaricamento(false) }
    }

    if (caricamento) {
        return <div style={{ padding: 40, textAlign: 'center', color: C.primary }}>Caricamento predizioni...</div>
    }
    if (errore) {
        return <div style={{ padding: 40, textAlign: 'center', color: C.urgente }}>Errore: {errore}</div>
    }

    const predizioni = risposta?.predizioni || []
    const conteggi = risposta?.conteggi || {}
    const reparti = [...new Set(predizioni.map(p => p.reparto).filter(Boolean))].sort()

    let predizioniFiltrate = predizioni
    if (filtroStato !== 'tutti') predizioniFiltrate = predizioniFiltrate.filter(p => p.stato === filtroStato)
    if (filtroReparto !== 'tutti') predizioniFiltrate = predizioniFiltrate.filter(p => p.reparto === filtroReparto)

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.surfaceLow, fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>

            {/* Header */}
            <header style={{ padding: '14px 20px', background: C.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h1 style={{ margin: 0, fontFamily: 'Public Sans, sans-serif', fontSize: 20, fontWeight: 900 }}>📊 Predittore Scorte</h1>
                    <p style={{ margin: '2px 0 0', fontSize: 12, opacity: 0.85 }}>
                        Aggiornato alle {risposta && new Date(risposta.generato_a).toLocaleTimeString('it-IT')}
                    </p>
                </div>
                <a href="/cassa" style={{ color: '#fff', textDecoration: 'none', padding: '8px 14px', background: 'rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>← Torna alla Cassa</a>
            </header>

            {/* Tabs di stato + filtri */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: C.surface, borderBottom: `1px solid ${C.surfaceHigh}`, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                    {[
                        { id: 'tutti', label: 'Tutti', n: conteggi.totale, color: C.onSurfaceVariant },
                        { id: 'urgente', label: 'Urgenti', n: conteggi.urgente, color: C.urgente },
                        { id: 'attenzione', label: 'Attenzione', n: conteggi.attenzione, color: C.attenzione },
                        { id: 'esaurito', label: 'Esauriti', n: conteggi.esaurito, color: C.esaurito },
                        { id: 'stabile', label: 'Stabili', n: conteggi.stabile, color: C.stabile },
                    ].map(t => (
                        <button key={t.id} onClick={() => setFiltroStato(t.id)}
                            style={{ padding: '8px 14px', border: filtroStato === t.id ? `2px solid ${t.color}` : `1px solid ${C.outline}`, borderRadius: 8, background: filtroStato === t.id ? `${t.color}20` : '#fff', color: t.color, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                            {t.label} <span style={{ marginLeft: 6, padding: '1px 8px', background: t.color, color: '#fff', borderRadius: 12, fontSize: 11 }}>{t.n ?? 0}</span>
                        </button>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <label style={{ fontSize: 12, color: C.onSurfaceVariant }}>Reparto:</label>
                    <select value={filtroReparto} onChange={e => setFiltroReparto(e.target.value)}
                        style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.outline}`, fontSize: 13 }}>
                        <option value="tutti">Tutti</option>
                        {reparti.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <label style={{ fontSize: 12, color: C.onSurfaceVariant }}>Refresh:</label>
                    <select value={intervalloPolling} onChange={e => setIntervalloPolling(parseInt(e.target.value))}
                        style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.outline}`, fontSize: 13 }}>
                        {INTERVALLI_POLLING.map(i => <option key={i.valore} value={i.valore}>{i.label}</option>)}
                    </select>
                    <button onClick={carica}
                        style={{ padding: '6px 12px', background: C.primary, color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                        ↻ Aggiorna
                    </button>
                </div>
            </div>

            {/* Tabella */}
            <main style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <thead>
                        <tr style={{ background: C.surfaceLow, borderBottom: `2px solid ${C.surfaceHigh}` }}>
                            <th style={hStyle}>Stato</th>
                            <th style={hStyle}>Voce</th>
                            <th style={hStyle}>Reparto</th>
                            <th style={hStyle}>Priorità</th>
                            <th style={hStyleR}>Qty</th>
                            <th style={hStyleR}>C 15min</th>
                            <th style={hStyleR}>C 1h</th>
                            <th style={hStyleR}>Storico/h</th>
                            <th style={hStyle}>Modalità</th>
                            <th style={hStyleR}>T esaur.</th>
                            <th style={hStyleR}>U</th>
                            <th style={hStyleR}>Suggerimento</th>
                        </tr>
                    </thead>
                    <tbody>
                        {predizioniFiltrate.length === 0 && (
                            <tr><td colSpan={12} style={{ padding: 30, textAlign: 'center', color: C.onSurfaceVariant }}>Nessuna voce trovata con i filtri correnti</td></tr>
                        )}
                        {predizioniFiltrate.map(p => (
                            <Riga key={p.voce_id} p={p} lampeggia={vociLampeggio.has(p.voce_id)} />
                        ))}
                    </tbody>
                </table>
            </main>

            <style>{`
                @keyframes lampeggia {
                    0%, 100% { background-color: #fff; }
                    50% { background-color: #fee2e2; }
                }
                .lampeggia { animation: lampeggia 1s ease-in-out infinite; }
                .pulse-urgente { animation: lampeggia 2s ease-in-out infinite; }
            `}</style>
        </div>
    )
}

function Riga({ p, lampeggia }) {
    const colore = p.stato === 'urgente' ? C.urgente : p.stato === 'attenzione' ? C.attenzione : p.stato === 'esaurito' ? C.esaurito : C.stabile
    return (
        <tr className={lampeggia ? 'lampeggia' : (p.stato === 'urgente' ? 'pulse-urgente' : '')}
            style={{ borderBottom: `1px solid ${C.surfaceHigh}` }}>
            <td style={tStyle}>
                <span style={{ padding: '4px 10px', borderRadius: 12, background: `${colore}25`, color: colore, fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>
                    {ICONA_STATO[p.stato]} {p.stato}
                </span>
            </td>
            <td style={tStyle}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.nome}</div>
                <div style={{ fontSize: 10, color: C.onSurfaceVariant }}>{p.codice}</div>
            </td>
            <td style={tStyle}>{p.reparto || '—'}</td>
            <td style={tStyle}>
                <span style={{ fontSize: 11, fontWeight: 700, color: p.priorita === 'alta' ? C.urgente : p.priorita === 'media' ? C.attenzione : C.onSurfaceVariant }}>
                    {p.priorita}
                </span>
            </td>
            <td style={tStyleR}>{p.scorta_attiva ? p.quantita_attuale : '∞'}</td>
            <td style={tStyleR}>{p.consumo_15min}</td>
            <td style={tStyleR}>{p.consumo_1h}</td>
            <td style={tStyleR}>{p.media_storica_unita_ora.toFixed(1)} <span style={{ fontSize: 9, color: C.onSurfaceVariant }}>({p.occorrenze_storiche})</span></td>
            <td style={tStyle}>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: p.modalita === 'picco' ? '#fef3c7' : p.modalita === 'prudente' ? '#dbeafe' : '#f3f4f6', color: p.modalita === 'picco' ? '#92400e' : p.modalita === 'prudente' ? '#1e40af' : '#374151', fontWeight: 700 }}>
                    {p.modalita === 'picco' && '🔥 '}{p.modalita}
                </span>
            </td>
            <td style={tStyleR}>{p.tempo_esaurimento_sec == null ? '∞' : formatTempo(p.tempo_esaurimento_sec)}</td>
            <td style={{ ...tStyleR, fontWeight: 800, color: colore }}>{p.U.toFixed(1)}</td>
            <td style={tStyleR}>{p.suggerimento ? <span style={{ fontWeight: 700, color: C.urgente }}>+{p.suggerimento.quantita}</span> : '—'}</td>
        </tr>
    )
}

function formatTempo(sec) {
    if (sec < 60) return `${sec}s`
    if (sec < 3600) return `${Math.floor(sec / 60)}m`
    return `${(sec / 3600).toFixed(1)}h`
}

const hStyle = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: C.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.05em' }
const hStyleR = { ...hStyle, textAlign: 'right' }
const tStyle = { padding: '10px 12px', fontSize: 13, color: C.onSurface }
const tStyleR = { ...tStyle, textAlign: 'right', fontFamily: 'monospace' }
