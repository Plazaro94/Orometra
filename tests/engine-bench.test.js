// Cambios del motor que salieron del banco de pruebas (bench/PREREGISTRO.md, 2026-09-29).
//
//   node tests/engine-bench.test.js
//
//   R1  los porcentajes que exigen los dos periodos se miden sobre las configuraciones
//       con forward: una ventaja clara ya no se queda sin refugio
//   R2  una meseta que no aguanta en el forward es un hallazgo crítico
//   R3  la configuración a desplegar se elige por puesto conjunto IS + forward
//   R4  sin meseta hay una sugerencia orientativa, y se presenta como tal
//
// Los casos salen del generador del banco con semillas de la calibración, nunca del examen.

import { generateCase } from '../bench/sim.js';
import { runAnalysis } from '../core/analysis.js';
import { ENGINE_DEFAULTS } from '../core/engine.js';
import { setLocale } from '../js/i18n.js';
import { fallbackNote } from '../js/ui-verdict.js';
import { rebuildLocalizedCopy } from '../core/verdict.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}
function section(t) { console.log(`\n${'='.repeat(70)}\n${t}\n${'='.repeat(70)}`); }
setLocale('es');

const run = (scenario, seed) => {
  const c = generateCase(scenario, seed);
  return { c, a: runAnalysis({ isTable: c.isTable, oosTable: c.oosTable }) };
};
const crit = (a) => a.verdict.findings.filter((f) => f.severity === 'critical').map((f) => f.title);
const isPos = (l) => l === 'moderate' || l === 'strong';

section('Valores por defecto');
check('repMethod por defecto es joint', ENGINE_DEFAULTS.repMethod === 'joint');
check('plateauForwardCritical por defecto es 0,65', ENGINE_DEFAULTS.plateauForwardCritical === 0.65);

section('R1. Ventaja clara: se detecta');
for (const seed of [1, 6, 9]) {
  const { a } = run('S3', seed);
  check(`S3 #${seed}: moderada o más`, isPos(a.verdict.level), `${a.verdict.level} · ${crit(a).join(' | ')}`);
  check(`S3 #${seed}: sin «resquicio» ni ranking sin refugio`, !crit(a).some((t) => /resquicio|primera de Result/.test(t)), crit(a).join(' | '));
}

section('R2. Ventaja solo en el in-sample: la meseta cae en el forward y es crítico');
for (const seed of [1, 2, 6]) {
  const { a } = run('S5', seed);
  check(`S5 #${seed}: crítico de forward`, crit(a).some((t) => t.includes('no se sostiene en el forward')), crit(a).join(' | '));
  check(`S5 #${seed}: no sale moderada ni sólida`, !isPos(a.verdict.level), a.verdict.level);
}
{
  const { c } = run('S5', 1);
  const a = runAnalysis({ isTable: c.isTable, oosTable: c.oosTable, opts: { ...ENGINE_DEFAULTS, plateauForwardCritical: null } });
  check('sin el umbral vuelve a ser solo un aviso', !crit(a).some((t) => t.includes('no se sostiene en el forward')));
}

section('R3. La recomendada tiene forward y sale de su meseta');
for (const seed of [1, 6, 9]) {
  const { a } = run('S3', seed);
  const p = a.plateaus[0];
  check(`S3 #${seed}: la recomendada tiene forward`, p && p.record.oosKnown !== false);
  check(`S3 #${seed}: la recomendada pertenece a la meseta`, p && p.indices.includes(p.representative));
  check(`S3 #${seed}: con meseta no hay sugerencia orientativa`, a.fallback === null);
}

section('R4. Sin meseta: sugerencia orientativa');
for (const seed of [2, 4, 12]) {
  const { a } = run('S3', seed);
  check(`S3 #${seed}: no hay meseta`, a.plateaus.length === 0);
  check(`S3 #${seed}: hay sugerencia orientativa`, a.fallback && a.fallback.record);
  check(`S3 #${seed}: cumple los mínimos en los dos periodos`, a.fallback && a.fallback.passesBoth && a.fallback.record.passesJoint);
  check(`S3 #${seed}: el nivel no sube por ella`, !isPos(a.verdict.level), a.verdict.level);
  const note = a.fallback ? fallbackNote(a) : '';
  check(`S3 #${seed}: el texto dice que no es zona estable y nombra los parámetros`,
    note.startsWith('Sin zona estable') && a.meta.paramNames.every((n) => note.includes(`${n}=`)), note);
}

section('Auditoría 2 · N1. Cambiar de idioma no cambia el veredicto');
{
  let changed = 0;
  let total = 0;
  const bySev = (a) => ['critical', 'warn', 'info', 'ok'].map((k) => a.verdict.findings.filter((f) => f.severity === k).length).join('/');
  for (const s of ['S3', 'S5', 'S6']) {
    for (let seed = 1; seed <= 15; seed++) {
      setLocale('es');
      const { a } = run(s, seed);
      setLocale('en');
      const en = rebuildLocalizedCopy(a);
      setLocale('es');
      const es = rebuildLocalizedCopy(en);
      total++;
      if (en.verdict.level !== a.verdict.level || es.verdict.level !== a.verdict.level || bySev(en) !== bySev(a)
        || es.verdict.findings.map((f) => f.title).join('|') !== a.verdict.findings.map((f) => f.title).join('|')) changed++;
    }
  }
  check(`ningún caso cambia de nivel ni de hallazgos al cambiar de idioma (${total} casos)`, changed === 0, `${changed} cambian`);
}

section('Auditoría 2 · N3. El orden de las filas del archivo no decide la elección');
{
  const shuffle = (rows, seed) => {
    const out = rows.slice();
    let x = seed >>> 0;
    for (let i = out.length - 1; i > 0; i--) {
      x = (x * 1664525 + 1013904223) >>> 0;
      const j = x % (i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  let diff = 0;
  let n = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const c = generateCase('S3', seed);
    const a = runAnalysis({ isTable: c.isTable, oosTable: c.oosTable });
    const b = runAnalysis({ isTable: { ...c.isTable, rows: shuffle(c.isTable.rows, seed) }, oosTable: { ...c.oosTable, rows: shuffle(c.oosTable.rows, seed + 7) } });
    const pick = (x) => (x.plateaus[0] ? x.plateaus[0].record.id : x.fallback ? 'f' + x.fallback.record.id : null);
    n++;
    if (pick(a) !== pick(b)) diff++;
  }
  check(`misma elección con las filas barajadas (${n} casos)`, diff === 0, `${diff} distintos`);
}

section('Auditoría 2 · N4. Sin forward no hay sugerencia orientativa');
{
  let with_ = 0;
  let noPlateau = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const c = generateCase('S2', seed);
    const a = runAnalysis({ isTable: c.isTable });
    if (!a.plateaus.length) noPlateau++;
    if (a.fallback) with_++;
  }
  check(`ruido solo con in-sample: ninguna sugerencia (${noPlateau} sin meseta)`, with_ === 0, `${with_} con sugerencia`);
}

console.log(`\nRESULTADO: ${checks - failures}/${checks} comprobaciones correctas`);
if (failures) process.exit(1);
