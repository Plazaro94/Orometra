// Pruebas del motor. Se ejecutan con `node tests/run.js`.
//
// Dos bloques:
//  1. Datos sinteticos con verdad conocida (meseta plantada, EA perdedor, ruido puro).
//  2. Archivos reales de MT5 si estan presentes en la carpeta indicada.

import fs from 'node:fs';
import path from 'node:path';
import { parseTable, toNumber } from '../js/parse.js';
import { runAnalysis } from '../js/analysis.js';
import { buildDemoTables } from '../js/demo.js';
import { DEFAULT_POLICY } from '../js/metrics.js';
import { buildSetFile } from '../js/export.js';
import { expectedMaximum, expectedMaxZ, sharpeStandardError, normInv, quantile, spearman } from '../js/stats.js';

let failures = 0;
let checks = 0;

function check(name, condition, detail = '') {
  checks++;
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`);
  }
}

function section(title) {
  console.log(`\n${'='.repeat(70)}\n${title}\n${'='.repeat(70)}`);
}

// ---------------------------------------------------------------- utilidades
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

/** Construye dos tablas al estilo MT5 a partir de puntos sinteticos. */
function synthTables(points, paramNames) {
  const isHeaders = ['Pass', 'Result', 'Profit', 'Expected Payoff', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Custom', 'Equity DD %', 'Trades', ...paramNames];
  const oosHeaders = ['Pass', 'Forward Result', 'Back Result', 'Profit', 'Expected Payoff', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Custom', 'Equity DD %', 'Trades', ...paramNames];
  const isRows = [];
  const oosRows = [];
  points.forEach((p, i) => {
    isRows.push([i, p.isResult, p.is.profit, p.is.profit / 800, p.is.profitFactor, p.is.recoveryFactor, p.is.sharpe, 0, p.is.drawdown, p.is.trades, ...p.x]);
    oosRows.push([i, p.oosResult, p.isResult, p.oos.profit, p.oos.profit / 800, p.oos.profitFactor, p.oos.recoveryFactor, p.oos.sharpe, 0, p.oos.drawdown, p.oos.trades, ...p.x]);
  });
  return [
    { name: 'IS', sheet: 'Tester Optimizator Results', format: 'sintetico', headers: isHeaders, rows: isRows },
    { name: 'OOS', sheet: 'Tester Optimizator Results', format: 'sintetico', headers: oosHeaders, rows: oosRows },
  ];
}

/*
 * Politica fija para los casos sinteticos.
 *
 * Los datos sinteticos estan calibrados para ejercitar el MOTOR (vecindad, mesetas,
 * acantilados, inversiones), no para validar los minimos por defecto. Si heredasen
 * DEFAULT_POLICY, cada vez que el usuario cambiase sus exigencias se caerian tests que
 * no tienen nada que ver con eso. Los valores por defecto se comprueban aparte.
 */
const ENGINE_POLICY = {
  ...DEFAULT_POLICY,
  gates: { ...DEFAULT_POLICY.gates, minProfitFactor: 1.05, maxDrawdownPct: 35, minTrades: 100 },
};

/** Traduce una "bondad" 0..1 a un juego de metricas MT5 coherente. */
function metricsFromGoodness(g, noise, tradesBase) {
  const good = Math.max(0, g);
  return {
    profit: 200000 * good - 20000 + noise * 8000,
    profitFactor: 1.0 + 0.32 * good + noise * 0.02,
    recoveryFactor: 4.2 * good + noise * 0.2,
    sharpe: 3.2 * good + noise * 0.2,
    drawdown: 6 + 55 * (1 - good) + noise * 2,
    trades: Math.round(tradesBase * (0.7 + 0.6 * good)),
  };
}

// ---------------------------------------------------------------- 1. primitivas
section('1. Primitivas estadisticas');
check('normInv(0.975) ~ 1.95996', Math.abs(normInv(0.975) - 1.959964) < 1e-4, String(normInv(0.975)));
check('normInv(0.5) ~ 0', Math.abs(normInv(0.5)) < 1e-9);
check('expectedMaximum crece con N', expectedMaximum(0, 1, 10000) > expectedMaximum(0, 1, 100));
check('expectedMaxZ(1000) entre 3 y 3,5', expectedMaxZ(1000) > 3 && expectedMaxZ(1000) < 3.5, String(expectedMaxZ(1000)));
// SE de Lo (2002): con SR=0 se reduce a 1/sqrt(n-1).
check('sharpeStandardError(0, 101) = 0,1', Math.abs(sharpeStandardError(0, 101) - 0.1) < 1e-9, String(sharpeStandardError(0, 101)));
check('el SE del Sharpe baja al crecer las operaciones', sharpeStandardError(2, 2000) < sharpeStandardError(2, 200));
check('quantile mediana de 1..9 = 5', quantile([1, 2, 3, 4, 5, 6, 7, 8, 9], 0.5) === 5);
check('spearman monotono = 1', Math.abs(spearman([1, 2, 3, 4, 5], [10, 20, 30, 40, 50]) - 1) < 1e-9);
check('spearman inverso = -1', Math.abs(spearman([1, 2, 3, 4, 5], [50, 40, 30, 20, 10]) + 1) < 1e-9);

section('2. Conversion numerica regional');
const numCases = [['1234.56', 1234.56], ['1 234.56', 1234.56], ['1,234.56', 1234.56], ['1.234,56', 1234.56], ['12 345,67', 12345.67], ['-0.5', -0.5], ['6.9920', 6.992], ['98.3397', 98.3397], ['12%', 12]];
for (const [input, want] of numCases) {
  const got = toNumber(input);
  check(`toNumber(${JSON.stringify(input)}) = ${want}`, Math.abs(got - want) < 1e-9, String(got));
}
check('toNumber("") es NaN', Number.isNaN(toNumber('')));

// ---------------------------------------------------------------- 3. meseta plantada
section('3. Rejilla completa con meseta plantada en un centro conocido');
{
  const r = rng(11);
  const L = 7;
  const center = [4, 4, 3, 3, 4];
  const points = [];
  const spikes = new Set();
  while (spikes.size < 15) spikes.add(Math.floor(r() * L ** 5));
  let idx = 0;
  for (let a = 0; a < L; a++) for (let b = 0; b < L; b++) for (let c = 0; c < L; c++) for (let d = 0; d < L; d++) for (let e = 0; e < L; e++) {
    const z = [a, b, c, d, e];
    // Anchura de la meseta plantada. En 5 dimensiones la mayor parte de los puntos de
    // una bola estan cerca de su superficie, asi que con una campana estrecha la region
    // viable no llega a tener INTERIOR: casi ningun punto tiene todas sus vecinas dentro,
    // y por definicion no puede haber meseta. Se planta ancha a proposito, que es lo que
    // debe hacer un caso de verdad conocida: ser inequivoco.
    const dist = z.reduce((s, v, j) => s + ((v - center[j]) / 3.0) ** 2, 0);
    const g = Math.exp(-dist / 2);
    const isSpike = spikes.has(idx);
    const nz = gauss(r) * 0.1;
    const isM = metricsFromGoodness(g + nz * 0.2, nz, 1600);
    const oosM = metricsFromGoodness(isSpike ? 0.95 : g * 0.85 + nz * 0.2, nz, 800);
    points.push({
      x: z.map((v) => 10 + v * 5), is: isM, oos: oosM,
      isResult: 40 + 45 * g + nz, oosResult: isSpike ? 88 : 35 + 45 * g + nz,
      spike: isSpike,
    });
    idx++;
  }
  const [isT, oosT] = synthTables(points, ['p1', 'p2', 'p3', 'p4', 'p5']);
  const t0 = Date.now();
  const a = runAnalysis({ isTable: isT, oosTable: oosT, policy: ENGINE_POLICY });
  console.log(`  (${a.meta.total} configs en ${Date.now() - t0} ms, muestreo=${a.meta.sampling}, radio=${a.meta.radius}, soporte mediano=${a.meta.medianSupport})`);

  check('detecta 5 parametros', a.meta.paramNames.length === 5, a.meta.paramNames.join(','));
  check('detecta rejilla completa', a.meta.sampling === 'grid', `coverage=${a.meta.coverage}`);
  check('encuentra al menos una meseta', a.plateaus.length >= 1, String(a.plateaus.length));
  const rep = a.plateaus[0].record.params;
  const wanted = center.map((v) => 10 + v * 5);
  const offBy = rep.reduce((s, v, j) => s + Math.abs(v - wanted[j]) / 5, 0);
  check('el representante cae en el centro real (<=2 pasos en total)', offBy <= 2, `rep=[${rep}] esperado=[${wanted}] pasos=${offBy}`);
  const spikeIds = new Set(points.map((p, i) => (p.spike ? String(i) : null)).filter(Boolean));
  const spikesInPlateau = a.plateaus.flatMap((p) => p.indices).filter((i) => spikeIds.has(a.records[i].id)).length;
  check('ningun pico de ruido entra en una meseta', spikesInPlateau === 0, String(spikesInPlateau));
  check('el maximo OOS global no se recomienda como representante',
    !a.plateaus.some((p) => spikeIds.has(p.record.id)));
}

// ---------------------------------------------------------------- 4. EA perdedor
section('4. EA perdedor: debe decir NO, no elegir "el mejor de los malos"');
{
  const r = rng(22);
  const points = [];
  for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) for (let c = 0; c < 6; c++) for (let d = 0; d < 6; d++) {
    const dist = [a, b, c, d].reduce((s, v) => s + ((v - 3) / 2) ** 2, 0);
    const g = Math.exp(-dist / 2);
    const nz = gauss(r) * 0.08;
    const mk = () => ({
      profit: -60000 + 20000 * g + nz * 3000,
      profitFactor: 0.82 + 0.1 * g + nz * 0.01,
      recoveryFactor: -0.9 + 0.3 * g,
      sharpe: -1.8 + 0.6 * g,
      drawdown: 70 - 15 * g,
      trades: 900,
    });
    points.push({ x: [a + 1, b + 1, c + 1, d + 1], is: mk(), oos: mk(), isResult: 10 + 8 * g, oosResult: 8 + 7 * g });
  }
  const [isT, oosT] = synthTables(points, ['a', 'b', 'c', 'd']);
  const a = runAnalysis({ isTable: isT, oosTable: oosT, policy: ENGINE_POLICY });
  check('ninguna configuracion pasa las puertas', a.meta.gatePassCount === 0, String(a.meta.gatePassCount));
  check('no inventa mesetas', a.plateaus.length === 0, String(a.plateaus.length));
  check('la evidencia NO se califica de solida', a.verdict.level !== 'strong', a.verdict.level);
  console.log(`  veredicto: "${a.verdict.headline}"`);
}

// ---------------------------------------------------------------- 5. ruido puro
section('5. Ruido puro: IS y OOS independientes');
{
  const r = rng(33);
  const points = [];
  for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) for (let c = 0; c < 6; c++) for (let d = 0; d < 6; d++) {
    const g1 = 0.45 + gauss(r) * 0.12;
    const g2 = 0.45 + gauss(r) * 0.12;
    points.push({
      x: [a + 1, b + 1, c + 1, d + 1],
      is: metricsFromGoodness(g1, gauss(r) * 0.1, 900),
      oos: metricsFromGoodness(g2, gauss(r) * 0.1, 450),
      isResult: 50 * g1, oosResult: 50 * g2,
    });
  }
  const [isT, oosT] = synthTables(points, ['a', 'b', 'c', 'd']);
  const a = runAnalysis({ isTable: isT, oosTable: oosT, policy: ENGINE_POLICY });
  console.log(`  rho=${a.stats.spearmanCriterion.toFixed(3)} fragilidad=${(100 * a.stats.fragility).toFixed(0)}% mesetas=${a.plateaus.length} veredicto=${a.verdict.level}`);
  check('detecta correlacion IS->OOS nula', Math.abs(a.stats.spearmanCriterion) < 0.15, String(a.stats.spearmanCriterion));
  check('la evidencia NO se califica de solida', a.verdict.level !== 'strong', a.verdict.level);
  check('avisa de correlacion nula o de sobreajuste',
    a.verdict.findings.some((f) => f.severity === 'critical'),
    a.verdict.findings.map((f) => f.severity + ':' + f.title).join(' | '));
}

// ---------------------------------------------------------------- 6. parametro constante
section('6. Parametro constante: no debe marcarse como frontera');
{
  const r = rng(44);
  const points = [];
  for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) for (let c = 0; c < 6; c++) {
    const dist = ((a - 3) ** 2 + (b - 3) ** 2 + (c - 3) ** 2) / 4;
    const g = Math.exp(-dist / 2);
    const nz = gauss(r) * 0.06;
    points.push({
      x: [a + 1, b + 1, c + 1, 50],
      is: metricsFromGoodness(g, nz, 1200), oos: metricsFromGoodness(g * 0.9, nz, 600),
      isResult: 40 + 40 * g, oosResult: 38 + 38 * g,
    });
  }
  const [isT, oosT] = synthTables(points, ['a', 'b', 'c', 'fixed']);
  const a = runAnalysis({ isTable: isT, oosTable: oosT, policy: ENGINE_POLICY });
  const flagged = a.plateaus.length ? a.plateaus[0].boundary.map((x) => x.name) : [];
  check('el parametro constante no aparece como frontera', !flagged.includes('fixed'), flagged.join(','));
  check('se contabiliza como dimension no optimizada', a.meta.optimisedDims === 3, String(a.meta.optimisedDims));
}

// ------------------------------------------------- 7. parametro plano frente a activo
section('7. Solo se descarta de la distancia el parametro demostrablemente plano');
{
  const r = rng(55);
  const points = [];
  // 'inerte' recorre 5 niveles pero no afecta al resultado; 'a' y 'b' si.
  for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) for (let inert = 0; inert < 5; inert++) {
    // Región buena más ancha: tras colapsar ejes planos quedan 36 celdas; hace falta
    // masa interior real, no soporte fabricado por copias del eje inerte.
    const dist = ((a - 3) / 2.2) ** 2 + ((b - 3) / 2.2) ** 2;
    const g = Math.exp(-dist / 2);
    const nz = gauss(r) * 0.03;
    points.push({
      x: [a + 1, b + 1, inert * 10],
      is: metricsFromGoodness(g, nz, 1400), oos: metricsFromGoodness(g * 0.92, nz, 700),
      isResult: 40 + 40 * g, oosResult: 38 + 38 * g,
    });
  }
  const [isT, oosT] = synthTables(points, ['a', 'b', 'inerte']);
  const an = runAnalysis({ isTable: isT, oosTable: oosT, policy: ENGINE_POLICY });
  const sens = Object.fromEntries(an.sensitivity.map((s) => [s.name, s.sensitivity]));
  console.log(`  sensibilidades: a=${sens.a.toFixed(2)} b=${sens.b.toFixed(2)} inerte=${sens.inerte.toFixed(2)}`);
  check('el parametro inerte se excluye de la distancia', !an.meta.activeNames.includes('inerte'), an.meta.activeNames.join(','));
  check('los parametros que si influyen se conservan',
    an.meta.activeNames.includes('a') && an.meta.activeNames.includes('b'), an.meta.activeNames.join(','));
  check('se encuentra la meseta central', an.plateaus.length >= 1, String(an.plateaus.length));
}

// ------------------ 5b. ventaja amplia sin transferencia de ranking (caso delicado)
section('5b. Rentable en todo el espacio pero con el ranking invertido');
{
  // Casi todo gana dinero en ambos periodos, pero un parametro invierte su optimo.
  // NO debe salir "sistema sin ventaja real": la ventaja existe, lo que no vale es el orden.
  const r = rng(77);
  const points = [];
  for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) for (let inv = 0; inv < 6; inv++) {
    const base = 0.62 + 0.10 * Math.exp(-(((a - 3) / 2.2) ** 2 + ((b - 3) / 2.2) ** 2) / 2);
    const nz = gauss(r) * 0.03;
    // 'InpInvertido' ayuda en IS y estorba en OOS, en la misma medida.
    const gIs = base + 0.10 * (inv / 5) + nz;
    const gOos = base + 0.10 * (1 - inv / 5) + gauss(r) * 0.03;
    points.push({
      x: [a + 1, b + 1, inv * 2],
      is: metricsFromGoodness(gIs, nz, 1500), oos: metricsFromGoodness(gOos, gauss(r) * 0.03, 750),
      isResult: 40 + 40 * gIs, oosResult: 40 + 40 * gOos,
    });
  }
  const [isT, oosT] = synthTables(points, ['a', 'b', 'InpInvertido']);
  const an = runAnalysis({ isTable: isT, oosTable: oosT, policy: ENGINE_POLICY });
  const titles = an.verdict.findings.map((f) => `${f.severity}:${f.title}`);
  console.log(`  pasan puertas ${(100 * an.meta.gatePassPct).toFixed(0)} % | rho ${an.stats.spearmanCriterion.toFixed(2)} | veredicto ${an.verdict.level}`);
  console.log(`  inversiones detectadas: ${an.inversions.map((x) => `${x.name} (IS ${x.bestIs} -> OOS ${x.bestOos})`).join(', ') || 'ninguna'}`);
  check('casi todo el espacio es viable', an.meta.gatePassPct > 0.6, String(an.meta.gatePassPct));
  check('detecta el parametro invertido',
    an.inversions.some((x) => x.name === 'InpInvertido'), an.inversions.map((x) => x.name).join(','));
  check('NO concluye "sistema sin ventaja real"',
    !titles.some((t) => t.startsWith('block:') && /nula/i.test(t)), titles.join(' | '));
  check('avisa de que el ranking no transfiere',
    titles.some((t) => /ranking no transfiere|ranking esta invertido/i.test(t)), titles.join(' | '));
  check('reconoce que la estrategia aguanta en casi todo el espacio',
    titles.some((t) => /aguanta en casi todo/i.test(t)), titles.join(' | '));
  // El representante no debe quedarse con el valor que el in-sample prefiere y el
  // forward castiga; y si lo hace, hay que avisarlo explicitamente.
  const inv = an.inversions.find((x) => x.name === 'InpInvertido');
  const jInv = an.meta.paramNames.indexOf('InpInvertido');
  const repVal = an.plateaus.length ? an.plateaus[0].record.params[jInv] : null;
  check('o el representante evita el valor castigado, o se avisa de ello',
    repVal !== inv.bestIs || titles.some((t) => /se apoya en un valor que el forward castiga/i.test(t)),
    `valor del representante=${repVal}, gana en IS=${inv.bestIs}`);
}

// ------------------------------------------- 7b. parametros booleanos y categoricos
section('7b. Inputs bool y enum: no deben tirar las filas');
{
  const r = rng(66);
  const points = [];
  const MODES = ['Conservador', 'Neutro', 'Agresivo'];
  for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) for (const flag of [true, false]) for (let m = 0; m < 3; m++) {
    const dist = ((a - 4) / 2.8) ** 2 + ((b - 4) / 2.8) ** 2;
    // El booleano y la enumeracion SI influyen: son las decisiones discretas correctas.
    const g = Math.exp(-dist / 2) * (flag ? 1 : 0.45) * (m === 1 ? 1 : 0.7);
    const nz = gauss(r) * 0.05;
    points.push({
      x: [a + 1, b + 1, flag ? 'true' : 'false', MODES[m]],
      is: metricsFromGoodness(g, nz, 1400), oos: metricsFromGoodness(g * 0.9, nz, 700),
      isResult: 40 + 40 * g, oosResult: 38 + 38 * g,
    });
  }
  const [isT, oosT] = synthTables(points, ['a', 'b', 'InpUseFilter', 'InpMode']);
  const an = runAnalysis({ isTable: isT, oosTable: oosT, policy: ENGINE_POLICY });
  console.log(`  ${an.meta.total} configs | tipos: ${an.meta.paramTypes.join(', ')} | mesetas ${an.plateaus.length}`);
  console.log(`  distancia: [${an.meta.activeNames}] | bloqueo: [${an.meta.blockNames}]`);
  check('no se pierde ninguna fila por el bool ni por la enum', an.meta.total === points.length, `${an.meta.total} de ${points.length}`);
  check('clasifica los tipos de parametro', an.meta.paramTypes.join(',') === 'number,number,bool,text', an.meta.paramTypes.join(','));
  // Un booleano influyente NO entra en la distancia: particiona el espacio. Si contase
  // como un paso mas, cada configuracion tendria siempre un vecino pesimo (su opuesto)
  // y jamas se encontraria una meseta.
  check('el bool y la enum particionan en vez de contar como un paso',
    an.meta.blockNames.includes('InpUseFilter') && an.meta.blockNames.includes('InpMode'),
    `distancia=[${an.meta.activeNames}] bloqueo=[${an.meta.blockNames}]`);
  check('la distancia usa solo los numericos', an.meta.activeNames.join(',') === 'a,b', an.meta.activeNames.join(','));
  check('encuentra meseta', an.plateaus.length >= 1, String(an.plateaus.length));
  const rep = an.plateaus[0].record;
  const idxFlag = an.meta.paramNames.indexOf('InpUseFilter');
  check('el representante elige el valor bueno del booleano', rep.params[idxFlag] === true, String(rep.params[idxFlag]));
  check('el representante elige el modo bueno de la enum',
    rep.params[an.meta.paramNames.indexOf('InpMode')] === 'Neutro', String(rep.params[an.meta.paramNames.indexOf('InpMode')]));
  check('bool y enum no se marcan como frontera de rango',
    !an.plateaus[0].boundary.some((x) => x.name === 'InpUseFilter' || x.name === 'InpMode'),
    an.plateaus[0].boundary.map((x) => x.name).join(','));
  const refFlag = an.plateaus[0].refinement.find((x) => x.name === 'InpUseFilter');
  check('el refinamiento fija el booleano en vez de barrerlo', refFlag.categorical === true && refFlag.fixed === true);
  const setText = buildSetFile(an, an.plateaus[0]);
  check('el .set escribe el booleano como true/false', /InpUseFilter=true/.test(setText), setText.split('\r\n').filter((l) => l.includes('InpUseFilter')).join(''));
  check('el .set escribe la enum como texto', /InpMode=Neutro/.test(setText));
}

// --------------------------------------------- 8. ejemplo sintetico de la aplicacion
section('8. Ejemplo sintetico: debe encontrar el centro plantado y aprobar');
{
  const demo = buildDemoTables();
  const an = runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable, policy: ENGINE_POLICY });
  console.log(`  ${an.meta.total} configs | muestreo ${an.meta.sampling} | mesetas ${an.plateaus.length} | veredicto ${an.verdict.level}`);
  check('reconoce rejilla completa', an.meta.sampling === 'grid', an.meta.sampling);
  check('encuentra exactamente una meseta', an.plateaus.length === 1, String(an.plateaus.length));
  check('la evidencia es solida en datos limpios', an.verdict.level === 'strong', an.verdict.level);
  check('la fragilidad de seleccion es baja en datos limpios', an.stats.fragility < 0.1, String(an.stats.fragility));
  const rep = an.plateaus[0].record;
  const hits = an.meta.paramNames.filter((n, j) => demo.truth.center[n] === rep.params[j]).length;
  console.log(`  representante: ${an.meta.paramNames.map((n, j) => n + '=' + rep.params[j]).join(' ')}`);
  check('el representante acierta al menos 4 de los 6 parametros plantados', hits >= 4, `${hits}/6`);
  check('descarta picos aislados pese a su criterio alto', an.peaks.length > 0, String(an.peaks.length));
}

// ---------------------------------------------------------------- 9. archivos reales
section('9. Archivos reales de MT5');
const realDir = process.env.MT5_SAMPLES || path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Downloads');
const isPath = path.join(realDir, 'IS(1).xls');
const oosPath = path.join(realDir, 'OOS(1).xls');
if (fs.existsSync(isPath) && fs.existsSync(oosPath)) {
  const rd = (p) => {
    const buf = fs.readFileSync(p);
    return parseTable(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), path.basename(p));
  };
  const isT = rd(isPath);
  const oosT = rd(oosPath);
  check('el IS se lee como XML Spreadsheet', isT.format === 'xml-spreadsheet', isT.format);
  check('cabeceras del IS detectadas', isT.headers.length === 20, String(isT.headers.length));
  check('filas del IS', isT.rows.length === 4113, String(isT.rows.length));

  const t0 = Date.now();
  const a = runAnalysis({ isTable: isT, oosTable: oosT, policy: ENGINE_POLICY });
  const ms = Date.now() - t0;
  console.log(`\n  --- analisis en ${ms} ms ---`);
  console.log(`  configuraciones : ${a.meta.total}`);
  console.log(`  parametros      : ${a.meta.paramNames.length} (${a.meta.optimisedDims} optimizados)`);
  console.log(`  muestreo        : ${a.meta.sampling} | cobertura ${(100 * a.meta.coverage).toFixed(5)}%`);
  console.log(`  dims activas    : ${a.meta.activeNames.join(', ')}`);
  console.log(`  radio / soporte : ${a.meta.radius} / mediana ${a.meta.medianSupport}`);
  console.log(`  pasan puertas   : ${a.meta.gatePassCount} (${(100 * a.meta.gatePassPct).toFixed(1)}%)`);
  console.log(`  ratio periodo   : ${a.meta.periodRatio?.toFixed(3)}`);
  console.log(`  mesetas         : ${a.plateaus.length}`);
  console.log(`  picos aislados  : ${a.peaks.length}`);
  console.log(`  rho IS->OOS     : ${a.stats.spearmanCriterion.toFixed(3)}`);
  console.log(`  Fragilidad sel. : ${(100 * a.stats.fragility).toFixed(0)}%  (is->oos ${(100 * a.stats.fragilityFolds.isToOos.value).toFixed(0)}%, oos->is ${(100 * a.stats.fragilityFolds.oosToIs.value).toFixed(0)}%)`);
  if (a.stats.sharpeTest) {
    console.log(`  Sharpe max obs  : ${a.stats.sharpeTest.observedMax.toFixed(3)}`);
    console.log(`  Sharpe azar (N) : ${a.stats.sharpeTest.chanceMax.toFixed(3)}  (N efectivo ${a.stats.sharpeTest.effectiveTrials} -> ${a.stats.sharpeTest.chanceMaxEffective.toFixed(3)})`);
  }
  console.log(`  VEREDICTO       : ${a.verdict.level.toUpperCase()} - ${a.verdict.headline}`);
  for (const f of a.verdict.findings) console.log(`    [${f.severity}] ${f.title}`);
  if (a.plateaus.length) {
    const p = a.plateaus[0];
    console.log(`\n  Meseta 1: ${p.size} configs | representante Pass ${p.record.id} | robustez ${p.robust.toFixed(1)}`);
    console.log(`    calidad IS ${p.record.qualityIs.toFixed(3)} / OOS ${p.record.qualityOos.toFixed(3)} | suelo zona ${p.worstScore.toFixed(3)}`);
    console.log(`    OOS: PF ${p.record.oos.profitFactor?.toFixed(3)} DD ${p.record.oos.drawdown?.toFixed(1)}% ops ${p.record.oos.trades}`);
    console.log(`    params: ${a.meta.paramNames.map((n, j) => n + '=' + p.record.params[j]).join('  ')}`);
    console.log(`    frontera: ${p.boundary.length ? p.boundary.map((b) => b.name).join(', ') : 'ninguna'}`);
  }
  if (a.peaks.length) {
    console.log('\n  Picos descartados (los que mas tentarian):');
    for (const pk of a.peaks.slice(0, 5)) {
      console.log(`    Pass ${pk.record.id} calidad ${pk.score.toFixed(3)} OOS-PF ${pk.record.oos.profitFactor?.toFixed(3)} | ${pk.reasons.join('; ')}`);
    }
  }

  console.log('');
  check('cruza las 4113 pasadas', a.meta.total === 4113, String(a.meta.total));
  check('identifica los 10 parametros del EA', a.meta.paramNames.length === 10, a.meta.paramNames.join(','));
  check('ninguna metrica se cuela como parametro',
    !a.meta.paramNames.some((n) => /result|profit|trades|dd|sharpe|custom|payoff|recovery/i.test(n)),
    a.meta.paramNames.join(','));
  check('la procedencia de ambos archivos coincide', a.integrity.provenance.checked && a.integrity.provenance.mismatches === 0);
  check('detecta muestreo disperso (algoritmo genetico)', a.meta.sampling === 'sparse', a.meta.sampling);
  // En este EA ningun parametro es plano (sensibilidad 0,50-1,26), asi que lo correcto
  // es NO descartar ninguno: excluir un parametro que influye fabrica vecinos falsos.
  check('conserva los 10 parametros porque ninguno es plano', a.meta.activeDims.length === 10, String(a.meta.activeDims.length));
  check('el soporte mediano supera el del motor original (era 1)', a.meta.medianSupport >= 4, String(a.meta.medianSupport));
  check('estima el OOS en torno a la mitad del IS', a.meta.periodRatio > 0.3 && a.meta.periodRatio < 0.8, String(a.meta.periodRatio));
  check('detecta fragilidad alta de seleccion en este dataset', a.stats.fragility > 0.3, String(a.stats.fragility));
  check('la evidencia no se califica de solida', a.verdict.level !== 'strong', a.verdict.level);
  const topOos = a.records
    .map((r, i) => ({ r, i }))
    .filter((x) => Number.isFinite(x.r.criterionOos))
    .sort((x, y) => y.r.criterionOos - x.r.criterionOos)
    .slice(0, 5);
  // Lo que debe garantizarse NO es que las cimas del criterio queden fuera de toda
  // meseta (algunas tienen soporte real y merecen estar dentro), sino que ninguna se
  // convierta en la configuracion recomendada: eso seria seleccionar por la cima.
  const repIds = new Set(a.plateaus.map((p) => p.record.id));
  check('ninguna cima del criterio acaba siendo la configuracion recomendada',
    !topOos.some((x) => repIds.has(x.r.id)),
    'cimas=' + topOos.map((x) => x.r.id).join(',') + ' representantes=' + [...repIds].join(','));
  const peakIds = new Set(a.peaks.map((p) => p.record.id));
  const unsupportedTop = topOos.filter((x) => a.stability[x.i].support < 4);
  check('las cimas sin soporte se listan como picos descartados',
    unsupportedTop.length > 0 && unsupportedTop.every((x) => peakIds.has(x.r.id)),
    'sin soporte=' + unsupportedTop.map((x) => x.r.id).join(',') + ' picos=' + [...peakIds].join(','));
  const combos = a.plateaus[0].refinement.reduce((acc, x) => acc * (x.constant ? 1 : x.levels), 1);
  console.log(`  rango de refinamiento: ${combos.toLocaleString('es-ES')} combinaciones`);
  check('el rango de refinamiento es ejecutable (<= 20.000 combinaciones)', combos <= 20000, String(combos));
  check('el rango de refinamiento reduce de verdad el espacio', combos < a.meta.cartesian / 100, `${combos} vs ${a.meta.cartesian}`);
  check('el refinamiento se centra en la configuracion recomendada',
    a.plateaus[0].refinement.every((x) => x.constant || x.center === a.plateaus[0].record.params[a.meta.paramNames.indexOf(x.name)]));
  check('el aviso de frontera senala pocos parametros, no todos',
    !a.plateaus.length || a.plateaus[0].boundary.length < a.meta.paramNames.length,
    a.plateaus.length ? a.plateaus[0].boundary.map((b) => b.name).join(',') : 'sin mesetas');
  check('el analisis tarda menos de 20 s', ms < 20000, `${ms} ms`);
} else {
  console.log(`  (omitido: no se encuentran ${isPath} y ${oosPath})`);
}

section('10. Minimos por defecto');
{
  const g = DEFAULT_POLICY.gates;
  console.log(`  PF >= ${g.minProfitFactor} | DD <= ${g.maxDrawdownPct} % | operaciones >= ${g.minTrades} | beneficio positivo: ${g.requireProfit}`);
  // Los eligio el usuario. Si alguien los cambia, que sea a proposito y no de refilon.
  check('el factor de beneficio minimo por defecto es 1,20', g.minProfitFactor === 1.2, String(g.minProfitFactor));
  check('el drawdown maximo por defecto es 20 %', g.maxDrawdownPct === 20, String(g.maxDrawdownPct));
  check('se exigen al menos 100 operaciones', g.minTrades === 100, String(g.minTrades));
  check('se exige beneficio positivo', g.requireProfit === true);
}

section(`RESULTADO: ${checks - failures}/${checks} comprobaciones correctas`);
process.exit(failures ? 1 : 0);
