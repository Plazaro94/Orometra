// Optimizaciones enormes y fallos internos: el motor no puede caerse con muchas filas, y
// si algo falla por nuestra culpa el usuario no puede leer "tus datos no sirven".
//
//   node tests/robustness.test.js

import { runAnalysis, MAX_ROWS } from '../core/analysis.js';
import { parseTable } from '../core/parse.js';
import { decodeEntities } from '../core/entities.js';
import { AnalysisError, CODE, classifyError, withCode } from '../core/errors.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}

const HEADERS = ['Pass', 'Result', 'Profit', 'Expected Payoff', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Equity DD %', 'Trades', 'A', 'B', 'C', 'D'];

/** Rejilla de 4 parámetros con una colina en el centro: `side`⁴ configuraciones. */
function bigTable(side) {
  let s = 7;
  const r = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  const rows = [];
  const total = side ** 4;
  for (let k = 0; k < total; k++) {
    const z = [k % side, Math.floor(k / side) % side, Math.floor(k / side ** 2) % side, Math.floor(k / side ** 3)];
    const g = Math.exp(-z.reduce((t, v) => t + ((v - side / 2) / (side / 4)) ** 2, 0) / 2) + (r() - 0.5) * 0.1;
    rows.push([k, 4 + 78 * g, 160000 * g - 16000, 130 * g, 1.05 + 0.35 * g, 4.5 * g, 3.2 * g + (r() - 0.5) * 0.3, 4 + 28 * (1 - g), Math.round(800 + 600 * g), ...z]);
  }
  return { name: 'IS', sheet: 'x', format: 'sintetico', headers: HEADERS, rows };
}

console.log('\n1. Muchas configuraciones');
{
  // 160.000: por encima de ~125.000, Math.max(...arr) desbordaba la pila.
  const t0 = Date.now();
  let a = null;
  let err = null;
  try { a = runAnalysis({ isTable: bigTable(20) }); } catch (e) { err = e; }
  check('160.000 configuraciones se analizan sin caerse', a && !err, err && `${err.name}: ${err.message}`);
  check('y dan un veredicto', a && ['strong', 'moderate', 'weak', 'insufficient'].includes(a.verdict.level), a && a.verdict.level);
  console.log(`       (${Date.now() - t0} ms)`);
}
{
  // Por encima del tope, un error claro antes de empezar (no a medio análisis).
  const row = [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  const rows = new Array(MAX_ROWS + 1).fill(row);
  let err = null;
  try { runAnalysis({ isTable: { name: 'IS', sheet: 'x', format: 'sintetico', headers: HEADERS, rows } }); } catch (e) { err = e; }
  check('por encima del tope: TOO_LARGE', err && err.code === CODE.TOO_LARGE, err && `${err.code} ${err.message}`);
  check('el mensaje dice cuántas hay y el máximo', err && /300[.,]001/.test(err.message) && /300[.,]000/.test(err.message), err && err.message);
}

console.log('\n2. Errores clasificados por código, no por el texto');
{
  check('un RangeError es un error interno', classifyError(new RangeError('Maximum call stack size exceeded')).code === CODE.INTERNAL_ERROR);
  check('un TypeError es un error interno', classifyError(new TypeError("Cannot read properties of undefined (reading 'x')")).code === CODE.INTERNAL_ERROR);
  check('un texto que menciona "xml" ya no se adivina como error de archivo', classifyError(new Error('xml')).code === CODE.INTERNAL_ERROR);
  check('un AnalysisError conserva su código', classifyError(new AnalysisError(CODE.SCHEMA_ERROR, 'x')).code === CODE.SCHEMA_ERROR);
  const wrapped = withCode(CODE.FILE_ERROR, new TypeError('boom'));
  check('withCode da código a un error sin él', wrapped.code === CODE.FILE_ERROR && wrapped.message === 'boom');
  const kept = withCode(CODE.FILE_ERROR, new AnalysisError(CODE.SCHEMA_ERROR, 'x'));
  check('withCode respeta el código que ya traía', kept.code === CODE.SCHEMA_ERROR);
  let err = null;
  try { parseTable(new TextEncoder().encode('no es una exportación').buffer, 'x.csv'); } catch (e) { err = e; }
  check('un archivo ilegible lanza FILE_ERROR', err && err.code === CODE.FILE_ERROR, err && `${err.code} ${err.message}`);
}

console.log('\n3. Entidades');
{
  check('&#99999999; se deja tal cual', decodeEntities('a&#99999999;b') === 'a&#99999999;b');
  check('un sustituto suelto se deja tal cual', decodeEntities('&#xD800;') === '&#xD800;');
  check('las válidas se decodifican', decodeEntities('&lt;P&amp;L&gt; &#233;&#xE9;') === '<P&L> éé');
  check('las desconocidas se dejan tal cual', decodeEntities('&nbsp;') === '&nbsp;');
  check('con tabla propia', decodeEntities('&nbsp;&iacute;', { nbsp: ' ', iacute: 'í' }) === ' í');
}

console.log(`\nRESULTADO: ${checks - failures}/${checks} comprobaciones correctas`);
if (failures) process.exit(1);
