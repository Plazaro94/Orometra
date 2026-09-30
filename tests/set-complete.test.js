// El .set de despliegue completo: el export de optimización solo trae los parámetros
// optimizados (en una optimización real, 8 de 78); con el .set de la optimización se completa.
//
//   node tests/set-complete.test.js

import { generateCase } from '../bench/sim.js';
import { runAnalysis } from '../core/analysis.js';
import { parseSetText, mergeSetValues, compareOtherParams } from '../core/setfile.js';
import { buildSetFile, buildRefinementSetFile, setCoverageNote } from '../js/export.js';
import { setLocale } from '../js/i18n.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}
function section(t) { console.log(`\n${'='.repeat(70)}\n${t}\n${'='.repeat(70)}`); }
setLocale('es');

section('1. El lector del .set conserva el texto original de cada valor');
{
  const set = parseSetText('InpLot=0.10||0.10||1||0.10||N\nInpMode=2\nInpName=Mi EA\nInpP=16||12||2||20||Y\n');
  const byName = Object.fromEntries(set.params.map((p) => [p.name, p]));
  check('un valor con ceros finales no se reescribe', byName.InpLot.raw === '0.10', byName.InpLot.raw);
  check('sin rangos también', byName.InpMode.raw === '2');
  check('los textos con espacios se conservan', byName.InpName.raw === 'Mi EA', byName.InpName.raw);
  check('los parámetros optimizados llevan su bandera', byName.InpP.enabled === true && byName.InpLot.enabled === false);
}

section('2. Mezcla: la meseta manda en lo optimizado y el .set en el resto');
{
  const base = parseSetText('InpMagic=3040||3040||1||3040||N\nInpP=16||12||2||20||Y\nInpLot=0.10||0.10||1||0.10||N\nInpQ=1.5||1||0.5||3||Y\n');
  const m = mergeSetValues(['InpP', 'InpQ', 'InpNuevo'], ['18', '2', '7'], base);
  check('es completo', m.complete === true);
  check('conserva el orden del .set', m.entries.map((e) => e.name).join(',') === 'InpMagic,InpP,InpLot,InpQ,InpNuevo', m.entries.map((e) => e.name).join(','));
  check('los optimizados llevan el valor de la meseta', m.entries.find((e) => e.name === 'InpP').text === '18' && m.entries.find((e) => e.name === 'InpQ').text === '2');
  check('el resto lleva el valor del .set tal cual', m.entries.find((e) => e.name === 'InpLot').text === '0.10' && m.entries.find((e) => e.name === 'InpMagic').text === '3040');
  check('un optimizado que el .set no menciona se conserva', m.entries.find((e) => e.name === 'InpNuevo').text === '7');
  check('cuenta 3 optimizados y 2 del .set', m.optimized === 3 && m.fromSet === 2, `${m.optimized}/${m.fromSet}`);
  const sin = mergeSetValues(['InpP'], ['18'], null);
  check('sin .set no es completo y solo lleva lo optimizado', sin.complete === false && sin.entries.length === 1);
}

section('3. Los ficheros exportados');
{
  const c = generateCase('S3', 1);
  const a = runAnalysis({ isTable: c.isTable, oosTable: c.oosTable });
  const p = a.plateaus[0];
  const names = a.meta.paramNames;
  const baseText = ['InpMagic=3040||3040||1||3040||N', 'InpLots=0.10||0.10||1||0.10||N',
    ...names.map((n) => `${n}=1||1||1||9||Y`), 'InpComment=PLS||PLS||0||PLS||N'].join('\r\n');
  const base = parseSetText(baseText);
  const solo = buildSetFile(a, p).split(/\r?\n/).filter((l) => l && !l.startsWith(';'));
  const full = buildSetFile(a, p, base).split(/\r?\n/).filter((l) => l && !l.startsWith(';'));
  check('sin .set: solo los parámetros optimizados', solo.length === names.length, String(solo.length));
  check('con .set: todos', full.length === names.length + 3, String(full.length));
  check('con .set: lo no optimizado sale como en el .set', full.includes('InpLots=0.10') && full.includes('InpMagic=3040') && full.includes('InpComment=PLS'));
  check('con .set: lo optimizado sale con la meseta', names.every((n, j) => full.some((l) => l.startsWith(`${n}=`) && l !== `${n}=1`) || String(p.record.params[j]) === '1'));
  const txtSolo = buildSetFile(a, p);
  check('sin .set el archivo lo advierte', /OJO: este archivo solo lleva/.test(txtSolo));
  const ref = buildRefinementSetFile(a, p, base).split(/\r?\n/).filter((l) => l && !l.startsWith(';'));
  check('el refinamiento fija (N) lo no optimizado', ref.includes('InpLots=0.10||0.10||0||0.10||N') && ref.length === names.length + 3, ref.length + '');
  check('la nota de la interfaz dice si falta', /solo lleva los \d+ parámetros/.test(setCoverageNote(a, p)) && /lleva los \d+ parámetros:/.test(setCoverageNote(a, p, base)));
  setLocale('en');
  check('y en inglés', /only carries/.test(setCoverageNote(a, p)) && /carries all/.test(setCoverageNote(a, p, base)));
  setLocale('es');
}

section('4. Backtest del periodo no visto frente al .set de la optimización');
{
  const base = parseSetText('InpP=16||12||2||20||Y\nInpLot=0.10||0.10||1||0.10||N\nInpRisk=1||1||1||1||N\nInpFilter=true||true||0||true||N\n');
  const same = compareOtherParams({ InpP: '18', InpLot: '0.1', InpRisk: '1.0', InpFilter: 'true' }, base, ['InpP']);
  check('mismos valores con otro formato no se marcan', same.length === 0, JSON.stringify(same));
  const diff = compareOtherParams({ InpP: '18', InpLot: '0.5', InpRisk: '1', InpFilter: 'false' }, base, ['InpP']);
  check('se marcan los que difieren', diff.map((d) => d.name).join(',') === 'InpLot,InpFilter', diff.map((d) => d.name).join(','));
  check('los optimizados no se comparan aquí', !diff.some((d) => d.name === 'InpP'));
  check('sin .set no hay nada que comparar', compareOtherParams({ A: '1' }, null, []).length === 0);
}

console.log(`\nRESULTADO: ${checks - failures}/${checks} comprobaciones correctas`);
if (failures) process.exit(1);
