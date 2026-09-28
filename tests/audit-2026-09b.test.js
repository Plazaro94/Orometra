// Segunda auditoria (2026-09-28): los tres hallazgos criticos.
//
//   node tests/audit-2026-09b.test.js
//
//   C1  un parametro cuyo nombre contenia "dd" o "sharpe" se tomaba por metrica y se
//       descartaba sin avisar; las filas que quedaban repetidas se resolvian quedandose
//       con la de mejor factor de beneficio (seleccion optimista)
//   C2  un informe del periodo no visto de OTRA configuracion subia el sello a "solida"
//   C3  la prueba de sensibilidad ordenaba las mesetas con otro criterio que el motor

import { metricRole } from '../core/schema.js';
import { runAnalysis } from '../core/analysis.js';
import { DEFAULT_POLICY } from '../core/metrics.js';
import { buildDemoTables } from '../js/demo.js';
import { setLocale } from '../js/i18n.js';
import { state } from '../js/ui-state.js';
import { holdoutFact, displayVerdictLevel } from '../js/ui-verdict.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}
function section(t) { console.log(`\n${'='.repeat(70)}\n${t}\n${'='.repeat(70)}`); }
function rng(seed) {
  let x = seed >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}
setLocale('es');

// ============================================================================
section('C1. Los nombres de parametros no se confunden con metricas');
{
  const expected = {
    AddLots: null, HiddenSL: null, PaddingPips: null, TrailingAdd: null, InpMaxDD: null,
    UseSharpeFilter: null, InpReduccion: null, DD_Limit: null, ExpectedPayoffMin: null,
    'Equity DD %': 'drawdown', 'Balance DD %': 'drawdown', 'Drawdown %': 'drawdown',
    'Max Drawdown': 'drawdown', 'Reducción de la equidad %': 'drawdown',
    'Sharpe Ratio': 'sharpe', 'Ratio de Sharpe': 'sharpe',
    'Expected Payoff': 'expectedPayoff', 'Recovery Factor': 'recoveryFactor',
    'Factor de recuperación': 'recoveryFactor', 'Profit Factor': 'profitFactor', Trades: 'trades',
  };
  for (const [name, role] of Object.entries(expected)) {
    check(`"${name}" -> ${role === null ? 'parametro' : role}`, metricRole(name) === role, String(metricRole(name)));
  }

  // El caso de la auditoria: renombrar InpATR_TP a InpAddTP no puede cambiar el analisis.
  const base = buildDemoTables();
  const a0 = runAnalysis({ isTable: base.isTable, oosTable: base.oosTable });
  const renamed = buildDemoTables();
  for (const t of [renamed.isTable, renamed.oosTable]) {
    t.headers = t.headers.map((h) => (h === 'InpATR_TP' ? 'InpAddTP' : h));
  }
  const a1 = runAnalysis({ isTable: renamed.isTable, oosTable: renamed.oosTable });
  check('InpAddTP se reconoce como parametro', a1.meta.paramNames.includes('InpAddTP'), a1.meta.paramNames.join(','));
  check('mismo numero de configuraciones que con el nombre original', a1.meta.total === a0.meta.total, `${a1.meta.total} vs ${a0.meta.total}`);
  check('mismo nivel de evidencia', a1.verdict.level === a0.verdict.level, `${a1.verdict.level} vs ${a0.verdict.level}`);
  check('ninguna fila repetida', a1.integrity.duplicateParamVectors === 0, String(a1.integrity.duplicateParamVectors));
  check('las columnas tomadas como metrica quedan registradas', Array.isArray(a1.integrity.vetoed) && a1.integrity.vetoed.some((v) => v.name === 'Equity DD %'));

  // Si de verdad falta una columna que distingue pasadas, se avisa y no se elige la mejor.
  const dropped = buildDemoTables();
  for (const t of [dropped.isTable, dropped.oosTable]) {
    const k = t.headers.indexOf('InpATR_TP');
    t.headers = t.headers.filter((_, j) => j !== k);
    t.rows = t.rows.map((row) => row.filter((_, j) => j !== k));
  }
  const a2 = runAnalysis({ isTable: dropped.isTable, oosTable: dropped.oosTable });
  const dupFinding = a2.verdict.findings.find((f) => /par[aá]metros repetidos/.test(f.title));
  check('las filas repetidas se cuentan', a2.integrity.duplicateParamVectors > 0, String(a2.integrity.duplicateParamVectors));
  check('y se avisa en el veredicto', !!dupFinding);
  check('con muchas repetidas el aviso es de tipo advertencia', dupFinding && dupFinding.severity === 'warn', dupFinding && dupFinding.severity);
}

// ============================================================================
section('C2. Solo un periodo no visto de la configuracion propuesta sube el nivel');
{
  const demo = buildDemoTables();
  const a = runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable });
  const rep = a.plateaus[0].record.params;
  const matching = Object.fromEntries(a.meta.paramNames.map((n, j) => [n, String(rep[j])]));
  const other = { ...matching, [a.meta.paramNames[0]]: '999' };
  const set = (report, level, plateauIndex = 0) => {
    state.report = report;
    state.unseen = { plateauIndex, values: {}, result: { level, headline: 'x' }, error: null, tradesAudit: null };
  };

  set({ params: matching }, 'normal');
  check('informe de la configuracion propuesta y resultado normal: valida', holdoutFact(a).ok === true);
  set({ params: other }, 'normal');
  check('informe de OTRA configuracion: no valida', holdoutFact(a).ok === false);
  set({ params: {} }, 'normal');
  check('informe sin parametros legibles: no valida', holdoutFact(a).ok === false);
  set({ params: matching }, 'tail');
  check('resultado "en la cola": no confirma', holdoutFact(a).ok === false);
  if (a.plateaus.length > 1) {
    set(null, 'normal', 1);
    check('se evaluo otra meseta distinta de M1: no valida', holdoutFact(a).ok === false);
  }
  if (a.verdict.level === 'strong') {
    set({ params: other }, 'normal');
    check('con un informe ajeno el sello no pasa de moderada', displayVerdictLevel(a) === 'moderate', displayVerdictLevel(a));
    set({ params: matching }, 'normal');
    check('con el informe correcto el sello es solida', displayVerdictLevel(a) === 'strong', displayVerdictLevel(a));
  }
  state.report = null;
  state.unseen = { plateauIndex: 0, values: {}, result: null, error: null, tradesAudit: null };
}

// ============================================================================
section('C3. La prueba de sensibilidad ordena igual que el motor');
{
  // Dos mesetas: A es mejor en el in-sample pero se hunde en el forward; B aguanta.
  // El motor elige B. Con los umbrales sin apenas mover, la prueba debe elegir B tambien.
  const POLICY = { ...DEFAULT_POLICY, gates: { ...DEFAULT_POLICY.gates, minProfitFactor: 1.05, maxDrawdownPct: 35, minTrades: 100 } };
  const metrics = (g, noise, base) => ({
    profit: 200000 * Math.max(0, g) - 20000 + noise * 8000,
    profitFactor: 1.0 + 0.32 * Math.max(0, g) + noise * 0.02,
    recoveryFactor: 4.2 * Math.max(0, g) + noise * 0.2,
    sharpe: 3.2 * Math.max(0, g) + noise * 0.2,
    drawdown: 6 + 55 * (1 - Math.max(0, g)) + noise * 2,
    trades: Math.round(base * (0.7 + 0.6 * Math.max(0, g))),
  });
  const r = rng(41);
  const pts = [];
  const bump = (z, c, w) => Math.exp(-z.reduce((s, v, j) => s + ((v - c[j]) / w) ** 2, 0) / 2);
  for (let a = 0; a < 20; a++) for (let b = 0; b < 7; b++) for (let c = 0; c < 7; c++) {
    const z = [a, b, c];
    const gA = bump(z, [4, 3, 3], 2.8);
    const gB = bump(z, [15, 3, 3], 2.8);
    const nz = (r() - 0.5) * 0.06;
    const gIs = Math.max(1.0 * gA, 0.95 * gB);
    const gOos = Math.max(0.3 * gA, 0.9 * gB);
    pts.push({
      x: z.map((v) => 10 + v * 5),
      is: metrics(gIs + nz * 0.2, nz, 1600),
      oos: metrics(gOos + nz * 0.2, nz, 900),
      isResult: 40 + 45 * gIs + nz,
      oosResult: 35 + 45 * gOos + nz,
    });
  }
  const names = ['p1', 'p2', 'p3'];
  const isH = ['Pass', 'Result', 'Profit', 'Expected Payoff', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Equity DD %', 'Trades', ...names];
  const oosH = ['Pass', 'Forward Result', 'Back Result', 'Profit', 'Expected Payoff', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Equity DD %', 'Trades', ...names];
  const isT = { name: 'IS', sheet: 'x', format: 'sintetico', headers: isH, rows: pts.map((p, i) => [i, p.isResult, p.is.profit, p.is.profit / 800, p.is.profitFactor, p.is.recoveryFactor, p.is.sharpe, p.is.drawdown, p.is.trades, ...p.x]) };
  const oosT = { name: 'OOS', sheet: 'x', format: 'sintetico', headers: oosH, rows: pts.map((p, i) => [i, p.oosResult, p.isResult, p.oos.profit, p.oos.profit / 800, p.oos.profitFactor, p.oos.recoveryFactor, p.oos.sharpe, p.oos.drawdown, p.oos.trades, ...p.x]) };
  const a = runAnalysis({ isTable: isT, oosTable: oosT, policy: POLICY });
  const best = a.plateaus[0];
  check('hay al menos dos mesetas', a.plateaus.length >= 2, String(a.plateaus.length));
  check('el motor recomienda la meseta que aguanta en forward (B)', best && best.record.params[0] >= 60, best && String(best.record.params));
  const inIsA = a.plateaus.find((p) => p.record.params[0] < 60);
  check('A no aguanta en forward y B si', inIsA && inIsA.oosValidation.passFrac < 0.2 && best.oosValidation.passFrac > 0.8, inIsA && `${inIsA.oosValidation.passFrac} / ${best.oosValidation.passFrac}`);
  const st = a.stats.stabilityCheck;
  check('la prueba de umbrales internos elige la misma region casi siempre', st && st.regionRate >= 0.8, st && `${(100 * st.regionRate).toFixed(0)} %`);
  const crit = a.verdict.findings.find((f) => f.severity === 'critical' && /propios umbrales/.test(f.title));
  check('no aparece el falso critico "no sobrevive a sus propios umbrales"', !crit, crit && crit.title);
}

console.log(`\nRESULTADO: ${checks - failures}/${checks} comprobaciones correctas`);
if (failures) process.exit(1);
