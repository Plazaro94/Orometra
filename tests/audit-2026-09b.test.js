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
import { holdoutFact, displayVerdictLevel, displayVerdictCopy } from '../js/ui-verdict.js';
import { parseBacktestReport } from '../core/report.js';
import { dailySeriesFromDeals } from '../core/trades/from-deals.js';
import { refinementRange } from '../core/engine.js';

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
    // Desde la enmienda del 2026-10-09: un informe ajeno no dice nada de la propuesta, ni a
    // favor ni en contra. El nivel se queda como lo dio el motor y sin la mención.
    check('con un informe ajeno el nivel no cambia', displayVerdictLevel(a) === 'strong', displayVerdictLevel(a));
    check('y no dice que el periodo no visto no la contradiga', !/no la contradice/.test(displayVerdictCopy(a).headline), displayVerdictCopy(a).headline);
    set({ params: matching }, 'tail');
    check('si el periodo no visto va en contra, baja a moderada', displayVerdictLevel(a) === 'moderate', displayVerdictLevel(a));
    set({ params: matching }, 'outside');
    check('fuera de rango tambien baja a moderada', displayVerdictLevel(a) === 'moderate', displayVerdictLevel(a));
    set({ params: matching }, 'normal');
    check('con el informe correcto sigue en solida', displayVerdictLevel(a) === 'strong', displayVerdictLevel(a));
    check('y lo dice en el titular', /no la contradice/.test(displayVerdictCopy(a).headline), displayVerdictCopy(a).headline);
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
  const build = (oA, oB) => {
  const r = rng(41);
  const pts = [];
  const bump = (z, c, w) => Math.exp(-z.reduce((s, v, j) => s + ((v - c[j]) / w) ** 2, 0) / 2);
  for (let a = 0; a < 20; a++) for (let b = 0; b < 7; b++) for (let c = 0; c < 7; c++) {
    const z = [a, b, c];
    const gA = bump(z, [4, 3, 3], 2.8);
    const gB = bump(z, [15, 3, 3], 2.8);
    const nz = (r() - 0.5) * 0.06;
    const gIs = Math.max(1.0 * gA, 0.95 * gB);
    const gOos = Math.max(oA * gA, oB * gB);
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
  return runAnalysis({ isTable: isT, oosTable: oosT, policy: POLICY });
  };
  globalThis.__buildTwoPlateaus = build;
  const a = build(0.3, 0.9);
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

// ============================================================================
section('I3. Meseta en el in-sample que no aguanta en el forward');
{
  const a = globalThis.__buildTwoPlateaus(-1, -1);
  const titles = a.verdict.findings.map((f) => f.title);
  check('ninguna pasa en forward, pero hay mesetas en el in-sample', a.meta.gatePassCount === 0 && a.plateaus.length > 0);
  check('no es "evidencia insuficiente"', a.verdict.level !== 'insufficient', a.verdict.level);
  check('hallazgo especifico del forward', titles.includes('Ninguna configuración cumple tus mínimos en el forward'), titles.join(' | '));
  check('sin el juicio "es la estrategia"', !a.verdict.findings.some((f) => /es la estrategia/.test(f.detail)));
}

// ============================================================================
section('I1. Los parametros de un informe en ingles se leen');
{
  const html = `<!DOCTYPE html><html><body><div>Strategy Tester Report</div><table>
<tr><td>Expert:</td><td><b>My EA</b></td></tr>
<tr><td>Symbol:</td><td><b>EURUSD</b></td></tr>
<tr><td>Period:</td><td><b>H1 (2021.01.01 - 2021.12.31)</b></td></tr>
<tr><td>Inputs:</td><td><b>InpFast=10</b></td></tr>
<tr><td></td><td><b>InpSlow=50</b></td></tr>
<tr><td>Results</td></tr>
<tr><td>Total Net Profit:</td><td>1200.00</td></tr>
</table></body></html>`;
  const r = parseBacktestReport(html, 'en.html');
  check('lee InpFast e InpSlow', r.params.InpFast === '10' && r.params.InpSlow === '50', JSON.stringify(r.params));
}

// ============================================================================
section('I2. La serie diaria cuenta los dias de mercado sin operaciones');
{
  const deals = [];
  const t0 = Date.UTC(2023, 0, 2); // lunes
  for (let w = 0; w < 104; w++) {
    const d = new Date(t0 + w * 7 * 86400000);
    deals.push({ time: `${d.toISOString().slice(0, 10).replace(/-/g, '.')} 12:00`, net: w % 3 ? 15 : -20, volume: 0.1, swap: 0, commission: -1 });
  }
  const s2 = dailySeriesFromDeals(deals);
  check('104 cierres semanales en 2 anos dan ~516 dias de mercado', s2.days > 500 && s2.days < 530, String(s2.days));
  check('el resultado total no cambia', Math.abs(s2.dailyPnl.reduce((x, y) => x + y, 0) - s2.totalNet) < 1e-9);
  check('se conserva cuantos dias tuvieron cierres', s2.tradingDays === 104, String(s2.tradingDays));
}

// ============================================================================
section('I8. El contraste del Sharpe dice las pruebas que usa, con coma decimal');
{
  const d = buildDemoTables();
  const a = runAnalysis({ isTable: d.isTable, oosTable: d.oosTable });
  const f = a.verdict.findings.find((x) => /Sharpe/.test(x.title));
  check('menciona las pruebas efectivas', f && /pruebas efectivas/.test(f.detail) && f.detail.includes(String(a.stats.sharpeTest.effectiveTrials)), f && f.detail);
  check('decimales con coma en espanol', f && /\d,\d{2}/.test(f.detail) && !/\d\.\d{2}\b/.test(f.detail), f && f.detail);
}

// ============================================================================
section('I9. El .set de refinamiento cuenta las combinaciones que genera MT5');
{
  const r = refinementRange(1, [[0], [1], [2], [3]], [[10, 13, 20, 40]], ['X'], null, ['number']);
  check('niveles 10,13,20,40 -> 10..40 paso 3 = 11 valores', r[0].start === 10 && r[0].stop === 40 && r[0].step === 3 && r[0].levels === 11, JSON.stringify(r[0]));
}

// ============================================================================
section('FWD-1. La meseta no depende de cuantas pasadas reexporte MT5 al forward');
{
  // MT5 solo pasa al forward las mejores pasadas. Antes se buscaban las mesetas solo entre
  // ellas: sin ver las vecinas que fallan, la meseta salia inflada (13 en vez de 5).
  const POLICY = { ...DEFAULT_POLICY, gates: { ...DEFAULT_POLICY.gates, minProfitFactor: 1.05, maxDrawdownPct: 35, minTrades: 100 } };
  const metrics = (g, noise, base) => ({
    profit: 200000 * Math.max(0, g) - 20000 + noise * 8000,
    profitFactor: 1.0 + 0.32 * Math.max(0, g) + noise * 0.02,
    recoveryFactor: 4.2 * Math.max(0, g) + noise * 0.2,
    sharpe: 3.2 * Math.max(0, g) + noise * 0.2,
    drawdown: 6 + 55 * (1 - Math.max(0, g)) + noise * 2,
    trades: Math.round(base * (0.7 + 0.6 * Math.max(0, g))),
  });
  const r = rng(7);
  const pts = [];
  const bump = (z, c, w) => Math.exp(-z.reduce((acc, v, j) => acc + ((v - c[j]) / w) ** 2, 0) / 2);
  for (let a = 0; a < 22; a++) for (let b = 0; b < 22; b++) {
    const z = [a, b];
    const nz = (r() - 0.5) * 0.06;
    const g = Math.max(bump(z, [5, 5], 0.8), 0.8 * bump(z, [15, 15], 3));
    pts.push({ x: z.map((v) => 10 + v * 5), is: metrics(g + nz * 0.2, nz, 1600), oos: metrics(0.9 * g + nz * 0.2, nz, 900), isResult: 40 + 45 * g + nz, oosResult: 35 + 40.5 * g + nz });
  }
  const names = ['p1', 'p2'];
  const isH = ['Pass', 'Result', 'Profit', 'Expected Payoff', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Equity DD %', 'Trades', ...names];
  const oosH = ['Pass', 'Forward Result', 'Back Result', 'Profit', 'Expected Payoff', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Equity DD %', 'Trades', ...names];
  const isRows = pts.map((p, i) => [i, p.isResult, p.is.profit, p.is.profit / 800, p.is.profitFactor, p.is.recoveryFactor, p.is.sharpe, p.is.drawdown, p.is.trades, ...p.x]);
  const run = (frac) => {
    const top = pts.map((_, i) => i).sort((a, b) => pts[b].isResult - pts[a].isResult).slice(0, Math.round(frac * pts.length));
    const oosRows = top.map((i) => { const p = pts[i]; return [i, p.oosResult, p.isResult, p.oos.profit, p.oos.profit / 800, p.oos.profitFactor, p.oos.recoveryFactor, p.oos.sharpe, p.oos.drawdown, p.oos.trades, ...p.x]; });
    return runAnalysis({ isTable: { name: 'IS', sheet: 'x', format: 's', headers: isH, rows: isRows }, oosTable: { name: 'OOS', sheet: 'x', format: 's', headers: oosH, rows: oosRows }, policy: POLICY });
  };
  const full = run(1.0);
  const top25 = run(0.25);
  check('con forward del 25 % se analizan todas las pasadas del in-sample', top25.records.length === full.records.length, `${top25.records.length} vs ${full.records.length}`);
  check('misma meseta recomendada', full.plateaus[0] && top25.plateaus[0] && full.plateaus[0].record.params.join() === top25.plateaus[0].record.params.join());
  check('mismo tamano de meseta (no se infla)', full.plateaus[0].size === top25.plateaus[0].size, `${top25.plateaus[0].size} vs ${full.plateaus[0].size}`);
  check('la recomendada tiene forward', top25.plateaus[0].record.oosKnown !== false);
  check('las pasadas sin forward se informan, no se descartan', top25.verdict.findings.some((f) => /pasadas sin forward/.test(f.title)));
}

console.log(`\nRESULTADO: ${checks - failures}/${checks} comprobaciones correctas`);
if (failures) process.exit(1);
