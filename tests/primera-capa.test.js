// La primera capa del informe (el titular y la tarjeta del veredicto) habla como un trader:
// las palabras de la auditoría (robustez, núcleo, pruebas efectivas…) se quedan en Mesetas,
// Parámetros y Diagnóstico, donde se explican. Tanda A de la propuesta del 2026-10-15.
//
//   node tests/primera-capa.test.js

import { buildDemoTables, buildNoEdgeDemoTables } from '../js/demo.js';
import { runAnalysis } from '../core/analysis.js';
import { setLocale } from '../js/i18n.js';
import { renderVerdict, answerLine } from '../js/ui-verdict.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}

// Palabras que no salen en la primera capa. Con límites de palabra: «core» no debe cazar «score».
const BANNED = {
  es: ['robustez', 'núcleo', 'las más flojas', 'vecinas flojas', 'variación', 'bordes', 'huecos no observados',
    'puesto conjunto', 'Forward Result', 'fragilidad', 'pruebas efectivas', 'correlación de rangos', 'percentil', 'Sharpe'],
  en: ['robustness', 'core', 'weakest', 'weak neighbors', 'variation', 'edges', 'unobserved', 'joint rank',
    'Forward Result', 'fragility', 'effective trials', 'rank correlation', 'percentile', 'Sharpe'],
};
const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
const hits = (text, words) => words.filter((w) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'iu').test(text));

const cases = [['ejemplo con meseta', buildDemoTables()], ['ejemplo sin ventaja', buildNoEdgeDemoTables()]];
for (const lang of ['es', 'en']) {
  setLocale(lang);
  console.log(`\n${lang.toUpperCase()}`);
  for (const [name, t] of cases) {
    const a = runAnalysis({ isTable: t.isTable, oosTable: t.oosTable });
    const html = renderVerdict(a);
    const card = (html.match(/<section class="vx[\s\S]*?<\/section>/) || [''])[0];
    check(`${name}: hay tarjeta`, card.length > 0);
    // Lo visible de la tarjeta: sin los title="" de las casillas del mapa, que son ayuda al pasar el ratón.
    const text = `${answerLine(a)} ${plain(card.replace(/ title="[^"]*"/g, ''))}`;
    const found = hits(text, BANNED[lang]);
    check(`${name}: sin palabras de la auditoría`, found.length === 0, found.join(', '));
    check(`${name}: una sola nota (la fiabilidad), sin «/100»`, !/\/100/.test(plain(card)));
  }
}

// La tarjeta no puede crecer: tiene que leerse con menos que la publicada antes de la tanda A
// (medida en el navegador el 2026-10-15, en español: 322 palabras y 28 cifras con meseta; 187 y
// 13 sin ventaja). Lo que va en un desplegable cerrado no se ve y no cuenta. La primera versión
// de la tanda A añadía un mapa y se iba a 464 palabras y 92 cifras: esto lo habría parado.
setLocale('es');
{
  const BUDGET = { 'ejemplo con meseta': { words: 322, figures: 28 }, 'ejemplo sin ventaja': { words: 187, figures: 13 } };
  for (const [name, t] of cases) {
    const a = runAnalysis({ isTable: t.isTable, oosTable: t.oosTable });
    const card = (renderVerdict(a).match(/<section class="vx[\s\S]*?<\/section>/) || [''])[0];
    const visible = plain(card.replace(/<details[\s\S]*?<\/details>/g, '').replace(/ (title|aria-label)="[^"]*"/g, ''));
    const words = visible.split(/\s+/).filter(Boolean).length;
    const figures = (visible.match(/\d+(?:[.,]\d+)?/g) || []).length;
    const cap = BUDGET[name];
    check(`${name}: menos palabras que la tarjeta publicada (${words} ≤ ${cap.words})`, words <= cap.words, String(words));
    check(`${name}: menos cifras que la tarjeta publicada (${figures} ≤ ${cap.figures})`, figures <= cap.figures, String(figures));
  }
}

// El titular contesta: dice si hay zona estable y, si la hay, qué pasada llevarse.
setLocale('es');
{
  const good = buildDemoTables();
  const a = runAnalysis({ isTable: good.isTable, oosTable: good.oosTable });
  const line = answerLine(a);
  check('con meseta: el titular nombra la pasada', line.includes(String(a.plateaus[0].record.id)), line);
  check('con meseta: y el siguiente paso (un tramo que no hayas usado)', /tramo que no hayas usado/.test(line), line);
  const none = buildNoEdgeDemoTables();
  const b = runAnalysis({ isTable: none.isTable, oosTable: none.oosTable });
  check('sin meseta: el titular dice que no hay nada que respaldar', /no hay nada que respaldar/.test(answerLine(b)), answerLine(b));
  const html = renderVerdict(b);
  check('sin meseta: no hay «A favor» con marcas de visto', !/A favor/.test(html) && /Lo que sí hay/.test(html));
  check('sin meseta: la sugerencia orientativa va aparte y rotulada', /vx-quiet/.test(html) && /seguir explorando/.test(html));
}

console.log(`\n${'='.repeat(70)}\nRESULTADO: ${checks - failures}/${checks} comprobaciones correctas\n${'='.repeat(70)}`);
if (failures) process.exit(1);
