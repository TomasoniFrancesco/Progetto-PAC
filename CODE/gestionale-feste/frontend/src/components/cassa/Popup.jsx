import React from 'react'

// Popup di notifica in basso a destra (success / error). Non renderizza nulla
// se `popup` è null.
export default function Popup({ popup }) {
    if (!popup) return null
    return (
        <>
            <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 300 }}>
                <div style={{
                    background: popup.tipo === 'success' ? '#10b981' : '#ef4444',
                    color: 'white',
                    padding: '16px 24px',
                    borderRadius: 12,
                    boxShadow: '0 12px 32px rgba(0,0,0,0.2)',
                    fontSize: 14,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    animation: 'slideIn 0.3s ease-out'
                }}>
                    <span style={{ fontSize: 18 }}>
                        {popup.tipo === 'success' ? '✓' : '✗'}
                    </span>
                    {popup.messaggio}
                </div>
            </div>
            <style>{`
                @keyframes slideIn {
                    from { transform: translateX(400px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `}</style>
        </>
    )
}
