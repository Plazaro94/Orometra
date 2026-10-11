// ¿Cambia algún nivel el aviso «La regla "primera de Result" falla»? (enmienda del 2026-10-11)
//
// Hasta el 2026-10-11 era crítico cuando el orden de MT5 fallaba la mitad de las veces o más y
// menos de 1 de cada 4 configuraciones cumplía en los dos periodos. Ahora es un aviso sobre el
// orden de la tabla y no baja el nivel. Con la regla anterior, un caso habría cambiado de nivel
// solo si ese aviso salta y no hay ningún otro crítico: eso es lo que se cuenta aquí.
//
//   node bench/orden-tabla.js calib            semillas 1-100 de cada escenario
//   node bench/orden-tabla.js exam5            semillas 5001-5100 (ya publicado: comprueba que no cambia)
//   node bench/orden-tabla.js calib '{"gates":{"requireProfit":true,"minProfitFactor":1.4,"maxDrawdownPct":20,"minTrades":100}}'
//
// Escribe bench/results/<split>-orden-tabla[-pfX].jsonl y resume en pantalla.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NO_EDGE = new Set(['S1', 'S2', 'S5']);
const ORDER = ['insufficient', 'weak', 'moderate', 'good', 'strong'];

async function evaluateCase(scenario, seed, policy) {
  const { generateCase } = await import('./sim.js');
  const { runAnalysis } = await import('../core/analysis.js');
  const { setLocale } = await import('../js/i18n.js');
  setLocale('es');
  const c = generateCase(scenario, seed);
  const a = runAnalysis({ isTable: c.isTable, oosTable: c.oosTable, ...(policy ? { policy } : {}) });
  const fired = a.verdict.findings.some((f) => /primera de Result/.test(f.title));
  const otherCritical = a.verdict.findings.filter((f) => f.severity === 'critical').length;
  return {
    scenario, seed, level: a.verdict.level, fired, otherCritical,
    fragility: a.stats.fragility, margin: a.stats.fragilityMargin, plateaus: a.plateaus.length,
    // Con la regla anterior habría salido «débil» en vez de este nivel.
    wouldChange: fired && otherCritical === 0 && ORDER.indexOf(a.verdict.level) > 1,
  };
}

if (isMainThread) {
  const [split = 'calib', pol] = process.argv.slice(2);
  const base = split === 'exam5' ? 5001 : split === 'exam4' ? 4001 : split === 'exam3' ? 3001 : split === 'exam2' ? 2001 : split === 'test' ? 1001 : 1;
  const { SCENARIOS } = await import('./sim.js');
  const tasks = [];
  for (const s of SCENARIOS) for (let k = 0; k < 100; k++) tasks.push({ scenario: s, seed: base + k });
  const policy = pol ? JSON.parse(pol) : null;
  const tag = policy ? `-pf${policy.gates.minProfitFactor}` : '';
  const out = path.join(HERE, 'results', `${split}-orden-tabla${tag}.jsonl`);
  fs.writeFileSync(out, '');
  const rows = [];
  await Promise.all(Array.from({ length: Math.min(os.cpus().length, tasks.length) }, () => new Promise((resolve) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { policy } });
    const next = () => { const t = tasks.shift(); if (!t) { w.terminate(); resolve(); return; } w.postMessage(t); };
    w.on('message', (r) => { rows.push(r); fs.appendFileSync(out, JSON.stringify(r) + '\n'); next(); });
    w.on('error', (e) => { console.error(e); next(); });
    next();
  })));
  for (const [name, inGroup] of [['sin ventaja (S1, S2, S5)', (r) => NO_EDGE.has(r.scenario)], ['con ventaja (S3, S4, S6, S7, S8)', (r) => !NO_EDGE.has(r.scenario)]]) {
    const g = rows.filter(inGroup);
    const fired = g.filter((r) => r.fired);
    console.log(`${name}: ${g.length} casos · salta el aviso: ${fired.length} · sin otro crítico: ${fired.filter((r) => r.otherCritical === 0).length} · nivel que cambiaría: ${g.filter((r) => r.wouldChange).length}`);
  }
  const fired = rows.filter((r) => r.fired);
  console.log(`Dentro del margen de error del 50 %: ${fired.filter((r) => r.fragility - r.margin < 0.5).length} de ${fired.length}`);
  console.log(`-> ${path.relative(process.cwd(), out)}`);
} else {
  parentPort.on('message', async (t) => {
    try { parentPort.postMessage(await evaluateCase(t.scenario, t.seed, workerData.policy)); } catch (e) { parentPort.postMessage({ ...t, fatal: String(e && e.stack ? e.stack : e).slice(0, 300) }); }
  });
}
