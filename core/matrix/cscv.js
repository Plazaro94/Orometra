/**
 * PBO real por CSCV (Bailey, Borwein, López de Prado, Zhu 2014).
 * Parte T en S bloques (S par), todas las combinaciones de S/2 como IS.
 * PBO = proporción de logits ≤ 0.
 */

import { makeRng, numRows, numCols, column, mean } from './util.js';

function combinations(n, k) {
  // Índices 0..n-1 elegir k
  const out = [];
  const cur = [];
  function rec(start) {
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (let i = start; i < n; i++) {
      cur.push(i);
      rec(i + 1);
      cur.pop();
    }
  }
  rec(0);
  return out;
}

function blockBounds(T, S) {
  const size = Math.floor(T / S);
  const bounds = [];
  for (let s = 0; s < S; s++) {
    const a = s * size;
    const b = s === S - 1 ? T : (s + 1) * size;
    bounds.push([a, b]);
  }
  return bounds;
}

function subsetMean(series, bounds, blockIdxs) {
  const vals = [];
  for (const bi of blockIdxs) {
    const [a, b] = bounds[bi];
    for (let t = a; t < b; t++) if (Number.isFinite(series[t])) vals.push(series[t]);
  }
  return mean(vals);
}

/**
 * @param {number[][]|{T,N,columns}} matrix retornos T×N
 * @param {{ S?: number, metric?: 'mean', maxCols?: number, seed?: number }} opts
 */
export function cscvPbo(matrix, opts = {}) {
  const T = numRows(matrix);
  const N0 = numCols(matrix);
  let S = opts.S ?? 16;
  if (S % 2 !== 0) S += 1;
  if (T < S * 2) {
    return {
      usable: false,
      reason: 'insufficient_rows',
      pbo: NaN,
      S,
      nCombinations: 0,
      logits: [],
    };
  }

  let colIdx = Array.from({ length: N0 }, (_, i) => i);
  if (opts.maxCols && N0 > opts.maxCols) {
    const rng = makeRng(opts.seed ?? 20260924);
    // Submuestreo estratificado simple: barajar y tomar maxCols
    for (let i = colIdx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [colIdx[i], colIdx[j]] = [colIdx[j], colIdx[i]];
    }
    colIdx = colIdx.slice(0, opts.maxCols).sort((a, b) => a - b);
  }
  const N = colIdx.length;
  const series = colIdx.map((j) => column(matrix, j));
  const bounds = blockBounds(T, S);
  const isCombos = combinations(S, S / 2);
  const logits = [];
  const degradations = [];

  for (const isBlocks of isCombos) {
    const isSet = new Set(isBlocks);
    const oosBlocks = [];
    for (let s = 0; s < S; s++) if (!isSet.has(s)) oosBlocks.push(s);

    const isScores = series.map((ser) => subsetMean(ser, bounds, isBlocks));
    let best = 0;
    for (let j = 1; j < N; j++) {
      if ((isScores[j] || -Infinity) > (isScores[best] || -Infinity)) best = j;
    }
    const oosScores = series.map((ser) => subsetMean(ser, bounds, oosBlocks));
    const bestOos = oosScores[best];
    // Rango relativo: fracción de configs con OOS peor que la elegida (0=peor, 1=mejor)
    let worse = 0;
    let finite = 0;
    for (let j = 0; j < N; j++) {
      if (!Number.isFinite(oosScores[j])) continue;
      finite++;
      if (oosScores[j] < bestOos) worse++;
    }
    const rank = finite > 1 ? worse / (finite - 1) : 0.5;
    // logit del rango; evitar 0/1 exactos
    const r = Math.min(1 - 1e-6, Math.max(1e-6, rank));
    const logit = Math.log(r / (1 - r));
    logits.push(logit);
    degradations.push({
      isScore: isScores[best],
      oosScore: bestOos,
      rank,
    });
  }

  const pbo = logits.length
    ? logits.filter((x) => x <= 0).length / logits.length
    : NaN;

  return {
    usable: true,
    method: 'CSCV',
    citation: 'Bailey et al. (2014) Probability of Backtest Overfitting',
    pbo,
    S,
    nCombinations: isCombos.length,
    nColumns: N,
    nColumnsFull: N0,
    logits,
    degradations,
    logitMean: mean(logits),
  };
}
