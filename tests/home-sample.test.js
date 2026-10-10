// La tarjeta «Una decisión, no una tabla» de la portada enseña el informe de ejemplo y enlaza
// con él (/app/?demo=1): sus cifras tienen que ser las que ese informe da de verdad. Antes
// mostraba otra pasada, otra meseta y otro nivel (2026-10-10). Si el ejemplo o el motor
// cambian, esta prueba falla hasta que se actualice la tarjeta en los dos idiomas.
//
//   node tests/home-sample.test.js

import fs from 'node:fs';
import { setLocale, t } from '../js/i18n.js';
import { buildDemoTables, buildNoEdgeDemoTables } from '../js/demo.js';
import { runAnalysis } from '../core/analysis.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}

const demo = buildDemoTables();
const a = runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable });
const best = a.plateaus[0];
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const card = html.slice(html.indexOf('class="hm-take-card"'), html.indexOf('</figure>', html.indexOf('class="hm-take-card"')));

console.log('\nTarjeta del informe de ejemplo');
check('la pasada', card.includes(`<b>${best.record.id}</b>`), best.record.id);
const chips = a.meta.paramNames.map((n, j) => `<span>${n} <b>${best.record.params[j]}</b></span>`).join('');
check('los parámetros, con su nombre y en el orden del informe', card.includes(chips), chips);
check('la robustez', card.includes(`<strong>${Math.round(best.robust)}<small>/100</small></strong>`), String(best.robust));
check('las vecinas que cumplen', card.includes(`<strong>${best.neighborhood.passing}<small data-i18n="home.take.stat.of"> of ${best.neighborhood.observed}</small>`),
  `${best.neighborhood.passing} de ${best.neighborhood.observed}`);
const order = ['insufficient', 'weak', 'moderate', 'good', 'strong'];
const here = (card.match(/<div class="vx-seg[^"]*">/g) || []).findIndex((s) => s.includes('is-here'));
check('el nivel del medidor', here === order.indexOf(a.verdict.level), `${order[here]} frente a ${a.verdict.level}`);
const keep = Number.isFinite(best.medianRetention) ? best.medianRetention : best.record.retention;

for (const lang of ['en', 'es']) {
  setLocale(lang);
  console.log(`\n${lang.toUpperCase()}`);
  const size = lang === 'es' ? String(best.size) : best.size.toLocaleString('en-US');
  check('el tamaño de la meseta', t('home.take.pick.note').includes(`${size} `), t('home.take.pick.note'));
  check('se mantiene al validar', t('home.take.stat.pct') === (lang === 'es' ? `${Math.round(100 * keep)} %` : `${Math.round(100 * keep)}%`), t('home.take.stat.pct'));
  check('de N vecinas', t('home.take.stat.of').trim().endsWith(String(best.neighborhood.observed)), t('home.take.stat.of'));
  check('el nivel, también para el lector de pantalla', t('home.take.aria.meter').includes(`(${order.indexOf(a.verdict.level) + 1} `), t('home.take.aria.meter'));
}

console.log('\nEjemplo sin ventaja');
{
  const noEdge = buildNoEdgeDemoTables();
  const b = runAnalysis({ isTable: noEdge.isTable, oosTable: noEdge.oosTable });
  check('no hay meseta', b.plateaus.length === 0, String(b.plateaus.length));
  check('la evidencia es débil', b.verdict.level === 'weak', b.verdict.level);
  const top = noEdge.isTable.rows.slice().sort((x, y) => y[1] - x[1])[0];
  check('y la n.º 1 de MT5 parece buena (factor de beneficio ≥ 1,5, drawdown ≤ 10 %)', top[4] >= 1.5 && top[8] <= 10, `PF ${top[4]} · DD ${top[8]}`);
  check('es determinista', JSON.stringify(buildNoEdgeDemoTables().isTable.rows[7]) === JSON.stringify(noEdge.isTable.rows[7]));
  check('la portada enlaza con él', html.includes('href="app/?demo=noedge"'));
}

console.log(`\n${'='.repeat(70)}\nRESULTADO: ${checks - failures}/${checks} comprobaciones correctas\n${'='.repeat(70)}`);
if (failures) process.exit(1);
