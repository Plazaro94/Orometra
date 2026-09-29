// Estudio (no forma parte de los criterios prerregistrados): ¿qué tal se porta el contraste
// del periodo no visto (core/unseen.js) con verdad conocida?
//
//   node bench/unseen.js [semillas por escenario]
//
// Para cada caso en que el motor propone meseta, se simula un periodo no visto de la
// configuración elegida: su ventaja verdadera fuera de la muestra (`edgeUnseen`) más una
// suerte propia e independiente de las otras, con las operaciones del forward. Se cuenta
// cuántas veces el contraste dice «normal», «cola» o «fuera».
//   S3/S4/S7/S8  la ventaja se mantiene       -> lo esperable es «normal» casi siempre
//   S6           la ventaja se reduce a la mitad -> conviene que salte a veces
//   S5           no había ventaja fuera del IS  -> conviene que salte casi siempre

import { generateCase, luckField, simulatePeriod, makeRng, hashSeed, OOS_YEARS } from './sim.js';
import { runAnalysis } from '../core/analysis.js';
import { evaluateUnseen } from '../core/unseen.js';
import { setLocale } from '../js/i18n.js';

setLocale('es');
const N = Number(process.argv[2] || 100);
const SCEN = ['S3', 'S4', 'S6', 'S7', 'S8', 'S5', 'S2'];
const out = {};
for (const s of SCEN) {
  const tally = { casos: 0, normal: 0, cola: 0, fuera: 0, mejor: 0, sinResultado: 0 };
  for (let seed = 1; seed <= N; seed++) {
    const c = generateCase(s, seed);
    const a = runAnalysis({ isTable: c.isTable, oosTable: c.oosTable });
    const p = a.plateaus[0];
    if (!p) continue;
    const k = c.key(p.record.params);
    const row = c.rows.find((r) => c.key(r.params) === k);
    if (!row) continue;
    const rng = makeRng(hashSeed(`${s}#${seed}#unseen`));
    const luck = luckField(rng, c.levels, c.meta.luckAmp);
    const trades = Math.max(30, Math.round(row.oos.trades));
    const m = simulatePeriod(rng, row.edgeUnseen + luck(row.z), trades, OOS_YEARS);
    tally.casos++;
    try {
      const r = evaluateUnseen(a, p, {
        trades, profit: m.profit, profitFactor: m.profitFactor, drawdown: m.drawdownPct,
        recoveryFactor: m.recoveryFactor, sharpe: m.sharpe,
      });
      const bad = r.results.some((x) => x.status === 'fuera') ? 'fuera' : r.results.some((x) => x.status === 'cola') ? 'cola' : 'normal';
      tally[bad]++;
      if (bad === 'normal' && r.results.some((x) => x.status === 'mejor')) tally.mejor++;
    } catch { tally.sinResultado++; }
  }
  out[s] = tally;
}
console.log('escenario | casos con meseta | normal | cola | fuera | (normal con alguna «mejor») | sin resultado');
for (const s of SCEN) {
  const t = out[s];
  const pc = (x) => (t.casos ? `${Math.round((100 * x) / t.casos)} %` : '—');
  console.log(`${s.padEnd(9)} | ${String(t.casos).padStart(4)} | ${pc(t.normal).padStart(5)} | ${pc(t.cola).padStart(5)} | ${pc(t.fuera).padStart(5)} | ${pc(t.mejor).padStart(5)} | ${t.sinResultado}`);
}
