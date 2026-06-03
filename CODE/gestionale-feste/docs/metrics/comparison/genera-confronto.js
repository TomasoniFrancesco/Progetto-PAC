#!/usr/bin/env node
/*
 * Genera i grafici SVG di confronto PRIMA/DOPO il refactoring per le tre metriche:
 * complessità ciclomatica, accoppiamento, coesione (decomposizione).
 * Dati ricavati da ESLint (complexity), madge e analisi SLOC/LCOM (acorn).
 * Nessuna dipendenza esterna.
 */
const fs = require('fs');
const path = require('path');
const OUT = __dirname;

const C = { prima: '#D45454', dopo: '#5BA85E', grid: '#E2E5EA', text: '#2b2f36', sub: '#6b7280' };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Grafico a barre raggruppate orizzontali: per ogni item due barre (prima/dopo).
function groupedBars({ title, subtitle, items, vmax, unit = '', soglia = null }) {
    const W = 940, rowH = 46, padTop = 86, padBottom = 44, padLeft = 250, padRight = 70;
    const H = padTop + items.length * rowH + padBottom;
    const max = vmax || Math.max(...items.flatMap(i => [i.prima, i.dopo])) * 1.3;
    const plotW = W - padLeft - padRight;
    const x = v => padLeft + (v / max) * plotW;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="-apple-system,Segoe UI,Roboto,sans-serif">`;
    s += `<rect width="${W}" height="${H}" fill="#ffffff"/>`;
    s += `<text x="24" y="34" font-size="20" font-weight="700" fill="${C.text}">${esc(title)}</text>`;
    s += `<text x="24" y="56" font-size="13" fill="${C.sub}">${esc(subtitle)}</text>`;
    // legenda
    s += `<rect x="${padLeft}" y="64" width="13" height="13" rx="2" fill="${C.prima}"/><text x="${padLeft + 19}" y="75" font-size="12" fill="${C.text}">Prima</text>`;
    s += `<rect x="${padLeft + 80}" y="64" width="13" height="13" rx="2" fill="${C.dopo}"/><text x="${padLeft + 99}" y="75" font-size="12" fill="${C.text}">Dopo</text>`;
    // gridlines
    for (let i = 0; i <= 4; i++) {
        const v = (max / 4) * i, gx = x(v);
        s += `<line x1="${gx}" y1="${padTop - 6}" x2="${gx}" y2="${H - padBottom + 4}" stroke="${C.grid}"/>`;
        s += `<text x="${gx}" y="${H - padBottom + 20}" font-size="10" fill="${C.sub}" text-anchor="middle">${Math.round(v)}</text>`;
    }
    if (soglia != null && soglia <= max) {
        const tx = x(soglia);
        s += `<line x1="${tx}" y1="${padTop - 6}" x2="${tx}" y2="${H - padBottom + 4}" stroke="#E8B84B" stroke-dasharray="5 4" stroke-width="1.5"/>`;
        s += `<text x="${tx + 4}" y="${padTop - 10}" font-size="10" fill="#9a7b1f">soglia ${soglia}</text>`;
    }
    const bh = 14;
    items.forEach((it, i) => {
        const y = padTop + i * rowH;
        s += `<text x="${padLeft - 10}" y="${y + 22}" font-size="12.5" fill="${C.text}" text-anchor="end">${esc(it.label)}</text>`;
        // prima
        const w1 = Math.max(2, x(it.prima) - padLeft);
        s += `<rect x="${padLeft}" y="${y + 3}" width="${w1}" height="${bh}" rx="2" fill="${C.prima}"/>`;
        s += `<text x="${padLeft + w1 + 6}" y="${y + 14}" font-size="11" font-weight="700" fill="${C.prima}">${it.prima}${unit}</text>`;
        // dopo
        const w2 = Math.max(2, x(it.dopo) - padLeft);
        s += `<rect x="${padLeft}" y="${y + 3 + bh + 4}" width="${w2}" height="${bh}" rx="2" fill="${C.dopo}"/>`;
        s += `<text x="${padLeft + w2 + 6}" y="${y + 14 + bh + 4}" font-size="11" font-weight="700" fill="${C.dopo}">${it.dopo}${unit}</text>`;
    });
    s += `</svg>`;
    return s;
}

// 1) Complessità — funzioni "God" target, CC prima→dopo
const svg1 = groupedBars({
    title: 'Complessità ciclomatica — funzioni più critiche (prima → dopo)',
    subtitle: 'Funzioni con CC > 15: 11 → 5  ·  CC massimo: 55 → 37  ·  soglia di rischio = 15',
    soglia: 15,
    items: [
        { label: 'Cassa (componente)', prima: 55, dopo: 7 },
        { label: 'parsaFlusso (ESC/POS)', prima: 51, dopo: 11 },
        { label: 'eseguiPredizione', prima: 21, dopo: 2 },
        { label: 'conferma ordine (handler)', prima: 20, dopo: 10 },
        { label: 'salva aggregata (Admin)', prima: 19, dopo: 10 },
        { label: 'handler POST menu', prima: 17, dopo: 7 },
    ],
});

// 2) Accoppiamento — madge
const svg2 = groupedBars({
    title: 'Accoppiamento (prima → dopo)',
    subtitle: 'Dipendenze circolari: 0 → 0 (nessun ciclo introdotto)',
    items: [
        { label: 'Ca(db.js) — moduli che usano il DB', prima: 10, dopo: 2 },
        { label: 'fan-out routes/stampe.js', prima: 4, dopo: 2 },
    ],
});

// 3) Coesione — decomposizione (SLOC dei God File + dimensione max modulo)
const svg3 = groupedBars({
    title: 'Coesione — dimensione dei moduli (prima → dopo)',
    subtitle: 'Moduli totali: 19 → 50 (responsabilità singola per file)  ·  SLOC = righe di codice',
    unit: '',
    items: [
        { label: 'Admin.jsx', prima: 1328, dopo: 150 },
        { label: 'Cassa.jsx', prima: 669, dopo: 227 },
        { label: 'Modulo più grande (SLOC max)', prima: 1328, dopo: 331 },
    ],
});

fs.writeFileSync(path.join(OUT, '01-complessita.svg'), svg1);
fs.writeFileSync(path.join(OUT, '02-accoppiamento.svg'), svg2);
fs.writeFileSync(path.join(OUT, '03-coesione.svg'), svg3);

const html = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<title>Refactoring — confronto metriche Prima/Dopo</title>
<style>
 body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f6f9;color:#2b2f36;margin:0;padding:32px}
 h1{font-size:26px;margin:0 0 4px}.sub{color:#6b7280;margin:0 0 24px}
 .chart{background:#fff;border-radius:10px;padding:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:22px;overflow-x:auto}
 .note{background:#fff7e6;border-left:4px solid #E8B84B;padding:12px 16px;border-radius:6px;font-size:14px;line-height:1.5;margin-bottom:22px}
 code{background:#eef1f5;padding:1px 5px;border-radius:4px}
</style></head><body>
<h1>Refactoring — confronto metriche Prima / Dopo</h1>
<p class="sub">Fonte: ESLint (complexity), madge, analisi SLOC/AST · ${new Date().toISOString().slice(0,10)}</p>
<div class="note"><b>Nota su LCOM.</b> La metrica classica LCOM (coesione di classe) non è significativa per questo
codice funzionale/React: misurata risulta piatta (media 1,45 → 1,45) e penalizza persino i repository ben fattorizzati.
La coesione è quindi rappresentata dalla <b>decomposizione dei moduli</b> (responsabilità singola, dimensione dei file).</div>
<div class="chart"><img src="01-complessita.svg" alt="Complessità prima/dopo"></div>
<div class="chart"><img src="02-accoppiamento.svg" alt="Accoppiamento prima/dopo"></div>
<div class="chart"><img src="03-coesione.svg" alt="Coesione prima/dopo"></div>
</body></html>`;
fs.writeFileSync(path.join(OUT, 'dashboard.html'), html);

console.log('Generati: 01-complessita.svg, 02-accoppiamento.svg, 03-coesione.svg, dashboard.html');
