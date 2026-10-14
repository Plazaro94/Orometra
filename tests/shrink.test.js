// Expectativa ajustada por selección (core/shrink.js) y cuantil del máximo
// (core/stats.js, maxQuantileZ): pruebas de respuesta conocida.
//
//   node tests/shrink.test.js

import { selectionShrinkage } from '../core/shrink.js';
import { maxQuantileZ, expectedMaxZ, normInv } from '../core/stats.js';
import { makeRng } from '../core/rng.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}
function section(t) { console.log(`\n${'='.repeat(70)}\n${t}\n${'='.repeat(70)}`); }

function gauss(rng) {
  const u = Math.max(1e-12, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

// Familia sintética con verdad conocida: theta ~ N(0, tau), ruido por periodo con
// varianza k / T. Bloques de 5 configuraciones que comparten la misma theta, como
// vecinas en una meseta.
function family({ n = 20000, tau = 1, kI = 400, kO = 400, ti = 100, to = 50, muI = 3, muO = 1, keep = 1, seed = 7 }) {
  const rng = makeRng(seed);
  const items = [];
  const theta = [];
  for (let i = 0; i < n; i++) {
    const th = (i % 5 === 0 || !theta.length) ? tau * gauss(rng) : theta[theta.length - 1];
    theta.push(th);
    const xi = muI + th + Math.sqrt(kI / ti) * gauss(rng);
    const xo = muO + th + Math.sqrt(kO / to) * gauss(rng);
    items.push({ xi, xo, ti, to, block: Math.floor(i / 5) });
  }
  // Preselección como la de MT5: solo las mejores del in-sample tienen forward.
  if (keep < 1) {
    const cut = [...items].map((it) => it.xi).sort((a, b) => b - a)[Math.floor(keep * n) - 1];
    for (const it of items) if (it.xi < cut) it.xo = NaN;
  }
  return { items, theta };
}

section('Cuantil del máximo de N normales');
check('N = 1: es el cuantil de una normal', Math.abs(maxQuantileZ(1, 0.95) - normInv(0.95)) < 1e-9);
check('N = 2: Φ⁻¹(√0,95) = 1,9545', Math.abs(maxQuantileZ(2, 0.95) - 1.95450833) < 1e-6, String(maxQuantileZ(2, 0.95)));
{
  // Monte Carlo: con N = 200 y sin ventaja, el máximo supera el cuantil 0,95 un 5 % de las
  // veces, y supera su MEDIA en torno al 43 % (por eso la media no sirve de umbral).
  const rng = makeRng(11);
  const N = 200;
  const reps = 20000;
  const q95 = maxQuantileZ(N, 0.95);
  const em = expectedMaxZ(N);
  let over95 = 0;
  let overMean = 0;
  for (let r = 0; r < reps; r++) {
    let m = -Infinity;
    for (let i = 0; i < N; i++) m = Math.max(m, gauss(rng));
    if (m > q95) over95++;
    if (m > em) overMean++;
  }
  const p95 = over95 / reps;
  const pm = overMean / reps;
  check('sin ventaja, el máximo supera el cuantil 0,95 un 5 % (±1 %)', Math.abs(p95 - 0.05) < 0.01, p95.toFixed(4));
  check('sin ventaja, el máximo supera su media entre el 38 % y el 48 %', pm > 0.38 && pm < 0.48, pm.toFixed(4));
}

section('Encogimiento: recupera la fiabilidad conocida');
{
  // Var(X_I) = tau^2 + kI/ti = 1 + 4 = 5 -> beta = 0,2. Ruido del forward kO/to = 8.
  const { items } = family({});
  const s = selectionShrinkage({ items, targets: [0], reps: 100 });
  check('usable', s.usable);
  check('beta ≈ 0,2', Math.abs(s.beta - 0.2) < 0.03, s.beta.toFixed(3));
  check('nivel de la familia en el forward ≈ 1', Math.abs(s.family - 1) < 0.1, s.family.toFixed(3));
  check('el IC de beta contiene 0,2', s.betaLo < 0.2 && s.betaHi > 0.2, `${s.betaLo.toFixed(3)}–${s.betaHi.toFixed(3)}`);
  // Normal exacta: Var(θ|X_I) = 1·4/5 = 0,8; m = 1 + 0,2·2 = 1,4; peso del forward
  // 0,8 / (0,8 + 8); esperado = 1,4 + 0,0909·(3 − 1,4) = 1,545 = 1 + (8·2 + 4·2)/44.
  const it = { xi: 3 + 2, xo: 1 + 2, ti: 100, to: 50, block: -1 };
  const s2 = selectionShrinkage({ items: [...items, it], targets: [items.length], reps: 100 });
  const expTrue = 1 + (8 * 2 + 4 * 2) / 44;
  check('esperado de un punto conocido ≈ 1 + (8·2 + 4·2)/44', Math.abs(s2.predictions[0].expected - expTrue) < 0.06,
    `${s2.predictions[0].expected.toFixed(3)} frente a ${expTrue.toFixed(3)}`);
}

section('Encogimiento: preselección del forward (solo el 30 % mejor in-sample)');
{
  const { items } = family({ keep: 0.3, seed: 9 });
  const s = selectionShrinkage({ items, targets: [], reps: 100 });
  check('beta sigue ≈ 0,2 pese a la preselección', Math.abs(s.beta - 0.2) < 0.04, s.beta.toFixed(3));
  check('nivel de la familia ≈ 1 (no el de las preseleccionadas)', Math.abs(s.family - 1) < 0.15, s.family.toFixed(3));
}

section('Encogimiento: ruido puro');
{
  const { items } = family({ tau: 0, seed: 13 });
  const best = items.reduce((b, it, i) => (it.xi + it.xo > items[b].xi + items[b].xo ? i : b), 0);
  const s = selectionShrinkage({ items, targets: [best], reps: 200 });
  check('beta ≈ 0', Math.abs(s.beta) < 0.03, s.beta.toFixed(3));
  check('el IC de beta contiene 0', s.betaLo <= 0 && s.betaHi >= 0, `${s.betaLo.toFixed(3)}–${s.betaHi.toFixed(3)}`);
  const p = s.predictions[0];
  check('la mejor de 20.000 por suerte se encoge casi a la familia', Math.abs(p.expected - 1) < 0.25,
    `observado ${items[best].xo.toFixed(2)}, esperado ${p.expected.toFixed(2)}`);
  check('y no se distingue de ella (límite inferior ≤ 0)', p.ownLo <= 0, p.ownLo.toFixed(3));
}

section('Encogimiento: la mejor elegida, frente a su cifra cruda');
{
  // 60 familias; en cada una se elige la mejor por IS + forward. Error frente a la
  // verdad (muO + theta) de la cifra cruda del forward y de la encogida.
  let errRaw = 0;
  let errShr = 0;
  let below = 0;
  const F = 60;
  for (let f = 0; f < F; f++) {
    const { items, theta } = family({ n: 2000, seed: 100 + f });
    const best = items.reduce((b, it, i) => (it.xi + it.xo > items[b].xi + items[b].xo ? i : b), 0);
    const s = selectionShrinkage({ items, targets: [best], reps: 100, seed: f });
    const truth = 1 + theta[best];
    errRaw += (items[best].xo - truth) ** 2;
    errShr += (s.predictions[0].expected - truth) ** 2;
    if (theta[best] < s.predictions[0].ownLo) below++;
  }
  const rmseRaw = Math.sqrt(errRaw / F);
  const rmseShr = Math.sqrt(errShr / F);
  check('el error encogido es menos de la mitad del crudo', rmseShr < 0.5 * rmseRaw, `${rmseShr.toFixed(2)} frente a ${rmseRaw.toFixed(2)}`);
  // Límite inferior de la ventaja propia: con el modelo bien especificado, la verdad cae
  // por debajo en torno al 2,5 % de las veces.
  check('la ventaja verdadera queda bajo el límite inferior como mucho 4 de 60 veces', below <= 4, `${below} de ${F}`);
}

section('Determinismo y casos sin datos');
{
  const { items } = family({ n: 3000, seed: 21 });
  const a = selectionShrinkage({ items, targets: [5], reps: 50 });
  const b = selectionShrinkage({ items, targets: [5], reps: 50 });
  check('misma semilla, mismo resultado', a.betaLo === b.betaLo && a.predictions[0].ownLo === b.predictions[0].ownLo);
  check('pocas configuraciones: no usable', !selectionShrinkage({ items: items.slice(0, 20), targets: [] }).usable);
  const noFwd = items.map((it) => ({ ...it, xo: NaN }));
  check('sin forward: no usable', !selectionShrinkage({ items: noFwd, targets: [] }).usable);
}

console.log(`\n${checks - failures}/${checks} comprobaciones correctas`);
if (failures) process.exit(1);
