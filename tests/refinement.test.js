// Rango de refinamiento con el paso a la mitad (core/engine.js#finerRefinement), para
// cuando la optimización ya probó la rejilla entera: respuestas conocidas.
//
//   node tests/refinement.test.js

import { finerRefinement } from '../core/engine.js';
import { buildDemoTables } from '../js/demo.js';
import { runAnalysis } from '../core/analysis.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}

const levels = [[10, 12, 14, 16, 18], [1, 1.5, 2, 2.5, 3], [1, 2, 3, 4, 5, 6], [true, false]];
const base = [
  { name: 'MA', type: 'number', constant: false, center: 14, start: 10, stop: 18, step: 2, levels: 5 },
  { name: 'SL', type: 'number', constant: false, center: 2, start: 1, stop: 3, step: 0.5, levels: 5 },
  { name: 'TP', type: 'number', constant: false, center: 4, start: 1, stop: 6, step: 1, levels: 6 },
  { name: 'Filtro', type: 'boolean', constant: false, center: true, levels: 1, fixed: true, categorical: true },
];
const sens = [{ sensitivity: 0.9 }, { sensitivity: 0.5 }, { sensitivity: 0.1 }, { sensitivity: 0 }];

console.log('\nPresupuesto pequeño (un paso original a cada lado)');
{
  const r = finerRefinement(base, levels, sens, 5 * 5 * 3);
  check('entero de paso 2 → paso 1, de 12 a 16', r[0].step === 1 && r[0].start === 12 && r[0].stop === 16 && r[0].levels === 5 && r[0].finer, JSON.stringify(r[0]));
  check('decimal de paso 0,5 → 0,25, de 1,5 a 2,5', r[1].step === 0.25 && r[1].start === 1.5 && r[1].stop === 2.5 && r[1].levels === 5, JSON.stringify(r[1]));
  check('entero de paso 1 no baja de 1 (no es más fino)', r[2].step === 1 && r[2].start === 3 && r[2].stop === 5 && !r[2].finer, JSON.stringify(r[2]));
  check('los de sí/no se quedan como estaban', r[3] === base[3]);
  check('cabe en el presupuesto', r.reduce((a, x) => a * (x.levels || 1), 1) <= 75);
}

console.log('\nSin presupuesto: se fija el menos influyente');
{
  const r = finerRefinement(base, levels, sens, 25);
  check('el menos influyente (TP) queda fijo en su valor', r[2].fixed && r[2].levels === 1 && r[2].start === 4, JSON.stringify(r[2]));
  check('y el total cabe', r.reduce((a, x) => a * (x.levels || 1), 1) <= 25);
}

console.log('\nCon presupuesto de sobra: se amplía el más influyente, sin salir de lo probado');
{
  const r = finerRefinement(base, levels, sens, 100000);
  check('MA cubre de 10 a 18 de 1 en 1', r[0].start === 10 && r[0].stop === 18 && r[0].levels === 9, JSON.stringify(r[0]));
  check('ningún tramo sale de lo probado', r.every((x, j) => x.categorical || (x.start >= levels[j][0] && x.stop <= levels[j][levels[j].length - 1])));
}

console.log('\nEl ejemplo (rejilla completa) usa el paso a la mitad');
{
  const d = buildDemoTables();
  const a = runAnalysis({ isTable: d.isTable, oosTable: d.oosTable });
  const ref = a.plateaus[0].refinement;
  check('es una rejilla completa', a.meta.sampling === 'grid');
  check('algún parámetro con paso más fino', ref.some((x) => x.finer));
  check('dentro de las 20.000 combinaciones', ref.reduce((acc, x) => acc * (x.constant ? 1 : x.levels), 1) <= 20000);
}

console.log(`\n${'='.repeat(70)}\nRESULTADO: ${checks - failures}/${checks} comprobaciones correctas\n${'='.repeat(70)}`);
if (failures) process.exit(1);
