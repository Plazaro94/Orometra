// Lo que encontró la auditoría del recorrido del 2026-10-12 (simulando usuarios de MT5 en
// el navegador con exports del banco). Cada sección falla con el código anterior.
//
//   R1  Una meseta sin ninguna configuración en el forward salía «frágil al validar» y con
//       «Descargar .set» de despliegue, aunque solo se había medido en el periodo optimizado.
//   R2  Sin meseta, la sugerencia orientativa decía «pruébala en un periodo no visto», y la
//       pestaña del periodo no visto contestaba «no hay ninguna configuración que validar».
//   R3  Validando una meseta alternativa, la ficha del informe decía «coinciden con la
//       configuración propuesta».
//   R4  Con evidencia débil y el periodo no visto aprobado, el siguiente paso era el mismo que
//       con buena: «pruébala en demo o en real con riesgo reducido».
//   R5  Con el periodo no visto en contra, solo «revisa qué métrica falla antes de dar ningún
//       paso más», sin ningún paso.
//
//   node tests/recorrido-2026-10.test.js

import { setLocale } from '../js/i18n.js';
import { runAnalysis } from '../core/analysis.js';
import { DEFAULT_POLICY } from '../core/metrics.js';
import { generateCase } from '../bench/sim.js';
import { state, deployableSet, forwardUntested } from '../js/ui-state.js';
import { renderTop3, renderVerdict, fallbackNote, compactAction, nextStepText, holdoutFact, displayVerdictLevel } from '../js/ui-verdict.js';
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

section('R4: débil con el periodo no visto aprobado no lleva a «real»');
{
  const weak = analyze('S5', 1);
  check('el caso es débil y tiene meseta', weak.verdict.level === 'weak' && weak.plateaus.length > 0, weak.verdict.level);
  state.report = null;
  state.unseen.plateauIndex = 0;
  state.unseen.result = { level: 'normal', headline: '' };
  const hold = holdoutFact(weak);
  check('el periodo no visto cuenta y no contradice', hold.ok && displayVerdictLevel(weak) === 'weak');
  const text = nextStepText(weak, hold);
  check('ya no dice «en real con riesgo reducido»', !/en real con riesgo reducido/.test(text), text);
  check('dice que no compensa lo que la deja en débil, y solo demo', /no compensa lo que la deja en débil/.test(text) && /en demo, sin dinero real/.test(text), text);
  check('y que hace falta un tramo nuevo', /hace falta un tramo nuevo/.test(text));

  const good = analyze('S7', 1);
  check('con buena se mantiene el paso a demo o real con riesgo reducido', /en real con riesgo reducido/.test(nextStepText(good, holdoutFact(good))));

  const isOnly = (() => { const c = generateCase('S8', 3); return runAnalysis({ isTable: c.isTable, oosTable: null, policy: DEFAULT_POLICY }); })();
  const t2 = nextStepText(isOnly, holdoutFact(isOnly));
  check('sin forward: reoptimizar con forward en fechas no usadas, tampoco este tramo', /vuelve a optimizar con Forward en fechas que no hayas usado/.test(t2) && /tampoco las de este tramo/.test(t2), t2);
  state.unseen.result = null;
}

section('R5: el periodo no visto en contra da opciones');
{
  const good = analyze('S7', 1);
  state.report = null;
  state.unseen.plateauIndex = 0;
  state.unseen.result = { level: 'outside', headline: '' };
  const hold = holdoutFact(good);
  check('va en contra y baja a moderada', hold.against && displayVerdictLevel(good) === 'moderate');
  const html = renderVerdict(good);
  const next = html.split('class="vx-next"')[1] || '';
  check('ni en los pasos ni en el resumen queda «antes de dar ningún paso más»', !/antes de dar ningún paso más/.test(html));
  check('el resumen remite a «Qué hacer ahora»', /está en «Qué hacer ahora»/.test(html));
  check('primero, no reoptimizar sobre ese tramo', /<strong>No la reoptimices sobre este tramo<\/strong>/.test(next), next.slice(0, 300));
  check('cuatro opciones numeradas', (next.match(/class="vx-step"/g) || []).length === 4);
  check('con enlace a la pestaña del periodo no visto', /data-goto="unseen"/.test(next));
  check('dice que la prueba también da falsas alarmas', /falsas alarmas/.test(next));
  const text = nextStepText(good, hold);
  check('el resumen exportado lleva las mismas opciones', /1\) No la reoptimices sobre este tramo\./.test(text) && /4\) O vuelve a empezar\./.test(text), text);

  // Un informe de otra configuración no es «en contra»: dice que no valida y qué hacer.
  const [m1] = good.plateaus;
  const params = Object.fromEntries(good.meta.paramNames.map((n, j) => [n, String(j === 0 ? Number(m1.record.params[0]) + 1 : m1.record.params[j])]));
  state.report = { meta: { file: 'otro.html' }, params, metrics: {}, deals: [] };
  const other = holdoutFact(good);
  const t3 = nextStepText(good, other);
  check('informe de otra configuración: no se toma por un fallo', !other.against && /otra configuración/.test(t3) && /Lanza en MT5 el backtest de la configuración propuesta/.test(t3), t3);
  state.report = null;
  state.unseen.result = null;
}

console.log(`\n${checks - failures}/${checks} comprobaciones correctas`);
if (failures) process.exit(1);
