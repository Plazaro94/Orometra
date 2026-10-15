// Prueba de la radiografía (bench/PREREGISTRO-MONTECARLO.md, enmienda 6 c).
//
//   node bench/radiografia.js [--cases 1000] [--sims 500] [--first 2000001] [--out RADIO-1]
//
// Con días intercambiables, el percentil del drawdown real entre las permutaciones de días es
// exactamente uniforme. Se comprueba en los procesos sin rachas ni volatilidad agrupada, después
// de las mismas puertas que la previsión (rachas, volatilidad) y con al menos 30 operaciones.
// Reglas: las de la enmienda 4 aplicadas a ese percentil: por celda, cada décimo entre 7 % y 13 %;
// por grupo (proceso, sumando sus celdas), entre 8,5 % y 11,5 %; suspende solo lo que se sale de
// la banda y es significativo con Holm-Bonferroni al 5 % sobre todas las pruebas. G3a y G4 se
// informan: muestran qué pasa con lo que las puertas dejan pasar.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRng } from '../core/rng.js';
import { robustPortmanteau, volatilityClustering, chi2Cdf } from '../core/trades/montecarlo.js';
import { orderRadiography, MIN_TRADES } from '../core/trades/radiography.js';
import { genDays } from './montecarlo.js';
import { hashSeed } from './sim.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REQUIRED = ['G1', 'G2', 'G5', 'G5b', 'G6', 'G6b', 'G11', 'G12'];
const INFORMED = ['G3a', 'G4'];
const NS = [126, 252, 504, 1008];

function runCell({ g, mu, n, cases, sims, first }) {
  const dec = new Array(10).fill(0);
  let refused = 0; let fewTrades = 0;
  for (let c = 0; c < cases; c++) {
    const key = `radio|${g}|${mu}|${n}|${first + c}`;
    const days = genDays(g, mu, n, makeRng(hashSeed(key)));
    const totals = days.map((d) => d.reduce((s, v) => s + v, 0));
    const pr = robustPortmanteau(totals, 10); const pv = volatilityClustering(totals, 10);
    if ((pr.usable && pr.p < 0.05) || (pv.usable && pv.p < 0.05)) { refused++; continue; }
    const r = orderRadiography(days, { sims, seed: hashSeed(`${key}|R`), curves: 0, points: 2 });
    if (!r.usable) { fewTrades++; continue; }
    dec[Math.min(9, Math.floor(r.ddPercentile * 10))]++;
  }
  return { g, mu, n, cases, refused, fewTrades, dec, N: dec.reduce((a, b) => a + b, 0) };
}

const chiP = (d, N) => 1 - chi2Cdf(d.reduce((s, k) => s + (k - N / 10) ** 2 / (N / 10), 0), 9);
const inBand = (v, [a, b]) => v >= a && v <= b;

function report(cells, label) {
  const tests = [];
  for (const c of cells.filter((x) => REQUIRED.includes(x.g) && x.N >= 100)) {
    tests.push({ where: `celda ${c.g} μ ${c.mu} n ${c.n}`, N: c.N, dec: c.dec, p: chiP(c.dec, c.N), outside: c.dec.some((k) => !inBand(k / c.N, [0.07, 0.13])) });
  }
  for (const g of REQUIRED) {
    const cs = cells.filter((x) => x.g === g && x.N >= 100); if (!cs.length) continue;
    const dec = new Array(10).fill(0); for (const c of cs) c.dec.forEach((k, i) => { dec[i] += k; });
    const N = dec.reduce((a, b) => a + b, 0);
    tests.push({ where: `conjunto ${g}`, N, dec, p: chiP(dec, N), outside: dec.some((k) => !inBand(k / N, [0.085, 0.115])) });
  }
  tests.sort((a, b) => a.p - b.p);
  const failing = [];
  for (let i = 0; i < tests.length; i++) { if (tests[i].p * (tests.length - i) >= 0.05) break; if (tests[i].outside) failing.push(tests[i]); }
  const pct = (v) => (100 * v).toFixed(1);
  const L = [`# Prueba de la radiografía: ${label}`, '', `Generado por \`node bench/radiografia.js\` el ${new Date().toISOString().slice(0, 10)}. Casos por celda: ${cells[0].cases}. Permutaciones por caso: ${cells[0].sims || '—'}.`, ''];
  L.push(`**Veredicto:** ${failing.length ? `**suspende** (${failing.length} pruebas)` : 'aprueba: el percentil del drawdown real se reparte por igual en todos los procesos exigidos'}.`, '');
  L.push('| Proceso | μ | n | sin cifras (puertas) | menos de 30 operaciones | evaluados | décimos del percentil (%) |', '|---|---|---|---|---|---|---|');
  for (const c of cells) L.push(`| ${c.g} | ${c.mu} | ${c.n} | ${pct(c.refused / c.cases)} % | ${pct(c.fewTrades / c.cases)} % | ${c.N} | ${c.N ? c.dec.map((k) => pct(k / c.N)).join(' · ') : '—'} |`);
  if (failing.length) { L.push('', '## Lo que suspende', ''); for (const t of failing) L.push(`- ${t.where} (${t.N} casos): ${t.dec.map((k) => pct(k / t.N)).join(' · ')} (p = ${t.p.toExponential(2)})`); }
  return L.join('\n') + '\n';
}

if (!isMainThread) {
  if (workerData?.role === 'radiografia') parentPort.on('message', (task) => { if (task === null) process.exit(0); parentPort.postMessage({ ...runCell(task), sims: task.sims }); });
} else {
  const args = process.argv.slice(2);
  const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
  const cases = Number(opt('cases', 1000)); const sims = Number(opt('sims', 500));
  const first = Number(opt('first', 2000001)); const out = opt('out', 'RADIO-1');
  const tasks = [];
  for (const g of [...REQUIRED, ...INFORMED]) for (const mu of (g === 'G12' ? ['real', 0] : [0, 0.05, 0.1])) for (const n of NS) tasks.push({ g, mu, n, cases, sims, first });
  tasks.sort((a, b) => b.n - a.n);
  const results = []; let next = 0; const t0 = Date.now();
  await new Promise((resolve) => {
    let alive = Math.min(os.cpus().length, tasks.length);
    for (let w = 0, W = alive; w < W; w++) {
      const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { role: 'radiografia' } });
      const feed = () => { if (next < tasks.length) worker.postMessage(tasks[next++]); else { worker.postMessage(null); if (--alive === 0) resolve(); } };
      worker.on('message', (cell) => { results.push(cell); if (results.length % 10 === 0) console.log(`${results.length}/${tasks.length} celdas · ${((Date.now() - t0) / 60000).toFixed(1)} min`); feed(); });
      worker.on('error', (e) => { console.error(e); process.exit(1); });
      feed();
    }
  });
  const order = (c) => [[...REQUIRED, ...INFORMED].indexOf(c.g), String(c.mu), c.n];
  results.sort((a, b) => { const x = order(a); const y = order(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; });
  fs.writeFileSync(path.join(HERE, 'results', `${out}.json`), JSON.stringify(results));
  fs.writeFileSync(path.join(HERE, 'results', `REPORT-${out}.md`), report(results, out));
  console.log(`escrito bench/results/REPORT-${out}.md`);
}
