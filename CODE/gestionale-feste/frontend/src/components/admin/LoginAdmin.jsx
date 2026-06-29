import React, { useState } from 'react'
import { apiAuth } from '../../api/client'
import { C } from './shared'

// Schermata di accesso all'area Admin (Iterazione 3).
// Accesso con una sola password (nessun username). In caso di successo invoca
// onAccesso(), che sblocca il pannello di amministrazione.
export default function LoginAdmin({ onAccesso }) {
    const [password, setPassword] = useState('')
    const [errore, setErrore] = useState('')
    const [inCorso, setInCorso] = useState(false)

    async function invia(e) {
        e.preventDefault()
        setErrore('')
        setInCorso(true)
        try {
            const r = await apiAuth.login(password)
            if (r.ok) {
                onAccesso()
            } else if (r.status === 401) {
                setErrore('Password errata')
            } else {
                setErrore(r.body?.errore || 'Errore di accesso')
            }
        } catch {
            setErrore('Impossibile contattare il server')
        } finally {
            setInCorso(false)
        }
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.surfaceLow, fontFamily: 'Inter, sans-serif' }}>
            <form onSubmit={invia} style={{ width: 360, background: C.surface, borderRadius: 16, padding: 32, boxShadow: '0 8px 32px rgba(27,27,30,0.10)', border: `1px solid ${C.surfaceHigh}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🎪</div>
                    <div>
                        <div style={{ fontFamily: 'Public Sans, sans-serif', fontWeight: 900, fontSize: 18, color: C.primary }}>FestivalPOS</div>
                        <div style={{ fontSize: 12, color: C.onSurfaceVariant }}>Accesso Amministratore</div>
                    </div>
                </div>

                <label htmlFor="admin-password" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.onSurfaceVariant, marginBottom: 6 }}>
                    Password
                </label>
                <input
                    id="admin-password"
                    type="password"
                    value={password}
                    autoFocus
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Inserisci la password"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 10, border: `1px solid ${errore ? '#D45454' : C.outline}`, fontSize: 15, outline: 'none', marginBottom: 8 }}
                />

                {errore && (
                    <div role="alert" style={{ color: '#930009', fontSize: 13, marginBottom: 8 }}>{errore}</div>
                )}

                <button
                    type="submit"
                    disabled={inCorso || password === ''}
                    style={{ width: '100%', marginTop: 8, padding: '12px 14px', borderRadius: 10, border: 'none', background: inCorso || password === '' ? C.surfaceHighest : C.primary, color: inCorso || password === '' ? C.onSurfaceVariant : '#fff', fontSize: 15, fontWeight: 700, cursor: inCorso || password === '' ? 'default' : 'pointer' }}
                >
                    {inCorso ? 'Accesso…' : 'Entra'}
                </button>
            </form>
        </div>
    )
}
