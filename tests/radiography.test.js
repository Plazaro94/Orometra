// Pruebas de respuesta conocida para core/trades/radiography.js (la radiografía del backtest:
// los mismos días en otro orden). No es una previsión; ver docs/MONTECARLO.md.

import { orderRadiography, MIN_TRADES } from '../core/trades/radiography.js';
import { makeRng } from '../core/rng.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}
function section(t) { console.log(`\n=== ${t} ===`); }
function gauss(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }

section('Casos con respuesta exacta');
{
  const losses = Array.from({ length: 40 }, () => [-1]);
  const a = orderRadiography(losses, { sims: 200, seed: 1 });
  check('40 pérdidas de 1: drawdown 40 en cualquier orden', a.real.maxDd === 40 && a.maxDd.p05 === 40 && a.maxDd.p95 === 40);
  check('40 pérdidas de 1: racha de 40 en cualquier orden', a.real.longestLosingStreak === 40 && a.longestLosingStreak.p50 === 40);

  const mixed = Array.from({ length: 60 }, (_, i) => [i % 3 === 0 ? -2 : 1.5]);
  const b = orderRadiography(mixed, { sims: 300, seed: 2 });
  const total = mixed.reduce((s, d) => s + d[0], 0);
  check('todas las curvas acaban en el resultado total', b.curves.every((c) => Math.abs(c[c.length - 1] - total) < 1e-9), String(total));
  check('las bandas acaban también en el total', Math.abs(b.bands.p05[b.bands.p05.length - 1] - total) < 1e-9 && Math.abs(b.bands.p95[b.bands.p95.length - 1] - total) < 1e-9);
  check('la curva real acaba en el total', Math.abs(b.real.curve[b.real.curve.length - 1] - total) < 1e-9);

  // El orden dentro del día se conserva: un día +10, −30, +25 cae 30 aunque sume +5.
  const intraday = [[10, -30, 25], ...Array.from({ length: 30 }, () => [0.1])];
  const c = orderRadiography(intraday, { sims: 100, seed: 3 });
  check('drawdown dentro del día: al menos 30 en cualquier orden', c.maxDd.p05 >= 30 - 1e-9, String(c.maxDd.p05));

  const few = Array.from({ length: MIN_TRADES - 1 }, () => [1]);
  check(`menos de ${MIN_TRADES} operaciones: no se calcula`, !orderRadiography(few).usable);
  check('los días vacíos no cuentan como operaciones', !orderRadiography([...few, [], [], []]).usable);

  const lr = Math.log(1.01);
  const d = orderRadiography(Array.from({ length: 40 }, () => [lr]), { sims: 50, seed: 4, log: true });
  check('modo log: resultado total = 1,01^40 − 1', Math.abs(d.total - (1.01 ** 40 - 1)) < 1e-12);
}

section('Determinismo');
{
  const r = makeRng(7);
  const days = Array.from({ length: 80 }, () => [gauss(r)]);
  const a = orderRadiography(days, { sims: 300, seed: 9 });
  const b = orderRadiography(days, { sims: 300, seed: 9 });
  check('misma semilla, mismo resultado', JSON.stringify(a) === JSON.stringify(b));
}

section('Exactitud: con días intercambiables, el percentil del drawdown real es uniforme');
{
  // Si los días son independientes e igualmente repartidos, el orden real es uno más entre
  // todos los posibles: el percentil de su drawdown se reparte por igual entre los décimos.
  const dec = new Array(10).fill(0); const C = 400;
  for (let c = 0; c < C; c++) {
    const r = makeRng(1000 + c * 31);
    const days = Array.from({ length: 100 }, () => [0.05 + gauss(r)]);
    const x = orderRadiography(days, { sims: 400, seed: c + 1, curves: 0 });
    dec[Math.min(9, Math.floor(x.ddPercentile * 10))]++;
  }
  check('cada décimo entre un 6 % y un 14 %', dec.every((k) => k / C >= 0.06 && k / C <= 0.14), dec.join(','));
}

section('Con rachas deja de ser exacta (por eso se aplican las puertas)');
{
  // Con resultados en rachas, el orden real concentra las pérdidas: su drawdown suele ser de los
  // peores entre las permutaciones, que rompen las rachas.
  let top = 0; const C = 300;
  for (let c = 0; c < C; c++) {
    const r = makeRng(5000 + c * 17); let e = 0;
    const days = Array.from({ length: 150 }, () => { e = 0.6 * e + gauss(r); return [e]; });
    if (orderRadiography(days, { sims: 300, seed: c + 1, curves: 0 }).ddPercentile >= 0.9) top++;
  }
  check('AR(1) φ = 0,6: el drawdown real cae en el décimo de arriba mucho más de un 10 % (> 30 %)', top / C > 0.3, `${(100 * top / C).toFixed(1)} %`);
}

console.log(`\nRESULTADO: ${checks - failures}/${checks}`);
if (failures) process.exit(1);
