// Pruebas de core/surface.js: la rejilla 2D real para la superficie isométrica.

import { topInfluentialPair, buildAxisPairGrid } from '../core/surface.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}
function section(t) { console.log(`\n=== ${t} ===`); }

section('topInfluentialPair');
{
  const sensitivity = [
    { index: 0, name: 'A', sensitivity: 0.1, effective: 0.1, constant: false },
    { index: 1, name: 'B', sensitivity: 0.8, effective: 0.9, constant: false },
    { index: 2, name: 'C', sensitivity: 0.5, effective: 0.5, constant: false },
    { index: 3, name: 'D', sensitivity: 0.99, effective: 0.99, constant: true },
  ];
  const pair = topInfluentialPair(sensitivity);
  check('elige B (mayor effective) y C (segundo)', pair[0] === 1 && pair[1] === 2, JSON.stringify(pair));
  check('ignora la constante aunque tenga sensibilidad alta', !pair.includes(3));

  check('null con menos de dos no-constantes', topInfluentialPair([
    { index: 0, sensitivity: 1, effective: 1, constant: false },
    { index: 1, sensitivity: 1, effective: 1, constant: true },
  ]) === null);

  check('null sin sensibilidad', topInfluentialPair([]) === null);
}

/**
 * Construye un `analysis` sintético: rejilla cartesiana en 3 dimensiones.
 * `records[i].params` lleva el VALOR real de cada parámetro (como el analysis
 * de verdad, y como llega tras el Worker sin `coords`) — no el índice de
 * nivel — porque buildAxisPairGrid reconstruye la posición vía
 * `levels[dim].indexOf(valor)`.
 */
function cartesianAnalysis({ levelsPerDim = [3, 3, 2], gaps = [] } = {}) {
  const dims = levelsPerDim.length;
  const levels = levelsPerDim.map((n) => Array.from({ length: n }, (_, i) => i * 10));
  const records = [];
  const gapSet = new Set(gaps.map((g) => g.join(',')));

  function recurse(idxPrefix) {
    if (idxPrefix.length === dims) {
      if (gapSet.has(idxPrefix.join(','))) return;
      const q = 0.5 + 0.1 * idxPrefix[0] - 0.05 * idxPrefix[1];
      const params = idxPrefix.map((levelIdx, d) => levels[d][levelIdx]);
      records.push({ qualityIs: q, qualityOos: q - 0.05, params });
      return;
    }
    for (let v = 0; v < levelsPerDim[idxPrefix.length]; v++) recurse([...idxPrefix, v]);
  }
  recurse([]);

  return {
    levels,
    records,
    meta: { paramNames: ['InpA', 'InpB', 'InpC'] },
  };
}

section('buildAxisPairGrid — rejilla completa, sin huecos');
{
  const a = cartesianAnalysis({ levelsPerDim: [3, 3, 2] });
  // El representante: InpA=InpB=InpC=0 (nivel 0 en los tres).
  const repIndex = a.records.findIndex((r) => r.params[0] === 0 && r.params[1] === 0 && r.params[2] === 0);
  const plateau = { representative: repIndex, indices: [repIndex] };

  const g = buildAxisPairGrid(a, plateau, 0, 1);
  check('nombres correctos', g.names[0] === 'InpA' && g.names[1] === 'InpB', g.names.join(','));
  check('3x3 celdas', g.levelsA.length === 3 && g.levelsB.length === 3);
  check('cobertura 100% (rejilla completa)', g.coverage === 1, String(g.coverage));
  check('ninguna celda vacia', g.grid.every((row) => row.every((c) => c !== null)));
  check('repCell en (0,0)', g.repCell[0] === 0 && g.repCell[1] === 0, JSON.stringify(g.repCell));
  check('celda del representante esta en la meseta', g.grid[0][0].inPlateau === true);
  check('otra celda no esta en la meseta', g.grid[1][1].inPlateau === false);
  // calidad creciente en dimA (a mayor nivel de InpA, mayor q, por construccion)
  check('calidad sube con dimA', g.grid[0][2].quality > g.grid[0][0].quality, `${g.grid[0][2].quality} vs ${g.grid[0][0].quality}`);
}

section('buildAxisPairGrid — rejilla con huecos (GA)');
{
  // Faltan combinaciones concretas de (InpA, InpB) con InpC=0 (el resto sigue completo).
  const a = cartesianAnalysis({
    levelsPerDim: [3, 3, 2],
    gaps: [[1, 1, 0], [2, 2, 0]],
  });
  const repIndex = a.records.findIndex((r) => r.params[0] === 0 && r.params[1] === 0 && r.params[2] === 0);
  const plateau = { representative: repIndex, indices: [repIndex] };
  const g = buildAxisPairGrid(a, plateau, 0, 1);

  check('cobertura menor que 1 con huecos', g.coverage < 1, String(g.coverage));
  check('cobertura = 7/9', Math.abs(g.coverage - 7 / 9) < 1e-9, String(g.coverage));
  check('la celda que falta es null, no inventada', g.grid[1][1] === null);
  check('la otra celda que falta tambien es null', g.grid[2][2] === null);
  check('una celda presente sigue con datos', g.grid[0][0] !== null);
}

section('buildAxisPairGrid — se queda con la mejor si hay repetidos');
{
  const a = cartesianAnalysis({ levelsPerDim: [2, 2, 1] });
  // Duplica una pasada en la misma celda (InpA=InpB=InpC=0) con peor calidad.
  a.records.push({ qualityIs: -1, qualityOos: -1, params: [0, 0, 0] });
  const repIndex = 0;
  const plateau = { representative: repIndex, indices: [repIndex] };
  const g = buildAxisPairGrid(a, plateau, 0, 1);
  check('se queda con la calidad mas alta, no la ultima vista', g.grid[0][0].quality > -1, String(g.grid[0][0].quality));
}

console.log(`\nRESULTADO: ${checks - failures}/${checks}`);
if (failures) process.exit(1);
