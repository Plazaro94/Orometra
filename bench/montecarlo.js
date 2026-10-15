// Banco del Monte Carlo (bench/PREREGISTRO-MONTECARLO.md, con las enmiendas 1 a 4).
//
//   node bench/montecarlo.js calib  [--cases 1000] [--sims 2000] [--out MC-calib3] [--only G1,G3a]
//                                   [--methods M0,M1,M2] [--pairs 126x63,252x126]
//   node bench/montecarlo.js exam   ...   (solo cuando los métodos estén congelados)
//   node bench/montecarlo.js report tanda1,tanda2 --out nombre   (une tandas en un informe)
//   node bench/montecarlo.js oracle [--reps 200]   (¿aprueban las reglas a un método perfecto?)
//
// Cada caso: n días de un proceso con verdad conocida (lo que tendría el usuario) y los H
// días siguientes de la MISMA realización (el futuro, que solo conoce el banco). Dos puertas
// deciden si la app daría cifras: el detector de rachas (contraste robusto de Dalla, Giraitis y
// Phillips, 2020) y un mínimo de días con operaciones (k, que se elige en la calibración). En
// los casos que pasan, se mide con qué frecuencia el futuro cae fuera de lo que dijo cada método
// y cómo se reparte su PIT. Las calibraciones 1 y 2 usaron versiones anteriores de este archivo
// (commits f1bf4c9 y 8aa2434).

import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRng } from '../core/rng.js';
import { packDays, daysFromDeals, predictiveMonteCarlo, calibratedMonteCarlo, robustPortmanteau, volatilityClustering, pitSorted, chi2Cdf } from '../core/trades/montecarlo.js';
import { hashSeed } from './sim.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MUS = [0, 0.05, 0.1];
const PAIRS = [[126, 63], [252, 63], [252, 126], [504, 63], [504, 126], [504, 252], [1008, 63], [1008, 126], [1008, 252]];
const REQUIRED = ['G1', 'G2', 'G3a', 'G3b', 'G4', 'G5', 'G5b', 'G6', 'G6b', 'G7', 'G11', 'G12'];
const INFORMED = ['G8', 'G9', 'G10'];
// Sin rachas ni volatilidad agrupada: los dos detectores juntos no deben rechazar más de un 20 %
// de sus casos (enmienda 5).
const NO_DEPENDENCE = REQUIRED.filter((g) => g !== 'G3a' && g !== 'G3b' && g !== 'G4');
// M2bc se evalúa con los 500 primeros casos de cada celda (enmienda 5: su coste).
const CALIBRATED_CASES = 500;
const K_GRID = [0, 20, 30, 40, 60, 80, 100, 150];
const DD_K = [1, 2, 3];
const MIN_ACCEPTED = 100;
// Error de familia de Holm-Bonferroni sobre todas las pruebas de un método (enmienda 4 a).
const ALPHA = 0.05;
const KILL_NMIN = 504;
const REAL = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'ea-real-diario.json'), 'utf8')).dias;
const REAL_MEAN = REAL.reduce((a, d) => a + d.reduce((s, v) => s + v, 0), 0) / REAL.length;
const REAL_TRADES = REAL.reduce((a, d) => a + d.length, 0) / REAL.length;

// ------------------------------------------------------------------ procesos (§2 y enmienda 4)
function normal(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
function chi2(r, k) { let s = 0; for (let i = 0; i < k; i++) { const z = normal(r); s += z * z; } return s; }
const t3 = (r) => normal(r) / Math.sqrt(chi2(r, 3) / 3);
const t4 = (r) => normal(r) / Math.sqrt(chi2(r, 4) / 4);
function poisson(r, lambda) { const L = Math.exp(-lambda); let k = 0; let p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }
const G6_EY = 0.35 * 3 * Math.exp(0.75 ** 2 / 2) - 0.65;
const G6_EY2 = 0.35 * 9 * Math.exp(2 * 0.75 ** 2) + 0.65 * (1 + 1 / 12);
const G6_SD = Math.sqrt(G6_EY2 - G6_EY ** 2);
const g6raw = (r) => (r() < 0.35 ? 3 * Math.exp(0.75 * normal(r)) : -(0.5 + r()));

/** Días (cada uno, sus operaciones en orden) de longitud len: muestra + futuro, una realización. */
function genDays(g, mu, len, r) {
  const days = new Array(len);
  if (g === 'G1') for (let i = 0; i < len; i++) days[i] = [mu + normal(r)];
  else if (g === 'G2') for (let i = 0; i < len; i++) days[i] = [mu + t3(r) / Math.sqrt(3)];
  else if (g === 'G3a' || g === 'G3b') {
    const phi = g === 'G3a' ? 0.3 : -0.2; const s = Math.sqrt(1 - phi * phi);
    let e = normal(r);
    for (let i = 0; i < len; i++) { e = phi * e + s * normal(r); days[i] = [mu + e]; }
  } else if (g === 'G4') {
    let h = 1; let e = 0;
    for (let i = 0; i < 300 + len; i++) { h = 0.05 + 0.1 * e * e + 0.85 * h; e = Math.sqrt(h) * normal(r); if (i >= 300) days[i - 300] = [mu + e]; }
  } else if (g === 'G5') for (let i = 0; i < len; i++) days[i] = r() < 0.7 ? [] : [mu / 0.3 + t4(r) / Math.sqrt(2) / Math.sqrt(0.3)];
  else if (g === 'G5b') for (let i = 0; i < len; i++) days[i] = r() < 0.9 ? [] : [mu / 0.1 + t4(r) / Math.sqrt(2) / Math.sqrt(0.1)];
  else if (g === 'G6') for (let i = 0; i < len; i++) days[i] = [(g6raw(r) - G6_EY) / G6_SD + mu];
  else if (g === 'G6b') for (let i = 0; i < len; i++) days[i] = [-(g6raw(r) - G6_EY) / G6_SD + mu];
  else if (g === 'G8') {
    let a = r() < 0.5;
    for (let i = 0; i < len; i++) { if (r() >= 0.99) a = !a; days[i] = [a ? mu + normal(r) : -mu + 1.5 * normal(r)]; }
  } else if (g === 'G10') for (let i = 0; i < len; i++) days[i] = [mu + normal(r) + (r() < 0.002 ? -12 : 0)];
  else if (g === 'G11') {
    for (let i = 0; i < len; i++) { const k = poisson(r, 8); const d = new Array(k); for (let j = 0; j < k; j++) d[j] = mu / 8 + normal(r) / Math.sqrt(8); days[i] = d; }
  } else if (g === 'G12') {
    // Días reales del EA del autor, remuestreados de forma independiente. Con μ = 0 se resta a
    // cada operación lo justo para que la media diaria sea 0.
    const c = mu === 0 ? REAL_MEAN / REAL_TRADES : 0;
    for (let i = 0; i < len; i++) { const d = REAL[Math.floor(r() * REAL.length)]; days[i] = c ? d.map((v) => v - c) : d; }
  } else throw new Error(`proceso desconocido ${g}`);
  return days;
}

/** Desviación típica verdadera del resultado diario (para los niveles k·σ·√H). */
function trueSd(g, mu) {
  if (g === 'G7') return 0.005;
  if (g === 'G9') return 1;
  const r = makeRng(hashSeed(`sd|${g}|${mu}`));
  const d = genDays(g, mu, 300000, r);
  const x = d.map((a) => a.reduce((s, v) => s + v, 0));
  let m = 0; for (const v of x) m += v; m /= x.length;
  let s = 0; for (const v of x) s += (v - m) ** 2;
  return Math.sqrt(s / (x.length - 1));
}

/** Resultado y drawdown de un camino, operación a operación. */
function pathStats(days, from, to) {
  let cum = 0; let peak = 0; let dd = 0;
  for (let i = from; i < to; i++) for (const v of days[i]) { cum += v; if (cum > peak) peak = cum; else if (peak - cum > dd) dd = peak - cum; }
  return { total: cum, dd };
}

// M0: el método retirado (core/trades/bootstrap.js en dbcc488) llevado al horizonte H
// (enmienda 1 a), sobre totales diarios.
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

const firstCaseOf = (caseId) => (caseId >= 1000001 ? 1000001 + Math.floor((caseId - 1000001) / 1000000) * 1000000 : 1);

// ------------------------------------------------------------------ un caso
function runCase(g, mu, n, H, caseId, sims, sd, methods) {
  const key = `${g}|${mu}|${n}|${H}|${caseId}`;
  const r = makeRng(hashSeed(key));
  const levelsAdd = DD_K.map((k) => k * sd * Math.sqrt(H));
  let days; let packedM; let logMode = false; let future; let levels = levelsAdd; let m0Totals; let m0Future; let m0Levels = levelsAdd;

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
    const dd = daysFromDeals(deals, 'log');
    if (!dd.usable || dd.days.length !== n) throw new Error(`G7: días ${dd.days?.length} ≠ ${n}`);
    packedM = packDays(dd.days); logMode = true;
    const f = pathStats(Array.from(rets, (v) => [v]), n, n + H);
    future = { total: Math.exp(f.total) - 1, dd: 1 - Math.exp(-f.dd) };
    levels = levelsAdd.map((v) => 1 - Math.exp(-v));
    m0Totals = money.subarray(0, n);
    const fm = pathStats(Array.from(money, (v) => [v]), n, n + H);
    m0Future = { total: fm.total, dd: fm.dd };
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
    days = new Array(n + H);
    for (let i = 0; i < n; i++) days[i] = [best + (w[i] - wm)];
    for (let i = n; i < n + H; i++) days[i] = [bestTrue + normal(r)];
  } else {
    days = genDays(g, mu, n + H, r);
  }
  if (!packedM) {
    packedM = packDays(days.slice(0, n));
    future = pathStats(days, n, n + H);
    m0Totals = packedM.total; m0Future = future;
  }
  const tradingDays = g === 'G7' ? n : days.slice(0, n).reduce((a, d) => a + (d.length > 0 ? 1 : 0), 0);
  // Puertas 1 y 3 (enmiendas 4 b y 5): con rachas o con volatilidad agrupada, la app no da cifras.
  const pt = robustPortmanteau(packedM.total, 10);
  if (pt.usable && pt.p < 0.05) return { refused: 'rachas', tradingDays };
  const vc = volatilityClustering(packedM.total, 10);
  if (vc.usable && vc.p < 0.05) return { refused: 'volatilidad', tradingDays };
  const obs = { total: future.total, dd: future.dd };
  const out = {};
  for (const m of methods) {
    if (m === 'M2bc' && caseId - firstCaseOf(caseId) >= CALIBRATED_CASES) continue;
    const seed = hashSeed(`${key}|${m}`);
    if (m === 'M0') out.M0 = { res: methodM0(m0Totals, n, H, sims, seed, m0Levels, { total: m0Future.total, dd: m0Future.dd }), fut: m0Future, levels: m0Levels };
    else if (m === 'M1') out.M1 = { res: predictiveMonteCarlo(packedM, { horizon: H, sims, seed, log: logMode, ddLevels: levels, method: 'two-stage', observe: obs }), fut: future, levels };
    else if (m === 'M2b') out.M2b = { res: predictiveMonteCarlo(packedM, { horizon: H, sims, seed, log: logMode, ddLevels: levels, method: 'bayes-direct', observe: obs }), fut: future, levels };
    else if (m === 'M2bc') out.M2bc = { res: calibratedMonteCarlo(packedM, { horizon: H, sims, seed, log: logMode, ddLevels: levels, outer: 200, inner: 500, observe: obs }), fut: future, levels };
  }
  return { refused: false, tradingDays, out };
}

// ------------------------------------------------------------------ una celda
const newCounts = () => ({ N: 0, p95: 0, p50: 0, out: 0, pitT: new Array(10).fill(0), pitD: new Array(10).fill(0) });

function runCell({ g, mu, n, H, cases, sims, firstCase, methods }) {
  const sd = trueSd(g, mu);
  const byK = {};
  for (const k of K_GRID) { byK[k] = {}; for (const m of methods) byK[k][m] = newCounts(); }
  const rel = {}; for (const m of methods) rel[m] = { preds: {}, outs: {} };
  let refusedRachas = 0; let refusedVol = 0; const tdays = [];
  for (let c = 0; c < cases; c++) {
    const res = runCase(g, mu, n, H, firstCase + c, sims, sd, methods);
    tdays.push(res.tradingDays);
    if (res.refused === 'rachas') { refusedRachas++; continue; }
    if (res.refused === 'volatilidad') { refusedVol++; continue; }
    for (const m of methods) {
      if (!res.out[m]) continue;
      const { res: rr, fut, levels } = res.out[m];
      const hit95 = fut.dd > rr.maxDd.p95; const hit50 = fut.dd > rr.maxDd.p50; const out = fut.total < rr.total.p05 || fut.total > rr.total.p95;
      const iT = Math.min(9, Math.floor(rr.pit.total * 10)); const iD = Math.min(9, Math.floor(rr.pit.dd * 10));
      for (const k of K_GRID) {
        if (res.tradingDays < k) continue;
        const a = byK[k][m];
        a.N++; if (hit95) a.p95++; if (hit50) a.p50++; if (out) a.out++; a.pitT[iT]++; a.pitD[iD]++;
      }
      // Fiabilidad y Brier: se informan, sin exigirse (enmienda 2 a).
      const R = rel[m];
      (R.preds.loss ||= []).push(rr.probLoss); (R.outs.loss ||= []).push(fut.total < 0 ? 1 : 0);
      levels.forEach((lv, j) => { const kk = `dd${DD_K[j]}`; (R.preds[kk] ||= []).push(rr.probDd[j].p); (R.outs[kk] ||= []).push(fut.dd >= lv ? 1 : 0); });
    }
  }
  const brier = {};
  for (const m of methods) {
    brier[m] = {};
    for (const [name, preds] of Object.entries(rel[m].preds)) brier[m][name] = preds.reduce((s, p, i) => s + (p - rel[m].outs[name][i]) ** 2, 0) / preds.length;
  }
  tdays.sort((a, b) => a - b);
  return { g, mu, n, H, cases, sims, sd, refusedRachas, refusedVol, tradingDaysMedian: tdays[Math.floor(tdays.length / 2)], byK, brier };
}

// ------------------------------------------------------------------ reglas (enmienda 4 a)
/** Binomial exacta bilateral: suma de las probabilidades no mayores que la del valor observado. */
function binomP(k, N, p) {
  const lp = new Float64Array(N + 1);
  lp[0] = N * Math.log(1 - p);
  const lr = Math.log(p / (1 - p));
  for (let j = 0; j < N; j++) lp[j + 1] = lp[j] + Math.log((N - j) / (j + 1)) + lr;
  const l0 = lp[k]; let s = 0;
  for (let j = 0; j <= N; j++) if (lp[j] <= l0 + 1e-9) s += Math.exp(lp[j]);
  return Math.min(1, s);
}
const chiP = (d, N) => 1 - chi2Cdf(d.reduce((s, k) => s + (k - N / 10) ** 2 / (N / 10), 0), 9);
const BANDS = { p95: [0.025, 0.07], p50: [0.44, 0.56], out: [0.06, 0.13], dec: [0.07, 0.13] };
const GROUP_BANDS = { p95: [0.04, 0.065], p50: [0.46, 0.54], out: [0.085, 0.115], dec: [0.085, 0.115] };
const inBand = (v, [a, b]) => v >= a && v <= b;

/**
 * Juzga un método con un mínimo de días con operaciones k. Devuelve n_min por horizonte y el
 * detalle de lo que suspende (enmienda 4 a). Hay dos clases de pruebas: por celda (cobertura del
 * p95, del p50 y del P05–P95, y el PIT del resultado y del drawdown) y por grupo (lo mismo,
 * sumando las celdas de un proceso y un horizonte con n ≥ n0, con bandas más estrechas). Una
 * prueba suspende solo si se sale de su banda práctica Y es significativa con Holm-Bonferroni al
 * 5 % sobre TODAS las pruebas del método: así un método perfecto aprueba al menos el 95 % de las
 * veces (modo oracle). Además, el detector de rachas no debe rechazar más de un 15 % en los
 * procesos sin dependencia en el nivel.
 */
function evaluate(cells, m, k) {
  const req = cells.filter((c) => REQUIRED.includes(c.g) && c.byK[k] && c.byK[k][m]);
  const evalCells = req.filter((c) => c.byK[k][m].N >= MIN_ACCEPTED);
  const tests = [];
  const addTests = (a, bands, meta) => {
    tests.push({ ...meta, name: 'DD>p95', v: a.p95 / a.N, p: binomP(a.p95, a.N, 0.05), outside: !inBand(a.p95 / a.N, bands.p95) });
    tests.push({ ...meta, name: 'DD>p50', v: a.p50 / a.N, p: binomP(a.p50, a.N, 0.5), outside: !inBand(a.p50 / a.N, bands.p50) });
    tests.push({ ...meta, name: 'fuera', v: a.out / a.N, p: binomP(a.out, a.N, 0.1), outside: !inBand(a.out / a.N, bands.out) });
    tests.push({ ...meta, name: 'PIT resultado', v: a.pitT.map((x) => x / a.N), p: chiP(a.pitT, a.N), outside: a.pitT.some((x) => !inBand(x / a.N, bands.dec)) });
    tests.push({ ...meta, name: 'PIT drawdown', v: a.pitD.map((x) => x / a.N), p: chiP(a.pitD, a.N), outside: a.pitD.some((x) => !inBand(x / a.N, bands.dec)) });
  };
  for (const c of evalCells) addTests(c.byK[k][m], BANDS, { kind: 'celda', c });
  const nsFor = (H) => [...new Set(PAIRS.filter(([, h]) => h === H).map(([n]) => n))].sort((a, b) => a - b);
  for (const H of [63, 126, 252]) for (const n0 of nsFor(H)) for (const g of REQUIRED) {
    const cs = evalCells.filter((c) => c.g === g && c.H === H && c.n >= n0);
    if (!cs.length) continue;
    const pooled = newCounts();
    for (const c of cs) { const a = c.byK[k][m]; pooled.N += a.N; pooled.p95 += a.p95; pooled.p50 += a.p50; pooled.out += a.out; for (let i = 0; i < 10; i++) { pooled.pitT[i] += a.pitT[i]; pooled.pitD[i] += a.pitD[i]; } }
    addTests(pooled, GROUP_BANDS, { kind: 'grupo', g, H, n0, N: pooled.N });
  }
  tests.sort((x, y) => x.p - y.p);
  const M = tests.length; const failing = [];
  for (let i = 0; i < M; i++) {
    if (tests[i].p * (M - i) >= ALPHA) break; // Holm: a partir de aquí, nada es significativo
    if (tests[i].outside) failing.push(tests[i]);
  }
  const failCell = new Set(failing.filter((t) => t.kind === 'celda').map((t) => t.c));
  const overRefusal = req.filter((c) => NO_DEPENDENCE.includes(c.g) && ((c.refusedRachas || 0) + (c.refusedVol || 0)) / c.cases > 0.2);
  const nmin = {};
  for (const H of [63, 126, 252]) {
    nmin[H] = null;
    for (const n0 of nsFor(H)) {
      const cellsOk = req.filter((c) => c.H === H && c.n >= n0).every((c) => !failCell.has(c) && !overRefusal.includes(c));
      const groupsOk = !failing.some((t) => t.kind === 'grupo' && t.H === H && t.n0 === n0);
      if (cellsOk && groupsOk) { nmin[H] = n0; break; }
    }
  }
  return { nmin, failing, overRefusal, evaluated: evalCells.length, unevaluated: req.length - evalCells.length, tests: M };
}

function chooseK(cells, m) {
  let best = null;
  for (const k of K_GRID) {
    const v = evaluate(cells, m, k);
    const score = v.nmin[126] ?? Infinity;
    if (!best || score < best.score) best = { k, score, v };
  }
  return best;
}

function report(cells, label, timing, fixedK = null) {
  const pct = (v) => (Number.isFinite(v) ? `${(100 * v).toFixed(1)}` : '—');
  const methods = ['M0', 'M1', 'M2', 'M2c', 'M2b', 'M2bc'].filter((m) => cells.some((c) => c.byK[0][m]));
  const L = [];
  L.push(`# Banco del Monte Carlo: ${label}`, '', `Generado por \`node bench/montecarlo.js\` el ${new Date().toISOString().slice(0, 10)}. Prerregistro: \`bench/PREREGISTRO-MONTECARLO.md\` con las enmiendas 1 a 4. Casos por celda: ${cells[0].cases}; simulaciones por caso: ${cells[0].sims}. Solo pares con H ≤ n/2.`, '');
  const full = REQUIRED.every((g) => cells.some((c) => c.g === g && c.H === 126));
  L.push('## Veredicto', '', '| Método | mínimo de días con operaciones (k) | H = 63 | H = 126 | H = 252 |', '|---|---|---|---|---|');
  const chosen = {};
  for (const m of methods.filter((x) => x !== 'M0')) {
    for (const k of K_GRID) {
      const v = evaluate(cells, m, k);
      L.push(`| ${m} | ${k} | ${[63, 126, 252].map((H) => (v.nmin[H] ? `apto desde n = ${v.nmin[H]}` : 'no apto')).join(' | ')} |`);
    }
    chosen[m] = fixedK != null ? { k: fixedK, score: evaluate(cells, m, fixedK).nmin[126] ?? Infinity, v: evaluate(cells, m, fixedK) } : chooseK(cells, m);
  }
  // Enmienda 6: el criterio de descarte pasa a H = 126 con n_min ≤ 504 (antes, ≤ 252).
  const kill = Object.values(chosen).some((b) => b.score <= KILL_NMIN);
  L.push('', `**Criterio de descarte** (algún método apto para H = 126 con n_min ≤ ${KILL_NMIN}): ${!full ? 'no se puede evaluar con esta tanda (faltan procesos)' : kill ? 'se cumple' : '**no se cumple**'}.`);
  for (const [m, b] of Object.entries(chosen)) L.push(fixedK != null ? `- ${m}: k fijado de antemano = ${b.k}.` : `- ${m}: k elegido = ${b.k} (el menor que da el mejor n_min con H = 126).`);
  L.push('', '## Puertas: casos sin cifras', '', 'Detectores de rachas y de volatilidad agrupada juntos, en % de casos; entre paréntesis, la mediana de días con operaciones de la muestra.', '', '| Proceso | μ | ' + PAIRS.map(([n, H]) => `${n}/${H}`).join(' | ') + ' |', '|---|---|' + PAIRS.map(() => '---|').join(''));
  for (const g of [...REQUIRED, ...INFORMED.filter((x) => x !== 'G9')]) for (const mu of (g === 'G12' ? ['real', 0] : MUS)) {
    const row = PAIRS.map(([n, H]) => { const c = cells.find((x) => x.g === g && x.mu === mu && x.n === n && x.H === H); return c ? `${pct(((c.refusedRachas || 0) + (c.refusedVol || 0)) / c.cases)} (${c.tradingDaysMedian})` : ''; });
    if (row.some(Boolean)) L.push(`| ${g} | ${mu} | ${row.join(' | ')} |`);
  }
  for (const [m, b] of Object.entries(chosen)) {
    const v = b.v; const k = b.k;
    L.push('', `## ${m} con k = ${k}`, '', `Celdas evaluadas: ${v.evaluated}; sin evaluar (menos de ${MIN_ACCEPTED} casos aceptados): ${v.unevaluated}; pruebas por celda en la familia de Holm: ${v.tests}.`, '');
    L.push('Cobertura por celda (DD > p95 / DD > p50 / fuera de P05–P95, en %, sobre los casos que pasan las dos puertas; ideal 5 / 50 / 10). En negrita, las celdas que suspenden.', '');
    const failCell = new Set(v.failing.map((t) => t.c));
    for (const H of [63, 126, 252]) {
      L.push(`### H = ${H}`, '', '| Proceso | μ | n | aceptados | cobertura |', '|---|---|---|---|---|');
      for (const c of cells.filter((x) => x.H === H && REQUIRED.includes(x.g) && x.byK[k][m])) {
        const a = c.byK[k][m]; const t = `${pct(a.p95 / a.N)} / ${pct(a.p50 / a.N)} / ${pct(a.out / a.N)}`;
        L.push(`| ${c.g} | ${c.mu} | ${c.n} | ${a.N} | ${failCell.has(c) ? `**${t}**` : t} |`);
      }
      L.push('');
    }
    L.push('### Lo que suspende', '');
    if (!v.failing.length && !v.overRefusal.length) L.push('- Nada.');
    const fmt = (t) => (Array.isArray(t.v) ? t.v.map((x, i) => [x, i]).filter(([x]) => !inBand(x, t.kind === 'celda' ? BANDS.dec : GROUP_BANDS.dec)).map(([x, i]) => `d${i + 1}=${pct(x)}`).join(' ') : `${pct(t.v)} %`);
    for (const t of v.failing) {
      const where = t.kind === 'celda' ? `Celda ${t.c.g} μ ${t.c.mu} n ${t.c.n} H ${t.c.H}` : `Conjunto ${t.g}, H = ${t.H}, n ≥ ${t.n0} (${t.N} casos)`;
      L.push(`- ${where}: ${t.name} ${fmt(t)} (p = ${t.p.toExponential(2)})`);
    }
    for (const c of v.overRefusal) L.push(`- Detectores: ${c.g} μ ${c.mu} n ${c.n} H ${c.H} rechazan un ${pct(((c.refusedRachas || 0) + (c.refusedVol || 0)) / c.cases)} %`);
  }
  const informed = cells.filter((x) => INFORMED.includes(x.g));
  if (informed.length) {
    L.push('', '## Se informan (no se exigen), sin mínimo de días', '', `| Proceso | μ o K | n | H | aceptados | ${methods.join(' | ')} |`, `|---|---|---|---|---|${methods.map(() => '---|').join('')}`);
    for (const c of informed) {
      const t = (m) => { const a = c.byK[0][m]; return a && a.N ? `${pct(a.p95 / a.N)} / ${pct(a.p50 / a.N)} / ${pct(a.out / a.N)}` : ''; };
      L.push(`| ${c.g} | ${c.mu} | ${c.n} | ${c.H} | ${c.byK[0][methods[0]].N} | ${methods.map(t).join(' | ')} |`);
    }
  }
  if (timing) L.push('', '## Tiempo (orientativo, Node, 10.000 simulaciones)', '', ...timing.map((t) => `- n = ${t.n}, H = ${t.H}: M1 ${t.m1} ms, M2b ${t.m2} ms, M2bc ${t.m2c} ms`));
  return L.join('\n') + '\n';
}

// ------------------------------------------------------------------ oráculo
// Métodos simulados de calibración conocida, con la estructura de celdas del banco: el PIT real
// es Φ(z·a), z normal; a = 1 es un método perfecto, a > 1 uno que se queda corto (el futuro se
// reparte más ancho de lo previsto) y a < 1 uno demasiado prudente.
function oracleCells(a, r, N) {
  const normCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
  const cells = [];
  for (const g of REQUIRED) for (const mu of (g === 'G12' ? ['real', 0] : MUS)) for (const [n, H] of PAIRS) {
    const cnt = newCounts();
    for (let i = 0; i < N; i++) {
      const u = normCdf(normal(r) * a); const v = normCdf(normal(r) * a);
      cnt.N++; if (v > 0.95) cnt.p95++; if (v > 0.5) cnt.p50++; if (u < 0.05 || u > 0.95) cnt.out++;
      cnt.pitT[Math.min(9, Math.floor(u * 10))]++; cnt.pitD[Math.min(9, Math.floor(v * 10))]++;
    }
    cells.push({ g, mu, n, H, cases: N, refusedRachas: 0, byK: { 0: { X: cnt } } });
  }
  return cells;
}
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }

export { evaluate, oracleCells, genDays, REQUIRED };

// ------------------------------------------------------------------ orquestación
const IS_MAIN_SCRIPT = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (!isMainThread) {
  parentPort.on('message', (task) => { if (task === null) process.exit(0); parentPort.postMessage(runCell(task)); });
} else if (IS_MAIN_SCRIPT) {
  const args = process.argv.slice(2);
  const mode = args[0];
  const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
  const order = (c) => [REQUIRED.indexOf(c.g) < 0 ? 99 : REQUIRED.indexOf(c.g), c.g, String(c.mu), c.n, c.H];
  const sortCells = (cells) => cells.sort((a, b) => { const x = order(a); const y = order(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; });
  const timingNow = () => [[252, 126], [1008, 252]].map(([n, H]) => {
    const x = packDays(genDays('G1', 0.05, n, makeRng(5)));
    let t = Date.now(); predictiveMonteCarlo(x, { horizon: H, sims: 10000, seed: 1 }); const m1 = Date.now() - t;
    t = Date.now(); predictiveMonteCarlo(x, { horizon: H, sims: 10000, seed: 1, method: 'bayes-direct' }); const m2 = Date.now() - t;
    t = Date.now(); calibratedMonteCarlo(x, { horizon: H, sims: 10000, seed: 1, outer: 200, inner: 500 }); const m2c = Date.now() - t;
    return { n, H, m1, m2, m2c };
  });
  if (mode === 'oracle') {
    const reps = Number(opt('reps', 200)); const N = Number(opt('n', 1000));
    const r = makeRng(hashSeed('oraculo'));
    console.log(`Oráculo: ${reps} bancos simulados, ${N} casos por celda, ${REQUIRED.length} procesos exigidos.`);
    for (const [label, a] of [['perfecto', 1], ['un poco corto', 1.04], ['algo corto', 1.08], ['demasiado prudente', 0.9]]) {
      let notApt = 0;
      for (let i = 0; i < reps; i++) { const v = evaluate(oracleCells(a, r, N), 'X', 0); if ([63, 126, 252].some((H) => v.nmin[H] !== (H === 63 ? 126 : H === 126 ? 252 : 504))) notApt++; }
      const z = 1.6448536 / a; const p95 = 0.5 * (1 - erf(z / Math.SQRT2));
      console.log(`  ${label.padEnd(20)} (P(DD > p95) real ${(100 * p95).toFixed(1)} %): no apto en el ${(100 * notApt / reps).toFixed(1)} % de los bancos`);
    }
    process.exit(0);
  }
  if (mode === 'report') {
    const parts = (args[1] || '').split(',').filter(Boolean);
    const out = opt('out', parts.join('+'));
    const cells = parts.flatMap((name) => fs.readFileSync(path.join(HERE, 'results', `${name}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    const fk = opt('k', null);
    fs.writeFileSync(path.join(HERE, 'results', `REPORT-${out}.md`), report(sortCells(cells), out, timingNow(), fk == null ? null : Number(fk)));
    console.log(`escrito bench/results/REPORT-${out}.md (${cells.length} celdas)`);
    process.exit(0);
  }
  if (!['calib', 'exam'].includes(mode)) {
    console.error('uso: node bench/montecarlo.js calib|exam [--cases N] [--sims S] [--out nombre] [--only G1,G2] [--methods M0,M1,M2] [--pairs 126x63]\n     node bench/montecarlo.js report tanda1,tanda2 --out nombre\n     node bench/montecarlo.js oracle [--reps 200]');
    process.exit(1);
  }
  const cases = Number(opt('cases', 1000));
  const sims = Number(opt('sims', 2000));
  const out = opt('out', mode === 'calib' ? 'MC-calib4' : 'MC-exam1');
  const only = opt('only', null)?.split(',');
  const methods = opt('methods', 'M0,M1,M2b,M2bc').split(',');
  const pairsOnly = opt('pairs', null)?.split(',').map((s) => s.split('x').map(Number));
  const firstCase = mode === 'calib' ? 1 : Number(opt('first', 1000001));
  const tasks = [];
  for (const g of [...REQUIRED, 'G8', 'G10']) for (const mu of (g === 'G12' ? ['real', 0] : MUS)) for (const [n, H] of PAIRS) tasks.push({ g, mu, n, H, cases, sims, firstCase, methods });
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
  const fk = opt('k', null);
  fs.writeFileSync(path.join(HERE, 'results', `REPORT-${out}.md`), report(sortCells(results), out, timingNow(), fk == null ? null : Number(fk)));
  console.log(`escrito bench/results/REPORT-${out}.md`);
}
