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

const DAY_RE = /(\d{4})[.\-/](\d{2})[.\-/](\d{2})/;
const dayOf = (time) => { const m = DAY_RE.exec(String(time || '')); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reparte las operaciones de un backtest largo en tramos por su FECHA DE CIERRE
 * (docs/MONTECARLO.md, 6.1). Una posición abierta antes de un corte y cerrada después cuenta en
 * el tramo posterior; se dice cuántas hay (`straddling`).
 *
 * @param {object[]} deals
 * @param {object} cuts
 *   chooseEnd  último día usado para elegir (fin del forward, o del optimizado sin forward): AAAA-MM-DD
 *   optEnd     opcional: fin del periodo optimizado, para separarlo del forward
 * @returns {{ok:true, segments:object[], clean:object[], period:{from,to}} | {ok:false, error:string, period}}
 *   segments: [{key:'opt'|'fwd'|'used'|'clean', from, to, deals, straddling}]; `from` y `to` son
 *   las fechas del tramo (no las de su primera y última operación). error: 'fecha_no_valida',
 *   'orden', 'sin_operaciones_antes', 'sin_operaciones_despues', 'fechas_no_reconocidas'.
 */
export function splitByCuts(deals, cuts = {}) {
  const days = deals.map((d) => dayOf(d.time));
  if (!days.length || days.some((x) => !x)) return { ok: false, error: 'fechas_no_reconocidas', period: null };
  const sorted = days.slice().sort();
  const period = { from: sorted[0], to: sorted[sorted.length - 1] };
  const { chooseEnd } = cuts;
  const optEnd = cuts.optEnd && cuts.optEnd !== chooseEnd ? cuts.optEnd : null;
  if (!ISO_RE.test(chooseEnd || '') || (optEnd && !ISO_RE.test(optEnd))) return { ok: false, error: 'fecha_no_valida', period };
  if (optEnd && optEnd > chooseEnd) return { ok: false, error: 'orden', period };
  if (!(period.from <= chooseEnd)) return { ok: false, error: 'sin_operaciones_antes', period };
  if (!(chooseEnd < period.to)) return { ok: false, error: 'sin_operaciones_despues', period };
  const next = (iso) => { const t = new Date(`${iso}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
  const bounds = optEnd
    ? [{ key: 'opt', from: period.from, to: optEnd }, { key: 'fwd', from: next(optEnd), to: chooseEnd }, { key: 'clean', from: next(chooseEnd), to: period.to }]
    : [{ key: 'used', from: period.from, to: chooseEnd }, { key: 'clean', from: next(chooseEnd), to: period.to }];
  const segments = bounds.map((b) => ({ ...b, deals: [], straddling: 0 }));
  deals.forEach((d, i) => {
    const seg = segments.find((sg) => days[i] <= sg.to) || segments[segments.length - 1];
    seg.deals.push(d);
    const open = dayOf(d.openTime);
    if (open && open < seg.from) seg.straddling++;
  });
  return { ok: true, segments, clean: segments[segments.length - 1].deals, period };
}

/** Radiografía, puertas y si los datos permiten una previsión, para un conjunto de operaciones. */
function analyze(deals, sizing) {
  const s = series(deals, sizing);
  if (!s.usable) return { usable: false, reason: s.reason };
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
 * Radiografía, puertas y si los datos permiten una previsión.
 *
 * @param {object[]} deals   operaciones de cierre del informe (core/report.js)
 * @param {object} opts
 *   sizing  'fixed' | 'proportional' | 'martingale'; si no se da, se deduce (core/trades/sizing.js)
 *   cuts    { chooseEnd, optEnd? } (splitByCuts): backtest largo partido en tramos. Lo de arriba
 *           (puertas, forecastData…) es entonces del tramo posterior a la elección, y `segments`
 *           trae la radiografía de cada tramo y la del informe entero.
 */
export function tradesMonteCarlo(deals, opts = {}) {
  const detected = detectSizing(deals);
  const sizing = opts.sizing || detected.kind;
  const base = { detected, sizing };
  if (sizing === 'martingale') return { ...base, usable: false, reason: 'martingala' };
  if (!opts.cuts) return { ...base, ...analyze(deals, sizing) };
  const split = splitByCuts(deals, opts.cuts);
  if (!split.ok) return { ...base, usable: false, reason: 'cortes', cutError: split.error, period: split.period };
  const all = analyze(deals, sizing);
  if (!all.usable) return { ...base, ...all };
  const segments = split.segments.map((sg) => {
    const a = sg.deals.length ? analyze(sg.deals, sizing) : { usable: false, reason: 'sin_operaciones' };
    return { key: sg.key, from: sg.from, to: sg.to, trades: sg.deals.length, straddling: sg.straddling, usable: a.usable, mode: a.mode, gates: a.gates, radiography: a.radiography || null, analysis: sg.key === 'clean' ? a : undefined };
  });
  segments.push({ key: 'all', from: split.period.from, to: split.period.to, trades: deals.length, straddling: 0, usable: true, mode: all.mode, gates: all.gates, radiography: all.radiography });
  const clean = segments.find((sg) => sg.key === 'clean').analysis;
  for (const sg of segments) delete sg.analysis;
  const cleanSeg = segments.find((sg) => sg.key === 'clean');
  return {
    ...base,
    ...(clean.usable ? clean : { usable: true, mode: all.mode, radiography: null, gates: null, forecastData: { ok: false, missing: ['dias'] }, days: 0, tradingDays: 0, trades: 0 }),
    usable: true,
    cuts: { chooseEnd: opts.cuts.chooseEnd, optEnd: opts.cuts.optEnd || null },
    cleanFrom: cleanSeg.from,
    cleanTo: cleanSeg.to,
    period: split.period,
    segments,
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
 *   cuts     como en tradesMonteCarlo: solo se usa el tramo posterior a la elección
 */
export function tradesForecast(allDeals, opts = {}) {
  const sizing = opts.sizing || detectSizing(allDeals).kind;
  let deals = allDeals;
  if (opts.cuts) {
    const split = splitByCuts(allDeals, opts.cuts);
    if (!split.ok) return { usable: false, reason: 'cortes', cutError: split.error };
    deals = split.clean;
  }
  if (sizing === 'martingale') return { usable: false, reason: 'martingala' };
  const s = series(deals, sizing);
  if (!s.usable) return { usable: false, reason: s.reason };
  const check = analyze(deals, sizing);
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
