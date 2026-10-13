// Estudio EXPLORATORIO (no prerregistrado; ver docs/MONTECARLO.md): ¿están calibrados los
// cuantiles del Monte Carlo cuando se comparan con un periodo FUTURO del mismo proceso?
//
//   node bench/montecarlo-exploratorio.js [casos] [simulaciones]     (por defecto 300 1000)
//
// Verdad conocida: se genera una serie diaria de n días (lo que el usuario tendría) y,
// aparte, otros n días del mismo proceso (el futuro, que solo conoce el estudio). Se mide
// con qué frecuencia el futuro cae fuera de lo que el método dijo:
//   - drawdown máximo futuro > p95 del método   (objetivo: 5 %)
//   - resultado total futuro fuera del P05–P95   (objetivo: 10 %)
//
// Tabla A: el método de la app (core/trades/bootstrap.js, tal cual) frente al predictivo en
// dos etapas, con cinco procesos. Tabla B: variantes (una o dos etapas; bloque 1, √n, 2√n o
// fijo) para ver de dónde sale la falta de cobertura. Todo es determinista.

import { stationaryBootstrap } from '../core/trades/bootstrap.js';
import { makeRng } from '../core/rng.js';

const CASES = Number(process.argv[2] || 300);
const SIMS = Number(process.argv[3] || 1000);
const MU = 0.05; // media diaria en desviaciones típicas (Sharpe anual ≈ 0,8)

function gauss(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}
function studentT(rng, nu) {
  let s = 0;
  for (let i = 0; i < nu; i++) { const g = gauss(rng); s += g * g; }
  return gauss(rng) / Math.sqrt(s / nu);
}

// Cada generador da una serie diaria con desviación típica ≈ 1 y media `mu`.
const GEN = {
  'iid normal': (rng, len, mu) => Array.from({ length: len }, () => mu + gauss(rng)),
  't3 (colas gruesas)': (rng, len, mu) => Array.from({ length: len }, () => mu + studentT(rng, 3) / Math.sqrt(3)),
  'AR(1) 0,3': (rng, len, mu) => {
    const out = [];
    let e = gauss(rng);
    for (let i = 0; i < len; i++) { e = 0.3 * e + Math.sqrt(1 - 0.09) * gauss(rng); out.push(mu + e); }
    return out;
  },
  'GARCH(1,1)': (rng, len, mu) => {
    const out = [];
    let h = 1; let x = 0;
    for (let i = 0; i < 300 + len; i++) {
      h = 0.05 + 0.1 * x * x + 0.85 * h;
      x = Math.sqrt(h) * gauss(rng);
      if (i >= 300) out.push(mu + x);
    }
    return out;
  },
  'EA disperso (70 % de días a 0)': (rng, len, mu) => Array.from({ length: len }, () => (
    rng() < 0.7 ? 0 : mu / 0.3 + studentT(rng, 4) / Math.sqrt(2) / Math.sqrt(0.3))),
};

function maxDD(path) {
  let s = 0; let peak = 0; let dd = 0;
  for (const v of path) { s += v; if (s > peak) peak = s; if (peak - s > dd) dd = peak - s; }
  return dd;
}
const sum = (a) => { let s = 0; for (const v of a) s += v; return s; };
function q(arr, p) {
  const s = Float64Array.from(arr).sort();
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}
// Un camino de bootstrap estacionario (Politis-Romano) de longitud `len` sobre `x`.
function sbPath(rng, x, len, pRestart) {
  const n = x.length; const out = new Float64Array(len);
  let pos = Math.floor(rng() * n);
  for (let i = 0; i < len; i++) {
    if (i > 0 && rng() < pRestart) pos = Math.floor(rng() * n);
    out[i] = x[pos];
    pos = (pos + 1) % n;
  }
  return out;
}
// stages = 1: plug-in (el futuro sale de la muestra). stages = 2: predictivo (cada simulación
// remuestrea primero un «mundo» de n días y saca el futuro de ese mundo).
function simulate(x, H, block, seed, stages) {
  const rng = makeRng(seed); const p = 1 / block;
  const dd = new Float64Array(SIMS); const tot = new Float64Array(SIMS);
  for (let s = 0; s < SIMS; s++) {
    const world = stages === 2 ? sbPath(rng, x, x.length, p) : x;
    const fut = sbPath(rng, world, H, p);
    dd[s] = maxDD(fut); tot[s] = sum(fut);
  }
  return { dd95: q(dd, 0.95), t05: q(tot, 0.05), t95: q(tot, 0.95) };
}

const pct = (k) => `${(100 * k / CASES).toFixed(1)} %`;
const sqrtBlock = (n) => Math.max(2, Math.round(Math.sqrt(n)));

console.log(`Casos por celda: ${CASES} · simulaciones por caso: ${SIMS} · media diaria ${MU} sd\n`);
console.log('TABLA A — app actual (plug-in, bloque √n) frente a dos etapas (bloque √n). Horizonte H = n.');
console.log('proceso | n | app: DD > p95 | app: total fuera P05–P95 | dos etapas: DD > p95 | dos etapas: total fuera');
for (const [g, gen] of Object.entries(GEN)) {
  for (const n of [63, 126, 252, 504]) {
    const a = { app: [0, 0], two: [0, 0] };
    for (let c = 0; c < CASES; c++) {
      const rng = makeRng(1000003 * c + n * 7 + g.length * 131);
      const x = gen(rng, n, MU);
      const fut = gen(rng, n, MU);
      const fDD = maxDD(fut); const fT = sum(fut);
      const b = stationaryBootstrap(x, { sims: SIMS, seed: c + 1 });
      const app = { dd95: b.maxDdCi.p95, t05: b.returnCi.p05, t95: b.returnCi.p95 };
      const two = simulate(x, n, sqrtBlock(n), c + 77, 2);
      for (const [k, m] of [['app', app], ['two', two]]) {
        if (fDD > m.dd95) a[k][0]++;
        if (fT < m.t05 || fT > m.t95) a[k][1]++;
      }
    }
    console.log(`${g} | ${n} | ${pct(a.app[0])} | ${pct(a.app[1])} | ${pct(a.two[0])} | ${pct(a.two[1])}`);
  }
}

console.log('\nTABLA B — variantes. Horizonte H = n.');
console.log('proceso | n | variante | DD > p95 | total fuera P05–P95');
const VARIANTS = [
  ['plug-in, bloque 1', 1, () => 1],
  ['plug-in, bloque √n', 1, sqrtBlock],
  ['dos etapas, bloque 1', 2, () => 1],
  ['dos etapas, bloque √n', 2, sqrtBlock],
  ['dos etapas, bloque 2√n', 2, (n) => Math.round(2 * Math.sqrt(n))],
  ['dos etapas, bloque 3', 2, () => 3],
  ['dos etapas, bloque 4', 2, () => 4],
  ['dos etapas, bloque 6', 2, () => 6],
];
for (const g of ['iid normal', 'AR(1) 0,3']) {
  for (const n of [63, 252]) {
    const hits = VARIANTS.map(() => [0, 0]);
    for (let c = 0; c < CASES; c++) {
      const rng = makeRng(7919 * c + n + g.length * 31);
      const x = GEN[g](rng, n, MU);
      const fut = GEN[g](rng, n, MU);
      const fDD = maxDD(fut); const fT = sum(fut);
      VARIANTS.forEach(([, stages, block], i) => {
        const r = simulate(x, n, block(n), c + 5, stages);
        if (fDD > r.dd95) hits[i][0]++;
        if (fT < r.t05 || fT > r.t95) hits[i][1]++;
      });
    }
    VARIANTS.forEach(([name], i) => console.log(`${g} | ${n} | ${name} | ${pct(hits[i][0])} | ${pct(hits[i][1])}`));
  }
}
