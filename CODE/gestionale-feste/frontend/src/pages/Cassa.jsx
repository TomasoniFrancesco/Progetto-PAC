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
    if (!s || !s.attiva) return { color: '#22c55e', label: '∞', disabled: false }
    if (s.quantita === 0) return { color: '#a1a1aa', label: '0', disabled: true }
    if (s.stato_visivo === 'critico') return { color: '#ef4444', label: String(s.quantita), disabled: false }
    if (s.stato_visivo === 'attenzione') return { color: '#eab308', label: String(s.quantita), disabled: false }
    return { color: '#22c55e', label: String(s.quantita), disabled: false }
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

    // Tastierino
    const [modaleTastierino, setModaleTastierino] = useState(false)
    const [importoTemp, setImportoTemp] = useState('')

    // Popup notifica
    const [popup, setPopup] = useState(null)

    const mostraPopup = (messaggio, tipo = 'success') => {
        setPopup({ messaggio, tipo })
        setTimeout(() => setPopup(null), 3000)
    }

    const gestisciTastierino = (val) => {
        if (val === 'DEL') setImportoTemp(prev => prev.slice(0, -1))
        else if (val === ',') {
            if (!importoTemp.includes('.')) setImportoTemp(prev => prev + '.')
        } else {
            setImportoTemp(prev => prev + val)
        }
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'Inter, sans-serif', background: C.surface, color: C.onSurface, overflow: 'hidden' }}>

            {/* ── MAIN ── */}
            <main style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* Griglia prodotti */}
                <section style={{ flex: '0 0 74%', maxWidth: '74%', overflow: 'hidden', padding: '20px 20px', background: C.surfaceLow }}>

                    {/* Colonne per settore (spazio distribuito proporzionalmente alle subcolonne) */}
                    <div style={{ display: 'flex', gap: 14, height: '100%', overflow: 'hidden' }}>
                        {(() => {
                            return Object.entries(vociPerSettore).map(([settore, vociSettore]) => {
                                const numArticoli = vociSettore.length || 1
                                const maxRighe = 6
                                const numColonne = Math.ceil(numArticoli / maxRighe)
                                const righeEffettive = Math.ceil(numArticoli / numColonne)
                                const haSubcolonne = numColonne > 1

                                return (
                                    <div key={settore} style={{ flex: numColonne, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, minHeight: 0 }}>
                                        {/* Intestazione colonna con titolo settore */}
                                        <div style={{ paddingBottom: 8, borderBottom: `3px solid ${C.primary}` }}>
                                            <span style={{ fontSize: 14, fontWeight: 900, color: C.primary, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'Public Sans, sans-serif' }}>
                                                {settore}
                                            </span>
                                        </div>

                                        {/* Contenitore prodotti settore dinamico bilanciato (senza buchi) */}
                                        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 8 }}>
                                            {Array.from({ length: numColonne }, (_, i) => {
                                                const colonnaItems = vociSettore.slice(i * righeEffettive, (i + 1) * righeEffettive)
                                                return (
                                                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
                                                        {colonnaItems.map(voce => {
                                                            const { color, label, disabled } = statusInfo(voce, scorteMap)
                                                            const backgroundColor = voce.colore_tasto || C.surfaceLowest
                                                            const textColor = getTextColorForBackground(backgroundColor)
                                                            const isCustomColor = voce.colore_tasto && voce.colore_tasto !== C.surfaceLowest
                                                            const nomeLungo = (voce.nome || '').length > 18

                                                            const fontSizeNome = nomeLungo ? 'clamp(11.5px, 1.1vw, 15px)' : 'clamp(13px, 1.3vw, 18px)'
                                                            const fontSizePrezzo = 'clamp(13px, 1.2vw, 16px)'

                                                            return (
                                                                <button key={voce.id} onClick={() => aggiungiVoce(voce)} disabled={disabled}
                                                                    style={{ background: backgroundColor, border: 'none', borderRadius: 12, padding: '8px 8px 7px', textAlign: 'left', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', transition: 'transform 0.1s, box-shadow 0.1s', minHeight: 0, overflow: 'hidden', flex: 1 }}
                                                                    onMouseDown={e => { if (!disabled) { e.currentTarget.style.transform = 'scale(0.95)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,81,71,0.12)' } }}
                                                                    onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)' }}
                                                                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)' }}
                                                                >
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
                                                        })}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })
                        })()}
                    </div>
                </section>

                {/* Pannello ordine */}
                <aside style={{ width: '26%', minWidth: 350, background: C.surface, borderLeft: `1px solid ${C.surfaceHigh}`, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.04)', zIndex: 10 }}>

                    {/* Intestazione ordine */}
                    <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.surfaceHigh}`, background: `${C.surfaceLow}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <h2 style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 900, fontSize: 20, color: C.primary, margin: 0 }}>
                                {asporto ? '🥡 ASPORTO' : '📝 ORDINE'}
                            </h2>
                            <button onClick={apriCronologia}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', border: `1px solid ${C.outline}`, borderRadius: 8, background: C.surfaceHighest, color: C.onSurfaceVariant, fontFamily: 'Public Sans, sans-serif', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer' }}>
                                🕓 Cronologia
                            </button>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <p style={{ margin: 0, fontSize: 13, color: C.onSurfaceVariant, fontWeight: 600 }}>
                                {righe.length} {righe.length === 1 ? 'prodotto' : 'prodotti'}
                            </p>
                            <span style={{ padding: '4px 10px', background: righe.length > 0 ? C.primaryFixed : C.surfaceHigh, color: righe.length > 0 ? C.onPrimaryFixed : C.onSurfaceVariant, fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', borderRadius: 20 }}>
                                {righe.length > 0 ? 'In Corso' : 'Vuoto'}
                            </span>
                        </div>
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

                    {/* Azioni e Pagamento */}
                    <div style={{ padding: '16px 20px', borderTop: `1px solid ${C.surfaceHigh}`, background: C.surfaceLow, display: 'flex', flexDirection: 'column', gap: 14 }}>

                        {/* Riga Bottoni Secondari */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <button onClick={azzeraOrdine} style={{ padding: '12px 6px', background: C.surfaceHigh, color: C.onSurface, border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 11, cursor: 'pointer', fontFamily: 'Public Sans, sans-serif', textTransform: 'uppercase' }}>
                                ✕ Azzera
                            </button>
                            <button onClick={() => setModaleScontistica(true)}
                                style={{ padding: '12px 6px', background: scontoImporto > 0 ? C.secondary : C.surfaceHigh, color: scontoImporto > 0 ? '#fff' : C.onSurface, border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 11, cursor: 'pointer', fontFamily: 'Public Sans, sans-serif', textTransform: 'uppercase' }}>
                                🏷 Sconto {scontoImporto > 0 ? (scontoTipo === 'percentuale' ? `(${scontoValore}%)` : `(€${scontoValore})`) : ''}
                            </button>
                            <button onClick={() => setAsporto(a => !a)}
                                style={{ padding: '10px 6px', background: asporto ? C.surfaceHighest : C.surfaceHigh, color: asporto ? C.primary : C.onSurface, border: `2px solid ${asporto ? C.primary : 'transparent'}`, borderRadius: 10, fontWeight: 800, fontSize: 11, cursor: 'pointer', fontFamily: 'Public Sans, sans-serif', textTransform: 'uppercase', boxSizing: 'border-box' }}>
                                🥡 Asporto
                            </button>
                            <button onClick={righe.length ? apriAllergeni : undefined} disabled={!righe.length}
                                style={{ padding: '12px 6px', background: C.surfaceHigh, color: C.onSurface, border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 11, cursor: righe.length ? 'pointer' : 'default', opacity: righe.length ? 1 : 0.4, fontFamily: 'Public Sans, sans-serif', textTransform: 'uppercase' }}>
                                ℹ Allergeni
                            </button>
                        </div>

                        {/* Riepilogo Costi */}
                        <div style={{ background: C.surface, padding: '14px 16px', borderRadius: 12, border: `1px solid ${C.surfaceHigh}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: C.onSurfaceVariant, fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                                <span>Subtotale</span><span>€ {totale.toFixed(2)}</span>
                            </div>
                            {scontoImporto > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: C.tertiary, fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                                    <span>Sconto</span><span>−€ {scontoImporto.toFixed(2)}</span>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 6, marginTop: 4, borderTop: `1px dashed ${C.surfaceHigh}` }}>
                                <span style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 800, fontSize: 16, color: C.onSurface }}>TOTALE</span>
                                <span style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 900, fontSize: 26, color: C.primary, lineHeight: 1 }}>€ {totaleNetto.toFixed(2)}</span>
                            </div>
                        </div>

                        {/* Pagamento e Conferma */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div onClick={() => { setImportoTemp(importoPagato); setModaleTastierino(true); }}
                                    style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${C.outline}`, background: C.surfaceLowest, color: importoPagato ? C.onSurface : '#aaa', fontSize: 15, fontWeight: 600, boxSizing: 'border-box', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
                                    <span>{importoPagato ? `€ ${importoPagato}` : 'Importo pagato (€)'}</span>
                                    <span style={{ fontSize: 18, opacity: 0.7 }}>⌨️</span>
                                </div>
                                {resto !== null && (
                                    <div style={{ background: parseFloat(resto) >= 0 ? '#dcfce7' : '#fee2e2', color: parseFloat(resto) >= 0 ? '#166534' : '#991b1b', padding: '12px 14px', borderRadius: 10, fontWeight: 800, fontSize: 15, minWidth: 90, textAlign: 'center', border: `1px solid ${parseFloat(resto) >= 0 ? '#bbf7d0' : '#fecaca'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        R: € {resto}
                                    </div>
                                )}
                            </div>

                            <button onClick={confermaOrdine} disabled={!righe.length}
                                style={{ width: '100%', padding: '16px', background: righe.length ? `linear-gradient(135deg, ${C.primary}, ${C.primaryContainer})` : C.surfaceHigh, color: righe.length ? '#fff' : C.onSurfaceVariant, border: 'none', borderRadius: 10, fontFamily: 'Public Sans, sans-serif', fontWeight: 900, fontSize: 16, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: righe.length ? 'pointer' : 'default', boxShadow: righe.length ? '0 4px 16px rgba(0,81,71,0.2)' : 'none', transition: 'all 0.15s' }}>
                                CONFERMA ORDINE ✓
                            </button>
                        </div>
                    </div>
                </aside>
            </main>

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

            {/* ── MODALE TASTIERINO NUMERICO ── */}
            {modaleTastierino && (
                <div style={overlayStyle} onClick={() => setModaleTastierino(false)}>
                    <div style={{ ...modaleStyle, minWidth: 320, maxWidth: 360, padding: 24 }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 800, fontSize: 18, margin: '0 0 16px', color: C.primary, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Inserisci Importo
                        </h3>

                        <div style={{ background: C.surfaceLowest, border: `2px solid ${C.outline}`, borderRadius: 12, padding: '16px', fontSize: 28, fontWeight: 900, color: C.onSurface, textAlign: 'right', marginBottom: 20, minHeight: 64, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontFamily: 'monospace', boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.04)' }}>
                            {importoTemp ? `€ ${importoTemp}` : '0.00'}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
                            {['7', '8', '9', '4', '5', '6', '1', '2', '3', ',', '0', 'DEL'].map(tasto => (
                                <button key={tasto} onClick={() => gestisciTastierino(tasto)}
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
                            <button onClick={() => setImportoTemp('')}
                                style={{ flex: 1, padding: 16, border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 800, fontSize: 16, background: C.surfaceHigh, color: C.onSurface, transition: 'background 0.1s' }}
                                onMouseDown={e => e.currentTarget.style.background = C.surfaceHighest}
                                onMouseUp={e => e.currentTarget.style.background = C.surfaceHigh}
                                onMouseLeave={e => e.currentTarget.style.background = C.surfaceHigh}>
                                AZZERA
                            </button>
                            <button onClick={() => { setImportoPagato(importoTemp); setModaleTastierino(false) }}
                                style={{ flex: 2, padding: 16, border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 900, fontSize: 16, background: `linear-gradient(135deg, ${C.primary}, ${C.primaryContainer})`, color: '#fff', boxShadow: '0 4px 12px rgba(0,81,71,0.2)' }}>
                                CONFERMA ✓
                            </button>
                        </div>
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
