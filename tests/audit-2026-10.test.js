// Auditoría de diseño (2026-10-10): dos incoherencias de texto que se veían en la web.
//
// - En inglés, el nivel más alto se llamaba «Solid evidence» en el titular del veredicto y
//   «Strong» en la escala, la cabecera de las pestañas, la portada y la Metodología.
// - La Metodología decía «in-sample» donde la app dice «periodo optimizado».
//
//   node tests/audit-2026-10.test.js

import fs from 'node:fs';
import { setLocale } from '../js/i18n.js';
import { buildDemoTables } from '../js/demo.js';
import { runAnalysis } from '../core/analysis.js';
import { levelName } from '../js/ui-verdict.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}

console.log('\nEl titular del veredicto usa el nombre del nivel');
const demo = buildDemoTables();
for (const lang of ['en', 'es']) {
  setLocale(lang);
  const a = runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable });
  const name = levelName(a.verdict.level);
  const expected = lang === 'en' ? `${name} evidence` : `Evidencia ${name.toLowerCase()}`;
  check(`${lang}: ejemplo «${a.verdict.level}» → «${expected}»`, a.verdict.headline.startsWith(expected), a.verdict.headline);
}

// Todos los titulares escritos en el código, no solo el del ejemplo: «X evidence…» en inglés y
// «Evidencia x…» en español, con X uno de los cinco nombres de la escala.
setLocale('en');
const enNames = ['insufficient', 'weak', 'moderate', 'good', 'strong'].map((l) => levelName(l));
setLocale('es');
const esNames = ['insufficient', 'weak', 'moderate', 'good', 'strong'].map((l) => levelName(l).toLowerCase());
for (const file of ['core/verdict.js', 'js/ui-verdict.js']) {
  const src = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const en = [...src.matchAll(/'([A-Z][a-z]+) evidence\b/g)].map((m) => m[1]);
  const es = [...src.matchAll(/'Evidencia ([a-záéíóú]+)\b/g)].map((m) => m[1]);
  check(`${file}: titulares en inglés con un nombre de la escala`, en.length > 0 && en.every((w) => enNames.includes(w)), en.join(', '));
  check(`${file}: titulares en español con un nombre de la escala`, es.length > 0 && es.every((w) => esNames.includes(w)), es.join(', '));
}

console.log('\nMetodología: «periodo optimizado», como en la app');
for (const page of ['methodology/index.html', 'es/methodology/index.html']) {
  const html = fs.readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
  const n = (html.match(/in-sample/gi) || []).length;
  check(`${page}: sin «in-sample»`, n === 0, `${n} veces`);
}

console.log(`\n${checks - failures}/${checks} comprobaciones correctas`);
if (failures) process.exit(1);
