// Historial local de análisis (core/history.js): huella, resumen, comparación e intentos.
//
//   node tests/history.test.js

import { buildDemoTables } from '../js/demo.js';
import { runAnalysis } from '../core/analysis.js';
import {
  fingerprint, summarize, emptyStore, parseStore, addEntry, previousFor, attempts,
  insideSpan, compare, dataSignature, HISTORY_MAX, HISTORY_VERSION,
  addUnseenTry, earlierCountedTries, UNSEEN_TRIES_MAX, otherConfigOnSameDates, dropWholeReportTry,
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
  // Parámetros de sí/no o de lista: el tramo son los valores que toma la meseta.
  check('sí/no: uno de los valores de la meseta', insideSpan(true, { values: [true] }) && insideSpan(false, { values: [true, false] }));
  check('sí/no: un valor que la meseta no tenía → fuera', !insideSpan(false, { values: [true] }));
  check('lista de texto', insideSpan('EMA', { values: ['SMA', 'EMA'] }) && !insideSpan('WMA', { values: ['SMA', 'EMA'] }));
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

section('Huella de los datos: mismo export, misma huella; otro export con el mismo nombre, otra');
{
  check('respuesta conocida: sin filas, la base de FNV-1a', dataSignature({ records: [] }) === 'd811c9dc5');
  check('el mismo análisis da la misma huella', dataSignature(analysis) === dataSignature(runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable })));
  const shifted = { ...demo.isTable, rows: demo.isTable.rows.map((r, i) => (i === 7 ? r.map((v, k) => (k === 2 ? v + 1 : v)) : r)) };
  check('un beneficio distinto en una sola pasada cambia la huella', dataSignature(analysis) !== dataSignature(runAnalysis({ isTable: shifted, oosTable: demo.oosTable })));
  check('se guarda en el resumen', e1.sig === dataSignature(analysis));
  // Otra optimización con el mismo nombre de archivo, mismos mínimos, mismas filas y la misma
  // pasada recomendada (la misma rejilla sobre otro periodo): es otro intento, no el mismo.
  const otherPeriod = { ...e1, id: 'p2', sig: 'dffffffff', level: 'moderate' };
  const both = addEntry([e1], otherPeriod);
  check('otro export con el mismo nombre no sustituye al anterior', both.length === 2 && both[0].id === 'a1' && both[1].id === 'p2');
  check('y la comparación sabe que no son los mismos datos', compare(e1, otherPeriod).sameData === false && compare(e1, { ...e1, id: 'x' }).sameData === true);
  // El mismo export con otro nombre sí es el mismo análisis.
  check('el mismo export renombrado no cuenta como otro intento', addEntry([e1], { ...e1, id: 'r', files: { is: 'otro.xml', oos: 'otro-fwd.xml' } }).length === 1);
  // Guardados antes de la huella de datos: la regla de antes.
  const legacy = { ...e1, sig: undefined };
  check('sin huella de datos: mismos archivos, filas y pasada → el mismo', addEntry([legacy], { ...legacy, id: 'l2' }).length === 1);
  check('sin huella de datos: otras filas → otro', addEntry([legacy], { ...legacy, id: 'l3', total: 1 }).length === 2);
  check('sin huella: la comparación no se pronuncia', compare(legacy, { ...legacy, id: 'l4' }).sameData === null);
}

section('Parámetros de sí/no: la meseta en el mismo sitio con los mismos datos');
{
  // Respuesta conocida: los mismos datos dos veces → todos los parámetros dentro.
  const addBool = (t) => ({ ...t, headers: [...t.headers, 'InpUseFilter'], rows: t.rows.map((r) => [...r, r[0] % 2 ? 'true' : 'false']) });
  const ab = runAnalysis({ isTable: addBool(demo.isTable), oosTable: addBool(demo.oosTable) });
  const j = ab.meta.paramNames.indexOf('InpUseFilter');
  const b1 = summarize(ab, { id: 'b1', at: '2026-10-01T10:00:00.000Z', level: 'strong', files: { is: 'b.xml' } });
  const b2 = { ...b1, id: 'b2', gates: { ...b1.gates, minProfitFactor: 1.15 } };
  check('el parámetro de sí/no se detecta', j >= 0, ab.meta.paramNames.join(','));
  check('su tramo son los valores de la meseta', b1.pick && b1.pick.span[j] && Array.isArray(b1.pick.span[j].values) && b1.pick.span[j].values.includes(b1.pick.values[j]), JSON.stringify(b1.pick && b1.pick.span[j]));
  const cb = compare(b1, b2);
  check('mismos datos → todos dentro, también el de sí/no', cb.insideCount === ab.meta.paramNames.length && cb.knownCount === ab.meta.paramNames.length, `${cb.insideCount}/${cb.knownCount}`);
  // Un análisis guardado antes del arreglo no tenía ese tramo: no consta, ni dentro ni fuera.
  const old = { ...b1, id: 'b0', pick: { ...b1.pick, span: b1.pick.span.map((s, k) => (k === j ? null : s)) } };
  const co = compare(old, b2);
  check('tramo que no consta → ni dentro ni fuera', co.params[j].inside === null && co.knownCount === ab.meta.paramNames.length - 1 && co.insideCount === co.knownCount);
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
  for (let i = 0; i < HISTORY_MAX + 7; i++) big = addEntry(big, { ...e1, id: `n${i}`, total: i, sig: `d${i}` });
  check(`se conservan los ${HISTORY_MAX} más recientes`, big.length === HISTORY_MAX && big[0].id === 'n7' && big[big.length - 1].id === `n${HISTORY_MAX + 6}`);
}

section('Periodo no visto: cada backtest comparado queda apuntado');
{
  const ok1 = { key: '2025-01-02|2025-07-01|88|4178.46', at: 't1', level: 'normal', counts: true, against: false };
  const bad = { key: '2025-01-02|2025-07-01|88|-3300.1', at: 't2', level: 'outside', counts: true, against: true };
  let tries = addUnseenTry([], ok1);
  tries = addUnseenTry(tries, bad);
  tries = addUnseenTry(tries, { ...ok1, at: 't3' });
  check('bueno → malo → bueno: quedan los dos backtests, no solo el último', tries.length === 2 && tries[0].level === 'outside', JSON.stringify(tries));
  check('el mismo backtest otra vez no es otro intento: conserva su fecha y pasa al final', tries[1].key === ok1.key && tries[1].at === 't1');
  const moved = addUnseenTry(tries, { ...ok1, at: 't4', counts: false, plateau: 2 });
  check('compararlo con otra meseta actualiza su resultado', moved.length === 2 && moved[1].counts === false && moved[1].plateau === 2);
  check('los anteriores que contaron: el malo, visto desde el bueno', earlierCountedTries(tries, ok1.key).map((t) => t.key).join() === bad.key);
  const wrongFirst = addUnseenTry([{ key: 'otro-set', at: 't0', level: 'normal', counts: false }], ok1);
  check('uno de otro .set corregido después no cuenta como prueba anterior', earlierCountedTries(wrongFirst, ok1.key).length === 0);
  check('sin intentos no hay nada que avisar', earlierCountedTries(undefined, 'x').length === 0);
  let many = [];
  for (let i = 0; i < UNSEEN_TRIES_MAX + 3; i++) many = addUnseenTry(many, { key: `k${i}`, at: `t${i}`, level: 'normal', counts: true });
  check(`como mucho ${UNSEEN_TRIES_MAX} por análisis`, many.length === UNSEEN_TRIES_MAX && many[0].key === 'k3');

  const withTries = addEntry([{ ...e1, unseen: { level: 'normal' }, unseenTries: tries }], { ...e1, id: 'a1d', unseenTries: [] });
  check('al volver a analizar los mismos datos, los intentos no se pierden', withTries.length === 1 && withTries[0].unseenTries.length === 2);
  check('un análisis nuevo empieza sin intentos', Array.isArray(summarize(runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable }), { id: 'x', at: 'y', level: 'good', files: { is: 'a' } }).unseenTries));
}

section('Almacén: tolera datos rotos');
{
  check('vacío', JSON.stringify(parseStore(null)) === JSON.stringify(emptyStore()));
  check('JSON roto → vacío', parseStore('{no').entries.length === 0);
  check('otra versión → vacío', parseStore(JSON.stringify({ v: 99, entries: [e1] })).entries.length === 0);
  const s = parseStore(JSON.stringify({ v: HISTORY_VERSION, off: true, seen: true, labels: { [e1.fp]: 'Cruce MAs' }, entries: [e1, null, { id: 3 }] }));
  check('conserva ajustes y descarta entradas inválidas', s.off && s.seen && s.labels[e1.fp] === 'Cruce MAs' && s.entries.length === 1);
}

section('Previsión del Monte Carlo: otra configuración comparada con las mismas fechas');
{
  const tries = [
    { key: 'a', from: '2024-01-01', to: '2024-12-31', plateau: 1 },
    { key: 'b', from: '2024-06-01', to: '2025-06-30', plateau: 2 },
    { key: 'c', from: '2020-01-01', to: '2020-12-31', plateau: 3 },
  ];
  const hit = otherConfigOnSameDates(tries, { from: '2025-01-01', to: '2025-12-31', plateau: 1 });
  check('otra meseta con fechas que se solapan cuenta', hit.length === 1 && hit[0].key === 'b');
  check('la misma meseta en otro tramo no cuenta', otherConfigOnSameDates(tries, { from: '2024-01-01', to: '2024-03-31', plateau: 1 }).length === 0);
  check('otra meseta en fechas que no se tocan no cuenta', otherConfigOnSameDates(tries, { from: '2021-01-01', to: '2021-12-31', plateau: 1 }).length === 0);
  check('sin fechas del informe, nada', otherConfigOnSameDates(tries, { from: null, to: null, plateau: 1 }).length === 0);
}

section('Fecha de corte: la comparación con el informe entero no cuenta como otro intento');
{
  const tries = [
    { key: 'entero', file: 'largo.html', from: '2021-01-04', to: '2025-12-26' },
    { key: 'corte1', file: 'largo.html', from: '2024-01-01', to: '2025-12-26' },
    { key: 'otro', file: 'otro.html', from: '2021-01-04', to: '2025-12-26' },
  ];
  const left = dropWholeReportTry(tries, { file: 'largo.html', from: '2021-01-04', to: '2025-12-26' }).map((t) => t.key).join();
  check('se quita la del informe entero del mismo archivo; se quedan otra fecha de corte y otro archivo', left === 'corte1,otro', left);
}

console.log(`\n${'='.repeat(70)}\nRESULTADO: ${checks - failures}/${checks} comprobaciones correctas\n${'='.repeat(70)}`);
if (failures) process.exit(1);
