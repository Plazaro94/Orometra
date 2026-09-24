/**
 * Bootstrap estacionario (Politis-Romano) sobre retornos OOS.
 */

import { makeRng, mean, maxDrawdown, cumsum } from './util.js';

function geometricLength(rng, p) {
  // P(L=k) = (1-p)^(k-1)*p , media 1/p
  let k = 1;
  while (rng() > p) k++;
  return k;
}

/**
 * @param returns number[]
 * @param opts { sims=10000, meanBlock=?, seed, painDd }
 */
export function stationaryBootstrap(returns, opts = {}) {
  const x = returns.filter((_, i) => Number.isFinite(returns[i]));
  const n = x.length;
  if (n < 5) {
    return { usable: false, reason: 'insufficient', sims: [] };
  }
  const sims = opts.sims ?? 10000;
  const meanBlock = opts.meanBlock ?? Math.max(2, Math.round(Math.sqrt(n)));
  const p = 1 / meanBlock;
  const rng = makeRng(opts.seed ?? 20260924);
  const painDd = opts.painDd;

  const finalRets = new Float64Array(sims);
  const maxDds = new Float64Array(sims);
  let loss3 = 0; let loss6 = 0; let loss12 = 0; let painHits = 0;
  // Asumimos retornos diarios: 63≈3m, 126≈6m, 252≈12m
  const h3 = Math.min(n, 63);
  const h6 = Math.min(n, 126);
  const h12 = Math.min(n, 252);

  for (let s = 0; s < sims; s++) {
    const path = new Float64Array(n);
    let i = 0;
    while (i < n) {
      let pos = Math.floor(rng() * n);
      const L = geometricLength(rng, p);
      for (let k = 0; k < L && i < n; k++, i++) {
        path[i] = x[pos];
        pos = (pos + 1) % n;
      }
    }
    const total = path.reduce((a, b) => a + b, 0);
    finalRets[s] = total;
    const dd = maxDrawdown(Array.from(path));
    maxDds[s] = dd;
    const sum = (h) => {
      let t = 0;
      for (let i = 0; i < h; i++) t += path[i];
      return t;
    };
    if (sum(h3) < 0) loss3++;
    if (sum(h6) < 0) loss6++;
    if (sum(h12) < 0) loss12++;
    if (painDd != null && dd >= painDd) painHits++;
  }

  const sorted = Array.from(finalRets).sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];

  return {
    usable: true,
    method: 'stationary_bootstrap',
    citation: 'Politis & Romano (1994)',
    seed: opts.seed ?? 20260924,
    sims,
    meanBlock,
    meanReturn: mean(Array.from(finalRets)),
    meanOfSeries: mean(x),
    returnCi: { p05: q(0.05), p50: q(0.5), p95: q(0.95) },
    maxDdCi: {
      p05: quantile(maxDds, 0.05),
      p50: quantile(maxDds, 0.5),
      p95: quantile(maxDds, 0.95),
    },
    probLoss: {
      m3: loss3 / sims,
      m6: loss6 / sims,
      m12: loss12 / sims,
    },
    probPainDd: painDd == null ? null : painHits / sims,
    note: 'Always on OOS (or reserved) series — never on optimized IS alone without label.',
  };
}

function quantile(arr, p) {
  const s = Array.from(arr).sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))];
}
