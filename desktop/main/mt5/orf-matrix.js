/**
 * ORF → matriz de retornos + suite matrix + veredicto integrado.
 * Puro Node / ES; sin Electron.
 */

import {
  cscvPbo,
  deflatedSharpe,
  effectiveTrials,
  walkForward,
  applyCostStress,
  auditRiskStructure,
} from '../../../core/matrix/index.js';
import { integratedVerdict } from '../../../core/verdict-integrated.js';
import { decodePassPayload } from '../../../core/orf.js';

/**
 * Alinea PnL diario de todas las pasadas en una matriz T×N (filas=días, cols=pasadas).
 * @param {{ passes: object[] }} doc  salida de readOrfBuffer
 */
export function orfDocToMatrix(doc) {
  const passes = doc?.passes || [];
  if (!passes.length) {
    return { matrix: [], passIds: [], dayIndex: [], T: 0, N: 0 };
  }

  const daySet = new Set();
  for (const p of passes) {
    for (const d of p.days || []) daySet.add(d.dayIndex);
  }
  const dayIndex = [...daySet].sort((a, b) => a - b);
  const dayPos = new Map(dayIndex.map((d, i) => [d, i]));
  const T = dayIndex.length;
  const N = passes.length;
  const matrix = Array.from({ length: T }, () => Array(N).fill(0));
  const passIds = passes.map((p) => p.passId);

  passes.forEach((p, j) => {
    for (const d of p.days || []) {
      const i = dayPos.get(d.dayIndex);
      if (i != null) matrix[i][j] = Number(d.pnl) || 0;
    }
  });

  return { matrix, passIds, dayIndex, T, N };
}

/**
 * Heurística de riesgo agregando cabeceras ORF.
 */
export function riskFlagsFromOrf(doc) {
  const passes = doc?.passes || [];
  let lotVaries = false;
  let noStopTrades = 0;
  let totalTrades = 0;
  let maxConcurrent = 0;
  let minLot = Infinity;
  let maxLot = 0;
  let weekendCross = 0;

  for (const p of passes) {
    if (p.lotVaries) lotVaries = true;
    noStopTrades += Number(p.tradesWithoutSl) || 0;
    totalTrades += Number(p.totalClosedTrades) || 0;
    maxConcurrent = Math.max(maxConcurrent, Number(p.maxConcurrent) || 0);
    weekendCross += Number(p.weekendCross) || 0;
    if (Number.isFinite(p.minLot)) minLot = Math.min(minLot, p.minLot);
    if (Number.isFinite(p.maxLot)) maxLot = Math.max(maxLot, p.maxLot);
  }
  if (!Number.isFinite(minLot)) minLot = NaN;

  const audit = auditRiskStructure({
    maxConcurrent,
    minLot,
    maxLot,
    lotVaries,
    noStopTrades,
    totalTrades,
    weekendCross,
  });

  return {
    lotVaries,
    noStopTrades,
    totalTrades,
    maxConcurrent,
    riskVeto: Boolean(audit.veto),
    audit,
  };
}

/**
 * Corre PBO/DSR/WFO/costes sobre un .orf y emite integratedVerdict.
 */
export function analyzeOrfDoc(doc, opts = {}) {
  const decoded = ensureDecodedOrf(doc);
  const { matrix, passIds, dayIndex, T, N } = orfDocToMatrix(decoded);
  const risk = riskFlagsFromOrf(decoded);

  if (T < 4 || N < 2) {
    const verdict = integratedVerdict({
      riskVeto: risk.riskVeto,
      costStillProfitableModerate: null,
      pbo: NaN,
      dsr: NaN,
      reservedOk: opts.reservedOk ?? null,
      sampleInsufficient: true,
      plateauOk: opts.plateauOk ?? false,
      preregistrationHash: opts.preregistrationHash || null,
      searchCounter: opts.searchCounter || null,
    });
    return {
      usable: false,
      reason: N < 2 ? 'need_multiple_passes' : 'insufficient_days',
      T,
      N,
      passIds,
      pbo: null,
      dsr: null,
      wfo: null,
      effectiveTrials: null,
      costs: null,
      risk,
      verdict,
    };
  }

  const S = Math.max(4, Math.min(16, 2 * Math.floor(T / 8)));
  const pbo = cscvPbo(matrix, { S, maxCols: 80, seed: 20260924 });
  const eff = effectiveTrials(matrix, { threshold: 0.15 });

  let bestJ = 0;
  let bestMean = -Infinity;
  for (let j = 0; j < N; j++) {
    let s = 0;
    for (let t = 0; t < T; t++) s += matrix[t][j];
    const m = s / T;
    if (m > bestMean) {
      bestMean = m;
      bestJ = j;
    }
  }
  const bestReturns = matrix.map((row) => row[bestJ]);
  const dsr = deflatedSharpe({
    returns: bestReturns,
    nTrials: Math.max(1, eff.nEffective || N),
  });

  const isLen = Math.max(20, Math.floor(T * 0.4));
  const oosLen = Math.max(10, Math.floor(T * 0.2));
  const wfo = walkForward(matrix, {
    isLen,
    oosLen,
    step: Math.max(5, oosLen),
    rule: 'maximin',
  });

  const tradesPerDay = dayIndex.map((di) => {
    const day = (decoded.passes[bestJ]?.days || []).find((d) => d.dayIndex === di);
    return Number(day?.nTrades) || 0;
  });
  const costs = applyCostStress({
    dailyPnl: bestReturns,
    dailyTrades: tradesPerDay,
    extraCommissionPerTrade: 0.5,
  });

  const profile = opts.profile || {};
  const pboVal = pbo.usable ? pbo.pbo : NaN;
  const dsrVal = dsr.usable ? dsr.dsr : NaN;

  const verdict = integratedVerdict({
    riskVeto: risk.riskVeto,
    costStillProfitableModerate: costs?.stressedNet == null ? null : costs.stressedNet > 0,
    pbo: pboVal,
    dsr: dsrVal,
    reservedOk: opts.reservedOk ?? null,
    sampleInsufficient: T < 30 || N < 5,
    plateauOk: opts.plateauOk ?? (wfo.usable && (wfo.meanEfficiency ?? 0) > 0),
    preregistrationHash: opts.preregistrationHash || null,
    searchCounter: opts.searchCounter || null,
    thresholdPerturbationChanged: false,
  });

  if (profile.maxPbo != null && Number.isFinite(pboVal) && pboVal > profile.maxPbo && verdict.level === 'incubate') {
    verdict.level = 'investigate';
    verdict.reasons = [
      ...(verdict.reasons || []),
      `PBO ${(100 * pboVal).toFixed(0)} % > listón ${100 * profile.maxPbo} %.`,
    ];
  }
  if (profile.minDsr != null && Number.isFinite(dsrVal) && dsrVal < profile.minDsr && verdict.level === 'incubate') {
    verdict.level = 'investigate';
    verdict.reasons = [
      ...(verdict.reasons || []),
      `DSR ${dsrVal.toFixed(3)} < listón ${profile.minDsr}.`,
    ];
  }

  return {
    usable: true,
    T,
    N,
    passIds,
    bestPassId: passIds[bestJ],
    pbo,
    dsr,
    wfo,
    effectiveTrials: eff,
    costs,
    risk,
    verdict,
    profileId: profile.id || null,
  };
}

export function ensureDecodedOrf(doc) {
  if (!doc?.passes?.length) return doc;
  const passes = doc.passes.map((p) => {
    if (p.days) return p;
    if (p.floats) return { passId: p.passId, floats: p.floats, ...decodePassPayload(p.floats) };
    return p;
  });
  return { ...doc, passes, nPasses: passes.length };
}
