import React, { useState, useEffect } from 'react'
import { io } from 'socket.io-client'
import { apiStampanti, apiScorte, apiOrdini, apiAuth, tokenAdmin } from '../api/client'
import { C } from '../components/admin/shared'
import VistaSettori from '../components/admin/VistaSettori'
import VistaPietanze from '../components/admin/VistaPietanze'
import GestioneScorte from '../components/admin/GestioneScorte'
import CronologiaOrdini from '../components/admin/CronologiaOrdini'
import LoginAdmin from '../components/admin/LoginAdmin'

const socket = io('/', { path: '/socket.io' })

const navItems = [
    { id: 'menu', label: 'Menu', icon: '🍽' },
    { id: 'scorte', label: 'Gestione Scorte', icon: '📦' },
    { id: 'cronologia', label: 'Cronologia Ordini', icon: '🕓' },
    { id: 'stampanti', label: 'Stampanti', icon: '🖨' },
]

export default function Admin() {
    const [tab, setTab] = useState('menu')
    const [stampanti, setStampanti] = useState([])
    const [scorte, setScorte] = useState([])
    const [ordini, setOrdini] = useState([])
    const [caricamento, setCaricamento] = useState(true)
    const [settoreSelezionato, setSettoreSelezionato] = useState(null)
    // Stato autenticazione: null = verifica in corso, false = non autenticato,
    // true = accesso admin valido.
    const [autenticato, setAutenticato] = useState(null)

    // Al montaggio: se esiste un token salvato, lo si verifica lato server;
    // altrimenti si mostra direttamente la schermata di login.
    useEffect(() => {
        let attivo = true
        async function verifica() {
            if (!tokenAdmin.leggi()) { if (attivo) setAutenticato(false); return }
            try {
                const r = await apiAuth.verifica()
                if (attivo) {
                    if (!r.ok) tokenAdmin.rimuovi()
                    setAutenticato(r.ok)
                }
            } catch {
                if (attivo) setAutenticato(false)
            }
        }
        verifica()
        return () => { attivo = false }
    }, [])

    async function logout() {
        await apiAuth.logout()
        setAutenticato(false)
    }

    useEffect(() => {
        if (autenticato !== true) return
        if (tab === 'stampanti') caricaStampanti()
        else if (tab === 'scorte') caricaScorte()
        else if (tab === 'cronologia') caricaOrdini()
        else setCaricamento(false)
    }, [tab, autenticato])

    useEffect(() => {
        if (tab === 'scorte' || tab === 'cronologia') {
            socket.on('scorte_aggiornate', () => {
                if (tab === 'scorte') caricaScorte()
            })
        }
        return () => { socket.off('scorte_aggiornate') }
    }, [tab])

    async function caricaStampanti() {
        setCaricamento(true)
        try { setStampanti(await apiStampanti.tutte()) }
        catch (err) { console.error(err) }
        finally { setCaricamento(false) }
    }

    async function caricaScorte() {
        setCaricamento(true)
        try { setScorte(await apiScorte.tutte()) }
        catch (err) { console.error(err) }
        finally { setCaricamento(false) }
    }

    async function caricaOrdini() {
        setCaricamento(true)
        try { setOrdini((await apiOrdini.lista()).reverse()) }
        catch (err) { console.error(err) }
        finally { setCaricamento(false) }
    }

    // Gate di autenticazione: finché la verifica è in corso non si mostra nulla
    // di sensibile; se non autenticati si mostra la schermata di login.
    if (autenticato === null) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.surfaceLow, color: C.onSurfaceVariant, fontFamily: 'Inter, sans-serif' }}>
                Verifica accesso…
            </div>
        )
    }
    if (autenticato === false) {
        return <LoginAdmin onAccesso={() => setAutenticato(true)} />
    }

    return (
        <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Inter, sans-serif', background: C.surfaceLow, color: C.onSurface }}>

            {/* ── SIDEBAR ── */}
            <aside style={{ width: 240, flexShrink: 0, position: 'fixed', top: 0, left: 0, height: '100vh', background: C.surface, borderRight: `1px solid ${C.surfaceHigh}`, display: 'flex', flexDirection: 'column', zIndex: 40, boxShadow: '4px 0 16px rgba(27,27,30,0.04)' }}>
                <div style={{ padding: '20px 20px 16px', borderBottom: `1px solid ${C.surfaceHigh}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 12, background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🎪</div>
                        <div>
                            <div style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 900, fontSize: 16, color: C.primary }}>FestivalPOS</div>
                            <div style={{ fontSize: 11, color: C.onSurfaceVariant }}>Admin Panel</div>
                        </div>
                    </div>
                </div>

                <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {navItems.map(item => {
                        const attivo = tab === item.id
                        return (
                            <button key={item.id} onClick={() => { setTab(item.id); setSettoreSelezionato(null) }}
                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: 'none', background: attivo ? C.surfaceHighest : 'transparent', color: attivo ? C.primary : C.onSurfaceVariant, fontWeight: attivo ? 700 : 500, fontSize: 14, cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'background 0.15s, color 0.15s' }}
                                onMouseEnter={e => { if (!attivo) e.currentTarget.style.background = C.surfaceLow }}
                                onMouseLeave={e => { if (!attivo) e.currentTarget.style.background = 'transparent' }}
                            >
                                <span style={{ fontSize: 18 }}>{item.icon}</span>
                                {item.label}
                            </button>
                        )
                    })}
                </nav>

                <div style={{ padding: '12px 10px', borderTop: `1px solid ${C.surfaceHigh}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <a href="/predittore" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, color: C.onSurfaceVariant, fontSize: 14, fontWeight: 500, textDecoration: 'none', transition: 'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = C.surfaceLow}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <span style={{ fontSize: 18 }}>📊</span>
                        Predittore Scorte
                    </a>
                    <a href="/simulazione" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, color: C.onSurfaceVariant, fontSize: 14, fontWeight: 500, textDecoration: 'none', transition: 'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = C.surfaceLow}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <span style={{ fontSize: 18 }}>🖨</span>
                        Simulazione Stampanti
                    </a>
                    <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, color: C.onSurfaceVariant, fontSize: 14, fontWeight: 500, textDecoration: 'none', transition: 'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = C.surfaceLow}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <span style={{ fontSize: 18 }}>←</span>
                        Vai alla Cassa
                    </a>
                    <button onClick={logout}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: 'none', background: 'transparent', color: C.onSurfaceVariant, fontSize: 14, fontWeight: 500, cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = C.surfaceLow}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <span style={{ fontSize: 18 }}>⎋</span>
                        Esci
                    </button>
                </div>
            </aside>

            {/* ── CONTENUTO PRINCIPALE ── */}
            <main style={{ marginLeft: 240, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(250,249,252,0.95)', backdropFilter: 'blur(20px)', borderBottom: `1px solid ${C.surfaceHigh}`, padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <span style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 900, fontSize: 18, color: C.primary }}>
                            {navItems.find(n => n.id === tab)?.label}
                        </span>
                    </div>
                </header>

                <div style={{ padding: 32, flex: 1 }}>
                    {caricamento && <div style={{ color: '#6e7976', padding: 20 }}>Caricamento...</div>}

                    {tab === 'menu' && (
                        settoreSelezionato
                            ? <VistaPietanze settore={settoreSelezionato} onTorna={() => setSettoreSelezionato(null)} />
                            : <VistaSettori onSeleziona={setSettoreSelezionato} />
                    )}

                    {!caricamento && tab === 'scorte' && (
                        <GestioneScorte scorte={scorte} onAggiornato={caricaScorte} />
                    )}

                    {!caricamento && tab === 'cronologia' && (
                        <CronologiaOrdini ordini={ordini} />
                    )}

                    {!caricamento && tab === 'stampanti' && (
                        <div>
                            <div style={{ fontFamily: 'Public Sans, sans-serif', fontSize: '1.1rem', fontWeight: 800, color: C.primary, marginBottom: 16 }}>
                                Stampanti configurate
                            </div>
                            <table className="pietanze-tabella">
                                <thead><tr><th>Nome</th><th>Reparto</th><th>Indirizzo IP</th><th>Porta</th><th>Stato</th></tr></thead>
                                <tbody>
                                    {stampanti.map(s => (
                                        <tr key={s.id}><td>{s.nome || s.reparto}</td><td>{s.reparto}</td><td>{s.indirizzo_ip}</td><td>{s.porta}</td><td>{s.stato}</td></tr>
                                    ))}
                                </tbody>
                            </table>
                            {!stampanti.some(s => s.reparto === 'cassa') && (
                                <p style={{ marginTop: 12, color: '#930009', fontSize: 13 }}>
                                    Manca la stampante <strong>cassa</strong> (copia cliente). Riavvia il backend: alla partenza viene creata automaticamente sulla porta 9104.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}
