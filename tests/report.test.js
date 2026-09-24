// Pruebas del lector de informes de backtest individual.
//
//   node tests/report.test.js
//
// Con un informe real si esta disponible; si no, con uno sintetico que reproduce la
// estructura que genera MT5 (UTF-16, etiquetas en castellano, parametros uno por fila,
// comision repartida entre apertura y cierre).

import fs from 'node:fs';
import path from 'node:path';
import { parseBacktestReport, looksLikeReport, compareParams } from '../core/report.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}
function section(t) { console.log(`\n${'='.repeat(70)}\n${t}\n${'='.repeat(70)}`); }

// ------------------------------------------------------------------ sintetico
function syntheticReport() {
  const deals = [];
  let balance = 100000;
  let id = 2;
  // 40 operaciones: cada una con su apertura (comision) y su cierre (comision + resultado).
  for (let k = 0; k < 40; k++) {
    const gross = k % 3 === 0 ? -180.5 : 240.25;
    const com = -3.5;
    balance += com;
    deals.push(`<tr><td>2020.01.${String((k % 28) + 1).padStart(2, '0')} 10:00:00</td><td>${id++}</td><td>EURUSD</td><td>buy</td><td>in</td><td>0.5</td><td>1.1000</td><td>${k}</td><td>${com.toFixed(2)}</td><td>0.00</td><td>0.00</td><td>${balance.toFixed(2)}</td><td></td></tr>`);
    balance += com + gross;
    deals.push(`<tr><td>2020.01.${String((k % 28) + 1).padStart(2, '0')} 15:00:00</td><td>${id++}</td><td>EURUSD</td><td>sell</td><td>out</td><td>0.5</td><td>1.1050</td><td>${k}</td><td>${com.toFixed(2)}</td><td>0.00</td><td>${gross.toFixed(2)}</td><td>${balance.toFixed(2)}</td><td></td></tr>`);
  }
  const netProfit = balance - 100000;
  return {
    html: `<!DOCTYPE html><html><body>
<div>Informe del Probador de Estrategias</div>
<table>
<tr><td>Experto:</td><td><b>Mi EA de prueba</b></td></tr>
<tr><td>S&iacute;mbolo:</td><td><b>EURUSD</b></td></tr>
<tr><td>Per&iacute;odo:</td><td><b>M15 (2020.01.01 - 2020.06.30)</b></td></tr>
<tr><td>Par&aacute;metros de entrada:</td><td><b>=== 1) General ====</b></td></tr>
<tr><td></td><td><b>InpPeriodo=14</b></td></tr>
<tr><td></td><td><b>InpMultiplicador=2.5</b></td></tr>
<tr><td></td><td><b>InpUsarFiltro=true</b></td></tr>
<tr><td></td><td><b>=== 2) Riesgo ====</b></td></tr>
<tr><td></td><td><b>InpRiesgo=1.0</b></td></tr>
<tr><td>Resultados</td></tr>
<tr><td>Beneficio Neto:</td><td>${netProfit.toFixed(2)}</td><td>Reducci&oacute;n relativa de la equidad:</td><td>7.42% (3 210.55)</td></tr>
<tr><td>Factor de Beneficio:</td><td>1.85</td><td>Beneficio Esperado:</td><td>${(netProfit / 40).toFixed(2)}</td></tr>
<tr><td>Factor de Recuperaci&oacute;n:</td><td>4.10</td><td>Ratio de Sharpe:</td><td>2.15</td></tr>
<tr><td>Total de operaciones ejecutadas:</td><td>40</td><td>Total de transacciones:</td><td>80</td></tr>
</table>
<table>
<tr><th>Transacciones</th></tr>
<tr><th>Fecha/Hora</th><th>Transacci&oacute;n</th><th>S&iacute;mbolo</th><th>Tipo</th><th>Direcci&oacute;n</th><th>Volumen</th><th>Precio</th><th>Orden</th><th>Comisi&oacute;n</th><th>Swap</th><th>Beneficio</th><th>Balance</th><th>Comentario</th></tr>
<tr><td>2020.01.01 00:00:00</td><td>1</td><td></td><td>balance</td><td></td><td></td><td></td><td></td><td>0.00</td><td>0.00</td><td>100 000.00</td><td>100 000.00</td><td></td></tr>
${deals.join('\n')}
</table></body></html>`,
    netProfit,
  };
}

section('1. Informe sintetico');
{
  const { html, netProfit } = syntheticReport();
  check('se reconoce como informe', looksLikeReport(html));
  const r = parseBacktestReport(html, 'sintetico.html');

  check('lee el nombre del EA', r.meta.expert === 'Mi EA de prueba', String(r.meta.expert));
  check('lee el simbolo', r.meta.symbol === 'EURUSD', String(r.meta.symbol));
  check('lee el marco temporal', r.meta.timeframe === 'M15', String(r.meta.timeframe));
  check('lee las FECHAS del periodo',
    r.meta.from && r.meta.from.toISOString().slice(0, 10) === '2020-01-01'
    && r.meta.to && r.meta.to.toISOString().slice(0, 10) === '2020-06-30',
    `${r.meta.from} -> ${r.meta.to}`);
  check('calcula la duracion en dias', r.meta.days === 181, String(r.meta.days));

  check('extrae los 4 parametros', Object.keys(r.params).length === 4, JSON.stringify(r.params));
  check('descarta las cabeceras de seccion del EA',
    !Object.keys(r.params).some((k) => k.startsWith('=')), Object.keys(r.params).join(','));
  check('conserva los valores tal cual', r.params.InpMultiplicador === '2.5' && r.params.InpUsarFiltro === 'true',
    JSON.stringify(r.params));

  check('lee el factor de beneficio', r.metrics.profitFactor === 1.85, String(r.metrics.profitFactor));
  check('lee el drawdown como porcentaje', r.metrics.drawdown === 7.42, String(r.metrics.drawdown));
  check('cuenta OPERACIONES, no transacciones', r.metrics.trades === 40, String(r.metrics.trades));

  check('recupera las 40 operaciones cerradas', r.deals.length === 40, String(r.deals.length));
  // Lo importante: el neto de cada operacion incluye la comision de su apertura, que va
  // en otra fila. Si no se arrastrase, la suma no cuadraria con el informe.
  const net = r.deals.reduce((a, d) => a + d.net, 0);
  check('la suma de los netos reproduce el beneficio del informe',
    Math.abs(net - netProfit) < 0.01, `${net.toFixed(2)} vs ${netProfit.toFixed(2)}`);
  const bruto = r.deals.reduce((a, d) => a + d.profit, 0);
  check('el bruto es mayor que el neto (hay costes)', bruto > net, `${bruto.toFixed(2)} vs ${net.toFixed(2)}`);
}

section('2. Comparacion de parametros');
{
  const reportParams = { InpA: '10', InpB: '2.5', InpC: 'true' };
  const igual = compareParams(reportParams, ['InpA', 'InpB', 'InpC'], [10, 2.5, true]);
  check('detecta que coinciden', igual.matches && igual.different.length === 0, JSON.stringify(igual.different));
  const distinto = compareParams(reportParams, ['InpA', 'InpB'], [10, 3.5]);
  check('detecta una diferencia', distinto.different.length === 1 && distinto.different[0].name === 'InpB',
    JSON.stringify(distinto.different));
  const falta = compareParams(reportParams, ['InpA', 'InpZ'], [10, 1]);
  check('detecta un parametro ausente', falta.missing.includes('InpZ'), JSON.stringify(falta.missing));
}

section('3. Rechazo de ficheros que no son informes');
{
  let msg = '';
  try { parseBacktestReport('<html><body>una pagina cualquiera</body></html>'); } catch (e) { msg = e.message; }
  check('avisa con instrucciones', /informe|probador/i.test(msg), msg);
}

section('4. Informe real de MT5');
const real = process.env.MT5_REPORT
  || path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Desktop', 'ReportTester-4000098256.html');
if (fs.existsSync(real)) {
  const buf = fs.readFileSync(real);
  const text = new TextDecoder('utf-16le').decode(buf);
  const r = parseBacktestReport(text, path.basename(real));
  console.log(`  ${r.meta.expert} | ${r.meta.symbol} ${r.meta.timeframe} | ${r.meta.days} dias | ${r.deals.length} operaciones`);
  check('lee el periodo real', r.meta.days > 0 && Number.isFinite(r.meta.days), String(r.meta.days));
  check('extrae muchos parametros', Object.keys(r.params).length > 30, String(Object.keys(r.params).length));
  check('las operaciones coinciden con el total declarado',
    r.deals.length === r.metrics.trades, `${r.deals.length} vs ${r.metrics.trades}`);
  const net = r.deals.reduce((a, d) => a + d.net, 0);
  check('la suma de netos cuadra con el beneficio declarado',
    Math.abs(net - r.metrics.profit) < 0.05, `${net.toFixed(2)} vs ${r.metrics.profit.toFixed(2)}`);
  check('todas las metricas son numeros finitos',
    ['profit', 'profitFactor', 'recoveryFactor', 'sharpe', 'expectedPayoff', 'drawdown', 'trades']
      .every((k) => Number.isFinite(r.metrics[k])),
    JSON.stringify(r.metrics));
} else {
  console.log(`  (omitido: no se encuentra ${real})`);
}

section(failures ? `RESULTADO: ${checks - failures}/${checks} — ${failures} FALLO(S)` : `RESULTADO: ${checks}/${checks} correctas`);
process.exit(failures ? 1 : 0);
