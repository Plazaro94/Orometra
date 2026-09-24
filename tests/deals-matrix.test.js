// Pruebas de core/matrix/from-deals.js: de la lista de operaciones del informe HTML
// de backtest a la serie diaria, y de ahí a Monte Carlo / muestra / costes / swap.

import { dailySeriesFromDeals, auditUnseenTrades } from '../core/matrix/from-deals.js';

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
function syntheticDeals(days, { drift = 3, noise = 1, swapEach = 0 } = {}) {
  const deals = [];
  const start = new Date(Date.UTC(2024, 0, 1));
  for (let d = 0; d < days; d++) {
    const dt = new Date(start.getTime() + d * 86400000);
    const date = `${dt.getUTCFullYear()}.${String(dt.getUTCMonth() + 1).padStart(2, '0')}.${String(dt.getUTCDate()).padStart(2, '0')}`;
    for (let k = 0; k < 2; k++) {
      const wiggle = ((d * 7 + k * 3) % 5) - 2; // -2..2 determinista
      const profit = drift + wiggle * noise;
      deals.push({
        time: `${date} ${10 + k}:00:00`,
        profit,
        commission: -0.1,
        swap: swapEach,
        cost: -0.1 + swapEach,
        net: profit - 0.1 + swapEach,
        volume: 0.1,
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
