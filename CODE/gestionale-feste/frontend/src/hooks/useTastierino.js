import { useState, useEffect } from 'react'

// Gestisce l'importo digitato sul tastierino numerico e la tastiera fisica
// quando il tastierino è aperto. onConferma(valore) e onChiudi() sono invocati
// rispettivamente con Invio ed Esc.
export function useTastierino({ aperto, onConferma, onChiudi }) {
    const [importoTemp, setImportoTemp] = useState('')

    const gestisci = (val) => {
        if (val === 'DEL') setImportoTemp(prev => prev.slice(0, -1))
        else if (val === ',') {
            if (!importoTemp.includes('.')) setImportoTemp(prev => prev + '.')
        } else {
            setImportoTemp(prev => prev + val)
        }
    }

    useEffect(() => {
        if (!aperto) return
        const onKey = (e) => {
            if (e.key >= '0' && e.key <= '9') { e.preventDefault(); gestisci(e.key) }
            else if (e.key === ',' || e.key === '.') { e.preventDefault(); gestisci(',') }
            else if (e.key === 'Backspace') { e.preventDefault(); gestisci('DEL') }
            else if (e.key === 'Enter') { e.preventDefault(); onConferma(importoTemp); onChiudi() }
            else if (e.key === 'Escape') { e.preventDefault(); onChiudi() }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aperto, importoTemp])

    return { importoTemp, setImportoTemp, gestisci }
}
