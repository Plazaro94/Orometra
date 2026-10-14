// Banco del Monte Carlo (bench/PREREGISTRO-MONTECARLO.md).
//
//   node bench/montecarlo.js calib [--cases 1000] [--sims 2000] [--out MC-calib1] [--only G1,G3a]
//   node bench/montecarlo.js exam  ...   (solo cuando los métodos estén congelados)
//
// Cada caso: n días de un proceso con verdad conocida (lo que tendría el usuario) y los H
// días siguientes de la MISMA realización (el futuro, que solo conoce el banco). Se mide con
// qué frecuencia el futuro cae fuera de lo que dijo cada método. Reparte las celdas entre los
// núcleos (worker_threads). Escribe bench/results/<out>.jsonl y bench/results/REPORT-<out>.md.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRng } from '../core/rng.js';
import { packDays, daysFromDeals, predictiveMonteCarlo } from '../core/trades/montecarlo.js';
import { hashSeed } from './sim.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MUS = [0, 0.05, 0.1];
const PAIRS = [[63, 63], [126, 63], [126, 126], [252, 63], [252, 126], [252, 252], [504, 63], [504, 126], [504, 252], [1008, 63], [1008, 126], [1008, 252]];
const REQUIRED = ['G1', 'G2', 'G3a', 'G3b', 'G4', 'G5', 'G6', 'G7'];
const METHODS = ['M0', 'M1', 'M2'];
const DD_K = [1, 2, 3];

// ------------------------------------------------------------------ procesos (§2)
function normal(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
function chi2(r, k) { let s = 0; for (let i = 0; i < k; i++) { const z = normal(r); s += z * z; } return s; }
const t3 = (r) => normal(r) / Math.sqrt(chi2(r, 3) / 3);
const t4 = (r) => normal(r) / Math.sqrt(chi2(r, 4) / 4);
const G6_EY = 0.35 * 3 * Math.exp(0.75 ** 2 / 2) - 0.65;
const G6_EY2 = 0.35 * 9 * Math.exp(2 * 0.75 ** 2) + 0.65 * (1 + 1 / 12);
const G6_SD = Math.sqrt(G6_EY2 - G6_EY ** 2);

/** Serie diaria de longitud len (muestra + futuro, una sola realización). */
function series(g, mu, len, r) {
  const x = new Float64Array(len);
  if (g === 'G1') for (let i = 0; i < len; i++) x[i] = mu + normal(r);
  else if (g === 'G2') for (let i = 0; i < len; i++) x[i] = mu + t3(r) / Math.sqrt(3);
  else if (g === 'G3a' || g === 'G3b') {
    const phi = g === 'G3a' ? 0.3 : -0.2; const s = Math.sqrt(1 - phi * phi);
    let e = normal(r);
    for (let i = 0; i < len; i++) { e = phi * e + s * normal(r); x[i] = mu + e; }
  } else if (g === 'G4') {
    let h = 1; let e = 0;
    for (let i = 0; i < 300 + len; i++) { h = 0.05 + 0.1 * e * e + 0.85 * h; e = Math.sqrt(h) * normal(r); if (i >= 300) x[i - 300] = mu + e; }
  } else if (g === 'G5') for (let i = 0; i < len; i++) x[i] = r() < 0.7 ? 0 : mu / 0.3 + t4(r) / Math.sqrt(2) / Math.sqrt(0.3);
  else if (g === 'G6') {
    for (let i = 0; i < len; i++) {
      const y = r() < 0.35 ? 3 * Math.exp(0.75 * normal(r)) : -(0.5 + r());
      x[i] = (y - G6_EY) / G6_SD + mu;
    }
  } else if (g === 'G8') {
    let a = r() < 0.5;
    for (let i = 0; i < len; i++) { if (r() >= 0.99) a = !a; x[i] = a ? mu + normal(r) : -mu + 1.5 * normal(r); }
  } else throw new Error(`proceso desconocido ${g}`);
  return x;
}

/** Desviación típica verdadera de cada proceso (para los niveles de drawdown k·σ·√H). */
function trueSd(g, mu) {
  if (g === 'G7') return 0.005;
  if (g === 'G9') return 1;
  const r = makeRng(hashSeed(`sd|${g}|${mu}`));
  const x = series(g, mu, 400000, r);
  let m = 0; for (const v of x) m += v; m /= x.length;
  let s = 0; for (const v of x) s += (v - m) ** 2;
  return Math.sqrt(s / (x.length - 1));
}

// ------------------------------------------------------------------ métricas de un camino
function pathStats(x, from, to) {
  let cum = 0; let peak = 0; let dd = 0;
  for (let i = from; i < to; i++) { cum += x[i]; if (cum > peak) peak = cum; else if (peak - cum > dd) dd = peak - cum; }
  return { total: cum, dd };
}

// M0: el método retirado (core/trades/bootstrap.js en dbcc488) llevado al horizonte H: plug-in,
// bloque medio max(2, round(√n)), inicio al azar, longitud geométrica, vuelta circular. Sus
// cifras a un horizonte h < n eran las de los h primeros días de cada camino, que es lo mismo
// que un camino de h días (enmienda 1).
function methodM0(x, n, H, sims, seed, levels) {
  const r = makeRng(seed); const p = 1 / Math.max(2, Math.round(Math.sqrt(n)));
  const tot = new Float64Array(sims); const dds = new Float64Array(sims); const hits = new Float64Array(levels.length);
  let loss = 0;
  for (let s = 0; s < sims; s++) {
    let pos = Math.floor(r() * n); let cum = 0; let peak = 0; let dd = 0;
    for (let t = 0; t < H; t++) {
      if (t > 0 && r() < p) pos = Math.floor(r() * n);
      cum += x[pos]; if (cum > peak) peak = cum; else if (peak - cum > dd) dd = peak - cum;
      pos = pos + 1 === n ? 0 : pos + 1;
    }
    tot[s] = cum; dds[s] = dd; if (cum < 0) loss++;
    for (let j = 0; j < levels.length; j++) if (dd >= levels[j]) hits[j]++;
  }
  tot.sort(); dds.sort();
  const q = (a, pp) => a[Math.min(a.length - 1, Math.floor(pp * a.length))];
  return { total: { p05: q(tot, 0.05), p50: q(tot, 0.5), p95: q(tot, 0.95) }, maxDd: { p50: q(dds, 0.5), p95: q(dds, 0.95) }, probLoss: loss / sims, probDd: levels.map((level, j) => ({ level, p: hits[j] / sims })) };
}

// ------------------------------------------------------------------ un caso
function runCase(g, mu, n, H, caseId, sims, sd) {
  const key = `${g}|${mu}|${n}|${H}|${caseId}`;
  const r = makeRng(hashSeed(key));
  const levelsAdd = DD_K.map((k) => k * sd * Math.sqrt(H));
  let sample; let packedM; let logMode = false; let future; let levels = levelsAdd; let m0Sample; let m0Future; let m0Levels = levelsAdd;

  if (g === 'G7') {
    // Lote proporcional: operaciones con balance, por todo el camino de la app.
    const rets = new Float64Array(n + H);
    for (let i = 0; i < n + H; i++) rets[i] = 0.005 * (mu + normal(r));
    const deals = []; let bal = 100000; const money = new Float64Array(n + H);
    let t = Date.UTC(2020, 0, 6);
    for (let i = 0; i < n + H; i++) {
      while ([0, 6].includes(new Date(t).getUTCDay())) t += 86400000;
      const net = bal * (Math.exp(rets[i]) - 1); money[i] = net; bal += net;
      if (i < n) { const d = new Date(t); deals.push({ time: `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')} 12:00:00`, net, balance: bal }); }
      t += 86400000;
    }
    const days = daysFromDeals(deals, 'log');
    if (!days.usable || days.days.length !== n) throw new Error(`G7: días ${days.days?.length} ≠ ${n}`);
    packedM = packDays(days.days); logMode = true;
    const f = pathStats(rets, n, n + H);
    future = { total: Math.exp(f.total) - 1, dd: 1 - Math.exp(-f.dd), loss: f.total < 0 };
    levels = levelsAdd.map((v) => 1 - Math.exp(-v));
    // M0 trabajaba en dinero: se le juzga en dinero (sin niveles de drawdown: no hay σ en dinero fija).
    m0Sample = money.subarray(0, n);
    const fm = pathStats(money, n, n + H);
    m0Future = { total: fm.total, dd: fm.dd, loss: fm.total < 0 };
    m0Levels = [];
  } else if (g === 'G9') {
    const K = mu; // en G9 el «μ» de la celda es K
    let best = -Infinity; let bestTrue = 0;
    for (let k = 0; k < K; k++) {
      const muK = 0.05 * normal(r); const m = muK + normal(r) / Math.sqrt(n);
      if (m > best) { best = m; bestTrue = muK; }
    }
    const w = new Float64Array(n); let wm = 0;
    for (let i = 0; i < n; i++) { w[i] = normal(r); wm += w[i]; }
    wm /= n;
    sample = new Float64Array(n + H);
    for (let i = 0; i < n; i++) sample[i] = best + (w[i] - wm);
    for (let i = n; i < n + H; i++) sample[i] = bestTrue + normal(r);
  } else {
    sample = series(g, mu, n + H, r);
  }
  if (!packedM) {
    packedM = packDays(Array.from(sample.subarray(0, n), (v) => [v]));
    const f = pathStats(sample, n, n + H);
    future = { total: f.total, dd: f.dd, loss: f.total < 0 };
    m0Sample = sample.subarray(0, n); m0Future = future;
  }
  const out = {};
  out.M0 = { res: methodM0(m0Sample, n, H, sims, hashSeed(`${key}|M0`), m0Levels), fut: m0Future, levels: m0Levels };
  out.M1 = { res: predictiveMonteCarlo(packedM, { horizon: H, sims, seed: hashSeed(`${key}|M1`), log: logMode, ddLevels: levels, method: 'two-stage' }), fut: future, levels };
  out.M2 = { res: predictiveMonteCarlo(packedM, { horizon: H, sims, seed: hashSeed(`${key}|M2`), log: logMode, ddLevels: levels, method: 'bayes' }), fut: future, levels };
  return out;
}

// ------------------------------------------------------------------ una celda
function runCell({ g, mu, n, H, cases, sims, firstCase }) {
  const sd = trueSd(g, mu);
  const acc = {};
  for (const m of METHODS) acc[m] = { ddP95: 0, ddP50: 0, out: 0, blocks: [], preds: { loss: [] }, outcomes: { loss: [] } };
  for (const m of METHODS) for (const k of DD_K) { acc[m].preds[`dd${k}`] = []; acc[m].outcomes[`dd${k}`] = []; }
  for (let c = 0; c < cases; c++) {
    const res = runCase(g, mu, n, H, firstCase + c, sims, sd);
    for (const m of METHODS) {
      const { res: rr, fut, levels } = res[m]; const a = acc[m];
      if (fut.dd > rr.maxDd.p95) a.ddP95++;
      if (fut.dd > rr.maxDd.p50) a.ddP50++;
      if (fut.total < rr.total.p05 || fut.total > rr.total.p95) a.out++;
      if (rr.block) a.blocks.push(rr.block);
      a.preds.loss.push(rr.probLoss); a.outcomes.loss.push(fut.loss ? 1 : 0);
      levels.forEach((lv, j) => { a.preds[`dd${DD_K[j]}`].push(rr.probDd[j].p); a.outcomes[`dd${DD_K[j]}`].push(fut.dd >= lv ? 1 : 0); });
    }
  }
  const summary = {};
  for (const m of METHODS) {
    const a = acc[m];
    const rel = {};
    for (const [name, preds] of Object.entries(a.preds)) {
      if (!preds.length) continue;
      const outs = a.outcomes[name];
      const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, o: 0 }));
      let brier = 0;
      preds.forEach((p, i) => { const b = bins[Math.min(9, Math.floor(p * 10))]; b.n++; b.p += p; b.o += outs[i]; brier += (p - outs[i]) ** 2; });
      const worst = bins.filter((b) => b.n >= 200).reduce((w, b) => Math.max(w, Math.abs(b.p / b.n - b.o / b.n)), 0);
      rel[name] = { brier: brier / preds.length, worstBinGap: worst, bins: bins.map((b) => (b.n ? [b.n, +(b.p / b.n).toFixed(4), +(b.o / b.n).toFixed(4)] : null)) };
    }
    const blocks = a.blocks.sort((x, y) => x - y);
    summary[m] = {
      ddOverP95: a.ddP95 / cases, ddOverP50: a.ddP50 / cases, totalOutside: a.out / cases, rel,
      blockMedian: blocks.length ? blocks[Math.floor(blocks.length / 2)] : null,
    };
  }
  return { g, mu, n, H, cases, sims, sd, summary };
}

// ------------------------------------------------------------------ criterios (§6)
function passes(cell, m) {
  const s = cell.summary[m]; const m0 = cell.summary.M0;
  const fails = [];
  if (!(s.ddOverP95 >= 0.025 && s.ddOverP95 <= 0.07)) fails.push(`DD>p95 ${(100 * s.ddOverP95).toFixed(1)} %`);
  if (!(s.ddOverP50 >= 0.44 && s.ddOverP50 <= 0.56)) fails.push(`DD>p50 ${(100 * s.ddOverP50).toFixed(1)} %`);
  if (!(s.totalOutside >= 0.06 && s.totalOutside <= 0.13)) fails.push(`fuera ${(100 * s.totalOutside).toFixed(1)} %`);
  for (const [name, r] of Object.entries(s.rel)) {
    if (r.worstBinGap > 0.05) fails.push(`fiabilidad ${name} ${(100 * r.worstBinGap).toFixed(1)} pt`);
    if (m !== 'M0' && m0.rel[name] && r.brier > m0.rel[name].brier) fails.push(`Brier ${name}`);
  }
  return fails;
}

function report(cells, label, timing) {
  const pct = (v) => `${(100 * v).toFixed(1)}`;
  const L = [];
  L.push(`# Banco del Monte Carlo: ${label}`, '', `Generado por \`node bench/montecarlo.js\` el ${new Date().toISOString().slice(0, 10)}. Prerregistro: \`bench/PREREGISTRO-MONTECARLO.md\`. Casos por celda: ${cells[0].cases}; simulaciones por caso: ${cells[0].sims}.`, '');
  L.push('## Veredicto (§6)', '');
  for (const m of ['M1', 'M2']) {
    for (const H of [63, 126, 252]) {
      const ns = [...new Set(PAIRS.filter(([, h]) => h === H).map(([n]) => n))].sort((a, b) => a - b);
      let nmin = null;
      for (const n0 of ns) {
        const ok = cells.filter((c) => REQUIRED.includes(c.g) && c.H === H && c.n >= n0).every((c) => passes(c, m).length === 0);
        if (ok) { nmin = n0; break; }
      }
      L.push(`- **${m}, H = ${H}:** ${nmin ? `apto desde n = ${nmin}` : 'no apto con ningún n de la rejilla'}`);
    }
  }
  const m1ok = ['M1', 'M2'].some((m) => {
    const ns = [63, 126, 252];
    return ns.some((n0) => n0 >= 126 && cells.filter((c) => REQUIRED.includes(c.g) && c.H === 126 && c.n >= n0).every((c) => passes(c, m).length === 0));
  });
  L.push('', `**Criterio de descarte** (algún método apto para H = 126 con n_min ≤ 252): ${m1ok ? 'se cumple' : '**no se cumple**'}.`, '');
  L.push('## Celdas exigidas: cobertura', '', 'Cada celda: drawdown futuro > p95 / > p50 / resultado fuera de P05–P95, en %. Ideal 5 / 50 / 10. En negrita, las celdas que suspenden algún criterio (fiabilidad y Brier incluidos).', '');
  for (const H of [63, 126, 252]) {
    L.push(`### H = ${H}`, '', '| Proceso | μ | n | M0 | M1 | M2 |', '|---|---|---|---|---|---|');
    for (const c of cells.filter((x) => x.H === H && REQUIRED.includes(x.g))) {
      const cellTxt = (m) => { const s = c.summary[m]; const t = `${pct(s.ddOverP95)} / ${pct(s.ddOverP50)} / ${pct(s.totalOutside)}`; return passes(c, m).length ? `**${t}**` : t; };
      L.push(`| ${c.g} | ${c.mu} | ${c.n} | ${cellTxt('M0')} | ${cellTxt('M1')} | ${cellTxt('M2')} |`);
    }
    L.push('');
  }
  L.push('## Motivos de suspenso (M1 y M2)', '');
  for (const m of ['M1', 'M2']) {
    const tally = {};
    for (const c of cells.filter((x) => REQUIRED.includes(x.g))) for (const f of passes(c, m)) { const k = f.replace(/ [\d.,-]+( %| pt)?$/, ''); tally[k] = (tally[k] || 0) + 1; }
    L.push(`- ${m}: ${Object.entries(tally).map(([k, v]) => `${k} en ${v} celdas`).join(' · ') || 'ninguno'}`);
  }
  L.push('', '## Se informan (no se exigen)', '', '| Proceso | μ o K | n | H | M0 | M1 | M2 |', '|---|---|---|---|---|---|---|');
  for (const c of cells.filter((x) => !REQUIRED.includes(x.g))) {
    const t = (m) => { const s = c.summary[m]; return `${pct(s.ddOverP95)} / ${pct(s.ddOverP50)} / ${pct(s.totalOutside)}`; };
    L.push(`| ${c.g} | ${c.mu} | ${c.n} | ${c.H} | ${t('M0')} | ${t('M1')} | ${t('M2')} |`);
  }
  if (timing) L.push('', '## Tiempo (orientativo, Node, 10.000 simulaciones)', '', ...timing.map((t) => `- n = ${t.n}, H = ${t.H}: M1 ${t.m1} ms, M2 ${t.m2} ms`));
  return L.join('\n') + '\n';
}

// ------------------------------------------------------------------ orquestación
if (!isMainThread) {
  parentPort.on('message', (task) => { if (task === null) process.exit(0); parentPort.postMessage(runCell(task)); });
} else {
  const args = process.argv.slice(2);
  const mode = args[0];
  const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
  const order = (c) => [REQUIRED.indexOf(c.g) < 0 ? 99 : REQUIRED.indexOf(c.g), c.g, c.mu, c.n, c.H];
  const sortCells = (cells) => cells.sort((a, b) => { const x = order(a); const y = order(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; });
  const timingNow = () => [[252, 126], [1008, 252]].map(([n, H]) => {
    const x = packDays(Array.from(series('G1', 0.05, n, makeRng(5)), (v) => [v]));
    let t = Date.now(); predictiveMonteCarlo(x, { horizon: H, sims: 10000, seed: 1 }); const m1 = Date.now() - t;
    t = Date.now(); predictiveMonteCarlo(x, { horizon: H, sims: 10000, seed: 1, method: 'bayes' }); const m2 = Date.now() - t;
    return { n, H, m1, m2 };
  });
  if (mode === 'report') {
    // Une varias tandas (por ejemplo, la calibración repartida en dos) en un solo informe.
    const parts = (args[1] || '').split(',').filter(Boolean);
    const out = opt('out', parts.join('+'));
    const cells = parts.flatMap((name) => fs.readFileSync(path.join(HERE, 'results', `${name}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    fs.writeFileSync(path.join(HERE, 'results', `REPORT-${out}.md`), report(sortCells(cells), out, timingNow()));
    console.log(`escrito bench/results/REPORT-${out}.md (${cells.length} celdas)`);
    process.exit(0);
  }
  if (!['calib', 'exam'].includes(mode)) { console.error('uso: node bench/montecarlo.js calib|exam [--cases N] [--sims S] [--out nombre] [--only G1,G2]\n     node bench/montecarlo.js report tanda1,tanda2 --out nombre'); process.exit(1); }
  const cases = Number(opt('cases', 1000));
  const sims = Number(opt('sims', 2000));
  const out = opt('out', mode === 'calib' ? 'MC-calib1' : 'MC-exam1');
  const only = opt('only', null)?.split(',');
  const firstCase = mode === 'calib' ? 1 : Number(opt('first', 1000001));
  const tasks = [];
  for (const g of [...REQUIRED, 'G8']) for (const mu of MUS) for (const [n, H] of PAIRS) tasks.push({ g, mu, n, H, cases, sims, firstCase });
  for (const K of [1, 10, 100, 1000]) for (const n of [252, 504]) tasks.push({ g: 'G9', mu: K, n, H: 126, cases, sims, firstCase });
  const todo = (only ? tasks.filter((t) => only.includes(t.g)) : tasks).sort((a, b) => b.n * 3 + b.H - (a.n * 3 + a.H));
  const results = []; let next = 0; const t0 = Date.now();
  const jsonl = path.join(HERE, 'results', `${out}.jsonl`);
  fs.writeFileSync(jsonl, '');
  const nWorkers = Math.min(os.cpus().length, todo.length);
  await new Promise((resolve) => {
    let alive = nWorkers;
    for (let w = 0; w < nWorkers; w++) {
      const worker = new Worker(fileURLToPath(import.meta.url));
      const feed = () => { if (next < todo.length) worker.postMessage(todo[next++]); else { worker.postMessage(null); if (--alive === 0) resolve(); } };
      worker.on('message', (cell) => {
        results.push(cell); fs.appendFileSync(jsonl, JSON.stringify(cell) + '\n');
        if (results.length % 10 === 0 || results.length === todo.length) console.log(`${results.length}/${todo.length} celdas · ${((Date.now() - t0) / 60000).toFixed(1)} min`);
        feed();
      });
      worker.on('error', (e) => { console.error('\n', e); process.exit(1); });
      feed();
    }
  });
  console.log('');
  fs.writeFileSync(path.join(HERE, 'results', `REPORT-${out}.md`), report(sortCells(results), out, timingNow()));
  console.log(`escrito bench/results/REPORT-${out}.md`);
}
