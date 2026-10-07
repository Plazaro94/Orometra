// Pruebas de core/trades/from-deals.js: de la lista de operaciones del informe HTML
// de backtest a la serie diaria, y de ahí a Monte Carlo / muestra / costes / swap.

import { dailySeriesFromDeals, auditUnseenTrades } from '../core/trades/from-deals.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`);
  }
}
function section(t) { console.log(`\n=== ${t} ===`); }

/** N días, 2 operaciones por día, con una deriva y un poco de ruido determinista. */
function syntheticDeals(days, { drift = 3, noise = 1, swapEach = 0, lot = 0.1 } = {}) {
  const deals = [];
  const start = new Date(Date.UTC(2024, 0, 1));
  for (let d = 0; d < days; d++) {
    const dt = new Date(start.getTime() + d * 86400000);
    const date = `${dt.getUTCFullYear()}.${String(dt.getUTCMonth() + 1).padStart(2, '0')}.${String(dt.getUTCDate()).padStart(2, '0')}`;
    for (let k = 0; k < 2; k++) {
      const wiggle = ((d * 7 + k * 3) % 5) - 2; // -2..2 determinista
      const profit = (drift + wiggle * noise) * (lot / 0.1);
      // EURUSD de 5 decimales con contrato de 100.000: el precio de cierre reproduce el
      // beneficio, como en un informe real (core/report.js empareja cierre y apertura).
      const open = 1.1;
      deals.push({
        symbol: 'EURUSD',
        openPrice: open,
        price: open + profit / (100000 * lot),
        positionSide: 'buy',
        closedVolume: lot,
        digits: 5,
        time: `${date} ${10 + k}:00:00`,
        profit,
        commission: -0.1 * (lot / 0.1),
        swap: swapEach,
        cost: -0.1 * (lot / 0.1) + swapEach,
        net: profit - 0.1 * (lot / 0.1) + swapEach,
        volume: lot,
      });
    }
  }
  return deals;
}

section('dailySeriesFromDeals — agrupación');
{
  const deals = syntheticDeals(20);
  const s = dailySeriesFromDeals(deals);
  check('usable', s.usable);
  check('20 días', s.days === 20, String(s.days));
  check('40 operaciones en total', s.totalTrades === 40, String(s.totalTrades));
  check('2 operaciones por día', s.dailyTrades.every((n) => n === 2));

  const sinFecha = dailySeriesFromDeals([{ time: 'no es una fecha', net: 1 }]);
  check('sin fecha reconocible -> no usable', !sinFecha.usable && sinFecha.reason === 'fechas_no_reconocidas');

  const vacio = dailySeriesFromDeals([]);
  check('sin operaciones -> no usable', !vacio.usable);
}

section('auditUnseenTrades — con ventaja clara');
{
  const deals = syntheticDeals(60, { drift: 5, noise: 1 });
  const a = auditUnseenTrades(deals, { nTrials: 1 });
  check('usable', a.usable);
  check('60 días', a.days === 60, String(a.days));
  check('bootstrap usable', a.bootstrap.usable);
  check('bootstrap: media positiva', a.bootstrap.meanOfSeries > 0, String(a.bootstrap.meanOfSeries));
  check('sample: veredicto ok con ventaja clara y estable', a.sample.verdictHint === 'sample_ok', a.sample.verdictHint);
  check('costes: escenario severo definido', a.costs.severe.usable !== false && Number.isFinite(a.costs.severe.stressedNet));
  check('costes: severo degrada el neto frente a base', a.costs.severe.stressedNet < a.costs.base.stressedNet);
  check('break-even calculado', a.breakEven.usable);
  check('sin aviso de swap (swap nulo)', !a.warnings.some((w) => w.code === 'SWAP_DOMINANCE'));
}

section('stress de costes — no depende del lote ni del instrumento');
{
  const v = [0.01, 1, 10].map((lot) => auditUnseenTrades(syntheticDeals(60, { drift: 2, noise: 1, lot })));
  check('valor del contrato deducido (EURUSD ≈ 100.000 por unidad de precio)', v.every((a) => a.contract && Math.abs(a.contract.valuePerPriceUnit / 100000 - 1) < 1e-6));
  check('punto: 0,00001 (5 decimales)', v.every((a) => Math.abs(a.contract.point - 1e-5) < 1e-12));
  check('mismo veredicto en el escenario moderado con 0,01, 1 y 10 lotes',
    new Set(v.map((a) => a.costs.moderate.stillProfitable)).size === 1);
  check('misma degradación relativa con cualquier lote',
    v.every((a) => Math.abs(a.costs.severe.degradation - v[0].costs.severe.degradation) < 1e-6),
    v.map((a) => a.costs.severe.degradation).join(' / '));
  check('punto de equilibrio en puntos igual con cualquier lote',
    v.every((a) => Math.abs(a.breakEven.points - v[0].breakEven.points) < 1e-6),
    v.map((a) => a.breakEven.points).join(' / '));
  check('el escenario moderado es +1 pb del precio', v[0].costs.moderate.bp === 1);

  // Sin precio de apertura (informe sin columna Precio): no se inventa un coste en dinero.
  const sinPrecio = auditUnseenTrades(syntheticDeals(60).map(({ openPrice, ...d }) => d));
  check('sin valor del contrato: no hay escenarios', sinPrecio.costs === null && sinPrecio.contract === null);
  check('sin valor del contrato: punto de equilibrio por lote sí', Number.isFinite(sinPrecio.breakEven.perLot));
}

section('auditUnseenTrades — pocos días');
{
  const deals = syntheticDeals(3);
  const a = auditUnseenTrades(deals);
  check('no usable con pocos días', !a.usable && a.reason === 'pocos_dias');
}

section('auditUnseenTrades — swap dominante');
{
  // Ventaja pequeña y swap negativo grande: el swap explica buena parte del resultado.
  const deals = syntheticDeals(40, { drift: 1, noise: 0.2, swapEach: -0.8 });
  const a = auditUnseenTrades(deals);
  check('usable', a.usable);
  check('avisa de dominancia del swap', a.warnings.some((w) => w.code === 'SWAP_DOMINANCE'), JSON.stringify(a.swap));
}

console.log(`\nRESULTADO: ${checks - failures}/${checks}`);
if (failures) process.exit(1);
