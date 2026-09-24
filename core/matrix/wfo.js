/**
 * Walk-Forward Optimization sobre matriz T×N de retornos diarios.
 * Por defecto selecciona el centro de meseta maximin en la ventana IS
 * (aproximación: mejor peor-vecino en ranking 1D por score; si no hay topología
 * de parámetros, cae a maximin sobre scores locales por correlación).
 */

import { mean, sharpe, maxDrawdown, numRows, numCols, column, sliceRows } from './util.js';

function windowScore(series, from, to) {
  const slice = [];
  for (let t = from; t < to; t++) if (Number.isFinite(series[t])) slice.push(series[t]);
  return mean(slice);
}

/**
 * Selección (b) maximin aproximada sin coords de parámetros:
 * score = media IS; "vecindad" = top-k por correlación en IS; maximin = max_i min(score_i, median(neigh)).
 * Si opts.paramCoords (N×D) y levels se pasan, usa motor real — aquí versión matriz-pura.
 */
function selectMaximin(isScores, corrNeighborMins) {
  let best = 0;
  let bestVal = -Infinity;
  for (let j = 0; j < isScores.length; j++) {
    const s = isScores[j];
    if (!Number.isFinite(s)) continue;
    const floor = corrNeighborMins ? Math.min(s, corrNeighborMins[j] ?? s) : s;
    if (floor > bestVal) { bestVal = floor; best = j; }
  }
  return best;
}

function selectMax(isScores) {
  let best = 0;
  for (let j = 1; j < isScores.length; j++) {
    if ((isScores[j] || -Infinity) > (isScores[best] || -Infinity)) best = j;
  }
  return best;
}

/**
 * @param matrix T×N
 * @param opts { isLen, oosLen, step, mode: 'rolling'|'anchored', rule: 'maximin'|'max', warnGenetic?: boolean }
 */
export function walkForward(matrix, opts = {}) {
  const T = numRows(matrix);
  const N = numCols(matrix);
  const isLen = opts.isLen ?? Math.max(20, Math.floor(T * 0.5));
  const oosLen = opts.oosLen ?? Math.max(10, Math.floor(T * 0.2));
  const step = opts.step ?? oosLen;
  const mode = opts.mode === 'anchored' ? 'anchored' : 'rolling';
  const rule = opts.rule === 'max' ? 'max' : 'maximin';

  if (T < isLen + oosLen) {
    return { usable: false, reason: 'insufficient_rows', windows: [], oosReturns: [] };
  }

  const series = [];
  for (let j = 0; j < N; j++) series.push(column(matrix, j));

  const windows = [];
  const oosReturns = [];
  const chosen = [];

  let start = 0;
  while (true) {
    const isFrom = mode === 'anchored' ? 0 : start;
    const isTo = mode === 'anchored' ? start + isLen : start + isLen;
    const oosFrom = isTo;
    const oosTo = Math.min(T, oosFrom + oosLen);
    if (oosTo - oosFrom < Math.max(3, Math.floor(oosLen * 0.5))) break;
    if (isTo > T) break;

    const isScores = series.map((ser) => windowScore(ser, isFrom, isTo));
    // Vecindad proxy: media de los 3 más cercanos en score (meseta 1D)
    const sorted = isScores
      .map((s, j) => ({ s, j }))
      .filter((x) => Number.isFinite(x.s))
      .sort((a, b) => a.s - b.s);
    const neighMin = new Array(N).fill(NaN);
    for (let i = 0; i < sorted.length; i++) {
      const { j } = sorted[i];
      const lo = Math.max(0, i - 1);
      const hi = Math.min(sorted.length - 1, i + 1);
      const vals = [];
      for (let k = lo; k <= hi; k++) vals.push(sorted[k].s);
      neighMin[j] = Math.min(...vals);
    }

    const pick = rule === 'max' ? selectMax(isScores) : selectMaximin(isScores, neighMin);
    const oosSlice = [];
    for (let t = oosFrom; t < oosTo; t++) {
      const v = series[pick][t];
      oosSlice.push(Number.isFinite(v) ? v : 0);
      oosReturns.push(Number.isFinite(v) ? v : 0);
    }
    const isMean = isScores[pick];
    const oosMean = mean(oosSlice);
    windows.push({
      isFrom, isTo, oosFrom, oosTo,
      chosen: pick,
      isScore: isMean,
      oosScore: oosMean,
      oosPositive: oosMean > 0,
      efficiency: Number.isFinite(isMean) && Math.abs(isMean) > 1e-12 ? oosMean / isMean : NaN,
    });
    chosen.push(pick);

    if (mode === 'rolling') start += step;
    else start += step; // anchored: grow IS by shifting the end
    if (mode === 'anchored') {
      // next window: IS = [0, prevIsTo+step), but keep isLen minimum growth
      // simplify: advance the IS end
      if (isTo + step + oosLen > T) break;
      // redefine via start as the IS length offset
      start = isTo - isLen + step;
      if (start < 0) start = 0;
    }
    if (windows.length > 500) break;
  }

  const paramStability = (() => {
    if (chosen.length < 2) return 1;
    let same = 0;
    for (let i = 1; i < chosen.length; i++) if (chosen[i] === chosen[i - 1]) same++;
    return same / (chosen.length - 1);
  })();

  const oosSharpe = sharpe(oosReturns);
  const oosDd = maxDrawdown(oosReturns);
  const posPct = windows.length ? windows.filter((w) => w.oosPositive).length / windows.length : NaN;
  const effMean = mean(windows.map((w) => w.efficiency).filter(Number.isFinite));

  return {
    usable: windows.length > 0,
    method: 'WFO',
    mode,
    rule,
    isLen,
    oosLen,
    step,
    windows,
    oosReturns,
    oosSharpe,
    oosMaxDrawdown: oosDd,
    pctWindowsPositive: posPct,
    meanEfficiency: effMean,
    paramStability,
    geneticSelectionBiasWarning: Boolean(opts.warnGenetic),
  };
}
