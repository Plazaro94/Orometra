// Banco del Monte Carlo (bench/PREREGISTRO-MONTECARLO.md, con las enmiendas 1 a 3).
//
//   node bench/montecarlo.js calib  [--cases 1000] [--sims 2000] [--out MC-calib2] [--only G1,G3a]
//                                   [--methods M0,M1,M2] [--pairs 126x63,252x126]
//   node bench/montecarlo.js exam   ...   (solo cuando los métodos estén congelados)
//   node bench/montecarlo.js report tanda1,tanda2 --out nombre   (une tandas en un informe)
//
// Cada caso: n días de un proceso con verdad conocida (lo que tendría el usuario) y los H
// días siguientes de la MISMA realización (el futuro, que solo conoce el banco). Si el
// detector de rachas (Ljung-Box, enmienda 2) rechaza la muestra, la app no daría cifras: el
// caso cuenta como rechazado y no se evalúa. En el resto se mide con qué frecuencia el futuro
// cae fuera de lo que dijo cada método y cómo se reparte su PIT. La primera calibración usó la
// versión anterior de este archivo (commit f1bf4c9) y los criterios originales.

import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRng } from '../core/rng.js';
import { packDays, daysFromDeals, predictiveMonteCarlo, calibratedMonteCarlo, ljungBox, pitSorted } from '../core/trades/montecarlo.js';
import { hashSeed } from './sim.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MUS = [0, 0.05, 0.1];
// Enmienda 2 (c): H ≤ n/2.
const PAIRS = [[126, 63], [252, 63], [252, 126], [504, 63], [504, 126], [504, 252], [1008, 63], [1008, 126], [1008, 252]];
const REQUIRED = ['G1', 'G2', 'G3a', 'G3b', 'G4', 'G5', 'G6', 'G7'];
// Procesos sin dependencia en el nivel: el detector no debe rechazar más de un 15 % de sus casos.
const NO_LEVEL_DEPENDENCE = ['G1', 'G2', 'G4', 'G5', 'G6', 'G7'];
const DD_K = [1, 2, 3];
const MIN_ACCEPTED = 100;

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

function pathStats(x, from, to) {
  let cum = 0; let peak = 0; let dd = 0;
  for (let i = from; i < to; i++) { cum += x[i]; if (cum > peak) peak = cum; else if (peak - cum > dd) dd = peak - cum; }
  return { total: cum, dd };
}

// M0: el método retirado (core/trades/bootstrap.js en dbcc488) llevado al horizonte H
// (enmienda 1 a): plug-in, bloque medio max(2, round(√n)), inicio al azar, longitud geométrica.
function methodM0(x, n, H, sims, seed, levels, observe) {
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
  return {
    total: { p05: q(tot, 0.05), p50: q(tot, 0.5), p95: q(tot, 0.95) }, maxDd: { p50: q(dds, 0.5), p95: q(dds, 0.95) },
    probLoss: loss / sims, probDd: levels.map((level, j) => ({ level, p: hits[j] / sims })),
    pit: { total: pitSorted(tot, observe.total, r()), dd: pitSorted(dds, observe.dd, r()) },
  };
}

// ------------------------------------------------------------------ un caso
function runCase(g, mu, n, H, caseId, sims, sd, methods) {
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
    // M0 trabajaba en dinero: se le juzga en dinero (enmienda 1 c).
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
  // Enmienda 2 (b): con rachas detectadas, la app no da cifras.
  const lb = ljungBox(packedM.total, 10);
  if (lb.usable && lb.p < 0.05) return { refused: true };
  const obs = { total: future.total, dd: future.dd };
  const out = {};
  for (const m of methods) {
    const seed = hashSeed(`${key}|${m}`);
    if (m === 'M0') out.M0 = { res: methodM0(m0Sample, n, H, sims, seed, m0Levels, { total: m0Future.total, dd: m0Future.dd }), fut: m0Future, levels: m0Levels };
    else if (m === 'M1') out.M1 = { res: predictiveMonteCarlo(packedM, { horizon: H, sims, seed, log: logMode, ddLevels: levels, method: 'two-stage', observe: obs }), fut: future, levels };
    else if (m === 'M2') out.M2 = { res: predictiveMonteCarlo(packedM, { horizon: H, sims, seed, log: logMode, ddLevels: levels, method: 'bayes', observe: obs }), fut: future, levels };
    else if (m === 'M2c') out.M2c = { res: calibratedMonteCarlo(packedM, { horizon: H, sims, seed, log: logMode, ddLevels: levels, outer: 200, inner: 500, observe: obs }), fut: future, levels };
  }
  return { refused: false, out };
}

// ------------------------------------------------------------------ una celda
function runCell({ g, mu, n, H, cases, sims, firstCase, methods }) {
  const sd = trueSd(g, mu);
  const acc = {};
  const newAcc = () => ({ ddP95: 0, ddP50: 0, out: 0, pitT: new Array(10).fill(0), pitD: new Array(10).fill(0), blocks: [], preds: {}, outcomes: {} });
  for (const m of methods) acc[m] = newAcc();
  let refused = 0;
  for (let c = 0; c < cases; c++) {
    const res = runCase(g, mu, n, H, firstCase + c, sims, sd, methods);
    if (res.refused) { refused++; continue; }
    for (const m of methods) {
      const { res: rr, fut, levels } = res.out[m]; const a = acc[m];
      if (fut.dd > rr.maxDd.p95) a.ddP95++;
      if (fut.dd > rr.maxDd.p50) a.ddP50++;
      if (fut.total < rr.total.p05 || fut.total > rr.total.p95) a.out++;
      a.pitT[Math.min(9, Math.floor(rr.pit.total * 10))]++;
      a.pitD[Math.min(9, Math.floor(rr.pit.dd * 10))]++;
      if (rr.block) a.blocks.push(rr.block);
      (a.preds.loss ||= []).push(rr.probLoss); (a.outcomes.loss ||= []).push(fut.loss ? 1 : 0);
      levels.forEach((lv, j) => { const k = `dd${DD_K[j]}`; (a.preds[k] ||= []).push(rr.probDd[j].p); (a.outcomes[k] ||= []).push(fut.dd >= lv ? 1 : 0); });
    }
  }
  const accepted = cases - refused;
  const summary = {};
  for (const m of methods) {
    const a = acc[m];
    const rel = {};
    for (const [name, preds] of Object.entries(a.preds)) {
      const outs = a.outcomes[name];
      const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, o: 0 }));
      let brier = 0;
      preds.forEach((p, i) => { const b = bins[Math.min(9, Math.floor(p * 10))]; b.n++; b.p += p; b.o += outs[i]; brier += (p - outs[i]) ** 2; });
      rel[name] = { brier: brier / preds.length, bins: bins.map((b) => (b.n ? [b.n, +(b.p / b.n).toFixed(4), +(b.o / b.n).toFixed(4)] : null)) };
    }
    const blocks = a.blocks.sort((x, y) => x - y);
    const f = (v) => (accepted ? v / accepted : NaN);
    summary[m] = {
      ddOverP95: f(a.ddP95), ddOverP50: f(a.ddP50), totalOutside: f(a.out),
      pitTotal: a.pitT.map(f), pitDd: a.pitD.map(f), rel,
      blockMedian: blocks.length ? blocks[Math.floor(blocks.length / 2)] : null,
    };
  }
  return { g, mu, n, H, cases, sims, sd, accepted, refusedRate: refused / cases, summary };
}

// ------------------------------------------------------------------ criterios (§6 con la enmienda 2)
function passes(cell, m) {
  const fails = [];
  if (NO_LEVEL_DEPENDENCE.includes(cell.g) && cell.refusedRate > 0.15) fails.push(`rechazo ${(100 * cell.refusedRate).toFixed(1)} %`);
  if (cell.accepted < MIN_ACCEPTED) return fails; // enmienda 3: sin casos suficientes para evaluar
  const s = cell.summary[m];
  if (!(s.ddOverP95 >= 0.025 && s.ddOverP95 <= 0.07)) fails.push(`DD>p95 ${(100 * s.ddOverP95).toFixed(1)} %`);
  if (!(s.ddOverP50 >= 0.44 && s.ddOverP50 <= 0.56)) fails.push(`DD>p50 ${(100 * s.ddOverP50).toFixed(1)} %`);
  if (!(s.totalOutside >= 0.06 && s.totalOutside <= 0.13)) fails.push(`fuera ${(100 * s.totalOutside).toFixed(1)} %`);
  const badT = s.pitTotal.map((v, i) => [v, i]).filter(([v]) => v < 0.07 || v > 0.13);
  const badD = s.pitDd.map((v, i) => [v, i]).filter(([v]) => v < 0.07 || v > 0.13);
  if (badT.length) fails.push(`PIT resultado ${badT.map(([v, i]) => `d${i + 1}=${(100 * v).toFixed(1)}`).join(' ')}`);
  if (badD.length) fails.push(`PIT drawdown ${badD.map(([v, i]) => `d${i + 1}=${(100 * v).toFixed(1)}`).join(' ')}`);
  return fails;
}

function verdict(cells, m) {
  const out = {};
  for (const H of [63, 126, 252]) {
    const ns = [...new Set(PAIRS.filter(([, h]) => h === H).map(([n]) => n))].sort((a, b) => a - b);
    const nmin = ns.find((n0) => {
      const cs = cells.filter((c) => REQUIRED.includes(c.g) && c.H === H && c.n >= n0 && c.summary[m]);
      return cs.length && cs.every((c) => passes(c, m).length === 0);
    });
    out[H] = nmin ?? null;
  }
  return out;
}

function report(cells, label, timing) {
  const pct = (v) => (Number.isFinite(v) ? `${(100 * v).toFixed(1)}` : '—');
  const methods = ['M0', 'M1', 'M2', 'M2c'].filter((m) => cells.some((c) => c.summary[m]));
  const L = [];
  L.push(`# Banco del Monte Carlo: ${label}`, '', `Generado por \`node bench/montecarlo.js\` el ${new Date().toISOString().slice(0, 10)}. Prerregistro: \`bench/PREREGISTRO-MONTECARLO.md\` con las enmiendas 1 a 3. Casos por celda: ${cells[0].cases}; simulaciones por caso: ${cells[0].sims}. Solo pares con H ≤ n/2.`, '');
  L.push('## Veredicto', '');
  for (const m of methods.filter((x) => x !== 'M0')) {
    const v = verdict(cells, m);
    L.push(`- **${m}:** ${[63, 126, 252].map((H) => `H = ${H}: ${v[H] ? `apto desde n = ${v[H]}` : 'no apto'}`).join(' · ')}`);
  }
  const kill = methods.filter((x) => x !== 'M0').some((m) => { const v = verdict(cells, m); return v[126] && v[126] <= 252; });
  const full = REQUIRED.every((g) => cells.some((c) => c.g === g && c.H === 126));
  L.push('', `**Criterio de descarte** (algún método apto para H = 126 con n_min ≤ 252): ${!full ? 'no se puede evaluar con esta tanda (faltan procesos)' : kill ? 'se cumple' : '**no se cumple**'}.`, '');
  L.push('## Detector de rachas: casos sin cifras', '', '| Proceso | μ | ' + PAIRS.map(([n, H]) => `${n}/${H}`).join(' | ') + ' |', '|---|---|' + PAIRS.map(() => '---|').join(''));
  for (const g of [...REQUIRED, 'G8']) for (const mu of MUS) {
    const row = PAIRS.map(([n, H]) => { const c = cells.find((x) => x.g === g && x.mu === mu && x.n === n && x.H === H); return c ? pct(c.refusedRate) : ''; });
    if (row.some(Boolean)) L.push(`| ${g} | ${mu} | ${row.join(' | ')} |`);
  }
  L.push('', `Celdas con menos de ${MIN_ACCEPTED} casos aceptados: sus fracciones no se evalúan (enmienda 3).`, '');
  L.push('## Celdas exigidas', '', 'Cada celda: drawdown futuro > p95 / > p50 / resultado fuera de P05–P95, en %, sobre los casos aceptados. Ideal 5 / 50 / 10. En negrita, las que suspenden algún criterio (PIT incluido).', '');
  for (const H of [63, 126, 252]) {
    L.push(`### H = ${H}`, '', `| Proceso | μ | n | aceptados | ${methods.join(' | ')} |`, `|---|---|---|---|${methods.map(() => '---|').join('')}`);
    for (const c of cells.filter((x) => x.H === H && REQUIRED.includes(x.g))) {
      const t = (m) => { const s = c.summary[m]; if (!s) return ''; const txt = `${pct(s.ddOverP95)} / ${pct(s.ddOverP50)} / ${pct(s.totalOutside)}`; return passes(c, m).length ? `**${txt}**` : txt; };
      L.push(`| ${c.g} | ${c.mu} | ${c.n} | ${c.accepted} | ${methods.map(t).join(' | ')} |`);
    }
    L.push('');
  }
  L.push('## Motivos de suspenso', '');
  for (const m of methods) {
    const tally = {};
    for (const c of cells.filter((x) => REQUIRED.includes(x.g) && x.summary[m])) for (const f of passes(c, m)) { const k = f.split(' ').slice(0, f.startsWith('PIT') ? 2 : 1).join(' '); tally[k] = (tally[k] || 0) + 1; }
    L.push(`- ${m}: ${Object.entries(tally).map(([k, v]) => `${k} en ${v} celdas`).join(' · ') || 'ninguno'}`);
  }
  L.push('', '### Detalle de las celdas que suspenden (métodos nuevos)', '');
  for (const m of methods.filter((x) => x !== 'M0')) for (const c of cells.filter((x) => REQUIRED.includes(x.g) && x.summary[m])) {
    const f = passes(c, m); if (f.length) L.push(`- ${m} · ${c.g} μ ${c.mu} n ${c.n} H ${c.H}: ${f.join('; ')}`);
  }
  const informed = cells.filter((x) => !REQUIRED.includes(x.g));
  if (informed.length) {
    L.push('', '## Se informan (no se exigen)', '', `| Proceso | μ o K | n | H | aceptados | ${methods.join(' | ')} |`, `|---|---|---|---|---|${methods.map(() => '---|').join('')}`);
    for (const c of informed) {
      const t = (m) => { const s = c.summary[m]; return s ? `${pct(s.ddOverP95)} / ${pct(s.ddOverP50)} / ${pct(s.totalOutside)}` : ''; };
      L.push(`| ${c.g} | ${c.mu} | ${c.n} | ${c.H} | ${c.accepted} | ${methods.map(t).join(' | ')} |`);
    }
  }
  if (timing) L.push('', '## Tiempo (orientativo, Node, 10.000 simulaciones)', '', ...timing.map((t) => `- n = ${t.n}, H = ${t.H}: M1 ${t.m1} ms, M2 ${t.m2} ms, M2c ${t.m2c} ms`));
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
    t = Date.now(); calibratedMonteCarlo(x, { horizon: H, sims: 10000, seed: 1, outer: 200, inner: 500 }); const m2c = Date.now() - t;
    return { n, H, m1, m2, m2c };
  });
  if (mode === 'report') {
    const parts = (args[1] || '').split(',').filter(Boolean);
    const out = opt('out', parts.join('+'));
    const cells = parts.flatMap((name) => fs.readFileSync(path.join(HERE, 'results', `${name}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    fs.writeFileSync(path.join(HERE, 'results', `REPORT-${out}.md`), report(sortCells(cells), out, timingNow()));
    console.log(`escrito bench/results/REPORT-${out}.md (${cells.length} celdas)`);
    process.exit(0);
  }
  if (!['calib', 'exam'].includes(mode)) {
    console.error('uso: node bench/montecarlo.js calib|exam [--cases N] [--sims S] [--out nombre] [--only G1,G2] [--methods M0,M1,M2] [--pairs 126x63]\n     node bench/montecarlo.js report tanda1,tanda2 --out nombre');
    process.exit(1);
  }
  const cases = Number(opt('cases', 1000));
  const sims = Number(opt('sims', 2000));
  const out = opt('out', mode === 'calib' ? 'MC-calib2' : 'MC-exam1');
  const only = opt('only', null)?.split(',');
  const methods = opt('methods', 'M0,M1,M2').split(',');
  const pairsOnly = opt('pairs', null)?.split(',').map((s) => s.split('x').map(Number));
  const firstCase = mode === 'calib' ? 1 : Number(opt('first', 1000001));
  const tasks = [];
  for (const g of [...REQUIRED, 'G8']) for (const mu of MUS) for (const [n, H] of PAIRS) tasks.push({ g, mu, n, H, cases, sims, firstCase, methods });
  for (const K of [1, 10, 100, 1000]) for (const n of [252, 504]) tasks.push({ g: 'G9', mu: K, n, H: 126, cases, sims, firstCase, methods });
  const todo = tasks
    .filter((t) => !only || only.includes(t.g))
    .filter((t) => !pairsOnly || pairsOnly.some(([n, H]) => n === t.n && H === t.H))
    .sort((a, b) => b.n * 3 + b.H - (a.n * 3 + a.H));
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
  fs.writeFileSync(path.join(HERE, 'results', `REPORT-${out}.md`), report(sortCells(results), out, timingNow()));
  console.log(`escrito bench/results/REPORT-${out}.md`);
}
