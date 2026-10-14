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
      for (let k = start[d]; k < start[d + 1]; k++) {
        cum += inc[k];
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
  return {
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
}
