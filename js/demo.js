// Generador de ejemplo SINTETICO.
//
// Representa un EA deliberadamente BUENO: su funcion es enseñar el recorrido completo
// de la aplicacion hasta un veredicto favorable. Esta calibrado para superar los
// mínimos por defecto (PF >= 1,20 y DD <= 20 % en ambos periodos) en una región amplia
// alrededor del centro plantado, y para fallarlos fuera de ella.
//
// El prototipo anterior traia un "ejemplo" con cifras escritas a mano que no salian
// de ningún calculo (y que ademas emparejaban mal los Pass con sus resultados). Aquí
// se generan datos de verdad, con una meseta plantada en un sitio conocido y picos
// de ruido, para poder comprobar que el motor encuentra lo uno y descarta lo otro.

import { makeRng } from '../core/rng.js';

const PARAMS = [
  { name: 'InpFastMA', values: [8, 10, 12, 14, 16, 18] },
  { name: 'InpSlowMA', values: [40, 50, 60, 70, 80, 90, 100] },
  { name: 'InpATR_SL', values: [1, 1.5, 2, 2.5, 3, 3.5] },
  { name: 'InpATR_TP', values: [1, 2, 3, 4, 5, 6] },
  { name: 'InpTrailStart', values: [0.5, 1, 1.5, 2, 2.5] },
  { name: 'InpMinBodyPct', values: [10, 20, 30, 40] },
];

// Centro de la meseta real, en índices de nivel.
const CENTER = [3, 3, 2, 3, 2, 1];

const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

function metrics(goodness, noise, tradesBase) {
  const g = Math.max(0, Math.min(1.1, goodness));
  return {
    profit: Math.round(170000 * g - 14000 + noise * 9000),
    payoff: Number((140 * g - 12 + noise * 8).toFixed(4)),
    profitFactor: Number((1.05 + 0.35 * g + noise * 0.02).toFixed(6)),
    recoveryFactor: Number((4.5 * g + noise * 0.25).toFixed(6)),
    sharpe: Number((3.2 * g + noise * 0.25).toFixed(6)),
    drawdown: Number(Math.max(3, 4 + 28 * (1 - g) + noise * 2.5).toFixed(4)),
    trades: Math.max(20, Math.round(tradesBase * (0.65 + 0.7 * g))),
  };
}

/**
 * Devuelve las dos tablas ya parseadas, con la misma forma que produce el lector
 * para un export real de MT5.
 */
export function buildDemoTables() {
  const rng = makeRng(20260919);
  const isHeaders = ['Pass', 'Result', 'Profit', 'Expected Payoff', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Custom', 'Equity DD %', 'Trades', ...PARAMS.map((p) => p.name)];
  const oosHeaders = ['Pass', 'Forward Result', 'Back Result', 'Profit', 'Expected Payoff', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Custom', 'Equity DD %', 'Trades', ...PARAMS.map((p) => p.name)];
  const isRows = [];
  const oosRows = [];

  const dims = PARAMS.map((p) => p.values.length);
  const totals = dims.reduce((a, b) => a * b, 1);
  let pass = 0;
  for (let flat = 0; flat < totals; flat++) {
    let rem = flat;
    const z = dims.map((d) => {
      const v = rem % d;
      rem = Math.floor(rem / d);
      return v;
    });
    // Meseta ancha y suave alrededor del centro, más un leve gradiente lateral.
    const dist = z.reduce((s, v, j) => s + ((v - CENTER[j]) / 2.9) ** 2, 0);
    const base = Math.exp(-dist / 2);
    // Un pico de ruido cada ~180 configuraciones, siempre lejos del centro.
    const isSpike = base < 0.55 && rng() < 0.006;
    const nz = gauss(rng) * 0.09;

    const isGood = base * 0.98 + nz * 0.25;
    // Los picos varian entre 0,90 y 0,99 segun la pasada. Con un 0,97 fijo todos daban el
    // mismo Forward Result (79,66) y la tabla de descartes parecia rota. La variacion no
    // consume el generador: el resto del ejemplo sale identico.
    const spikeGood = 0.9 + 0.09 * (((pass * 7919) % 101) / 100);
    const oosGood = isSpike ? spikeGood : base * 0.86 + gauss(rng) * 0.1;

    const mi = metrics(isGood, nz, 1500);
    const mo = metrics(oosGood, gauss(rng) * 0.09, 780);
    const isResult = Number((4 + 78 * Math.max(0, isGood)).toFixed(2));
    const oosResult = Number((4 + 78 * Math.max(0, oosGood)).toFixed(2));
    const values = z.map((v, j) => PARAMS[j].values[v]);

    isRows.push([pass, isResult, mi.profit, mi.payoff, mi.profitFactor, mi.recoveryFactor, mi.sharpe, 0, mi.drawdown, mi.trades, ...values]);
    oosRows.push([pass, oosResult, isResult, mo.profit, mo.payoff, mo.profitFactor, mo.recoveryFactor, mo.sharpe, 0, mo.drawdown, mo.trades, ...values]);
    pass++;
  }

  return {
    isTable: { name: 'DEMO-IS.xls', sheet: 'Tester Optimizator Results', format: 'sintético', headers: isHeaders, rows: isRows },
    oosTable: { name: 'DEMO-OOS.xls', sheet: 'Tester Optimizator Results', format: 'sintético', headers: oosHeaders, rows: oosRows },
    truth: {
      center: Object.fromEntries(PARAMS.map((p, j) => [p.name, p.values[CENTER[j]]])),
      note: 'Datos generados por la aplicación, no son de un EA real. La meseta está plantada en el centro indicado.',
    },
  };
}

// ---------------------------------------------------------------- ejemplo sin ventaja
//
// El caso contrario: un EA SIN ninguna ventaja real. Cada operación es ruido puro (media
// cero, colas gruesas) y lo único que distingue a unas configuraciones de otras es la
// suerte de cada periodo, que en el optimizado se agrupa por zonas (bultos suaves, como en
// el banco de pruebas, escenario S2 de bench/PREREGISTRO.md) y en el forward es otra.
// La tabla de MT5 sale igual de vistosa que con un EA bueno; lo que tiene que verse es
// que Orometra no encuentra nada que la respalde.
//
// Las métricas se calculan a partir de las operaciones simuladas, como las calcula MT5. El
// forward, como el de MT5, solo trae el 25 % mejor del periodo optimizado por su criterio
// (aquí, el balance).

const NOEDGE_PARAMS = [
  { name: 'InpRSIPeriod', values: [8, 10, 12, 14, 16, 18, 20, 22] },
  { name: 'InpOversold', values: [20, 22, 24, 26, 28, 30, 32, 34] },
  { name: 'InpStopPips', values: [20, 30, 40, 50, 60, 70] },
  { name: 'InpTakePips', values: [20, 40, 60, 80, 100, 120] },
];
// Semilla de un caso típico: en 15 de 16 semillas probadas sale «débil» y sin meseta, como
// esta; en la otra, «moderada» (las falsas alarmas del banco rondan esa proporción).
const NOEDGE_SEED = 20261011;
const DEPOSIT = 10000;
const TRADE_SD = 100;

function normal(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

// t de Student con 4 grados de libertad, reescalada a varianza 1.
function t4(rng) {
  const z = normal(rng);
  let c = 0;
  for (let k = 0; k < 4; k++) { const n = normal(rng); c += n * n; }
  return z / Math.sqrt(c / 4) / Math.SQRT2;
}

// Suerte de un periodo: suma de bultos de signo al azar, en pasos de la rejilla.
function luckField(rng, dims, amp) {
  const bumps = Array.from({ length: 6 }, () => ({
    c: dims.map((d) => rng() * (d - 1)),
    w: dims.map(() => 1 + 2 * rng()),
    a: normal(rng) * amp,
  }));
  return (z) => bumps.reduce((s, b) => s + b.a * Math.exp(-z.reduce((q, v, j) => q + ((v - b.c[j]) / b.w[j]) ** 2, 0) / 2), 0);
}

function simulate(rng, mu, trades, years) {
  let eq = DEPOSIT;
  let peak = DEPOSIT;
  let ddAbs = 0;
  let ddPct = 0;
  let win = 0;
  let loss = 0;
  let sum = 0;
  let sum2 = 0;
  for (let i = 0; i < trades; i++) {
    const x = TRADE_SD * (mu + t4(rng));
    sum += x;
    sum2 += x * x;
    if (x >= 0) win += x; else loss -= x;
    eq += x;
    if (eq > peak) peak = eq;
    ddAbs = Math.max(ddAbs, peak - eq);
    ddPct = Math.max(ddPct, peak > 0 ? (100 * (peak - eq)) / peak : 100);
  }
  const mean = sum / trades;
  const sd = Math.sqrt(Math.max(1e-12, sum2 / trades - mean * mean));
  const r2 = (v) => Math.round(v * 100) / 100;
  return {
    profit: r2(sum),
    payoff: r2(mean),
    profitFactor: r2(loss > 0 ? win / loss : 99),
    recoveryFactor: r2(ddAbs > 0 ? sum / ddAbs : 99),
    sharpe: r2((mean / sd) * Math.sqrt(trades / years)),
    drawdown: r2(Math.min(100, ddPct)),
    trades,
  };
}

/** Las dos tablas del ejemplo sin ventaja, con la misma forma que las de buildDemoTables. */
export function buildNoEdgeDemoTables() {
  const rng = makeRng(NOEDGE_SEED);
  const dims = NOEDGE_PARAMS.map((p) => p.values.length);
  const luckIs = luckField(rng, dims, 0.1);
  const luckOos = luckField(rng, dims, 0.1);
  const rows = [];
  const total = dims.reduce((a, b) => a * b, 1);
  for (let flat = 0; flat < total; flat++) {
    let rem = flat;
    const z = dims.map((d) => { const v = rem % d; rem = Math.floor(rem / d); return v; });
    // Más operaciones con periodos de RSI cortos (±20 %), como haría un EA de verdad.
    const tradesIs = Math.round(420 * (1.2 - 0.4 * (z[0] / (dims[0] - 1))));
    rows.push({
      pass: flat,
      values: z.map((v, j) => NOEDGE_PARAMS[j].values[v]),
      is: simulate(rng, luckIs(z), tradesIs, 3),
      oos: simulate(rng, luckOos(z), Math.round(tradesIs * 0.4), 1),
    });
  }
  const isHeaders = ['Pass', 'Result', 'Profit', 'Expected Payoff', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Custom', 'Equity DD %', 'Trades', ...NOEDGE_PARAMS.map((p) => p.name)];
  const oosHeaders = ['Pass', 'Forward Result', 'Back Result', 'Profit', 'Expected Payoff', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Custom', 'Equity DD %', 'Trades', ...NOEDGE_PARAMS.map((p) => p.name)];
  const metricsRow = (m) => [m.profit, m.payoff, m.profitFactor, m.recoveryFactor, m.sharpe, 0, m.drawdown, m.trades];
  const isRows = rows.map((r) => [r.pass, DEPOSIT + r.is.profit, ...metricsRow(r.is), ...r.values]);
  const forward = rows.slice().sort((a, b) => b.is.profit - a.is.profit).slice(0, Math.round(0.25 * rows.length));
  const oosRows = forward.map((r) => [r.pass, DEPOSIT + r.oos.profit, DEPOSIT + r.is.profit, ...metricsRow(r.oos), ...r.values]);
  return {
    isTable: { name: 'DEMO-SIN-VENTAJA-IS.xls', sheet: 'Tester Optimizator Results', format: 'sintético', headers: isHeaders, rows: isRows },
    oosTable: { name: 'DEMO-SIN-VENTAJA-OOS.xls', sheet: 'Tester Optimizator Results', format: 'sintético', headers: oosHeaders, rows: oosRows },
    truth: {
      kind: 'noedge',
      center: null,
      note: 'Datos generados por la aplicación, no son de un EA real. Ninguna configuración tiene ventaja real.',
    },
  };
}
