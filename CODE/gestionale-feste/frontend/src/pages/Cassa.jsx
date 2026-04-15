import React, { useState, useEffect } from 'react'
import { io } from 'socket.io-client'

const API = '/api'
const socket = io('/', { path: '/socket.io' })

function coloreTasto(voce, scorteMap) {
    const scorta = scorteMap[voce.id]
    if (!scorta || !scorta.attiva) return voce.colore_tasto || '#4A90D9'
    if (scorta.quantita === 0) return '#555'
    if (scorta.stato_visivo === 'critico') return '#e74c3c'
    if (scorta.stato_visivo === 'attenzione') return '#f39c12'
    return voce.colore_tasto || '#4A90D9'
}

const btnBase = { border: 'none', borderRadius: 4, cursor: 'pointer', color: '#fff' }

export default function Cassa() {
    const [voci, setVoci] = useState([])
    const [scorteMap, setScorteMap] = useState({})
    const [righe, setRighe] = useState([])
    const [asporto, setAsporto] = useState(false)
    const [importoPagato, setImportoPagato] = useState('')
    const [caricamento, setCaricamento] = useState(true)

    // Scontistica
    const [scontoValore, setScontoValore] = useState('')
    const [scontoTipo, setScontoTipo] = useState('percentuale')
    const [modaleScontistica, setModaleScontistica] = useState(false)

    // Modifica riga (espansione inline)
    const [rigaAperta, setRigaAperta] = useState(null) // voce_id

    // Allergeni
    const [modaleAllergeni, setModaleAllergeni] = useState(false)
    const [allergeniDati, setAllergeniDati] = useState({})
    const [caricaAllergeni, setCaricaAllergeni] = useState(false)

    // Stock limitato
    const [modaleStock, setModaleStock] = useState(false)

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
    const scontoNum = parseFloat(scontoValore) || 0
    const scontoImporto = scontoNum > 0
        ? (scontoTipo === 'percentuale' ? totale * (scontoNum / 100) : Math.min(scontoNum, totale))
        : 0
    const totaleNetto = totale - scontoImporto
    const resto = importoPagato ? (parseFloat(importoPagato) - totaleNetto).toFixed(2) : null
    const colonneMenu = Math.min(Math.max(settori.length, 1), 6)

    const ordinaVociSettore = (a, b) => {
        const ordineA = Number(a.ordine_schermo ?? 0)
        const ordineB = Number(b.ordine_schermo ?? 0)
        if (ordineA !== ordineB) return ordineA - ordineB
        return String(a.nome || '').localeCompare(String(b.nome || ''), 'it', { sensitivity: 'base' })
    }

    const vociStockLimitato = voci
        .filter(v => {
            const s = scorteMap[v.id]
            return s && s.attiva && (s.quantita === 0 || s.stato_visivo === 'critico' || s.stato_visivo === 'attenzione')
        })
        .map(v => ({ ...v, scorta: scorteMap[v.id] }))

    useEffect(() => {
        caricaMenu()
        caricaScorte()
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
            setVoci(await res.json())
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
                return prev.map(r => r.voce_id === voce.id ? { ...r, quantita: r.quantita + 1 } : r)
            }
            return [...prev, { voce_id: voce.id, nome: voce.nome, prezzo: parseFloat(voce.prezzo), quantita: 1, note: [] }]
        })
    }

    function rimuoviVoce(voce_id) {
        setRighe(prev => prev.filter(r => r.voce_id !== voce_id))
        if (rigaAperta === voce_id) setRigaAperta(null)
    }

    function cambiaQuantita(voce_id, delta) {
        setRighe(prev => prev.map(r =>
            r.voce_id === voce_id ? { ...r, quantita: Math.max(1, r.quantita + delta) } : r
        ))
    }

    function salvaNote(voce_id, numero_porzione, testo) {
        setRighe(prev => prev.map(r => {
            if (r.voce_id !== voce_id) return r
            const altre = r.note.filter(n => n.numero_porzione !== numero_porzione)
            const nuove = testo.trim() ? [...altre, { numero_porzione, testo: testo.trim(), costo_aggiuntivo: 0 }] : altre
            return { ...r, note: nuove }
        }))
    }

    function azzeraOrdine() {
        setRighe([])
        setAsporto(false)
        setImportoPagato('')
        setScontoValore('')
        setRigaAperta(null)
    }

    async function apriAllergeni() {
        setModaleAllergeni(true)
        setCaricaAllergeni(true)
        try {
            const risultati = {}
            await Promise.all(righe.map(async r => {
                const res = await fetch(`${API}/menu/${r.voce_id}/allergeni`)
                risultati[r.voce_id] = await res.json()
            }))
            setAllergeniDati(risultati)
        } catch (err) {
            console.error('Errore allergeni', err)
        } finally {
            setCaricaAllergeni(false)
        }
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
                    sconto: scontoNum || 0,
                    tipo_sconto: scontoTipo,
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

    const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }
    const modaleStyle = { background: '#1a2744', borderRadius: 10, padding: 24, minWidth: 360, maxWidth: 480, maxHeight: '80vh', overflowY: 'auto', color: '#fff' }

    return (
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

            {/* ── Colonna sinistra: menu ── */}
            <div style={{ flex: '0 0 66.666%', maxWidth: '66.666%', overflowY: 'auto', padding: '0 12px 12px 12px', background: '#16213e' }}>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colonneMenu}, minmax(0, 1fr))`, gap: 12, alignItems: 'stretch', minHeight: 'calc(100vh - 12px)' }}>
                    {settori.map(settore => {
                        const vociSettore = voci.filter(v => v.settore_visualizzazione === settore).sort(ordinaVociSettore)
                        const usaRiempimento = vociSettore.length > 0 && vociSettore.length <= 6
                        return (
                            <div key={settore} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                <h3 style={{ color: '#aaa', fontSize: '0.9rem', textTransform: 'uppercase', margin: 0, letterSpacing: 1, position: 'sticky', top: 0, zIndex: 10, background: '#16213e', padding: '12px 8px 10px 8px', minHeight: 44, display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                    {settore}
                                </h3>
                                <div style={{
                                    display: 'grid', gridTemplateColumns: '1fr',
                                    gridTemplateRows: usaRiempimento ? `repeat(${vociSettore.length}, minmax(96px, 1fr))` : undefined,
                                    gridAutoRows: usaRiempimento ? undefined : 'minmax(96px, auto)',
                                    gap: 8, paddingTop: 8, flex: 1, minHeight: 0,
                                    overflowY: usaRiempimento ? 'hidden' : 'auto'
                                }}>
                                    {vociSettore.map(voce => {
                                        const esaurito = scorteMap[voce.id]?.attiva && scorteMap[voce.id]?.quantita === 0
                                        return (
                                            <button key={voce.id} onClick={() => aggiungiVoce(voce)} disabled={esaurito}
                                                style={{ ...btnBase, background: coloreTasto(voce, scorteMap), padding: '14px 8px', borderRadius: 8, fontSize: '0.9rem', textAlign: 'center', lineHeight: 1.3, opacity: esaurito ? 0.4 : 1, minHeight: 96, cursor: esaurito ? 'default' : 'pointer' }}>
                                                {voce.nome}
                                                <div style={{ fontSize: '0.8rem', marginTop: 4, opacity: 0.9 }}>{parseFloat(voce.prezzo).toFixed(2)} €</div>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* ── Colonna destra: riepilogo ── */}
            <div style={{ flex: '1 1 33.334%', display: 'flex', flexDirection: 'column', background: '#0f3460', minWidth: 280 }}>

                {/* Header */}
                <div style={{ padding: '12px 16px', background: '#e94560', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{asporto ? 'ASPORTO' : 'ORDINE'}</span>
                    <button onClick={() => setAsporto(a => !a)}
                        style={{ ...btnBase, background: asporto ? '#fff' : 'rgba(255,255,255,0.2)', color: asporto ? '#e94560' : '#fff', padding: '4px 10px', fontSize: '0.8rem' }}>
                        asporto
                    </button>
                </div>

                {/* Lista righe */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                    {righe.length === 0 && (
                        <div style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>Nessuna voce selezionata</div>
                    )}
                    {righe.map(riga => {
                        const aperta = rigaAperta === riga.voce_id
                        return (
                            <div key={riga.voce_id} style={{ marginBottom: 4, borderRadius: 6, overflow: 'hidden', border: `1px solid ${aperta ? 'rgba(255,255,255,0.2)' : 'transparent'}` }}>
                                {/* Riga principale – cliccabile per espandere */}
                                <div onClick={() => setRigaAperta(aperta ? null : riga.voce_id)}
                                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px', borderBottom: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', background: aperta ? 'rgba(255,255,255,0.05)' : 'transparent' }}>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{riga.nome}</div>
                                        <div style={{ color: '#aaa', fontSize: '0.85rem' }}>x{riga.quantita} — {(riga.prezzo * riga.quantita).toFixed(2)} €</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                        <span style={{ color: '#aaa', fontSize: '0.75rem' }}>{aperta ? '▲' : '▼'}</span>
                                        <button onClick={e => { e.stopPropagation(); rimuoviVoce(riga.voce_id) }}
                                            style={{ ...btnBase, background: 'rgba(255,0,0,0.3)', padding: '4px 8px', fontSize: '0.8rem' }}>
                                            ✕
                                        </button>
                                    </div>
                                </div>

                                {/* Pannello modifica quantità/note */}
                                {aperta && (
                                    <div style={{ padding: '10px 8px', background: 'rgba(0,0,0,0.2)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                            <span style={{ fontSize: '0.85rem', color: '#aaa' }}>Quantità:</span>
                                            <button onClick={() => cambiaQuantita(riga.voce_id, -1)}
                                                style={{ ...btnBase, background: '#e94560', width: 28, height: 28, fontSize: '1rem' }}>−</button>
                                            <span style={{ fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{riga.quantita}</span>
                                            <button onClick={() => cambiaQuantita(riga.voce_id, +1)}
                                                style={{ ...btnBase, background: '#2ecc71', width: 28, height: 28, fontSize: '1rem' }}>+</button>
                                        </div>
                                        {Array.from({ length: riga.quantita }, (_, i) => i + 1).map(n => (
                                            <div key={n} style={{ marginBottom: 6 }}>
                                                <div style={{ fontSize: '0.78rem', color: '#aaa', marginBottom: 2 }}>Porzione {n}:</div>
                                                <input type="text" placeholder="Note (es. senza cipolla)"
                                                    value={riga.note.find(no => no.numero_porzione === n)?.testo || ''}
                                                    onChange={e => salvaNote(riga.voce_id, n, e.target.value)}
                                                    style={{ width: '100%', padding: '4px 8px', borderRadius: 4, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box' }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* Footer: totale + pagamento + bottoni */}
                <div style={{ padding: 16, background: 'rgba(0,0,0,0.3)' }}>
                    {/* Totale (con o senza sconto) */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: scontoImporto > 0 ? '1rem' : '1.3rem', fontWeight: 700, marginBottom: scontoImporto > 0 ? 2 : 12, color: scontoImporto > 0 ? '#aaa' : '#fff' }}>
                        <span>Totale</span>
                        <span style={{ textDecoration: scontoImporto > 0 ? 'line-through' : 'none' }}>{totale.toFixed(2)} €</span>
                    </div>
                    {scontoImporto > 0 && (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#f39c12', marginBottom: 2 }}>
                                <span>Sconto ({scontoTipo === 'percentuale' ? `${scontoValore}%` : `${parseFloat(scontoValore).toFixed(2)} €`})</span>
                                <span>−{scontoImporto.toFixed(2)} €</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.3rem', fontWeight: 700, marginBottom: 12 }}>
                                <span>Netto</span>
                                <span>{totaleNetto.toFixed(2)} €</span>
                            </div>
                        </>
                    )}

                    <input type="number" placeholder="Cifra pagata" value={importoPagato} onChange={e => setImportoPagato(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '1rem', marginBottom: 8, boxSizing: 'border-box' }} />

                    {resto !== null && (
                        <div style={{ textAlign: 'right', color: parseFloat(resto) >= 0 ? '#2ecc71' : '#e74c3c', fontWeight: 700, marginBottom: 12 }}>
                            Resto: {resto} €
                        </div>
                    )}

                    {/* Bottoni secondari */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                        <button onClick={() => setModaleScontistica(true)}
                            style={{ ...btnBase, flex: 1, background: scontoImporto > 0 ? '#f39c12' : 'rgba(255,255,255,0.12)', padding: '8px 4px', fontSize: '0.78rem' }}>
                            {scontoImporto > 0 ? `Sconto (${scontoTipo === 'percentuale' ? scontoValore + '%' : scontoValore + '€'})` : 'Scontistica'}
                        </button>
                        <button onClick={righe.length ? apriAllergeni : undefined} disabled={!righe.length}
                            style={{ ...btnBase, flex: 1, background: 'rgba(255,255,255,0.12)', padding: '8px 4px', fontSize: '0.78rem', opacity: righe.length ? 1 : 0.4, cursor: righe.length ? 'pointer' : 'default' }}>
                            Allergeni
                        </button>
                        <button onClick={() => setModaleStock(true)}
                            style={{ ...btnBase, flex: 1, background: vociStockLimitato.length > 0 ? 'rgba(231,76,60,0.5)' : 'rgba(255,255,255,0.12)', padding: '8px 4px', fontSize: '0.78rem' }}>
                            Q. limitate{vociStockLimitato.length > 0 ? ` (${vociStockLimitato.length})` : ''}
                        </button>
                    </div>

                    {/* Bottoni principali */}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={azzeraOrdine}
                            style={{ ...btnBase, flex: 1, background: '#555', padding: 12 }}>
                            Azzera
                        </button>
                        <button onClick={confermaOrdine} disabled={!righe.length}
                            style={{ ...btnBase, flex: 2, background: '#2ecc71', padding: 12, opacity: righe.length ? 1 : 0.5, cursor: righe.length ? 'pointer' : 'default' }}>
                            Conferma ordine
                        </button>
                    </div>
                </div>
            </div>

            {/* ── MODALE SCONTISTICA ── */}
            {modaleScontistica && (
                <div style={overlayStyle} onClick={() => setModaleScontistica(false)}>
                    <div style={modaleStyle} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 16px' }}>Scontistica</h3>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                            {['percentuale', 'fisso'].map(tipo => (
                                <button key={tipo} onClick={() => setScontoTipo(tipo)}
                                    style={{ ...btnBase, flex: 1, padding: 10, background: scontoTipo === tipo ? '#e94560' : 'rgba(255,255,255,0.1)', fontSize: '0.9rem' }}>
                                    {tipo === 'percentuale' ? 'Percentuale (%)' : 'Importo fisso (€)'}
                                </button>
                            ))}
                        </div>
                        <input type="number" min="0" autoFocus
                            placeholder={scontoTipo === 'percentuale' ? 'Es. 10 (= 10%)' : 'Es. 5 (= 5 €)'}
                            value={scontoValore} onChange={e => setScontoValore(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '1rem', marginBottom: 12, boxSizing: 'border-box' }} />
                        {scontoNum > 0 && (
                            <div style={{ color: '#f39c12', marginBottom: 12, fontSize: '0.9rem' }}>
                                Sconto: −{scontoImporto.toFixed(2)} € → Netto: {totaleNetto.toFixed(2)} €
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => { setScontoValore(''); setModaleScontistica(false) }}
                                style={{ ...btnBase, flex: 1, padding: 10, background: '#555' }}>
                                Rimuovi sconto
                            </button>
                            <button onClick={() => setModaleScontistica(false)}
                                style={{ ...btnBase, flex: 1, padding: 10, background: '#2ecc71' }}>
                                Applica
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── MODALE ALLERGENI ── */}
            {modaleAllergeni && (
                <div style={overlayStyle} onClick={() => setModaleAllergeni(false)}>
                    <div style={modaleStyle} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 16px' }}>Allergeni — ordine corrente</h3>
                        {caricaAllergeni
                            ? <div style={{ color: '#aaa', textAlign: 'center', padding: 20 }}>Caricamento...</div>
                            : righe.map(riga => {
                                const all = allergeniDati[riga.voce_id] || []
                                return (
                                    <div key={riga.voce_id} style={{ marginBottom: 14 }}>
                                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{riga.nome}</div>
                                        {all.length === 0
                                            ? <div style={{ color: '#aaa', fontSize: '0.85rem' }}>Nessun allergene registrato</div>
                                            : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                {all.map((a, i) => (
                                                    <span key={i} style={{ background: '#e94560', padding: '2px 10px', borderRadius: 12, fontSize: '0.8rem' }}>
                                                        {a.nome ?? a}
                                                    </span>
                                                ))}
                                            </div>
                                        }
                                    </div>
                                )
                            })
                        }
                        <button onClick={() => setModaleAllergeni(false)}
                            style={{ ...btnBase, marginTop: 8, width: '100%', padding: 10, background: '#555' }}>
                            Chiudi
                        </button>
                    </div>
                </div>
            )}

            {/* ── MODALE QUANTITÀ LIMITATE ── */}
            {modaleStock && (
                <div style={overlayStyle} onClick={() => setModaleStock(false)}>
                    <div style={modaleStyle} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 16px' }}>Quantità limitate / esaurite</h3>
                        {vociStockLimitato.length === 0
                            ? <div style={{ color: '#aaa', textAlign: 'center', padding: 20 }}>Nessuna voce con stock limitato</div>
                            : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <thead>
                                    <tr style={{ color: '#aaa', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                        <th style={{ textAlign: 'left', padding: '4px 8px' }}>Voce</th>
                                        <th style={{ textAlign: 'center', padding: '4px 8px' }}>Qtà</th>
                                        <th style={{ textAlign: 'center', padding: '4px 8px' }}>Stato</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {vociStockLimitato.map(v => {
                                        const stato = v.scorta.quantita === 0 ? 'Esaurito' : v.scorta.stato_visivo === 'critico' ? 'Critico' : 'Attenzione'
                                        const colore = v.scorta.quantita === 0 ? '#888' : v.scorta.stato_visivo === 'critico' ? '#e74c3c' : '#f39c12'
                                        return (
                                            <tr key={v.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                <td style={{ padding: '6px 8px' }}>{v.nome}</td>
                                                <td style={{ textAlign: 'center', padding: '6px 8px' }}>{v.scorta.quantita}</td>
                                                <td style={{ textAlign: 'center', padding: '6px 8px', color: colore, fontWeight: 600 }}>{stato}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        }
                        <button onClick={() => setModaleStock(false)}
                            style={{ ...btnBase, marginTop: 16, width: '100%', padding: 10, background: '#555' }}>
                            Chiudi
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
