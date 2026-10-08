// Historial local de análisis (core/history.js): huella, resumen, comparación e intentos.
//
//   node tests/history.test.js

import { buildDemoTables } from '../js/demo.js';
import { runAnalysis } from '../core/analysis.js';
import {
  fingerprint, summarize, emptyStore, parseStore, addEntry, previousFor, attempts,
  insideSpan, compare, HISTORY_MAX, HISTORY_VERSION,
} from '../core/history.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}
function section(t) { console.log(`\n${'='.repeat(70)}\n${t}\n${'='.repeat(70)}`); }

section('Huella: el mismo EA por sus parámetros, sin importar orden ni mayúsculas');
{
  const a = fingerprint(['FastMA', 'SlowMA', 'ATR_SL']);
  check('mismo conjunto en otro orden → misma huella', a === fingerprint(['ATR_SL', 'slowma', ' FastMA ']));
  check('otro conjunto → otra huella', a !== fingerprint(['FastMA', 'SlowMA']));
  check('formato estable (p + 8 hex)', /^p[0-9a-f]{8}$/.test(a), a);
  // Respuesta conocida: con la lista vacía, FNV-1a devuelve su base 0x811c9dc5 (por definición).
  check('valor conocido', fingerprint(['b', 'a']) === fingerprint(['a', 'b']) && fingerprint([]) === 'p811c9dc5');
}

section('Tramo de la meseta: dentro o fuera');
{
  check('número dentro', insideSpan(70, { min: 60, max: 80 }));
  check('número en el borde', insideSpan(80, { min: 60, max: 80 }));
  check('número fuera', !insideSpan(90, { min: 60, max: 80 }));
  check('decimales con tolerancia', insideSpan(0.30000000000000004, { min: 0.1, max: 0.3 }));
  check('texto: igual al tramo', insideSpan('EMA', { min: 'EMA', max: 'EMA' }) && !insideSpan('SMA', { min: 'EMA', max: 'EMA' }));
  check('sin tramo → fuera', !insideSpan(5, null));
}

section('Resumen de un análisis real (ejemplo sintético)');
const demo = buildDemoTables();
const analysis = runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable });
const e1 = summarize(analysis, { id: 'a1', at: '2026-10-01T10:00:00.000Z', level: 'good', files: { is: 'is.xml', oos: 'fwd.xml' } });
{
  check('versión y huella', e1.v === HISTORY_VERSION && e1.fp === fingerprint(analysis.meta.paramNames));
  check('guarda la configuración recomendada', e1.pick && e1.pick.pass === analysis.plateaus[0].record.id && e1.pick.values.length === analysis.meta.paramNames.length);
  check('y el tramo de la meseta por parámetro', e1.pick.span.length === analysis.meta.paramNames.length && e1.pick.span.every((s) => s && s.min <= s.max));
  check('la recomendada cae dentro de su propia meseta', e1.pick.values.every((v, j) => insideSpan(v, e1.pick.span[j])));
  check('guarda los mínimos', e1.gates.minProfitFactor === analysis.meta.policy.gates.minProfitFactor && e1.gates.minTrades === analysis.meta.policy.gates.minTrades);
  const size = JSON.stringify(e1).length;
  check('cabe en poco espacio (< 3 KB)', size < 3000, `${size} bytes`);
  check('no guarda filas de la tabla', !('records' in e1) && !JSON.stringify(e1).includes('"is":{'));
}

section('Comparación con el análisis anterior del mismo EA');
{
  // Reoptimización con la meseta en el mismo sitio: los valores de ahora, dentro del tramo de antes.
  const e2 = { ...e1, id: 'a2', at: '2026-10-02T10:00:00.000Z', level: 'good', pick: { ...e1.pick, pass: 99999 } };
  const c = compare(e1, e2);
  check('mismos mínimos → niveles comparables', c.levelsComparable && c.gatesSame && c.reasons.length === 0);
  check('todos los parámetros dentro de la meseta anterior', c.insideCount === e1.params.length, `${c.insideCount}/${e1.params.length}`);
  check('el número de pasada no cuenta', c.params.every((p) => p.inside));
  // Un parámetro se va fuera del tramo.
  const j = 0;
  const out = e1.pick.span[j].max + 1000;
  const e3 = { ...e2, id: 'a3', pick: { ...e2.pick, values: e2.pick.values.map((v, k) => (k === j ? out : v)) } };
  const c3 = compare(e1, e3);
  check('un parámetro fuera → se cuenta fuera', c3.insideCount === e1.params.length - 1 && c3.params[j].inside === false);
  // Otros mínimos: el nivel no es comparable.
  const e4 = { ...e2, id: 'a4', gates: { ...e2.gates, minProfitFactor: 1.5 }, level: 'strong' };
  const c4 = compare(e1, e4);
  check('otros mínimos → niveles no comparables', !c4.levelsComparable && c4.reasons.includes('gates'));
  check('el cambio de nivel se calcula igual (para decirlo con cautela)', c4.levelDelta === 1);
  // Sin meseta antes: no hay tramos con los que comparar.
  const e5 = { ...e1, id: 'a5', pick: null, fallback: { pass: 1, values: e1.pick.values } };
  check('sin meseta antes → sin comparación por parámetro', compare(e5, e2).bothPicks === false && compare(e5, e2).params.length === 0);
}

section('Lista: añadir, no duplicar la misma ejecución, límite e intentos');
{
  let list = [];
  list = addEntry(list, e1);
  const again = { ...e1, id: 'a1b', at: '2026-10-01T10:05:00.000Z' };
  list = addEntry(list, again);
  check('volver a analizar exactamente lo mismo no cuenta como otro intento', list.length === 1 && list[0].id === 'a1b');
  const unseenKept = addEntry([{ ...e1, unseen: { level: 'normal' } }], { ...e1, id: 'a1c' });
  check('y si ya tenía el periodo no visto, no se pierde', unseenKept.length === 1 && unseenKept[0].unseen && unseenKept[0].unseen.level === 'normal');
  const other = { ...e1, id: 'b1', gates: { ...e1.gates, minTrades: 200 } };
  list = addEntry(list, other);
  check('otros mínimos sí cuentan como otro intento', list.length === 2 && attempts(list, e1.fp) === 2);
  check('el anterior del mismo EA', previousFor(list, other).id === 'a1b' && previousFor(list, list[0]) === null);
  const foreign = { ...e1, id: 'z1', fp: 'p00000000' };
  list = addEntry(list, foreign);
  check('otro EA no suma intentos', attempts(list, e1.fp) === 2 && attempts(list, 'p00000000') === 1);
  let big = [];
  for (let i = 0; i < HISTORY_MAX + 7; i++) big = addEntry(big, { ...e1, id: `n${i}`, total: i });
  check(`se conservan los ${HISTORY_MAX} más recientes`, big.length === HISTORY_MAX && big[0].id === 'n7' && big[big.length - 1].id === `n${HISTORY_MAX + 6}`);
}

section('Almacén: tolera datos rotos');
{
  check('vacío', JSON.stringify(parseStore(null)) === JSON.stringify(emptyStore()));
  check('JSON roto → vacío', parseStore('{no').entries.length === 0);
  check('otra versión → vacío', parseStore(JSON.stringify({ v: 99, entries: [e1] })).entries.length === 0);
  const s = parseStore(JSON.stringify({ v: HISTORY_VERSION, off: true, seen: true, labels: { [e1.fp]: 'Cruce MAs' }, entries: [e1, null, { id: 3 }] }));
  check('conserva ajustes y descarta entradas inválidas', s.off && s.seen && s.labels[e1.fp] === 'Cruce MAs' && s.entries.length === 1);
}

console.log(`\n${'='.repeat(70)}\nRESULTADO: ${checks - failures}/${checks} comprobaciones correctas\n${'='.repeat(70)}`);
if (failures) process.exit(1);
