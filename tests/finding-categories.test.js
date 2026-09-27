// Categoria de cada hallazgo del motor: en que panel de Diagnostico/Parametros se
// explica con su tabla, o null si se queda suelto en Verdict.
//
// La declara core/verdict.js en cada add(); la interfaz (js/ui-state.js#categorizeFinding)
// solo la lee. Antes la adivinaba buscando palabras en el texto, y cambiar una frase
// movia o perdia un hallazgo en silencio (auditoria 2026-09, AUD-17).
//
//   node tests/finding-categories.test.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { categorizeFinding, findingsForCategory } from '../js/ui-state.js';
import { buildDemoTables } from '../js/demo.js';
import { runAnalysis } from '../core/analysis.js';
import { DEFAULT_POLICY } from '../core/metrics.js';
import { setLocale } from '../js/i18n.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
function section(t) {
  console.log(`\n${'='.repeat(70)}\n${t}\n${'='.repeat(70)}`);
}

// Las que la interfaz sabe pintar junto a su tabla. 'plateau' se descarta (ya lo explican
// los badges de Top 3 y la ficha de la meseta).
const KNOWN = new Set(['stats', 'stability', 'coverage', 'gates', 'sensitivity', 'parameters', 'integrity', 'plateau', null]);

section('1. Cada add() de core/verdict.js declara una categoria valida');
{
  const src = fs.readFileSync(path.join(ROOT, 'core/verdict.js'), 'utf8');
  let i = 0;
  let calls = 0;
  let declared = 0;
  // Todas las llamadas, tambien las que pasan la severidad en una variable (add(sev, …)):
  // buscar solo 'add(SEV.' dejo fuera "pasadas sin pareja" y rompia el analisis con
  // exports reales de MT5, donde el forward trae menos pasadas que el in-sample.
  const re = /(?<![\w.])add\((?!severity)/g;
  let mm;
  const starts = [];
  while ((mm = re.exec(src))) starts.push(mm.index);
  for (const start of starts) {
    i = start;
    let depth = 0;
    let j = i + 3;
    for (; j < src.length; j++) {
      if (src[j] === '(') depth++;
      else if (src[j] === ')') { depth--; if (depth === 0) break; }
    }
    const call = src.slice(i, j + 1);
    calls++;
    const m = call.match(/,\s*(null|'([a-z]+)')\s*\)$/);
    if (m && KNOWN.has(m[2] ?? null)) declared++;
    else check(`categoria valida en linea ${src.slice(0, i).split('\n').length}`, false, call.slice(-60));
  }
  check(`las ${calls} llamadas declaran categoria`, calls > 40 && declared === calls, `${declared}/${calls}`);
}

section('2. Los hallazgos reales llevan la categoria esperada');
{
  const demo = buildDemoTables();
  const pol = (g) => ({ ...DEFAULT_POLICY, gates: { ...DEFAULT_POLICY.gates, ...g } });
  // Forward con menos pasadas que el in-sample, como en los exports reales de MT5.
  const shortOos = { ...demo.oosTable, rows: demo.oosTable.rows.filter((_, k) => k % 3 === 0) };
  const runs = [
    runAnalysis({ isTable: demo.isTable, oosTable: shortOos }),
    runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable }),
    runAnalysis({ isTable: demo.isTable }),
    runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable, policy: pol({ minProfitFactor: 1.35, maxDrawdownPct: 8 }) }),
  ];
  const all = runs.flatMap((a) => a.verdict.findings);
  check('todos los hallazgos tienen categoria conocida', all.every((f) => 'category' in f && KNOWN.has(f.category)),
    all.filter((f) => !KNOWN.has(f.category)).map((f) => f.title).join(' | '));
  // Una muestra por categoria, con el titulo como pista para leer el fallo.
  const expect = [
    [/Fragilidad del ranking Result/, 'stats'],
    [/umbral del azar/, 'stats'],
    [/Correlación IS -> OOS/, 'stats'],
    [/aguanta el .* variaciones de umbral|sus propios umbrales/, 'stability'],
    [/Sin \.set de optimización/, 'coverage'],
    [/no está filtrando nada|no están filtrando nada/, 'gates'],
    [/Sin periodo forward no hay validación posible/, null],
    [/pasadas sin pareja/, 'integrity'],
    [/El forward ya se ha usado para validar y ordenar/, null],
  ];
  for (const [re, cat] of expect) {
    const hit = all.filter((f) => re.test(f.title));
    if (!hit.length) continue; // no todas las ramas salen con estos datos
    check(`${cat ?? 'null'} <- ${re}`, hit.every((f) => f.category === cat), hit.map((f) => f.category).join(','));
  }
}

section('3. La interfaz usa la categoria declarada, no el texto');
{
  const f = { title: 'Correlación IS -> OOS de 0,74', detail: 'texto cualquiera', category: 'stats' };
  check('categorizeFinding devuelve la declarada', categorizeFinding(f) === 'stats');
  const reworded = { ...f, title: 'Una frase nueva sin ninguna palabra clave' };
  check('reescribir el titulo no mueve el hallazgo', categorizeFinding(reworded) === 'stats');
  check('sin categoria se queda suelto en Verdict', categorizeFinding({ title: 'Correlación IS -> OOS', detail: '' }) === null);
  check('findingsForCategory filtra por la declarada', findingsForCategory([f, reworded, { title: 'x', detail: '', category: null }], 'stats').length === 2);
}

section('4. La categoria sobrevive al cambio de idioma');
{
  const demo = buildDemoTables();
  setLocale('es');
  const es = runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable }).verdict.findings.map((f) => f.category);
  setLocale('en');
  const en = runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable }).verdict.findings.map((f) => f.category);
  setLocale('es');
  check('mismas categorias en ES y EN', JSON.stringify(es) === JSON.stringify(en), `${es} vs ${en}`);
}

// ---------------------------------------------------------------- resumen
console.log(`\n${'='.repeat(70)}`);
console.log(`RESULTADO: ${checks - failures}/${checks} comprobaciones correctas`);
console.log(`${'='.repeat(70)}`);
if (failures) process.exit(1);
