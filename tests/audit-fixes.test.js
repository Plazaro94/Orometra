// Regresiones de la auditoría P0/P1 (procedencia, roles, dedupe, sampling, fmt).
import { pairTables, roleFromTable, inferParamsSingle } from '../js/schema.js';
import { formatSetValue, fingerprintAnalysis, buildReport } from '../js/export.js';
import { runAnalysis } from '../js/analysis.js';
import { DEFAULT_POLICY } from '../js/metrics.js';
import { CODE } from '../js/errors.js';
import { buildDemoTables } from '../js/demo.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}
function section(t) { console.log(`\n=== ${t} ===`); }

function makeOptTables({ backMismatch = false, dupParams = false } = {}) {
  const isHeaders = ['Pass', 'Result', 'Profit', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Equity DD %', 'Trades', 'a', 'b'];
  const oosHeaders = ['Pass', 'Forward Result', 'Back Result', 'Profit', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Equity DD %', 'Trades', 'a', 'b'];
  const isRows = [];
  const oosRows = [];
  let pass = 0;
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
    const g = Math.exp(-((a - 1.5) ** 2 + (b - 1.5) ** 2) / 2);
    const isResult = 40 + 40 * g;
    const back = backMismatch && pass === 0 ? isResult + 50 : isResult;
    const metrics = (scale) => [
      100000 * g * scale, 1.2 + 0.4 * g, 2 + 2 * g, 1.5 + g, 8 + 10 * (1 - g), Math.round(400 * (0.8 + 0.4 * g)),
    ];
    isRows.push([pass, isResult, ...metrics(1), a + 1, b + 1]);
    oosRows.push([pass, isResult * 0.9, back, ...metrics(0.9), a + 1, b + 1]);
    if (dupParams && pass === 1) {
      // Segunda fila con mismos params que pass 0.
      isRows.push([9000 + pass, isResult, ...metrics(1), 1, 1]);
      oosRows.push([9000 + pass, isResult * 0.9, isResult, ...metrics(0.9), 1, 1]);
    }
    pass++;
  }
  return [
    { name: 'IS', sheet: 't', format: 'test', headers: isHeaders, rows: isRows },
    { name: 'OOS', sheet: 't', format: 'test', headers: oosHeaders, rows: oosRows },
  ];
}

section('roleFromTable');
{
  check('IS sin Forward', roleFromTable({ headers: ['Pass', 'Result', 'Profit Factor', 'a'] }) === 'is');
  check('OOS con Forward Result', roleFromTable({ headers: ['Pass', 'Forward Result', 'Back Result', 'a'] }) === 'oos');
  check('OOS con Back Result solo', roleFromTable({ headers: ['Pass', 'Back Result', 'Profit'] }) === 'oos');
}

section('procedencia hard-fail');
{
  const [isOk, oosOk] = makeOptTables();
  const ok = runAnalysis({ isTable: isOk, oosTable: oosOk, policy: DEFAULT_POLICY });
  check('misma procedencia analiza', ok.plateaus.length >= 0);

  const [isBad, oosBad] = makeOptTables({ backMismatch: true });
  let threw = null;
  try {
    runAnalysis({ isTable: isBad, oosTable: oosBad, policy: DEFAULT_POLICY });
  } catch (e) {
    threw = e;
  }
  check('procedencia rota lanza SCHEMA_ERROR', threw && threw.code === CODE.SCHEMA_ERROR, threw && threw.message);
}

section('dedupe + sampling');
{
  const demo = buildDemoTables();
  const a = runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable, policy: DEFAULT_POLICY });
  check('demo casi llena = grid', a.meta.sampling === 'grid', a.meta.sampling);
  check('demo coverage alta', a.meta.coverage >= 0.95, String(a.meta.coverage));

  const [isD, oosD] = makeOptTables({ dupParams: true });
  // Forzar mismatch off; pair by pass — extra dups have unique passes but same params
  const d = runAnalysis({ isTable: isD, oosTable: oosD, policy: { ...DEFAULT_POLICY, gates: { ...DEFAULT_POLICY.gates, minProfitFactor: 1.05, maxDrawdownPct: 40, minTrades: 50 } } });
  check('reporta duplicateParamVectors', (d.integrity.duplicateParamVectors || 0) >= 1, String(d.integrity.duplicateParamVectors));
}

section('formatSetValue / locale');
{
  check('decimal con punto', formatSetValue(1.5) === '1.5');
  check('entero sin punto', formatSetValue(10) === '10');
  check('bool true', formatSetValue(true) === 'true');
}

section('inferParamsSingle categóricos');
{
  const table = {
    headers: ['Pass', 'Profit Factor', 'Mode', 'n'],
    rows: [
      [0, 1.3, 'A', 1], [1, 1.4, 'B', 2], [2, 1.2, 'A', 3],
      [3, 1.5, 'B', 1], [4, 1.1, 'A', 2], [5, 1.6, 'B', 3],
      [6, 1.3, 'A', 1], [7, 1.4, 'B', 2], [8, 1.2, 'A', 3],
      [9, 1.5, 'B', 1], [10, 1.1, 'A', 2], [11, 1.6, 'B', 3],
    ],
  };
  const inf = inferParamsSingle(table);
  check('detecta Mode como param', inf.params.some((p) => p.name === 'Mode'), inf.params.map((p) => p.name).join(','));
  check('detecta n numerico', inf.params.some((p) => p.name === 'n'));
}

section('pairTables provenance compared');
{
  const [isT, oosT] = makeOptTables();
  const paired = pairTables(isT, oosT);
  check('provenance checked', paired.integrity.provenance.checked);
  check('mismatches 0', paired.integrity.provenance.mismatches === 0);
}

section('Lote 2: isThenOos + fingerprint export');
{
  const [isT, oosT] = makeOptTables();
  const a = runAnalysis({ isTable: isT, oosTable: oosT, policy: { ...DEFAULT_POLICY } });
  check('selectionMode isThenOos por defecto', a.meta.selectionMode === 'isThenOos', a.meta.selectionMode);
  check('meseta con oosValidation', a.plateaus.length === 0 || (a.plateaus[0].oosValidation && Number.isFinite(a.plateaus[0].oosValidation.passFrac)));
  check('fragilidad quality en stats', 'fragilityQuality' in a.stats && 'fragilityQualityUsable' in a.stats);
  const fp1 = fingerprintAnalysis(a);
  const fp2 = fingerprintAnalysis(runAnalysis({ isTable: isT, oosTable: oosT, policy: { ...DEFAULT_POLICY } }));
  check('fingerprint estable 8 hex', /^[0-9a-f]{8}$/.test(fp1), fp1);
  check('misma entrada = mismo fingerprint', fp1 === fp2, `${fp1} vs ${fp2}`);
  const rep = buildReport(a);
  check('informe incluye fingerprint', rep.fingerprint === fp1, String(rep.fingerprint));
  check('informe incluye oosValidation en mesetas', !rep.plateaus.length || ('oosValidation' in rep.plateaus[0]));
}

console.log(`\nRESULTADO: ${checks - failures}/${checks}`);
if (failures) process.exit(1);
