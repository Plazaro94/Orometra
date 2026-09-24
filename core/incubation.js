/**
 * Incubación (Fase 6): bandas esperadas y comparación con historial real.
 */

import { stationaryBootstrap } from './matrix/bootstrap.js';
import { mean, maxDrawdown, cumsum } from './matrix/util.js';

/**
 * Fija bandas ANTES de incubar a partir del bootstrap del OOS.
 */
export function incubationBands(oosReturns, opts = {}) {
  const boot = stationaryBootstrap(oosReturns, {
    sims: opts.sims ?? 5000,
    seed: opts.seed ?? 20260924,
    meanBlock: opts.meanBlock,
    painDd: opts.painDd,
  });
  if (!boot.usable) return { usable: false, boot };

  const nOpsNeeded = opts.minTradesToJudge ?? 30;
  return {
    usable: true,
    fixedAt: new Date().toISOString(),
    horizons: {
      m1: { days: 21, returnCi: scaleCi(boot.returnCi, 21 / Math.max(1, oosReturns.length)), ddP95: boot.maxDdCi.p95 },
      m3: { days: 63, returnCi: scaleCi(boot.returnCi, 63 / Math.max(1, oosReturns.length)), ddP95: boot.maxDdCi.p95 },
      m6: { days: 126, returnCi: scaleCi(boot.returnCi, 126 / Math.max(1, oosReturns.length)), ddP95: boot.maxDdCi.p95 },
    },
    minTradesToJudge: nOpsNeeded,
    painDd: opts.painDd ?? boot.maxDdCi.p95,
    recommendLiveMinLot: true,
    recommendNote: 'A live micro-lot account often informs more than a demo (execution differs). Choice is yours.',
    bootstrap: boot,
  };
}

function scaleCi(ci, factor) {
  // Aprox. lineal en horizonte (orientativo)
  const f = Math.min(2, Math.max(0.05, factor));
  return { p05: ci.p05 * f, p50: ci.p50 * f, p95: ci.p95 * f };
}

/**
 * Compara resultado realizado con bandas fijadas.
 * stopRules definidos antes: p.ej. dd > p95 → alerta parar.
 */
export function compareIncubation(realized, bands, stopRules = {}) {
  const { netProfit = 0, maxDd = 0, trades = 0, horizon = 'm3' } = realized;
  const h = bands.horizons?.[horizon];
  if (!bands.usable || !h) {
    return { usable: false, alerts: [] };
  }

  const alerts = [];
  const ddLimitRaw = stopRules.ddPercentile ?? bands.painDd ?? h.ddP95;
  const ddLimit = Number.isFinite(ddLimitRaw) ? ddLimitRaw : 0;
  if (Number.isFinite(maxDd) && maxDd > ddLimit) {
    alerts.push({
      code: 'STOP_DD',
      severity: 'stop',
      message: `Drawdown realizado (${maxDd}) supera el límite fijado antes de incubar (${ddLimit}). Parar y revisar.`,
    });
  }

  let position = 'inside';
  if (netProfit < h.returnCi.p05) position = 'below';
  else if (netProfit > h.returnCi.p95) position = 'above';

  const underpowered = trades < (bands.minTradesToJudge || 0);

  // Calibración de costes (si vienen spreads reales vs simulados)
  let costCalibration = null;
  if (realized.avgSlippage != null && realized.simulatedSlippage != null) {
    costCalibration = {
      slippageDelta: realized.avgSlippage - realized.simulatedSlippage,
      spreadDelta: (realized.avgSpread ?? 0) - (realized.simulatedSpread ?? 0),
    };
  }

  return {
    usable: true,
    horizon,
    position,
    netProfit,
    expected: h.returnCi,
    maxDd,
    ddLimit,
    underpowered,
    alerts,
    costCalibration,
  };
}
