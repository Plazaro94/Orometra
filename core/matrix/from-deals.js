// Convierte la lista de operaciones del informe HTML de backtest (core/report.js) en
// una serie DIARIA de PnL/volumen/operaciones, y con ella corre Monte Carlo, tamaño de
// muestra y stress de costes sobre el periodo no visto.
//
// El export de optimización de MT5 solo trae métricas agregadas por pasada: nunca se
// podría hacer esto con él. El informe de backtest de UNA configuración sí trae la
// lista de transacciones una a una, y es justo lo único que MT5 exporta que permite un
// Monte Carlo serio: reordenar operaciones reales, no simular una distribución
// inventada. Se agrupa por día (no por operación) porque los horizontes de "3/6/12
// meses" del bootstrap (core/matrix/bootstrap.js) están calibrados en días de mercado
// (63/126/252): mezclar granularidades les haría decir una cosa por otra.

import { applyCostStress, costScenarios, breakEvenExtraCostPerTrade } from './costs.js';
import { stationaryBootstrap } from './bootstrap.js';
import { sampleAudit } from './sample.js';
import { dataWarnings } from './risk.js';

const DAY_RE = /(\d{4})[.\-/](\d{2})[.\-/](\d{2})/;

function dayKey(time) {
  const m = DAY_RE.exec(String(time || ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * Agrupa `deals` por día de cierre. Si alguna operación no trae una fecha reconocible
 * (informe con formato inesperado), no se reparte a medias: se marca `usable:false` en
 * vez de mezclar días reales con un reparto inventado.
 */
export function dailySeriesFromDeals(deals) {
  if (!Array.isArray(deals) || !deals.length) {
    return { usable: false, reason: 'sin_operaciones' };
  }
  const byDay = new Map();
  let totalSwap = 0;
  let totalCommission = 0;
  let totalNet = 0;
  for (const d of deals) {
    const key = dayKey(d.time);
    if (!key) return { usable: false, reason: 'fechas_no_reconocidas' };
    if (!byDay.has(key)) byDay.set(key, { pnl: 0, volume: 0, trades: 0 });
    const bucket = byDay.get(key);
    bucket.pnl += Number.isFinite(d.net) ? d.net : 0;
    bucket.volume += Number.isFinite(d.volume) ? d.volume : 0;
    bucket.trades += 1;
    totalSwap += Number.isFinite(d.swap) ? d.swap : 0;
    totalCommission += Number.isFinite(d.commission) ? d.commission : 0;
    totalNet += Number.isFinite(d.net) ? d.net : 0;
  }
  // Los días de mercado SIN cierres también cuentan: sin ellos, un EA que cierra una
  // operación por semana tendría "63 días" de serie en 63 semanas, y los horizontes de
  // 3/6/12 meses del bootstrap medirían otra cosa. Se rellenan con 0 los días laborables
  // (lunes a viernes) entre el primer y el último cierre; un cierre en fin de semana se
  // conserva como su propio día.
  const traded = Array.from(byDay.keys()).sort();
  const toUtc = (k) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
  const pad = (n) => String(n).padStart(2, '0');
  const DAY = 86400000;
  const first = toUtc(traded[0]);
  const last = toUtc(traded[traded.length - 1]);
  const keys = [];
  for (let t = first; t <= last; t += DAY) {
    const d = new Date(t);
    const k = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const wd = d.getUTCDay();
    if (byDay.has(k)) keys.push(k);
    else if (wd !== 0 && wd !== 6) {
      byDay.set(k, { pnl: 0, volume: 0, trades: 0 });
      keys.push(k);
    }
  }
  return {
    usable: true,
    days: keys.length,
    tradingDays: traded.length,
    dailyPnl: keys.map((k) => byDay.get(k).pnl),
    dailyVolume: keys.map((k) => byDay.get(k).volume),
    dailyTrades: keys.map((k) => byDay.get(k).trades),
    totalSwap,
    totalCommission,
    totalNet,
    totalTrades: deals.length,
  };
}

/**
 * Auditoría completa del periodo no visto a partir de la lista de operaciones:
 * Monte Carlo (bootstrap estacionario), tamaño de muestra / potencia, stress de costes
 * y aviso de dominancia del swap.
 *
 * @param deals    `report.deals` de core/report.js
 * @param opts.nTrials  nº de configuraciones probadas en la optimización, para el
 *                      contraste de potencia (por defecto 1: sin corregir por selección)
 */
export function auditUnseenTrades(deals, opts = {}) {
  const series = dailySeriesFromDeals(deals);
  if (!series.usable) return { usable: false, reason: series.reason };
  if (series.days < 5) return { usable: false, reason: 'pocos_dias', days: series.days };

  const bootstrap = stationaryBootstrap(series.dailyPnl, { seed: opts.seed });
  const sample = sampleAudit(series.dailyPnl, { nTrials: opts.nTrials ?? 1 });
  const costs = costScenarios(series.dailyPnl, series.dailyVolume, series.dailyTrades);
  const breakEven = breakEvenExtraCostPerTrade(series.dailyPnl, series.dailyTrades);

  // El swap lo aplica el tester con la tasa ACTUAL a todo el histórico simulado: cuanto
  // más pesa sobre el resultado neto, menos fiable es ese resultado si el swap real
  // varió en el periodo. `avgTradeDays` (duración media de cada operación) no está
  // disponible: el informe de transacciones no trae la hora de apertura, solo la de
  // cierre, así que el aviso solo usa el umbral que no depende de ella.
  const totalAbsNet = Math.abs(series.totalNet);
  const swapPctOfPnl = totalAbsNet > 1e-9
    ? Math.min(1, Math.abs(series.totalSwap) / totalAbsNet)
    : (Math.abs(series.totalSwap) > 1e-9 ? 1 : 0);
  const warnings = dataWarnings({ swapPctOfPnl });

  return {
    usable: true,
    days: series.days,
    trades: series.totalTrades,
    bootstrap,
    sample,
    costs,
    breakEven,
    swap: { totalSwap: series.totalSwap, totalCommission: series.totalCommission, pctOfPnl: swapPctOfPnl },
    warnings,
  };
}

export { applyCostStress };
