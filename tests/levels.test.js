// Niveles altos con un forward como el de MT5 (enmienda del 2026-10-09 en
// bench/PREREGISTRO.md): el aviso de que MT5 solo reexporta las mejores pasadas sale en
// todo export real y ya no puede dejar el nivel en «moderada» por sí solo.
//
//   node tests/levels.test.js

import { buildDemoTables } from '../js/demo.js';
import { runAnalysis } from '../core/analysis.js';
import { generateCase } from '../bench/sim.js';
import { setLocale } from '../js/i18n.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}
setLocale('es');

console.log('\nForward con solo el 25 % mejor del periodo optimizado, como lo exporta MT5');
{
  const demo = buildDemoTables();
  const profitCol = demo.isTable.headers.findIndex((h) => /^profit$/i.test(h));
  const passCol = demo.isTable.headers.findIndex((h) => /^pass$/i.test(h));
  const top = demo.isTable.rows.slice().sort((x, y) => Number(y[profitCol]) - Number(x[profitCol]))
    .slice(0, Math.ceil(demo.isTable.rows.length / 4)).map((r) => String(r[passCol]));
  const keep = new Set(top);
  const oosPass = demo.oosTable.headers.findIndex((h) => /^pass$/i.test(h));
  const oosTable = { ...demo.oosTable, rows: demo.oosTable.rows.filter((r) => keep.has(String(r[oosPass]))) };
  const a = runAnalysis({ isTable: demo.isTable, oosTable });
  const sel = a.verdict.findings.find((f) => /solo pasó al forward una parte/.test(f.title));
  check('sale el aviso de la preselección del forward', Boolean(sel));
  check('y se marca como aviso de la tabla, no de la meseta', sel && sel.scope === 'table');
  check('el nivel pasa de moderada', ['good', 'strong'].includes(a.verdict.level), `${a.verdict.level} · ${a.verdict.findings.filter((f) => f.severity === 'warn' && f.scope !== 'table').map((f) => f.title).join(' | ')}`);
}

console.log('\nSin ventaja real no sale «buena» ni «sólida» (banco, calibración)');
{
  for (const [scenario, seeds] of [['S1', [1, 2, 3]], ['S2', [1, 2, 3]], ['S5', [1, 2, 3, 4, 5, 6]]]) {
    for (const seed of seeds) {
      const c = generateCase(scenario, seed);
      const a = runAnalysis({ isTable: c.isTable, oosTable: c.oosTable });
      check(`${scenario} #${seed}: ni buena ni sólida`, !['good', 'strong'].includes(a.verdict.level), a.verdict.level);
    }
  }
}

console.log(`\n${'='.repeat(70)}\nRESULTADO: ${checks - failures}/${checks} comprobaciones correctas\n${'='.repeat(70)}`);
if (failures) process.exit(1);
