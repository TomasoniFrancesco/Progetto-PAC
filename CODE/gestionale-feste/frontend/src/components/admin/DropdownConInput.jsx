import React, { useState, useEffect } from 'react'

// Campo con dropdown a opzioni e input libero (categoria, settore, ecc.).
export default function DropdownConInput({ value, onChange, opzioni, placeholder }) {
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
