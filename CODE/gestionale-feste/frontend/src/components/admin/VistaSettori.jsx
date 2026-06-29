import React, { useState, useEffect } from 'react'
import { API, Icona, ORDINE_SETTORI } from './shared'

// Griglia dei settori con creazione, rinomina ed eliminazione.
export default function VistaSettori({ onSeleziona }) {
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

    const settoriOrdinati = [...settori].sort((a, b) => {
        const aKey = String(a.settore_visualizzazione || '').toLowerCase()
        const bKey = String(b.settore_visualizzazione || '').toLowerCase()
        const idxA = ORDINE_SETTORI.indexOf(aKey)
        const idxB = ORDINE_SETTORI.indexOf(bKey)
        if (idxA !== -1 && idxB !== -1) return idxA - idxB
        if (idxA !== -1) return -1
        if (idxB !== -1) return 1
        return aKey.localeCompare(bKey, 'it')
    })

    return (
        <>
            <div className="settori-grid">
                {settoriOrdinati.map(s => (
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
