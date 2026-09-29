// Ejecuta el banco de pruebas (ver bench/PREREGISTRO.md).
//
//   node bench/run.js calib            semillas 1-40 de cada escenario
//   node bench/run.js test             semillas 1001-1040 (examen)
//   node bench/run.js calib S3 5       un escenario y N semillas (pruebas rápidas)
//
// Escribe una línea JSON por caso en bench/results/<split>.jsonl.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

async function evaluateCase(scenario, seed) {
  const { generateCase } = await import('./sim.js');
  const { runAnalysis } = await import('../core/analysis.js');
  const { DEFAULT_POLICY } = await import('../core/metrics.js');
  const { setLocale } = await import('../js/i18n.js');
  setLocale('es');
  const c = generateCase(scenario, seed);
  const g = DEFAULT_POLICY.gates;
  const edges = c.rows.map((r) => r.edgeUnseen);
  const sorted = edges.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const oracle = sorted[sorted.length - 1];
  const regret = (e) => (oracle - median > 1e-9 ? (oracle - e) / (oracle - median) : NaN);
  const byKey = new Map(c.rows.map((r, i) => [c.key(r.params), i]));
  const fwdSet = new Set(c.fwd);

  // ---- métodos de referencia (solo con lo que vería un usuario)
  const argmax = (idxs, f) => idxs.reduce((b, i) => (f(i) > f(b) ? i : b), idxs[0]);
  const all = c.rows.map((_, i) => i);
  const B1 = argmax(all, (i) => c.rows[i].is.profit);
  const B2 = argmax(c.fwd, (i) => c.rows[i].oos.profit);
  const rankIn = (idxs, f) => {
    const o = idxs.slice().sort((a, b) => f(a) - f(b));
    return new Map(o.map((idx, k) => [idx, k]));
  };
  const rIs = rankIn(c.fwd, (i) => c.rows[i].is.profit);
  const rOos = rankIn(c.fwd, (i) => c.rows[i].oos.profit);
  const B3 = argmax(c.fwd, (i) => rIs.get(i) + rOos.get(i));
  const zKey = (z) => z.join(',');
  const byZ = new Map(c.rows.map((r, i) => [zKey(r.z), i]));
  const smooth = (i) => {
    const z = c.rows[i].z;
    let s = c.rows[i].is.profit;
    let n = 1;
    for (let j = 0; j < z.length; j++) for (const d of [-1, 1]) {
      const zz = z.slice(); zz[j] += d;
      const k = byZ.get(zKey(zz));
      if (k !== undefined) { s += c.rows[k].is.profit; n++; }
    }
    return s / n;
  };
  const B4 = argmax(all, smooth);
  const passes = (m, minT) => m.profit > 0 && m.profitFactor >= g.minProfitFactor && m.drawdownPct <= g.maxDrawdownPct && m.trades >= minT;
  const minOosT = Math.max(30, g.minTrades * c.meta.oosRatio);
  const passing = c.fwd.filter((i) => passes(c.rows[i].is, g.minTrades) && passes(c.rows[i].oos, minOosT));
  const rr = (() => { let x = (seed * 2654435761) >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; })();
  const B5 = passing.length ? passing[Math.floor(rr() * passing.length)] : all[Math.floor(rr() * all.length)];

  // ---- Orometra
  const t0 = Date.now();
  let a = null;
  let error = null;
  try {
    const { ENGINE_DEFAULTS } = await import('../core/engine.js');
    const variant = process.env.BENCH_OPTS ? JSON.parse(process.env.BENCH_OPTS) : null;
    a = variant ? runAnalysis({ isTable: c.isTable, oosTable: c.oosTable, opts: { ...ENGINE_DEFAULTS, ...variant } })
      : runAnalysis({ isTable: c.isTable, oosTable: c.oosTable });
  } catch (e) {
    error = String(e && e.message ? e.message : e).slice(0, 200);
  }
  const ms = Date.now() - t0;
  let pickIdx = null;
  if (a && a.plateaus && a.plateaus.length) {
    const k = c.key(a.plateaus[0].record.params);
    pickIdx = byKey.has(k) ? byKey.get(k) : null;
  }
  let fbIdx = null;
  if (a && a.fallback) {
    const k = c.key(a.fallback.record.params);
    fbIdx = byKey.has(k) ? byKey.get(k) : null;
  }
  const pickInfo = (i) => (i === null || i === undefined ? null : { edge: edges[i], regret: regret(edges[i]), fwd: fwdSet.has(i) });
  return {
    scenario, seed,
    meta: { dims: c.meta.dims, configs: c.meta.configs, tradesIs: c.meta.tradesIs, A: c.meta.A, luckAmp: c.meta.luckAmp, oosRatio: c.meta.oosRatio },
    truth: { oracle, median, plateauSharpe: c.meta.A },
    level: a ? a.verdict.level : null,
    diag: a ? {
      searchPass: a.meta.searchPassCount, gatePass: a.meta.gatePassCount, total: a.meta.total,
      underpowered: a.meta.underpowered, needed: a.meta.viableNeededForPlateau,
      sampling: a.meta.sampling, radius: a.meta.radius, medianSupport: a.meta.medianSupport,
      crit: a.verdict.findings.filter((f) => f.severity === 'critical').map((f) => f.title),
      region: a.stats.stabilityCheck ? a.stats.stabilityCheck.regionRate : null,
      plateauSize: a.plateaus[0] ? a.plateaus[0].size : 0,
      fwdPass: a.plateaus[0] && a.plateaus[0].oosValidation ? a.plateaus[0].oosValidation.passFrac : null,
      fwdWith: a.plateaus[0] && a.plateaus[0].oosValidation ? a.plateaus[0].oosValidation.withForward : null,
    } : null,
    plateaus: a ? a.plateaus.length : 0,
    error, ms,
    orometra: pickInfo(pickIdx),
    orometraFallback: pickInfo(fbIdx),
    B1: pickInfo(B1), B2: pickInfo(B2), B3: pickInfo(B3), B4: pickInfo(B4), B5: pickInfo(B5),
  };
}

if (isMainThread) {
  const [split = 'calib', only, nArg] = process.argv.slice(2);
  const { SCENARIOS } = await import('./sim.js');
  const base = split === 'test' ? 1001 : 1;
  const n = nArg ? Number(nArg) : 100;
  const scen = only ? only.split(',') : SCENARIOS;
  const tasks = [];
  for (const s of scen) for (let k = 0; k < n; k++) tasks.push({ scenario: s, seed: base + k });
  fs.mkdirSync(path.join(HERE, 'results'), { recursive: true });
  const tag = process.env.BENCH_TAG ? '-' + process.env.BENCH_TAG : '';
  const out = path.join(HERE, 'results', `${split}${only ? '-' + only.replace(/,/g, '_') : ''}${tag}.jsonl`);
  fs.writeFileSync(out, '');
  let done = 0;
  const t0 = Date.now();
  const nWorkers = Math.min(os.cpus().length, tasks.length);
  await Promise.all(Array.from({ length: nWorkers }, () => new Promise((resolve) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: {} });
    const next = () => {
      const t = tasks.shift();
      if (!t) { w.terminate(); resolve(); return; }
      w.postMessage(t);
    };
    w.on('message', (res) => {
      fs.appendFileSync(out, JSON.stringify(res) + '\n');
      done++;
      if (done % 20 === 0) console.log(`${done} casos, ${Math.round((Date.now() - t0) / 1000)} s`);
      next();
    });
    w.on('error', (e) => { console.error(e); next(); });
    next();
  })));
  console.log(`Hecho: ${done} casos en ${Math.round((Date.now() - t0) / 1000)} s -> ${out}`);
} else {
  parentPort.on('message', async (t) => {
    try {
      parentPort.postMessage(await evaluateCase(t.scenario, t.seed));
    } catch (e) {
      parentPort.postMessage({ scenario: t.scenario, seed: t.seed, fatal: String(e && e.stack ? e.stack : e).slice(0, 400) });
    }
  });
}
