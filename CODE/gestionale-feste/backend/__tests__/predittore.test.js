// Test unitari del Predittore Dinamico di Riordino Scorte (UC5b)
// Port in formato Vitest dei test originali (tests/test-predittore.js)
//
// Verifica le funzioni pure dell'algoritmo predittivo:
//   - calcolaPesi (selezione modalità: normale / picco / prudente)
//   - consumoAtteso (media pesata multi-finestra)
//   - tempoEsaurimentoSec
//   - calcolaU (indice di urgenza)
//   - classifica (4 stati: stabile / attenzione / urgente / esaurito)
//   - quantitaSuggerita
//   - aggregaConsumiCondivisi
//   - tempoResiduoEventoSec
//   - derivaStatoVisivo

import { describe, it, expect } from 'vitest'
import predittore from '../src/services/predittore.js'

const { _interno } = predittore

// ═══════════════════════════════════════════════════════════════════════════
// calcolaPesi: selezione modalità
// ═══════════════════════════════════════════════════════════════════════════
describe('calcolaPesi: selezione modalità', () => {
  it('storico sufficiente + consumo normale → modalità "normale" (α=0.5)', () => {
    const p = _interno.calcolaPesi({ consumo15Min: 5, mediaStoricaUnitaOra: 30, occorrenzeStoriche: 10 })
    expect(p.modalita).toBe('normale')
    expect(p.alpha).toBe(0.5)
    expect(p.beta).toBe(0.3)
    expect(p.gamma).toBe(0.2)
  })

  it('storico sufficiente + consumo a picco (>2× storico) → modalità "picco" (α=0.8)', () => {
    const p = _interno.calcolaPesi({ consumo15Min: 30, mediaStoricaUnitaOra: 30, occorrenzeStoriche: 10 })
    expect(p.modalita).toBe('picco')
    expect(p.alpha).toBe(0.8)
    expect(p.beta).toBe(0.15)
    expect(p.gamma).toBe(0.05)
  })

  it('occorrenze storiche < 3 → modalità "prudente" (γ=0)', () => {
    const p = _interno.calcolaPesi({ consumo15Min: 10, mediaStoricaUnitaOra: 20, occorrenzeStoriche: 2 })
    expect(p.modalita).toBe('prudente')
    expect(p.gamma).toBe(0)
    // I pesi devono comunque sommare ≈ 1
    const somma = p.alpha + p.beta + p.gamma
    expect(Math.abs(somma - 1.0)).toBeLessThan(0.01)
  })

  it('storico = 0 → niente picco anche con consumo alto (no divisione su 0)', () => {
    const p = _interno.calcolaPesi({ consumo15Min: 100, mediaStoricaUnitaOra: 0, occorrenzeStoriche: 5 })
    expect(p.modalita).toBe('normale')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// consumoAtteso: applica formula
// ═══════════════════════════════════════════════════════════════════════════
describe('consumoAtteso: applica formula', () => {
  it('α·c15/15 + β·c1h/60 + γ·storico/60', () => {
    const pesi = { alpha: 0.5, beta: 0.3, gamma: 0.2 }
    // c15=15 → tasso=1.0; c1h=60 → tasso=1.0; storico=60 → tasso=1.0
    // atteso = 0.5*1 + 0.3*1 + 0.2*1 = 1.0
    const c = _interno.consumoAtteso(pesi, 15, 60, 60)
    expect(Math.abs(c - 1.0)).toBeLessThan(0.001)
  })

  it('zero consumo ovunque → 0', () => {
    const c = _interno.consumoAtteso({ alpha: 0.5, beta: 0.3, gamma: 0.2 }, 0, 0, 0)
    expect(c).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// tempoEsaurimentoSec
// ═══════════════════════════════════════════════════════════════════════════
describe('tempoEsaurimentoSec', () => {
  it('quantita=10 + consumo=1 unità/min → 600 secondi', () => {
    const t = _interno.tempoEsaurimentoSec(10, 1)
    expect(t).toBe(600)
  })

  it('consumo ≤ 0 → Infinity', () => {
    expect(_interno.tempoEsaurimentoSec(10, 0)).toBe(Infinity)
    expect(_interno.tempoEsaurimentoSec(10, -1)).toBe(Infinity)
  })

  it('quantita=0 → 0 secondi', () => {
    expect(_interno.tempoEsaurimentoSec(0, 1)).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// calcolaU: indice di urgenza
// ═══════════════════════════════════════════════════════════════════════════
describe('calcolaU: indice di urgenza', () => {
  it('tempo_esaur > tempo_riapp → U = 0 (nessuna urgenza)', () => {
    const U = _interno.calcolaU({ tempoRiappSec: 600, tempoEsaurSec: 1800, priorita: 'media', tempoResiduoEventoSec: 10000 })
    expect(U).toBe(0)
  })

  it('tempo_esaur < tempo_riapp con priorità media → U = (riapp - esaur) × 1.0 × 1.2', () => {
    // riapp=600, esaur=300 → base = 300
    // esaur (300) < tempoResiduoEvento (10000) → moltiplicatore contesto attivo (1.2)
    const U = _interno.calcolaU({ tempoRiappSec: 600, tempoEsaurSec: 300, priorita: 'media', tempoResiduoEventoSec: 10000 })
    expect(U).toBe(300 * 1.0 * 1.2)
  })

  it('priorità alta moltiplica U per 1.5', () => {
    const U = _interno.calcolaU({ tempoRiappSec: 600, tempoEsaurSec: 300, priorita: 'alta', tempoResiduoEventoSec: 10000 })
    // 300 * 1.5 * 1.2 = 540
    expect(U).toBe(540)
  })

  it('priorità bassa moltiplica U per 0.5', () => {
    const U = _interno.calcolaU({ tempoRiappSec: 600, tempoEsaurSec: 300, priorita: 'bassa', tempoResiduoEventoSec: 10000 })
    expect(U).toBe(300 * 0.5 * 1.2)
  })

  it('moltiplicatore contesto NON attivo se esaur > residuo evento', () => {
    // riapp=10000, esaur=5000 → base = 5000 × 1.0 = 5000 senza contesto (esaur > residuo)
    const U = _interno.calcolaU({ tempoRiappSec: 10000, tempoEsaurSec: 5000, priorita: 'media', tempoResiduoEventoSec: 1000 })
    expect(U).toBe(5000)  // niente × 1.2
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// classifica: 4 stati
// ═══════════════════════════════════════════════════════════════════════════
describe('classifica: 4 stati', () => {
  it('quantita = 0 → "esaurito"', () => {
    const s = _interno.classifica({ quantita: 0, U: 100, statoScorta: 'disponibile', sogliaWarn: 300 })
    expect(s).toBe('esaurito')
  })

  it('U = 0 + scorta disponibile → "stabile"', () => {
    const s = _interno.classifica({ quantita: 50, U: 0, statoScorta: 'disponibile', sogliaWarn: 300 })
    expect(s).toBe('stabile')
  })

  it('U > 0 ma ≤ soglia_warn → "attenzione"', () => {
    const s = _interno.classifica({ quantita: 10, U: 150, statoScorta: 'attenzione', sogliaWarn: 300 })
    expect(s).toBe('attenzione')
  })

  it('U > soglia_warn → "urgente"', () => {
    const s = _interno.classifica({ quantita: 5, U: 500, statoScorta: 'critico', sogliaWarn: 300 })
    expect(s).toBe('urgente')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// quantitaSuggerita: formula ceil(consumo · t_riapp · 1.3)
// ═══════════════════════════════════════════════════════════════════════════
describe('quantitaSuggerita', () => {
  it('consumo=0.5 unità/min, t_riapp=600s (10min) → ceil(0.5 × 10 × 1.3) = 7', () => {
    const q = _interno.quantitaSuggerita(0.5, 600)
    expect(q).toBe(7)
  })

  it('consumo=2 unità/min, t_riapp=900s (15min) → ceil(2 × 15 × 1.3) = 39', () => {
    const q = _interno.quantitaSuggerita(2, 900)
    expect(q).toBe(39)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// aggregaConsumiCondivisi: ingredienti comuni
// ═══════════════════════════════════════════════════════════════════════════
describe('aggregaConsumiCondivisi', () => {
  it('voci [1,2] condivise → entrambe vedono la somma dei consumi', () => {
    const consumi = new Map([[1, 5], [2, 3], [3, 10]])
    const gruppi = [[1, 2]]
    const r = _interno.aggregaConsumiCondivisi(consumi, gruppi)
    expect(r.get(1)).toBe(8)  // 5 + 3
    expect(r.get(2)).toBe(8)
    expect(r.get(3)).toBe(10) // non condivisa
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// tempoResiduoEventoSec
// ═══════════════════════════════════════════════════════════════════════════
describe('tempoResiduoEventoSec', () => {
  it('orario futuro nello stesso giorno → secondi positivi', () => {
    const adesso = new Date('2026-05-17T20:00:00')
    const sec = _interno.tempoResiduoEventoSec('23:30', adesso)
    expect(sec).toBe(3.5 * 3600)  // 3h30m = 12600s
  })

  it('orario passato → 0', () => {
    const adesso = new Date('2026-05-17T23:45:00')
    const sec = _interno.tempoResiduoEventoSec('23:30', adesso)
    expect(sec).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// derivaStatoVisivo
// ═══════════════════════════════════════════════════════════════════════════
describe('derivaStatoVisivo', () => {
  it('scorta non attiva → "sconosciuto"', () => {
    expect(_interno.derivaStatoVisivo({ attiva: false, quantita: 10 })).toBe('sconosciuto')
  })

  it('quantita = 0 → "esaurito"', () => {
    expect(_interno.derivaStatoVisivo({ attiva: true, quantita: 0 })).toBe('esaurito')
  })

  it('quantita ≤ soglia_rosso → "critico"', () => {
    expect(_interno.derivaStatoVisivo({ attiva: true, quantita: 2, soglia_rosso: 3, soglia_giallo: 10 })).toBe('critico')
  })

  it('quantita ≤ soglia_giallo → "attenzione"', () => {
    expect(_interno.derivaStatoVisivo({ attiva: true, quantita: 5, soglia_rosso: 2, soglia_giallo: 10 })).toBe('attenzione')
  })

  it('quantita sopra tutte le soglie → "disponibile"', () => {
    expect(_interno.derivaStatoVisivo({ attiva: true, quantita: 50, soglia_rosso: 2, soglia_giallo: 10 })).toBe('disponibile')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// valutaVoce (test di integrazione della pipeline completa)
// ═══════════════════════════════════════════════════════════════════════════
describe('valutaVoce: pipeline completa', () => {
  it('voce senza consumo → stabile con tempo_esaurimento null', () => {
    const voce = {
      id: 1, codice: 'A01', nome: 'Acqua', settore_stampa: 'bar',
      priorita_voce: 'media', quantita: 50, attiva: true,
      soglia_rosso: 2, soglia_giallo: 10, tempo_riapprovvigionamento: 600,
    }
    const contesto = {
      c15Agg: new Map(), c1hAgg: new Map(),
      storico: new Map(),
      config: { soglia_warn_urgenza: 300 },
      tRes: 10000,
    }
    const r = _interno.valutaVoce(voce, contesto)
    expect(r.stato).toBe('stabile')
    expect(r.tempo_esaurimento_sec).toBeNull()
    expect(r.U).toBe(0)
    expect(r.suggerimento).toBeNull()
  })

  it('voce con quantita=0 → esaurito', () => {
    const voce = {
      id: 2, codice: 'B01', nome: 'Birra', settore_stampa: 'bar',
      priorita_voce: 'media', quantita: 0, attiva: true,
      soglia_rosso: 2, soglia_giallo: 10, tempo_riapprovvigionamento: 600,
    }
    const contesto = {
      c15Agg: new Map([[2, 5]]), c1hAgg: new Map([[2, 20]]),
      storico: new Map([[2, { media_unita_ora: 30, occorrenze: 10 }]]),
      config: { soglia_warn_urgenza: 300 },
      tRes: 10000,
    }
    const r = _interno.valutaVoce(voce, contesto)
    expect(r.stato).toBe('esaurito')
  })
})
