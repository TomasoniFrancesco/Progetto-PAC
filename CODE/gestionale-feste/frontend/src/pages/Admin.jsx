import React, { useState, useEffect } from 'react'

const API = '/api'

// Ordine fisso delle categorie per la modale aggregata
const ORDINE_SETTORI = ['Primi', 'Secondi', 'Contorni', 'Dolci', 'Bar']

// ========================================
// Icone SVG inline
// ========================================
const Icona = {
    modifica: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>,
    elimina: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>,
    freccia: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>,
    occhio: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>,
    occhioOff: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>,
    link: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
    scorte: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.27 6.96 8.73 5.05 8.73-5.05"/><path d="M12 22.08V12.01"/></svg>,
}


// ========================================
// Componente principale Admin
// ========================================
export default function Admin() {
    const [tab, setTab] = useState('menu')
    const [stampanti, setStampanti] = useState([])
    const [caricamento, setCaricamento] = useState(true)
    const [settoreSelezionato, setSettoreSelezionato] = useState(null)

    useEffect(() => {
        if (tab === 'stampanti') {
            caricaStampanti()
        } else {
            setCaricamento(false)
        }
    }, [tab])

    async function caricaStampanti() {
        setCaricamento(true)
        try {
            const res = await fetch(`${API}/stampanti`)
            setStampanti(await res.json())
        } catch (err) { console.error(err) }
        finally { setCaricamento(false) }
    }

    const tabs = [
        { id: 'menu', label: 'Menu' },
        { id: 'stampanti', label: 'Stampanti' }
    ]

    return (
        <div style={{ minHeight: '100vh', background: '#1a1a2e', padding: 24 }}>
            <h1 style={{ marginBottom: 24, fontSize: '1.4rem', fontWeight: 800 }}>Pannello Admin</h1>

            <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
                {tabs.map(t => (
                    <button
                        key={t.id}
                        onClick={() => { setTab(t.id); setSettoreSelezionato(null) }}
                        style={{
                            padding: '10px 22px',
                            background: tab === t.id
                                ? 'linear-gradient(135deg, #e94560, #c0392b)'
                                : 'rgba(255,255,255,0.06)',
                            color: '#fff',
                            borderRadius: 10, fontSize: '0.9rem', fontWeight: 600,
                            letterSpacing: 0.3, transition: 'all 0.2s ease',
                            border: tab === t.id ? 'none' : '1px solid rgba(255,255,255,0.08)'
                        }}
                    >{t.label}</button>
                ))}
            </div>

            {caricamento && <div style={{ color: '#888' }}>Caricamento...</div>}

            {tab === 'menu' && (
                settoreSelezionato
                    ? <VistaPietanze settore={settoreSelezionato} onTorna={() => setSettoreSelezionato(null)} />
                    : <VistaSettori onSeleziona={setSettoreSelezionato} />
            )}

            {!caricamento && tab === 'stampanti' && (
                <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                        Stampanti configurate
                    </div>
                    <table className="pietanze-tabella">
                        <thead><tr><th>Reparto</th><th>Indirizzo IP</th><th>Porta</th><th>Stato</th></tr></thead>
                        <tbody>
                            {stampanti.map(s => (
                                <tr key={s.id}><td>{s.reparto}</td><td>{s.indirizzo_ip}</td><td>{s.porta}</td><td>{s.stato}</td></tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}


// ========================================
// Vista Settori
// ========================================
function VistaSettori({ onSeleziona }) {
    const [settori, setSettori] = useState([])
    const [caricamento, setCaricamento] = useState(true)
    const [mostraModale, setMostraModale] = useState(null)
    const [settoreTarget, setSettoreTarget] = useState(null)
    const [inputNome, setInputNome] = useState('')
    const [errore, setErrore] = useState('')

    useEffect(() => { caricaSettori() }, [])

    async function caricaSettori() {
        setCaricamento(true)
        try {
            const res = await fetch(`${API}/menu/settori`)
            setSettori(await res.json())
        } catch (err) { console.error(err) }
        finally { setCaricamento(false) }
    }

    async function creaNuovoSettore() {
        const nome = inputNome.trim()
        if (!nome) { setErrore('Inserire un nome'); return }
        if (settori.some(s => s.settore_visualizzazione.toLowerCase() === nome.toLowerCase())) {
            setErrore('Settore già esistente'); return
        }
        setMostraModale(null); setInputNome(''); setErrore('')
        onSeleziona(nome)
    }

    async function rinominaSettore() {
        const nuovoNome = inputNome.trim()
        if (!nuovoNome) { setErrore('Inserire un nome'); return }
        try {
            const res = await fetch(`${API}/menu/settori/rinomina`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vecchio_nome: settoreTarget, nuovo_nome: nuovoNome })
            })
            if (!res.ok) { setErrore((await res.json()).errore || 'Errore'); return }
            setMostraModale(null); setInputNome(''); setErrore(''); caricaSettori()
        } catch { setErrore('Errore di connessione') }
    }

    async function eliminaSettore() {
        try {
            const res = await fetch(`${API}/menu/settori/${encodeURIComponent(settoreTarget)}`, { method: 'DELETE' })
            if (!res.ok) { setErrore((await res.json()).errore || 'Errore'); return }
            setMostraModale(null); setSettoreTarget(null); setErrore(''); caricaSettori()
        } catch { setErrore('Errore di connessione') }
    }

    function chiudiModale() { setMostraModale(null); setInputNome(''); setErrore(''); setSettoreTarget(null) }

    if (caricamento) return <div style={{ color: '#888' }}>Caricamento settori...</div>

    return (
        <>
            <div className="settori-grid">
                {settori.map(s => (
                    <div key={s.settore_visualizzazione} className="settore-card"
                        style={{ '--settore-colore': s.colore || '#4A90D9' }}
                        onClick={() => onSeleziona(s.settore_visualizzazione)}>
                        <div className="settore-card__azioni">
                            <button title="Rinomina" onClick={e => { e.stopPropagation(); setSettoreTarget(s.settore_visualizzazione); setInputNome(s.settore_visualizzazione); setMostraModale('rinomina') }}>
                                {Icona.modifica}
                            </button>
                            <button className="btn-elimina" title="Elimina" onClick={e => { e.stopPropagation(); setSettoreTarget(s.settore_visualizzazione); setMostraModale('elimina') }}>
                                {Icona.elimina}
                            </button>
                        </div>
                        <div className="settore-card__nome">{s.settore_visualizzazione}</div>
                        <div className="settore-card__count">{s.num_pietanze} {s.num_pietanze === 1 ? 'pietanza' : 'pietanze'}</div>
                    </div>
                ))}
                <div className="settore-card settore-card--add" onClick={() => setMostraModale('nuovo')}>
                    <div className="settore-card--add__icon">+</div>
                    <div className="settore-card--add__label">Nuovo settore</div>
                </div>
            </div>

            {mostraModale === 'nuovo' && (
                <div className="modal-overlay" onClick={chiudiModale}>
                    <div className="modal-card" onClick={e => e.stopPropagation()}>
                        <div className="modal-card__titolo">Nuovo Settore</div>
                        <div className="modal-simple-input">
                            {errore && <div className="errore-messaggio">{errore}</div>}
                            <div>
                                <label className="campo-label">Nome settore</label>
                                <input className="campo-input" type="text" value={inputNome} onChange={e => setInputNome(e.target.value)} placeholder="Es. Antipasti" autoFocus onKeyDown={e => e.key === 'Enter' && creaNuovoSettore()} />
                            </div>
                        </div>
                        <div className="modal-card__footer">
                            <button className="btn-annulla" onClick={chiudiModale}>Annulla</button>
                            <button className="btn-salva" onClick={creaNuovoSettore}>Crea Settore</button>
                        </div>
                    </div>
                </div>
            )}

            {mostraModale === 'rinomina' && (
                <div className="modal-overlay" onClick={chiudiModale}>
                    <div className="modal-card" onClick={e => e.stopPropagation()}>
                        <div className="modal-card__titolo">Rinomina Settore</div>
                        <div className="modal-simple-input">
                            {errore && <div className="errore-messaggio">{errore}</div>}
                            <div>
                                <label className="campo-label">Nuovo nome</label>
                                <input className="campo-input" type="text" value={inputNome} onChange={e => setInputNome(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && rinominaSettore()} />
                            </div>
                        </div>
                        <div className="modal-card__footer">
                            <button className="btn-annulla" onClick={chiudiModale}>Annulla</button>
                            <button className="btn-salva" onClick={rinominaSettore}>Rinomina</button>
                        </div>
                    </div>
                </div>
            )}

            {mostraModale === 'elimina' && (
                <div className="modal-overlay" onClick={chiudiModale}>
                    <div className="modal-card" onClick={e => e.stopPropagation()}>
                        <div className="modal-card__titolo">Elimina Settore</div>
                        <div className="conferma-elimina__msg">
                            Sei sicuro di voler eliminare il settore <span className="conferma-elimina__highlight">"{settoreTarget}"</span>?
                            <br /><br />Tutte le pietanze del settore verranno eliminate definitivamente.
                        </div>
                        <div className="modal-card__footer">
                            <button className="btn-annulla" onClick={chiudiModale}>Annulla</button>
                            <button className="btn-elimina-confirm" onClick={eliminaSettore}>Elimina Settore</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}


// ========================================
// Vista Pietanze — Tabella con CRUD + Scorte
// ========================================
function VistaPietanze({ settore, onTorna }) {
    const [voci, setVoci] = useState([])
    const [caricamento, setCaricamento] = useState(true)
    const [modaleAperta, setModaleAperta] = useState(null) // 'singola' | 'aggregata'
    const [voceInModifica, setVoceInModifica] = useState(null)
    const [confermaElimina, setConfermaElimina] = useState(null)
    const [pannelloScorte, setPannelloScorte] = useState(null) // voce_id per il pannello scorte

    useEffect(() => { caricaVoci() }, [settore])

    async function caricaVoci() {
        setCaricamento(true)
        try {
            const res = await fetch(`${API}/menu/tutte`)
            const tutte = await res.json()
            const filtrate = tutte
                .filter(v => v.settore_visualizzazione === settore)
                .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'it'))
            setVoci(filtrate)
        } catch (err) { console.error(err) }
        finally { setCaricamento(false) }
    }

    const categoriaDefault = (() => {
        const conteggio = {}
        voci.forEach(v => { if (v.categoria) conteggio[v.categoria] = (conteggio[v.categoria] || 0) + 1 })
        let max = 0, catMax = ''
        Object.entries(conteggio).forEach(([cat, n]) => { if (n > max) { max = n; catMax = cat } })
        return catMax
    })()

    async function toggleVisibilita(voce) {
        try {
            await fetch(`${API}/menu/${voce.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ visibile: voce.visibile ? 0 : 1 })
            })
            caricaVoci()
        } catch (err) { console.error(err) }
    }

    async function eliminaVoce(id) {
        try {
            await fetch(`${API}/menu/${id}`, { method: 'DELETE' })
            setConfermaElimina(null)
            caricaVoci()
        } catch (err) { console.error(err) }
    }

    function apriModaleModifica(voce) {
        setVoceInModifica(voce)
        setModaleAperta(voce.num_componenti > 0 ? 'aggregata' : 'singola')
    }

    function dopoSalvataggio() {
        setModaleAperta(null); setVoceInModifica(null); caricaVoci()
    }

    if (caricamento) return <div style={{ color: '#888' }}>Caricamento pietanze...</div>

    return (
        <>
            <div className="pietanze-header">
                <button className="pietanze-header__back" onClick={onTorna}>
                    {Icona.freccia} Settori
                </button>
                <div className="pietanze-header__titolo">
                    {settore}
                    <span style={{ color: '#666', fontWeight: 400, fontSize: '0.9rem', marginLeft: 12 }}>
                        ({voci.length} {voci.length === 1 ? 'pietanza' : 'pietanze'})
                    </span>
                </div>
                <div className="pietanze-header__actions">
                    <button className="btn-aggiungi" onClick={() => { setVoceInModifica(null); setModaleAperta('singola') }}>
                        + Nuova pietanza
                    </button>
                    <button className="btn-aggiungi btn-aggiungi--aggregata" onClick={() => { setVoceInModifica(null); setModaleAperta('aggregata') }}>
                        {Icona.link} Nuova aggregata
                    </button>
                </div>
            </div>

            {voci.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state__icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>
                    </div>
                    <div className="empty-state__text">
                        Nessuna pietanza in questo settore.<br />Usa i pulsanti sopra per iniziare.
                    </div>
                </div>
            ) : (
                <table className="pietanze-tabella">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Nome</th>
                            <th>Prezzo</th>
                            <th>Categoria</th>
                            <th>Scorte</th>
                            <th>Colore</th>
                            <th>Visibile</th>
                            <th>Azioni</th>
                        </tr>
                    </thead>
                    <tbody>
                        {voci.map(voce => (
                            <tr key={voce.id} className={voce.visibile ? '' : 'voce-nascosta'}>
                                <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#666' }}>{voce.codice}</td>
                                <td style={{ fontWeight: 600 }}>
                                    {voce.nome}
                                    {voce.num_componenti > 0 && (
                                        <span className="badge-aggregata" title="Pietanza aggregata">
                                            {Icona.link} {voce.num_componenti} comp.
                                        </span>
                                    )}
                                </td>
                                <td>{parseFloat(voce.prezzo).toFixed(2)} €</td>
                                <td style={{ color: '#999' }}>{voce.categoria || '—'}</td>
                                <td>
                                    <button
                                        className={`btn-scorte ${voce.scorta_attiva ? (
                                            voce.scorta_quantita === 0 ? 'btn-scorte--esaurito' :
                                            voce.scorta_quantita <= (voce.soglia_rosso || 3) ? 'btn-scorte--critico' :
                                            voce.scorta_quantita <= (voce.soglia_giallo || 10) ? 'btn-scorte--attenzione' :
                                            'btn-scorte--ok'
                                        ) : ''}`}
                                        onClick={() => setPannelloScorte(pannelloScorte === voce.id ? null : voce.id)}
                                        title="Gestisci scorte"
                                    >
                                        {Icona.scorte}
                                        {voce.scorta_attiva ? (
                                            <span className="btn-scorte__qty">{voce.scorta_quantita}</span>
                                        ) : (
                                            <span className="btn-scorte__label">—</span>
                                        )}
                                    </button>
                                </td>
                                <td>
                                    <span className="colore-preview" style={{ background: voce.colore_tasto || '#4A90D9' }} title={voce.colore_tasto} />
                                </td>
                                <td>
                                    <span className={`badge-visibile ${voce.visibile ? 'badge-visibile--si' : 'badge-visibile--no'}`}>
                                        {voce.visibile ? 'Visibile' : 'Nascosto'}
                                    </span>
                                </td>
                                <td>
                                    <div className="azioni-riga">
                                        <button className="btn-toggle-vis" title={voce.visibile ? 'Nascondi' : 'Mostra'} onClick={() => toggleVisibilita(voce)}>
                                            {voce.visibile ? Icona.occhio : Icona.occhioOff}
                                        </button>
                                        <button className="btn-modifica" title="Modifica" onClick={() => apriModaleModifica(voce)}>
                                            {Icona.modifica}
                                        </button>
                                        <button className="btn-elimina-riga" title="Elimina" onClick={() => setConfermaElimina(voce)}>
                                            {Icona.elimina}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {/* Mini-pannello scorte */}
            {pannelloScorte && (
                <PannelloScorte
                    voce={voci.find(v => v.id === pannelloScorte)}
                    onChiudi={() => setPannelloScorte(null)}
                    onAggiornato={caricaVoci}
                />
            )}

            {modaleAperta === 'singola' && (
                <ModalePietanza voce={voceInModifica} settoreDefault={settore} categoriaDefault={categoriaDefault}
                    onChiudi={() => { setModaleAperta(null); setVoceInModifica(null) }} onSalvato={dopoSalvataggio} />
            )}

            {modaleAperta === 'aggregata' && (
                <ModalePietanzaAggregata voce={voceInModifica} settoreDefault={settore} categoriaDefault={categoriaDefault}
                    onChiudi={() => { setModaleAperta(null); setVoceInModifica(null) }} onSalvato={dopoSalvataggio} />
            )}

            {confermaElimina && (
                <div className="modal-overlay" onClick={() => setConfermaElimina(null)}>
                    <div className="modal-card" onClick={e => e.stopPropagation()}>
                        <div className="modal-card__titolo">Elimina Pietanza</div>
                        <div className="conferma-elimina__msg">
                            Sei sicuro di voler eliminare <span className="conferma-elimina__highlight">"{confermaElimina.nome}"</span>?
                            <br /><br />L'operazione non può essere annullata.
                        </div>
                        <div className="modal-card__footer">
                            <button className="btn-annulla" onClick={() => setConfermaElimina(null)}>Annulla</button>
                            <button className="btn-elimina-confirm" onClick={() => eliminaVoce(confermaElimina.id)}>Elimina</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}


// ========================================
// Pannello Scorte inline
// ========================================
function PannelloScorte({ voce, onChiudi, onAggiornato }) {
    const [scorta, setScorta] = useState(null)
    const [storico, setStorico] = useState([])
    const [caricamento, setCaricamento] = useState(true)

    // Form rifornimento
    const [qta, setQta] = useState('')
    const [note, setNote] = useState('')
    const [salvataggio, setSalvataggio] = useState(false)
    const [errore, setErrore] = useState('')

    // Form modifica diretta quantità
    const [qtaModifica, setQtaModifica] = useState('')
    const [modalitaModifica, setModalitaModifica] = useState(false)

    // Form soglie
    const [sogliaGiallo, setSogliaGiallo] = useState(10)
    const [sogliaRosso, setSogliaRosso] = useState(3)

    useEffect(() => {
        if (voce) caricaDati()
    }, [voce?.id])

    async function caricaDati() {
        setCaricamento(true)
        try {
            const [resScorta, resStorico] = await Promise.all([
                fetch(`${API}/scorte/${voce.id}`),
                fetch(`${API}/scorte/${voce.id}/storico`)
            ])
            const datiScorta = await resScorta.json()
            const datiStorico = await resStorico.json()
            setScorta(datiScorta)
            setStorico(datiStorico)
            if (datiScorta) {
                setSogliaGiallo(datiScorta.soglia_giallo || 10)
                setSogliaRosso(datiScorta.soglia_rosso || 3)
                setQtaModifica(datiScorta.quantita ?? 0)
            } else {
                setQtaModifica(0)
            }
            setModalitaModifica(false)
        } catch (err) { console.error(err) }
        finally { setCaricamento(false) }
    }

    async function registraRifornimento() {
        const quantita = parseInt(qta)
        if (!quantita || quantita <= 0) { setErrore('Inserire una quantità valida'); return }

        setSalvataggio(true); setErrore('')
        try {
            const res = await fetch(`${API}/scorte/${voce.id}/rifornimento`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantita, note: note.trim() || null })
            })
            if (!res.ok) { setErrore((await res.json()).errore || 'Errore'); setSalvataggio(false); return }
            setQta(''); setNote('')
            caricaDati()
            onAggiornato()
        } catch { setErrore('Errore di connessione') }
        finally { setSalvataggio(false) }
    }

    async function impostaQuantita() {
        const nuovaQta = parseInt(qtaModifica)
        if (isNaN(nuovaQta) || nuovaQta < 0) { setErrore('Quantità non valida'); return }

        setSalvataggio(true); setErrore('')
        try {
            const res = await fetch(`${API}/scorte/${voce.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quantita: nuovaQta,
                    soglia_giallo: parseInt(sogliaGiallo) || 10,
                    soglia_rosso: parseInt(sogliaRosso) || 3,
                    attiva: true
                })
            })
            if (!res.ok) { setErrore((await res.json()).errore || 'Errore'); setSalvataggio(false); return }
            setModalitaModifica(false)
            caricaDati()
            onAggiornato()
        } catch { setErrore('Errore di connessione') }
        finally { setSalvataggio(false) }
    }

    async function aggiornaSoglie() {
        try {
            await fetch(`${API}/scorte/${voce.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quantita: scorta?.quantita || 0,
                    soglia_giallo: parseInt(sogliaGiallo) || 10,
                    soglia_rosso: parseInt(sogliaRosso) || 3,
                    attiva: true
                })
            })
            caricaDati()
            onAggiornato()
        } catch (err) { console.error(err) }
    }

    if (!voce) return null

    return (
        <div className="modal-overlay" onClick={onChiudi}>
            <div className="modal-card pannello-scorte" onClick={e => e.stopPropagation()}>
                <div className="modal-card__titolo">
                    Scorte: {voce.nome}
                </div>

                {caricamento ? (
                    <div style={{ color: '#888', padding: 20 }}>Caricamento...</div>
                ) : (
                    <>
                        {/* Stato attuale + modifica diretta */}
                        <div className="scorte-stato">
                            <div className="scorte-stato__box">
                                <div className="scorte-stato__label">Quantità attuale</div>
                                {modalitaModifica ? (
                                    <div className="scorte-modifica-row">
                                        <input
                                            className="campo-input scorte-modifica-input"
                                            type="number" min="0"
                                            value={qtaModifica}
                                            onChange={e => setQtaModifica(e.target.value)}
                                            autoFocus
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') impostaQuantita()
                                                if (e.key === 'Escape') setModalitaModifica(false)
                                            }}
                                        />
                                        <button className="btn-salva scorte-modifica-btn" onClick={impostaQuantita} disabled={salvataggio}>
                                            Imposta
                                        </button>
                                        <button className="btn-annulla scorte-modifica-btn" onClick={() => { setModalitaModifica(false); setQtaModifica(scorta?.quantita ?? 0) }}>
                                            Annulla
                                        </button>
                                    </div>
                                ) : (
                                    <div className="scorte-stato__valore-row">
                                        <div className={`scorte-stato__valore ${
                                            !scorta || !scorta.attiva ? '' :
                                            scorta.quantita === 0 ? 'scorte-stato--esaurito' :
                                            scorta.quantita <= scorta.soglia_rosso ? 'scorte-stato--critico' :
                                            scorta.quantita <= scorta.soglia_giallo ? 'scorte-stato--attenzione' :
                                            'scorte-stato--ok'
                                        }`}>
                                            {scorta && scorta.attiva ? scorta.quantita : 'Non attivo'}
                                        </div>
                                        <button
                                            className="btn-modifica-qta"
                                            onClick={() => { setQtaModifica(scorta?.quantita ?? 0); setModalitaModifica(true) }}
                                            title="Correggi quantità"
                                        >
                                            {Icona.modifica} Correggi
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="scorte-stato__soglie">
                                <div>
                                    <label className="campo-label">Soglia attenzione</label>
                                    <input className="campo-input campo-input--small" type="number" min="0"
                                        value={sogliaGiallo} onChange={e => setSogliaGiallo(e.target.value)}
                                        onBlur={aggiornaSoglie} />
                                </div>
                                <div>
                                    <label className="campo-label">Soglia critica</label>
                                    <input className="campo-input campo-input--small" type="number" min="0"
                                        value={sogliaRosso} onChange={e => setSogliaRosso(e.target.value)}
                                        onBlur={aggiornaSoglie} />
                                </div>
                            </div>
                        </div>

                        {/* Form rifornimento */}
                        <div className="scorte-rifornimento">
                            <div className="scorte-rifornimento__titolo">Registra rifornimento</div>
                            {errore && <div className="errore-messaggio">{errore}</div>}
                            <div className="scorte-rifornimento__row">
                                <div style={{ flex: 1 }}>
                                    <label className="campo-label">Quantità da aggiungere</label>
                                    <input className="campo-input" type="number" min="1" value={qta}
                                        onChange={e => setQta(e.target.value)} placeholder="Es. 50"
                                        onKeyDown={e => e.key === 'Enter' && registraRifornimento()} />
                                </div>
                                <div style={{ flex: 2 }}>
                                    <label className="campo-label">Note (opzionale)</label>
                                    <input className="campo-input" type="text" value={note}
                                        onChange={e => setNote(e.target.value)} placeholder="Es. Consegna fornitore"
                                        onKeyDown={e => e.key === 'Enter' && registraRifornimento()} />
                                </div>
                                <button className="btn-salva scorte-rifornimento__btn" onClick={registraRifornimento} disabled={salvataggio}>
                                    {salvataggio ? '...' : 'Aggiungi'}
                                </button>
                            </div>
                        </div>

                        {/* Storico */}
                        <div className="scorte-storico">
                            <div className="scorte-storico__titolo">Storico rifornimenti</div>
                            {storico.length === 0 ? (
                                <div className="scorte-storico__vuoto">Nessun rifornimento registrato</div>
                            ) : (
                                <div className="scorte-storico__lista">
                                    {storico.map(s => (
                                        <div key={s.id} className="scorte-storico__riga">
                                            <div className="scorte-storico__qta">+{s.quantita}</div>
                                            <div className="scorte-storico__data">
                                                {new Date(s.data_rifornimento).toLocaleDateString('it-IT', {
                                                    day: '2-digit', month: '2-digit', year: 'numeric',
                                                    hour: '2-digit', minute: '2-digit'
                                                })}
                                            </div>
                                            <div className="scorte-storico__note">{s.note || ''}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}

                <div className="modal-card__footer">
                    <button className="btn-annulla" onClick={onChiudi}>Chiudi</button>
                </div>
            </div>
        </div>
    )
}


// ========================================
// Modale Pietanza Singola
// ========================================
function ModalePietanza({ voce, settoreDefault, categoriaDefault, onChiudi, onSalvato }) {
    const isModifica = !!voce
    const [form, setForm] = useState({
        nome: voce?.nome || '',
        prezzo: voce ? parseFloat(voce.prezzo) : '',
        categoria: voce?.categoria || categoriaDefault || '',
        settore_visualizzazione: voce?.settore_visualizzazione || settoreDefault || '',
        settore_stampa: voce?.settore_stampa || '',
        colore_tasto: voce?.colore_tasto || '#4A90D9',
        ordine_schermo: voce?.ordine_schermo ?? 0,
        asportabile: voce ? !!voce.asportabile : true,
        modalita_stampa: voce?.modalita_stampa || 'singola_multipla'
    })
    const [opzioni, setOpzioni] = useState({ categorie: [], settori_stampa: [], settori_visualizzazione: [] })
    const [errore, setErrore] = useState('')
    const [salvataggio, setSalvataggio] = useState(false)
    const [mostraAvanzate, setMostraAvanzate] = useState(false)

    useEffect(() => {
        fetch(`${API}/menu/opzioni`).then(r => r.json()).then(setOpzioni).catch(console.error)
    }, [])

    function aggiornaCampo(campo, valore) { setForm(prev => ({ ...prev, [campo]: valore })) }

    async function salva() {
        if (!form.nome.trim()) { setErrore('Il nome è obbligatorio'); return }
        if (form.prezzo !== '' && (isNaN(form.prezzo) || parseFloat(form.prezzo) < 0)) {
            setErrore('Inserire un prezzo valido'); return
        }
        setSalvataggio(true); setErrore('')
        const corpo = {
            nome: form.nome.trim(),
            prezzo: form.prezzo !== '' ? parseFloat(form.prezzo) : 0,
            categoria: form.categoria.trim() || null,
            settore_visualizzazione: form.settore_visualizzazione.trim() || settoreDefault,
            settore_stampa: form.settore_stampa.trim() || null,
            colore_tasto: form.colore_tasto,
            ordine_schermo: parseInt(form.ordine_schermo) || 0,
            asportabile: form.asportabile ? 1 : 0,
            modalita_stampa: form.modalita_stampa
        }
        try {
            const res = await fetch(isModifica ? `${API}/menu/${voce.id}` : `${API}/menu`, {
                method: isModifica ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(corpo)
            })
            if (!res.ok) { setErrore((await res.json()).errore || 'Errore'); setSalvataggio(false); return }
            onSalvato()
        } catch { setErrore('Errore di connessione'); setSalvataggio(false) }
    }

    return (
        <div className="modal-overlay" onClick={onChiudi}>
            <div className="modal-card" onClick={e => e.stopPropagation()}>
                <div className="modal-card__titolo">{isModifica ? `Modifica: ${voce.nome}` : 'Nuova Pietanza'}</div>
                <div className="modal-card__form">
                    {errore && <div className="errore-messaggio">{errore}</div>}
                    <div className="campo-full">
                        <label className="campo-label">Nome pietanza *</label>
                        <input className="campo-input" type="text" value={form.nome} onChange={e => aggiornaCampo('nome', e.target.value)} placeholder="Es. Risotto ai porcini" autoFocus />
                    </div>
                    <div>
                        <label className="campo-label">Prezzo (€)</label>
                        <input className="campo-input" type="number" step="0.50" min="0" value={form.prezzo} onChange={e => aggiornaCampo('prezzo', e.target.value)} placeholder="0.00" />
                    </div>
                    <div>
                        <label className="campo-label">Categoria</label>
                        <DropdownConInput value={form.categoria} onChange={val => aggiornaCampo('categoria', val)} opzioni={opzioni.categorie} placeholder="Seleziona o digita..." />
                    </div>
                    <div>
                        <label className="campo-label">Settore in cassa</label>
                        <DropdownConInput value={form.settore_visualizzazione} onChange={val => aggiornaCampo('settore_visualizzazione', val)} opzioni={opzioni.settori_visualizzazione} placeholder="Seleziona o digita..." />
                    </div>
                    <div>
                        <label className="campo-label">Reparto stampa</label>
                        <DropdownConInput value={form.settore_stampa} onChange={val => aggiornaCampo('settore_stampa', val)} opzioni={opzioni.settori_stampa} placeholder="Seleziona o digita..." />
                    </div>
                    <div>
                        <label className="campo-label">Colore tasto</label>
                        <div className="campo-colore-wrap">
                            <input type="color" className="campo-colore-input" value={form.colore_tasto} onChange={e => aggiornaCampo('colore_tasto', e.target.value)} />
                            <input className="campo-input" type="text" value={form.colore_tasto} onChange={e => aggiornaCampo('colore_tasto', e.target.value)} style={{ flex: 1 }} />
                        </div>
                    </div>
                    <div className="campo-full">
                        <button type="button" className="btn-toggle-avanzate" onClick={() => setMostraAvanzate(!mostraAvanzate)}>
                            {mostraAvanzate ? '— Nascondi' : '+ Mostra'} impostazioni avanzate
                        </button>
                    </div>
                    {mostraAvanzate && (
                        <>
                            <div>
                                <label className="campo-label">Posizione in cassa</label>
                                <input className="campo-input" type="number" min="0" value={form.ordine_schermo} onChange={e => aggiornaCampo('ordine_schermo', e.target.value)} />
                                <span className="campo-hint">Numero più basso = appare prima</span>
                            </div>
                            <div>
                                <label className="campo-label">Stampa comanda</label>
                                <select className="campo-input" value={form.modalita_stampa} onChange={e => aggiornaCampo('modalita_stampa', e.target.value)}>
                                    <option value="singola_multipla">Raggruppata (es. Risotto ×3)</option>
                                    <option value="singola_singola">Separata (1 riga per porzione)</option>
                                </select>
                            </div>
                            <div className="campo-checkbox-wrap">
                                <input type="checkbox" id="asportabile" checked={form.asportabile} onChange={e => aggiornaCampo('asportabile', e.target.checked)} />
                                <label htmlFor="asportabile">Disponibile per asporto</label>
                            </div>
                        </>
                    )}
                </div>
                <div className="modal-card__footer">
                    <button className="btn-annulla" onClick={onChiudi}>Annulla</button>
                    <button className="btn-salva" onClick={salva} disabled={salvataggio}>
                        {salvataggio ? 'Salvataggio...' : (isModifica ? 'Salva Modifiche' : 'Crea Pietanza')}
                    </button>
                </div>
            </div>
        </div>
    )
}


// ========================================
// Modale Pietanza Aggregata
// ========================================
function ModalePietanzaAggregata({ voce, settoreDefault, categoriaDefault, onChiudi, onSalvato }) {
    const isModifica = !!voce
    const [form, setForm] = useState({
        nome: voce?.nome || '',
        prezzo: voce ? parseFloat(voce.prezzo) : '',
        categoria: voce?.categoria || categoriaDefault || '',
        settore_visualizzazione: voce?.settore_visualizzazione || settoreDefault || '',
        settore_stampa: voce?.settore_stampa || '',
        colore_tasto: voce?.colore_tasto || '#4A90D9',
    })
    const [tutteLePietanze, setTutteLePietanze] = useState([])
    const [componentiSelezionati, setComponentiSelezionati] = useState([])
    const [ricerca, setRicerca] = useState('')
    const [opzioni, setOpzioni] = useState({ categorie: [], settori_stampa: [], settori_visualizzazione: [] })
    const [errore, setErrore] = useState('')
    const [salvataggio, setSalvataggio] = useState(false)

    useEffect(() => {
        Promise.all([
            fetch(`${API}/menu/tutte`).then(r => r.json()),
            fetch(`${API}/menu/opzioni`).then(r => r.json()),
        ]).then(([pietanze, opz]) => {
            const filtrate = pietanze
                .filter(p => p.num_componenti === 0 && (!voce || p.id !== voce.id))
                .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'it'))
            setTutteLePietanze(filtrate)
            setOpzioni(opz)
        }).catch(console.error)

        if (voce) {
            fetch(`${API}/menu/${voce.id}/composizione`)
                .then(r => r.json())
                .then(comp => setComponentiSelezionati(comp.map(c => c.id)))
                .catch(console.error)
        }
    }, [])

    function aggiornaCampo(campo, valore) { setForm(prev => ({ ...prev, [campo]: valore })) }
    function toggleComponente(id) { setComponentiSelezionati(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }
    function rimuoviComponente(id) { setComponentiSelezionati(prev => prev.filter(x => x !== id)) }

    const prezzoComponenti = componentiSelezionati.reduce((acc, id) => {
        const p = tutteLePietanze.find(x => x.id === id)
        return acc + (p ? parseFloat(p.prezzo) : 0)
    }, 0)

    const pietanzeFiltrate = tutteLePietanze.filter(p =>
        p.nome.toLowerCase().includes(ricerca.toLowerCase()) ||
        (p.categoria || '').toLowerCase().includes(ricerca.toLowerCase())
    )

    // Raggruppamento per settore_visualizzazione con ordine fisso
    const perSettore = {}
    pietanzeFiltrate.forEach(p => {
        const s = p.settore_visualizzazione || 'Altro'
        if (!perSettore[s]) perSettore[s] = []
        perSettore[s].push(p)
    })

    // Ordina le chiavi dei settori secondo ORDINE_SETTORI, poi il resto in ordine alfabetico
    const settoriOrdinati = Object.keys(perSettore).sort((a, b) => {
        const idxA = ORDINE_SETTORI.indexOf(a)
        const idxB = ORDINE_SETTORI.indexOf(b)
        if (idxA !== -1 && idxB !== -1) return idxA - idxB
        if (idxA !== -1) return -1
        if (idxB !== -1) return 1
        return a.localeCompare(b, 'it')
    })

    async function salva() {
        if (!form.nome.trim()) { setErrore('Il nome è obbligatorio'); return }
        if (componentiSelezionati.length < 2) { setErrore('Selezionare almeno 2 componenti'); return }
        setSalvataggio(true); setErrore('')
        try {
            if (isModifica) {
                const res1 = await fetch(`${API}/menu/${voce.id}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nome: form.nome.trim(),
                        prezzo: form.prezzo !== '' ? parseFloat(form.prezzo) : prezzoComponenti,
                        categoria: form.categoria.trim() || null,
                        settore_visualizzazione: form.settore_visualizzazione.trim() || settoreDefault,
                        settore_stampa: form.settore_stampa.trim() || null,
                        colore_tasto: form.colore_tasto,
                    })
                })
                if (!res1.ok) { setErrore((await res1.json()).errore || 'Errore'); setSalvataggio(false); return }
                const res2 = await fetch(`${API}/menu/${voce.id}/composizione`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ componenti: componentiSelezionati })
                })
                if (!res2.ok) { setErrore((await res2.json()).errore || 'Errore'); setSalvataggio(false); return }
            } else {
                const res = await fetch(`${API}/menu/aggregata`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nome: form.nome.trim(),
                        prezzo: form.prezzo !== '' ? parseFloat(form.prezzo) : prezzoComponenti,
                        categoria: form.categoria.trim() || null,
                        settore_visualizzazione: form.settore_visualizzazione.trim() || settoreDefault,
                        settore_stampa: form.settore_stampa.trim() || null,
                        colore_tasto: form.colore_tasto,
                        componenti: componentiSelezionati
                    })
                })
                if (!res.ok) { setErrore((await res.json()).errore || 'Errore'); setSalvataggio(false); return }
            }
            onSalvato()
        } catch { setErrore('Errore di connessione'); setSalvataggio(false) }
    }

    const componentiInfo = componentiSelezionati.map(id => tutteLePietanze.find(p => p.id === id)).filter(Boolean)

    return (
        <div className="modal-overlay" onClick={onChiudi}>
            <div className="modal-card modal-card--wide" onClick={e => e.stopPropagation()}>
                <div className="modal-card__titolo">{isModifica ? `Modifica aggregata: ${voce.nome}` : 'Nuova Pietanza Aggregata'}</div>
                <div className="modal-card__subtitle">Componi una pietanza selezionando i suoi ingredienti/componenti</div>

                {errore && <div className="errore-messaggio">{errore}</div>}

                <div className="aggregata-layout">
                    <div className="aggregata-lista">
                        <div className="aggregata-lista__header">
                            <label className="campo-label">Pietanze disponibili</label>
                            <input className="campo-input" type="text" value={ricerca} onChange={e => setRicerca(e.target.value)} placeholder="Cerca pietanza..." />
                        </div>
                        <div className="aggregata-lista__body">
                            {settoriOrdinati.map(settore => (
                                <div key={settore}>
                                    <div className="aggregata-lista__settore">{settore}</div>
                                    {perSettore[settore].map(p => {
                                        const sel = componentiSelezionati.includes(p.id)
                                        return (
                                            <div key={p.id} className={`aggregata-lista__item ${sel ? 'aggregata-lista__item--sel' : ''}`} onClick={() => toggleComponente(p.id)}>
                                                <span className="aggregata-lista__item-nome">{p.nome}</span>
                                                <span className="aggregata-lista__item-prezzo">{parseFloat(p.prezzo).toFixed(2)} €</span>
                                                <span className={`aggregata-lista__item-check ${sel ? 'checked' : ''}`}>{sel ? '✓' : ''}</span>
                                            </div>
                                        )
                                    })}
                                </div>
                            ))}
                            {pietanzeFiltrate.length === 0 && <div style={{ padding: 20, color: '#666', textAlign: 'center' }}>Nessun risultato</div>}
                        </div>
                    </div>

                    <div className="aggregata-dettagli">
                        <div>
                            <label className="campo-label">Nome pietanza aggregata *</label>
                            <input className="campo-input" type="text" value={form.nome} onChange={e => aggiornaCampo('nome', e.target.value)} placeholder="Es. Polenta e costine" autoFocus />
                        </div>
                        <div className="aggregata-dettagli__row">
                            <div style={{ flex: 1 }}>
                                <label className="campo-label">Prezzo (€)</label>
                                <input className="campo-input" type="number" step="0.50" min="0" value={form.prezzo} onChange={e => aggiornaCampo('prezzo', e.target.value)} placeholder={prezzoComponenti.toFixed(2)} />
                                <span className="campo-hint">Vuoto = somma componenti ({prezzoComponenti.toFixed(2)} €)</span>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label className="campo-label">Categoria</label>
                                <DropdownConInput value={form.categoria} onChange={val => aggiornaCampo('categoria', val)} opzioni={opzioni.categorie} placeholder="Seleziona..." />
                            </div>
                        </div>
                        <div className="aggregata-dettagli__row">
                            <div style={{ flex: 1 }}>
                                <label className="campo-label">Reparto stampa</label>
                                <DropdownConInput value={form.settore_stampa} onChange={val => aggiornaCampo('settore_stampa', val)} opzioni={opzioni.settori_stampa} placeholder="Seleziona..." />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label className="campo-label">Colore tasto</label>
                                <div className="campo-colore-wrap">
                                    <input type="color" className="campo-colore-input" value={form.colore_tasto} onChange={e => aggiornaCampo('colore_tasto', e.target.value)} />
                                    <input className="campo-input" type="text" value={form.colore_tasto} onChange={e => aggiornaCampo('colore_tasto', e.target.value)} style={{ flex: 1 }} />
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="campo-label">Componenti selezionati ({componentiSelezionati.length})</label>
                            {componentiInfo.length === 0 ? (
                                <div className="aggregata-empty-comp">Seleziona almeno 2 pietanze dalla lista a sinistra</div>
                            ) : (
                                <div className="aggregata-comp-pills">
                                    {componentiInfo.map(c => (
                                        <div key={c.id} className="aggregata-pill">
                                            <span>{c.nome}</span>
                                            <span className="aggregata-pill__prezzo">{parseFloat(c.prezzo).toFixed(2)} €</span>
                                            <button className="aggregata-pill__rimuovi" onClick={() => rimuoviComponente(c.id)} title="Rimuovi">&times;</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="modal-card__footer">
                    <button className="btn-annulla" onClick={onChiudi}>Annulla</button>
                    <button className="btn-salva" onClick={salva} disabled={salvataggio}>
                        {salvataggio ? 'Salvataggio...' : (isModifica ? 'Salva Modifiche' : 'Crea Aggregata')}
                    </button>
                </div>
            </div>
        </div>
    )
}


// ========================================
// Dropdown con input libero
// ========================================
function DropdownConInput({ value, onChange, opzioni, placeholder }) {
    const [aperto, setAperto] = useState(false)
    const [filtro, setFiltro] = useState(value || '')

    useEffect(() => { setFiltro(value || '') }, [value])

    const opzioniFiltrate = opzioni.filter(o => o.toLowerCase().includes(filtro.toLowerCase()))

    function seleziona(val) { onChange(val); setFiltro(val); setAperto(false) }
    function handleInput(e) { setFiltro(e.target.value); onChange(e.target.value); setAperto(true) }

    return (
        <div className="dropdown-wrap">
            <input className="campo-input" type="text" value={filtro} onChange={handleInput}
                onFocus={() => setAperto(true)} onBlur={() => setTimeout(() => setAperto(false), 150)} placeholder={placeholder} />
            {aperto && opzioniFiltrate.length > 0 && (
                <div className="dropdown-menu">
                    {opzioniFiltrate.map(o => (
                        <div key={o} className={`dropdown-item ${o === value ? 'dropdown-item--selected' : ''}`} onMouseDown={() => seleziona(o)}>{o}</div>
                    ))}
                </div>
            )}
        </div>
    )
}
