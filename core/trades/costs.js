/**
 * Stress de costes analítico de primer orden.
 *
 * POR QUÉ LOS ESCENARIOS SE MIDEN SOBRE EL PRECIO Y NO EN DINERO.
 *
 * La versión anterior restaba cantidades fijas de dinero (0,5 por lote de spread, 0,2 por
 * lado de slippage…). Eso no significa nada fuera de un instrumento y un lote concretos:
 * la misma estrategia en EURUSD salía «no rentable» con 0,01 lotes (el escenario equivalía
 * a 4 pips por operación) y «rentable» con 1 lote (0,09 pips). En oro, índices o cuentas
 * en otra divisa, ni siquiera eso.
 *
 * Lo que sí es comparable entre instrumentos es el coste como FRACCIÓN DEL PRECIO: 1 punto
 * básico (0,01 %) es ~1 pip en EURUSD, ~0,20 en oro a 2.000 o ~0,5 puntos en el S&P 500 a
 * 5.000, del orden de un spread normal en todos ellos. Para pasarlo a dinero hace falta
 * saber cuánto vale un movimiento de precio por lote, y eso se deduce de las propias
 * operaciones del informe: beneficio / (movimiento de precio × lotes) — ver
 * `contractValues`. Así el coste escala con el lote y con el instrumento, como el real.
 */

import { maxDrawdown } from './util.js';
import { median } from '../stats.js';

/** Escenarios por defecto: coste extra por operación (ida y vuelta), en puntos básicos del precio. */
export const COST_SCENARIOS_BP = { base: 0, moderate: 1, severe: 3 };

/**
 * Valor en dinero de un movimiento de 1,0 en el precio, por lote, para cada símbolo.
 *
 * Sale de las operaciones que se han podido emparejar con su apertura (core/report.js):
 * beneficio bruto / ((cierre − apertura) × sentido × lotes cerrados). Se toma la MEDIANA,
 * así que alguna pareja mal casada (varias posiciones abiertas a la vez) no la mueve. Si
 * la cuenta y el instrumento están en divisas distintas, el valor varía un poco con el
 * tipo de cambio; la mediana da el típico del periodo, que basta para un stress de
 * primer orden.
 *
 * Se exigen al menos 5 parejas y que casi todas coincidan (dispersión pequeña): si no,
 * no se inventa el valor y el stress se omite.
 */
export function contractValues(deals) {
  const bySym = new Map();
  for (const d of deals || []) {
    if (!d || !Number.isFinite(d.price) || !Number.isFinite(d.openPrice) || !d.positionSide) continue;
    const move = (d.price - d.openPrice) * (d.positionSide === 'buy' ? 1 : -1);
    const vol = d.closedVolume;
    if (!(Number.isFinite(vol) && vol > 0) || !Number.isFinite(d.profit) || d.profit === 0) continue;
    // Un movimiento de precio ínfimo dispara el cociente: se exige al menos un 0,002 %
    // del precio (unos 2 puntos en EURUSD), para que el redondeo del precio no mande.
    if (!(Math.abs(move) >= 2e-5 * d.price)) continue;
    const v = d.profit / (move * vol);
    if (!(v > 0) || !Number.isFinite(v)) continue;
    const key = d.symbol || '';
    if (!bySym.has(key)) bySym.set(key, { values: [], prices: [], digits: [] });
    const b = bySym.get(key);
    b.values.push(v);
    b.prices.push(d.price);
    if (Number.isFinite(d.digits)) b.digits.push(d.digits);
  }
  const out = {};
  for (const [sym, b] of bySym) {
    if (b.values.length < 5) continue;
    const med = median(b.values);
    // Coherencia: la mayoría de las parejas deben dar casi el mismo valor (±10 %).
    const agree = b.values.filter((v) => Math.abs(v / med - 1) <= 0.1).length / b.values.length;
    if (agree < 0.6) continue;
    const digits = b.digits.length ? Math.max(...b.digits) : NaN;
    out[sym] = {
      valuePerPriceUnit: med,
      medianPrice: median(b.prices),
      point: Number.isFinite(digits) ? 10 ** -digits : NaN,
      samples: b.values.length,
      agreement: agree,
    };
  }
  return out;
}

/**
 * @param opts.dailyPnl       [T] pnl
 * @param opts.dailyNotional  [T] valor nominal negociado cada día, en dinero de la cuenta
 *                            (precio × lotes × valor por unidad de precio)
 * @param opts.extraBp        coste extra por operación, en puntos básicos del precio
 * Se conservan los costes en dinero (`extraCommissionPerTrade`…) para usos directos.
 */
export function applyCostStress(opts) {
  const {
    dailyPnl,
    dailyVolume = null,
    dailyTrades = null,
    dailyNotional = null,
    extraBp = 0,
    extraSpreadMoneyPerLot = 0,
    extraSlippagePerSide = 0,
    extraCommissionPerTrade = 0,
  } = opts;

  const T = dailyPnl.length;
  const stressed = new Array(T);
  let totalCost = 0;
  for (let t = 0; t < T; t++) {
    const vol = dailyVolume ? (dailyVolume[t] || 0) : 0;
    const n = dailyTrades ? (dailyTrades[t] || 0) : 0;
    const notional = dailyNotional ? (dailyNotional[t] || 0) : 0;
    const cost = extraBp * 1e-4 * notional
      + extraSpreadMoneyPerLot * vol
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
    note: 'first_order_approx',
  };
}

/**
 * Escenarios base / moderado / severo en puntos básicos del precio. Sin valor nominal
 * (no se pudo deducir el valor del contrato) devuelve null: un coste en dinero fijo no
 * significaría lo mismo en dos instrumentos ni con dos lotes distintos.
 */
export function costScenarios(dailyPnl, dailyNotional, scenariosBp = COST_SCENARIOS_BP) {
  if (!dailyNotional || !dailyNotional.some((v) => v > 0)) return null;
  const out = {};
  for (const [name, bp] of Object.entries(scenariosBp)) {
    out[name] = { bp, ...applyCostStress({ dailyPnl, dailyNotional, extraBp: bp }) };
  }
  return out;
}

/**
 * Punto de equilibrio: coste extra constante por operación que anula la ventaja.
 * Además del dinero por operación (que depende del lote), se da por LOTE negociado y, si
 * se conoce el valor nominal, en puntos básicos del precio y en puntos del instrumento:
 * esas dos cifras no dependen del lote y se comparan directamente con tu spread.
 */
export function breakEvenExtraCostPerTrade(dailyPnl, dailyTrades, extra = {}) {
  const net = dailyPnl.reduce((a, b) => a + (b || 0), 0);
  const trades = (dailyTrades || []).reduce((a, b) => a + (b || 0), 0);
  if (!(trades > 0)) return { usable: false, breakEven: NaN };
  const { totalVolume, totalNotional, contract } = extra;
  const perLot = totalVolume > 0 ? net / totalVolume : NaN;
  const bp = totalNotional > 0 ? (net / totalNotional) * 1e4 : NaN;
  // En puntos del instrumento solo si hay un único símbolo (con varios, un «punto» no es
  // la misma cosa en todos).
  const points = contract && Number.isFinite(contract.point) && contract.point > 0
    && Number.isFinite(perLot) && contract.valuePerPriceUnit > 0
    ? perLot / (contract.valuePerPriceUnit * contract.point)
    : NaN;
  return { usable: true, breakEven: net / trades, net, trades, perLot, bp, points };
}

/** Puntos del instrumento que equivalen a `bp` puntos básicos de su precio típico. */
export function bpToPoints(bp, contract) {
  if (!contract || !(contract.point > 0) || !(contract.medianPrice > 0)) return NaN;
  return (bp * 1e-4 * contract.medianPrice) / contract.point;
}
