/**
 * Monte Carlo predictivo sobre las operaciones de un backtest (docs/MONTECARLO.md, sección 5;
 * bench/PREREGISTRO-MONTECARLO.md).
 *
 * POR QUÉ NO ES EL BOOTSTRAP DE SIEMPRE.
 *
 * El bootstrap que enseñaba la app (bootstrap.js) sacaba el futuro de la propia muestra, como
 * si su media fuera la verdadera. Con un futuro de H días, lo que se va a ver tiene la varianza
 * del ruido (Hσ²) MÁS la de no saber la media (H²σ²/n); el plug-in solo ve la primera, y sus
 * rangos se quedaban cortos (con H = n, el resultado caía fuera del P05–P95 un 24,5 % de las
 * veces en teoría, un 26-38 % medido). Aquí cada simulación remuestrea primero un «mundo»
 * posible de n días y saca el futuro de ese mundo: el predictivo bootstrap no paramétrico de
 * Fushiki, Komaki y Aihara (2005). Ellos lo estudian con datos independientes; hacerlo por
 * bloques (bootstrap estacionario de Politis y Romano, 1994) es una ADAPTACIÓN nuestra.
 *
 * Unidad: el día laborable, con sus operaciones en orden. Se remuestrean días enteros (así
 * cuentan los días sin cierres y la frecuencia real), pero el drawdown se mide recorriendo las
 * operaciones de cada día: sumar el día escondía un 6 % del drawdown en un informe real.
 *
 * Nada de esto se enseña en la app hasta que apruebe el banco.
 */

import { makeRng } from '../rng.js';

const DAY = 86400000;
const DAY_RE = /(\d{4})[.\-/](\d{2})[.\-/](\d{2})/;

/**
 * Días laborables con sus operaciones, en el formato compacto que usan las simulaciones.
 *
 * @param {number[][]} days  incrementos de cada día, en orden (un día sin cierres: [])
 * @returns {{n:number, inc:Float64Array, start:Int32Array, total:Float64Array}}
 */
export function packDays(days) {
  const n = days.length;
  const start = new Int32Array(n + 1);
  let m = 0;
  for (let i = 0; i < n; i++) { start[i] = m; m += days[i].length; }
  start[n] = m;
  const inc = new Float64Array(m);
  const total = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let t = 0;
    for (let k = 0; k < days[i].length; k++) { inc[start[i] + k] = days[i][k]; t += days[i][k]; }
    total[i] = t;
  }
  return { n, inc, start, total };
}

/**
 * Agrupa las operaciones del informe por día laborable de cierre, conservando su orden.
 *
 * mode 'money': el resultado neto de cada operación, en la moneda de la cuenta (lote fijo o
 *   riesgo fijo en dinero: el resultado es aditivo).
 * mode 'log': ln(1 + neto / balance antes de la operación), para un lote proporcional al
 *   balance; el balance antes es el que trae el informe tras el cierre menos el neto.
 *
 * Los días laborables sin cierres entre el primero y el último cuentan como días vacíos (igual
 * que dailySeriesFromDeals); un cierre en fin de semana se conserva como su propio día.
 */
export function daysFromDeals(deals, mode = 'money') {
  if (!Array.isArray(deals) || !deals.length) return { usable: false, reason: 'sin_operaciones' };
  const byDay = new Map();
  for (const d of deals) {
    const m = DAY_RE.exec(String(d.time || ''));
    if (!m) return { usable: false, reason: 'fechas_no_reconocidas' };
    const key = `${m[1]}-${m[2]}-${m[3]}`;
    const net = Number.isFinite(d.net) ? d.net : 0;
    let x = net;
    if (mode === 'log') {
      const before = d.balance - net;
      if (!(Number.isFinite(before) && before > 0 && 1 + net / before > 0)) {
        return { usable: false, reason: 'balance_no_valido' };
      }
      x = Math.log(1 + net / before);
    }
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(x);
  }
  const keys = Array.from(byDay.keys()).sort();
  const toUtc = (k) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
  const pad = (v) => String(v).padStart(2, '0');
  const days = [];
  const dates = [];
  for (let t = toUtc(keys[0]); t <= toUtc(keys[keys.length - 1]); t += DAY) {
    const dt = new Date(t);
    const k = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
    const wd = dt.getUTCDay();
    if (byDay.has(k)) { days.push(byDay.get(k)); dates.push(k); } else if (wd !== 0 && wd !== 6) { days.push([]); dates.push(k); }
  }
  return { usable: true, mode, days, dates };
}

/**
 * Longitud media de bloque para el bootstrap estacionario: Politis y White (2004) con la
 * corrección de Patton, Politis y White (2009). Ventana plana trapezoidal; m̂ es el menor
 * entero positivo tras el que Kn autocorrelaciones seguidas no son significativas; si no lo
 * hay, el mayor retardo significativo (la regla que sugiere Politis). Mínimo 1 y máximo
 * min(3√n, n/3).
 */
export function blockLengthPPW(series) {
  const x = Array.from(series).filter(Number.isFinite);
  const n = x.length;
  if (n < 8) return 1;
  const mean = x.reduce((a, v) => a + v, 0) / n;
  const y = x.map((v) => v - mean);
  const acv = (k) => { let s = 0; for (let i = k; i < n; i++) s += y[i] * y[i - k]; return s / n; };
  const g0 = acv(0);
  if (!(g0 > 0)) return 1;
  const kn = Math.max(5, Math.ceil(Math.sqrt(Math.log10(n))));
  const mmax = Math.ceil(Math.sqrt(n)) + kn;
  const bmax = Math.ceil(Math.min(3 * Math.sqrt(n), n / 3));
  const thr = 2 * Math.sqrt(Math.log10(n) / n);
  const rho = [1];
  for (let k = 1; k <= mmax + kn; k++) rho.push(k < n ? acv(k) / g0 : 0);
  let mhat = -1;
  for (let m = 1; m <= mmax; m++) {
    let ok = true;
    for (let k = 1; k <= kn; k++) if (Math.abs(rho[m + k]) >= thr) { ok = false; break; }
    if (ok) { mhat = m; break; }
  }
  if (mhat < 0) {
    mhat = 1;
    for (let k = 1; k <= mmax; k++) if (Math.abs(rho[k]) >= thr) mhat = k;
  }
  const M = Math.min(2 * mhat, mmax);
  const lam = (s) => { const a = Math.abs(s); return a < 0.5 ? 1 : a <= 1 ? 2 * (1 - a) : 0; };
  let G = 0; let g = g0;
  for (let k = 1; k <= M; k++) {
    const w = lam(k / M) * acv(k);
    G += 2 * k * w;
    g += 2 * w;
  }
  const D = 2 * g * g;
  if (!(D > 0) || !(G !== 0)) return 1;
  const b = Math.cbrt((2 * G * G) / D) * Math.cbrt(n);
  return Math.min(bmax, Math.max(1, b));
}

function quantileSorted(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
}

/**
 * Distribución predictiva del resultado y del drawdown en los próximos H días.
 *
 * @param {{n:number, inc:Float64Array, start:Int32Array, total:Float64Array}} packed  packDays()
 * @param {object} opts
 *   horizon   H en días laborables (H ≤ n; más allá habría que inventar)
 *   method    'two-stage' (M1) | 'bayes' (M2: etapa 1 con pesos de Dirichlet sobre los inicios
 *             de bloque, el bootstrap bayesiano de Rubin, 1981, hecho por bloques)
 *   block     longitud media de bloque; por defecto blockLengthPPW de los totales diarios
 *   sims      simulaciones (por defecto 10.000)
 *   seed      semilla (determinismo)
 *   log       true si los incrementos son log-rendimientos (drawdown relativo)
 *   ddLevels  niveles de drawdown para P(drawdown ≥ nivel)
 *   observe   { total, dd }: lo que de verdad pasó (banco); devuelve su PIT, u = F̂(y)
 *   keepSamples  devuelve las simulaciones ordenadas (las usa calibratedMonteCarlo)
 */
export function predictiveMonteCarlo(packed, opts = {}) {
  const { n, inc, start } = packed;
  const H = Math.round(opts.horizon ?? n);
  if (!(n >= 2) || !(H >= 1)) return { usable: false, reason: 'insuficiente' };
  if (H > n) return { usable: false, reason: 'horizonte_mayor_que_muestra' };
  const method = opts.method || 'two-stage';
  const sims = opts.sims ?? 10000;
  const seed = opts.seed ?? 20261014;
  const block = opts.block ?? blockLengthPPW(packed.total);
  const p = 1 / Math.max(1, block);
  const rng = makeRng(seed);
  const levels = opts.ddLevels || [];
  const totals = new Float64Array(sims);
  const dds = new Float64Array(sims);
  const ddHits = new Float64Array(levels.length);
  let losses = 0;
  const world = new Int32Array(n);
  // M2: los inicios de bloque salen de una categórica con pesos Dirichlet(1, …, 1) sobre los n
  // días, sorteados de nuevo en cada simulación. No hace falta calcular los pesos: sacar inicios
  // sucesivos de esa categórica equivale exactamente a la urna de Pólya (Blackwell y MacQueen,
  // 1973): el inicio k-ésimo es un día nuevo al azar con probabilidad n / (n + k) o repite uno
  // de los k ya sacados, cada uno con probabilidad 1 / (n + k).
  const drawn = method === 'bayes' ? new Int32Array(n) : null;
  let k = 0;
  const drawStart = method === 'bayes'
    ? () => {
      const u = rng() * (n + k);
      const j = u < n ? Math.floor(u) : drawn[Math.floor(u - n)];
      drawn[k++] = j;
      return j;
    }
    : () => Math.floor(rng() * n);

  for (let s = 0; s < sims; s++) {
    // Etapa 1: un mundo plausible de n días.
    k = 0;
    let pos = drawStart();
    for (let i = 0; i < n; i++) {
      if (i > 0 && rng() < p) pos = drawStart();
      world[i] = pos;
      pos = pos + 1 === n ? 0 : pos + 1;
    }
    // Etapa 2: el futuro de H días, sacado de ese mundo.
    let wpos = Math.floor(rng() * n);
    let cum = 0; let peak = 0; let dd = 0;
    for (let t = 0; t < H; t++) {
      if (t > 0 && rng() < p) wpos = Math.floor(rng() * n);
      const d = world[wpos];
      for (let m = start[d]; m < start[d + 1]; m++) {
        cum += inc[m];
        if (cum > peak) peak = cum;
        else if (peak - cum > dd) dd = peak - cum;
      }
      wpos = wpos + 1 === n ? 0 : wpos + 1;
    }
    const ddOut = opts.log ? 1 - Math.exp(-dd) : dd;
    totals[s] = opts.log ? Math.exp(cum) - 1 : cum;
    dds[s] = ddOut;
    if (cum < 0) losses++;
    for (let j = 0; j < levels.length; j++) if (ddOut >= levels[j]) ddHits[j]++;
  }
  totals.sort();
  dds.sort();
  const out = {
    usable: true,
    method: method === 'bayes' ? 'bayesian_block_bootstrap_predictive' : 'two_stage_block_bootstrap_predictive',
    adaptation: 'Fushiki, Komaki & Aihara (2005) predictive bootstrap, made block-wise (Politis & Romano 1994)',
    seed,
    sims,
    horizon: H,
    n,
    block,
    log: Boolean(opts.log),
    total: { p05: quantileSorted(totals, 0.05), p50: quantileSorted(totals, 0.5), p95: quantileSorted(totals, 0.95) },
    maxDd: { p50: quantileSorted(dds, 0.5), p95: quantileSorted(dds, 0.95) },
    probLoss: losses / sims,
    probDd: levels.map((level, j) => ({ level, p: ddHits[j] / sims })),
  };
  if (opts.observe) {
    out.pit = { total: pitSorted(totals, opts.observe.total, rng()), dd: pitSorted(dds, opts.observe.dd, rng()) };
  }
  if (opts.keepSamples) out.samples = { totals, dds };
  return out;
}

/** Cuántos valores de un array ordenado son < y (strict) o ≤ y. */
function countBelow(sorted, y, strict) {
  let lo = 0; let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (strict ? sorted[mid] < y : sorted[mid] <= y) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/**
 * PIT aleatorizado (Gneiting, Balabdaoui y Raftery, 2007): u = F̂(y⁻) + V·(F̂(y) − F̂(y⁻)), con
 * V uniforme. Si la predicción está bien calibrada, u es uniforme entre 0 y 1. Lo de V reparte
 * los empates (un drawdown 0 que aparece en muchas simulaciones, por ejemplo).
 */
export function pitSorted(sorted, y, v) {
  const n = sorted.length;
  const below = countBelow(sorted, y, true);
  const upTo = countBelow(sorted, y, false);
  return (below + v * (upTo - below)) / n;
}

// ------------------------------------------------------------------ detector de rachas

function lnGamma(z) {
  // Lanczos (g = 7, n = 9): error relativo < 1e-13 para z > 0.
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  const x = z - 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Gamma incompleta regularizada inferior P(a, x): serie si x < a + 1, fracción continua si no. */
export function gammaP(a, x) {
  if (!(x > 0)) return 0;
  const gln = lnGamma(a);
  if (x < a + 1) {
    let sum = 1 / a; let del = sum; let ap = a;
    for (let i = 0; i < 1000; i++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-15) break; }
    return sum * Math.exp(-x + a * Math.log(x) - gln);
  }
  const tiny = 1e-300;
  let b = x + 1 - a; let c = 1 / tiny; let d = 1 / b; let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - gln) * h;
}

/** Función de distribución de una chi-cuadrado con k grados de libertad. */
export function chi2Cdf(x, k) { return gammaP(k / 2, x / 2); }

/**
 * Contraste de Ljung y Box (1978): Q = n(n+2) Σ ρ̂ₖ² / (n − k), k = 1..m; bajo independencia,
 * Q ~ χ²(m). Con p < 0,05 la serie va en rachas (o revierte) más de lo que el método puede
 * representar, y la app no da cifras (bench/PREREGISTRO-MONTECARLO.md, enmienda 2).
 */
export function ljungBox(series, lags = 10) {
  const x = Array.from(series).filter(Number.isFinite);
  const n = x.length;
  const m = Math.min(lags, n - 2);
  if (m < 1) return { usable: false };
  const mean = x.reduce((a, v) => a + v, 0) / n;
  let g0 = 0; for (const v of x) g0 += (v - mean) ** 2;
  if (!(g0 > 0)) return { usable: true, q: 0, lags: m, p: 1 };
  let q = 0;
  for (let k = 1; k <= m; k++) {
    let s = 0; for (let i = k; i < n; i++) s += (x[i] - mean) * (x[i - k] - mean);
    const rho = s / g0;
    q += (rho * rho) / (n - k);
  }
  q *= n * (n + 2);
  return { usable: true, q, lags: m, p: 1 - chi2Cdf(q, m) };
}

// ------------------------------------------------------------------ M2c: nivel calibrado

/** Días remuestreados por índice, en el formato compacto. */
function packedFromIndices(packed, idx) {
  const days = Array.from(idx, (d) => Array.from(packed.inc.subarray(packed.start[d], packed.start[d + 1])));
  return packDays(days);
}

function stationaryIndices(rng, n, len, p) {
  const out = new Int32Array(len);
  let pos = Math.floor(rng() * n);
  for (let i = 0; i < len; i++) {
    if (i > 0 && rng() < p) pos = Math.floor(rng() * n);
    out[i] = pos;
    pos = pos + 1 === n ? 0 : pos + 1;
  }
  return out;
}

/**
 * M2 con el nivel calibrado por doble bootstrap (Beran, 1987, «prepivoting»). Se pregunta a
 * los propios datos cómo de bien calibra M2 con ellos: B veces se sacan de x unos datos x* y un
 * futuro y* (x hace de verdad), se aplica M2 a x* y se mira el PIT de y*. La distribución de
 * esos PIT (G) dice qué nivel nominal da de verdad cada nivel: el cuantil q pasa a ser
 * F̂⁻¹(G⁻¹(q)) y una probabilidad F̂(c), G(F̂(c)). Por separado para el resultado y el drawdown.
 */
export function calibratedMonteCarlo(packed, opts = {}) {
  const { n } = packed;
  const H = Math.round(opts.horizon ?? n);
  const outer = opts.outer ?? 200;
  const inner = opts.inner ?? 500;
  const seed = opts.seed ?? 20261014;
  const block = opts.block ?? blockLengthPPW(packed.total);
  const p = 1 / Math.max(1, block);
  const rng = makeRng(seed ^ 0x5bd1e995);
  const log = Boolean(opts.log);
  const gTot = new Float64Array(outer);
  const gDd = new Float64Array(outer);
  for (let b = 0; b < outer; b++) {
    const xs = packedFromIndices(packed, stationaryIndices(rng, n, n, p));
    const ys = stationaryIndices(rng, n, H, p);
    let cum = 0; let peak = 0; let dd = 0;
    for (const d of ys) {
      for (let m = packed.start[d]; m < packed.start[d + 1]; m++) {
        cum += packed.inc[m];
        if (cum > peak) peak = cum; else if (peak - cum > dd) dd = peak - cum;
      }
    }
    const obs = { total: log ? Math.exp(cum) - 1 : cum, dd: log ? 1 - Math.exp(-dd) : dd };
    const r = predictiveMonteCarlo(xs, { horizon: H, sims: inner, seed: (seed + 7919 * (b + 1)) >>> 0, method: 'bayes', log, observe: obs });
    gTot[b] = r.pit.total; gDd[b] = r.pit.dd;
  }
  gTot.sort(); gDd.sort();
  const main = predictiveMonteCarlo(packed, { ...opts, method: 'bayes', block, keepSamples: true, observe: undefined });
  const { totals, dds } = main.samples;
  const S = totals.length;
  const G = (g, u) => countBelow(g, u, false) / g.length;
  const Ginv = (g, q) => quantileSorted(g, q);
  const qCal = (samples, g, q) => quantileSorted(samples, Ginv(g, q));
  const levels = opts.ddLevels || [];
  const out = {
    ...main,
    method: 'bayesian_block_bootstrap_predictive_calibrated',
    calibration: { outer, inner, citation: 'Beran (1987) prepivoting' },
    total: { p05: qCal(totals, gTot, 0.05), p50: qCal(totals, gTot, 0.5), p95: qCal(totals, gTot, 0.95) },
    maxDd: { p50: qCal(dds, gDd, 0.5), p95: qCal(dds, gDd, 0.95) },
    // F̂(0⁻) en log-rendimiento ≡ resultado relativo < 0: los totales ya están en esa escala.
    probLoss: G(gTot, countBelow(totals, 0, true) / S),
    probDd: levels.map((level) => ({ level, p: 1 - G(gDd, countBelow(dds, level, true) / S) })),
  };
  delete out.samples;
  if (opts.observe) {
    const v = rng();
    const uT = pitSorted(totals, opts.observe.total, v);
    const uD = pitSorted(dds, opts.observe.dd, v);
    out.pit = { total: pitSorted(gTot, uT, rng()), dd: pitSorted(gDd, uD, rng()) };
  }
  return out;
}
