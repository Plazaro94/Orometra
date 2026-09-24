// Pruebas de la validacion en periodo no visto.
//
//   node tests/unseen.test.js
//
// Lo que hay que demostrar: que el contraste mide NORMALIDAD y no excelencia, y que
// corrige por duracion. Esto ultimo es lo que separa el metodo de mirarlo a ojo.

import { runAnalysis } from '../core/analysis.js';
import { evaluateUnseen, buildReference } from '../core/unseen.js';
import { buildDemoTables } from '../js/demo.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}
function section(t) { console.log(`\n${'='.repeat(70)}\n${t}\n${'='.repeat(70)}`); }

const demo = buildDemoTables();
const analysis = runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable });
const plateau = analysis.plateaus[0];
const ref = buildReference(analysis, plateau);
const rep = plateau.record;

section('1. Referencia');
console.log(`  meseta de ${plateau.size} configs -> ${ref.observations.length} observaciones (IS + forward), mediana ${Math.round(ref.medianTrades)} operaciones`);
check('la referencia usa toda la meseta, no solo el representante', ref.observations.length > 10, String(ref.observations.length));
check('recoge los dos periodos', ref.periods.join(',') === 'is,oos', ref.periods.join(','));

section('2. Un tramo NORMAL debe aprobar aunque los numeros no deslumbren');
{
  // Mismas metricas por operacion que el representante, pero periodo corto.
  const trades = Math.round(rep.oos.trades * 0.35);
  const r = evaluateUnseen(analysis, plateau, {
    trades,
    profit: (rep.oos.profit / rep.oos.trades) * trades,
    profitFactor: rep.oos.profitFactor,
    drawdown: rep.oos.drawdown * Math.sqrt(trades / rep.oos.trades),
    recoveryFactor: rep.oos.recoveryFactor * Math.sqrt(trades / rep.oos.trades),
    sharpe: rep.oos.sharpe,
  });
  console.log(`  ${trades} operaciones -> ${r.level}: ${r.headline}`);
  check('lo reconoce como normal', r.level === 'normal', `${r.level}: ${r.headline}`);
}

section('3. LA TRAMPA: el mismo drawdown en dos periodos de distinta duracion');
{
  // El drawdown tipico del EA, medido a la duracion habitual de la referencia.
  const ddNorm = ref.observations.map((o) => o.drawdown / Math.sqrt(o.trades)).filter(Number.isFinite).sort((a, b) => a - b);
  const ddTipico = ddNorm[Math.floor(ddNorm.length / 2)] * Math.sqrt(ref.medianTrades);
  const base = {
    profitFactor: rep.oos.profitFactor,
    recoveryFactor: rep.oos.recoveryFactor,
    sharpe: rep.oos.sharpe,
  };
  const porOperacion = rep.oos.profit / rep.oos.trades;

  const largo = Math.round(ref.medianTrades);
  const corto = Math.round(ref.medianTrades * 0.25);

  const rLargo = evaluateUnseen(analysis, plateau, {
    ...base, trades: largo, profit: porOperacion * largo, drawdown: ddTipico,
  });
  const rCorto = evaluateUnseen(analysis, plateau, {
    ...base, trades: corto, profit: porOperacion * corto, drawdown: ddTipico,
  });
  const ddL = rLargo.results.find((x) => x.key === 'drawdown');
  const ddC = rCorto.results.find((x) => x.key === 'drawdown');
  console.log(`  drawdown observado: ${ddTipico.toFixed(2)} % en AMBOS casos`);
  console.log(`   con ${largo} operaciones -> banda ${ddL.band.q10.toFixed(2)}-${ddL.band.q90.toFixed(2)} % => ${ddL.status}`);
  console.log(`   con ${corto} operaciones -> banda ${ddC.band.q10.toFixed(2)}-${ddC.band.q90.toFixed(2)} % => ${ddC.status}`);

  check('corrige el drawdown por duracion', ddC.scaled === true);
  check('la banda se estrecha al acortar el periodo', ddC.band.q90 < ddL.band.q90,
    `corto q90=${ddC.band.q90.toFixed(2)} vs largo q90=${ddL.band.q90.toFixed(2)}`);
  check('a su duracion habitual, ese drawdown es normal', ddL.status === 'normal', ddL.status);
  // El mismo numero, en un tramo cuatro veces mas corto, ya no es normal: mirado a ojo
  // pareceria tranquilizador ("igual que siempre") y es justo lo contrario.
  check('el MISMO drawdown en un tramo corto deja de ser normal', ddC.status !== 'normal', ddC.status);
  check('y el veredicto lo recoge', rCorto.level !== 'go', rCorto.level);
}

section('4. Un tramo claramente malo debe salir fuera de rango');
{
  const trades = Math.round(rep.oos.trades * 0.4);
  const r = evaluateUnseen(analysis, plateau, {
    trades,
    profit: -Math.abs(rep.oos.profit) * 0.2,
    profitFactor: 0.78,
    drawdown: rep.oos.drawdown * 3,
    recoveryFactor: -0.4,
    sharpe: -1.1,
  });
  console.log(`  -> ${r.level}: ${r.headline}`);
  check('lo marca como fuera de rango', r.level === 'outside', r.level);
  check('senala varias metricas', r.results.filter((x) => x.status === 'fuera').length >= 2,
    r.results.map((x) => `${x.key}:${x.status}`).join(' '));
}

section('5. Potencia: con muy pocas operaciones hay que decir que no se detecta nada');
{
  const r = evaluateUnseen(analysis, plateau, {
    trades: 12,
    profit: (rep.oos.profit / rep.oos.trades) * 12,
    profitFactor: rep.oos.profitFactor,
    drawdown: rep.oos.drawdown * Math.sqrt(12 / rep.oos.trades),
    recoveryFactor: rep.oos.recoveryFactor * Math.sqrt(12 / rep.oos.trades),
    sharpe: rep.oos.sharpe,
  });
  check('avisa de potencia insuficiente', r.lowPower === true);
  check('lo dice en las notas', r.notes.some((n) => /potencia/i.test(n)), r.notes.join(' | '));
}

section('6. Errores de uso');
{
  let msg = '';
  try { evaluateUnseen(analysis, plateau, { profitFactor: 1.2 }); } catch (e) { msg = e.message; }
  check('exige el numero de operaciones', /operaciones/i.test(msg), msg);
}

section(failures ? `RESULTADO: ${checks - failures}/${checks} — ${failures} FALLO(S)` : `RESULTADO: ${checks}/${checks} correctas`);
process.exit(failures ? 1 : 0);
