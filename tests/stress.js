// Banco de esfuerzo: el motor debe comportarse bien con CUALQUIER optimizacion de MT5,
// no solo con las que se usaron para desarrollarlo.
//
// MT5 solo produce dos cosas: un backtest unico (todo es in-sample) o un forward que
// parte el periodo en IS y OOS. Pero dentro de eso cabe casi todo: dos parametros o
// veinte, cuarenta configuraciones o doscientas mil, EAs con pocas operaciones, columnas
// de metricas que faltan, superficies planas, rangos degenerados.
//
//   node tests/stress.js
//
// Cada escenario comprueba primero los INVARIANTES que deben cumplirse siempre, y
// despues lo especifico del caso.

import { runAnalysis } from '../core/analysis.js';

let failures = 0;
let checks = 0;
const t0all = Date.now();

function check(name, cond, detail = '') {
  checks++;
  if (!cond) {
    failures++;
    console.log(`    FAIL ${name}${detail ? ' -> ' + detail : ''}`);
  }
  return cond;
}

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

/** Metricas MT5 coherentes a partir de una "bondad" 0..1. */
function metrics(g, nz, tradesBase) {
  const q = Math.max(0, Math.min(1.2, g));
  return {
    profit: Math.round(160000 * q - 16000 + nz * 9000),
    payoff: Number((130 * q - 13 + nz * 8).toFixed(4)),
    pf: Number((1.05 + 0.35 * q + nz * 0.02).toFixed(6)),
    rf: Number((4.5 * q + nz * 0.25).toFixed(6)),
    sharpe: Number((3.2 * q + nz * 0.25).toFixed(6)),
    dd: Number(Math.max(3, 4 + 28 * (1 - q) + nz * 2.5).toFixed(4)),
    trades: Math.max(5, Math.round(tradesBase * (0.65 + 0.7 * q))),
  };
}

/** Construye las tablas. `omit` simula EAs cuyo export no trae alguna columna. */
function tables(points, paramNames, { hasForward = true, omit = [] } = {}) {
  const METRICS = [
    ['Profit', (m) => m.profit], ['Expected Payoff', (m) => m.payoff],
    ['Profit Factor', (m) => m.pf], ['Recovery Factor', (m) => m.rf],
    ['Sharpe Ratio', (m) => m.sharpe], ['Equity DD %', (m) => m.dd], ['Trades', (m) => m.trades],
  ].filter(([n]) => !omit.includes(n));

  const isHeaders = ['Pass', 'Result', ...METRICS.map((m) => m[0]), ...paramNames];
  const isRows = points.map((p, i) => [i, p.isResult, ...METRICS.map((m) => m[1](p.is)), ...p.x]);
  const isTable = { name: 'IS', sheet: 'Tester Optimizator Results', format: 'sintetico', headers: isHeaders, rows: isRows };
  if (!hasForward) return [isTable, null];

  const oosHeaders = ['Pass', 'Forward Result', 'Back Result', ...METRICS.map((m) => m[0]), ...paramNames];
  const oosRows = points.map((p, i) => [i, p.oosResult, p.isResult, ...METRICS.map((m) => m[1](p.oos)), ...p.x]);
  return [isTable, { name: 'OOS', sheet: 'Tester Optimizator Results', format: 'sintetico', headers: oosHeaders, rows: oosRows }];
}

/** Recorre una rejilla completa de niveles y llama a fn con el vector de indices. */
function grid(levels, fn) {
  const total = levels.reduce((a, b) => a * b, 1);
  for (let flat = 0; flat < total; flat++) {
    let rem = flat;
    const z = levels.map((d) => { const v = rem % d; rem = Math.floor(rem / d); return v; });
    fn(z);
  }
}

/**
 * Genera un escenario con meseta plantada.
 *
 * `nSamples` sortea coordenadas al azar (muestreo tipo genetico) en vez de recorrer la
 * rejilla entera: con 20 parametros de 3 niveles, enumerarla serian 3.486 millones de
 * combinaciones y el generador se colgaria antes de llegar al motor.
 */
function scenario({ levels, center, seed = 1, width = 2.4, hasForward = true, omit = [],
  tradesIs = 1200, nSamples = 0, noiseAmp = 0.08, oosFactor = 0.88, flat = false, losing = false }) {
  const r = rng(seed);
  const points = [];
  const emit = (z) => {
    let base;
    if (flat) base = 0.62;
    else {
      const d2 = z.reduce((s, v, j) => s + ((v - center[j]) / width) ** 2, 0);
      base = Math.exp(-d2 / 2);
    }
    if (losing) base *= 0.25;
    const nz = gauss(r) * noiseAmp;
    const gIs = base * 0.98 + nz * 0.25;
    const gOos = base * oosFactor + gauss(r) * (noiseAmp * 1.1);
    points.push({
      x: z.map((v, j) => v * (j + 2)),
      is: metrics(gIs, nz, tradesIs),
      oos: metrics(gOos, gauss(r) * noiseAmp, Math.round(tradesIs * 0.5)),
      isResult: Number((4 + 78 * Math.max(0, gIs)).toFixed(2)),
      oosResult: Number((4 + 78 * Math.max(0, gOos)).toFixed(2)),
    });
  };
  if (nSamples > 0) {
    const seen = new Set();
    let guard = 0;
    while (points.length < nSamples && guard++ < nSamples * 40) {
      const z = levels.map((L) => Math.floor(r() * L));
      const key = z.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      emit(z);
    }
  } else {
    grid(levels, emit);
  }
  return tables(points, levels.map((_, j) => `Inp_P${j + 1}`), { hasForward, omit });
}

/** Invariantes que DEBEN cumplirse pase lo que pase. */
function invariants(label, a, isT) {
  check(`${label}: emite un nivel de veredicto valido`,
    ['strong', 'moderate', 'weak', 'insufficient'].includes(a.verdict.level), a.verdict.level);
  check(`${label}: el veredicto trae al menos un hallazgo`, a.verdict.findings.length > 0);
  check(`${label}: no pierde configuraciones sin contarlas`,
    a.meta.total + a.meta.droppedParams <= isT.rows.length && a.meta.total > 0,
    `total=${a.meta.total} descartadas=${a.meta.droppedParams} filas=${isT.rows.length}`);
  check(`${label}: las mesetas son coherentes`,
    a.plateaus.every((p) => p.size >= 1
      && p.record && Array.isArray(p.record.params)
      && p.record.params.length === a.meta.paramNames.length
      && Number.isFinite(p.robust) && Number.isFinite(p.q10Score) && Number.isFinite(p.rankScore)),
    a.plateaus.map((p) => `M${p.rank}:size=${p.size},rob=${p.robust},q10=${p.q10Score}`).join(' '));
  check(`${label}: las mesetas salen ordenadas`,
    a.plateaus.every((p, i) => i === 0 || a.plateaus[i - 1].rankScore >= p.rankScore - 1e-9));
  const dirty = a.verdict.findings.find((f) => /NaN|undefined|\$\{/.test(f.title + f.detail));
  check(`${label}: ningun texto del veredicto contiene NaN ni undefined`, !dirty, dirty ? dirty.title : '');
  check(`${label}: el refinamiento propuesto es finito y ejecutable`,
    a.plateaus.every((p) => {
      const combos = p.refinement.reduce((acc, x) => acc * (x.constant ? 1 : x.levels), 1);
      return Number.isFinite(combos) && combos >= 1 && combos <= 25000;
    }),
    a.plateaus.map((p) => p.refinement.reduce((acc, x) => acc * (x.constant ? 1 : x.levels), 1)).join(','));
  check(`${label}: los picos descartados traen motivo`,
    a.peaks.every((p) => Array.isArray(p.reasons) && p.reasons.length > 0));
}

function run(label, build, extra) {
  const [isT, oosT] = build();
  const t = Date.now();
  let a;
  try {
    a = runAnalysis({ isTable: isT, oosTable: oosT });
  } catch (e) {
    checks++;
    failures++;
    console.log(`  ${label}\n    FAIL excepcion: ${e.message}`);
    return null;
  }
  const ms = Date.now() - t;
  console.log(`  ${label}`);
  console.log(`    ${a.meta.total} configs · ${a.meta.paramNames.length} params · ${a.meta.sampling} · radio ${a.meta.radius} · soporte ${a.meta.medianSupport} · ${a.meta.gatePassCount} pasan · ${a.plateaus.length} mesetas · ${a.verdict.level} · ${ms} ms`);
  invariants(label, a, isT);
  check(`${label}: termina en menos de 30 s`, ms < 30000, `${ms} ms`);
  if (extra) extra(a);
  return a;
}

console.log('\n================ NUMERO DE PARAMETROS ================');
run('2 parametros, rejilla 5x5 (demasiado pequena)', () => scenario({ levels: [5, 5], center: [2, 2], width: 1.5, seed: 3 }), (a) => {
  check('5x5: usa los dos parametros en la distancia', a.meta.activeDims.length === 2, String(a.meta.activeDims.length));
  // Con 25 configuraciones y 9 viables la region no puede tener interior. Lo correcto
  // es reconocer que no hay datos, NO concluir que el EA no sirve.
  check('5x5: admite que el conjunto es insuficiente', a.meta.underpowered === true, String(a.meta.underpowered));
  check('5x5: el titular lo dice sin acusar al EA',
    a.verdict.level === 'insufficient' && /insuficiente/i.test(a.verdict.headline), a.verdict.headline);
  // Y el resumen tiene que decir explicitamente que esto NO juzga al EA.
  check('5x5: el resumen aclara que no dice nada del EA',
    /no dice nada sobre tu EA/i.test(a.verdict.summary || ''), a.verdict.summary);
  check('5x5: mantiene la vecindad local (radio 1)', a.meta.radius === 1, String(a.meta.radius));
});
run('2 parametros, rejilla 30x30', () => scenario({ levels: [30, 30], center: [15, 15], width: 7, seed: 4 }),
  (a) => check('30x30: encuentra la meseta', a.plateaus.length >= 1, String(a.plateaus.length)));
run('1 solo parametro optimizado', () => scenario({ levels: [12], center: [6], width: 3, seed: 5 }),
  (a) => check('1 param: lo identifica', a.meta.paramNames.length === 1, String(a.meta.paramNames.length)));
run('3 parametros', () => scenario({ levels: [6, 6, 6], center: [3, 3, 3], width: 2, seed: 6 }),
  (a) => check('3 params: encuentra la meseta', a.plateaus.length >= 1, String(a.plateaus.length)));
run('12 parametros, disperso', () => scenario({ levels: Array(12).fill(4), center: Array(12).fill(2), width: 2.2, nSamples: 9000, seed: 7 }),
  (a) => check('12 params: detecta muestreo disperso', a.meta.sampling === 'sparse', a.meta.sampling));
run('20 parametros, muy disperso', () => scenario({ levels: Array(20).fill(3), center: Array(20).fill(1), width: 2, nSamples: 4000, seed: 8 }));

console.log('\n================ TAMANO DEL CONJUNTO ================');
run('Diminuto: 27 configuraciones', () => scenario({ levels: [3, 3, 3], center: [1, 1, 1], width: 1.2, seed: 9 }));
run('Minimo: 16 configuraciones', () => scenario({ levels: [4, 4], center: [1, 1], width: 1.2, seed: 10 }));
run('Grande: 100.000 configuraciones', () => scenario({ levels: [10, 10, 10, 10, 10], center: [5, 5, 5, 5, 5], width: 3, seed: 11 }),
  (a) => check('100k: encuentra meseta', a.plateaus.length >= 1, String(a.plateaus.length)));

console.log('\n================ MODOS Y COLUMNAS ================');
run('Backtest unico: sin forward', () => scenario({ levels: [7, 7, 7], center: [3, 3, 3], width: 2.2, hasForward: false, seed: 12 }), (a) => {
  check('sin forward: lo refleja en meta', a.meta.hasForward === false);
  check('sin forward: no inventa fragilidad de seleccion', !Number.isFinite(a.stats.fragility), String(a.stats.fragility));
  check('sin forward: no inventa inversiones', a.inversions.length === 0, String(a.inversions.length));
});
run('Export sin Sharpe ni Recovery', () => scenario({ levels: [6, 6, 6], center: [3, 3, 3], width: 2, omit: ['Sharpe Ratio', 'Recovery Factor'], seed: 13 }), (a) => {
  check('sin Sharpe: sigue puntuando calidad', a.records.some((r) => Number.isFinite(r.qualityIs)));
  check('sin Sharpe: no ofrece contraste de Sharpe', a.stats.sharpeTest === null);
});
run('Export minimo: solo Profit y Trades', () => scenario({ levels: [6, 6, 6], center: [3, 3, 3], width: 2, omit: ['Sharpe Ratio', 'Recovery Factor', 'Profit Factor', 'Equity DD %', 'Expected Payoff'], seed: 14 }),
  (a) => check('export minimo: sigue calificando la evidencia', ['strong', 'moderate', 'weak', 'insufficient'].includes(a.verdict.level)));

console.log('\n================ CASOS DEGENERADOS ================');
run('EA perdedor en todo el espacio', () => scenario({ levels: [6, 6, 6], center: [3, 3, 3], losing: true, seed: 16 }), (a) => {
  check('perdedor: nadie pasa los minimos', a.meta.gatePassCount === 0, String(a.meta.gatePassCount));
  check('perdedor: la evidencia no es solida', a.verdict.level !== 'strong', a.verdict.level);
});
run('Muy pocas operaciones', () => scenario({ levels: [6, 6, 6], center: [3, 3, 3], width: 2, tradesIs: 45, seed: 17 }),
  (a) => check('pocas ops: nadie pasa el minimo de operaciones', a.meta.gatePassCount === 0, String(a.meta.gatePassCount)));
run('Superficie plana y rentable (robustez legitima)', () => scenario({ levels: [6, 6, 6], center: [3, 3, 3], flat: true, noiseAmp: 0.05, seed: 30 }),
  (a) => check('plana: reconoce que aguanta en todo el espacio',
    a.verdict.findings.some((f) => /aguanta en casi todo|parte amplia del espacio/i.test(f.title)),
    a.verdict.findings.map((f) => f.title).join(' | ')));

run('Ruido puro: el forward no guarda relacion con el in-sample', () => {
  const r = rng(31);
  const points = [];
  grid([7, 7, 7], (z) => {
    const gIs = 0.55 + gauss(r) * 0.2;
    const gOos = 0.55 + gauss(r) * 0.2; // sorteo independiente: ninguna relacion
    points.push({
      x: z.map((v, j) => v * (j + 2)),
      is: metrics(gIs, gauss(r) * 0.05, 1200),
      oos: metrics(gOos, gauss(r) * 0.05, 600),
      isResult: Number((4 + 78 * Math.max(0, gIs)).toFixed(2)),
      oosResult: Number((4 + 78 * Math.max(0, gOos)).toFixed(2)),
    });
  });
  return tables(points, ['Inp_P1', 'Inp_P2', 'Inp_P3']);
}, (a) => {
  check('ruido: detecta correlacion nula entre periodos',
    Math.abs(a.stats.spearmanCriterion) < 0.2, String(a.stats.spearmanCriterion));
  check('ruido: la evidencia no es solida', a.verdict.level !== 'strong', a.verdict.level);
});
run('Un parametro con 60 niveles finos', () => scenario({ levels: [60, 4], center: [30, 2], width: 12, seed: 19 }),
  (a) => check('60 niveles: encuentra meseta', a.plateaus.length >= 1, String(a.plateaus.length)));

console.log(`\n${'='.repeat(56)}`);
console.log(failures
  ? `BANCO DE ESFUERZO: ${checks - failures}/${checks} — ${failures} FALLO(S)`
  : `BANCO DE ESFUERZO: ${checks}/${checks} correctas`);
console.log(`tiempo total ${((Date.now() - t0all) / 1000).toFixed(1)} s`);
process.exit(failures ? 1 : 0);
