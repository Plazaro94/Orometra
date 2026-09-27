// Estudio: ¿distingue la "sensibilidad combinada" un parametro que influye de uno que no?
//
//   node tools/sensitivity-study.js
//
// No cambia el motor: mide y compara, para decidir con datos (auditoria 2026-09, AUD-11).
// Casos con la verdad conocida: A demo (los 6 influyen), B ruido puro (ninguno),
// C 2 influyen + 2 irrelevantes, D filtro de regimen (P0 se invierte segun P1).
//
// Resultado al escribirlo (27-09-2026):
// - La combinada (mediana del recorrido con todo lo demas fijo) mide RUGOSIDAD LOCAL:
//   con ruido puro sale 0,78-1,28 segun el conjunto, igual o mas que en la demo (0,68-0,87). Con el suelo
//   actual (0,12) todo parametro cuenta como influyente, tambien los irrelevantes.
// - Una nula por barajado NO sirve para la combinada: barajar rompe la suavidad y la nula
//   sale por encima incluso en parametros que influyen.
// - La SUAVIDAD a lo largo del eje (recorrido / salto medio entre niveles contiguos,
//   frente a la misma cifra con la calidad barajada, sobre todas las configuraciones)
//   si separa: efectos claros x1,24-2,54, irrelevantes x0,99-1,07. Pero los efectos
//   debiles se solapan con el ruido (InpTrailStart de la demo x1,05). Usarla para
//   declarar planos parametros cambiaria la demo y trataria como vecinas configuraciones
//   que no lo son; por eso NO esta activada. La interfaz muestra el puesto relativo.

import { buildDemoTables } from '../js/demo.js';
import { runAnalysis } from '../core/analysis.js';
import { conditionalSensitivity, ENGINE_DEFAULTS } from '../core/engine.js';
import { makeRng } from '../core/rng.js';

const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

// Suavidad a lo largo del eje j: en cada linea (todo fijo salvo j, ordenada por nivel)
// recorrido / media |salto entre niveles contiguos|. Ruido ~2; efecto suave ~ (k-1).
function smoothness(coords, levels, scores, mask) {
  return levels.map((lv, j) => {
    if (lv.length < 3) return NaN;
    const groups = new Map();
    coords.forEach((z, i) => {
      if (!Number.isFinite(scores[i]) || (mask && !mask[i])) return;
      const key = z.filter((_, k) => k !== j).join(',');
      let g = groups.get(key); if (!g) groups.set(key, (g = []));
      g.push([z[j], scores[i]]);
    });
    const ratios = [];
    for (const g of groups.values()) {
      if (g.length < 3) continue;
      g.sort((x, y) => x[0] - y[0]);
      let lo = Infinity, hi = -Infinity, adj = 0;
      g.forEach(([, v], t) => { lo = Math.min(lo, v); hi = Math.max(hi, v); if (t) adj += Math.abs(v - g[t - 1][1]); });
      adj /= (g.length - 1);
      if (adj > 1e-9) ratios.push((hi - lo) / adj);
    }
    if (ratios.length < 5) return NaN;
    ratios.sort((x, y) => x - y); return ratios[Math.floor(ratios.length / 2)];
  });
}


// Tablas sinteticas con verdad conocida: goodness(z) decide las metricas.
function synth(dimsLevels, goodness, seed) {
  const r = makeRng(seed);
  const names = dimsLevels.map((_, j) => `P${j}`);
  const isH = ['Pass', 'Result', 'Profit', 'Expected Payoff', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Custom', 'Equity DD %', 'Trades', ...names];
  const oosH = ['Pass', 'Forward Result', 'Back Result', 'Profit', 'Expected Payoff', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Custom', 'Equity DD %', 'Trades', ...names];
  const m = (g) => ({ profit: Math.round(170000 * g - 14000), pf: +(1.05 + 0.35 * g).toFixed(4), rf: +(4.5 * g).toFixed(3), sh: +(3.2 * g).toFixed(3), dd: +(Math.max(3, 4 + 28 * (1 - g))).toFixed(2) });
  const isR = []; const oosR = []; let pass = 0;
  const total = dimsLevels.reduce((a, b) => a * b, 1);
  for (let f = 0; f < total; f++) {
    let rem = f; const z = dimsLevels.map((d) => { const v = rem % d; rem = Math.floor(rem / d); return v; });
    const g0 = goodness(z);
    const gi = Math.max(0, Math.min(1.1, g0 + gauss(r) * 0.06)); const go = Math.max(0, Math.min(1.1, g0 * 0.9 + gauss(r) * 0.08));
    const a = m(gi); const b = m(go); const res = +(4 + 78 * gi).toFixed(2);
    isR.push([pass, res, a.profit, a.profit / 800, a.pf, a.rf, a.sh, 0, a.dd, Math.round(900 + 600 * gi), ...z.map((v) => v + 1)]);
    oosR.push([pass, +(4 + 78 * go).toFixed(2), res, b.profit, b.profit / 800, b.pf, b.rf, b.sh, 0, b.dd, Math.round(450 + 300 * go), ...z.map((v) => v + 1)]);
    pass++;
  }
  return { isTable: { name: 'IS', headers: isH, rows: isR }, oosTable: { name: 'OOS', headers: oosH, rows: oosR } };
}

function measure(label, input, truth) {
  const a = runAnalysis(input);
  const mask = Uint8Array.from(a.records.map((r) => (r.passes ? 1 : 0)));
  const viable = a.scores.filter((s, i) => mask[i] && Number.isFinite(s));
  const useMask = viable.length >= 30 ? mask : null;
  const iqrOf = (v) => { const s = [...v].sort((x, y) => x - y); return s[Math.floor(0.75 * (s.length - 1))] - s[Math.floor(0.25 * (s.length - 1))]; };
  const iqr = Math.max(0.02, iqrOf(useMask ? viable : a.scores.filter(Number.isFinite)));
  const real = conditionalSensitivity(a.coords, a.levels, a.scores, useMask, iqr, ENGINE_DEFAULTS);
  const nulls = a.levels.map(() => []);
  const smReal = smoothness(a.coords, a.levels, a.scores, null);
  const smNull = a.levels.map(() => []);
  for (let k = 0; k < 5; k++) {
    const r = makeRng(1000 + k);
    const idx = a.scores.map((_, i) => i).filter((i) => (!useMask || useMask[i]) && Number.isFinite(a.scores[i]));
    const vals = idx.map((i) => a.scores[i]);
    for (let i = vals.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [vals[i], vals[j]] = [vals[j], vals[i]]; }
    const shuffled = a.scores.slice(); idx.forEach((i, t) => { shuffled[i] = vals[t]; });
    const all = a.scores.map((_, i) => i).filter((i) => Number.isFinite(a.scores[i])); const av = all.map((i) => a.scores[i]);
    for (let i = av.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [av[i], av[j]] = [av[j], av[i]]; }
    const shuffledAll = a.scores.slice(); all.forEach((i, t) => { shuffledAll[i] = av[t]; });
    conditionalSensitivity(a.coords, a.levels, shuffled, useMask, iqr, ENGINE_DEFAULTS).forEach((c, j) => nulls[j].push(c.conditional));
    smoothness(a.coords, a.levels, shuffledAll, null).forEach((v, j) => smNull[j].push(v));
  }
  console.log(`\n== ${label}  (verdict ${a.verdict.level}, plateaus ${a.plateaus.length}, rep ${a.plateaus[0]?.record.id ?? '-'})`);
  console.log('param        truth   marginal  combined   suavidad real / nula   ');
  a.sensitivity.forEach((s, j) => {
    const n = nulls[j].filter(Number.isFinite); const mu = n.reduce((x, y) => x + y, 0) / (n.length || 1);
    const sd = Math.sqrt(n.reduce((x, y) => x + (y - mu) ** 2, 0) / Math.max(1, n.length - 1));
    const c = real[j].conditional;
    const sn = smNull[j].filter(Number.isFinite); const smu = sn.reduce((x, y) => x + y, 0) / (sn.length || 1);
    console.log(`${s.name.padEnd(13)}${String(truth ? truth[j] : '?').padEnd(8)}${(s.sensitivity ?? NaN).toFixed(2).padStart(8)}  ${c.toFixed(2).padStart(8)}    ${smReal[j].toFixed(2)} / ${smu.toFixed(2)}  -> x${(smReal[j] / smu).toFixed(2)}`);
  });
}
const demo = buildDemoTables();
measure('A demo (todos influyen)', { isTable: demo.isTable, oosTable: demo.oosTable }, ['si','si','si','si','si','si']);
{ const r = makeRng(33); const cache = new Map();
  const B = synth([6, 7, 6, 6, 5, 4], (z) => { const k = z.join(','); if (!cache.has(k)) cache.set(k, 0.2 + 0.6 * r()); return cache.get(k); }, 13);
  measure('B ruido puro', B, ['no', 'no', 'no', 'no', 'no', 'no']); }
const C = synth([7, 7, 5, 5], (z) => Math.exp(-(((z[0] - 3) / 2.2) ** 2 + ((z[1] - 3) / 2.2) ** 2) / 2), 11);
measure('C 2 influyen + 2 irrelevantes', C, ['si','si','no','no']);
const Dd = synth([7, 2, 5, 5], (z) => { const x = (z[0] - 3) / 3; return 0.55 + 0.4 * (z[1] ? x : -x) - 0.1 * ((z[2] - 2) / 2) ** 2; }, 12);
measure('D filtro de regimen (P0 se invierte segun P1)', Dd, ['si*','si','si','no']);
