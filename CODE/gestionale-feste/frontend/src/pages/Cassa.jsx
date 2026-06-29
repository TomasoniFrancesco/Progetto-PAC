import React, { useState, useEffect } from 'react'
import { io } from 'socket.io-client'
import { apiMenu, apiScorte, apiOrdini } from '../api/client'
import { C } from '../components/cassa/theme'
import { useCalcoloOrdine } from '../hooks/useCalcoloOrdine'
import { useTastierino } from '../hooks/useTastierino'
import GrigliaProdotti from '../components/cassa/GrigliaProdotti'
import PannelloOrdine from '../components/cassa/PannelloOrdine'
import Popup from '../components/cassa/Popup'
import ModaleTastierino from '../components/cassa/ModaleTastierino'
import ModaleScontistica from '../components/cassa/ModaleScontistica'
import ModaleCronologia from '../components/cassa/ModaleCronologia'
import { ModaleAllergeniOrdine, ModaleAllergeniVoce } from '../components/cassa/ModaleAllergeni'

const socket = io('/', { path: '/socket.io' })

const ordineSettori = ['bar', 'primi', 'secondi', 'contorni', 'dolce', 'dolci']

// Ordinamento: categoria → nome alfabetico
function ordinaVoci(a, b) {
    const catA = String(a.categoria || '').toLowerCase()
    const catB = String(b.categoria || '').toLowerCase()
    if (catA !== catB) return catA.localeCompare(catB, 'it', { sensitivity: 'base' })
    return String(a.nome).localeCompare(String(b.nome), 'it', { sensitivity: 'base' })
}

export default function Cassa() {
    const [voci, setVoci] = useState([])
    const [scorteMap, setScorteMap] = useState({})
    const [righe, setRighe] = useState([])
    const [asporto, setAsporto] = useState(false)
    const [importoPagato, setImportoPagato] = useState('')
    const [caricamento, setCaricamento] = useState(true)
    const [rigaAperta, setRigaAperta] = useState(null)

    const [modaleCronologia, setModaleCronologia] = useState(false)
    const [ordiniStorico, setOrdiniStorico] = useState([])
    const [caricaCronologia, setCaricaCronologia] = useState(false)

    const [scontoValore, setScontoValore] = useState('')
    const [scontoTipo, setScontoTipo] = useState('percentuale')
    const [modaleScontistica, setModaleScontistica] = useState(false)

    const [modaleAllergeni, setModaleAllergeni] = useState(false)
    const [allergeniPerVoce, setAllergeniPerVoce] = useState({})
    const [modaleVoceAllergeni, setModaleVoceAllergeni] = useState(null)

    const [modaleTastierino, setModaleTastierino] = useState(false)
    const [popup, setPopup] = useState(null)

    const mostraPopup = (messaggio, tipo = 'success') => {
        setPopup({ messaggio, tipo })
        setTimeout(() => setPopup(null), 3000)
    }

    const tastierino = useTastierino({
        aperto: modaleTastierino,
        onConferma: (valore) => setImportoPagato(valore),
        onChiudi: () => setModaleTastierino(false),
    })

    const { totale, scontoNum, scontoImporto, totaleNetto, importoPagatoValido, resto } =
        useCalcoloOrdine({ righe, scontoValore, scontoTipo, importoPagato })

    // Raggruppa voci per settore
    const vociPerSettore = ordineSettori.reduce((acc, settore) => {
        const vociSettore = voci.filter(v => String(v.settore_visualizzazione).toLowerCase() === String(settore).toLowerCase()).sort(ordinaVoci)
        if (vociSettore.length > 0) acc[settore] = vociSettore
        return acc
    }, {})

    useEffect(() => {
        caricaMenu()
        caricaScorte()
        caricaTuttiAllergeni()
        socket.on('scorte_aggiornate', nuoveScorte => {
            const mappa = {}
            nuoveScorte.forEach(s => { mappa[s.voce_id] = s })
            setScorteMap(mappa)
        })
        return () => socket.off('scorte_aggiornate')
    }, [])

    async function caricaMenu() {
        try { setVoci(await apiMenu.voci()) }
        catch (err) { console.error('Errore menu', err) }
        finally { setCaricamento(false) }
    }

    async function caricaScorte() {
        try {
            const dati = await apiScorte.tutte()
            const mappa = {}
            dati.forEach(s => { mappa[s.voce_id] = s })
            setScorteMap(mappa)
        } catch (err) { console.error('Errore scorte', err) }
    }

    async function caricaTuttiAllergeni() {
        try { setAllergeniPerVoce(await apiMenu.tuttiAllergeni()) }
        catch (err) { console.error('Errore allergeni', err) }
    }

    function aggiungiVoce(voce) {
        const s = scorteMap[voce.id]
        if (s?.attiva && s.quantita === 0) {
            mostraPopup('✗ Prodotto esaurito', 'error')
            return
        }
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
        setRighe(prev => prev.map(r => {
            if (r.voce_id !== voce_id) return r
            const nuovaQuantita = r.quantita + delta
            if (nuovaQuantita < 1) return { ...r, quantita: 1 }
            if (delta > 0) {
                const s = scorteMap[voce_id]
                if (s?.attiva && nuovaQuantita > s.quantita) {
                    mostraPopup(`✗ Scorta insufficiente (disponibile: ${s.quantita})`, 'error')
                    return r
                }
            }
            return { ...r, quantita: nuovaQuantita }
        }))
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

    async function apriCronologia() {
        setModaleCronologia(true)
        setCaricaCronologia(true)
        try { setOrdiniStorico(await apiOrdini.lista()) }
        catch (err) { console.error('Errore cronologia', err) }
        finally { setCaricaCronologia(false) }
    }

    async function confermaOrdine() {
        if (!righe.length) return
        if (!importoPagatoValido) {
            mostraPopup('✗ Inserire l\'importo pagato', 'error')
            return
        }
        try {
            const { id } = await apiOrdini.crea({ righe })
            await apiOrdini.conferma(id, {
                asporto, sconto: scontoNum || 0, tipo_sconto: scontoTipo,
                importo_pagato: importoPagato ? parseFloat(importoPagato) : null,
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'Inter, sans-serif', background: C.surface, color: C.onSurface, overflow: 'hidden' }}>
            <main style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                <section style={{ flex: '0 0 74%', maxWidth: '74%', overflow: 'hidden', padding: '20px 20px', background: C.surfaceLow }}>
                    <GrigliaProdotti
                        vociPerSettore={vociPerSettore}
                        scorteMap={scorteMap}
                        allergeniPerVoce={allergeniPerVoce}
                        onAggiungi={aggiungiVoce}
                        onApriAllergeniVoce={setModaleVoceAllergeni}
                    />
                </section>

                <PannelloOrdine
                    righe={righe}
                    rigaAperta={rigaAperta}
                    onToggleRiga={(id) => setRigaAperta(rigaAperta === id ? null : id)}
                    onCambiaQuantita={cambiaQuantita}
                    onRimuovi={rimuoviVoce}
                    onSalvaNote={salvaNote}
                    asporto={asporto}
                    onToggleAsporto={() => setAsporto(a => !a)}
                    scontoImporto={scontoImporto}
                    scontoTipo={scontoTipo}
                    scontoValore={scontoValore}
                    totale={totale}
                    totaleNetto={totaleNetto}
                    importoPagato={importoPagato}
                    importoPagatoValido={importoPagatoValido}
                    resto={resto}
                    onAzzera={azzeraOrdine}
                    onApriSconto={() => setModaleScontistica(true)}
                    onApriAllergeni={() => setModaleAllergeni(true)}
                    onApriCronologia={apriCronologia}
                    onApriTastierino={() => { tastierino.setImportoTemp(importoPagato); setModaleTastierino(true) }}
                    onConferma={confermaOrdine}
                />
            </main>

            {modaleCronologia && (
                <ModaleCronologia caricamento={caricaCronologia} ordini={ordiniStorico} onChiudi={() => setModaleCronologia(false)} />
            )}
            {modaleScontistica && (
                <ModaleScontistica
                    scontoTipo={scontoTipo} setScontoTipo={setScontoTipo}
                    scontoValore={scontoValore} setScontoValore={setScontoValore}
                    scontoNum={scontoNum} scontoImporto={scontoImporto} totaleNetto={totaleNetto}
                    onRimuovi={() => { setScontoValore(''); setModaleScontistica(false) }}
                    onChiudi={() => setModaleScontistica(false)}
                />
            )}
            {modaleAllergeni && (
                <ModaleAllergeniOrdine righe={righe} allergeniPerVoce={allergeniPerVoce} onChiudi={() => setModaleAllergeni(false)} />
            )}
            {modaleVoceAllergeni && (
                <ModaleAllergeniVoce voce={modaleVoceAllergeni} allergeniPerVoce={allergeniPerVoce} onChiudi={() => setModaleVoceAllergeni(null)} />
            )}
            {modaleTastierino && (
                <ModaleTastierino
                    importoTemp={tastierino.importoTemp}
                    gestisci={tastierino.gestisci}
                    onAzzera={() => tastierino.setImportoTemp('')}
                    onConferma={() => { setImportoPagato(tastierino.importoTemp); setModaleTastierino(false) }}
                    onChiudi={() => setModaleTastierino(false)}
                />
            )}

            <Popup popup={popup} />
        </div>
    )
}
