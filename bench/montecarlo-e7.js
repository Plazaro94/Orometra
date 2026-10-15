// Banco de la enmienda 7 del prerregistro del Monte Carlo (bench/PREREGISTRO-MONTECARLO.md):
// variantes del detector de volatilidad agrupada (V0, V1, V2) y mínimo de días con operaciones
// esperados en el horizonte (m), solo con M2bc y k = 100.
//
//   node bench/montecarlo-e7.js calib [--only G1,G2] [--out MC-e7-calib-a]   (casos 1-500)
//   node bench/montecarlo-e7.js exam --variant V2 --m 15 [--only …] [--out MC-exam2-a]
//                                                                    (casos 4.000.001-4.000.500)
//   node bench/montecarlo-e7.js report tanda1,tanda2 --out nombre [--variant V2 --m 15]
//
// Los casos se generan con bench/montecarlo.js#makeCase: misma semilla y mismos sorteos que las
// calibraciones anteriores. En cada caso se calculan antes todas las puertas; M2bc se ejecuta una
// sola vez si alguna combinación lo deja pasar (con la misma semilla de siempre), y cada
// combinación (variante, m) se evalúa con los casos que deja pasar.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calibratedMonteCarlo, robustPortmanteau, volatilityClustering, volatilityClusteringAbs, volatilityClusteringRank } from '../core/trades/montecarlo.js';
import { hashSeed } from './sim.js';
import { evaluate, makeCase, trueSd, newCounts, REQUIRED, NO_DEPENDENCE, PAIRS, MUS } from './montecarlo.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DETECTORS = { V0: volatilityClustering, V1: volatilityClusteringAbs, V2: volatilityClusteringRank };
const VARIANTS = Object.keys(DETECTORS);
const M_GRID = [0, 10, 15, 20];
const K = 100;
const CASES = 500;
const HEAVY = ['G2', 'G6', 'G6b', 'G12'];

// ------------------------------------------------------------------ una celda
function runCell({ g, mu, n, H, firstCase, sims, variants, mGrid, cases = CASES }) {
  const sd = trueSd(g, mu);
  const refusedVol = {}; const byVM = {};
  for (const v of variants) { refusedVol[v] = 0; byVM[v] = {}; for (const m of mGrid) byVM[v][m] = newCounts(); }
  let refusedRachas = 0; let detectedVol = 0;
  const detected = {}; for (const v of VARIANTS) detected[v] = 0;
  for (let c = 0; c < cases; c++) {
    const cs = makeCase(g, mu, n, H, firstCase + c, sd);
    const pt = robustPortmanteau(cs.packedM.total, 10);
    // Se informa (h): cuántos casos marca cada variante, antes de cualquier puerta.
    const hit = {};
    for (const v of VARIANTS) { const r = DETECTORS[v](cs.packedM.total, 10); hit[v] = Boolean(r.usable && r.p < 0.05); if (hit[v]) detected[v]++; }
    if (hit.V0) detectedVol++;
    if (pt.usable && pt.p < 0.05) { refusedRachas++; continue; }
    const pass = variants.filter((v) => !hit[v]);
    for (const v of variants) if (hit[v]) refusedVol[v]++;
    if (!pass.length || cs.tradingDays < K) continue;
    const expected = (cs.tradingDays / n) * H;
    const ms = mGrid.filter((m) => expected >= m);
    if (!ms.length) continue;
    const obs = { total: cs.future.total, dd: cs.future.dd };
    const rr = calibratedMonteCarlo(cs.packedM, { horizon: H, sims, seed: hashSeed(`${cs.key}|M2bc`), log: cs.logMode, ddLevels: cs.levels, outer: 200, inner: 500, observe: obs });
    const fut = cs.future;
    const hit95 = fut.dd > rr.maxDd.p95; const hit50 = fut.dd > rr.maxDd.p50; const out = fut.total < rr.total.p05 || fut.total > rr.total.p95;
    const iT = Math.min(9, Math.floor(rr.pit.total * 10)); const iD = Math.min(9, Math.floor(rr.pit.dd * 10));
    for (const v of pass) for (const m of ms) {
      const a = byVM[v][m];
      a.N++; if (hit95) a.p95++; if (hit50) a.p50++; if (out) a.out++; a.pitT[iT]++; a.pitD[iD]++;
    }
  }
  return { g, mu, n, H, cases, sims, firstCase, refusedRachas, refusedVol, detected, byVM };
}

/** Celdas con la forma que espera evaluate() (bench/montecarlo.js), para una variante. */
const cellsFor = (cells, v) => cells.filter((c) => c.byVM[v]).map((c) => ({
  g: c.g, mu: c.mu, n: c.n, H: c.H, cases: c.cases, refusedRachas: c.refusedRachas, refusedVol: c.refusedVol[v],
  byK: Object.fromEntries(Object.entries(c.byVM[v]).map(([m, a]) => [m, { M2bc: a }])),
}));

const refusal = (cells, v, gs) => {
  const cs = cells.filter((c) => gs.includes(c.g) && c.byVM[v]);
  return cs.length ? cs.reduce((s, c) => s + (c.refusedRachas + c.refusedVol[v]) / c.cases, 0) / cs.length : NaN;
};

/** La elección de la enmienda 7 (e), paso a paso. */
function choose(cells) {
  const rows = VARIANTS.filter((v) => cells.some((c) => c.byVM[v])).map((v) => {
    const ev = evaluate(cellsFor(cells, v), 'M2bc', 0);
    const eligible = ev.nmin[126] != null && ev.nmin[126] <= 504 && ev.nmin[252] != null && ev.nmin[252] <= 504 && ev.overRefusal.length === 0;
    return { v, heavy: refusal(cells, v, HEAVY), eligible, ev };
  });
  const v0 = rows.find((r) => r.v === 'V0');
  const best = rows.filter((r) => r.eligible).sort((a, b) => a.heavy - b.heavy)[0];
  const variant = best && v0 && v0.heavy - best.heavy >= 0.02 ? best.v : 'V0';
  const base = evaluate(cellsFor(cells, variant), 'M2bc', 0).nmin;
  let m = null;
  const byM = M_GRID.map((mm) => ({ m: mm, nmin: evaluate(cellsFor(cells, variant), 'M2bc', mm).nmin }));
  for (const r of byM) {
    const okH63 = r.nmin[63] != null && r.nmin[63] <= 252;
    const no126 = base[126] == null || (r.nmin[126] != null && r.nmin[126] <= base[126]);
    const no252 = base[252] == null || (r.nmin[252] != null && r.nmin[252] <= base[252]);
    if (okH63 && no126 && no252) { m = r.m; break; }
  }
  return { rows, variant, m, byM };
}

// ------------------------------------------------------------------ informe
function writeReport(cells, label, fixed) {
  const pct = (x) => (Number.isFinite(x) ? `${(100 * x).toFixed(1)} %` : '—');
  const nm = (v) => [63, 126, 252].map((H) => (v.nmin[H] ? `apto desde n = ${v.nmin[H]}` : 'no apto')).join(' | ');
  const L = [`# Banco del Monte Carlo, enmienda 7: ${label}`, '',
    `Generado por \`node bench/montecarlo-e7.js\` el ${new Date().toISOString().slice(0, 10)}. Prerregistro: \`bench/PREREGISTRO-MONTECARLO.md\`, enmienda 7. M2bc, k = ${K}, ${cells[0].cases} casos por celda (primer caso ${cells[0].firstCase}), ${cells[0].sims} simulaciones por caso. Reglas de aptitud: las de las enmiendas 4 y 5.`, ''];
  const variants = VARIANTS.filter((v) => cells.some((c) => c.byVM[v]));
  L.push('## Rechazo de las dos puertas (media de las celdas)', '', `| Variante | ${[...REQUIRED].join(' | ')} | G2, G6, G6b y G12 |`, `|---|${REQUIRED.map(() => '---|').join('')}---|`);
  for (const v of variants) L.push(`| ${v} | ${REQUIRED.map((g) => pct(refusal(cells, v, [g]))).join(' | ')} | ${pct(refusal(cells, v, HEAVY))} |`);
  L.push('', `Límite (enmienda 5 d): como mucho un 20 % en ${NO_DEPENDENCE.join(', ')}.`, '');
  L.push('## Veredicto por variante y m', '', '| Variante | m | H = 63 | H = 126 | H = 252 |', '|---|---|---|---|---|');
  for (const v of variants) for (const m of M_GRID.filter((mm) => cells[0].byVM[v][mm])) L.push(`| ${v} | ${m} | ${nm(evaluate(cellsFor(cells, v), 'M2bc', m))} |`);
  if (fixed) {
    const ev = evaluate(cellsFor(cells, fixed.variant), 'M2bc', fixed.m);
    L.push('', `## Examen: ${fixed.variant} con m = ${fixed.m}`, '', `**Veredicto:** ${nm(ev)}.`, '');
    L.push(`Celdas evaluadas: ${ev.evaluated}; sin evaluar (menos de 100 casos aceptados): ${ev.unevaluated}; pruebas en la familia de Holm: ${ev.tests}.`);
    if (ev.overRefusal.length) L.push('', `Rechazo por encima del 20 %: ${ev.overRefusal.map((c) => `${c.g} μ ${c.mu} n ${c.n} H ${c.H}`).join('; ')}.`);
    if (ev.failing.length) {
      L.push('', '### Lo que suspende', '');
      for (const t of ev.failing) L.push(`- ${t.kind === 'celda' ? `Celda ${t.c.g} μ ${t.c.mu} n ${t.c.n} H ${t.c.H}` : `Conjunto ${t.g}, H = ${t.H}, n ≥ ${t.n0} (${t.N} casos)`}: ${t.name} ${Array.isArray(t.v) ? t.v.map((x) => (100 * x).toFixed(1)).join(' · ') : pct(t.v)} (p = ${t.p.toExponential(2)})`);
    }
  } else {
    const ch = choose(cells);
    L.push('', '## Elección (enmienda 7 e)', '');
    for (const r of ch.rows) L.push(`- ${r.v}: rechazo medio en G2, G6, G6b y G12 ${pct(r.heavy)}; con m = 0, ${nm(r.ev)}; ${r.eligible ? 'cumple las condiciones' : 'no cumple las condiciones'}${r.ev.overRefusal.length ? ` (rechazo > 20 % en ${r.ev.overRefusal.length} celdas)` : ''}.`);
    L.push('', `**Variante elegida: ${ch.variant}.** **m elegida: ${ch.m == null ? 'ninguna (H = 63 sigue fuera)' : ch.m}.**`);
    for (const r of ch.byM) L.push(`- ${ch.variant} con m = ${r.m}: ${nm({ nmin: r.nmin })}`);
    const ev = evaluate(cellsFor(cells, ch.variant), 'M2bc', ch.m ?? 0);
    if (ev.failing.length) {
      L.push('', `### Lo que suspende con ${ch.variant} y m = ${ch.m ?? 0}`, '');
      for (const t of ev.failing.slice(0, 40)) L.push(`- ${t.kind === 'celda' ? `Celda ${t.c.g} μ ${t.c.mu} n ${t.c.n} H ${t.c.H}` : `Conjunto ${t.g}, H = ${t.H}, n ≥ ${t.n0} (${t.N} casos)`}: ${t.name} ${Array.isArray(t.v) ? t.v.map((x) => (100 * x).toFixed(1)).join(' · ') : pct(t.v)} (p = ${t.p.toExponential(2)})`);
    }
  }
  L.push('', '## Se informa (h): casos que marca cada detector, antes de las puertas', '', `| Proceso | ${VARIANTS.join(' | ')} |`, `|---|${VARIANTS.map(() => '---|').join('')}`);
  for (const g of REQUIRED) {
    const cs = cells.filter((c) => c.g === g); if (!cs.length) continue;
    const tot = cs.reduce((s, c) => s + c.cases, 0);
    L.push(`| ${g} | ${VARIANTS.map((v) => pct(cs.reduce((s, c) => s + c.detected[v], 0) / tot)).join(' | ')} |`);
  }
  return L.join('\n') + '\n';
}

// ------------------------------------------------------------------ orquestación
if (!isMainThread) {
  if (workerData?.role === 'montecarlo-e7') parentPort.on('message', (task) => { if (task === null) process.exit(0); parentPort.postMessage(runCell(task)); });
} else if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const mode = args[0];
  const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
  const variantOpt = opt('variant', null); const mOpt = opt('m', null);
  const fixed = variantOpt && mOpt != null ? { variant: variantOpt, m: Number(mOpt) } : null;
  if (mode === 'report') {
    const parts = (args[1] || '').split(',').filter(Boolean);
    const out = opt('out', parts.join('+'));
    const cells = parts.flatMap((name) => fs.readFileSync(path.join(HERE, 'results', `${name}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    fs.writeFileSync(path.join(HERE, 'results', `REPORT-${out}.md`), writeReport(cells, out, fixed));
    console.log(`escrito bench/results/REPORT-${out}.md (${cells.length} celdas)`);
    process.exit(0);
  }
  if (!['calib', 'exam'].includes(mode) || (mode === 'exam' && !fixed)) {
    console.error('uso: node bench/montecarlo-e7.js calib [--only G1,G2] [--out nombre]\n     node bench/montecarlo-e7.js exam --variant V2 --m 15 [--only …] [--out nombre]\n     node bench/montecarlo-e7.js report tanda1,tanda2 --out nombre [--variant V2 --m 15]');
    process.exit(1);
  }
  const sims = Number(opt('sims', 2000));
  // --cases solo para pruebas rápidas del propio script: el banco usa 500 (enmienda 5 b).
  const cases = Number(opt('cases', CASES));
  const out = opt('out', mode === 'calib' ? 'MC-e7-calib' : 'MC-exam2');
  const only = opt('only', null)?.split(',');
  const firstCase = mode === 'calib' ? 1 : 4000001;
  const variants = mode === 'calib' ? VARIANTS : [fixed.variant];
  const mGrid = mode === 'calib' ? M_GRID : [fixed.m];
  const jsonl = path.join(HERE, 'results', `${out}.jsonl`);
  // Se puede reanudar: las celdas ya escritas en el .jsonl no se repiten.
  const done = new Set(fs.existsSync(jsonl) ? fs.readFileSync(jsonl, 'utf8').split('\n').filter(Boolean).map((l) => { const c = JSON.parse(l); return `${c.g}|${c.mu}|${c.n}|${c.H}`; }) : []);
  const tasks = [];
  for (const g of REQUIRED) for (const mu of (g === 'G12' ? ['real', 0] : MUS)) for (const [n, H] of PAIRS) tasks.push({ g, mu, n, H, firstCase, sims, variants, mGrid, cases });
  const todo = tasks.filter((t) => !only || only.includes(t.g)).filter((t) => !done.has(`${t.g}|${t.mu}|${t.n}|${t.H}`))
    .sort((a, b) => b.n * 3 + b.H - (a.n * 3 + a.H));
  console.log(`${todo.length} celdas por hacer (${done.size} ya hechas)`);
  let next = 0; let got = 0; const t0 = Date.now();
  const nWorkers = Math.min(os.cpus().length, todo.length);
  await new Promise((resolve) => {
    let alive = nWorkers;
    if (!alive) resolve();
    for (let w = 0; w < nWorkers; w++) {
      const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { role: 'montecarlo-e7' } });
      const feed = () => { if (next < todo.length) worker.postMessage(todo[next++]); else { worker.postMessage(null); if (--alive === 0) resolve(); } };
      worker.on('message', (cell) => {
        fs.appendFileSync(jsonl, JSON.stringify(cell) + '\n'); got++;
        if (got % 5 === 0 || got === todo.length) console.log(`${got}/${todo.length} celdas · ${((Date.now() - t0) / 60000).toFixed(1)} min`);
        feed();
      });
      worker.on('error', (e) => { console.error('\n', e); process.exit(1); });
      feed();
    }
  });
  console.log(`escrito bench/results/${out}.jsonl`);
}
