import React, { useState, useEffect } from 'react'
import { API, PALETTE, coloreDefaultPerSettore, ORDINE_SETTORI } from './shared'
import { validaAggregata, payloadAggregata } from './formPietanza'
import DropdownConInput from './DropdownConInput'

// Modale per comporre una pietanza aggregata da più componenti.
export default function ModalePietanzaAggregata({ voce, settoreDefault, categoriaDefault, onChiudi, onSalvato }) {
    const isModifica = !!voce
    const [form, setForm] = useState({
        nome: voce?.nome || '',
        prezzo: voce ? parseFloat(voce.prezzo) : '',
        categoria: voce?.categoria || categoriaDefault || '',
        settore_visualizzazione: voce?.settore_visualizzazione || settoreDefault || '',
        settore_stampa: voce?.settore_stampa || '',
        colore_tasto: voce?.colore_tasto || coloreDefaultPerSettore(settoreDefault),
    })
    const [tutteLePietanze, setTutteLePietanze] = useState([])
    const [componentiSelezionati, setComponentiSelezionati] = useState([])
    const [ricerca, setRicerca] = useState('')
    const [opzioni, setOpzioni] = useState({ categorie: [], settori_stampa: [], settori_visualizzazione: [] })
    const [errore, setErrore] = useState('')
    const [salvataggio, setSalvataggio] = useState(false)

    // Auto-aggiorna colore quando cambia il settore (solo per nuove pietanze)
    useEffect(() => {
        if (!isModifica) {
            aggiornaCampo('colore_tasto', coloreDefaultPerSettore(form.settore_visualizzazione))
        }
    }, [form.settore_visualizzazione])

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

    const perSettore = {}
    pietanzeFiltrate.forEach(p => {
        const s = p.settore_visualizzazione || 'Altro'
        if (!perSettore[s]) perSettore[s] = []
        perSettore[s].push(p)
    })

    const settoriOrdinati = Object.keys(perSettore).sort((a, b) => {
        const idxA = ORDINE_SETTORI.indexOf(String(a).toLowerCase())
        const idxB = ORDINE_SETTORI.indexOf(String(b).toLowerCase())
        if (idxA !== -1 && idxB !== -1) return idxA - idxB
        if (idxA !== -1) return -1
        if (idxB !== -1) return 1
        return a.localeCompare(b, 'it')
    })

    async function salva() {
        const err = validaAggregata(form, componentiSelezionati)
        if (err) { setErrore(err); return }
        setSalvataggio(true); setErrore('')
        const base = payloadAggregata(form, settoreDefault, prezzoComponenti)
        try {
            if (isModifica) {
                const res1 = await fetch(`${API}/menu/${voce.id}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(base)
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
                    body: JSON.stringify({ ...base, componenti: componentiSelezionati })
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
                                <label className="campo-label">Settore in cassa</label>
                                <DropdownConInput value={form.settore_visualizzazione} onChange={val => aggiornaCampo('settore_visualizzazione', val)} opzioni={opzioni.settori_visualizzazione} placeholder="Seleziona..." />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label className="campo-label">Reparto stampa</label>
                                <DropdownConInput value={form.settore_stampa} onChange={val => aggiornaCampo('settore_stampa', val)} opzioni={opzioni.settori_stampa} placeholder="Seleziona..." />
                            </div>
                        </div>
                        <div>
                            <label className="campo-label">Colore tasto</label>
                            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                {PALETTE.map(p => (
                                    <button key={p.hex} type="button" title={p.label}
                                        onClick={() => aggiornaCampo('colore_tasto', p.hex)}
                                        style={{ width: 32, height: 32, borderRadius: '50%', background: p.hex, border: form.colore_tasto === p.hex ? '3px solid #005147' : '3px solid transparent', outline: form.colore_tasto === p.hex ? '2px solid #005147' : 'none', outlineOffset: 2, cursor: 'pointer', flexShrink: 0 }}
                                    />
                                ))}
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
