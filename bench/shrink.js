// Mide la expectativa ajustada por selección (core/shrink.js) contra la verdad del banco.
//
//   node bench/shrink.js calib-shrink
//
// La verdad es el beneficio esperado por operación de la recomendada en el periodo NO
// visto: TRADE_SD x edge_unseen (bench/sim.js). Se compara con las dos cifras que un
// usuario tendría a mano sin Orometra, la del periodo optimizado y la del forward.
// La ventaja propia verdadera es esa verdad menos el nivel de la familia en el no visto
// (media de edge_unseen de las que cumplen los mínimos del in-sample).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRADE_SD } from './sim.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const split = process.argv[2] || 'calib';
const rows = fs.readFileSync(path.join(HERE, 'results', `${split}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const NO_EDGE = new Set(['S1', 'S2', 'S5']);

const rmse = (v) => Math.sqrt(v.reduce((a, x) => a + x * x, 0) / v.length);
const meanOf = (v) => v.reduce((a, x) => a + x, 0) / v.length;
const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const p = (x) => (Number.isFinite(x) ? `${(100 * x).toFixed(0)} %` : '—');

const out = [];
out.push(`# Expectativa ajustada por selección frente a la verdad (${split})`);
out.push('');
out.push(`Beneficio esperado por operación de la recomendada en el periodo no visto (${TRADE_SD} × edge_unseen),`);
out.push('en moneda. Sesgo = media de (cifra − verdad): positivo es optimista.');
out.push('');
out.push('| Escenario | Casos | RMSE optimizado | RMSE forward | RMSE ajustada | Sesgo forward | Sesgo ajustada | Ventaja propia: verdad bajo el límite inferior | Ventaja propia > 0 (límite inferior > 0) |');
out.push('|---|---|---|---|---|---|---|---|---|');
const groups = [...new Set(rows.map((r) => r.scenario))].sort();
for (const s of [...groups, 'Con ventaja', 'Sin ventaja']) {
  const g = rows.filter((r) => (s === 'Con ventaja' ? !NO_EDGE.has(r.scenario) : s === 'Sin ventaja' ? NO_EDGE.has(r.scenario) : r.scenario === s)
    && r.shrink && r.orometra && Number.isFinite(r.shrink.expected) && Number.isFinite(r.shrink.observedOos));
  if (!g.length) continue;
  const truth = g.map((r) => TRADE_SD * r.orometra.edge);
  const own = g.map((r, i) => truth[i] - TRADE_SD * r.truth.familyUnseen);
  const e = (key) => g.map((r, i) => r.shrink[key] - truth[i]);
  const below = g.filter((r, i) => own[i] < r.shrink.ownLo).length / g.length;
  const pos = g.filter((r) => r.shrink.ownLo > 0).length / g.length;
  const label = s.startsWith('Con') || s.startsWith('Sin') ? `**${s}**` : `${s}${NO_EDGE.has(s) ? ' (sin ventaja)' : ''}`;
  out.push(`| ${label} | ${g.length} | ${f(rmse(e('observedIs')))} | ${f(rmse(e('observedOos')))} | ${f(rmse(e('expected')))} | ${f(meanOf(e('observedOos')))} | ${f(meanOf(e('expected')))} | ${p(below)} | ${p(pos)} |`);
}
out.push('');
out.push('- «Verdad bajo el límite inferior»: el límite inferior de la ventaja propia se pasa de largo.');
out.push('  Con un límite al 95 % debe quedarse en torno al 5 % o menos.');
out.push('- «Ventaja propia > 0»: la app dice que la recomendada se distingue de la familia. Sin ventaja');
out.push('  real es un falso positivo (debe rondar el 5 % o menos); con ventaja, es la potencia.');
out.push('- En S6 la ventaja se reduce a la mitad en el no visto: ningún dato pasado lo anticipa.');
const md = out.join('\n') + '\n';
fs.writeFileSync(path.join(HERE, 'results', `REPORT-shrink-${split}.md`), md);
console.log(md);
