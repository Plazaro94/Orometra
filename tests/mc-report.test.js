// Pruebas de respuesta conocida para core/trades/mc-report.js: el backtest largo partido en
// tramos por fechas de corte (docs/MONTECARLO.md, 6.1).

import { splitByCuts, tradesMonteCarlo, summaryFromDeals, FORECAST_MIN_DAYS } from '../core/trades/mc-report.js';
import { makeRng } from '../core/rng.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}
function section(t) { console.log(`\n=== ${t} ===`); }

const iso = (t) => new Date(t).toISOString().slice(0, 10);
const mt5 = (t) => `${iso(t).replace(/-/g, '.')} 12:00:00`;
/** Una operación por día laborable desde `start`, con lote fijo; `open` días antes del cierre. */
function deals(start, weekdays, { seed = 1, open = 0, pnl } = {}) {
  const r = makeRng(seed);
  const out = [];
  let t = Date.UTC(...start); let n = 0; let bal = 10000;
  while (n < weekdays) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) {
      n++;
      const net = pnl ? pnl(t) : 10 * (r() - 0.45);
      bal += net;
      out.push({ time: mt5(t), openTime: mt5(t - open * 86400000), net, volume: 0.1, balance: bal });
    }
    t += 86400000;
  }
  return out;
}

section('Reparto por fecha de cierre');
{
  const ds = deals([2024, 0, 1], 260); // lunes 1 de enero de 2024, un año
  const s = splitByCuts(ds, { optEnd: '2024-03-31', chooseEnd: '2024-06-30' });
  check('tres tramos: optimizado, forward y no visto', s.ok && s.segments.map((x) => x.key).join() === 'opt,fwd,clean');
  check('no se pierde ni se repite ninguna operación', s.segments.reduce((a, x) => a + x.deals.length, 0) === ds.length);
  check('el día del corte es del tramo anterior', s.segments[0].deals.at(-1).time.startsWith('2024.03.29') && s.segments[1].deals[0].time.startsWith('2024.04.01'));
  check('el tramo limpio empieza el día siguiente al último usado', s.segments[2].from === '2024-07-01' && s.clean[0].time.startsWith('2024.07.01'));
  const two = splitByCuts(ds, { chooseEnd: '2024-06-30' });
  check('sin fin del optimizado: usado y no visto', two.ok && two.segments.map((x) => x.key).join() === 'used,clean');
  check('fin del optimizado igual al último usado: sin forward', splitByCuts(ds, { optEnd: '2024-06-30', chooseEnd: '2024-06-30' }).segments.length === 2);

  const held = deals([2024, 0, 1], 260, { open: 3 });
  const h = splitByCuts(held, { chooseEnd: '2024-06-30' });
  check('una posición abierta antes del corte y cerrada después cuenta en el tramo posterior, y se cuenta', h.segments[1].straddling >= 1 && h.segments[1].straddling <= 3, String(h.segments[1].straddling));
  check('sin posiciones que crucen, cero', s.segments.every((x) => x.straddling === 0));
}

section('Fechas que no valen');
{
  const ds = deals([2024, 0, 1], 260);
  check('el último día usado después de la última operación', splitByCuts(ds, { chooseEnd: '2025-06-30' }).error === 'sin_operaciones_despues');
  check('el último día usado igual al de la última operación', splitByCuts(ds, { chooseEnd: '2024-12-27' }).error === 'sin_operaciones_despues');
  check('el último día usado antes de la primera operación', splitByCuts(ds, { chooseEnd: '2023-06-30' }).error === 'sin_operaciones_antes');
  check('fin del optimizado después del último día usado', splitByCuts(ds, { optEnd: '2024-08-01', chooseEnd: '2024-06-30' }).error === 'orden');
  check('fecha mal escrita', splitByCuts(ds, { chooseEnd: '30/06/2024' }).error === 'fecha_no_valida');
  const r = tradesMonteCarlo(ds, { cuts: { chooseEnd: '2025-06-30' } });
  check('tradesMonteCarlo dice el motivo y el periodo del informe', !r.usable && r.reason === 'cortes' && r.period.from === '2024-01-01' && r.period.to === '2024-12-27');
}

section('La previsión mira solo el tramo limpio');
{
  // Tres años: los dos primeros, usados para elegir; el último, limpio (menos de 2 años).
  const ds = deals([2022, 0, 3], 780);
  const whole = tradesMonteCarlo(ds);
  check('sin cortes, tres años bastan para los datos de la previsión', whole.days >= FORECAST_MIN_DAYS && !whole.forecastData.missing.includes('dias'));
  const cut = tradesMonteCarlo(ds, { cuts: { chooseEnd: '2023-12-29' } });
  check('con el corte, el tramo limpio es de un año y no basta', cut.days < FORECAST_MIN_DAYS && cut.forecastData.missing.includes('dias'), String(cut.days));
  check('radiografía de cada tramo y del informe entero', cut.segments.map((x) => x.key).join() === 'used,clean,all' && cut.segments.every((x) => x.radiography && x.radiography.usable));
  check('la radiografía de arriba es la del tramo limpio', cut.radiography.trades === cut.segments[1].trades);
  const totalClean = ds.filter((d) => d.time.slice(0, 10) > '2023.12.29').reduce((a, d) => a + d.net, 0);
  check('el resultado del tramo limpio es la suma de sus operaciones', Math.abs(cut.segments[1].radiography.total - totalClean) < 1e-9);
}

section('Cifras para el contraste con la meseta, como las calcula MT5');
{
  // A gana 10 brutos y B pierde 5; cada una paga 1 al abrir y 1 al cerrar. MT5 suma por
  // transacción: ganancias 10 − 1 = 9; pérdidas: las dos aperturas (1 + 1) y el cierre de B (5 + 1).
  const ds = [
    { profit: 10, swap: 0, commission: -2, openCommission: -1, net: 8 },
    { profit: -5, swap: 0, commission: -2, openCommission: -1, net: -7 },
  ];
  const s = summaryFromDeals(ds);
  check('operaciones y beneficio neto', s.trades === 2 && s.profit === 1);
  check('factor de beneficio por transacción: 9 / 8 = 1,125', Math.abs(s.profitFactor - 1.125) < 1e-12, String(s.profitFactor));
  check('sin pérdidas, no hay factor de beneficio', Number.isNaN(summaryFromDeals([{ profit: 3, swap: 0, commission: 0, openCommission: 0, net: 3 }]).profitFactor));
}

console.log(`\nRESULTADO: ${checks - failures}/${checks}`);
if (failures) process.exit(1);
