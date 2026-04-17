import React, { useState, useEffect } from 'react'
import { io } from 'socket.io-client'

const API = '/api'
const socket = io('/', { path: '/socket.io' })

const PALETTE = [
    '#4A90D9', // Blu
    '#5BA85E', // Verde
    '#D45454', // Rosso
    '#E8B84B', // Giallo
    '#9370BE', // Viola
    '#4A4E5A', // Nero
]

const C = {
    primary: '#005147',
    primaryContainer: '#006b5e',
    surface: '#faf9fc',
    surfaceLow: '#f5f3f7',
    surfaceContainer: '#efedf1',
    surfaceHigh: '#e9e7eb',
    surfaceHighest: '#e3e2e6',
    surfaceLowest: '#ffffff',
    onSurface: '#1b1b1e',
    onSurfaceVariant: '#3e4946',
    secondary: '#425e91',
    secondaryContainer: '#a8c4fd',
    onSecondaryContainer: '#345082',
    outline: '#bec9c5',
    tertiary: '#930009',
    primaryFixed: '#9ff2e1',
    onPrimaryFixed: '#00201b',
}

function statusInfo(voce, scorteMap) {
    const s = scorteMap[voce.id]
    if (!s || !s.attiva) return { color: '#22c55e', label: 'Disponibile', disabled: false }
    if (s.quantita === 0) return { color: '#a1a1aa', label: 'Esaurito', disabled: true }
    if (s.stato_visivo === 'critico') return { color: '#ef4444', label: 'Critico', disabled: false }
    if (s.stato_visivo === 'attenzione') return { color: '#eab308', label: 'Scorta bassa', disabled: false }
    return { color: '#22c55e', label: 'Disponibile', disabled: false }
}

function getTextColorForBackground(hexColor) {
    if (!hexColor) return C.onSurface
    const hex = hexColor.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    const luminosita = (r * 299 + g * 587 + b * 114) / 1000
    return luminosita > 165 ? '#1b1b1e' : '#ffffff'
}

export default function Cassa() {
    const [voci, setVoci] = useState([])
    const [scorteMap, setScorteMap] = useState({})
    const [righe, setRighe] = useState([])
    const [asporto, setAsporto] = useState(false)
    const [importoPagato, setImportoPagato] = useState('')
    const [caricamento, setCaricamento] = useState(true)
    const [settoreFiltro, setSettoreFiltro] = useState(null)
    const [rigaAperta, setRigaAperta] = useState(null)

    // Cronologia ordini
    const [modaleCronologia, setModaleCronologia] = useState(false)
    const [ordiniStorico, setOrdiniStorico] = useState([])
    const [caricaCronologia, setCaricaCronologia] = useState(false)

    const [scontoValore, setScontoValore] = useState('')
    const [scontoTipo, setScontoTipo] = useState('percentuale')
    const [modaleScontistica, setModaleScontistica] = useState(false)

    const [modaleAllergeni, setModaleAllergeni] = useState(false)
    const [allergeniDati, setAllergeniDati] = useState({})
    const [caricaAllergeni, setCaricaAllergeni] = useState(false)

    const [modaleStock, setModaleStock] = useState(false)

    // Popup notifica
    const [popup, setPopup] = useState(null)

    const mostraPopup = (messaggio, tipo = 'success') => {
        setPopup({ messaggio, tipo })
        setTimeout(() => setPopup(null), 3000)
    }

    const ordineSettori = ['bar', 'primi', 'secondi', 'contorni', 'dolce', 'dolci']

    // Ordinamento 3 livelli: categoria → nome alfabetico
    const ordinaVoci = (a, b) => {
        const catA = String(a.categoria || '').toLowerCase()
        const catB = String(b.categoria || '').toLowerCase()
        if (catA !== catB) return catA.localeCompare(catB, 'it', { sensitivity: 'base' })
        return String(a.nome).localeCompare(String(b.nome), 'it', { sensitivity: 'base' })
    }

    // Raggruppa voci per settore, poi per colore all'interno di ogni settore
    const vociPerSettore = ordineSettori.reduce((acc, settore) => {
        const vociSettore = voci.filter(v => String(v.settore_visualizzazione).toLowerCase() === String(settore).toLowerCase()).sort(ordinaVoci)
        if (vociSettore.length > 0) {
            acc[settore] = vociSettore
        }
        return acc
    }, {})

    const totale = righe.reduce((acc, r) => acc + r.prezzo * r.quantita, 0)
    const scontoNum = parseFloat(scontoValore) || 0
    const scontoImporto = scontoNum > 0
        ? (scontoTipo === 'percentuale' ? totale * (scontoNum / 100) : Math.min(scontoNum, totale))
        : 0
    const totaleNetto = totale - scontoImporto
    const resto = importoPagato ? (parseFloat(importoPagato) - totaleNetto).toFixed(2) : null

    const vociStockLimitato = voci
        .filter(v => { const s = scorteMap[v.id]; return s?.attiva && (s.quantita === 0 || s.stato_visivo === 'critico' || s.stato_visivo === 'attenzione') })
        .map(v => ({ ...v, scorta: scorteMap[v.id] }))

    useEffect(() => {
        caricaMenu()
        caricaScorte()
        socket.on('scorte_aggiornate', nuoveScorte => {
            const mappa = {}
            nuoveScorte.forEach(s => { mappa[s.voce_id] = s })
            setScorteMap(mappa)
        })
        return () => socket.off('scorte_aggiornate')
    }, [])

    async function caricaMenu() {
        try { setVoci(await (await fetch(`${API}/menu`)).json()) }
        catch (err) { console.error('Errore menu', err) }
        finally { setCaricamento(false) }
    }

    async function caricaScorte() {
        try {
            const dati = await (await fetch(`${API}/scorte`)).json()
            const mappa = {}
            dati.forEach(s => { mappa[s.voce_id] = s })
            setScorteMap(mappa)
        } catch (err) { console.error('Errore scorte', err) }
    }

    function aggiungiVoce(voce) {
        const s = scorteMap[voce.id]
        if (s?.attiva && s.quantita === 0) {
            mostraPopup('✗ Prodotto esaurito', 'error')
            return
        }

        // Verifica se la nuova quantità supera la scorta disponibile
        const rigaEsistente = righe.find(r => r.voce_id === voce.id)
        const nuovaQuantita = (rigaEsistente?.quantita || 0) + 1

        if (s?.attiva && nuovaQuantita > s.quantita) {
            mostraPopup(`✗ Scorta insufficiente (disponibile: ${s.quantita})`, 'error')
            return
        }

        setRighe(prev => {
            const es = prev.find(r => r.voce_id === voce.id)
            if (es) return prev.map(r => r.voce_id === voce.id ? { ...r, quantita: r.quantita + 1 } : r)
            return [...prev, { voce_id: voce.id, nome: voce.nome, prezzo: parseFloat(voce.prezzo), quantita: 1, note: [], colore_tasto: voce.colore_tasto }]
        })
    }

    function rimuoviVoce(voce_id) {
        setRighe(prev => prev.filter(r => r.voce_id !== voce_id))
        if (rigaAperta === voce_id) setRigaAperta(null)
    }

    function cambiaQuantita(voce_id, delta) {
        setRighe(prev => {
            return prev.map(r => {
                if (r.voce_id !== voce_id) return r

                const nuovaQuantita = r.quantita + delta
                if (nuovaQuantita < 1) return { ...r, quantita: 1 }

                // Verifica scorta disponibile se delta è positivo (aumento)
                if (delta > 0) {
                    const s = scorteMap[voce_id]
                    if (s?.attiva && nuovaQuantita > s.quantita) {
                        mostraPopup(`✗ Scorta insufficiente (disponibile: ${s.quantita})`, 'error')
                        return r
                    }
                }

                return { ...r, quantita: nuovaQuantita }
            })
        })
    }

    function salvaNote(voce_id, numero_porzione, testo) {
        setRighe(prev => prev.map(r => {
            if (r.voce_id !== voce_id) return r
            const altre = r.note.filter(n => n.numero_porzione !== numero_porzione)
            return { ...r, note: testo.trim() ? [...altre, { numero_porzione, testo: testo.trim(), costo_aggiuntivo: 0 }] : altre }
        }))
    }

    function azzeraOrdine() {
        setRighe([]); setAsporto(false); setImportoPagato(''); setScontoValore(''); setRigaAperta(null)
    }

    async function apriAllergeni() {
        setModaleAllergeni(true); setCaricaAllergeni(true)
        try {
            const res = {}
            await Promise.all(righe.map(async r => { res[r.voce_id] = await (await fetch(`${API}/menu/${r.voce_id}/allergeni`)).json() }))
            setAllergeniDati(res)
        } catch (err) { console.error('Errore allergeni', err) }
        finally { setCaricaAllergeni(false) }
    }

    async function apriCronologia() {
        setModaleCronologia(true)
        setCaricaCronologia(true)
        try {
            const dati = await (await fetch(`${API}/ordini`)).json()
            setOrdiniStorico(dati)
        } catch (err) { console.error('Errore cronologia', err) }
        finally { setCaricaCronologia(false) }
    }

    async function confermaOrdine() {
        if (!righe.length) return
        try {
            const { id } = await (await fetch(`${API}/ordini`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ righe })
            })).json()
            await fetch(`${API}/ordini/${id}/conferma`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ asporto, sconto: scontoNum || 0, tipo_sconto: scontoTipo, importo_pagato: importoPagato ? parseFloat(importoPagato) : null })
            })
            azzeraOrdine()
            mostraPopup('✓ Ordine confermato con successo', 'success')
        } catch (err) { mostraPopup('✗ Errore: ' + err.message, 'error') }
    }

    if (caricamento) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Inter, sans-serif', color: C.primary, fontSize: 18, background: C.surface }}>
            Caricamento menu...
        </div>
    )

    const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(4px)' }
    const modaleStyle = { background: C.surface, borderRadius: 16, padding: 28, minWidth: 380, maxWidth: 500, maxHeight: '80vh', overflowY: 'auto', color: C.onSurface, boxShadow: '0 24px 64px rgba(0,0,0,0.14)' }

    const btnFooter = (bg, color = C.onSurface, extra = {}) => ({
        height: 52, padding: '0 18px', display: 'flex', alignItems: 'center', gap: 6,
        background: bg, color, border: 'none', borderRadius: 10,
        fontFamily: 'Public Sans, sans-serif', fontWeight: 800, fontSize: 12,
        textTransform: 'uppercase', letterSpacing: '0.08em',
        cursor: 'pointer', whiteSpace: 'nowrap', ...extra
    })

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'Inter, sans-serif', background: C.surface, color: C.onSurface, overflow: 'hidden' }}>

            {/* ── HEADER ── */}
            <header style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 60, zIndex: 50, background: 'rgba(250,249,252,0.95)', backdropFilter: 'blur(20px)', borderBottom: `1px solid ${C.surfaceHigh}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 900, fontSize: 20, color: C.primary }}>FestivalPOS</span>
                    <span style={{ width: 1, height: 18, background: C.outline }} />
                    <span style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 700, fontSize: 14, color: C.primary, borderBottom: `2px solid ${C.primary}`, paddingBottom: 2 }}>Cassa</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {vociStockLimitato.length > 0 && (
                        <span style={{ background: '#fef3c7', color: '#92400e', padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                            ⚠ {vociStockLimitato.length} voci esaurite/critiche
                        </span>
                    )}
                    <button onClick={apriCronologia}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', border: `1.5px solid ${C.outline}`, borderRadius: 8, background: 'transparent', color: C.onSurfaceVariant, fontFamily: 'Public Sans, sans-serif', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer' }}>
                        🕓 Cronologia ordini
                    </button>
                </div>
            </header>

            {/* ── MAIN ── */}
            <main style={{ display: 'flex', flex: 1, overflow: 'hidden', paddingTop: 60, paddingBottom: 80 }}>

                {/* Griglia prodotti */}
                <section style={{ flex: 1, overflowY: 'auto', padding: '20px 20px', background: C.surfaceLow }}>

                    {/* Colonne per settore */}
                    <div style={{ display: 'flex', gap: 20, overflowX: 'auto', paddingRight: 20 }}>
                        {(() => {
                            // Altezza fissa uguale per tutti: divide l'area disponibile in 6 slot
                            const altezzaDisponibile = window.innerHeight - 200
                            const ALTEZZA_BTN = (altezzaDisponibile - 30 - 10 * 5) / 6 // 6 righe, 5 gap da 10px

                            return Object.entries(vociPerSettore).map(([settore, vociSettore]) => {
                            const numArticoli = vociSettore.length
                            const hasSubcolumns = numArticoli > 6
                            const articoliPerColonna = hasSubcolumns ? Math.ceil(numArticoli / 2) : numArticoli

                            return (
                            <div key={settore} style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: hasSubcolumns ? 400 : 190, flexShrink: 0 }}>
                                {/* Intestazione colonna con titolo settore */}
                                <div style={{ paddingBottom: 8, borderBottom: `3px solid ${C.primary}` }}>
                                    <span style={{ fontSize: 14, fontWeight: 900, color: C.primary, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'Public Sans, sans-serif' }}>
                                        {settore}
                                    </span>
                                </div>

                                {/* Contenitore prodotti (1 o 2 colonne) */}
                                <div style={{ display: 'flex', gap: 12 }}>
                                    {/* Prima colonna */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                                        {vociSettore.slice(0, articoliPerColonna).map(voce => {
                                            const { color, label, disabled } = statusInfo(voce, scorteMap)
                                            const backgroundColor = voce.colore_tasto || C.surfaceLowest
                                            const textColor = getTextColorForBackground(backgroundColor)
                                            const isCustomColor = voce.colore_tasto && voce.colore_tasto !== C.surfaceLowest
                                            return (
                                                <button key={voce.id} onClick={() => aggiungiVoce(voce)} disabled={disabled}
                                                    style={{ background: backgroundColor, border: 'none', borderRadius: 12, padding: '14px 12px', height: ALTEZZA_BTN, flexShrink: 0, textAlign: 'left', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', transition: 'transform 0.1s, box-shadow 0.1s', minHeight: 0 }}
                                                onMouseDown={e => { if (!disabled) { e.currentTarget.style.transform = 'scale(0.95)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,81,71,0.12)' } }}
                                                onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)' }}
                                                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)' }}
                                            >
                                                <h3 style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 800, fontSize: 17, color: isCustomColor ? textColor : C.onSurface, margin: 0, lineHeight: 1.25, textAlign: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{voce.nome}</h3>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                                        <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: isCustomColor ? textColor : C.onSurfaceVariant, opacity: 0.85 }}>{label}</span>
                                                    </div>
                                                    <p style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 900, fontSize: 14, color: isCustomColor ? textColor : C.primary, margin: 0, opacity: isCustomColor ? 0.9 : 1 }}>€ {parseFloat(voce.prezzo).toFixed(2)}</p>
                                                </div>
                                            </button>
                                            )
                                        })}
                                    </div>

                                    {/* Seconda colonna (se > 6 articoli) */}
                                    {hasSubcolumns && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                                            {vociSettore.slice(articoliPerColonna).map(voce => {
                                                const { color, label, disabled } = statusInfo(voce, scorteMap)
                                                const backgroundColor = voce.colore_tasto || C.surfaceLowest
                                                const textColor = getTextColorForBackground(backgroundColor)
                                                const isCustomColor = voce.colore_tasto && voce.colore_tasto !== C.surfaceLowest
                                                return (
                                                    <button key={voce.id} onClick={() => aggiungiVoce(voce)} disabled={disabled}
                                                        style={{ background: backgroundColor, border: 'none', borderRadius: 12, padding: '14px 12px', height: ALTEZZA_BTN, flexShrink: 0, textAlign: 'left', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', transition: 'transform 0.1s, box-shadow 0.1s', minHeight: 0 }}
                                                        onMouseDown={e => { if (!disabled) { e.currentTarget.style.transform = 'scale(0.95)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,81,71,0.12)' } }}
                                                        onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)' }}
                                                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)' }}
                                                    >
                                                        <h3 style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 800, fontSize: 17, color: isCustomColor ? textColor : C.onSurface, margin: 0, lineHeight: 1.25, textAlign: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{voce.nome}</h3>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                                                <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: isCustomColor ? textColor : C.onSurfaceVariant, opacity: 0.85 }}>{label}</span>
                                                            </div>
                                                            <p style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 900, fontSize: 14, color: isCustomColor ? textColor : C.primary, margin: 0, opacity: isCustomColor ? 0.9 : 1 }}>€ {parseFloat(voce.prezzo).toFixed(2)}</p>
                                                        </div>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                            )
                        })
                        })()}
                    </div>
                </section>

                {/* Pannello ordine */}
                <aside style={{ width: 390, background: C.surface, borderLeft: `1px solid ${C.surfaceHigh}`, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.04)' }}>

                    {/* Intestazione ordine */}
                    <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.surfaceHigh}`, background: `${C.surfaceLow}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <h2 style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 900, fontSize: 19, color: C.primary, margin: 0 }}>
                                {asporto ? '🥡 ASPORTO' : 'ORDINE'}
                            </h2>
                            <span style={{ padding: '3px 12px', background: C.primaryFixed, color: C.onPrimaryFixed, fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', borderRadius: 20 }}>
                                {righe.length > 0 ? 'In Corso' : 'Vuoto'}
                            </span>
                        </div>
                        <p style={{ margin: 0, fontSize: 12, color: C.onSurfaceVariant }}>
                            {righe.length} {righe.length === 1 ? 'prodotto' : 'prodotti'} selezionati
                        </p>
                    </div>

                    {/* Lista righe */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
                        {righe.length === 0 && (
                            <div style={{ textAlign: 'center', color: C.onSurfaceVariant, marginTop: 48, fontSize: 14 }}>
                                <div style={{ fontSize: 36, marginBottom: 10 }}>🧾</div>
                                Nessuna voce selezionata
                            </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {[...righe].sort((a, b) => a.nome.localeCompare(b.nome, 'it')).map(riga => {
                                const aperta = rigaAperta === riga.voce_id
                                const backgroundColor = riga.colore_tasto || C.surfaceLowest
                                const textColor = getTextColorForBackground(backgroundColor)
                                const isCustomColor = riga.colore_tasto && riga.colore_tasto !== C.surfaceLowest
                                return (
                                    <div key={riga.voce_id} style={{ background: backgroundColor, borderRadius: 12, border: `1px solid ${aperta ? C.outline : 'transparent'}`, overflow: 'hidden' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', gap: 10 }}>
                                            {/* Nome */}
                                            <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setRigaAperta(aperta ? null : riga.voce_id)}>
                                                <div style={{ fontWeight: 700, fontSize: 14, color: isCustomColor ? textColor : C.onSurface, lineHeight: 1.3 }}>{riga.nome}</div>
                                                <div style={{ fontSize: 13, color: isCustomColor ? textColor : C.primaryContainer, fontWeight: 600, marginTop: 2 }}>€ {(riga.prezzo * riga.quantita).toFixed(2)}</div>
                                                {riga.note.length > 0 && (
                                                    <div style={{ fontSize: 11, color: isCustomColor ? textColor : C.onSurfaceVariant, marginTop: 2, opacity: isCustomColor ? 0.8 : 1 }}>📝 {riga.note.length} nota{riga.note.length > 1 ? 'e' : ''}</div>
                                                )}
                                            </div>
                                            {/* +/- e rimuovi */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <button onClick={() => cambiaQuantita(riga.voce_id, -1)}
                                                    style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: C.secondaryContainer, color: C.onSecondaryContainer, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, lineHeight: 1 }}>
                                                    −
                                                </button>
                                                <span style={{ fontWeight: 900, fontSize: 15, minWidth: 22, textAlign: 'center' }}>{riga.quantita}</span>
                                                <button onClick={() => cambiaQuantita(riga.voce_id, +1)}
                                                    style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: C.secondaryContainer, color: C.onSecondaryContainer, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, lineHeight: 1 }}>
                                                    +
                                                </button>
                                                <button onClick={() => rimuoviVoce(riga.voce_id)}
                                                    style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#fde8e8', color: C.tertiary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                                                    ✕
                                                </button>
                                            </div>
                                        </div>
                                        {/* Note */}
                                        {aperta && (
                                            <div style={{ padding: '10px 14px 14px', borderTop: `1px solid ${C.surfaceHigh}` }}>
                                                <div style={{ fontSize: 11, fontWeight: 700, color: C.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Note per porzione</div>
                                                {Array.from({ length: riga.quantita }, (_, i) => i + 1).map(n => (
                                                    <div key={n} style={{ marginBottom: 6 }}>
                                                        <div style={{ fontSize: 11, color: C.onSurfaceVariant, marginBottom: 3 }}>Porzione {n}</div>
                                                        <input type="text" placeholder="Es. senza cipolla"
                                                            value={riga.note.find(no => no.numero_porzione === n)?.testo || ''}
                                                            onChange={e => salvaNote(riga.voce_id, n, e.target.value)}
                                                            style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.outline}`, background: C.surfaceLow, color: C.onSurface, fontSize: 13, boxSizing: 'border-box', outline: 'none' }}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Totale + pagamento */}
                    <div style={{ padding: '18px 22px', borderTop: `1px solid ${C.surfaceHigh}`, background: 'rgba(250,249,252,0.9)', backdropFilter: 'blur(20px)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: C.onSurfaceVariant, fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                            <span>Subtotale</span><span>€ {totale.toFixed(2)}</span>
                        </div>
                        {scontoImporto > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: C.tertiary, fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                                <span>Sconto ({scontoTipo === 'percentuale' ? `${scontoValore}%` : `€ ${parseFloat(scontoValore).toFixed(2)}`})</span>
                                <span>−€ {scontoImporto.toFixed(2)}</span>
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 8, marginBottom: 16 }}>
                            <span style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 700, fontSize: 18, color: C.onSurface }}>TOTALE</span>
                            <span style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 900, fontSize: 34, color: C.primary, lineHeight: 1 }}>€ {totaleNetto.toFixed(2)}</span>
                        </div>
                        <input type="number" placeholder="Cifra pagata" value={importoPagato} onChange={e => setImportoPagato(e.target.value)}
                            style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${C.outline}`, background: C.surfaceLow, color: C.onSurface, fontSize: 15, fontWeight: 600, boxSizing: 'border-box', outline: 'none', marginBottom: 8 }} />
                        {resto !== null && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, color: parseFloat(resto) >= 0 ? '#15803d' : C.tertiary }}>
                                <span>Resto</span><span>€ {resto}</span>
                            </div>
                        )}
                    </div>
                </aside>
            </main>

            {/* ── FOOTER AZIONI ── */}
            <footer style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 80, zIndex: 50, background: 'rgba(250,249,252,0.94)', backdropFilter: 'blur(20px)', borderTop: `1px solid ${C.surfaceHigh}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', boxShadow: '0 -8px 32px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={azzeraOrdine} style={btnFooter(C.surfaceHigh)}>
                        ✕ AZZERA
                    </button>
                    <button onClick={() => setModaleScontistica(true)}
                        style={btnFooter(scontoImporto > 0 ? C.secondary : C.surfaceHigh, scontoImporto > 0 ? '#fff' : C.onSurface)}>
                        🏷 {scontoImporto > 0 ? `SCONTO (${scontoTipo === 'percentuale' ? scontoValore + '%' : '€' + scontoValore})` : 'SCONTO'}
                    </button>
                    <button onClick={() => setAsporto(a => !a)}
                        style={btnFooter(asporto ? C.surfaceHighest : C.surfaceHigh, asporto ? C.primary : C.onSurface, { border: `2px solid ${asporto ? C.primary : 'transparent'}` })}>
                        🥡 ASPORTO
                    </button>
                    <button onClick={righe.length ? apriAllergeni : undefined} disabled={!righe.length}
                        style={btnFooter(C.surfaceHigh, C.onSurface, { opacity: righe.length ? 1 : 0.4, cursor: righe.length ? 'pointer' : 'default' })}>
                        ℹ ALLERGENI
                    </button>
                    <button onClick={() => setModaleStock(true)}
                        style={btnFooter(vociStockLimitato.length > 0 ? '#fef3c7' : C.surfaceHigh, vociStockLimitato.length > 0 ? '#92400e' : C.onSurface)}>
                        📦 STOCK{vociStockLimitato.length > 0 ? ` (${vociStockLimitato.length})` : ''}
                    </button>
                </div>

                <button onClick={confermaOrdine} disabled={!righe.length}
                    style={{ height: 52, padding: '0 28px', display: 'flex', alignItems: 'center', gap: 10, background: righe.length ? `linear-gradient(135deg, ${C.primary}, ${C.primaryContainer})` : C.surfaceHigh, color: righe.length ? '#fff' : C.onSurfaceVariant, border: 'none', borderRadius: 10, fontFamily: 'Public Sans, sans-serif', fontWeight: 900, fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: righe.length ? 'pointer' : 'default', boxShadow: righe.length ? '0 4px 20px rgba(0,81,71,0.25)' : 'none', transition: 'all 0.15s' }}>
                    CONFERMA ORDINE ✓
                </button>
            </footer>

            {/* ── MODALE CRONOLOGIA ORDINI ── */}
            {modaleCronologia && (
                <div style={overlayStyle} onClick={() => setModaleCronologia(false)}>
                    <div style={{ ...modaleStyle, minWidth: 520, maxWidth: 700 }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 800, fontSize: 20, margin: '0 0 20px', color: C.primary }}>
                            Cronologia ordini — oggi
                        </h3>
                        {caricaCronologia ? (
                            <div style={{ textAlign: 'center', padding: 28, color: C.onSurfaceVariant }}>Caricamento...</div>
                        ) : ordiniStorico.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 28, color: C.onSurfaceVariant }}>Nessun ordine oggi</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {ordiniStorico.map(o => {
                                    const ora = new Date(o.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                                    const statoColor = o.stato === 'confermato' ? C.primary : C.onSurfaceVariant
                                    const statoBg = o.stato === 'confermato' ? 'rgba(0,81,71,0.08)' : C.surfaceLow
                                    return (
                                        <div key={o.id} style={{ background: C.surfaceLow, borderRadius: 12, padding: '14px 16px', border: `1px solid ${C.surfaceHigh}` }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <span style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 900, fontSize: 15, color: C.onSurface }}>
                                                        #{o.id}
                                                    </span>
                                                    <span style={{ fontSize: 12, color: C.onSurfaceVariant }}>{ora}</span>
                                                    {o.asporto === 1 && <span style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>ASPORTO</span>}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <span style={{ fontSize: 11, background: statoBg, color: statoColor, padding: '3px 10px', borderRadius: 20, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{o.stato}</span>
                                                    <span style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 900, fontSize: 17, color: C.primary }}>€ {parseFloat(o.totale || 0).toFixed(2)}</span>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                {(o.righe || []).map((r, i) => (
                                                    <span key={i} style={{ background: C.surface, border: `1px solid ${C.surfaceHigh}`, padding: '3px 10px', borderRadius: 20, fontSize: 12, color: C.onSurface }}>
                                                        {r.quantita}× {r.nome}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        <button onClick={() => setModaleCronologia(false)}
                            style={{ marginTop: 18, width: '100%', padding: 12, border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, background: C.surfaceHigh, color: C.onSurface }}>
                            Chiudi
                        </button>
                    </div>
                </div>
            )}

            {/* ── MODALE SCONTISTICA ── */}
            {modaleScontistica && (
                <div style={overlayStyle} onClick={() => setModaleScontistica(false)}>
                    <div style={modaleStyle} onClick={e => e.stopPropagation()}>
                        <h3 style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 800, fontSize: 20, margin: '0 0 20px', color: C.primary }}>Scontistica</h3>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                            {['percentuale', 'fisso'].map(tipo => (
                                <button key={tipo} onClick={() => setScontoTipo(tipo)}
                                    style={{ flex: 1, padding: '10px 0', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14, background: scontoTipo === tipo ? C.primary : C.surfaceHigh, color: scontoTipo === tipo ? '#fff' : C.onSurface }}>
                                    {tipo === 'percentuale' ? 'Percentuale (%)' : 'Importo fisso (€)'}
                                </button>
                            ))}
                        </div>
                        <input type="number" min="0" autoFocus
                            placeholder={scontoTipo === 'percentuale' ? 'Es. 10 (= 10%)' : 'Es. 5 (= 5 €)'}
                            value={scontoValore} onChange={e => setScontoValore(e.target.value)}
                            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${C.outline}`, background: C.surfaceLow, color: C.onSurface, fontSize: 15, marginBottom: 12, boxSizing: 'border-box', outline: 'none' }} />
                        {scontoNum > 0 && (
                            <div style={{ padding: '10px 14px', background: '#fef3c7', borderRadius: 8, fontSize: 14, color: '#92400e', fontWeight: 600, marginBottom: 16 }}>
                                Sconto: −€ {scontoImporto.toFixed(2)} → Netto: € {totaleNetto.toFixed(2)}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => { setScontoValore(''); setModaleScontistica(false) }}
                                style={{ flex: 1, padding: 12, border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, background: C.surfaceHigh, color: C.onSurface }}>
                                Rimuovi sconto
                            </button>
                            <button onClick={() => setModaleScontistica(false)}
                                style={{ flex: 1, padding: 12, border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, background: C.primary, color: '#fff' }}>
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
                        <h3 style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 800, fontSize: 20, margin: '0 0 20px', color: C.primary }}>Allergeni — ordine corrente</h3>
                        {caricaAllergeni
                            ? <div style={{ textAlign: 'center', padding: 24, color: C.onSurfaceVariant }}>Caricamento...</div>
                            : righe.map(riga => {
                                const all = allergeniDati[riga.voce_id] || []
                                return (
                                    <div key={riga.voce_id} style={{ marginBottom: 14, padding: '12px 14px', background: C.surfaceLow, borderRadius: 10 }}>
                                        <div style={{ fontWeight: 700, marginBottom: 8, color: C.onSurface }}>{riga.nome}</div>
                                        {all.length === 0
                                            ? <span style={{ fontSize: 13, color: C.onSurfaceVariant }}>Nessun allergene registrato</span>
                                            : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                {all.map((a, i) => (
                                                    <span key={i} style={{ background: '#fde8e8', color: C.tertiary, padding: '3px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>{a.nome ?? a}</span>
                                                ))}
                                            </div>
                                        }
                                    </div>
                                )
                            })
                        }
                        <button onClick={() => setModaleAllergeni(false)}
                            style={{ marginTop: 8, width: '100%', padding: 12, border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, background: C.surfaceHigh, color: C.onSurface }}>
                            Chiudi
                        </button>
                    </div>
                </div>
            )}

            {/* ── MODALE STOCK ── */}
            {modaleStock && (
                <div style={overlayStyle} onClick={() => setModaleStock(false)}>
                    <div style={modaleStyle} onClick={e => e.stopPropagation()}>
                        <h3 style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 800, fontSize: 20, margin: '0 0 20px', color: C.primary }}>Quantità limitate / esaurite</h3>
                        {vociStockLimitato.length === 0
                            ? <div style={{ textAlign: 'center', padding: 24, color: C.onSurfaceVariant }}>Nessuna voce con stock limitato</div>
                            : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                                <thead>
                                    <tr style={{ color: C.onSurfaceVariant, borderBottom: `1px solid ${C.outline}` }}>
                                        <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Voce</th>
                                        <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600 }}>Qtà</th>
                                        <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600 }}>Stato</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {vociStockLimitato.map(v => {
                                        const stato = v.scorta.quantita === 0 ? 'Esaurito' : v.scorta.stato_visivo === 'critico' ? 'Critico' : 'Attenzione'
                                        const col = v.scorta.quantita === 0 ? '#a1a1aa' : v.scorta.stato_visivo === 'critico' ? '#ef4444' : '#eab308'
                                        return (
                                            <tr key={v.id} style={{ borderBottom: `1px solid ${C.surfaceHigh}` }}>
                                                <td style={{ padding: '10px 8px', color: C.onSurface, fontWeight: 600 }}>{v.nome}</td>
                                                <td style={{ textAlign: 'center', padding: '10px 8px', color: C.onSurface }}>{v.scorta.quantita}</td>
                                                <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                                                    <span style={{ background: `${col}22`, color: col, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{stato}</span>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        }
                        <button onClick={() => setModaleStock(false)}
                            style={{ marginTop: 16, width: '100%', padding: 12, border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, background: C.surfaceHigh, color: C.onSurface }}>
                            Chiudi
                        </button>
                    </div>
                </div>
            )}

            {/* Popup Notifica */}
            {popup && (
                <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 300 }}>
                    <div style={{
                        background: popup.tipo === 'success' ? '#10b981' : '#ef4444',
                        color: 'white',
                        padding: '16px 24px',
                        borderRadius: 12,
                        boxShadow: '0 12px 32px rgba(0,0,0,0.2)',
                        fontSize: 14,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        animation: 'slideIn 0.3s ease-out'
                    }}>
                        <span style={{ fontSize: 18 }}>
                            {popup.tipo === 'success' ? '✓' : '✗'}
                        </span>
                        {popup.messaggio}
                    </div>
                </div>
            )}

            <style>{`
                @keyframes slideIn {
                    from {
                        transform: translateX(400px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            `}</style>
        </div>
    )
}
