// Pruebas de respuesta conocida para core/matrix.
//
// CSCV/PBO real, DSR publicado y walk-forward multiventana vivieron aquí, con sus
// pruebas. Se retiraron junto con la sonda MQL5 que les daba de comer (curva de
// equity por configuración); ver core/matrix/index.js y docs/CHANGELOG.md.

import {
  applyCostStress,
  breakEvenExtraCostPerTrade,
  stationaryBootstrap,
  sampleAudit,
  dataWarnings,
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

section('Sample audit');
{
  const good = Array.from({ length: 200 }, () => 0.01);
  const aud = sampleAudit(good, { nTrials: 1 });
  check('muestra ok en serie clara', aud.verdictHint === 'sample_ok');

  const flat = Array.from({ length: 20 }, () => 0);
  const audFlat = sampleAudit(flat, { nTrials: 1 });
  check('muestra insuficiente sin ventaja', audFlat.verdictHint === 'insufficient_evidence');
}

section('Aviso de swap');
{
  const heavy = dataWarnings({ swapPctOfPnl: 0.2 });
  check('avisa si el swap domina', heavy.some((w) => w.code === 'SWAP_DOMINANCE'));

  const light = dataWarnings({ swapPctOfPnl: 0.01 });
  check('no avisa si el swap es marginal', !light.some((w) => w.code === 'SWAP_DOMINANCE'));
}

console.log(`\nRESULTADO: ${checks - failures}/${checks}`);
if (failures) process.exit(1);
