// Informes sintéticos de backtest (HTML de MT5) para las pruebas del Monte Carlo: lote fijo 0,10
// en EURUSD (o martingala) y, por defecto, los parámetros de la meseta recomendada del ejemplo.
export function report({ start = Date.UTC(2023, 0, 2), weekdays = 260, seed = 1, pTrade = 0.6, mu = 2, sd = 25, martingale = false, inputs = 'InpFastMA=14 InpSlowMA=70 InpATR_SL=2 InpATR_TP=4 InpTrailStart=1.5 InpMinBodyPct=20' } = {}) {
  let s = seed; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const g = () => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
  const rows = [];
  const tr = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
  rows.push(tr(['Time', 'Deal', 'Symbol', 'Type', 'Direction', 'Volume', 'Price', 'Order', 'Commission', 'Swap', 'Profit', 'Balance', 'Comment']));
  let bal = 10000; rows.push(tr([fmt(start - 86400000), 1, '', 'balance', '', '', '', '', '0.00', '0.00', '10000.00', '10000.00', '']));
  let deal = 2; let t = start; let n = 0; let trades = 0; let profitSum = 0; let gp = 0; let gl = 0; let lot = 0.1; let last = start;
  function fmt(ms) { const d = new Date(ms); const p = (v) => String(v).padStart(2, '0'); return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00`; }
  while (n < weekdays) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) {
      n++;
      const k = r() < pTrade ? (r() < 0.2 ? 2 : 1) : 0;
      for (let j = 0; j < k; j++) {
        const buy = r() < 0.5; const open = 1.08 + (r() - 0.5) * 0.02;
        const usd = (mu + sd * g()) * (lot / 0.1); const pips = usd / (lot * 10);
        const close = open + (buy ? 1 : -1) * pips / 10000;
        const profit = Math.round(usd * 100) / 100; const com = -0.35 * lot / 0.1;
        bal += profit + 2 * com; profitSum += profit + 2 * com; trades++;
        if (profit + 2 * com > 0) gp += profit + 2 * com; else gl -= profit + 2 * com;
        const to = t + (9 + 4 * j) * 3600000; last = to;
        rows.push(tr([fmt(to), deal++, 'EURUSD', buy ? 'buy' : 'sell', 'in', lot.toFixed(2), open.toFixed(5), deal, com.toFixed(2), '0.00', '0.00', (bal - profit - com).toFixed(2), '']));
        rows.push(tr([fmt(to + 3 * 3600000), deal++, 'EURUSD', buy ? 'sell' : 'buy', 'out', lot.toFixed(2), close.toFixed(5), deal, com.toFixed(2), '0.00', profit.toFixed(2), bal.toFixed(2), '']));
        if (martingale) lot = profit < 0 ? Math.min(lot * 2, 3.2) : 0.1;
      }
    }
    t += 86400000;
  }
  const day = (ms) => fmt(ms).slice(0, 10);
  return `<!DOCTYPE html><html><body><div>Strategy Tester Report</div><table>
<tr><td>Expert:</td><td><b>Demo EA</b></td></tr><tr><td>Symbol:</td><td><b>EURUSD</b></td></tr>
<tr><td>Period:</td><td><b>H1 (${day(start)} - ${day(last + 86400000)})</b></td></tr>
<tr><td>Inputs:</td><td><b>${inputs.split(' ').join('</b></td></tr><tr><td></td><td><b>')}</b></td></tr>
<tr><td>Results</td></tr><tr><td>Total Net Profit:</td><td>${profitSum.toFixed(2)}</td></tr><tr><td>Total Trades:</td><td>${trades}</td></tr><tr><td>Profit Factor:</td><td>${(gp / gl).toFixed(2)}</td></tr>
</table><table>${rows.join('\n')}</table></body></html>`;
}
