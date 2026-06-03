#!/usr/bin/env node
/*
 * Genera grafici SVG completi (tutta la codebase) dai dati grezzi dei tool:
 *  - eslint-complexity.json  -> complessità ciclomatica per file/funzione
 *  - coupling-backend.json   -> fan-in / fan-out (madge)
 * Nessuna dipendenza esterna. Output: ./*.svg + dashboard.html
 */
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '..');           // docs/metrics/pre-refactoring
const ROOT = path.resolve(__dirname, '../../../..');  // project root
const OUT = __dirname;

const esl = JSON.parse(fs.readFileSync(path.join(DIR, 'eslint-complexity.json'), 'utf8'));
const coup = JSON.parse(fs.readFileSync(path.join(DIR, 'coupling-backend.json'), 'utf8'));

// ---- 1. Aggrega complessità per file --------------------------------------
const files = [];
for (const f of esl) {
  const file = f.filePath.replace(ROOT + '/', '');
  let sum = 0, max = 0, cnt = 0;
  for (const m of f.messages) {
    const mm = /complexity of (\d+)/.exec(m.message);
    if (!mm) continue;
    const c = +mm[1]; sum += c; cnt++; if (c > max) max = c;
  }
  if (cnt === 0 && sum === 0 && !/\.jsx?$/.test(file)) continue;
  files.push({ file, sum, max, cnt, area: file.startsWith('frontend') ? 'frontend' : 'backend' });
}
files.sort((a, b) => b.sum - a.sum);

// ---- 2. Coupling backend (fan-in / fan-out) -------------------------------
const fanOut = {}, fanIn = {};
Object.keys(coup).forEach(f => { fanOut[f] = coup[f].length; fanIn[f] = fanIn[f] || 0; });
Object.keys(coup).forEach(f => coup[f].forEach(d => { fanIn[d] = (fanIn[d] || 0) + 1; }));
const coupRows = Object.keys(coup)
  .map(f => ({ file: f, ce: fanOut[f], ca: fanIn[f] || 0 }))
  .sort((a, b) => (b.ca + b.ce) - (a.ca + a.ce));

// ---- helpers SVG ----------------------------------------------------------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const C = {
  backend: '#4A90D9', frontend: '#9370BE',
  warn: '#E8B84B', danger: '#D45454', ok: '#5BA85E',
  ce: '#D45454', ca: '#4A90D9', grid: '#E2E5EA', text: '#2b2f36', sub: '#6b7280',
};

function hbar({ title, subtitle, rows, value, label, colorFor, threshold, vmaxPad = 1.18 }) {
  const W = 940, rowH = 26, padTop = 78, padBottom = 36, padLeft = 290, padRight = 80;
  const H = padTop + rows.length * rowH + padBottom;
  const vmax = Math.max(...rows.map(value)) * vmaxPad || 1;
  const plotW = W - padLeft - padRight;
  const x = v => padLeft + (v / vmax) * plotW;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="-apple-system,Segoe UI,Roboto,sans-serif">`;
  s += `<rect width="${W}" height="${H}" fill="#ffffff"/>`;
  s += `<text x="24" y="34" font-size="20" font-weight="700" fill="${C.text}">${esc(title)}</text>`;
  s += `<text x="24" y="56" font-size="13" fill="${C.sub}">${esc(subtitle)}</text>`;
  // gridlines
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const v = (vmax / ticks) * i, gx = x(v);
    s += `<line x1="${gx}" y1="${padTop - 10}" x2="${gx}" y2="${H - padBottom + 4}" stroke="${C.grid}"/>`;
    s += `<text x="${gx}" y="${H - padBottom + 20}" font-size="10" fill="${C.sub}" text-anchor="middle">${Math.round(v)}</text>`;
  }
  if (threshold != null && threshold <= vmax) {
    const tx = x(threshold);
    s += `<line x1="${tx}" y1="${padTop - 10}" x2="${tx}" y2="${H - padBottom + 4}" stroke="${C.danger}" stroke-dasharray="5 4" stroke-width="1.5"/>`;
    s += `<text x="${tx + 4}" y="${padTop - 14}" font-size="10" fill="${C.danger}">soglia ${threshold}</text>`;
  }
  rows.forEach((r, i) => {
    const y = padTop + i * rowH;
    const v = value(r), bw = Math.max(2, x(v) - padLeft);
    s += `<text x="${padLeft - 10}" y="${y + 17}" font-size="11.5" fill="${C.text}" text-anchor="end">${esc(label(r))}</text>`;
    s += `<rect x="${padLeft}" y="${y + 5}" width="${bw}" height="${rowH - 12}" rx="2" fill="${colorFor(r)}"/>`;
    s += `<text x="${padLeft + bw + 6}" y="${y + 17}" font-size="11" font-weight="600" fill="${C.text}">${v}</text>`;
  });
  s += `</svg>`;
  return s;
}

// ---- Grafico 1: complessità totale per file (TUTTA la codebase) -----------
const svg1 = hbar({
  title: 'Complessità ciclomatica totale per file — intera codebase',
  subtitle: `19 file (backend + frontend) · fonte: eslint-complexity.json · ${new Date().toISOString().slice(0,10)}`,
  rows: files,
  value: r => r.sum,
  label: r => r.file,
  colorFor: r => r.area === 'frontend' ? C.frontend : C.backend,
});

// ---- Grafico 2: funzione più complessa per file ---------------------------
const filesByMax = [...files].sort((a, b) => b.max - a.max).filter(r => r.max > 0);
const svg2 = hbar({
  title: 'Funzione più complessa per file (CC max) — God Functions',
  subtitle: 'CC della singola funzione peggiore · rosso = oltre soglia 15 · fonte: ESLint',
  rows: filesByMax,
  value: r => r.max,
  label: r => r.file,
  colorFor: r => r.max >= 25 ? C.danger : r.max >= 15 ? C.warn : C.ok,
  threshold: 15,
});

// ---- Grafico 3: coupling backend (fan-in vs fan-out) ----------------------
function couplingSvg(rows) {
  const W = 920, rowH = 30, padTop = 78, padBottom = 50, padLeft = 250, padRight = 40;
  const H = padTop + rows.length * rowH + padBottom;
  const vmax = Math.max(...rows.map(r => Math.max(r.ca, r.ce))) * 1.1 || 1;
  const plotW = W - padLeft - padRight;
  const x = v => (v / vmax) * plotW;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="-apple-system,Segoe UI,Roboto,sans-serif">`;
  s += `<rect width="${W}" height="${H}" fill="#ffffff"/>`;
  s += `<text x="24" y="34" font-size="20" font-weight="700" fill="${C.text}">Accoppiamento moduli backend — fan-in vs fan-out</text>`;
  s += `<text x="24" y="56" font-size="13" fill="${C.sub}">fonte: coupling-backend.json (madge) · Ca alto = modulo molto dipeso (rigido)</text>`;
  // legend
  s += `<rect x="${padLeft}" y="${padTop-22}" width="12" height="12" fill="${C.ca}"/><text x="${padLeft+18}" y="${padTop-12}" font-size="11" fill="${C.text}">Ca (fan-in)</text>`;
  s += `<rect x="${padLeft+110}" y="${padTop-22}" width="12" height="12" fill="${C.ce}"/><text x="${padLeft+128}" y="${padTop-12}" font-size="11" fill="${C.text}">Ce (fan-out)</text>`;
  rows.forEach((r, i) => {
    const y = padTop + i * rowH;
    s += `<text x="${padLeft - 10}" y="${y + 19}" font-size="11.5" fill="${C.text}" text-anchor="end">${esc(r.file)}</text>`;
    const caw = Math.max(1, x(r.ca)), cew = Math.max(1, x(r.ce));
    s += `<rect x="${padLeft}" y="${y + 3}" width="${caw}" height="9" rx="2" fill="${C.ca}"/>`;
    s += `<text x="${padLeft + caw + 5}" y="${y + 11}" font-size="9.5" fill="${C.sub}">${r.ca}</text>`;
    s += `<rect x="${padLeft}" y="${y + 14}" width="${cew}" height="9" rx="2" fill="${C.ce}"/>`;
    s += `<text x="${padLeft + cew + 5}" y="${y + 22}" font-size="9.5" fill="${C.sub}">${r.ce}</text>`;
  });
  s += `</svg>`;
  return s;
}
const svg3 = couplingSvg(coupRows);

fs.writeFileSync(path.join(OUT, '01-complessita-per-file.svg'), svg1);
fs.writeFileSync(path.join(OUT, '02-funzioni-piu-complesse.svg'), svg2);
fs.writeFileSync(path.join(OUT, '03-coupling-backend.svg'), svg3);

// ---- dashboard HTML che le raggruppa --------------------------------------
const totBackend = files.filter(f => f.area === 'backend').reduce((a, f) => a + f.sum, 0);
const totFrontend = files.filter(f => f.area === 'frontend').reduce((a, f) => a + f.sum, 0);
const html = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<title>Metriche Pre-Refactoring — Codebase completa</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f6f9;color:#2b2f36;margin:0;padding:32px}
  h1{font-size:26px;margin:0 0 4px} .sub{color:#6b7280;margin:0 0 24px}
  .cards{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:28px}
  .card{background:#fff;border-radius:10px;padding:16px 20px;box-shadow:0 1px 3px rgba(0,0,0,.08);min-width:160px}
  .card .n{font-size:28px;font-weight:700} .card .l{color:#6b7280;font-size:13px}
  .chart{background:#fff;border-radius:10px;padding:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:24px;overflow-x:auto}
  .note{background:#fff7e6;border-left:4px solid #E8B84B;padding:12px 16px;border-radius:6px;font-size:14px;line-height:1.5}
  code{background:#eef1f5;padding:1px 5px;border-radius:4px}
</style></head><body>
<h1>Metriche Pre-Refactoring — Codebase completa</h1>
<p class="sub">Tutti i 19 file di <code>backend/src</code> + <code>frontend/src</code> · generato il ${new Date().toISOString().slice(0,10)} · fonte: ESLint (complexity) + madge</p>
<div class="cards">
  <div class="card"><div class="n">${files.length}</div><div class="l">file analizzati</div></div>
  <div class="card"><div class="n" style="color:${C.backend}">${totBackend}</div><div class="l">CC totale backend</div></div>
  <div class="card"><div class="n" style="color:${C.frontend}">${totFrontend}</div><div class="l">CC totale frontend</div></div>
  <div class="card"><div class="n" style="color:${C.danger}">55</div><div class="l">CC max (Cassa)</div></div>
  <div class="card"><div class="n" style="color:${C.ok}">0</div><div class="l">dipendenze circolari</div></div>
</div>
<div class="note"><b>Perché questi grafici e non quelli di Plato?</b> Il parser di Plato non legge JSX né sintassi moderna, quindi saltava i file più critici (tutte le pagine React, <code>index.js</code>, ecc.). Questi grafici usano ESLint, che analizza l'intera codebase senza buchi.</div>
<div class="chart"><img src="01-complessita-per-file.svg" alt="Complessità per file"></div>
<div class="chart"><img src="02-funzioni-piu-complesse.svg" alt="Funzioni più complesse"></div>
<div class="chart"><img src="03-coupling-backend.svg" alt="Coupling backend"></div>
</body></html>`;
fs.writeFileSync(path.join(OUT, 'dashboard.html'), html);

console.log('Generati:');
['01-complessita-per-file.svg','02-funzioni-piu-complesse.svg','03-coupling-backend.svg','dashboard.html']
  .forEach(f => console.log('  charts/' + f));
console.log(`\nFile: ${files.length} | CC backend: ${totBackend} | CC frontend: ${totFrontend}`);
