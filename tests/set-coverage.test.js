// Cobertura vs .set + parser de rangos MT5.
import {
  parseSetText, parseSetToken, levelsFromRange, coverageAgainstSet, looksLikeSetFile,
} from '../js/setfile.js';
import { runAnalysis } from '../js/analysis.js';
import { DEFAULT_POLICY } from '../js/metrics.js';
import { buildDemoTables } from '../js/demo.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}
function section(t) { console.log(`\n=== ${t} ===`); }

section('parseSetText');
{
  const txt = `; comment
InpA=10||5||5||20||Y
InpB=true||true||0||true||N
InpMode=Fast
`;
  const p = parseSetText(txt);
  check('lee 3 params', p.params.length === 3, String(p.params.length));
  check('rango optimizado', p.params[0].hasRange && p.params[0].enabled && p.params[0].start === 5);
  check('bool fijo', p.params[1].enabled === false);
  check('valor simple', p.params[2].value === 'Fast');
  check('parseSetToken bool', parseSetToken('true') === true);
  check('levelsFromRange 5..20 step 5', levelsFromRange(5, 5, 20).join(',') === '5,10,15,20');
  check('looksLikeSetFile por nombre', looksLikeSetFile('opt.set', ''));
  check('looksLikeSetFile por contenido', looksLikeSetFile('x.txt', 'InpA=1||0||1||10||Y\n'));
}

section('coverageAgainstSet vs demo (set = malla observada)');
{
  const demo = buildDemoTables();
  const a0 = runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable, policy: { ...DEFAULT_POLICY } });
  const lines = a0.meta.paramNames.map((n, j) => {
    const vals = [...new Set(a0.records.map((r) => r.params[j]).filter((v) => typeof v === 'number' && Number.isFinite(v)))]
      .sort((a, b) => a - b);
    if (vals.length < 2) return `${n}=${vals[0] || 0}||${vals[0] || 0}||0||${vals[0] || 0}||N`;
    const step = vals[1] - vals[0];
    return `${n}=${vals[0]}||${vals[0]}||${step}||${vals[vals.length - 1]}||Y`;
  });
  const setFile = parseSetText(lines.join('\n'));
  const cov = coverageAgainstSet(a0.meta.paramNames, a0.records.map((r) => r.params), setFile);
  check('usable', cov.usable, JSON.stringify({ usable: cov.usable, reason: cov.reason }));
  check('coverageSearch finita', Number.isFinite(cov.coverageSearch), String(cov.coverageSearch));
  check('coverageSearch alta cuando .set = malla vista', cov.coverageSearch >= 0.9, String(cov.coverageSearch));

  const a1 = runAnalysis({
    isTable: demo.isTable,
    oosTable: demo.oosTable,
    policy: { ...DEFAULT_POLICY },
    searchSet: setFile,
  });
  check('meta.searchCoverage usable', a1.meta.searchCoverage && a1.meta.searchCoverage.usable);
  check('finding menciona .set o cobertura', (a1.verdict.findings || []).some((f) => /\.set|cobertura|coverage/i.test(f.title)));
}

section('cobertura engañosa: rincón denso vs .set amplio');
{
  const isHeaders = ['Pass', 'Result', 'Profit', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Equity DD %', 'Trades', 'x', 'y'];
  const oosHeaders = ['Pass', 'Forward Result', 'Back Result', 'Profit', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Equity DD %', 'Trades', 'x', 'y'];
  const isRows = [];
  const oosRows = [];
  let pass = 0;
  for (let x = 1; x <= 4; x++) for (let y = 1; y <= 4; y++) {
    const g = Math.exp(-((x - 2.5) ** 2 + (y - 2.5) ** 2) / 2);
    const isResult = 40 + 40 * g;
    const metrics = (scale) => [
      100000 * g * scale, 1.2 + 0.4 * g, 2 + 2 * g, 1.5 + g, 8 + 10 * (1 - g), Math.round(400 * (0.8 + 0.4 * g)),
    ];
    isRows.push([pass, isResult, ...metrics(1), x, y]);
    oosRows.push([pass, isResult * 0.9, isResult, ...metrics(0.9), x, y]);
    pass++;
  }
  const isTable = { headers: isHeaders, rows: isRows, sheet: 'IS', format: 'xml', name: 'is.xml' };
  const oosTable = { headers: oosHeaders, rows: oosRows, sheet: 'FW', format: 'xml', name: 'oos.xml' };
  const setFile = parseSetText('x=1||1||1||20||Y\ny=1||1||1||20||Y\n');
  const a = runAnalysis({
    isTable,
    oosTable,
    policy: { ...DEFAULT_POLICY, gates: { ...DEFAULT_POLICY.gates, minProfitFactor: 1.05, maxDrawdownPct: 40, minTrades: 50 } },
    searchSet: setFile,
  });
  check('cobertura observada alta', a.meta.coverage >= 0.9, String(a.meta.coverage));
  check('cobertura .set baja', a.meta.searchCoverage && a.meta.searchCoverage.coverageSearch < 0.1, String(a.meta.searchCoverage && a.meta.searchCoverage.coverageSearch));
  check('aviso discrepancia o % bajo', (a.verdict.findings || []).some((f) => /engañ|mislead|\.set|rango|Solo /i.test(f.title)));
}

section('copy DoF / Sharpe');
{
  const demo = buildDemoTables();
  const a = runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable, policy: { ...DEFAULT_POLICY } });
  const titles = (a.verdict.findings || []).map((f) => f.title).join(' | ');
  check('no dice grados de libertad', !/grados de libertad|degrees of freedom/i.test(titles), titles.slice(0, 200));
  check('títulos no venden “Sharpe deflactado”', !/Sharpe deflactado|deflated Sharpe/i.test(titles), titles.slice(0, 200));
}

console.log(`\nRESULTADO: ${checks - failures}/${checks}`);
if (failures) process.exit(1);
