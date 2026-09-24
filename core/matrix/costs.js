/**
 * Stress de costes analítico de primer orden.
 * Resta coste extra por volumen/operaciones diarias.
 */

import { mean, cumsum, maxDrawdown, numRows, numCols, column } from './util.js';

/**
 * @param opts.dailyVolume [T] lotes
 * @param opts.dailyTrades [T] nº operaciones
 * @param opts.dailyPnl [T] pnl
 * @param opts.extraSpreadMoneyPerLot — dinero por lote por día de volumen (aprox)
 * @param opts.extraSlippagePerSide — por operación (ambos lados ≈ ×2 si one-way count)
 * @param opts.extraCommissionPerTrade
 */
export function applyCostStress(opts) {
  const {
    dailyPnl,
    dailyVolume = null,
    dailyTrades = null,
    extraSpreadMoneyPerLot = 0,
    extraSlippagePerSide = 0,
    extraCommissionPerTrade = 0,
    scalpingWarning = false,
  } = opts;

  const T = dailyPnl.length;
  const stressed = new Array(T);
  let totalCost = 0;
  for (let t = 0; t < T; t++) {
    const vol = dailyVolume ? (dailyVolume[t] || 0) : 0;
    const n = dailyTrades ? (dailyTrades[t] || 0) : 0;
    const cost = extraSpreadMoneyPerLot * vol
      + extraSlippagePerSide * 2 * n
      + extraCommissionPerTrade * n;
    totalCost += cost;
    stressed[t] = (dailyPnl[t] || 0) - cost;
  }
  const baseNet = dailyPnl.reduce((a, b) => a + (b || 0), 0);
  const stressedNet = stressed.reduce((a, b) => a + b, 0);
  return {
    baseNet,
    stressedNet,
    totalCost,
    degradation: baseNet !== 0 ? (baseNet - stressedNet) / Math.abs(baseNet) : NaN,
    stillProfitable: stressedNet > 0,
    stressedReturns: stressed,
    maxDrawdownStressed: maxDrawdown(stressed),
    orientative: scalpingWarning,
    note: scalpingWarning
      ? 'first_order_approx_scalping'
      : 'first_order_approx',
  };
}

/** Escenarios por defecto: base / moderado / severo. */
export function costScenarios(dailyPnl, dailyVolume, dailyTrades, custom = {}) {
  const scenarios = {
    base: { extraSpreadMoneyPerLot: 0, extraSlippagePerSide: 0, extraCommissionPerTrade: 0 },
    moderate: {
      extraSpreadMoneyPerLot: custom.moderateSpread ?? 0.5,
      extraSlippagePerSide: custom.moderateSlippage ?? 0.2,
      extraCommissionPerTrade: custom.moderateCommission ?? 0,
    },
    severe: {
      extraSpreadMoneyPerLot: custom.severeSpread ?? 1.5,
      extraSlippagePerSide: custom.severeSlippage ?? 0.5,
      extraCommissionPerTrade: custom.severeCommission ?? 0.1,
    },
  };
  const out = {};
  for (const [name, c] of Object.entries(scenarios)) {
    out[name] = applyCostStress({
      dailyPnl, dailyVolume, dailyTrades, ...c,
      scalpingWarning: Boolean(custom.scalpingWarning),
    });
  }
  return out;
}

/**
 * Punto de equilibrio: coste extra constante por operación que anula la ventaja.
 * Si no hay operaciones, usa coste por unidad de PnL.
 */
export function breakEvenExtraCostPerTrade(dailyPnl, dailyTrades) {
  const net = dailyPnl.reduce((a, b) => a + (b || 0), 0);
  const trades = (dailyTrades || []).reduce((a, b) => a + (b || 0), 0);
  if (!(trades > 0)) return { usable: false, breakEven: NaN };
  return { usable: true, breakEven: net / trades, net, trades };
}
