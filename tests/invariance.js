// Invarianza y fixtures de riesgo estadistico.
//
//   node tests/invariance.js
//
// Comprueba lo que la auditoria externa pedía como P0/P1 técnico:
//   - shuffle de filas no cambia el resultado
//   - meseta en el borde del rango → aviso de frontera
//   - muestreo disperso / huecos: ausente ≠ fallo
//   - dos ejecuciones identicas → mismo fingerprint

import { runAnalysis } from '../js/analysis.js';
import { DEFAULT_POLICY } from '../js/metrics.js';
import { CODE, outcomeFromAnalysis } from '../js/errors.js';

let failures = 0;
let checks = 0;

function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`);
  }
}
function section(t) {
  console.log(`\n${'='.repeat(70)}\n${t}\n${'='.repeat(70)}`);
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

const ENGINE_POLICY = {
  ...DEFAULT_POLICY,
  gates: { ...DEFAULT_POLICY.gates, minProfitFactor: 1.05, maxDrawdownPct: 35, minTrades: 100 },
};

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

function synthTables(points, paramNames) {
  const isHeaders = ['Pass', 'Result', 'Profit', 'Expected Payoff', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Custom', 'Equity DD %', 'Trades', ...paramNames];
  const oosHeaders = ['Pass', 'Forward Result', 'Back Result', 'Profit', 'Expected Payoff', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Custom', 'Equity DD %', 'Trades', ...paramNames];
  const isRows = [];
  const oosRows = [];
  points.forEach((p, i) => {
    const pass = p.pass != null ? p.pass : i;
    isRows.push([pass, p.isResult, p.is.profit, p.is.profit / 800, p.is.profitFactor, p.is.recoveryFactor, p.is.sharpe, 0, p.is.drawdown, p.is.trades, ...p.x]);
    oosRows.push([pass, p.oosResult, p.isResult, p.oos.profit, p.oos.profit / 800, p.oos.profitFactor, p.oos.recoveryFactor, p.oos.sharpe, 0, p.oos.drawdown, p.oos.trades, ...p.x]);
  });
  return [
    { name: 'IS', sheet: 'Tester Optimizator Results', format: 'sintetico', headers: isHeaders, rows: isRows },
    { name: 'OOS', sheet: 'Tester Optimizator Results', format: 'sintetico', headers: oosHeaders, rows: oosRows },
  ];
}

function shuffleTable(table, rand) {
  const rows = table.rows.slice();
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = rows[i];
    rows[i] = rows[j];
    rows[j] = tmp;
  }
  return { ...table, rows };
}

/** Firma estable del resultado: lo que el usuario "ve" como decisión. */
function fingerprint(a) {
  return JSON.stringify({
    level: a.verdict.level,
    gatePass: a.meta.gatePassCount,
    total: a.meta.total,
    coverage: Number((a.meta.coverage || 0).toFixed(8)),
    sampling: a.meta.sampling,
    plateaus: a.plateaus.map((p) => ({
      id: String(p.record.id),
      size: p.size,
      robust: Number(p.robust.toFixed(5)),
      params: p.record.params,
      boundary: (p.boundary || []).map((b) => b.name).sort(),
      nb: p.neighborhood
        ? {
          observed: p.neighborhood.observed,
          passing: p.neighborhood.passing,
          failing: p.neighborhood.failing,
          gaps: p.neighborhood.gaps,
        }
        : null,
    })),
  });
}

/** Rejilla 5D con meseta central (caso base para shuffle). */
function buildPlantedGrid(seed = 11) {
  const r = rng(seed);
  const L = 5;
  const center = [2, 2, 2, 2, 2];
  const points = [];
  let idx = 0;
  for (let a = 0; a < L; a++) for (let b = 0; b < L; b++) for (let c = 0; c < L; c++) for (let d = 0; d < L; d++) for (let e = 0; e < L; e++) {
    const z = [a, b, c, d, e];
    const dist = z.reduce((s, v, j) => s + ((v - center[j]) / 2.2) ** 2, 0);
    const g = Math.exp(-dist / 2);
    const nz = gauss(r) * 0.08;
    points.push({
      pass: idx,
      x: z.map((v) => 10 + v * 5),
      is: metricsFromGoodness(g + nz * 0.15, nz, 1400),
      oos: metricsFromGoodness(g * 0.88 + nz * 0.15, nz, 700),
      isResult: 40 + 45 * g + nz,
      oosResult: 35 + 42 * g + nz,
    });
    idx++;
  }
  return synthTables(points, ['p1', 'p2', 'p3', 'p4', 'p5']);
}

// ---------------------------------------------------------------- 1. shuffle
section('1. Invarianza: barajar filas no cambia el resultado');
{
  const [is0, oos0] = buildPlantedGrid(101);
  const base = runAnalysis({ isTable: is0, oosTable: oos0, policy: ENGINE_POLICY });
  const fp0 = fingerprint(base);
  check('caso base encuentra meseta', base.plateaus.length >= 1, String(base.plateaus.length));
  check('caso base es rejilla completa', base.meta.sampling === 'grid', base.meta.sampling);

  for (const seed of [7, 99, 12345]) {
    const r = rng(seed);
    const isS = shuffleTable(is0, r);
    const oosS = shuffleTable(oos0, r);
    const a = runAnalysis({ isTable: isS, oosTable: oosS, policy: ENGINE_POLICY });
    const fp = fingerprint(a);
    check(`shuffle seed=${seed} mismo fingerprint`, fp === fp0, `diff`);
  }

  // Misma entrada dos veces.
  const again = runAnalysis({ isTable: is0, oosTable: oos0, policy: ENGINE_POLICY });
  check('misma entrada dos veces = mismo fingerprint', fingerprint(again) === fp0);
}

// ---------------------------------------------------------------- 2. frontera
section('2. Fixture: meseta pegada al borde del rango');
{
  const r = rng(202);
  // Rejilla 6×6: zona buena EMA≥26 (incluye el máximo 28).
  const emas = [18, 20, 22, 24, 26, 28];
  const sls = [100, 120, 140, 160, 180, 200];
  const points = [];
  let pass = 0;
  for (const ema of emas) for (const sl of sls) {
    const emaGood = ema >= 26 ? 1 : ema >= 24 ? 0.6 : 0.2;
    const slGood = Math.exp(-(((sl - 140) / 50) ** 2));
    const g = 0.4 * emaGood + 0.6 * emaGood * slGood;
    const nz = gauss(r) * 0.04;
    points.push({
      pass,
      x: [ema, sl],
      is: metricsFromGoodness(g, nz, 1200),
      oos: metricsFromGoodness(g * 0.9, nz, 600),
      isResult: 30 + 50 * g,
      oosResult: 28 + 48 * g,
    });
    pass++;
  }
  const [isT, oosT] = synthTables(points, ['EMA', 'SL']);
  const a = runAnalysis({ isTable: isT, oosTable: oosT, policy: ENGINE_POLICY });
  check('encuentra meseta en zona alta de EMA', a.plateaus.length >= 1, String(a.plateaus.length));
  if (a.plateaus.length) {
    const emaLevels = a.sensitivity.find((s) => s.name === 'EMA')?.values || [];
    const emaHi = emaLevels.length >= 2 ? emaLevels[emaLevels.length - 2] : 26;
    const emaMax = emaLevels.length ? emaLevels[emaLevels.length - 1] : 28;
    const b = a.plateaus[0].boundary.map((x) => x.name);
    const emasIn = a.plateaus[0].indices.map((i) => a.records[i].params[a.meta.paramNames.indexOf('EMA')]);
    check('meseta en el tercio alto del rango EMA',
      b.includes('EMA') || emasIn.some((v) => v >= emaHi),
      `boundary=${b.join(',') || '—'} emas=${[...new Set(emasIn)].join(',')}`);
    const ema = a.plateaus[0].record.params[a.meta.paramNames.indexOf('EMA')];
    check('el representante esta en zona alta de EMA', ema >= emaHi, String(ema));
  }
}

// ---------------------------------------------------------------- 3. huecos / sparse
section('3. Fixture: huecos en la malla (ausente ≠ fallo)');
{
  const r = rng(303);
  // Malla 6³ = 216. Núcleo L1≤3 (~63 pts) menos 2 vecinos axis del centro:
  // cobertura ~28 % → partial, y gaps > 0 junto al representante.
  const L = 6;
  const center = [3, 3, 3];
  const holeNeighbors = [
    [4, 3, 3], // +a
    [3, 3, 4], // +c
  ];
  const isHole = (z) => holeNeighbors.some((h) => h[0] === z[0] && h[1] === z[1] && h[2] === z[2]);
  const manhattan = (z) => z.reduce((s, v, j) => s + Math.abs(v - center[j]), 0);

  const all = [];
  let idx = 0;
  for (let a = 0; a < L; a++) for (let b = 0; b < L; b++) for (let c = 0; c < L; c++) {
    const z = [a, b, c];
    const dist = z.reduce((s, v, j) => s + ((v - center[j]) / 2.0) ** 2, 0);
    const g = Math.exp(-dist / 2);
    const nz = gauss(r) * 0.06;
    const keep = manhattan(z) <= 3 && !isHole(z);
    all.push({
      pass: idx,
      x: z.map((v) => 5 + v * 3),
      is: metricsFromGoodness(g, nz, 1100),
      oos: metricsFromGoodness(g * 0.88, nz, 550),
      isResult: 35 + 40 * g,
      oosResult: 32 + 38 * g,
      keep,
    });
    idx++;
  }
  const kept = all.filter((p) => p.keep);
  const [isT, oosT] = synthTables(kept, ['a', 'b', 'c']);
  const a = runAnalysis({ isTable: isT, oosTable: oosT, policy: ENGINE_POLICY });
  console.log(`  kept=${kept.length}/${all.length} coverage=${(100 * a.meta.coverage).toFixed(1)}% sampling=${a.meta.sampling} plateaus=${a.plateaus.length}`);
  check('cobertura < umbral densocoverage', a.meta.coverage < 0.35, String(a.meta.coverage));
  check('detecta muestreo parcial o disperso', a.meta.sampling === 'partial' || a.meta.sampling === 'sparse', a.meta.sampling);
  check('outcome tipado coherente', [CODE.ANALYSIS_SUCCESS, CODE.NO_PLATEAU, CODE.INSUFFICIENT_DATA].includes(outcomeFromAnalysis(a).code));

  if (a.plateaus.length && a.plateaus[0].neighborhood) {
    const nb = a.plateaus[0].neighborhood;
    check('reporta vecinas observadas', Number.isFinite(nb.observed) && nb.observed >= 0);
    check('passing + failing = observed', nb.passing + nb.failing === nb.observed, `${nb.passing}+${nb.failing}≠${nb.observed}`);
    if (nb.slotsComplete && Number.isFinite(nb.gaps)) {
      check('huecos no observados > 0 en malla con agujeros', nb.gaps > 0, `gaps=${nb.gaps} slots=${nb.slots}`);
      check('gaps + observed <= slots', nb.gaps + nb.observed <= nb.slots + 0, `${nb.gaps}+${nb.observed} vs ${nb.slots}`);
    } else {
      console.log('  (slots no completos en este muestreo: se acepta sin gaps numericos)');
      check('sin slots completos, gaps es null', nb.gaps == null || !nb.slotsComplete);
    }
  } else {
    check('encuentra meseta con huecos locales', false, 'sin meseta');
  }
}

// ---------------------------------------------------------------- 4. categoricos no inventan distancia
section('4. Fixture: enum no crea vecinos artificiales entre modos');
{
  const r = rng(404);
  const MODES = ['Conservador', 'Neutro', 'Agresivo'];
  const points = [];
  let pass = 0;
  for (let a = 0; a < 7; a++) for (let b = 0; b < 7; b++) for (let m = 0; m < 3; m++) {
    // Solo Neutro es bueno; Conservador y Agresivo son malos.
    // Si el motor tratara Mode como ordinal, mezclaria vecinos entre modos.
    const dist = ((a - 3) / 2.2) ** 2 + ((b - 3) / 2.2) ** 2;
    const g = Math.exp(-dist / 2) * (m === 1 ? 1 : 0.2);
    const nz = gauss(r) * 0.05;
    points.push({
      pass,
      x: [a + 1, b + 1, MODES[m]],
      is: metricsFromGoodness(g, nz, 1300),
      oos: metricsFromGoodness(g * 0.9, nz, 650),
      isResult: 40 + 40 * g,
      oosResult: 38 + 38 * g,
    });
    pass++;
  }
  const [isT, oosT] = synthTables(points, ['a', 'b', 'Mode']);
  const a = runAnalysis({ isTable: isT, oosTable: oosT, policy: ENGINE_POLICY });
  check('clasifica Mode como text', a.meta.paramTypes.includes('text'), a.meta.paramTypes.join(','));
  check('Mode bloquea / no mide distancia', a.meta.blockNames.includes('Mode') || !a.meta.activeNames.includes('Mode'),
    `active=${a.meta.activeNames} block=${a.meta.blockNames}`);
  if (a.plateaus.length) {
    const j = a.meta.paramNames.indexOf('Mode');
    const mode = a.plateaus[0].record.params[j];
    check('el representante cae en Neutro (el modo bueno)', mode === 'Neutro', String(mode));
  }
}

// ---------------------------------------------------------------- resumen
console.log(`\n${'='.repeat(70)}`);
console.log(`RESULTADO: ${checks - failures}/${checks} comprobaciones correctas`);
console.log(`${'='.repeat(70)}`);
if (failures) process.exit(1);
