/**
 * Tamaño de muestra, IC y potencia / MinBTL (Bailey et al.).
 */

import { mean, stdev, sharpe } from './util.js';
import { stationaryBootstrap } from './bootstrap.js';
import { normCdf, normInv } from '../stats.js';

/**
 * Intervalo de confianza por bootstrap estacionario sobre una métrica = media.
 */
export function meanConfidenceInterval(returns, opts = {}) {
  const boot = stationaryBootstrap(returns, {
    sims: opts.sims ?? 2000,
    seed: opts.seed ?? 20260924,
    meanBlock: opts.meanBlock,
  });
  if (!boot.usable) return boot;
  return {
    usable: true,
    mean: mean(returns),
    n: returns.filter(Number.isFinite).length,
    ci: boot.returnCi,
  };
}

/**
 * Potencia aproximada: ¿se distingue la media de 0? (test z unilateral).
 * power ≈ Φ(√n * |mean|/sd - z_alpha)
 */
export function powerAgainstZero(returns, alpha = 0.05) {
  const v = returns.filter(Number.isFinite);
  const n = v.length;
  const m = mean(v);
  const s = stdev(v);
  if (!(n >= 5) || !(s > 0)) {
    return { usable: false, power: NaN, n, sufficient: false };
  }
  const zAlpha = Math.abs(normInv(1 - alpha));
  const z = Math.sqrt(n) * Math.abs(m) / s;
  const power = normCdf(z - zAlpha);
  return {
    usable: true,
    n,
    mean: m,
    stdev: s,
    power,
    sufficient: power >= 0.8,
    alpha,
  };
}

/**
 * MinBTL heurística: nº mínimo de observaciones para que el SR observado
 * sea distinguible del máximo esperado por azar tras nTrials (idea Bailey et al.).
 */
export function minBtl({ srObserved, nTrials = 1, targetPower = 0.8 }) {
  if (!Number.isFinite(srObserved) || Math.abs(srObserved) < 1e-9) {
    return { usable: false, minObservations: Infinity };
  }
  // Búsqueda grosera de n tal que power(SR) >= target
  let n = 30;
  for (; n <= 20000; n += 10) {
    // bajo H1: noncentrality √n * SR (SR por obs)
    const zAlpha = Math.abs(normInv(0.95));
    const power = normCdf(Math.sqrt(n) * Math.abs(srObserved) - zAlpha);
    if (power >= targetPower) break;
  }
  // Inflar por selección
  const inflate = 1 + Math.log(Math.max(1, nTrials));
  return {
    usable: true,
    minObservations: Math.ceil(n * inflate),
    nTrials,
    targetPower,
    srObserved,
  };
}

export function sampleAudit(returns, opts = {}) {
  const n = returns.filter(Number.isFinite).length;
  const sr = sharpe(returns);
  const pow = powerAgainstZero(returns, opts.alpha);
  const ci = meanConfidenceInterval(returns, opts);
  const btl = minBtl({ srObserved: sr, nTrials: opts.nTrials ?? 1 });
  const insufficient = !pow.sufficient || (btl.usable && n < btl.minObservations);
  return {
    n,
    sharpe: sr,
    power: pow,
    meanCi: ci,
    minBtl: btl,
    verdictHint: insufficient ? 'insufficient_evidence' : 'sample_ok',
  };
}
