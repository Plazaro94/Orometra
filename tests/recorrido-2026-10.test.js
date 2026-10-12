// Lo que encontró la auditoría del recorrido del 2026-10-12 (simulando usuarios de MT5 en
// el navegador con exports del banco). Cada sección falla con el código anterior.
//
//   R1  Una meseta sin ninguna configuración en el forward salía «frágil al validar» y con
//       «Descargar .set» de despliegue, aunque solo se había medido en el periodo optimizado.
//   R2  Sin meseta, la sugerencia orientativa decía «pruébala en un periodo no visto», y la
//       pestaña del periodo no visto contestaba «no hay ninguna configuración que validar».
//   R3  Validando una meseta alternativa, la ficha del informe decía «coinciden con la
//       configuración propuesta».
//
//   node tests/recorrido-2026-10.test.js

import { setLocale } from '../js/i18n.js';
import { runAnalysis } from '../core/analysis.js';
import { DEFAULT_POLICY } from '../core/metrics.js';
import { generateCase } from '../bench/sim.js';
import { state, deployableSet, forwardUntested } from '../js/ui-state.js';
import { renderTop3, renderVerdict, fallbackNote, compactAction } from '../js/ui-verdict.js';
import { renderRepCard } from '../js/ui-plateaus.js';
import { renderUnseen, renderReportCard } from '../js/ui-unseen.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}
function section(t) { console.log(`\n${'='.repeat(70)}\n${t}\n${'='.repeat(70)}`); }

setLocale('es');
const analyze = (scenario, seed) => {
  const c = generateCase(scenario, seed);
  return runAnalysis({ isTable: c.isTable, oosTable: c.oosTable, policy: DEFAULT_POLICY });
};
const setButtons = (html) => (html.match(/data-export="set"/g) || []).length;

// S8 semilla 4: cuatro mesetas; MT5 (como en el banco) solo pasa al forward el 25 % mejor
// del periodo optimizado, y ninguna configuración de las alternativas llega.
const multi = analyze('S8', 4);

section('R1: meseta sin forward, ni «frágil» ni .set de despliegue');
{
  const [m1, m2] = multi.plateaus;
  check('el caso tiene alternativas sin forward', multi.plateaus.length > 1 && m2.oosValidation.withForward === 0,
    JSON.stringify(m2 && m2.oosValidation));
  check('la recomendada sí tiene forward y su .set', deployableSet(multi, m1) && !forwardUntested(multi, m1));
  check('la alternativa no ofrece .set de despliegue', !deployableSet(multi, m2) && forwardUntested(multi, m2));

  const top3 = renderTop3(multi);
  check('las alternativas no salen «frágil al validar»', !/frágil al validar/.test(top3));
  check('salen «sin forward»', /sin forward/.test(top3));
  const alts = top3.split('class="t3-table"')[0];
  check('las fichas de las alternativas no traen «Descargar .set»', setButtons(alts) === 0, String(setButtons(alts)));

  const card = renderRepCard(multi, m2);
  check('la ficha de la meseta 2 no trae «Descargar .set»', setButtons(card) === 0);
  check('pero sí el .set de refinamiento', /data-export="refine"/.test(card));
  check('y dice que MT5 no la pasó al forward', /MT5 no pasó esta configuración al forward/.test(card));
  check('la ficha de la recomendada sigue con su .set', setButtons(renderRepCard(multi, m1)) === 1);

  // Si la recomendada tampoco tuviera forward (no ha pasado en 80 casos del banco, pero el
  // motor no lo impide): el veredicto se comporta como sin archivo forward.
  const untested = { ...multi, plateaus: [{ ...m1, oosValidation: { ...m1.oosValidation, withForward: 0, passFrac: 0 } }, ...multi.plateaus.slice(1)] };
  const html = renderVerdict(untested);
  const decision = html.split('class="vx-next"')[0];
  check('veredicto: la tarjeta ofrece el rango, no el .set', setButtons(decision) === 0 && /data-export="refine"/.test(decision));
  check('los pasos dicen que no llegó al forward', /Ninguna configuración de esta meseta llegó al forward/.test(html));
  check('y no mandan a descargar el .set', !/Descarga el \.set/.test(html));
  check('la cabecera compacta ofrece el rango', compactAction(untested).kind === 'refine');
}

section('R2: la sugerencia orientativa y el periodo no visto no se contradicen');
{
  const noPlateau = analyze('S1', 1);
  check('el caso no tiene meseta y sí sugerencia', !noPlateau.plateaus.length && Boolean(noPlateau.fallback));
  const note = fallbackNote(noPlateau);
  check('la sugerencia ya no manda al periodo no visto', !/No la uses sin probarla antes en un periodo no visto/.test(note), note);
  check('dice que no se puede contrastar ahí', /no puede contrastarla en un periodo no visto/.test(note), note);

  state.report = null;
  let tab = renderUnseen(noPlateau);
  check('la pestaña no da por hecho que hay configuración elegida', !/Ya has elegido configuración/.test(tab));
  check('explica que no hay meseta con la que comparar, tampoco la sugerencia', /no hay ninguna meseta/.test(tab) && /tampoco la sugerencia orientativa/.test(tab), tab);
  state.report = { meta: { file: 'Backtest.html' }, params: {}, metrics: {}, deals: [] };
  tab = renderUnseen(noPlateau);
  check('con un informe cargado, dice que se ha leído pero no se compara', /Backtest\.html\) se ha leído, pero no se compara/.test(tab), tab);
  state.report = null;

  setLocale('en');
  const en = fallbackNote(noPlateau);
  check('[en] the suggestion says it cannot be checked on an unseen period', /cannot check it on an unseen period/.test(en), en);
  setLocale('es');
}

section('R3: validando una alternativa, la ficha nombra esa meseta');
{
  const [m1, m2] = multi.plateaus;
  const paramsOf = (p) => Object.fromEntries(multi.meta.paramNames.map((n, j) => [n, String(p.record.params[j])]));
  state.report = { meta: { file: 'b.html', expert: 'EA' }, params: paramsOf(m2), metrics: { trades: 50, profit: 100 }, deals: [] };
  const alt = renderReportCard(multi, m2);
  check('dice que coinciden con la configuración de la meseta 2', /coinciden con la configuración de la meseta 2/.test(alt), alt);
  check('y no con «la propuesta»', !/configuración propuesta/.test(alt));
  state.report.params = paramsOf(m1);
  check('con la recomendada sigue diciendo «la propuesta»', /coinciden con la configuración propuesta/.test(renderReportCard(multi, m1)));
  state.report = null;
}

console.log(`\n${checks - failures}/${checks} comprobaciones correctas`);
if (failures) process.exit(1);
