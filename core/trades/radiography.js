/**
 * Radiografía del backtest: los mismos días de operativa en otro orden (docs/MONTECARLO.md;
 * bench/PREREGISTRO-MONTECARLO.md, enmienda 6 c).
 *
 * NO ES UNA PREVISIÓN. Responde a otra pregunta: con estas mismas operaciones, ¿cómo de
 * afortunado fue el orden en que llegaron? Todas las curvas acaban en el mismo sitio (son las
 * mismas operaciones); lo que cambia es el camino: el drawdown y las rachas de pérdidas.
 *
 * Se reordenan días enteros con sus operaciones en orden (no operaciones sueltas), como en el
 * Monte Carlo predictivo. Si los días son intercambiables, el percentil del drawdown real entre
 * las permutaciones es exactamente uniforme: un 10 % de los backtests cae en cada décimo. Con
 * rachas o volatilidad agrupada no lo son, y reordenar subestima el riesgo: por eso se aplican
 * las mismas puertas que a la previsión.
 */

import { makeRng } from '../rng.js';
import { pitSorted } from './montecarlo.js';

export const MIN_TRADES = 30;

function quantileSorted(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
}

/** Drawdown máximo, racha más larga de operaciones perdedoras y curva de un orden de días. */
function walk(days, order, log, curve) {
  let cum = 0; let peak = 0; let dd = 0; let streak = 0; let longest = 0; let t = 0;
  for (const d of order) {
    for (const v of days[d]) {
      cum += v;
      if (cum > peak) peak = cum; else if (peak - cum > dd) dd = peak - cum;
      if (v < 0) { streak++; if (streak > longest) longest = streak; } else if (v > 0) streak = 0;
      if (curve) curve[t] = log ? Math.exp(cum) - 1 : cum;
      t++;
    }
  }
  return { dd: log ? 1 - Math.exp(-dd) : dd, longest };
}

/**
 * @param {number[][]} allDays  días con sus operaciones en orden (los vacíos se ignoran)
 * @param {object} opts
 *   sims       permutaciones (por defecto 2.000)
 *   seed       semilla
 *   log        true si los incrementos son log-rendimientos (lote proporcional)
 *   curves     curvas de ejemplo que se devuelven para el gráfico (por defecto 100)
 *   points     puntos de cada curva y de las bandas (por defecto 120)
 */
export function orderRadiography(allDays, opts = {}) {
  const days = allDays.filter((d) => d.length > 0);
  const trades = days.reduce((a, d) => a + d.length, 0);
  if (trades < MIN_TRADES) return { usable: false, reason: 'pocas_operaciones', trades, minTrades: MIN_TRADES };
  if (days.length < 2) return { usable: false, reason: 'un_solo_dia', trades };
  const sims = opts.sims ?? 2000;
  const seed = opts.seed ?? 20261015;
  const log = Boolean(opts.log);
  const nCurves = Math.min(opts.curves ?? 100, sims);
  const points = Math.min(opts.points ?? 120, trades);
  const rng = makeRng(seed);
  const D = days.length;
  // Índices de operación que se guardan para dibujar (siempre incluye el final).
  const grid = Array.from({ length: points }, (_, i) => Math.round(((i + 1) * trades) / points) - 1);

  const realCurve = new Float64Array(trades);
  const identity = Array.from({ length: D }, (_, i) => i);
  const real = walk(days, identity, log, realCurve);

  const dds = new Float64Array(sims);
  const streaks = new Float64Array(sims);
  const atGrid = grid.map(() => new Float64Array(sims));
  const curves = [];
  const order = identity.slice();
  const curve = new Float64Array(trades);
  for (let s = 0; s < sims; s++) {
    for (let i = D - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const tmp = order[i]; order[i] = order[j]; order[j] = tmp; }
    const r = walk(days, order, log, curve);
    dds[s] = r.dd; streaks[s] = r.longest;
    for (let g = 0; g < grid.length; g++) atGrid[g][s] = curve[grid[g]];
    if (s < nCurves) curves.push(grid.map((i) => curve[i]));
  }
  const ddPercentile = (() => { const sorted = Float64Array.from(dds).sort(); return pitSorted(sorted, real.dd, rng()); })();
  dds.sort(); streaks.sort();
  const bands = { x: grid.map((i) => i + 1), p05: [], p25: [], p50: [], p75: [], p95: [] };
  for (const col of atGrid) {
    col.sort();
    bands.p05.push(quantileSorted(col, 0.05)); bands.p25.push(quantileSorted(col, 0.25)); bands.p50.push(quantileSorted(col, 0.5));
    bands.p75.push(quantileSorted(col, 0.75)); bands.p95.push(quantileSorted(col, 0.95));
  }
  const fraction = (sorted, v) => { let k = 0; for (const x of sorted) if (x > v) k++; return k / sorted.length; };
  return {
    usable: true,
    method: 'day_permutation',
    seed,
    sims,
    trades,
    tradingDays: D,
    log,
    total: log ? Math.exp(days.flat().reduce((a, v) => a + v, 0)) - 1 : days.flat().reduce((a, v) => a + v, 0),
    real: { maxDd: real.dd, longestLosingStreak: real.longest, curve: grid.map((i) => realCurve[i]) },
    maxDd: { p05: quantileSorted(dds, 0.05), p50: quantileSorted(dds, 0.5), p95: quantileSorted(dds, 0.95) },
    // Percentil del drawdown real entre las permutaciones (PIT aleatorizado): bajo es «orden
    // favorable» (con otro orden la caída casi siempre habría sido mayor).
    ddPercentile,
    worseOrderShare: fraction(dds, real.dd),
    longestLosingStreak: { p50: quantileSorted(streaks, 0.5), p95: quantileSorted(streaks, 0.95) },
    bands,
    curves,
  };
}
