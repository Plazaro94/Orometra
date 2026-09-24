// Utilidades compartidas de la matriz T×N (días × pasadas).
// Puro: sin DOM ni Node.

import { makeRng } from '../rng.js';

/** Pearson ρ entre dos series alineadas (NaN ignorados por pares). */
export function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  let sx = 0; let sy = 0; let sxx = 0; let syy = 0; let sxy = 0; let k = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]; const y = b[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    k++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
  }
  if (k < 3) return NaN;
  const cov = sxy - (sx * sy) / k;
  const vx = sxx - (sx * sx) / k;
  const vy = syy - (sy * sy) / k;
  if (vx <= 0 || vy <= 0) return NaN;
  return cov / Math.sqrt(vx * vy);
}

export function mean(xs) {
  const v = xs.filter(Number.isFinite);
  if (!v.length) return NaN;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

export function stdev(xs, sample = true) {
  const v = xs.filter(Number.isFinite);
  if (v.length < 2) return NaN;
  const m = mean(v);
  const ss = v.reduce((s, x) => s + (x - m) ** 2, 0);
  return Math.sqrt(ss / (sample ? v.length - 1 : v.length));
}

export function skewness(xs) {
  const v = xs.filter(Number.isFinite);
  if (v.length < 3) return NaN;
  const m = mean(v);
  const s = stdev(v);
  if (!(s > 0)) return 0;
  const n = v.length;
  const m3 = v.reduce((a, x) => a + ((x - m) / s) ** 3, 0) / n;
  return m3;
}

export function kurtosis(xs) {
  // Exceso de curtosis (normal = 0).
  const v = xs.filter(Number.isFinite);
  if (v.length < 4) return NaN;
  const m = mean(v);
  const s = stdev(v);
  if (!(s > 0)) return 0;
  const n = v.length;
  const m4 = v.reduce((a, x) => a + ((x - m) / s) ** 4, 0) / n;
  return m4 - 3;
}

/** Sharpe simple sobre retornos (por periodo de la serie, no anualizado). */
export function sharpe(xs) {
  const m = mean(xs);
  const s = stdev(xs);
  if (!Number.isFinite(m) || !(s > 0)) return NaN;
  return m / s;
}

export function cumsum(xs) {
  const out = new Array(xs.length);
  let s = 0;
  for (let i = 0; i < xs.length; i++) {
    s += Number.isFinite(xs[i]) ? xs[i] : 0;
    out[i] = s;
  }
  return out;
}

export function maxDrawdown(returns) {
  const eq = cumsum(returns);
  let peak = -Infinity;
  let dd = 0;
  for (const v of eq) {
    if (v > peak) peak = v;
    const d = peak - v;
    if (d > dd) dd = d;
  }
  return dd;
}

/**
 * Matriz densa T×N: matrix[t][n] = retorno del día t, pasada n.
 * Alternativa sparse: { T, N, columns: Float64Array[] } misma semántica.
 */
export function column(matrix, j) {
  if (Array.isArray(matrix[0])) return matrix.map((row) => row[j]);
  if (matrix.columns) return Array.from(matrix.columns[j]);
  throw new Error('Formato de matriz no reconocido');
}

export function numRows(matrix) {
  if (Array.isArray(matrix)) return matrix.length;
  return matrix.T;
}

export function numCols(matrix) {
  if (Array.isArray(matrix) && matrix[0]) return matrix[0].length;
  return matrix.N;
}

export function sliceRows(matrix, from, to) {
  // [from, to)
  if (Array.isArray(matrix)) return matrix.slice(from, to);
  const T = to - from;
  const N = matrix.N;
  const columns = matrix.columns.map((col) => col.slice(from, to));
  return { T, N, columns };
}

export { makeRng };
