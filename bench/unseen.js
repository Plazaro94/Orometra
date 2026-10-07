// Estudio (no forma parte de los criterios prerregistrados): ¿qué tal se porta el contraste
// del periodo no visto (core/unseen.js) con verdad conocida?
//
//   node bench/unseen.js [semillas por escenario]
//
// Para cada caso en que el motor propone meseta, se simula un periodo no visto de la
// configuración elegida: su ventaja verdadera fuera de la muestra (`edgeUnseen`) más una
// suerte propia e independiente de las otras. Se hace con TRES duraciones (las operaciones
// del forward ×1, ×0,4 y ×0,2), porque un tramo no visto suele ser más corto que el forward
// y la tasa de avisos depende mucho de eso. Se cuenta cuántas veces el contraste avisa
// («cola» o «fuera», que es lo que baja el nivel en la app) y cuántas dice «fuera».
//   S3/S4/S7/S8  la ventaja se mantiene         -> cada aviso es una falsa alarma
//   S6           la ventaja se reduce a la mitad -> conviene que salte a veces
//   S5           no había ventaja fuera del IS   -> conviene que salte casi siempre

import { generateCase, luckField, simulatePeriod, makeRng, hashSeed, OOS_YEARS } from './sim.js';
import { runAnalysis } from '../core/analysis.js';
import { evaluateUnseen } from '../core/unseen.js';
import { setLocale } from '../js/i18n.js';

setLocale('es');
const N = Number(process.argv[2] || 100);
const SCEN = ['S3', 'S4', 'S7', 'S8', 'S6', 'S5'];
const HELD = new Set(['S3', 'S4', 'S7', 'S8']);
const DURATIONS = [1, 0.4, 0.2];
const tally = {};
for (const s of SCEN) {
  for (let seed = 1; seed <= N; seed++) {
    const c = generateCase(s, seed);
    const a = runAnalysis({ isTable: c.isTable, oosTable: c.oosTable });
    const p = a.plateaus[0];
    if (!p) continue;
    const k = c.key(p.record.params);
    const row = c.rows.find((r) => c.key(r.params) === k);
    if (!row) continue;
    for (const f of DURATIONS) {
      const rng = makeRng(hashSeed(`${s}#${seed}#unseen#${f}`));
      const luck = luckField(rng, c.levels, c.meta.luckAmp);
      const trades = Math.max(30, Math.round(row.oos.trades * f));
      // Misma frecuencia de operaciones que el forward: menos operaciones, menos años.
      const years = (OOS_YEARS * trades) / Math.max(1, row.oos.trades);
      const m = simulatePeriod(rng, row.edgeUnseen + luck(row.z), trades, years);
      const group = HELD.has(s) ? 'ventaja intacta (S3/S4/S7/S8)' : s === 'S6' ? 'ventaja a la mitad (S6)' : 'sin ventaja (S5)';
      const t = (tally[`${group}|${f}`] ||= { casos: 0, aviso: 0, fuera: 0, sinResultado: 0 });
      t.casos++;
      try {
        const r = evaluateUnseen(a, p, {
          trades, profit: m.profit, profitFactor: m.profitFactor, drawdown: m.drawdownPct,
          recoveryFactor: m.recoveryFactor, sharpe: m.sharpe,
        });
        if (r.level !== 'normal') t.aviso++;
        if (r.level === 'outside') t.fuera++;
      } catch { t.sinResultado++; }
    }
  }
}
console.log('grupo | duración (× forward) | casos | avisa (cola o fuera) | fuera');
for (const group of ['ventaja intacta (S3/S4/S7/S8)', 'ventaja a la mitad (S6)', 'sin ventaja (S5)']) {
  for (const f of DURATIONS) {
    const t = tally[`${group}|${f}`];
    if (!t) continue;
    const n = t.casos - t.sinResultado;
    const pc = (x) => (n ? `${Math.round((100 * x) / n)} %` : '—');
    console.log(`${group.padEnd(30)} | ×${String(f).padEnd(3)} | ${String(n).padStart(4)} | ${pc(t.aviso).padStart(5)} | ${pc(t.fuera).padStart(5)}`);
  }
}
