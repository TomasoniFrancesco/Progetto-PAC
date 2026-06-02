import React, { useState, useEffect } from 'react'
import { API, Icona } from './shared'

// Pannello inline di gestione scorte di una voce: stato, modifica diretta,
// soglie, registrazione rifornimenti e storico.
export default function PannelloScorte({ voce, onChiudi, onAggiornato }) {
    const [scorta, setScorta] = useState(null)
    const [storico, setStorico] = useState([])
    const [caricamento, setCaricamento] = useState(true)

    const [qta, setQta] = useState('')
    const [note, setNote] = useState('')
    const [salvataggio, setSalvataggio] = useState(false)
    const [errore, setErrore] = useState('')

    const [qtaModifica, setQtaModifica] = useState('')
    const [modalitaModifica, setModalitaModifica] = useState(false)

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
