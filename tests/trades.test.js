// Pruebas de respuesta conocida para core/trades.
//
// CSCV/PBO real, DSR publicado y walk-forward multiventana vivieron aquí, con sus
// pruebas. Se retiraron junto con la sonda MQL5 que les daba de comer (curva de
// equity por configuración); ver core/trades/index.js y docs/CHANGELOG.md.

import {
  applyCostStress,
  breakEvenExtraCostPerTrade,
  stationaryBootstrap,
  sampleAudit,
  dataWarnings,
} from '../core/trades/index.js';
import { maxDrawdown } from '../core/trades/util.js';
import { minBtl } from '../core/trades/sample.js';

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
  // `meanReturn` es el TOTAL medio de cada camino (n días) y `meanOfSeries` la media
  // diaria: se comparan con la serie desplazada a media 1, para que no coincidan solo
  // porque las dos valgan casi cero.
  const shifted = rets.map((r) => r + 1);
  const c = stationaryBootstrap(shifted, { sims: 500, seed: 99, meanBlock: 5 });
  check('total medio de los caminos ≈ media diaria × días', Math.abs(c.meanReturn / shifted.length - c.meanOfSeries) < 0.01,
    `${c.meanReturn / shifted.length} vs ${c.meanOfSeries}`);
}

section('Drawdown máximo');
{
  check('el capital inicial cuenta como pico: [-100, 50] cae 100', maxDrawdown([-100, 50]) === 100, String(maxDrawdown([-100, 50])));
  check('[-5, -5, -5] cae 15', maxDrawdown([-5, -5, -5]) === 15, String(maxDrawdown([-5, -5, -5])));
  check('[10, -4, 3, -12] cae 13', maxDrawdown([10, -4, 3, -12]) === 13, String(maxDrawdown([10, -4, 3, -12])));
}

section('Sample audit');
{
  const good = Array.from({ length: 200 }, () => 0.01);
  const aud = sampleAudit(good, { nTrials: 1 });
  check('muestra ok en serie clara', aud.verdictHint === 'sample_ok');

  const flat = Array.from({ length: 20 }, () => 0);
  const audFlat = sampleAudit(flat, { nTrials: 1 });
  check('muestra insuficiente sin ventaja', audFlat.verdictHint === 'insufficient_evidence');

  // 20 días con ventaja clara: la potencia sale alta, pero con menos de 30 días no se
  // calcula; el motivo lo dice para que la pantalla no muestre «99 %» y «no se distingue».
  const short = Array.from({ length: 20 }, (_, i) => 1 + (i % 2 ? 0.1 : -0.1));
  const audShort = sampleAudit(short, { nTrials: 1 });
  check('menos de 30 días: insuficiente por pocos días', audShort.verdictHint === 'insufficient_evidence' && audShort.reason === 'few_days', audShort.reason);
  check('con ventaja clara y días de sobra no hay motivo', aud.reason === null, String(aud.reason));
}

section('Aviso de swap');
{
  const heavy = dataWarnings({ swapPctOfPnl: 0.2 });
  check('avisa si el swap domina', heavy.some((w) => w.code === 'SWAP_DOMINANCE'));

  const light = dataWarnings({ swapPctOfPnl: 0.01 });
  check('no avisa si el swap es marginal', !light.some((w) => w.code === 'SWAP_DOMINANCE'));
}

section('Días necesarios: respuesta conocida y coherencia con la potencia');
{
  // n = ceil(((z_0,80 + z_0,95) / SR)²) con un suelo de 30: SR 0,3 → ceil(68,7) = 69.
  check('SR 0,3 por día → 69 días', minBtl({ srObserved: 0.3 }).minObservations === 69, String(minBtl({ srObserved: 0.3 }).minObservations));
  check('SR 0,5 por día → 30 (suelo)', minBtl({ srObserved: 0.5 }).minObservations === 30);
  // Con una sola prueba, potencia >= 80 % y al menos 30 días debe ser «suficiente»: la
  // búsqueda de 10 en 10 dejaba franjas con «potencia 86 %» y «no se distingue de cero».
  let incoherent = 0;
  for (let n = 30; n <= 120; n++) {
    for (const mu of [0.6, 0.9, 1.3, 2, 3]) {
      const r = Array.from({ length: n }, (_, i) => mu + ((i * 7919) % 13) - 6);
      const a = sampleAudit(r);
      if (a.power.power >= 0.8 && a.verdictHint !== 'sample_ok') incoherent++;
    }
  }
  check('potencia ≥ 80 % y ≥ 30 días ⇒ muestra suficiente', incoherent === 0, `${incoherent} casos incoherentes`);
}

console.log(`\nRESULTADO: ${checks - failures}/${checks}`);
if (failures) process.exit(1);
