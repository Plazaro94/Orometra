/**
 * Deflated Sharpe Ratio (Bailey & López de Prado, 2014) y nº efectivo de pruebas.
 */

import {
  makeRng, pearson, sharpe, skewness, kurtosis, mean, stdev, numCols, column,
} from './util.js';
import { normCdf, expectedMaxZ } from '../stats.js';

/**
 * Clustering jerárquico simple (single-linkage) sobre distancia sqrt(0.5*(1-ρ)).
 * Devuelve nº de clusters a umbral `threshold` (default 0.5 ≈ ρ=0.5).
 */
export function effectiveTrials(matrix, opts = {}) {
  const N = numCols(matrix);
  const threshold = opts.threshold ?? 0.5;
  if (N <= 1) return { nRaw: N, nEffective: N, clusters: [0] };

  const cols = [];
  for (let j = 0; j < N; j++) cols.push(column(matrix, j));

  // Distancia
  const dist = Array.from({ length: N }, () => new Float64Array(N));
  for (let i = 0; i < N; i++) {
    dist[i][i] = 0;
    for (let j = i + 1; j < N; j++) {
      const r = pearson(cols[i], cols[j]);
      const d = Number.isFinite(r) ? Math.sqrt(Math.max(0, 0.5 * (1 - r))) : 1;
      dist[i][j] = d;
      dist[j][i] = d;
    }
  }

  // Union-find: fusionar pares con d < threshold (versión simplificada tipo ONC)
  const parent = Array.from({ length: N }, (_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const uni = (a, b) => {
    const ra = find(a); const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      if (dist[i][j] < threshold) uni(i, j);
    }
  }
  const roots = new Set();
  const clusters = parent.map((_, i) => find(i));
  for (const c of clusters) roots.add(c);
  return {
    nRaw: N,
    nEffective: roots.size,
    threshold,
    clusters,
  };
}

/**
 * DSR: Prob(SR* > SR̂ | H0: SR=0 tras N pruebas), forma Bailey-LdP.
 * srObserved: Sharpe de la serie elegida (por periodo de la serie).
 * nObs: longitud de la serie.
 * nTrials: nº efectivo de pruebas.
 */
export function deflatedSharpe({
  returns,
  nTrials,
  srBenchmark = 0,
}) {
  const sr = sharpe(returns);
  const n = returns.filter(Number.isFinite).length;
  const g3 = skewness(returns);
  const g4 = kurtosis(returns); // exceso
  if (!Number.isFinite(sr) || n < 5 || !(nTrials >= 1)) {
    return {
      usable: false, dsr: NaN, sr, n, nTrials, skewness: g3, excessKurtosis: g4,
    };
  }

  // EE del Sharpe con corrección por momentos (Bailey & LdP)
  const sr2 = sr * sr;
  const se = Math.sqrt(
    (1 + 0.5 * sr2 - g3 * sr + ((g4 + 3) / 4) * sr2) / (n - 1),
  );
  // Expectativa del máximo Sharpe bajo H0 ~ 0 con nTrials pruebas
  const zMax = expectedMaxZ(nTrials);
  const srMaxExpected = srBenchmark + se * zMax;
  // DSR = Φ((SR̂ - SR_max_expected) / se)
  const dsr = se > 0 ? normCdf((sr - srMaxExpected) / se) : (sr > srMaxExpected ? 1 : 0);

  return {
    usable: true,
    method: 'DeflatedSharpeRatio',
    citation: 'Bailey & López de Prado (2014)',
    dsr,
    sr,
    srMaxExpected,
    se,
    n,
    nTrials,
    skewness: g3,
    excessKurtosis: g4,
  };
}

/**
 * Combina effective trials de la matriz + ledger previo + declarado (cota inferior).
 */
export function totalTrialsLowerBound({
  matrixEffective,
  ledgerPassesEffective = 0,
  declaredPriorApprox = null,
}) {
  const parts = {
    thisMatrix: matrixEffective || 0,
    ledger: ledgerPassesEffective || 0,
    declared: declaredPriorApprox == null ? 0 : declaredPriorApprox,
  };
  return {
    totalLowerBound: parts.thisMatrix + parts.ledger + parts.declared,
    parts,
    note: 'lower_bound_only',
  };
}

export { mean, stdev };
