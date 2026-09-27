// Lo que la app DICE que hace tiene que coincidir con lo que HACE.
//
//   node tests/verdict-coherence.test.js
//
// Auditoria 2026-09 (audit/):
//   AUD-04  el copy decia "puntuacion = el peor de los dos periodos" con el modo isThenOos
//   AUD-05  sello "moderada" con titular "Evidencia solida…" y JSON exportado "strong"
//   AUD-06  la UI exigia forward aunque el motor audita solo el in-sample
//   AUD-10  el "IC del resultado diario medio" era el rango del resultado TOTAL

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemoTables } from '../js/demo.js';
import { runAnalysis } from '../core/analysis.js';
import { DEFAULT_POLICY } from '../core/metrics.js';
import { meanConfidenceInterval } from '../core/matrix/sample.js';
import { setLocale } from '../js/i18n.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}
function section(t) { console.log(`\n${'='.repeat(70)}\n${t}\n${'='.repeat(70)}`); }

const WORST_OF_BOTH = /peor (de|entre) (los dos periodos|IS y forward|in-sample y forward)|worse of (the two periods|IS and forward|in-sample and forward)|m[ií]nimo de los dos periodos|filtra y punt[uú]a|filters and scores/i;
const demo = buildDemoTables();

section('AUD-04: el copy del metodo coincide con el modo por defecto');
{
  check('modo por defecto = isThenOos', DEFAULT_POLICY.selectionMode === 'isThenOos');
  for (const lang of ['es', 'en']) {
    setLocale(lang);
    const a = runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable });
    const text = a.verdict.findings.map((f) => `${f.title} ${f.detail}`).join('\n');
    check(`[${lang}] ningun hallazgo dice "peor de los dos periodos"`, !WORST_OF_BOTH.test(text));
    check(`[${lang}] ningun hallazgo dice que el forward no influye`, !/no contamina la selección|does not contaminate selection/i.test(text));
  }
  const sources = ['js/i18n.js', 'js/ui-chrome.js', 'js/ui-verdict.js', 'js/ui-plateaus.js', 'methodology/index.html', 'app/index.html', 'README.md', 'DEPLOY.md'];
  for (const f of sources) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    // En verdict.js el texto "peor de los dos periodos" sigue existiendo, pero solo en la
    // rama del modo joint: se comprueba arriba con el motor, no aqui.
    check(`${f} no describe la seleccion como "peor de los dos"`, !WORST_OF_BOTH.test(src));
  }
  setLocale('es');
  const joint = runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable, policy: { ...DEFAULT_POLICY, selectionMode: 'joint' } });
  check('en modo joint si se explica "peor de los dos periodos"', joint.verdict.findings.some((f) => WORST_OF_BOTH.test(f.detail)));
}

section('AUD-05: un solo nivel de evidencia en pantalla y en el export');
{
  setLocale('es');
  const { displayVerdictCopy } = await import('../js/ui-verdict.js');
  const { buildReport } = await import('../js/export.js');
  const a = runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable });
  const shown = displayVerdictCopy(a);
  check('sin periodo no visto se muestra moderada', shown.level === 'moderate', shown.level);
  check('el titular empieza por el nivel mostrado', /^Evidencia moderada/.test(shown.headline), shown.headline);
  check('el titular no dice "sólida" antes que el nivel', !/^Evidencia sólida/.test(shown.headline));
  const report = buildReport(a, { shownVerdict: shown });
  check('el JSON exporta el nivel mostrado', report.verdict.level === 'moderate', report.verdict.level);
  check('el JSON conserva el nivel del motor aparte', report.verdict.engineLevel === a.verdict.level);
}

section('AUD-06: solo in-sample se audita y no pasa de "debil"');
{
  const a = runAnalysis({ isTable: demo.isTable });
  check('sin forward el motor termina', a.meta.hasForward === false);
  check('sin forward el nivel es como mucho debil', ['weak', 'insufficient'].includes(a.verdict.level), a.verdict.level);
  check('sin forward hay un aviso critico', a.verdict.findings.some((f) => f.severity === 'critical'));
  const files = fs.readFileSync(path.join(ROOT, 'js/ui-files.js'), 'utf8');
  check('el boton se habilita con solo el in-sample', /const ready = hasIs;/.test(files));
}

section('AUD-10: el IC del resultado diario medio esta en escala diaria');
{
  const returns = Array.from({ length: 300 }, (_, i) => 20 + 30 * Math.sin(i));
  const ci = meanConfidenceInterval(returns, { sims: 800 });
  const m = returns.reduce((s, v) => s + v, 0) / returns.length;
  check('el IC contiene la media diaria', ci.ci.p05 <= m && m <= ci.ci.p95, `${ci.ci.p05} – ${ci.ci.p95} vs ${m}`);
  check('el IC no esta en escala del total', ci.ci.p95 < 10 * Math.abs(m), String(ci.ci.p95));
}

console.log(`\n${'='.repeat(70)}\nRESULTADO: ${checks - failures}/${checks} comprobaciones correctas\n${'='.repeat(70)}`);
if (failures) process.exit(1);
