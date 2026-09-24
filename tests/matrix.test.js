// Pruebas de respuesta conocida para core/matrix (Fase 4).

import { makeRng } from '../core/rng.js';
import {
  cscvPbo,
  deflatedSharpe,
  effectiveTrials,
  walkForward,
  applyCostStress,
  breakEvenExtraCostPerTrade,
  stationaryBootstrap,
  sampleAudit,
  auditRiskStructure,
} from '../core/matrix/index.js';

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
function section(t) { console.log(`\n=== ${t} ===`); }

function noiseMatrix(T, N, seed) {
  const rng = makeRng(seed);
  const m = [];
  for (let t = 0; t < T; t++) {
    const row = new Array(N);
    for (let j = 0; j < N; j++) row[j] = (rng() - 0.5) * 0.02;
    m.push(row);
  }
  return m;
}

function edgeMatrix(T, N, goodCols, edge = 0.002, seed = 1) {
  const m = noiseMatrix(T, N, seed);
  const good = new Set(goodCols);
  for (let t = 0; t < T; t++) {
    for (let j = 0; j < N; j++) {
      if (good.has(j)) m[t][j] += edge;
    }
  }
  return m;
}

section('CSCV / PBO — ruido vs ventaja');
{
  const noise = noiseMatrix(256, 40, 42);
  const pNoise = cscvPbo(noise, { S: 8, maxCols: 40, seed: 1 });
  check('ruido usable', pNoise.usable);
  check('PBO ruido >= 0.35', pNoise.pbo >= 0.35, String(pNoise.pbo));

  const edge = edgeMatrix(256, 40, [5, 6, 7], 0.01, 7);
  const pEdge = cscvPbo(edge, { S: 8, maxCols: 40, seed: 1 });
  check('ventaja usable', pEdge.usable);
  check('PBO ventaja < PBO ruido', pEdge.pbo < pNoise.pbo, `${pEdge.pbo} vs ${pNoise.pbo}`);
  check('PBO ventaja < 0.45', pEdge.pbo < 0.45, String(pEdge.pbo));
}

section('Effective trials — duplicados');
{
  const T = 100; const N = 20;
  const base = noiseMatrix(T, 1, 9).map((r) => r[0]);
  const m = [];
  for (let t = 0; t < T; t++) {
    const row = [];
    for (let j = 0; j < N; j++) row.push(base[t] + (j < 10 ? 0 : (j * 0.00001)));
    // first 10 nearly identical
    for (let j = 0; j < 10; j++) row[j] = base[t];
    m.push(row);
  }
  const eff = effectiveTrials(m, { threshold: 0.15 });
  check('nRaw = 20', eff.nRaw === 20);
  check('nEffective << nRaw con duplicados', eff.nEffective < 12, String(eff.nEffective));
}

section('DSR');
{
  const rng = makeRng(3);
  const weak = Array.from({ length: 80 }, () => (rng() - 0.5) * 0.01);
  const strong = Array.from({ length: 80 }, () => 0.01 + (rng() - 0.5) * 0.005);
  const dWeak = deflatedSharpe({ returns: weak, nTrials: 100 });
  const dStrong = deflatedSharpe({ returns: strong, nTrials: 5 });
  check('DSR ruido/bajo usable', dWeak.usable);
  check('DSR fuerte > DSR débil', dStrong.dsr > dWeak.dsr, `${dStrong.dsr} vs ${dWeak.dsr}`);
}

section('WFO');
{
  const m = edgeMatrix(200, 15, [3], 0.008, 11);
  const w = walkForward(m, { isLen: 60, oosLen: 20, step: 20, rule: 'maximin' });
  check('WFO usable', w.usable);
  check('hay ventanas', w.windows.length >= 2);
  const picks = w.windows.map((x) => x.chosen);
  const mostlyGood = picks.filter((p) => p === 3).length >= Math.floor(picks.length * 0.3);
  check('elige a menudo la columna buena (o región)', mostlyGood || w.meanEfficiency > 0, JSON.stringify(picks));
}

section('Costes + break-even');
{
  const dailyPnl = [10, 10, 10, 10, 10];
  const dailyTrades = [2, 2, 2, 2, 2];
  const be = breakEvenExtraCostPerTrade(dailyPnl, dailyTrades);
  check('break-even = 5', Math.abs(be.breakEven - 5) < 1e-9, String(be.breakEven));
  const stressed = applyCostStress({
    dailyPnl,
    dailyTrades,
    extraCommissionPerTrade: be.breakEven,
  });
  check('en break-even neto ≈ 0', Math.abs(stressed.stressedNet) < 1e-6, String(stressed.stressedNet));
}

section('Bootstrap determinista');
{
  const rets = Array.from({ length: 100 }, (_, i) => Math.sin(i / 5) * 0.01);
  const a = stationaryBootstrap(rets, { sims: 500, seed: 99, meanBlock: 5 });
  const b = stationaryBootstrap(rets, { sims: 500, seed: 99, meanBlock: 5 });
  check('misma semilla = misma media', a.meanReturn === b.meanReturn);
  check('media sims ~ media serie', Math.abs(a.meanReturn - a.meanOfSeries) < 0.05, `${a.meanReturn} vs ${a.meanOfSeries}`);
}

section('Sample / risk');
{
  const good = Array.from({ length: 200 }, () => 0.01);
  const aud = sampleAudit(good, { nTrials: 1 });
  check('muestra ok en serie clara', aud.verdictHint === 'sample_ok');

  const risk = auditRiskStructure({
    maxConcurrent: 8,
    minLot: 0.01,
    maxLot: 0.08,
    lotVaries: true,
    noStopTrades: 80,
    totalTrades: 100,
  });
  check('veto duro activo', risk.veto);
  check('incluye martingala o grid', risk.hardVetos.some((v) => v.code === 'MARTINGALE_LIKE' || v.code === 'GRID_AVERAGING'));
}

console.log(`\nRESULTADO: ${checks - failures}/${checks}`);
if (failures) process.exit(1);
