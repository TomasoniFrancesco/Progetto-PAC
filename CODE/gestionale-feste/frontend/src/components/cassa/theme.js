// Tema e helper condivisi dalla pagina Cassa e dai suoi componenti (modali, griglia).

export const C = {
    primary: '#005147',
    primaryContainer: '#006b5e',
    surface: '#faf9fc',
    surfaceLow: '#f5f3f7',
    surfaceContainer: '#efedf1',
    surfaceHigh: '#e9e7eb',
    surfaceHighest: '#e3e2e6',
    surfaceLowest: '#ffffff',
    onSurface: '#1b1b1e',
    onSurfaceVariant: '#3e4946',
    secondary: '#425e91',
    secondaryContainer: '#a8c4fd',
    onSecondaryContainer: '#345082',
    outline: '#bec9c5',
    tertiary: '#930009',
    primaryFixed: '#9ff2e1',
    onPrimaryFixed: '#00201b',
}

export const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(4px)' }
export const modaleStyle = { background: C.surface, borderRadius: 16, padding: 28, minWidth: 380, maxWidth: 500, maxHeight: '80vh', overflowY: 'auto', color: C.onSurface, boxShadow: '0 24px 64px rgba(0,0,0,0.14)' }

// Stato visivo (colore + etichetta + disabilitato) di una voce in base alla scorta.
export function statusInfo(voce, scorteMap) {
    const s = scorteMap[voce.id]
    if (!s || !s.attiva) return { color: '#22c55e', label: '∞', disabled: false }
    if (s.quantita === 0) return { color: '#a1a1aa', label: '0', disabled: true }
    if (s.stato_visivo === 'critico') return { color: '#ef4444', label: String(s.quantita), disabled: false }
    if (s.stato_visivo === 'attenzione') return { color: '#eab308', label: String(s.quantita), disabled: false }
    return { color: '#22c55e', label: String(s.quantita), disabled: false }
}

// Colore testo (chiaro/scuro) leggibile su uno sfondo dato.
export function getTextColorForBackground(hexColor) {
    if (!hexColor) return C.onSurface
    const hex = hexColor.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    const luminosita = (r * 299 + g * 587 + b * 114) / 1000
    return luminosita > 165 ? '#1b1b1e' : '#ffffff'
}
