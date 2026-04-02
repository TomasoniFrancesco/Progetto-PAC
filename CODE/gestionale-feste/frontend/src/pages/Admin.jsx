import React, { useState, useEffect } from 'react'

const API = '/api'

const stileSezione = { marginBottom: 32 }
const stileTitolo = { fontSize: '1.1rem', fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }
const stileTabella = { width: '100%', borderCollapse: 'collapse' }
const stileCella = { padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', textAlign: 'left' }
const stileCellaHeader = { ...stileCella, color: '#888', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }

export default function Admin() {
    const [tab, setTab] = useState('menu')
    const [voci, setVoci] = useState([])
    const [stampanti, setStampanti] = useState([])
    const [caricamento, setCaricamento] = useState(true)

    useEffect(() => {
        caricaDati()
    }, [tab])

    async function caricaDati() {
        setCaricamento(true)
        try {
            if (tab === 'menu') {
                const res = await fetch(`${API}/menu/tutte`)
                setVoci(await res.json())
            } else if (tab === 'stampanti') {
                const res = await fetch(`${API}/stampanti`)
                setStampanti(await res.json())
            }
        } catch (err) {
            console.error(err)
        } finally {
            setCaricamento(false)
        }
    }

    async function toggleVisibilita(voce) {
        await fetch(`${API}/menu/${voce.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ visibile: voce.visibile ? 0 : 1 })
        })
        caricaDati()
    }

    const tabs = [
        { id: 'menu', label: 'Menu' },
        { id: 'scorte', label: 'Scorte' },
        { id: 'stampanti', label: 'Stampanti' }
    ]

    return (
        <div style={{ minHeight: '100vh', background: '#1a1a2e', padding: 24 }}>

            <h1 style={{ marginBottom: 24, fontSize: '1.4rem' }}>Pannello Admin</h1>

            {/* Tab navigation */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
                {tabs.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        style={{
                            padding: '8px 20px',
                            background: tab === t.id ? '#e94560' : 'rgba(255,255,255,0.1)',
                            color: '#fff'
                        }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {caricamento && <div style={{ color: '#888' }}>Caricamento...</div>}

            {/* Tab: menu */}
            {!caricamento && tab === 'menu' && (
                <div style={stileSezione}>
                    <div style={stileTitolo}>Voci del menu ({voci.length})</div>
                    <table style={stileTabella}>
                        <thead>
                            <tr>
                                <th style={stileCellaHeader}>Codice</th>
                                <th style={stileCellaHeader}>Nome</th>
                                <th style={stileCellaHeader}>Prezzo</th>
                                <th style={stileCellaHeader}>Settore</th>
                                <th style={stileCellaHeader}>Stampa</th>
                                <th style={stileCellaHeader}>Visibile</th>
                                <th style={stileCellaHeader}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {voci.map(voce => (
                                <tr key={voce.id} style={{ opacity: voce.visibile ? 1 : 0.5 }}>
                                    <td style={stileCella}>{voce.codice}</td>
                                    <td style={stileCella}>{voce.nome}</td>
                                    <td style={stileCella}>{parseFloat(voce.prezzo).toFixed(2)} €</td>
                                    <td style={stileCella}>{voce.settore_visualizzazione}</td>
                                    <td style={stileCella}>{voce.settore_stampa}</td>
                                    <td style={stileCella}>
                                        <span style={{ color: voce.visibile ? '#2ecc71' : '#e74c3c' }}>
                                            {voce.visibile ? 'si' : 'no'}
                                        </span>
                                    </td>
                                    <td style={stileCella}>
                                        <button
                                            onClick={() => toggleVisibilita(voce)}
                                            style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '4px 10px', fontSize: '0.8rem' }}
                                        >
                                            {voce.visibile ? 'Nascondi' : 'Mostra'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Tab: stampanti */}
            {!caricamento && tab === 'stampanti' && (
                <div style={stileSezione}>
                    <div style={stileTitolo}>Stampanti configurate</div>
                    <table style={stileTabella}>
                        <thead>
                            <tr>
                                <th style={stileCellaHeader}>Reparto</th>
                                <th style={stileCellaHeader}>Indirizzo IP</th>
                                <th style={stileCellaHeader}>Porta</th>
                                <th style={stileCellaHeader}>Stato</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stampanti.map(s => (
                                <tr key={s.id}>
                                    <td style={stileCella}>{s.reparto}</td>
                                    <td style={stileCella}>{s.indirizzo_ip}</td>
                                    <td style={stileCella}>{s.porta}</td>
                                    <td style={stileCella}>{s.stato}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Tab: scorte — da implementare */}
            {!caricamento && tab === 'scorte' && (
                <div style={{ color: '#888' }}>
                    Gestione scorte — da implementare nella prossima iterazione
                </div>
            )}

        </div>
    )
}
