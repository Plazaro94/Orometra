/**
 * El Monte Carlo de la pantalla, sobre las operaciones del informe (docs/MONTECARLO.md, 0 y 8.6).
 * Puro y sin DOM: lo llama el worker (js/worker.js, kind 'tradesMC' y 'tradesForecast').
 *
 * Dos partes, cada una honesta con lo que es:
 * - Radiografía (core/trades/radiography.js): los mismos días en otro orden. Con 30 operaciones
 *   o más. No es una previsión.
 * - Previsión a 6 y 12 meses (core/trades/montecarlo.js#calibratedMonteCarlo, M2bc): solo con
 *   2 años de datos (504 días laborables), 100 días con operaciones y sin rachas ni volatilidad
 *   agrupada. Es lo más estricto de la calibración y del examen (bench/results/REPORT-MC-exam1.md:
 *   12 meses aptos desde 504 días; 6 meses desde 252 en el examen, pero la calibración 4 pidió 504).
 *   A 3 meses no hay: no aprobó con ningún tamaño de muestra.
 *
 * Lo que este módulo no puede saber (si estas fechas se usaron para elegir la configuración) lo
 * decide la pantalla: aquí solo se mira lo que dicen los datos.
 */

import { daysFromDeals, packDays, robustPortmanteau, volatilityClustering, calibratedMonteCarlo } from './montecarlo.js';
import { orderRadiography, MIN_TRADES } from './radiography.js';
import { detectSizing } from './sizing.js';

export const FORECAST_MIN_DAYS = 504;
export const FORECAST_MIN_TRADING_DAYS = 100;
export const FORECAST_HORIZONS = [126, 252];
export const GATE_ALPHA = 0.05;
export const GATE_LAGS = 10;
export { MIN_TRADES };

const RADIO_SEED = 20261015;
const FORECAST_SEED = 20261014;

/** Unidad de trabajo según el tipo de lote: dinero, o rendimiento si el lote es proporcional. */
const modeFor = (sizing) => (sizing === 'proportional' ? 'log' : 'money');

function series(deals, sizing) {
  const mode = modeFor(sizing);
  const d = daysFromDeals(deals, mode);
  if (!d.usable) return d;
  return { ...d, packed: packDays(d.days) };
}

/**
 * Radiografía, puertas y si los datos permiten una previsión.
 *
 * @param {object[]} deals   operaciones de cierre del informe (core/report.js)
 * @param {object} opts
 *   sizing  'fixed' | 'proportional' | 'martingale'; si no se da, se deduce (core/trades/sizing.js)
 */
export function tradesMonteCarlo(deals, opts = {}) {
  const detected = detectSizing(deals);
  const sizing = opts.sizing || detected.kind;
  const base = { detected, sizing };
  if (sizing === 'martingale') return { ...base, usable: false, reason: 'martingala' };
  const s = series(deals, sizing);
  if (!s.usable) return { ...base, usable: false, reason: s.reason };
  const log = s.mode === 'log';
  const totals = Array.from(s.packed.total);
  const streaks = robustPortmanteau(totals, GATE_LAGS);
  const volatility = volatilityClustering(totals, GATE_LAGS);
  const gates = {
    streaks: { usable: streaks.usable, p: streaks.p, hit: Boolean(streaks.usable && streaks.p < GATE_ALPHA) },
    volatility: { usable: volatility.usable, p: volatility.p, hit: Boolean(volatility.usable && volatility.p < GATE_ALPHA) },
  };
  gates.ok = !gates.streaks.hit && !gates.volatility.hit && gates.streaks.usable && gates.volatility.usable;
  const tradingDays = s.days.reduce((a, d) => a + (d.length > 0 ? 1 : 0), 0);
  const trades = s.days.reduce((a, d) => a + d.length, 0);
  const radiography = orderRadiography(s.days, { seed: RADIO_SEED, log });
  const missing = [];
  if (s.days.length < FORECAST_MIN_DAYS) missing.push('dias');
  if (tradingDays < FORECAST_MIN_TRADING_DAYS) missing.push('dias_con_operaciones');
  if (!gates.ok) missing.push('puertas');
  return {
    ...base,
    usable: true,
    mode: s.mode,
    from: s.dates[0],
    to: s.dates[s.dates.length - 1],
    days: s.days.length,
    tradingDays,
    trades,
    gates,
    radiography,
    forecastData: { ok: missing.length === 0, missing },
  };
}

/**
 * Previsión a 6 y 12 meses (M2bc). Solo se llama si tradesMonteCarlo dijo que los datos lo
 * permiten y la pantalla ha confirmado que las fechas no se usaron para elegir.
 *
 * @param {object[]} deals
 * @param {object} opts
 *   sizing   como en tradesMonteCarlo
 *   ddLimit  caída de balance que el usuario no aguantaría (dinero; en modo log, fracción)
 */
export function tradesForecast(deals, opts = {}) {
  const sizing = opts.sizing || detectSizing(deals).kind;
  if (sizing === 'martingale') return { usable: false, reason: 'martingala' };
  const s = series(deals, sizing);
  if (!s.usable) return { usable: false, reason: s.reason };
  const check = tradesMonteCarlo(deals, { sizing });
  if (!check.forecastData.ok) return { usable: false, reason: 'datos', missing: check.forecastData.missing };
  const log = s.mode === 'log';
  const ddLevels = Number.isFinite(opts.ddLimit) && opts.ddLimit > 0 ? [opts.ddLimit] : [];
  const horizons = FORECAST_HORIZONS.map((horizon) => {
    // 10.000 simulaciones en la distribución principal (el examen usó 2.000): reduce el ruido
    // de los cuantiles sin cambiar el método; la calibración (200 × 500) es la del examen.
    const r = calibratedMonteCarlo(s.packed, { horizon, sims: 10000, seed: FORECAST_SEED + horizon, log, ddLevels, outer: 200, inner: 500 });
    return {
      horizon,
      total: r.total,
      maxDd: r.maxDd,
      probLoss: r.probLoss,
      probDd: r.probDd,
      block: r.block,
    };
  });
  return { usable: true, mode: s.mode, sizing, days: s.days.length, from: s.dates[0], to: s.dates[s.dates.length - 1], horizons, method: 'M2bc', seed: FORECAST_SEED };
}
