import React, { useState, useEffect } from 'react'
import { API, Icona } from './shared'
import ModalePietanza from './ModalePietanza'
import ModalePietanzaAggregata from './ModalePietanzaAggregata'
import PannelloScorte from './PannelloScorte'

// Tabella pietanze di un settore con CRUD, visibilità e scorte.
export default function VistaPietanze({ settore, onTorna }) {
    const [voci, setVoci] = useState([])
    const [caricamento, setCaricamento] = useState(true)
    const [modaleAperta, setModaleAperta] = useState(null) // 'singola' | 'aggregata'
    const [voceInModifica, setVoceInModifica] = useState(null)
    const [confermaElimina, setConfermaElimina] = useState(null)
    const [pannelloScorte, setPannelloScorte] = useState(null)

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
