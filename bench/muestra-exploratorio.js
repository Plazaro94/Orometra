// Estudio EXPLORATORIO (no prerregistrado; ver docs/MONTECARLO.md): ¿qué tal se portan las
// cifras de «¿Alcanza la muestra?» del periodo no visto (core/trades/sample.js) con verdad
// conocida?
//
//   node bench/muestra-exploratorio.js
//
// Tabla C: el intervalo del 90 % del resultado diario medio (`meanConfidenceInterval`),
//   ¿deja fuera la media verdadera un 10 % de las veces?
// Tabla D: «¿se distingue de cero?» (`sampleAudit(...).verdictHint === 'sample_ok'`):
//   con media 0, cuántas veces dice que sí (falso positivo); con media 0,1, cuántas acierta.

import { meanConfidenceInterval, sampleAudit } from '../core/trades/sample.js';
import { makeRng } from '../core/rng.js';

function gauss(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
function tt(r, nu) { let s = 0; for (let i = 0; i < nu; i++) { const g = gauss(r); s += g * g; } return gauss(r) / Math.sqrt(s / nu); }
const GEN = {
  'iid normal': (r, n, m) => Array.from({ length: n }, () => m + gauss(r)),
  t3: (r, n, m) => Array.from({ length: n }, () => m + tt(r, 3) / Math.sqrt(3)),
  'AR(1) 0,3': (r, n, m) => { const o = []; let e = gauss(r); for (let i = 0; i < n; i++) { e = 0.3 * e + Math.sqrt(0.91) * gauss(r); o.push(m + e); } return o; },
  GARCH: (r, n, m) => { const o = []; let h = 1; let x = 0; for (let i = 0; i < 300 + n; i++) { h = 0.05 + 0.1 * x * x + 0.85 * h; x = Math.sqrt(h) * gauss(r); if (i >= 300) o.push(m + x); } return o; },
  'EA disperso': (r, n, m) => Array.from({ length: n }, () => (r() < 0.7 ? 0 : m / 0.3 + tt(r, 4) / Math.sqrt(2) / Math.sqrt(0.3))),
};
const NS = [63, 126, 252, 504];

console.log('TABLA C — intervalo del 90 % del resultado diario medio: % de casos que dejan fuera la media verdadera (ideal 10 %). 400 casos, 1.000 simulaciones, media 0,05.');
for (const [g, gen] of Object.entries(GEN)) {
  const row = NS.map((n) => {
    let miss = 0;
    for (let c = 0; c < 400; c++) {
      const x = gen(makeRng(31337 * c + n + g.length), n, 0.05);
      const ci = meanConfidenceInterval(x, { sims: 1000, seed: c + 1 }).ci;
      if (0.05 < ci.p05 || 0.05 > ci.p95) miss++;
    }
    return `n=${n}: ${(100 * miss / 400).toFixed(1)} %`;
  });
  console.log(`${g} | ${row.join(' | ')}`);
}

console.log('\nTABLA D — «se distingue de cero» (2.000 casos por celda).');
for (const mu of [0, 0.1]) {
  console.log(mu === 0 ? 'media 0 (% = falsos positivos)' : 'media 0,1 (% = aciertos)');
  for (const [g, gen] of Object.entries(GEN)) {
    const row = NS.map((n) => {
      let ok = 0;
      for (let c = 0; c < 2000; c++) {
        const x = gen(makeRng(7777 * c + n + g.length + mu * 1e6), n, mu);
        if (sampleAudit(x, { sims: 20 }).verdictHint === 'sample_ok') ok++;
      }
      return `n=${n}: ${(100 * ok / 2000).toFixed(1)} %`;
    });
    console.log(`${g} | ${row.join(' | ')}`);
  }
}
