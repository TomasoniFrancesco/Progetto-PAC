import React, { useState, useEffect, useCallback } from 'react'
import { io } from 'socket.io-client'

const API = '/api'
const socket = io('/', { path: '/socket.io' })

// Calcola il colore del tasto in base allo stato scorta
function coloreTasto(voce, scorteMap) {
    const scorta = scorteMap[voce.id]
    if (!scorta || !scorta.attiva) return voce.colore_tasto || '#4A90D9'
    if (scorta.quantita === 0) return '#555'
    if (scorta.stato_visivo === 'critico') return '#e74c3c'
    if (scorta.stato_visivo === 'attenzione') return '#f39c12'
    return voce.colore_tasto || '#4A90D9'
}

export default function Cassa() {
    const [voci, setVoci] = useState([])
    const [scorteMap, setScorteMap] = useState({})
    const [righe, setRighe] = useState([])
    const [asporto, setAsporto] = useState(false)
    const [importoPagato, setImportoPagato] = useState('')
    const [caricamento, setCaricamento] = useState(true)

    // Raggruppa le voci per settore di visualizzazione con ordine personalizzato
    const ordineSettori = ['bar', 'primi', 'secondi', 'contorni', 'dolce', 'dolci']
    const settori = [...new Set(voci.map(v => v.settore_visualizzazione))]
        .filter(Boolean)
        .sort((a, b) => {
            const aNorm = String(a || '').trim().toLowerCase()
            const bNorm = String(b || '').trim().toLowerCase()
            const aIdx = ordineSettori.indexOf(aNorm)
            const bIdx = ordineSettori.indexOf(bNorm)
            const aPriority = aIdx === -1 ? Number.MAX_SAFE_INTEGER : aIdx
            const bPriority = bIdx === -1 ? Number.MAX_SAFE_INTEGER : bIdx
            if (aPriority !== bPriority) return aPriority - bPriority
            return aNorm.localeCompare(bNorm, 'it')
        })

    const totale = righe.reduce((acc, r) => acc + (r.prezzo * r.quantita), 0)
    const resto = importoPagato ? (parseFloat(importoPagato) - totale).toFixed(2) : null
    const colonneMenu = Math.min(Math.max(settori.length, 1), 6)
    const ordinaVociSettore = (a, b) => {
        const ordineA = Number(a.ordine_schermo ?? 0)
        const ordineB = Number(b.ordine_schermo ?? 0)
        if (ordineA !== ordineB) return ordineA - ordineB
        return String(a.nome || '').localeCompare(String(b.nome || ''), 'it', { sensitivity: 'base' })
    }

    useEffect(() => {
        caricaMenu()
        caricaScorte()

        // Aggiornamento scorte in tempo reale via WebSocket
        socket.on('scorte_aggiornate', (nuoveScorte) => {
            const mappa = {}
            nuoveScorte.forEach(s => { mappa[s.voce_id] = s })
            setScorteMap(mappa)
        })

        return () => socket.off('scorte_aggiornate')
    }, [])

    async function caricaMenu() {
        try {
            const res = await fetch(`${API}/menu`)
            const dati = await res.json()
            setVoci(dati)
        } catch (err) {
            console.error('Errore caricamento menu', err)
        } finally {
            setCaricamento(false)
        }
    }

    async function caricaScorte() {
        try {
            const res = await fetch(`${API}/scorte`)
            const dati = await res.json()
            const mappa = {}
            dati.forEach(s => { mappa[s.voce_id] = s })
            setScorteMap(mappa)
        } catch (err) {
            console.error('Errore caricamento scorte', err)
        }
    }

    function aggiungiVoce(voce) {
        const scorta = scorteMap[voce.id]
        if (scorta && scorta.attiva && scorta.quantita === 0) return

        setRighe(prev => {
            const esistente = prev.find(r => r.voce_id === voce.id)
            if (esistente) {
                return prev.map(r => r.voce_id === voce.id
                    ? { ...r, quantita: r.quantita + 1 }
                    : r
                )
            }
            return [...prev, {
                voce_id: voce.id,
                nome: voce.nome,
                prezzo: parseFloat(voce.prezzo),
                quantita: 1,
                note: []
            }]
        })
    }

    function rimuoviVoce(voce_id) {
        setRighe(prev => prev.filter(r => r.voce_id !== voce_id))
    }

    function azzeraOrdine() {
        setRighe([])
        setAsporto(false)
        setImportoPagato('')
    }

    async function confermaOrdine() {
        if (!righe.length) return

        try {
            const resOrdine = await fetch(`${API}/ordini`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ righe })
            })
            const { id } = await resOrdine.json()

            await fetch(`${API}/ordini/${id}/conferma`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    asporto,
                    importo_pagato: importoPagato ? parseFloat(importoPagato) : null
                })
            })

            azzeraOrdine()
            alert('Ordine confermato')
        } catch (err) {
            alert('Errore durante la conferma: ' + err.message)
        }
    }

    if (caricamento) return <div style={{ padding: 40, textAlign: 'center' }}>Caricamento menu...</div>

    return (
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

            {/* Colonna sinistra: menu */}
            <div style={{ flex: '0 0 66.666%', maxWidth: '66.666%', overflowY: 'auto', padding: '0 12px 12px 12px', background: '#16213e' }}>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colonneMenu}, minmax(0, 1fr))`, gap: 12, alignItems: 'stretch', minHeight: 'calc(100vh - 12px)' }}>
                    {settori.map(settore => {
                        const vociSettore = voci
                            .filter(v => v.settore_visualizzazione === settore)
                            .sort(ordinaVociSettore)
                        const usaRiempimento = vociSettore.length > 0 && vociSettore.length <= 6
                        return (
                    <div key={settore} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                        <h3 style={{ color: '#aaa', fontSize: '0.9rem', textTransform: 'uppercase', margin: 0, letterSpacing: 1, position: 'sticky', top: 0, zIndex: 10, background: '#16213e', padding: '12px 8px 10px 8px', minHeight: 44, display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            {settore}
                        </h3>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr',
                                gridTemplateRows: usaRiempimento ? `repeat(${vociSettore.length}, minmax(96px, 1fr))` : undefined,
                                gridAutoRows: usaRiempimento ? undefined : 'minmax(96px, auto)',
                                gap: 8,
                                paddingTop: 8,
                                flex: 1,
                                minHeight: 0,
                                overflowY: usaRiempimento ? 'hidden' : 'auto'
                            }}
                        >
                            {vociSettore.map(voce => {
                                const scorta = scorteMap[voce.id]
                                const esaurito = scorta && scorta.attiva && scorta.quantita === 0
                                return (
                                    <button
                                        key={voce.id}
                                        onClick={() => aggiungiVoce(voce)}
                                        disabled={esaurito}
                                        style={{
                                            background: coloreTasto(voce, scorteMap),
                                            color: '#fff',
                                            padding: '14px 8px',
                                            borderRadius: 8,
                                            fontSize: '0.9rem',
                                            textAlign: 'center',
                                            lineHeight: 1.3,
                                            opacity: esaurito ? 0.4 : 1,
                                            minHeight: 96
                                        }}
                                    >
                                        {voce.nome}
                                        <div style={{ fontSize: '0.8rem', marginTop: 4, opacity: 0.9 }}>
                                            {parseFloat(voce.prezzo).toFixed(2)} €
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )})}
                </div>
            </div>

            {/* Colonna destra: riepilogo ordine */}
            <div style={{ flex: '1 1 33.334%', display: 'flex', flexDirection: 'column', background: '#0f3460', minWidth: 280 }}>

                {/* Header */}
                <div style={{ padding: '12px 16px', background: '#e94560', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                        {asporto ? 'ASPORTO' : 'ORDINE'}
                    </span>
                    <button
                        onClick={() => setAsporto(a => !a)}
                        style={{ background: asporto ? '#fff' : 'rgba(255,255,255,0.2)', color: asporto ? '#e94560' : '#fff', padding: '4px 10px', fontSize: '0.8rem' }}
                    >
                        asporto
                    </button>
                </div>

                {/* Lista righe */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                    {righe.length === 0 && (
                        <div style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>
                            Nessuna voce selezionata
                        </div>
                    )}
                    {righe.map(riga => (
                        <div key={riga.voce_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            <div>
                                <div style={{ fontWeight: 600 }}>{riga.nome}</div>
                                <div style={{ color: '#aaa', fontSize: '0.85rem' }}>x{riga.quantita} — {(riga.prezzo * riga.quantita).toFixed(2)} €</div>
                            </div>
                            <button onClick={() => rimuoviVoce(riga.voce_id)} style={{ background: 'rgba(255,0,0,0.3)', color: '#fff', padding: '4px 8px', fontSize: '0.8rem' }}>
                                x
                            </button>
                        </div>
                    ))}
                </div>

                {/* Totale e pagamento */}
                <div style={{ padding: 16, background: 'rgba(0,0,0,0.3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.3rem', fontWeight: 700, marginBottom: 12 }}>
                        <span>Totale</span>
                        <span>{totale.toFixed(2)} €</span>
                    </div>

                    <input
                        type="number"
                        placeholder="Importo pagato"
                        value={importoPagato}
                        onChange={e => setImportoPagato(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '1rem', marginBottom: 8 }}
                    />

                    {resto !== null && (
                        <div style={{ textAlign: 'right', color: parseFloat(resto) >= 0 ? '#2ecc71' : '#e74c3c', fontWeight: 700, marginBottom: 12 }}>
                            Resto: {resto} €
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={azzeraOrdine} style={{ flex: 1, background: '#555', color: '#fff', padding: 12 }}>
                            Azzera
                        </button>
                        <button onClick={confermaOrdine} disabled={!righe.length} style={{ flex: 2, background: '#2ecc71', color: '#fff', padding: 12 }}>
                            Conferma
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
