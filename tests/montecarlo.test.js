// Pruebas de respuesta conocida para core/trades/montecarlo.js (Monte Carlo predictivo).
// El banco que decide si se enseña en la app es otro: bench/PREREGISTRO-MONTECARLO.md.

import { packDays, daysFromDeals, blockLengthPPW, predictiveMonteCarlo, pitSorted, chi2Cdf, ljungBox, robustPortmanteau, volatilityClustering, calibratedMonteCarlo } from '../core/trades/montecarlo.js';
import { makeRng } from '../core/rng.js';

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
function gauss(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
function ar1(phi, n, seed) {
  const r = makeRng(seed); const x = []; let e = 0;
  for (let i = 0; i < n; i++) { e = phi * e + gauss(r); x.push(e); }
  return x;
}

section('Longitud de bloque (Politis-White con la corrección de 2009)');
{
  // Para un AR(1) el bloque óptimo del bootstrap estacionario tiene forma cerrada:
  // G/g = 2φ/(1−φ²) y b = (G/g)^(2/3) · n^(1/3). Con muchos datos el estimador debe acercarse.
  for (const phi of [0.3, 0.5]) {
    const n = 20000;
    const theory = Math.pow((2 * phi) / (1 - phi * phi), 2 / 3) * Math.cbrt(n);
    const est = [1, 2, 3].map((s) => blockLengthPPW(ar1(phi, n, 1000 + s)));
    const avg = est.reduce((a, v) => a + v, 0) / est.length;
    check(`AR(1) φ = ${phi}, n = 20.000: bloque cerca del teórico (${theory.toFixed(1)})`,
      Math.abs(avg / theory - 1) < 0.2, est.map((v) => v.toFixed(1)).join(', '));
  }
  const iid = [1, 2, 3, 4, 5].map((s) => blockLengthPPW(ar1(0, 2000, 50 + s)));
  check('datos independientes: bloque corto (≤ 3)', iid.every((b) => b >= 1 && b <= 3), iid.map((v) => v.toFixed(2)).join(', '));
  const big = blockLengthPPW(ar1(0.99, 300, 7));
  check('nunca pasa de min(3√n, n/3)', big <= Math.ceil(Math.min(3 * Math.sqrt(300), 100)), String(big));
  check('serie constante: bloque 1', blockLengthPPW(new Array(100).fill(3)) === 1);
}

section('Casos con respuesta exacta');
{
  const flat = packDays(Array.from({ length: 50 }, () => [2]));
  const r = predictiveMonteCarlo(flat, { horizon: 20, sims: 500, seed: 1 });
  check('días idénticos: el resultado es H × 2 en todas las simulaciones', r.total.p05 === 40 && r.total.p95 === 40, JSON.stringify(r.total));
  check('días idénticos y positivos: drawdown 0', r.maxDd.p95 === 0);
  check('días idénticos y positivos: probabilidad de pérdida 0', r.probLoss === 0);

  // El drawdown se mide operación a operación: un día +10, −30, +25 suma +5, pero cae 30.
  const intraday = packDays([[10, -30, 25], [10, -30, 25]]);
  const i1 = predictiveMonteCarlo(intraday, { horizon: 1, sims: 200, seed: 2 });
  check('drawdown dentro del día: 30, no 0', i1.maxDd.p50 === 30, String(i1.maxDd.p50));

  // Log-rendimientos: con un rendimiento constante, el resultado es exp(H·r) − 1.
  const lr = Math.log(1.01);
  const lg = predictiveMonteCarlo(packDays(Array.from({ length: 30 }, () => [lr])), { horizon: 10, sims: 100, seed: 3, log: true });
  check('modo log: resultado = 1,01^10 − 1', Math.abs(lg.total.p50 - (1.01 ** 10 - 1)) < 1e-12, String(lg.total.p50));
  const lgDown = predictiveMonteCarlo(packDays(Array.from({ length: 30 }, () => [Math.log(0.99)])), { horizon: 10, sims: 100, seed: 3, log: true });
  check('modo log: drawdown relativo = 1 − 0,99^10', Math.abs(lgDown.maxDd.p50 - (1 - 0.99 ** 10)) < 1e-12, String(lgDown.maxDd.p50));

  check('horizonte mayor que la muestra: no se calcula', !predictiveMonteCarlo(flat, { horizon: 51 }).usable);
}

section('Determinismo');
{
  const x = packDays(ar1(0.2, 300, 9).map((v) => [v]));
  const a = predictiveMonteCarlo(x, { horizon: 126, sims: 2000, seed: 42, ddLevels: [10] });
  const b = predictiveMonteCarlo(x, { horizon: 126, sims: 2000, seed: 42, ddLevels: [10] });
  check('misma semilla, mismo resultado', JSON.stringify(a) === JSON.stringify(b));
  const c = predictiveMonteCarlo(x, { horizon: 126, sims: 2000, seed: 43, ddLevels: [10] });
  check('otra semilla, otro resultado', JSON.stringify(a) !== JSON.stringify(c));
  const bayes1 = predictiveMonteCarlo(x, { horizon: 126, sims: 1000, seed: 42, method: 'bayes-direct' });
  const bayes2 = predictiveMonteCarlo(x, { horizon: 126, sims: 1000, seed: 42, method: 'bayes-direct' });
  check('bayesiano: misma semilla, mismo resultado', JSON.stringify(bayes1) === JSON.stringify(bayes2));
}

section('Calibración con verdad conocida (dos etapas, sin bloques, datos normales)');
{
  // Con datos independientes, el predictivo en dos etapas debe dejar fuera del P05–P95 un
  // ~10 % de los futuros; el plug-in, un 24,5 % (docs/MONTECARLO.md, sección 2).
  const cases = 300; const n = 100; let out = 0; let ddOver = 0;
  for (let c = 0; c < cases; c++) {
    const r = makeRng(77 + c * 131);
    const x = Array.from({ length: n }, () => 0.05 + gauss(r));
    const fut = Array.from({ length: n }, () => 0.05 + gauss(r));
    const mc = predictiveMonteCarlo(packDays(x.map((v) => [v])), { horizon: n, sims: 1000, seed: c + 1, block: 1 });
    const total = fut.reduce((a, v) => a + v, 0);
    let s = 0; let pk = 0; let dd = 0;
    for (const v of fut) { s += v; if (s > pk) pk = s; if (pk - s > dd) dd = pk - s; }
    if (total < mc.total.p05 || total > mc.total.p95) out++;
    if (dd > mc.maxDd.p95) ddOver++;
  }
  check('resultado futuro fuera del P05–P95 entre un 6 % y un 14 %', out / cases >= 0.06 && out / cases <= 0.14, `${(100 * out / cases).toFixed(1)} %`);
  check('drawdown futuro por encima del p95 entre un 2 % y un 8 %', ddOver / cases >= 0.02 && ddOver / cases <= 0.08, `${(100 * ddOver / cases).toFixed(1)} %`);
}

section('Días a partir de las operaciones del informe');
{
  const deals = [
    { time: '2025.01.03 10:00:00', net: 100, balance: 10100 },
    { time: '2025.01.03 15:00:00', net: -50, balance: 10050 },
    { time: '2025.01.08 11:00:00', net: 201, balance: 10251 },
  ];
  const m = daysFromDeals(deals, 'money');
  check('viernes 3, lunes 6, martes 7 (vacíos) y miércoles 8', m.dates.join(',') === '2025-01-03,2025-01-06,2025-01-07,2025-01-08', m.dates.join(','));
  check('el orden dentro del día se conserva', m.days[0].join(',') === '100,-50');
  check('los días sin cierres quedan vacíos', m.days[1].length === 0 && m.days[2].length === 0);
  const l = daysFromDeals(deals, 'log');
  check('modo log: ln(1 + 100 / 10.000)', Math.abs(l.days[0][0] - Math.log(1.01)) < 1e-12, String(l.days[0][0]));
  check('modo log: ln(1 − 50 / 10.100)', Math.abs(l.days[0][1] - Math.log(1 - 50 / 10100)) < 1e-12);
  check('sin fecha reconocible: no usable', !daysFromDeals([{ time: 'x', net: 1 }]).usable);
  check('modo log sin balance: no usable', !daysFromDeals([{ time: '2025.01.03', net: 1 }], 'log').usable);
}

section('PIT (calibración probabilística)');
{
  const s = Float64Array.from([1, 2, 3, 4]);
  check('PIT entre valores: 2,5 → 0,5', pitSorted(s, 2.5, 0.3) === 0.5);
  check('PIT con empate: y = 2, V = 0,5 → 0,375', pitSorted(s, 2, 0.5) === 0.375);
  check('PIT por debajo de todo: 0; por encima: 1', pitSorted(s, 0, 0.9) === 0 && pitSorted(s, 9, 0.1) === 1);
  // Con datos normales independientes y sin bloques, el PIT del resultado futuro bajo M2 debe
  // repartirse por igual entre los diez décimos.
  const dec = new Array(10).fill(0); const cases = 400; const n = 100; const H = 50;
  for (let c = 0; c < cases; c++) {
    const r = makeRng(9001 + c * 17);
    const x = Array.from({ length: n + H }, () => 0.05 + gauss(r));
    let tot = 0; let pk = 0; let dd = 0;
    for (let i = n; i < n + H; i++) { tot += x[i]; if (tot > pk) pk = tot; else if (pk - tot > dd) dd = pk - tot; }
    const mc = predictiveMonteCarlo(packDays(x.slice(0, n).map((v) => [v])), { horizon: H, sims: 1000, seed: c + 3, block: 1, method: 'bayes-direct', observe: { total: tot, dd } });
    dec[Math.min(9, Math.floor(mc.pit.total * 10))]++;
  }
  check('PIT del resultado repartido (cada décimo entre un 6 % y un 14 %)', dec.every((k) => k / cases >= 0.06 && k / cases <= 0.14), dec.join(','));
}

section('Detector de rachas (Ljung-Box)');
{
  check('χ²(10): P(≤ 18,307) = 0,95', Math.abs(chi2Cdf(18.307, 10) - 0.95) < 1e-4, String(chi2Cdf(18.307, 10)));
  check('χ²(1): P(≤ 3,841) = 0,95', Math.abs(chi2Cdf(3.8415, 1) - 0.95) < 1e-4, String(chi2Cdf(3.8415, 1)));
  check('χ²(2): P(≤ 2) = 1 − e⁻¹', Math.abs(chi2Cdf(2, 2) - (1 - Math.exp(-1))) < 1e-12);
  check('χ²(30): P(≤ 43,773) = 0,95', Math.abs(chi2Cdf(43.773, 30) - 0.95) < 1e-4, String(chi2Cdf(43.773, 30)));
  let rejIid = 0; let rejAr = 0;
  for (let c = 0; c < 400; c++) {
    if (ljungBox(ar1(0, 252, 300 + c), 10).p < 0.05) rejIid++;
    if (ljungBox(ar1(0.3, 252, 900 + c), 10).p < 0.05) rejAr++;
  }
  check('independientes: rechaza en torno a un 5 % (entre 2 % y 9 %)', rejIid / 400 >= 0.02 && rejIid / 400 <= 0.09, `${(100 * rejIid / 400).toFixed(1)} %`);
  check('AR(1) φ = 0,3 con un año: rechaza casi siempre (> 90 %)', rejAr / 400 > 0.9, `${(100 * rejAr / 400).toFixed(1)} %`);
}

section('Detector de rachas robusto (Dalla, Giraitis y Phillips, 2020)');
{
  // Volatilidad agrupada sin autocorrelación (GARCH): el clásico rechaza de más; el robusto, ~5 %.
  const garch = (seed, n) => { const r = makeRng(seed); const o = []; let h = 1; let e = 0; for (let i = 0; i < 300 + n; i++) { h = 0.05 + 0.1 * e * e + 0.85 * h; e = Math.sqrt(h) * gauss(r); if (i >= 300) o.push(e); } return o; };
  let lb = 0; let rob = 0; let robIid = 0; let robAr = 0;
  for (let c = 0; c < 400; c++) {
    const g = garch(5000 + c, 1008);
    if (ljungBox(g, 10).p < 0.05) lb++;
    if (robustPortmanteau(g, 10).p < 0.05) rob++;
    if (robustPortmanteau(ar1(0, 252, 6000 + c), 10).p < 0.05) robIid++;
    if (robustPortmanteau(ar1(0.3, 252, 7000 + c), 10).p < 0.05) robAr++;
  }
  check('GARCH sin autocorrelación: el clásico rechaza de más (> 10 %)', lb / 400 > 0.1, `${(100 * lb / 400).toFixed(1)} %`);
  check('GARCH sin autocorrelación: el robusto rechaza entre un 2 % y un 9 %', rob / 400 >= 0.02 && rob / 400 <= 0.09, `${(100 * rob / 400).toFixed(1)} %`);
  check('independientes: el robusto rechaza entre un 2 % y un 9 %', robIid / 400 >= 0.02 && robIid / 400 <= 0.09, `${(100 * robIid / 400).toFixed(1)} %`);
  check('AR(1) φ = 0,3 con un año: el robusto rechaza casi siempre (> 85 %)', robAr / 400 > 0.85, `${(100 * robAr / 400).toFixed(1)} %`);
}

section('M2b: bootstrap bayesiano sin contar dos veces la incertidumbre');
{
  // Datos normales independientes, n = 252, H = 126, sin bloques: el resultado futuro debe caer
  // fuera del P05–P95 un ~10 % de las veces. La versión anterior (M2) daba un 5,9 %: contaba dos
  // veces la incertidumbre (enmienda 5). La teoría para ese error, con H = n/2, da un 5,7 %.
  let out = 0; const C = 400; const n = 252; const H = 126;
  for (let c = 0; c < C; c++) {
    const r = makeRng(5000 + c * 13);
    const x = Array.from({ length: n + H }, () => 0.05 + gauss(r));
    const fut = x.slice(n).reduce((a, v) => a + v, 0);
    const t = predictiveMonteCarlo(packDays(x.slice(0, n).map((v) => [v])), { horizon: H, sims: 1000, seed: c + 1, block: 1, method: 'bayes-direct' }).total;
    if (fut < t.p05 || fut > t.p95) out++;
  }
  check('resultado fuera del P05–P95 entre un 7 % y un 13 %', out / C >= 0.07 && out / C <= 0.13, `${(100 * out / C).toFixed(1)} %`);
  check('método desconocido: error claro', (() => { try { predictiveMonteCarlo(packDays([[1], [2]]), { method: 'bayes' }); return false; } catch { return true; } })());
}

section('Detector de volatilidad agrupada (McLeod y Li, 1983)');
{
  const garch = (seed, n) => { const r = makeRng(seed); const o = []; let h = 1; let e = 0; for (let i = 0; i < 300 + n; i++) { h = 0.05 + 0.1 * e * e + 0.85 * h; e = Math.sqrt(h) * gauss(r); if (i >= 300) o.push(e); } return o; };
  let g = 0; let iid = 0;
  for (let c = 0; c < 300; c++) {
    if (volatilityClustering(garch(8000 + c, 1008), 10).p < 0.05) g++;
    if (volatilityClustering(ar1(0, 1008, 9000 + c), 10).p < 0.05) iid++;
  }
  check('GARCH con cuatro años: lo detecta casi siempre (> 95 %)', g / 300 > 0.95, `${(100 * g / 300).toFixed(1)} %`);
  check('independientes: rechaza entre un 2 % y un 9 %', iid / 300 >= 0.02 && iid / 300 <= 0.09, `${(100 * iid / 300).toFixed(1)} %`);
}

section('M2bc: nivel calibrado por doble bootstrap');
{
  const x = packDays(ar1(0, 120, 4242).map((v) => [0.05 + v]));
  const o = { horizon: 60, sims: 2000, seed: 5, outer: 40, inner: 200, ddLevels: [5, 10] };
  const a = calibratedMonteCarlo(x, o);
  const b = calibratedMonteCarlo(x, o);
  check('misma semilla, mismo resultado', JSON.stringify(a) === JSON.stringify(b));
  check('cuantiles ordenados', a.total.p05 <= a.total.p50 && a.total.p50 <= a.total.p95 && a.maxDd.p50 <= a.maxDd.p95);
  check('probabilidades entre 0 y 1', a.probLoss >= 0 && a.probLoss <= 1 && a.probDd.every((d) => d.p >= 0 && d.p <= 1));
  check('P(drawdown ≥ 10) ≤ P(drawdown ≥ 5)', a.probDd[1].p <= a.probDd[0].p);
}

console.log(`\nRESULTADO: ${checks - failures}/${checks}`);
if (failures) process.exit(1);
