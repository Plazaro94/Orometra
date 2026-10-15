// Pruebas de respuesta conocida para core/trades/sizing.js (cómo calcula el lote el EA).

import { detectSizing } from '../core/trades/sizing.js';
import { makeRng } from '../core/rng.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}

/**
 * Backtest sintético: cada operación gana o pierde (55 % de aciertos) y el lote lo decide
 * `lotRule(balance, prev)`. El resultado es proporcional al lote: ±r por lote.
 */
function synth(lotRule, { trades = 400, seed = 1, start = 10000, perLot = 100 } = {}) {
  const rng = makeRng(seed);
  const deals = [];
  let balance = start;
  let prev = null;
  for (let i = 0; i < trades; i++) {
    const lot = Math.max(0.01, Math.round(lotRule(balance, prev, rng) * 100) / 100);
    const win = rng() < 0.55;
    const net = (win ? 1.2 : -1) * perLot * lot * (0.5 + rng());
    balance += net;
    deals.push({ time: '2024.01.01 10:00', net, volume: lot, balance });
    prev = { lot, net };
  }
  return deals;
}

console.log('\n=== Tipo de lote ===');
{
  const fixed = detectSizing(synth(() => 1));
  check('lote fijo → fixed (lote constante)', fixed.kind === 'fixed' && fixed.signal === 'lote_constante', JSON.stringify(fixed));

  const prop = detectSizing(synth((b) => b / 5000, { trades: 600 }));
  check('lote proporcional al balance → proportional', prop.kind === 'proportional', JSON.stringify(prop));

  // Riesgo fijo en dinero: el lote cambia con la distancia al stop (al azar), no con el balance.
  const risk = detectSizing(synth((b, p, r) => 1 / (0.5 + r()), { trades: 600 }));
  check('riesgo fijo en dinero (lote según el stop) → fixed', risk.kind === 'fixed', JSON.stringify(risk));

  // Como en el primer informe real: el lote baja mientras el balance sube (el precio sube).
  let k = 0;
  const falling = detectSizing(synth(() => 4 - 3 * (k++ / 600), { trades: 600 }));
  check('lote que baja mientras el balance sube → fixed', falling.kind === 'fixed', JSON.stringify(falling));

  const mart = detectSizing(synth((b, p) => (p && p.net < 0 ? Math.min(p.lot * 2, 8) : 0.1)));
  check('dobla el lote tras perder → martingale', mart.kind === 'martingale', JSON.stringify(mart));

  // Proporcional con poco crecimiento: dinero y % dan lo mismo, se queda en dinero.
  const flat = detectSizing(synth((b) => b / 5000, { trades: 30, perLot: 5 }));
  check('balance que apenas cambia → fixed (balance estable)', flat.kind === 'fixed' && flat.signal === 'balance_estable', JSON.stringify(flat));

  check('menos de 10 operaciones → fixed (pocas operaciones)', detectSizing(synth(() => 1, { trades: 5 })).signal === 'pocas_operaciones');
  const noBal = synth((b, p, r) => 1 / (0.5 + r())).map((d) => ({ ...d, balance: NaN }));
  check('sin columna de balance → fixed (sin balance)', detectSizing(noBal).signal === 'sin_balance');
}

console.log(`\nRESULTADO: ${checks - failures}/${checks}`);
if (failures) process.exit(1);
