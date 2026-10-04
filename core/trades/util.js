// Utilidades compartidas de series de retornos (una serie diaria por vez).
// Puro: sin DOM ni Node.

import { makeRng } from '../rng.js';

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

export { makeRng };
