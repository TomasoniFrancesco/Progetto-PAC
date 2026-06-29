import React from 'react'

// Costanti e helper condivisi dai componenti dell'area Admin.
export const API = '/api'

export const PALETTE = [
    { hex: '#4A90D9', label: 'Blu' },
    { hex: '#5BA85E', label: 'Verde' },
    { hex: '#D45454', label: 'Rosso' },
    { hex: '#E8B84B', label: 'Giallo' },
    { hex: '#9370BE', label: 'Viola' },
    { hex: '#4A4E5A', label: 'Nero' },
]

export const COLORE_SETTORE = {
    'bar': '#4A90D9',
    'primi': '#E8B84B',
    'secondi': '#D45454',
    'contorni': '#5BA85E',
    'dolci': '#9370BE',
    'dolce': '#9370BE',
}

export function coloreDefaultPerSettore(settore) {
    return COLORE_SETTORE[String(settore || '').toLowerCase()] || '#4A90D9'
}

// Ordine fisso delle categorie
export const ORDINE_SETTORI = ['bar', 'primi', 'secondi', 'contorni', 'dolci', 'dolce']

// Palette colori UI condivisa
export const C = {
    primary: '#005147', primaryContainer: '#006b5e',
    surface: '#faf9fc', surfaceLow: '#f5f3f7', surfaceHigh: '#e9e7eb',
    surfaceHighest: '#e3e2e6', outline: '#bec9c5',
    onSurface: '#1b1b1e', onSurfaceVariant: '#3e4946',
    secondary: '#425e91', primaryFixed: '#9ff2e1', onPrimaryFixed: '#00201b',
}

// Icone SVG inline
export const Icona = {
    modifica: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>,
    elimina: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>,
    freccia: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>,
    occhio: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>,
    occhioOff: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>,
    link: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
    scorte: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.27 6.96 8.73 5.05 8.73-5.05"/><path d="M12 22.08V12.01"/></svg>,
}
