// Generador de optimizaciones sintéticas con VERDAD CONOCIDA (ver bench/PREREGISTRO.md).
//
// Cada caso produce:
//   - isTable / oosTable con la forma de un export de MT5 (el forward solo trae el 25 %
//     mejor del in-sample, como hace MT5);
//   - truth: para cada configuración probada, su media verdadera por operación en un
//     periodo NO VISTO (`edgeUnseen`), que solo conoce el banco.
//
// Todo es determinista a partir de (escenario, semilla).

export const DEPOSIT = 10000;
export const TRADE_SD = 100; // desviación típica de una operación, en moneda
export const IS_YEARS = 3;
export const OOS_YEARS = 1;

// ---------------------------------------------------------------- aleatoriedad
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function normal(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const uni = (rng, a, b) => a + (b - a) * rng();
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
// t de Student con 4 grados de libertad, reescalada a varianza 1 (colas gruesas).
function t4(rng) {
  const z = normal(rng);
  let c = 0;
  for (let k = 0; k < 4; k++) { const n = normal(rng); c += n * n; }
  return z / Math.sqrt(c / 4) / Math.SQRT2;
}

// ---------------------------------------------------------------- rejilla
function makeGrid(rng, dims) {
  const levels = [];
  for (let d = 0; d < dims; d++) {
    const n = Math.floor(uni(rng, 6, 12.999));
    const start = pick(rng, [1, 2, 5, 10, 14]);
    const step = pick(rng, [1, 2, 5]);
    levels.push(Array.from({ length: n }, (_, k) => start + k * step));
  }
  return levels;
}
function allCoords(levels) {
  const out = [[]];
  for (const lv of levels) {
    const next = [];
    for (const c of out) for (let k = 0; k < lv.length; k++) next.push([...c, k]);
    out.length = 0;
    out.push(...next);
  }
  return out;
}
const REAL_GRID = [[5, 7], [3, 5, 7], [3, 4, 5], [0.75, 1, 1.25], [1, 1.5, 2], [1, 1.5, 2, 2.5, 3]];

// ---------------------------------------------------------------- superficies
// Bulto gaussiano en coordenadas de rejilla (pasos), con anchura por dimensión.
function bump(z, center, width) {
  let s = 0;
  for (let j = 0; j < z.length; j++) s += ((z[j] - center[j]) / width[j]) ** 2;
  return Math.exp(-s / 2);
}
function randomCenter(rng, levels, margin = 1) {
  return levels.map((lv) => uni(rng, Math.min(margin, (lv.length - 1) / 2), Math.max(lv.length - 1 - margin, (lv.length - 1) / 2)));
}
// Suerte de un periodo: suma de bultos de signo aleatorio. Correlacionada en el espacio.
export function luckField(rng, levels, amp) {
  if (!amp) return () => 0;
  const k = Math.floor(uni(rng, 3, 8.999));
  const bumps = Array.from({ length: k }, () => ({
    c: levels.map((lv) => uni(rng, 0, lv.length - 1)),
    w: levels.map(() => uni(rng, 1, 3)),
    a: normal(rng) * amp,
  }));
  return (z) => bumps.reduce((s, b) => s + b.a * bump(z, b.c, b.w), 0);
}

// ---------------------------------------------------------------- operaciones -> métricas MT5
export function simulatePeriod(rng, mu, trades, years) {
  let eq = DEPOSIT;
  let peak = DEPOSIT;
  let maxDdAbs = 0;
  let maxDdPct = 0;
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
    const dd = peak - eq;
    if (dd > maxDdAbs) maxDdAbs = dd;
    const ddp = peak > 0 ? (100 * dd) / peak : 100;
    if (ddp > maxDdPct) maxDdPct = ddp;
  }
  const mean = sum / trades;
  const sd = Math.sqrt(Math.max(1e-12, sum2 / trades - mean * mean));
  return {
    profit: sum,
    profitFactor: loss > 0 ? win / loss : 99,
    expectedPayoff: mean,
    recoveryFactor: maxDdAbs > 0 ? sum / maxDdAbs : 99,
    sharpe: (mean / sd) * Math.sqrt(trades / years),
    drawdownPct: Math.min(100, maxDdPct),
    trades,
  };
}

// ---------------------------------------------------------------- escenarios
export const SCENARIOS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'];
export const NO_EDGE = new Set(['S1', 'S2', 'S5']);

/**
 * @returns {{ isTable, oosTable, truth, meta }}
 *   truth.byKey: Map "v1|v2|..." -> { edgeUnseen, edgeIs }
 */
export function generateCase(scenario, seed) {
  const rng = makeRng(hashSeed(`${scenario}#${seed}`));
  const real = scenario === 'S8';
  const levels = real ? REAL_GRID.map((l) => l.slice()) : makeGrid(rng, Math.floor(uni(rng, 2, 4.999)));
  // Rejillas de más de ~1.500 configuraciones se recortan quitando niveles del final.
  if (!real) {
    let size = levels.reduce((a, l) => a * l.length, 1);
    while (size > 1500) {
      const j = levels.reduce((bi, l, i) => (l.length > levels[bi].length ? i : bi), 0);
      levels[j].pop();
      size = levels.reduce((a, l) => a * l.length, 1);
    }
  }
  const coords = allCoords(levels);
  const dims = levels.length;
  const tradesIs = Math.round(uni(rng, 150, 600));
  const oosRatio = uni(rng, 0.25, 0.5);
  const luckAmp = scenario === 'S1' ? 0 : uni(rng, 0.04, 0.12);
  const A = uni(rng, 0.1, 0.35); // ventaja de la meseta, en desviaciones por operación
  const width = levels.map((lv) => (real ? uni(rng, 1, 2) : uni(rng, 2, Math.max(2.2, Math.min(4, (lv.length - 1) / 2)))));
  const center = randomCenter(rng, levels, real ? 0.5 : 1);
  const broad = (z) => A * bump(z, center, width);

  let edgeIs;
  let edgeOos;
  let edgeUnseen;
  if (scenario === 'S1' || scenario === 'S2') {
    edgeIs = () => 0; edgeOos = () => 0; edgeUnseen = () => 0;
  } else if (scenario === 'S4') {
    const c2 = randomCenter(rng, levels, 1);
    const wN = levels.map(() => uni(rng, 0.6, 1.0));
    const B = A * uni(rng, 1.3, 2.0);
    edgeIs = (z) => Math.max(broad(z), B * bump(z, c2, wN));
    edgeOos = broad; edgeUnseen = broad;
  } else if (scenario === 'S5') {
    edgeIs = broad; edgeOos = () => 0; edgeUnseen = () => 0;
  } else if (scenario === 'S6') {
    edgeIs = broad; edgeOos = (z) => 0.5 * broad(z); edgeUnseen = (z) => 0.5 * broad(z);
  } else {
    edgeIs = broad; edgeOos = broad; edgeUnseen = broad;
  }
  const luckIs = luckField(rng, levels, luckAmp);
  const luckOos = luckField(rng, levels, luckAmp);
  // El número de operaciones varía de forma suave con el primer parámetro (±20 %).
  const tradesOf = (z, base) => Math.max(20, Math.round(base * (0.8 + 0.4 * (z[0] / Math.max(1, levels[0].length - 1)))));

  // Simular todas las configuraciones (el genético elige después cuáles "se probaron").
  let rows = coords.map((z) => {
    const tIs = tradesOf(z, tradesIs);
    const tOos = tradesOf(z, tradesIs * oosRatio);
    return {
      z,
      params: z.map((k, j) => levels[j][k]),
      is: simulatePeriod(rng, edgeIs(z) + luckIs(z), tIs, IS_YEARS),
      oos: simulatePeriod(rng, edgeOos(z) + luckOos(z), tOos, OOS_YEARS),
      edgeUnseen: edgeUnseen(z),
      edgeIs: edgeIs(z),
    };
  });
  if (scenario === 'S7') {
    // Genético: 20-35 % de la rejilla, sesgado hacia lo que puntúa alto en el in-sample
    // (70 %) con algo de exploración uniforme (30 %).
    const frac = uni(rng, 0.2, 0.35);
    const n = Math.min(rows.length, Math.max(40, Math.round(frac * rows.length)));
    const order = rows.map((r, i) => i).sort((a, b) => rows[b].is.profit - rows[a].is.profit);
    const rankOf = new Map(order.map((idx, k) => [idx, k / rows.length]));
    const w = rows.map((_, i) => 0.3 + 0.7 * Math.exp(-4 * rankOf.get(i)));
    const chosen = new Set();
    while (chosen.size < n) {
      let t = rng() * w.reduce((a, b, i) => a + (chosen.has(i) ? 0 : b), 0);
      for (let i = 0; i < rows.length; i++) {
        if (chosen.has(i)) continue;
        t -= w[i];
        if (t <= 0) { chosen.add(i); break; }
      }
    }
    rows = rows.filter((_, i) => chosen.has(i));
  }

  const names = levels.map((_, j) => `InpP${j + 1}`);
  const isH = ['Pass', 'Result', 'Profit', 'Expected Payoff', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Equity DD %', 'Trades', ...names];
  const oosH = ['Pass', 'Forward Result', 'Back Result', 'Profit', 'Expected Payoff', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Equity DD %', 'Trades', ...names];
  const r2 = (v) => Math.round(v * 100) / 100;
  const isRows = rows.map((r, i) => [i, r2(DEPOSIT + r.is.profit), r2(r.is.profit), r2(r.is.expectedPayoff), r2(r.is.profitFactor), r2(r.is.recoveryFactor), r2(r.is.sharpe), r2(r.is.drawdownPct), r.is.trades, ...r.params]);
  // Forward como el de MT5: solo el 25 % mejor del in-sample por el criterio (beneficio).
  const topN = Math.max(10, Math.round(0.25 * rows.length));
  const fwd = rows.map((_, i) => i).sort((a, b) => rows[b].is.profit - rows[a].is.profit).slice(0, topN);
  const oosRows = fwd.map((i) => { const r = rows[i]; return [i, r2(DEPOSIT + r.oos.profit), r2(DEPOSIT + r.is.profit), r2(r.oos.profit), r2(r.oos.expectedPayoff), r2(r.oos.profitFactor), r2(r.oos.recoveryFactor), r2(r.oos.sharpe), r2(r.oos.drawdownPct), r.oos.trades, ...r.params]; });

  const key = (params) => params.map((v) => String(Number(v))).join('|');
  const truth = new Map(rows.map((r) => [key(r.params), { edgeUnseen: r.edgeUnseen, edgeIs: r.edgeIs }]));
  return {
    isTable: { name: `${scenario}-${seed}-IS.xml`, sheet: 'Tester Optimizator Results', format: 'sintetico', headers: isH, rows: isRows },
    oosTable: { name: `${scenario}-${seed}-OOS.xml`, sheet: 'Tester Optimizator Results', format: 'sintetico', headers: oosH, rows: oosRows },
    rows, fwd, levels, names, key,
    truth,
    meta: { scenario, seed, dims, configs: rows.length, gridSize: coords.length, tradesIs, oosRatio, luckAmp, A, width, center },
  };
}
