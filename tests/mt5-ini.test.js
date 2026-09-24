// Pruebas de generación .ini del Strategy Tester (sin MT5).

import { buildTesterIni, estimateCombinations } from '../desktop/main/mt5/ini.js';

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

console.log('\n=== mt5-ini: buildTesterIni ===');
{
  let threw = false;
  try { buildTesterIni({}); } catch { threw = true; }
  check('exige Expert/Symbol/fechas/Report', threw);

  const ini = buildTesterIni({
    expert: 'Examples\\MACD\\MACD Sample',
    symbol: 'EURUSD',
    period: 'H1',
    fromDate: '2020-01-01',
    toDate: '2023.12.31',
    report: 'C:\\tmp\\orometra_report',
    optimization: 1,
    model: 1,
    inputs: [
      { name: 'Fast', value: 10, start: 5, step: 5, stop: 20, optimize: true },
      { name: 'Slow', value: 50, optimize: false },
    ],
  });

  check('sección [Tester]', /^\[Tester\]/m.test(ini));
  check('sección [TesterInputs]', /\[TesterInputs\]/.test(ini));
  check('Expert presente', /Expert=Examples\\MACD\\MACD Sample/.test(ini));
  check('Symbol=EURUSD', /Symbol=EURUSD/.test(ini));
  check('FromDate con puntos', /FromDate=2020\.01\.01/.test(ini));
  check('ToDate', /ToDate=2023\.12\.31/.test(ini));
  check('ReplaceReport=1', /ReplaceReport=1/.test(ini));
  check('ShutdownTerminal=1', /ShutdownTerminal=1/.test(ini));
  check('input optimizado Y', /Fast=10\|\|5\|\|5\|\|20\|\|Y/.test(ini));
  check('input fijo N', /Slow=50\|\|0\|\|0\|\|0\|\|N/.test(ini));
  check('CRLF o LF finales', /\r?\n$/.test(ini));
}

console.log('\n=== mt5-ini: estimateCombinations ===');
{
  const none = estimateCombinations([
    { name: 'A', value: 1, optimize: false },
  ]);
  check('sin Y → 1 combinación', none.combinations === 1 && none.optimizedParams === 0);

  // 5,10,15,20 = 4 niveles; 1,2,3 = 3 → 12
  const grid = estimateCombinations([
    { name: 'Fast', start: 5, step: 5, stop: 20, optimize: true },
    { name: 'Slow', start: 1, step: 1, stop: 3, enabled: true },
    { name: 'Fixed', value: 9, optimize: false },
  ]);
  check('producto de niveles', grid.combinations === 12, `got ${grid.combinations}`);
  check('2 params optimizados', grid.optimizedParams === 2);
  check('no capped', grid.capped === false);
}

console.log(`\nmt5-ini.test.js: ${checks - failures}/${checks} ok`);
if (failures) process.exit(1);
