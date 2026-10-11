// Lo que destapó un export real de MT5 (2026-10-11): una optimización genética de 19
// parámetros, su forward dañado y su .set, y un comentario de Reddit.
//
// - Sin forward, el informe numeraba las configuraciones por su posición en la tabla, no por
//   la pasada de MT5. MT5 exporta las pasadas desordenadas: la «pasada» recomendada era otra
//   configuración, o no existía.
// - El .set guarda los booleanos y los enums optimizados con «false||false||0||true||Y» y con
//   paso 0; se leían como fijos y la cobertura salía hasta 32 veces más pequeña.
// - Proporciones diminutas salían como «0,0000 %».
// - Un forward dañado (filas sin pasada, valores con el tipo equivocado) salía como «los
//   archivos no encajan», o se analizaba en silencio con las filas sanas.
//
//   node tests/real-export.test.js

import { setLocale, shareText } from '../js/i18n.js';
import { runAnalysis, markResultTwins } from '../core/analysis.js';
import { mt5Figure, findInMt5Html } from '../js/ui-state.js';
import { parseSetText, coverageAgainstSet, discreteRange } from '../core/setfile.js';
import { passIds, damageReport, isImpossibleNumber } from '../core/schema.js';
import { parseXmlSpreadsheet } from '../core/parse.js';
import { buildDemoTables } from '../js/demo.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}
setLocale('es');

// Permutación determinista (semilla fija).
function shuffle(n, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const p = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  return p;
}

console.log('\nNúmero de pasada sin forward');
{
  const demo = buildDemoTables();
  const t = demo.isTable;
  const pc = t.headers.findIndex((h) => /^pass$/i.test(h));
  const n = t.rows.length;
  const nums = shuffle(n, 7);
  const order = shuffle(n, 11);
  // Pasadas renumeradas y filas desordenadas, como en un export genético.
  const rows = order.map((i) => { const r = t.rows[i].slice(); r[pc] = nums[i] + 100000; return r; });
  const table = { headers: t.headers, rows };
  const a = runAnalysis({ isTable: table });
  const rec = a.plateaus[0].record;
  const cols = a.meta.paramNames.map((name) => t.headers.indexOf(name));
  const row = rows.find((r) => cols.every((c, k) => String(r[c]) === String(rec.params[k])));
  check('la pasada recomendada es la de MT5 (la de su fila), no su posición', row && String(row[pc]) === rec.id, `${rec.id} frente a ${row && row[pc]}`);
  check('y la pasada con ese número tiene esos parámetros', String(rows.find((r) => String(r[pc]) === rec.id)?.slice(0, 1)) !== 'undefined');
  check('sin aviso de numeración por fila', !a.verdict.findings.some((f) => /numeradas por su fila/.test(f.title)));

  const ids = passIds(table);
  check('passIds: lee la columna Pass', ids.source === 'pass' && ids.ids[0] === String(rows[0][pc]));
  const noPass = { headers: t.headers.filter((_, k) => k !== pc), rows: rows.map((r) => r.filter((_, k) => k !== pc)) };
  check('sin columna Pass: se numera por fila desde 1', passIds(noPass).source === 'row' && passIds(noPass).ids[0] === '1');
  const dup = { headers: t.headers, rows: rows.map((r, i) => { const c = r.slice(); c[pc] = i % 2; return c; }) };
  check('con números repetidos: por fila, y se dice', passIds(dup).source === 'pass-duplicated');
  const b = runAnalysis({ isTable: noPass });
  check('sin columna Pass, el informe avisa de que el número es la fila',
    b.verdict.findings.some((f) => /numeradas por su fila/.test(f.title)), b.verdict.findings.map((f) => f.title).join(' | '));
}

console.log('\n.set: booleanos y enums optimizados (formato de un .set real de MT5)');
{
  const set = parseSetText([
    'InpUseTrendFilter=false||false||0||true||Y',
    'InpTrendTF=16385||16385||0||16388||Y',
    'InpEntryMode=0||0||0||1||Y',
    'InpPivotLen=3||3||1||8||Y',
    'InpWideEnum=1||1||0||16388||Y',
    'InpFixed=true||false||0||true||N',
  ].join('\r\n'));
  const byName = Object.fromEntries(set.params.map((p) => [p.name, p]));
  check('booleano: 2 niveles', discreteRange(byName.InpUseTrendFilter)?.levels === 2);
  check('enum de H1 a H4 (16385…16388): 4 niveles', discreteRange(byName.InpTrendTF)?.levels === 4);
  check('enum 0…1: 2 niveles', discreteRange(byName.InpEntryMode)?.levels === 2);
  check('enum muy separado (de M1 a H4): aproximado con los vistos', discreteRange(byName.InpWideEnum, 3)?.approximate === true && discreteRange(byName.InpWideEnum, 3).levels === 3);
  check('numérico normal: no es discreto', discreteRange(byName.InpPivotLen) === null);
  const names = ['InpUseTrendFilter', 'InpTrendTF', 'InpEntryMode', 'InpPivotLen', 'InpFixed'];
  const matrix = [[true, 16385, 0, 3, true], [false, 16386, 1, 8, true], [true, 16388, 1, 5, true]];
  const cov = coverageAgainstSet(names, matrix, set);
  // 2 × 4 × 2 × 6 (de 3 a 8) = 96; InpFixed va con N: no cuenta.
  check('espacio de búsqueda: 2 × 4 × 2 × 6 = 96', cov.searchCartesian === 96, String(cov.searchCartesian));
  check('nada fuera de rango', cov.outsideAny === false);
  const out = coverageAgainstSet(names, [[true, 16390, 0, 3, true]], set);
  check('un enum fuera de su tramo se marca', out.outsideAny === true);
}

console.log('\nProporciones legibles');
{
  setLocale('es');
  check('50 % → «50 %»', shareText(0.5) === '50 %', shareText(0.5));
  check('0,5 % → «0,5 %»', shareText(0.005) === '0,5 %', shareText(0.005));
  check('5043 de 263.363.788.800 → «1 de cada 52.223.635 combinaciones»',
    shareText(5043 / 263363788800, 'combinaciones') === '1 de cada 52.223.635 combinaciones', shareText(5043 / 263363788800, 'combinaciones'));
  setLocale('en');
  check('EN: «1 in 52,223,635 combinations»', shareText(5043 / 263363788800, '', 'combinations') === '1 in 52,223,635 combinations');
  check('EN: 12.5% → «12.5%»', shareText(0.125) === '12.5%', shareText(0.125));
  setLocale('es');
}

console.log('\nExport dañado');
{
  check('4616189618054758400 (bits de 4.0) es imposible', isImpossibleNumber(4616189618054758400));
  check('9.88e-324 (bits de 2) es imposible', isImpossibleNumber(9.8813129168249309e-324));
  check('un beneficio de 2.709.036,54 no lo es', !isImpossibleNumber(2709036.54));
  check('una pasada 4194 no lo es', !isImpossibleNumber(4194));
  const xml = '<?xml version="1.0"?><Workbook xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="T"><Table>'
    + '<Row><Cell><Data ss:Type="String">Pass</Data></Cell><Cell><Data ss:Type="String">Profit</Data></Cell></Row>'
    + '<Row><Cell><Data ss:Type="Number"></Data></Cell><Cell><Data ss:Type="Number">7.4375952507966796e-311</Data></Cell></Row>'
    + '<Row><Cell><Data ss:Type="Number">12</Data></Cell><Cell><Data ss:Type="Number">100.5</Data></Cell></Row>'
    + '</Table></Worksheet></Workbook>';
  const parsed = parseXmlSpreadsheet(xml);
  check('una celda numérica vacía se lee vacía, no 0', parsed.rows[1][0] === null, String(parsed.rows[1][0]));
  const table = { headers: ['Pass', 'Profit'], rows: parsed.rows.slice(1) };
  const r = damageReport(table);
  check('1 de 2 filas dañada', r.damaged === 1 && r.rows === 2, JSON.stringify(r));

  const demo = buildDemoTables();
  const o = demo.oosTable;
  const pc = o.headers.findIndex((h) => /^pass$/i.test(h));
  const bad = { headers: o.headers, rows: o.rows.map((row, i) => (i % 10 === 0 ? row : row.map((v, k) => (k === pc ? null : (typeof v === 'number' && k % 3 === 0 ? 7.4e-311 : v))))) };
  let err = null;
  try { runAnalysis({ isTable: demo.isTable, oosTable: bad }); } catch (e) { err = e; }
  check('forward con el 90 % de filas dañadas: no se analiza', err && err.details && err.details.reason === 'damagedExport', err ? err.message : 'se analizó');
  check('y el aviso dice que es el forward', err && /forward/.test(err.message) && err.code === 'FILE_ERROR', err && err.message);
  const fine = runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable });
  check('el ejemplo sano se sigue analizando', fine.plateaus.length > 0);
  check('y sin filas descartadas', fine.integrity.damagedDropped.is === 0 && fine.integrity.damagedDropped.oos === 0);

  // Menos del 1 %: esas filas se quitan y se dice. Una de ellas, con un beneficio y un factor de
  // beneficio imposibles, no puede colarse en el ranking.
  const t = demo.isTable;
  const prof = t.headers.findIndex((h) => /^profit$/i.test(h));
  const pf = t.headers.findIndex((h) => /^profit factor$/i.test(h));
  const ipc = t.headers.findIndex((h) => /^pass$/i.test(h));
  const few = { headers: t.headers, rows: t.rows.map((row, i) => (i % 500 === 7 ? row.map((v, k) => (k === prof ? 4616189618054758400 : k === pf ? 4616189618054758400 : v)) : row)) };
  const nBad = few.rows.filter((_, i) => i % 500 === 7).length;
  const g = runAnalysis({ isTable: few, oosTable: demo.oosTable });
  check(`${nBad} filas dañadas (< 1 %): se analizan las demás`, g.plateaus.length > 0);
  check('se cuentan como descartadas', g.integrity.damagedDropped.is === nBad, JSON.stringify(g.integrity.damagedDropped));
  check('y el informe lo dice', g.verdict.findings.some((f) => /filas dañadas descartadas/.test(f.title)), g.verdict.findings.map((f) => f.title).join(' | '));
  const badIds = new Set(few.rows.filter((_, i) => i % 500 === 7).map((r) => String(r[ipc])));
  check('ninguna fila dañada aparece en el resultado', !g.plateaus.some((p) => badIds.has(p.record.id)) && !g.peaks.some((p) => badIds.has(p.record.id)));
}

console.log('\nEnums del .set: sin «pegada al borde»');
{
  // InpMinBodyPct sin el nivel 10: la recomendada (20) queda en el borde inferior.
  const t = buildDemoTables().isTable;
  const j = t.headers.indexOf('InpMinBodyPct');
  const table = { headers: t.headers, rows: t.rows.filter((r) => r[j] !== 10) };
  const base = ['InpFastMA=8||8||2||18||Y', 'InpSlowMA=40||40||10||100||Y', 'InpATR_SL=1.0||1.0||0.5||3.5||Y',
    'InpATR_TP=1.0||1.0||1.0||6.0||Y', 'InpTrailStart=0.5||0.5||0.5||2.5||Y'];
  const edgeNames = (a) => a.plateaus[0].boundary.map((b) => b.name);
  const plain = runAnalysis({ isTable: table });
  check('sin .set: InpMinBodyPct = 20 sale pegado al borde', edgeNames(plain).includes('InpMinBodyPct'), JSON.stringify(edgeNames(plain)));
  const asNumber = runAnalysis({ isTable: table, searchSet: parseSetText([...base, 'InpMinBodyPct=20||20||10||40||Y'].join('\r\n')) });
  check('con .set y paso 10 (numérico): sigue saliendo', edgeNames(asNumber).includes('InpMinBodyPct'));
  const asEnum = runAnalysis({ isTable: table, searchSet: parseSetText([...base, 'InpMinBodyPct=20||20||0||40||Y'].join('\r\n')) });
  check('con .set y paso 0 (enum): ya no sale', !edgeNames(asEnum).includes('InpMinBodyPct'), JSON.stringify(edgeNames(asEnum)));
  check('y la recomendación es la misma', asEnum.plateaus[0].record.id === plain.plateaus[0].record.id);
}

console.log('\nMuestreo disperso con .set: un aviso, no dos');
{
  // 1 de cada 200 pasadas de la rejilla del ejemplo: muestreo disperso (1 % sobre niveles vistos).
  const t = buildDemoTables().isTable;
  const table = { headers: t.headers, rows: t.rows.filter((_, i) => i % 200 === 0) };
  const names = ['InpFastMA', 'InpSlowMA', 'InpATR_SL', 'InpATR_TP', 'InpTrailStart', 'InpMinBodyPct'];
  const wide = parseSetText(['InpFastMA=8||8||2||18||Y', 'InpSlowMA=40||40||10||100||Y', 'InpATR_SL=1.0||1.0||0.5||3.5||Y',
    'InpATR_TP=1.0||1.0||1.0||6.0||Y', 'InpTrailStart=0.5||0.5||0.5||2.5||Y', 'InpMinBodyPct=10||10||10||40||Y'].join('\r\n'));
  // El mismo rango que los niveles que aparecen en la muestra: las dos cifras coinciden.
  const seen = parseSetText(names.map((n) => {
    const j = t.headers.indexOf(n);
    const v = [...new Set(table.rows.map((r) => r[j]))].sort((a, b) => a - b);
    const step = v.length > 1 ? Math.min(...v.slice(1).map((x, k) => x - v[k])) : 0;
    return `${n}=${v[0]}||${v[0]}||${step}||${v[v.length - 1]}||${v.length > 1 ? 'Y' : 'N'}`;
  }).join('\r\n'));
  const warns = (a) => a.verdict.findings.filter((f) => f.severity === 'warn');
  const coverageWarns = (a) => warns(a).filter((f) => /disperso|rango del \.set/.test(f.title));
  const without = runAnalysis({ isTable: table });
  check('es muestreo disperso', without.meta.sampling === 'sparse', without.meta.sampling);
  for (const [label, set] of [['rango más amplio que lo visto', wide], ['rango = niveles vistos', seen]]) {
    const withSet = runAnalysis({ isTable: table, searchSet: set });
    const w = coverageWarns(withSet);
    check(`${label}: un solo aviso de cobertura`, w.length === 1, w.map((f) => f.title).join(' | '));
    check(`${label}: el del rango del .set`, /^Muestreo disperso: solo .* del rango del \.set$/.test(w[0]?.title || ''), w[0]?.title);
    check(`${label}: aportar el .set no suma avisos ni cambia el nivel`,
      warns(withSet).length === warns(without).length && withSet.verdict.level === without.verdict.level, `${warns(without).length} → ${warns(withSet).length}`);
    const seenText = `Sobre los niveles que aparecen en tus archivos: ${shareText(without.meta.coverage, 'combinaciones')}.`;
    const differs = shareText(withSet.searchCoverage?.coverageSearch ?? withSet.meta.searchCoverage?.coverageSearch, 'combinaciones') !== shareText(without.meta.coverage, 'combinaciones');
    check(`${label}: la cifra sobre niveles vistos sale ${differs ? 'en el detalle' : 'una sola vez'}`, (w[0]?.detail || '').includes(seenText) === differs, w[0]?.detail);
  }
}

console.log('\nBuscarla en MT5 por sus cifras, no por el número de pasada');
{
  check('13412.5 → «13412.50», como la tabla de MT5', mt5Figure(13412.5) === '13412.50');
  check('-289.56 → «-289.56» (punto decimal, sin millares)', mt5Figure(-289.56) === '-289.56');
  check('más de dos decimales: tal cual', mt5Figure(1.234567) === '1.234567');
  const rec = (params, profit, trades) => ({ params, is: { profit, trades } });
  const rs = [rec([1, 2], 100.5, 10), rec([1, 3], 100.5, 10), rec([2, 2], 100.5, 10), rec([1, 2], 100.5, 10), rec([5, 5], 7, 3), rec([6, 6], 7, 4)];
  markResultTwins(rs);
  check('3 configuraciones distintas con las mismas cifras: 2 gemelas cada una', rs[0].twins === 2 && rs[1].twins === 2 && rs[2].twins === 2, rs.map((r) => r.twins).join(','));
  check('la fila repetida con los mismos parámetros no cuenta como otra', rs[3].twins === 2);
  check('mismo beneficio y distintas operaciones: no son gemelas', rs[4].twins === 0 && rs[5].twins === 0);
  setLocale('es');
  const html = findInMt5Html({ is: { profit: 155206.34, trades: 515 }, criterionIs: 5.21, twins: 2 }, true);
  check('el texto da beneficio, operaciones y Result como en MT5', /beneficio <b>155206\.34<\/b> · <b>515<\/b> operaciones · Resultado <b>5\.21<\/b>/.test(html), html);
  check('dice que el número es del archivo y que MT5 no lo guarda', /número de pasada es el de tu archivo exportado: MT5 no lo guarda al cerrarse/.test(html));
  check('y avisa de las 2 con las mismas cifras', /Hay 2 configuraciones más con esas mismas cifras/.test(html));
  check('con forward: en los resultados de la optimización, no en los del forward', /no en los del forward/.test(html));
  setLocale('en');
  const en = findInMt5Html({ is: { profit: 155206.34, trades: 515 }, criterionIs: 5.21, twins: 1 }, false);
  check('EN: profit 155206.34 · 515 trades · Result 5.21, one twin', /profit <b>155206\.34<\/b> · <b>515<\/b> trades · Result <b>5\.21<\/b>/.test(en) && /Another configuration has the same figures/.test(en), en);
  setLocale('es');
  const a = runAnalysis({ isTable: buildDemoTables().isTable });
  check('el análisis marca las gemelas de cada configuración', a.plateaus.every((p) => Number.isInteger(p.record.twins)));
}

console.log(`\n${checks - failures}/${checks} comprobaciones correctas`);
if (failures) process.exit(1);
