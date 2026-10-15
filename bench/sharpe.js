// ¿Cuántas veces supera el contraste del Sharpe su umbral SIN ventaja, y cuántos niveles
// cambiarían si el umbral contara todas las pasadas? (medición del 2026-10-15, sin cambiar el motor)
//
// Se midió con el motor 6689445, en el que A era el umbral del motor. Desde 906b8f3 el motor ya
// usa B (enmiendas del 2026-10-15 en bench/PREREGISTRO.md): con él, A y B coinciden y el script
// solo sirve para repetir la medición sobre ese commit.
//
// El umbral es el percentil 95 del máximo de N pruebas sin ventaja: sigma · Φ⁻¹(0,95^(1/N)),
// con sigma la dispersión de los Sharpe observados. Hoy N son las «pruebas efectivas»
// (celdas del espacio grueso, core/analysis.js), no las pasadas que entran en el contraste.
// Si los Sharpe de esas pasadas son independientes, el máximo es el de todas ellas y el
// umbral se queda corto: lo supera el puro ruido mucho más del 5 % que promete el texto.
//
// Variantes medidas (el motor no cambia; la B se recalcula aquí con los datos del análisis):
//   A  la actual: N = pruebas efectivas.
//   B  N = pasadas que entran en el contraste (exacto si sus Sharpe son independientes).
//   C  (exploratoria, solo calibración) N = pasadas y sigma estimada con las diferencias entre
//      vecinas a un paso, donde la forma suave de la superficie (la señal) se cancela.
// B solo sube el listón, así que un caso solo puede pasar de aprobar a suspender: suspender
// es crítico y deja el nivel en «débil» (core/verdict.js), salvo que ya fuera «insuficiente»
// o «débil». Si B diera un listón más bajo que A (más celdas que pasadas), se marca aparte.
//
// También se apunta la correlación del Sharpe del forward entre vecinas a un paso: en el banco
// las operaciones de cada configuración se simulan por separado, así que debería salir baja;
// en un EA real las vecinas comparten operaciones y puede ser alta.
//
//   node bench/sharpe.js calib            semillas 1-100 de S1-S8
//   node bench/sharpe.js exam6            semillas 6001-6100 (ya publicado)
//
// Escribe bench/results/<split>-sharpe.jsonl y resume en pantalla.

import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NO_EDGE = new Set(['S1', 'S2', 'S5']);
const ORDER = ['insufficient', 'weak', 'moderate', 'good', 'strong'];
const SHARPE_TITLE = /mejor Sharpe no supera/;
// Los mismos que core/analysis.js (SHARPE_MIN_TRADES y SHARPE_CHANCE_LEVEL).
const MIN_TRADES = 30;
const LEVEL = 0.95;

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return NaN;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}

async function evaluateCase(scenario, seed) {
  const { generateCase } = await import('./sim.js');
  const { runAnalysis } = await import('../core/analysis.js');
  const { maxQuantileZ } = await import('../core/stats.js');
  const { setLocale } = await import('../js/i18n.js');
  setLocale('es');
  const c = generateCase(scenario, seed);
  const a = runAnalysis({ isTable: c.isTable, oosTable: c.oosTable });
  const st = a.stats.sharpeTest;
  const otherCritical = a.verdict.findings.filter((f) => f.severity === 'critical' && !SHARPE_TITLE.test(f.title)).length;
  const base = { scenario, seed, level: a.verdict.level, plateaus: a.plateaus.length, A: c.meta.A, tradesIs: c.meta.tradesIs, otherCritical };
  if (!st) return { ...base, hasTest: false, levelB: a.verdict.level, levelC: a.verdict.level };

  // Las mismas pasadas que entran en el contraste del motor.
  const period = st.period;
  const used = a.records.filter((r) => Number.isFinite(r[period].sharpe) && Number.isFinite(r[period].trades) && r[period].trades > MIN_TRADES);
  const n = used.length;
  const q95B = st.sigma * maxQuantileZ(n, LEVEL);
  const passA = st.observedMax > st.chanceMax;
  const passB = st.observedMax > q95B;

  // Correlación del Sharpe entre vecinas a un paso (en un solo eje), entre las pasadas usadas.
  const idx = (r) => r.params.map((v, d) => a.levels[d].indexOf(v));
  const byKey = new Map(used.map((r) => [idx(r).join(','), r[period].sharpe]));
  const xs = []; const ys = [];
  for (const r of used) {
    const z = idx(r);
    for (let d = 0; d < z.length; d++) {
      const zz = z.slice(); zz[d] += 1;
      const s = byKey.get(zz.join(','));
      if (s !== undefined) { xs.push(r[period].sharpe); ys.push(s); }
    }
  }

  // C (exploratoria): ruido estimado con las diferencias entre vecinas, var(Si − Sj) / 2, donde
  // la forma suave de la superficie se cancela; N = pasadas. Con menos de 20 parejas, como B.
  const sigmaC = xs.length >= 20 ? Math.sqrt(xs.reduce((s, x, i) => s + (x - ys[i]) ** 2, 0) / xs.length / 2) : st.sigma;
  const q95C = sigmaC * maxQuantileZ(n, LEVEL);
  const passC = st.observedMax > q95C;

  // Nivel con cada variante. Suspender es crítico y deja «débil». Aprobar cuando A suspendía
  // quita ese crítico: si era el único, el nivel subiría a uno que aquí no se puede saber.
  const levelWith = (pass) => {
    if (passA && !pass && ORDER.indexOf(a.verdict.level) > 1) return { level: 'weak', unknown: false };
    if (!passA && pass && otherCritical === 0 && a.verdict.level === 'weak') return { level: a.verdict.level, unknown: true };
    return { level: a.verdict.level, unknown: false };
  };
  const b = levelWith(passB);
  const cc = levelWith(passC);
  return {
    ...base, hasTest: true, period, n, eff: st.effectiveTrials, max: st.observedMax, sigma: st.sigma, sigmaC,
    q95A: st.chanceMax, q95B, q95C, passA, passB, passC,
    levelB: b.level, unknown: b.unknown, levelC: cc.level, unknownC: cc.unknown,
    rhoNb: pearson(xs, ys), nbPairs: xs.length,
  };
}

function summarize(rows) {
  const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)} %` : '—');
  const isPos = (l) => ORDER.indexOf(l) >= 2;
  const med = (v) => { const o = v.filter(Number.isFinite).sort((x, y) => x - y); return o.length ? o[Math.floor(o.length / 2)] : NaN; };
  const lines = [];
  lines.push('Escenario | casos con contraste | supera A | supera B | supera C | N efectivas | pasadas | correlación vecinas | sigma C / sigma (medianas)');
  for (const s of ['S1', 'S2', 'S5', 'S3', 'S4', 'S6', 'S7', 'S8']) {
    const g = rows.filter((r) => r.scenario === s && r.hasTest);
    if (!g.length) continue;
    const k = (f) => { const x = g.filter(f).length; return `${x} (${pct(x, g.length)})`; };
    lines.push(`${s} | ${g.length} | ${k((r) => r.passA)} | ${k((r) => r.passB)} | ${k((r) => r.passC)} | ${med(g.map((r) => r.eff))} | ${med(g.map((r) => r.n))} | ${med(g.map((r) => r.rhoNb)).toFixed(2)} | ${med(g.map((r) => r.sigmaC / r.sigma)).toFixed(2)}`);
  }
  const lv = (g, key) => pct(g.filter((r) => isPos(r[key])).length, g.length);
  for (const [name, inGroup] of [['sin ventaja (S1, S2, S5)', (r) => NO_EDGE.has(r.scenario)], ['con ventaja (S3, S4, S6, S7, S8)', (r) => !NO_EDGE.has(r.scenario)]]) {
    const g = rows.filter(inGroup);
    const ch = (key) => { const c = g.filter((r) => r[key] !== r.level); return `${c.length} (${['moderate', 'good', 'strong'].map((l) => `${l} ${c.filter((r) => r.level === l).length}`).join(', ')})`; };
    lines.push(`${name}: ${g.length} casos · moderada o más A ${lv(g, 'level')} · B ${lv(g, 'levelB')} · C ${lv(g, 'levelC')} · bajan a débil con B ${ch('levelB')}, con C ${ch('levelC')} · subirían (no medible aquí) B ${g.filter((r) => r.unknown).length}, C ${g.filter((r) => r.unknownC).length}`);
  }
  for (const s of ['S1', 'S2', 'S5']) {
    const g = rows.filter((r) => r.scenario === s);
    lines.push(`${s}: moderada o más A ${lv(g, 'level')} · B ${lv(g, 'levelB')} · C ${lv(g, 'levelC')} · subirían con C ${g.filter((r) => r.unknownC).length}`);
  }
  const power = rows.filter((r) => r.scenario === 'S3' && r.A >= 0.25 && r.tradesIs >= 150);
  lines.push(`Potencia (S3, A ≥ 0,25 y ≥ 150 operaciones): ${power.length} casos · moderada o más A ${lv(power, 'level')} · B ${lv(power, 'levelB')} · C ${lv(power, 'levelC')} (+${power.filter((r) => r.unknownC).length} que subirían)`);
  return lines.join('\n');
}

if (isMainThread) {
  const [split = 'calib'] = process.argv.slice(2);
  const { seedBase } = await import('./sim.js');
  const base = seedBase(split);
  const tasks = [];
  for (const s of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']) for (let k = 0; k < 100; k++) tasks.push({ scenario: s, seed: base + k });
  const out = path.join(HERE, 'results', `${split}-sharpe.jsonl`);
  fs.writeFileSync(out, '');
  const rows = [];
  const t0 = Date.now();
  await Promise.all(Array.from({ length: Math.min(os.cpus().length, tasks.length) }, () => new Promise((resolve) => {
    const w = new Worker(fileURLToPath(import.meta.url));
    const next = () => { const t = tasks.shift(); if (!t) { w.terminate(); resolve(); return; } w.postMessage(t); };
    w.on('message', (r) => {
      rows.push(r); fs.appendFileSync(out, JSON.stringify(r) + '\n');
      if (rows.length % 100 === 0) console.log(`${rows.length} casos, ${Math.round((Date.now() - t0) / 1000)} s`);
      next();
    });
    w.on('error', (e) => { console.error(e); next(); });
    next();
  })));
  const fatal = rows.filter((r) => r.fatal);
  if (fatal.length) console.log(`Fallos: ${fatal.length}`, fatal[0].fatal);
  console.log(summarize(rows.filter((r) => !r.fatal)));
  console.log(`-> ${path.relative(process.cwd(), out)}`);
} else {
  parentPort.on('message', async (t) => {
    try { parentPort.postMessage(await evaluateCase(t.scenario, t.seed)); } catch (e) { parentPort.postMessage({ ...t, fatal: String(e && e.stack ? e.stack : e).slice(0, 300) }); }
  });
}
