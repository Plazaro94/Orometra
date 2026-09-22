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

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
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
    const oosGood = isSpike ? 0.97 : base * 0.86 + gauss(rng) * 0.1;

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
      note: 'Datos generados por la aplicacion, no son de un EA real. La meseta esta plantada en el centro indicado.',
    },
  };
}
