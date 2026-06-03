// Test unitari dello Smistatore Intelligente Multi-Reparto
// Port in formato Vitest dei test originali (tests/test-smistatore.js)
//
// Verifica:
//   - Formula del carico (n × t_prep × α × β)
//   - selectMinCarico (arg-min + tie-break)
//   - Routing greedy (1 task per riga, esplosione singola_singola, batching)
//   - Blocco scorte
//   - Ranking P (asporto, rischio scorte, carico)
//   - Bilanciamento end-to-end con fallback bidirezionale

import { describe, it, expect, beforeEach } from 'vitest'
import smistatore from '../src/services/smistatore.js'

// Costanti algoritmo (devono allinearsi con services/smistatore.js)
const PESI = { A: 1.0, B: 50.0, C: 10.0, D: 0.01, E: 30.0 }
const ALPHA_STRESS = 1.3
const BETA_OFFLINE = 2.0
const SOGLIA_STRESS = 5
const TEMPO_PREP_DEFAULT = 60

// ═══════════════════════════════════════════════════════════════════════════
// FORMULA DEL CARICO
// ═══════════════════════════════════════════════════════════════════════════
describe('Formula del carico', () => {
  beforeEach(() => smistatore.reset())

  it('reparto vuoto → carico 0', () => {
    const c = smistatore._carichi.caricoReparto('cucina')
    expect(c).toBe(0)
  })

  it('1 task tprep=60 → carico = 60', () => {
    smistatore.routeOrder({
      ordine_id: 1,
      righe: [{ voce_id: 100, nome: 'X', quantita: 1, settore_stampa: 'cucina', tempo_preparazione: 60, scorta_attiva: 0 }],
    })
    expect(smistatore._carichi.caricoReparto('cucina')).toBe(1 * 60 * 1.0 * 1.0)
  })

  it('5 task tprep=60 → α=1.3 ATTIVO → carico = 1950', () => {
    for (let i = 0; i < 5; i++) {
      smistatore.routeOrder({
        ordine_id: i + 1,
        righe: [{ voce_id: 100, nome: 'X', quantita: 1, settore_stampa: 'cucina', tempo_preparazione: 60, scorta_attiva: 0 }],
      })
    }
    const c = smistatore._carichi.caricoReparto('cucina')
    expect(c).toBe(5 * (5 * 60) * ALPHA_STRESS * 1.0)
  })

  it('4 task tprep=60 → α NON attivo → carico = 4·240 = 960', () => {
    for (let i = 0; i < 4; i++) {
      smistatore.routeOrder({
        ordine_id: i + 1,
        righe: [{ voce_id: 100, nome: 'X', quantita: 1, settore_stampa: 'cucina', tempo_preparazione: 60, scorta_attiva: 0 }],
      })
    }
    expect(smistatore._carichi.caricoReparto('cucina')).toBe(4 * 240 * 1.0 * 1.0)
  })

  it('stampante offline → β = 2.0', () => {
    smistatore.setStatoStampante('cucina', 'offline')
    smistatore.routeOrder({
      ordine_id: 1,
      righe: [{ voce_id: 100, nome: 'X', quantita: 1, settore_stampa: 'cucina', tempo_preparazione: 60, scorta_attiva: 0 }],
    })
    expect(smistatore._carichi.caricoReparto('cucina')).toBe(1 * 60 * 1.0 * BETA_OFFLINE)
    smistatore.setStatoStampante('cucina', 'online')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// selectMinCarico (arg-min + tie-break)
// ═══════════════════════════════════════════════════════════════════════════
describe('selectMinCarico (arg-min + tie-break)', () => {
  beforeEach(() => smistatore.reset())

  it('sceglie il reparto con carico minore', () => {
    for (let i = 0; i < 3; i++) {
      smistatore.routeOrder({
        ordine_id: i + 1,
        righe: [{ voce_id: 100, nome: 'X', quantita: 1, settore_stampa: 'cucina_a', tempo_preparazione: 60, scorta_attiva: 0 }],
      })
    }
    const scelto = smistatore._carichi.selectMinCarico(['cucina_a', 'cucina_b'])
    expect(scelto).toBe('cucina_b')
  })

  it('tie-break: a parità di carico, sceglie il reparto col last-task più vecchio', () => {
    smistatore.routeOrder({
      ordine_id: 1,
      righe: [{ voce_id: 100, nome: 'X', quantita: 1, settore_stampa: 'cucina_a', tempo_preparazione: 60, scorta_attiva: 0 }],
    })
    // Aspetta 5ms per avere timestamp diversi
    const dt = Date.now() + 5
    while (Date.now() < dt) { /* busy wait */ }
    smistatore.routeOrder({
      ordine_id: 2,
      righe: [{ voce_id: 200, nome: 'Y', quantita: 1, settore_stampa: 'cucina_b', tempo_preparazione: 60, scorta_attiva: 0 }],
    })
    // Entrambi hanno carico=60. cucina_a è "più vecchio" → vince
    const scelto = smistatore._carichi.selectMinCarico(['cucina_a', 'cucina_b'])
    expect(scelto).toBe('cucina_a')
  })

  it('tutti offline → ritorna comunque il primo candidato', () => {
    smistatore.setStatoStampante('x', 'offline')
    const scelto = smistatore._carichi.selectMinCarico(['x'])
    expect(scelto).toBe('x')
    smistatore.setStatoStampante('x', 'online')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ROUTING (routeOrder)
// ═══════════════════════════════════════════════════════════════════════════
describe('Routing (routeOrder)', () => {
  beforeEach(() => smistatore.reset())

  it('riga con scorta sufficiente → 1 task generato', () => {
    const r = smistatore.routeOrder({
      ordine_id: 1,
      righe: [{ voce_id: 1, nome: 'A', quantita: 1, settore_stampa: 'cucina', tempo_preparazione: 60,
                scorta_attiva: 1, scorta_quantita: 5 }],
    })
    expect(r.bloccati).toHaveLength(0)
    expect(r.comande).toHaveLength(1)
    expect(r.comande[0].righe[0].quantita).toBe(1)
  })

  it('riga con scorta INSUFFICIENTE → finisce in bloccati, NON in comande', () => {
    const r = smistatore.routeOrder({
      ordine_id: 1,
      righe: [
        { voce_id: 1, nome: 'A', quantita: 10, settore_stampa: 'bar', tempo_preparazione: 60, scorta_attiva: 1, scorta_quantita: 2 },
        { voce_id: 2, nome: 'B', quantita: 1, settore_stampa: 'bar', tempo_preparazione: 60, scorta_attiva: 0 },
      ],
    })
    expect(r.bloccati).toHaveLength(1)
    expect(r.bloccati[0].voce_id).toBe(1)
    expect(r.bloccati[0].richiesta).toBe(10)
    expect(r.bloccati[0].disponibile).toBe(2)
    // L'altra riga deve essere comunque generata
    expect(r.comande).toHaveLength(1)
    expect(r.comande[0].righe[0].voce_id).toBe(2)
  })

  it('quantita=3 + singola_multipla → 1 task con quantita=3', () => {
    const r = smistatore.routeOrder({
      ordine_id: 1,
      righe: [{ voce_id: 1, nome: 'A', quantita: 3, settore_stampa: 'cucina',
                modalita_stampa: 'singola_multipla', tempo_preparazione: 60, scorta_attiva: 0 }],
    })
    expect(r.comande).toHaveLength(1)
    expect(r.comande[0].righe[0].quantita).toBe(3)
    // 1 task in coda con tprep=60 → carico 60
    expect(smistatore._carichi.caricoReparto('cucina')).toBe(60)
  })

  it('quantita=3 + singola_singola → 3 task in coda, batchati in 1 comanda qta=3', () => {
    const r = smistatore.routeOrder({
      ordine_id: 1,
      righe: [{ voce_id: 1, nome: 'A', quantita: 3, settore_stampa: 'cucina',
                modalita_stampa: 'singola_singola', tempo_preparazione: 60, scorta_attiva: 0 }],
    })
    // 3 task in coda
    expect(smistatore._carichi.caricoReparto('cucina')).toBe(3 * (3 * 60) * 1.0 * 1.0)
    // batching: 1 sola riga di comanda con qta totale 3
    expect(r.comande).toHaveLength(1)
    expect(r.comande[0].righe).toHaveLength(1)
    expect(r.comande[0].righe[0].quantita).toBe(3)
  })

  it('batching: due voci diverse, stesso reparto → 1 comanda con 2 righe', () => {
    const r = smistatore.routeOrder({
      ordine_id: 1,
      righe: [
        { voce_id: 1, nome: 'A', quantita: 2, settore_stampa: 'cucina', tempo_preparazione: 60, scorta_attiva: 0 },
        { voce_id: 2, nome: 'B', quantita: 1, settore_stampa: 'cucina', tempo_preparazione: 60, scorta_attiva: 0 },
      ],
    })
    expect(r.comande).toHaveLength(1)
    expect(r.comande[0].reparto).toBe('cucina')
    expect(r.comande[0].righe).toHaveLength(2)
  })

  it('smista su più reparti e ordina le comande per priorità P decrescente', () => {
    const r = smistatore.routeOrder({
      ordine_id: 1,
      // Una per il bar (P alto per via di un ipotetico rischio scorte/asporto se lo settassimo, qui settiamo manuale)
      // ma il calcolo di P dà priorità a quello che ha rischio_scorte = 1
      asporto: false,
      righe: [
        { voce_id: 1, nome: 'Acqua', quantita: 1, settore_stampa: 'bar', tempo_preparazione: 10, scorta_attiva: 1, scorta_quantita: 1, soglia_rosso: 5 }, // Rischio alto -> P più basso (-E)
        { voce_id: 2, nome: 'Pizza', quantita: 1, settore_stampa: 'cucina', tempo_preparazione: 100, scorta_attiva: 0 } // No rischio
      ],
    })
    
    expect(r.comande).toHaveLength(2)
    // La comanda con la riga a P maggiore deve stare al primo posto
    const p0 = r.comande[0].righe[0].P
    const p1 = r.comande[1].righe[0].P
    expect(p0).toBeGreaterThanOrEqual(p1)
  })

  it('applica i fallback ai default quando mancano settore_stampa e tempo_preparazione', () => {
    // Righe 67 e 81: task.settore_stampa || 'default', riga.tempo_preparazione || TEMPO_PREP_DEFAULT
    const r = smistatore.routeOrder({
      ordine_id: 2,
      righe: [{ voce_id: 3, nome: 'Sconosciuto', quantita: 1, scorta_attiva: 0 }] // Manca settore e tempo
    })
    expect(r.comande[0].reparto).toBe('default')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// RANKING P
// ═══════════════════════════════════════════════════════════════════════════
describe('Ranking P', () => {
  beforeEach(() => smistatore.reset())

  it('asporto incrementa P di B=50 rispetto a non-asporto', () => {
    const a = smistatore.routeOrder({
      ordine_id: 1, asporto: true,
      righe: [{ voce_id: 1, nome: 'X', quantita: 1, settore_stampa: 'bar', tempo_preparazione: 60, scorta_attiva: 0 }],
    })
    smistatore.reset()
    const b = smistatore.routeOrder({
      ordine_id: 2, asporto: false,
      righe: [{ voce_id: 1, nome: 'X', quantita: 1, settore_stampa: 'bar', tempo_preparazione: 60, scorta_attiva: 0 }],
    })
    const Pa = a.comande[0].righe[0].P
    const Pb = b.comande[0].righe[0].P
    const delta = Pa - Pb
    expect(Math.abs(delta - PESI.B)).toBeLessThan(0.5)
  })

  it('rischio scorte (sotto soglia rosso) penalizza P di E=30', () => {
    const senza = smistatore.routeOrder({
      ordine_id: 1, asporto: false,
      righe: [{ voce_id: 1, nome: 'X', quantita: 1, settore_stampa: 'bar', tempo_preparazione: 60,
                scorta_attiva: 1, scorta_quantita: 100, soglia_rosso: 3 }],
    })
    smistatore.reset()
    const con = smistatore.routeOrder({
      ordine_id: 2, asporto: false,
      righe: [{ voce_id: 1, nome: 'X', quantita: 1, settore_stampa: 'bar', tempo_preparazione: 60,
                scorta_attiva: 1, scorta_quantita: 2, soglia_rosso: 3 }],
    })
    const delta = senza.comande[0].righe[0].P - con.comande[0].righe[0].P
    expect(Math.abs(delta - PESI.E)).toBeLessThan(0.5)
  })

  it('calcolaRanking applica default se tempo_preparazione è mancante o 0', () => {
    // Riga 60: task.tempo_preparazione || TEMPO_PREP_DEFAULT
    const P = smistatore._carichi.calcolaRanking({ timestamp: Date.now(), tempo_preparazione: 0 }, 'bar')
    expect(P).toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// BILANCIAMENTO END-TO-END CON FALLBACK BIDIREZIONALE
// ═══════════════════════════════════════════════════════════════════════════
describe('Bilanciamento end-to-end con fallback bidirezionale', () => {
  beforeEach(() => smistatore.reset())

  it('6 ordini cucina con fallback ↔ cucina_2 → distribuzione 3-3', () => {
    smistatore.setFallback('cucina', ['cucina_2'])
    smistatore.setFallback('cucina_2', ['cucina'])
    const counts = { cucina: 0, cucina_2: 0 }
    for (let i = 1; i <= 6; i++) {
      const r = smistatore.routeOrder({
        ordine_id: i,
        righe: [{ voce_id: 100, nome: 'P', quantita: 1, settore_stampa: 'cucina', tempo_preparazione: 60, scorta_attiva: 0 }],
      })
      counts[r.comande[0].reparto]++
    }
    expect(counts.cucina).toBe(3)
    expect(counts.cucina_2).toBe(3)
    // Carico finale identico
    expect(smistatore._carichi.caricoReparto('cucina'))
      .toBe(smistatore._carichi.caricoReparto('cucina_2'))
  })

  it('primario offline + fallback online → routing va al fallback', () => {
    smistatore.setStatoStampante('cucina', 'offline')
    smistatore.setFallback('cucina', ['cucina_2'])
    const r = smistatore.routeOrder({
      ordine_id: 1,
      righe: [{ voce_id: 1, nome: 'X', quantita: 1, settore_stampa: 'cucina', tempo_preparazione: 60, scorta_attiva: 0 }],
    })
    expect(r.comande[0].reparto).toBe('cucina_2')
    smistatore.setStatoStampante('cucina', 'online')
  })

  it('tutti offline → routing forzato sul primario', () => {
    smistatore.setStatoStampante('cucina', 'offline')
    smistatore.setStatoStampante('cucina_2', 'offline')
    smistatore.setFallback('cucina', ['cucina_2'])
    const r = smistatore.routeOrder({
      ordine_id: 1,
      righe: [{ voce_id: 1, nome: 'X', quantita: 1, settore_stampa: 'cucina', tempo_preparazione: 60, scorta_attiva: 0 }],
    })
    expect(r.comande[0].reparto).toBe('cucina')
    smistatore.setStatoStampante('cucina', 'online')
    smistatore.setStatoStampante('cucina_2', 'online')
  })

  it('imposta i fallback a [] se vengono passati parametri non array', () => {
    // Riga 197: Array.isArray
    smistatore.setFallback('cucina', null)
    const r = smistatore.routeOrder({
      ordine_id: 1,
      righe: [{ voce_id: 1, nome: 'X', quantita: 1, settore_stampa: 'cucina', scorta_attiva: 0 }],
    })
    expect(r.comande[0].reparto).toBe('cucina')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// completaTask
// ═══════════════════════════════════════════════════════════════════════════
describe('completaTask', () => {
  beforeEach(() => smistatore.reset())

  it('rimuove un task dalla coda del reparto', () => {
    smistatore.routeOrder({
      ordine_id: 1,
      righe: [{ voce_id: 10, nome: 'A', quantita: 1, settore_stampa: 'bar', tempo_preparazione: 60, scorta_attiva: 0 }],
    })
    expect(smistatore._carichi.caricoReparto('bar')).toBeGreaterThan(0)
    const rimosso = smistatore.completaTask('bar', 10, 1)
    expect(rimosso).toBe(true)
    expect(smistatore._carichi.caricoReparto('bar')).toBe(0)
  })

  it('ritorna false se il task non esiste', () => {
    const rimosso = smistatore.completaTask('bar', 999)
    expect(rimosso).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// snapshot
// ═══════════════════════════════════════════════════════════════════════════
describe('snapshot', () => {
  beforeEach(() => smistatore.reset())

  it('ritorna lo stato corrente delle code', () => {
    smistatore.routeOrder({
      ordine_id: 1,
      righe: [{ voce_id: 10, nome: 'A', quantita: 1, settore_stampa: 'bar', tempo_preparazione: 60, scorta_attiva: 0 }],
    })
    const snap = smistatore.snapshot()
    expect(snap.bar).toBeDefined()
    expect(snap.bar.numero_task).toBe(1)
    expect(snap.bar.stampante).toBe('online')
    expect(snap.bar.task).toHaveLength(1)
  })

  it('gestisce lo snapshot con stampante offline', () => {
    // Riga 206: stampanteOnline(reparto) ? 'online' : 'offline'
    smistatore.routeOrder({
      ordine_id: 2,
      righe: [{ voce_id: 11, nome: 'B', quantita: 1, settore_stampa: 'cucina', scorta_attiva: 0 }],
    })
    smistatore.setStatoStampante('cucina', 'offline')
    const snap = smistatore.snapshot()
    expect(snap.cucina.stampante).toBe('offline')
  })
})
