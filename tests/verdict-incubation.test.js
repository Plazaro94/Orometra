import { integratedVerdict, VERDICT, PROFILES, hashPreregistration } from '../core/verdict-integrated.js';
import { incubationBands, compareIncubation } from '../core/incubation.js';
import { setLocale } from '../js/i18n.js';

setLocale('es');

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}

console.log('\n=== veredicto integrado ===');
{
  const bad = integratedVerdict({
    riskVeto: true,
    costStillProfitableModerate: true,
    pbo: 0.2,
    plateauOk: true,
    sampleInsufficient: false,
    reservedOk: true,
  });
  check('riesgo → discard', bad.level === VERDICT.DISCARD);

  const weak = integratedVerdict({
    riskVeto: false,
    costStillProfitableModerate: true,
    pbo: 0.3,
    plateauOk: true,
    sampleInsufficient: true,
    reservedOk: true,
  });
  check('muestra corta → investigate', weak.level === VERDICT.INVESTIGATE);

  const ok = integratedVerdict({
    riskVeto: false,
    costStillProfitableModerate: true,
    pbo: 0.2,
    dsr: 0.5,
    plateauOk: true,
    sampleInsufficient: false,
    reservedOk: true,
  });
  check('bueno → incubate', ok.level === VERDICT.INCUBATE);
  check('nunca live', ok.neverLive === true);
  check('6 tarjetas', ok.cards.length === 6);

  const h1 = hashPreregistration(PROFILES.standard);
  const h2 = hashPreregistration(PROFILES.standard);
  check('hash estable', h1 === h2);
}

console.log('\n=== incubación ===');
{
  const oos = Array.from({ length: 120 }, (_, i) => 0.002 + Math.sin(i) * 0.001);
  const bands = incubationBands(oos, { sims: 300, seed: 1, minTradesToJudge: 20 });
  check('bandas usable', bands.usable);
  check('recomienda live min lot', bands.recommendLiveMinLot === true);

  const inside = compareIncubation({
    netProfit: bands.horizons.m3.returnCi.p50,
    maxDd: bands.painDd * 0.1,
    trades: 50,
    horizon: 'm3',
  }, bands);
  check('dentro de banda', inside.position === 'inside' || inside.position === 'above' || inside.position === 'below');

  const stop = compareIncubation({
    netProfit: 0,
    maxDd: 1e9,
    trades: 50,
    horizon: 'm3',
  }, bands, { ddPercentile: 0.01 });
  check('alerta stop por DD', stop.alerts.some((a) => a.code === 'STOP_DD'));
}

console.log(`\nRESULTADO: ${checks - failures}/${checks}`);
if (failures) process.exit(1);
