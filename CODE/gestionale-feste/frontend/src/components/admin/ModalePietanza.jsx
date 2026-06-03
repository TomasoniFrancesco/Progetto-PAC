import React, { useState, useEffect } from 'react'
import { API, PALETTE, coloreDefaultPerSettore } from './shared'
import { validaPietanza, payloadPietanza } from './formPietanza'
import DropdownConInput from './DropdownConInput'

// Modale per creare/modificare una pietanza singola.
export default function ModalePietanza({ voce, settoreDefault, categoriaDefault, onChiudi, onSalvato }) {
    const isModifica = !!voce
    const [form, setForm] = useState({
        nome: voce?.nome || '',
        prezzo: voce ? parseFloat(voce.prezzo) : '',
        categoria: voce?.categoria || categoriaDefault || '',
        settore_visualizzazione: voce?.settore_visualizzazione || settoreDefault || '',
        settore_stampa: voce?.settore_stampa || '',
        colore_tasto: voce?.colore_tasto || coloreDefaultPerSettore(settoreDefault),
        copia_scontrino_cliente: voce ? !!voce.copia_scontrino_cliente : false,
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

    // Auto-aggiorna colore quando cambia il settore (solo per nuove pietanze)
    useEffect(() => {
        if (!isModifica) {
            aggiornaCampo('colore_tasto', coloreDefaultPerSettore(form.settore_visualizzazione))
        }
    }, [form.settore_visualizzazione])

    function aggiornaCampo(campo, valore) { setForm(prev => ({ ...prev, [campo]: valore })) }

    async function salva() {
        const err = validaPietanza(form)
        if (err) { setErrore(err); return }
        setSalvataggio(true); setErrore('')
        const corpo = payloadPietanza(form, settoreDefault)
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
                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                            {PALETTE.map(p => (
                                <button key={p.hex} type="button" title={p.label}
                                    onClick={() => aggiornaCampo('colore_tasto', p.hex)}
                                    style={{ width: 32, height: 32, borderRadius: '50%', background: p.hex, border: form.colore_tasto === p.hex ? '3px solid #005147' : '3px solid transparent', outline: form.colore_tasto === p.hex ? '2px solid #005147' : 'none', outlineOffset: 2, cursor: 'pointer', flexShrink: 0 }}
                                />
                            ))}
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
                                <label className="campo-label">Stampa comanda</label>
                                <select className="campo-input" value={form.modalita_stampa} onChange={e => aggiornaCampo('modalita_stampa', e.target.value)}>
                                    <option value="singola_multipla">Raggruppata (es. Risotto ×3)</option>
                                    <option value="singola_singola">Separata (1 riga per porzione)</option>
                                </select>
                            </div>
                            <div className="campo-checkbox-wrap">
                                <input type="checkbox" id="copia_scontrino_cliente" checked={form.copia_scontrino_cliente} onChange={e => aggiornaCampo('copia_scontrino_cliente', e.target.checked)} />
                                <label htmlFor="copia_scontrino_cliente">Copia scontrino cliente (stampante cassa)</label>
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
