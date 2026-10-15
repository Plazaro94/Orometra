// Lo que salió de auditar como un quant el export real del 2026-10-14 (un EA sobre un
// índice en M15: unas 10.000 pasadas, su forward y su .set). Cada sección falla con el código anterior.
//
//   Q1  Una sola pasada cuyo Back Result no cuadraba daba un CRÍTICO «los dos archivos no
//       parecen de la misma optimización», con todas las demás idénticas.
//   Q2  «La nota de Orometra conserva el orden de las configuraciones» salía con una
//       correlación de rangos de la nota de 0,08: lo que se mide es la cabeza de la tabla.
//   Q3  El umbral del contraste del Sharpe era el máximo ESPERADO por azar, que el máximo
//       de puro ruido supera el 43 % de las veces: ahora es el percentil 95.
//   Q4  Qué esperar de la recomendada, descontada la selección (core/shrink.js).
//
//   node tests/audit-2026-10c.test.js

import { setLocale } from '../js/i18n.js';
import { buildDemoTables } from '../js/demo.js';
import { runAnalysis } from '../core/analysis.js';
import { rebuildLocalizedCopy } from '../core/verdict.js';
import { maxQuantileZ } from '../core/stats.js';
import { expectationHtml } from '../js/ui-verdict.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}
function section(t) { console.log(`\n${'='.repeat(70)}\n${t}\n${'='.repeat(70)}`); }

setLocale('es');
const demo = buildDemoTables();
const base = runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable });
// rebuildLocalizedCopy devuelve el análisis entero; aquí interesa su veredicto.
const rebuild = (a) => rebuildLocalizedCopy(a).verdict;
const titles = (a) => a.verdict.findings.map((f) => `${f.severity}|${f.title}`);

section('Q1. Procedencia: unas pocas filas sueltas no son otra optimización');
{
  const back = demo.oosTable.headers.indexOf('Back Result');
  const withBroken = (count) => ({
    ...demo.oosTable,
    rows: demo.oosTable.rows.map((r, i) => (i < count ? Object.assign(r.slice(), { [back]: Number(r[back]) + 0.5 }) : r)),
  });
  const one = runAnalysis({ isTable: demo.isTable, oosTable: withBroken(1) });
  const f1 = one.verdict.findings.find((f) => f.category === 'integrity' && /no cuadra/.test(f.title));
  check('una fila: aviso, no crítico', f1 && f1.severity === 'warn', titles(one).filter((t) => /cuadra|misma optimización/.test(t)).join(' · '));
  check('una fila: nombra la pasada', f1 && f1.detail.includes(`la pasada ${demo.oosTable.rows[0][0]}`), f1 && f1.detail.slice(0, 120));
  check('una fila: no mueve el nivel', one.verdict.level === base.verdict.level, `${one.verdict.level} vs ${base.verdict.level}`);
  check('una fila: ningún crítico de «misma optimización»', !one.verdict.findings.some((f) => f.severity === 'critical' && /misma optimización/.test(f.title)));
  const n = demo.oosTable.rows.length;
  const many = runAnalysis({ isTable: demo.isTable, oosTable: withBroken(Math.ceil(0.015 * n)) });
  check('1,5 % de las filas: crítico', many.verdict.findings.some((f) => f.severity === 'critical' && /misma optimización/.test(f.title)));
}

section('Q2. La nota de Orometra: la cabeza de la tabla, no el orden entero');
{
  const ok = base.verdict.findings.find((f) => /según la nota de Orometra aguanta/.test(f.title));
  check('el hallazgo existe con el ejemplo', !!ok);
  check('ya no dice que «conserva el orden»', ok && !/conserva el orden/.test(ok.detail), ok && ok.detail);
  check('con correlación alta no añade la salvedad', ok && !/apenas se conserva/.test(ok.detail));
  const low = rebuild({ ...base, stats: { ...base.stats, spearmanQuality: 0.08 } });
  const okLow = low.findings.find((f) => /según la nota de Orometra aguanta/.test(f.title));
  check('con correlación 0,08 dice que el orden completo apenas se conserva', okLow && /apenas se conserva \(correlación de rangos 0,08\)/.test(okLow.detail), okLow && okLow.detail);
}

section('Q3. Sharpe: el umbral es el percentil 95 del máximo, no su media');
{
  const s = base.stats.sharpeTest;
  const want = s.sigma * maxQuantileZ(s.trials, 0.95);
  check('chanceMax = σ · z₀,₉₅ del máximo de N pruebas', Math.abs(s.chanceMax - want) < 1e-9, `${s.chanceMax} vs ${want}`);
  // Desde el 2026-10-15, N son todas las pasadas del contraste, no las celdas del espacio grueso.
  const used = base.records.filter((r) => Number.isFinite(r.oos.sharpe) && r.oos.trades > s.minTrades).length;
  check('N = pasadas del contraste (más de 30 operaciones en el forward)', s.trials === used, `${s.trials} vs ${used}`);
  check('ya no guarda las pruebas efectivas en el contraste', s.effectiveTrials === undefined);
  const legacy = rebuild({ ...base, stats: { ...base.stats, sharpeTest: { ...s, effectiveTrials: 48 } } });
  const legacyF = legacy.findings.find((f) => /umbral del azar/.test(f.title));
  check('un análisis anterior (con pruebas efectivas) lo dice así', legacyF && /48 pruebas efectivas/.test(legacyF.detail), legacyF && legacyF.detail);
  check('el umbral queda por encima del máximo esperado', s.chanceMax > s.chanceMean);
  check('se guarda el nivel', s.chanceLevel === 0.95);
  // Un máximo entre la media y el percentil 95 antes «superaba el azar»; ahora no.
  const between = (s.chanceMean + s.chanceMax) / 2;
  const v = rebuild({ ...base, stats: { ...base.stats, sharpeTest: { ...s, observedMax: between } } });
  check('entre la media y el percentil 95: crítico', v.findings.some((f) => f.severity === 'critical' && /no supera el umbral del azar/.test(f.title)));
  const okF = base.verdict.findings.find((f) => /supera el umbral del azar/.test(f.title));
  check('el texto da la probabilidad por azar (5 %)', okF && /solo el 5 % de las veces/.test(okF.detail), okF && okF.detail);
}

section('Q4. Qué esperar de la recomendada');
{
  const s = base.stats.shrinkage;
  check('se calcula con forward', s && s.usable);
  const rep = base.plateaus[0].representative;
  const pr = s.predictions.find((p) => p.index === rep);
  check('hay predicción para la recomendada', !!pr);
  check('la cifra esperada queda por debajo de la del forward (encoge)', pr.expected < pr.observedOos, `${pr.expected} vs ${pr.observedOos}`);
  const f = base.verdict.findings.find((x) => /^Qué esperar de la recomendada/.test(x.title));
  check('el hallazgo existe, en estadística', f && f.category === 'stats');
  check('no mueve el nivel (se lee como dato de planificación)', f && f.scope === 'table');
  const sinCifra = rebuild({ ...base, stats: { ...base.stats, shrinkage: null } });
  check('quitarlo no cambia el nivel', sinCifra.level === base.verdict.level, `${sinCifra.level} vs ${base.verdict.level}`);
  // Si la ventaja propia no se distingue de cero, el aviso lo dice con esas palabras.
  const flat = { ...s, predictions: s.predictions.map((p) => ({ ...p, ownLo: -1 })) };
  const vFlat = rebuild({ ...base, stats: { ...base.stats, shrinkage: flat } });
  const fFlat = vFlat.findings.find((x) => /^Qué esperar de la recomendada/.test(x.title));
  check('sin ventaja propia distinguible: aviso que lo dice', fFlat && fFlat.severity === 'warn' && /no se distingue de cero/.test(fFlat.detail));
  const html = expectationHtml(base, base.plateaus[0]);
  check('la tarjeta enseña la cifra', html.includes('Qué esperar') && html.includes('por operación'), html);
  setLocale('en');
  const en = rebuild(base);
  const fEn = en.findings.find((x) => /^What to expect from the recommended one/.test(x.title));
  check('existe en inglés con la misma categoría', fEn && fEn.category === 'stats');
  setLocale('es');
  const noFwd = runAnalysis({ isTable: demo.isTable });
  check('sin forward no se calcula', noFwd.stats.shrinkage === null);
}

console.log(`\n${checks - failures}/${checks} comprobaciones correctas`);
if (failures) process.exit(1);
