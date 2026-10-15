/**
 * ¿Cómo calcula el lote el EA? Decide en qué unidad se puede remuestrear (docs/MONTECARLO.md,
 * sección 5.2):
 *
 * - 'fixed': lote fijo, o riesgo fijo en dinero. El resultado de cada día en dinero se puede
 *   sumar con el de cualquier otro día: se trabaja en dinero.
 * - 'proportional': el lote crece con el balance. Una operación de hoy no vale lo mismo que una
 *   de hace tres años: se trabaja en rendimiento (log del balance).
 * - 'martingale': el lote sube después de perder. Su riesgo está en una racha que, si no salió
 *   en el backtest, ningún remuestreo puede producir: no se calcula.
 *
 * Es una heurística y la pantalla deja corregirla. Señales:
 * - martingala: tras una pérdida, la operación siguiente lleva más lote bastante más a menudo
 *   que tras una ganancia (con un lote proporcional pasa lo contrario: tras perder, el balance
 *   baja y el lote también);
 * - proporcional: el lote crece con el balance (pendiente del log del lote frente al log del
 *   balance de 0,5 o más) y el balance cambia lo bastante para notarlo (un 25 % o más).
 *   No se mira la pérdida de cada operación: con lote fijo en un índice que triplica su precio,
 *   las pérdidas en dinero también crecen con el tiempo. Y un riesgo fijo en dinero cambia el
 *   lote con la distancia al stop y con el precio, no con el balance (en el primer informe real,
 *   el lote bajó de 4,13 a 0,86 mientras el balance se triplicaba).
 */

const MIN_TRADES = 10;
const MIN_EACH = 10;      // pérdidas y ganancias seguidas de otra operación, como mínimo
const UP = 1.05;          // «más lote»: un 5 % más (por encima del redondeo al paso del lote)
const MARTINGALE_AFTER_LOSS = 0.4;
const MARTINGALE_GAP = 0.3;
const MIN_GROWTH = 1.25;
const PROPORTIONAL_SLOPE = 0.5;

const lotOf = (d) => (Number.isFinite(d.closedVolume) && d.closedVolume > 0 ? d.closedVolume : d.volume);

/**
 * @param {object[]} deals  operaciones de cierre del informe (core/report.js), en orden
 * @returns {{kind: 'fixed'|'proportional'|'martingale', signal: string, ...}}
 *   signal: 'pocas_operaciones' | 'lote_constante' | 'sube_tras_perder' | 'crece_con_balance'
 *   | 'balance_estable' | 'no_crece_con_balance' | 'sin_balance'
 */
export function detectSizing(deals) {
  const ds = (Array.isArray(deals) ? deals : []).filter((d) => Number.isFinite(lotOf(d)) && lotOf(d) > 0 && Number.isFinite(d.net));
  if (ds.length < MIN_TRADES) return { kind: 'fixed', signal: 'pocas_operaciones', trades: ds.length };
  const lots = ds.map(lotOf);
  const minLot = Math.min(...lots);
  const maxLot = Math.max(...lots);
  if (maxLot <= minLot * (1 + 1e-9)) return { kind: 'fixed', signal: 'lote_constante', lot: minLot };

  let afterLoss = 0; let upAfterLoss = 0; let afterWin = 0; let upAfterWin = 0;
  for (let i = 0; i + 1 < ds.length; i++) {
    const up = lots[i + 1] > lots[i] * UP;
    if (ds[i].net < 0) { afterLoss++; if (up) upAfterLoss++; } else if (ds[i].net > 0) { afterWin++; if (up) upAfterWin++; }
  }
  const rLoss = afterLoss ? upAfterLoss / afterLoss : 0;
  const rWin = afterWin ? upAfterWin / afterWin : 0;
  const martingale = { upAfterLoss: rLoss, upAfterWin: rWin, afterLoss, afterWin };
  if (afterLoss >= MIN_EACH && afterWin >= MIN_EACH && rLoss >= MARTINGALE_AFTER_LOSS && rLoss - rWin >= MARTINGALE_GAP) {
    return { kind: 'martingale', signal: 'sube_tras_perder', martingale };
  }

  // Balance antes de cada operación: el informe trae el de después.
  const before = ds.map((d) => d.balance - d.net);
  if (!before.every((b) => Number.isFinite(b) && b > 0)) return { kind: 'fixed', signal: 'sin_balance', martingale };
  const growth = Math.max(...before) / Math.min(...before);
  if (growth < MIN_GROWTH) return { kind: 'fixed', signal: 'balance_estable', growth, martingale };
  const x = before.map(Math.log);
  const y = lots.map(Math.log);
  const mx = x.reduce((a, v) => a + v, 0) / x.length;
  const my = y.reduce((a, v) => a + v, 0) / y.length;
  let sxy = 0; let sxx = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const slope = sxx > 0 ? sxy / sxx : 0;
  return slope >= PROPORTIONAL_SLOPE
    ? { kind: 'proportional', signal: 'crece_con_balance', slope, growth, martingale }
    : { kind: 'fixed', signal: 'no_crece_con_balance', slope, growth, martingale };
}
