// Veredicto, evidencia, why-grade, outcome y top3.

import { qualityLabel } from '../core/metrics.js';
import { compareParams } from '../core/report.js';
import { setCoverageNote } from './export.js';
import { mergeSetValues } from '../core/setfile.js';
import { outcomeFromAnalysis, CODE, errorCopy } from '../core/errors.js';
import { scatterIsOos, degradationChart } from './charts.js';
import { t, L, localeTag } from './i18n.js';
import { state, num, int, pct, esc, rich, nf, paramHtml, categorizeFinding } from './ui-state.js';
import { gloss } from './glossary.js';

/*
 * El sello califica la FUERZA DE LA EVIDENCIA, no la estrategia. Antes decia
 * "NO RECOMENDADO" / "SUPERA LA AUDITORIA", que era decidir por el usuario sobre algo
 * que la aplicacion no mide. Ahora describe lo que sostiene el hallazgo.
 */
/**
 * Cuantas configuraciones se han analizado, contado como lo entiende el usuario.
 *
 * `meta.total` es lo que queda tras agrupar las pasadas que solo se diferencian en
 * parametros sin efecto medible: con un export real (256 pasadas emparejadas) salia
 * "92 configuraciones" y parecia que se habian leido mal los archivos.
 */
export function configsLabel(a, short = false) {
  const integ = a.integrity || {};
  const paired = Number.isFinite(integ.matchedRows) ? integ.matchedRows : a.meta.total;
  const grouped = integ.collapsedTopology > 0 && paired > a.meta.total;
  const base = a.meta.hasForward
    ? L(`${int(paired)} pasadas emparejadas`, `${int(paired)} paired passes`)
    : L(`${int(paired)} pasadas`, `${int(paired)} passes`);
  if (!grouped) return base;
  if (short) return L(`${base} (${int(a.meta.total)} distintas)`, `${base} (${int(a.meta.total)} distinct)`);
  const flat = (a.meta.flatDims || []).join(', ');
  return L(
    `${base} · ${int(a.meta.total)} tras agrupar ${flat || 'parámetros'} (sin efecto medible)`,
    `${base} · ${int(a.meta.total)} after grouping ${flat || 'parameters'} (no measurable effect)`,
  );
}

export function verdictCopy(level) {
  if (level === 'insufficient') return { label: t('verdict.insufficient'), cls: 'v-no' };
  if (level === 'weak') return { label: t('verdict.weak'), cls: 'v-weak' };
  if (level === 'moderate') return { label: t('verdict.moderate'), cls: 'v-warn' };
  if (level === 'good') return { label: t('verdict.good'), cls: 'v-go' };
  return { label: t('verdict.strong'), cls: 'v-go' };
}

/** Estado del holdout para sello / hoja de evidencia (forward ≠ periodo no visto). */
export function holdoutFact(a) {
  const res = state.unseen && state.unseen.result;
  if (!res) {
    return {
      value: L('No aportado', 'Not supplied'),
      note: a && a.meta && a.meta.hasForward
        ? L('Pendiente: es el siguiente paso.', 'Pending: it is the next step.')
        : L('Validación independiente aún no cargada.', 'Independent validation not loaded yet.'),
      short: L('Periodo no visto: no aportado', 'Unseen period: not supplied'),
      done: false,
      ok: false,
    };
  }
  const value = res.level === 'normal'
    ? L('No contradice', 'Not contradicted')
    : res.level === 'tail'
      ? L('En la cola', 'In the tail')
      : L('Fuera de rango', 'Out of range');
  /*
   * Un resultado "normal" solo confirma la recomendación si el backtest es de ESA
   * configuración: la meseta recomendada (M1) y, si hay informe, con sus mismos
   * parámetros y al menos uno leído. Si no, el contraste es aritméticamente correcto
   * pero no valida nada, y no puede subir el nivel de evidencia. "En la cola" tampoco:
   * es un resultado raro para esa configuración, no una confirmación.
   */
  const plateaus = (a && a.plateaus) || [];
  const idx = plateaus.length ? Math.min(state.unseen.plateauIndex || 0, plateaus.length - 1) : -1;
  const plateau = idx >= 0 ? plateaus[idx] : null;
  const cmp = state.report && plateau
    ? compareParams(state.report.params, a.meta.paramNames, plateau.record.params)
    : null;
  let problem = '';
  if (cmp && cmp.different.length) {
    problem = L('El informe es de otra configuración: no valida la propuesta.', 'The report is from another configuration: it does not validate the proposal.');
  } else if (cmp && !cmp.same.length) {
    problem = L('No se han podido leer los parámetros del informe, así que no consta que sea de la configuración propuesta.', 'The report parameters could not be read, so it is not confirmed that it comes from the proposed configuration.');
  } else if (cmp && cmp.missing.length) {
    problem = L(`Al informe le faltan parámetros optimizados (${cmp.missing.slice(0, 4).join(', ')}${cmp.missing.length > 4 ? '…' : ''}), así que no consta que sea de la configuración propuesta.`,
      `The report is missing optimized parameters (${cmp.missing.slice(0, 4).join(', ')}${cmp.missing.length > 4 ? '…' : ''}), so it is not confirmed that it comes from the proposed configuration.`);
  } else if (idx > 0) {
    problem = L(`Se evaluó la meseta ${idx + 1}, no la recomendada (la 1).`, `Plateau ${idx + 1} was evaluated, not the recommended one (plateau 1).`);
  }
  return {
    value: problem ? L(`${value} · no valida`, `${value} · does not validate`) : value,
    note: problem || res.headline || '',
    short: problem
      ? L(`Periodo no visto: ${value} · no valida`, `Unseen period: ${value} · does not validate`)
      : L(`Periodo no visto: ${value}`, `Unseen period: ${value}`),
    done: true,
    ok: !problem && res.level === 'normal',
    // "En la cola" o "fuera de rango" sobre la configuración propuesta: el periodo no
    // visto va en contra. Un informe ajeno no dice nada, ni a favor ni en contra.
    against: !problem && res.level !== 'normal',
  };
}

/**
 * El motor solo ve el forward, que ya se usó para validar y ordenar las mesetas. Su
 * "sólida" se muestra como "buena" hasta que un periodo no visto no la contradice, y baja a
 * "moderada" si ese periodo va en contra.
 */
export function displayVerdictLevel(a) {
  let level = a.verdict.level;
  if (level === 'strong' && a.meta.hasForward) {
    const h = holdoutFact(a);
    if (h.against) level = 'moderate';
    else if (!h.ok) level = 'good';
  }
  return level;
}

/**
 * Titular y resumen coherentes con el nivel MOSTRADO, no con el que calculó el
 * motor. displayVerdictLevel() deja la "sólida" del motor en "buena" (o "moderada"),
 * pero a.verdict.headline/summary siguen siendo el texto que el motor generó para
 * "sólida" -- usarlos tal cual contradice al medidor.
 */
export function displayVerdictCopy(a) {
  const level = displayVerdictLevel(a);
  const v = a.verdict;
  if (level === v.level) return { level, headline: v.headline, summary: v.summary };
  // El titular empieza siempre por el nivel MOSTRADO: la frase más leída no puede
  // admitir dos lecturas.
  if (level === 'good') {
    return {
      level,
      headline: L('Evidencia buena: meseta validada en el forward, falta el periodo no visto', 'Good evidence: plateau validated on the forward, unseen period still missing'),
      summary: L(
        'La meseta propuesta se apoya en vecinas que también cumplen tus mínimos y aguanta al mover los umbrales. Se queda en buena porque el forward ya se usó para validar y ordenar las mesetas: para llegar a sólida falta probarla en un periodo que no hayas tocado.',
        'The proposed plateau rests on neighbors that also clear your minimums and holds when thresholds are moved. It stays at good because the forward was already used to validate and rank the plateaus: to reach strong it still needs testing on a period you have not touched.',
      ),
    };
  }
  // sólida -> moderada: el periodo no visto va en contra de la configuración propuesta.
  return {
    level,
    headline: L('Evidencia moderada: el periodo no visto no la confirma', 'Moderate evidence: the unseen period does not confirm it'),
    summary: L(
      'La meseta propuesta se apoya en vecinas que también cumplen tus mínimos y pasó el forward, pero en el periodo no visto su resultado se sale de lo habitual. Revisa esa pestaña antes de dar ningún paso más.',
      'The proposed plateau rests on neighbors that also clear your minimums and passed the forward, but on the unseen period its result falls outside the usual range. Check that tab before taking any further step.',
    ),
  };
}

/**
 * Texto de la sugerencia orientativa (sin meseta), ya escapado para HTML. Tiene que dejar
 * claro que NO es una región estable: es la configuración que mejor combina los dos
 * periodos con sus vecinas.
 */
export function fallbackNote(a) {
  const params = a.meta.paramNames.map((n, j) => `${esc(n)}=${paramHtml(a.fallback.record.params[j])}`).join(', ');
  const gates = a.fallback.passesBoth
    ? ''
    : L(' Ninguna configuración cumple tus mínimos en los dos periodos: esta solo los cumple en el periodo optimizado.',
      ' No configuration meets your minimums in both periods: this one only meets them on the optimized period.');
  return L(
    `Sin meseta. Es la que mejor combina el periodo optimizado y el forward junto con sus vecinas (${params}).${gates} No la uses sin probarla antes en un periodo no visto.`,
    `No plateau. It is the one that best combines the optimized period and the forward together with its neighbors (${params}).${gates} Do not use it without first testing it on an unseen period.`,
  );
}

/**
 * El siguiente paso depende también del periodo no visto: el motor recomienda hacerlo,
 * pero una vez hecho, repetir "pruébala en un periodo no visto" es un consejo caducado.
 */
export function nextStepText(a, hold) {
  if (!hold || !hold.done || !a.plateaus.length) return a.verdict.nextStep;
  if (hold.ok) {
    return L(
      'El periodo no visto no la contradice (esta prueba detecta poco: aprobarla no la confirma). Siguiente paso: pruébala en demo o en real con riesgo reducido, y compara sus resultados en vivo con el rango habitual de la meseta, no con las mejores cifras.',
      'The unseen period does not contradict it (this check detects little: passing it does not confirm it). Next step: run it on demo or live with reduced risk, and compare its live results with the plateau\'s usual range, not with the best figures.',
    );
  }
  return L(
    'El periodo no visto no la confirma. Revisa en esa pestaña qué métrica falla (o si el informe es de otra configuración) antes de dar ningún paso más.',
    'The unseen period does not confirm it. Check in that tab which metric fails (or whether the report is from another configuration) before taking any further step.',
  );
}

const LEVEL_ORDER = ['insufficient', 'weak', 'moderate', 'good', 'strong'];

/** Nombre corto de cada nivel para el medidor («Moderada»), sin la palabra «Evidencia». */
export function levelName(level) {
  return {
    insufficient: L('Insuficiente', 'Insufficient'),
    weak: L('Débil', 'Weak'),
    moderate: L('Moderada', 'Moderate'),
    good: L('Buena', 'Good'),
    strong: L('Sólida', 'Strong'),
  }[level];
}

/**
 * Una frase llana que dice qué significa el nivel mostrado en este análisis concreto.
 * El titular del motor («Evidencia moderada») va arriba como título de la página; esto
 * es lo que el usuario necesita leer debajo del medidor para entenderlo sin jerga.
 */
export function trustLine(a, level) {
  const v = a.verdict;
  const regions = a.plateaus.length;
  const warnings = (v.counts && v.counts.warnings) || 0;
  const critical = (v.counts && v.counts.critical) || 0;
  if (level === 'insufficient') {
    return L('Con estos datos no se puede afirmar nada, ni a favor ni en contra de tu EA.',
      'These data cannot support any claim, for or against your EA.');
  }
  if (level === 'weak') {
    if (!regions) {
      return L('No hay ninguna meseta: solo configuraciones sueltas, que pueden deberse a la suerte.',
        'There is no plateau: only isolated configurations, which may be down to luck.');
    }
    if (!a.meta.hasForward) {
      return L('Hay una meseta, pero sin un periodo de validación no se puede saber si aguanta fuera de los datos optimizados.',
        'There is a plateau, but without a validation period there is no way to know whether it holds beyond the optimized data.');
    }
    return critical === 1
      ? L('Hay una meseta, pero con una limitación seria que conviene leer antes de usarla.',
        'There is a plateau, but with one serious limitation worth reading before using it.')
      : L(`Hay una meseta, pero con ${critical} limitaciones serias que conviene leer antes de usarla.`,
        `There is a plateau, but with ${critical} serious limitations worth reading before using it.`);
  }
  if (level === 'good') {
    return L('Meseta validada en el forward. Para llegar a sólida, falta probarla en un periodo no visto.',
      'A plateau validated on the forward. To reach strong, it still needs testing on an unseen period.');
  }
  if (level === 'moderate') {
    if (a.verdict.level === 'strong') {
      return L('Meseta validada en el forward, pero el periodo no visto no la confirma.',
        'A plateau validated on the forward, but the unseen period does not confirm it.');
    }
    return warnings === 1
      ? L('Meseta con apoyo real, con un aviso que conviene leer.', 'A plateau with real support, with one warning worth reading.')
      : L(`Meseta con apoyo real, con ${warnings} avisos que conviene leer.`, `A plateau with real support, with ${warnings} warnings worth reading.`);
  }
  // «Sin contradicción», no «confirmada»: la prueba del periodo no visto detecta poco
  // (core/unseen.js) y el siguiente paso lo dice; aquí no se puede decir lo contrario.
  return L('Lo máximo que estos datos pueden respaldar: una meseta validada en el forward a la que el periodo no visto no contradice.',
    'The most these data can support: a plateau validated on the forward and not contradicted by the unseen period.');
}

/** Medidor de cinco tramos: dónde está este análisis y cuánto le falta. */
function evidenceMeter(level) {
  const at = LEVEL_ORDER.indexOf(level);
  const n = LEVEL_ORDER.length;
  return `<div class="vx-meter" role="img" aria-label="${esc(L(`Fiabilidad: ${levelName(level)} (${at + 1} de ${n})`, `Reliability: ${levelName(level)} (${at + 1} of ${n})`))}">
    ${LEVEL_ORDER.map((lv, i) => `<div class="vx-seg${i <= at ? ' is-on' : ''}${i === at ? ' is-here' : ''}">
      <span class="vx-seg-bar"></span>
      <span class="vx-seg-name">${esc(levelName(lv))}</span>
    </div>`).join('')}
  </div>`;
}

/** Las tres cifras que resumen por qué fiarse (o no) de la configuración elegida. */
function keyFigures(a, best) {
  if (!best) return '';
  const nb = best.neighborhood;
  const hasF = a.meta.hasForward;
  const keep = Number.isFinite(best.medianRetention) ? best.medianRetention
    : (hasF && Number.isFinite(best.record.retention) ? best.record.retention : NaN);
  const tile = (value, label, note) => `<div class="vx-stat">
    <strong>${value}</strong>
    <span class="vx-stat-label">${label}</span>
    <span class="vx-stat-note">${note}</span>
  </div>`;
  return `<div class="vx-stats">
    ${tile(`${num(best.robust, 0)}<small>/100</small>`,
      gloss('robustness', esc(L('Robustez', 'Robustness'))),
      esc(L('Cuánto aguanta al mover sus parámetros.', 'How well it holds when its parameters move.')))}
    ${tile(nb ? `${int(nb.passing)}<small> ${L('de', 'of')} ${int(nb.observed)}</small>` : '—',
      esc(L('Vecinas que cumplen', 'Neighbors that pass')),
      esc(L('Configuraciones de al lado que también pasan tus mínimos.', 'Adjacent configurations that also clear your minimums.')))}
    ${hasF
    ? tile(Number.isFinite(keep) ? pct(keep, 0) : '—',
      gloss('retention', esc(L('Se mantiene al validar', 'Holds on validation'))),
      esc(L('Qué parte de su calidad conserva en el periodo de validación (forward).', 'How much of its quality it keeps on the validation period (forward).')))
    : tile('—',
      esc(L('Sin validar', 'Not validated')),
      esc(L('No hay periodo de validación (forward): añádelo para poder medirlo.', 'No validation period (forward): add one to measure this.')))}
  </div>`;
}

/**
 * «Qué hacer ahora»: pasos numerados en el caso habitual (hay meseta y forward, falta el
 * periodo no visto). En el resto, el texto del motor o del periodo no visto, que ya está
 * escrito para cada situación.
 */
/**
 * Cuántos parámetros lleva DE VERDAD el .set (js/export.js#buildSetFile): con el .set de la
 * optimización cargado lleva también los no optimizados, y el paso 1 no puede decir otra
 * cifra que la nota de la tarjeta.
 */
function setCounts(a, best) {
  const names = a.meta.paramNames;
  const merged = mergeSetValues(names, names.map((_, j) => String(best.record.params[j])), state.searchSet);
  return { total: merged.entries.length, optimized: merged.optimized, complete: merged.complete };
}
const setCountEs = (a, best) => {
  const c = setCounts(a, best);
  return c.complete ? `los ${c.total} parámetros del EA (${c.optimized} optimizados)` : `los ${c.optimized} parámetros que optimizaste`;
};
const setCountEn = (a, best) => {
  const c = setCounts(a, best);
  return c.complete ? `all ${c.total} EA parameters (${c.optimized} optimized)` : `the ${c.optimized} parameters you optimized`;
};

function nextSteps(a, best, hold) {
  const hasF = a.meta.hasForward;
  const step = (n, title, body, extra = '') => `<li class="vx-step">
    <span class="vx-step-n" aria-hidden="true">${n}</span>
    <div><strong>${title}</strong><p>${body}</p>${extra}</div>
  </li>`;
  let steps;
  if (best && hasF && !hold.done) {
    steps = [
      step(1, esc(L('Descarga el .set', 'Download the .set')),
        esc(L(`Lleva ${setCountEs(a, best)} de la pasada ${best.record.id}. En el probador de MT5, pestaña de parámetros de entrada («Inputs»): clic derecho sobre la tabla → «Cargar» («Load») y elige el archivo.`,
          `It carries ${setCountEn(a, best)} of pass ${best.record.id}. In the MT5 tester's “Inputs” tab, right-click the table → “Load” and choose the file.`))),
      step(2, esc(L('Pruébala en un periodo que no hayas usado', 'Test it on a period you have not used')),
        esc(L('Ni para optimizar ni para validar: por ejemplo, los meses posteriores a tu forward. Decide antes qué resultado darás por bueno.',
          'Neither for optimizing nor for validating: for example, the months after your forward. Decide beforehand what result you will accept.'))),
      step(3, esc(L('Compruébalo aquí', 'Check it here')),
        esc(L('Suelta el informe de ese backtest y Orometra te dirá si el resultado es normal para esta configuración.',
          'Drop that backtest report and Orometra will tell you whether the result is normal for this configuration.')),
        `<button class="text-btn vx-step-cta" data-goto="unseen">${L('Ir al periodo no visto &rarr;', 'Go to unseen period &rarr;')}</button>`),
    ];
  } else if (best && !hasF) {
    steps = [
      step(1, esc(L('Vuelve a optimizar con forward', 'Re-optimize with a forward')),
        esc(L('En el probador de MT5 activa Forward (por ejemplo, 1/3). Puedes acotar la búsqueda con el rango para reoptimizar.',
          'In the MT5 tester enable Forward (for example, 1/3). You can narrow the search with the range to re-optimize.'))),
      step(2, esc(L('Exporta las dos pestañas', 'Export both tabs')),
        esc(L('La de resultados y la de forward, cada una a XML.', 'The results tab and the forward tab, each to XML.'))),
      step(3, esc(L('Suéltalas aquí', 'Drop them here')),
        esc(L('Con el periodo de validación, la evidencia puede pasar de débil.', 'With the validation period, the evidence can go beyond weak.'))),
    ];
  } else if (!best) {
    // Sin zona estable el motor solo dice «refina la optimización»: aquí, cómo.
    const insufficient = a.verdict.level === 'insufficient';
    steps = [
      step(1, esc(L('Mira qué falla', 'See what fails')),
        esc(L('El diagnóstico muestra qué mínimos dejan fuera a la mayoría de configuraciones.', 'Diagnostics shows which minimums rule out most configurations.')),
        `<button class="text-btn vx-step-cta" data-goto="diagnostics">${L('Ir al diagnóstico &rarr;', 'Go to diagnostics &rarr;')}</button>`),
      step(2, esc(L('Ajusta la optimización', 'Adjust the optimization')),
        esc(insufficient
          ? L('Amplía el rango de los parámetros o añade valores intermedios; si tus mínimos son muy exigentes, relájalos.', 'Widen the parameter ranges or add intermediate values; if your minimums are very demanding, relax them.')
          : L('Amplía el rango o afina el paso de los parámetros: una meseta necesita configuraciones vecinas que también funcionen.', 'Widen the range or refine the parameter step: a plateau needs neighboring configurations that also work.'))),
      step(3, esc(L('Vuelve a analizar', 'Analyze again')),
        esc(L('Exporta de nuevo los resultados y suéltalos aquí.', 'Export the results again and drop them here.'))),
    ];
  }
  const body = steps
    ? `<ol class="vx-steps">${steps.join('')}</ol>`
    : `<p class="vx-next-text">${esc(nextStepText(a, hold))}</p>`;
  return `<div class="vx-next">
    <h3 class="vx-label">${esc(L('Qué hacer ahora', 'What to do now'))}</h3>
    ${body}
  </div>`;
}

/** La tarjeta principal: qué configuración usar, su fiabilidad y qué hacer ahora. */
function renderDecision(a, dv, best, hold) {
  const c = verdictCopy(dv.level);
  const hasF = a.meta.hasForward;
  let pick;
  if (best) {
    // Sin forward no hay .set de despliegue (ver doExport): se ofrece el rango de
    // refinamiento, que sí tiene sentido.
    const actions = `<div class="vx-actions">
      ${hasF
    ? `<button class="primary-btn" data-export="set" data-plateau-index="${best.rank - 1}">${L('Descargar .set', 'Download .set')}</button>`
    : `<button class="primary-btn" data-export="refine" data-plateau-index="${best.rank - 1}">${L('Descargar rango para reoptimizar', 'Download range to re-optimize')}</button>`}
      <button class="ghost-btn" data-copy="${best.rank - 1}">${L('Copiar parámetros', 'Copy parameters')}</button>
    </div>`;
    pick = `<span class="vx-label">${esc(L('Qué configuración usar', 'Which configuration to use'))}</span>
      <div class="vx-pass">${L('Pasada', 'Pass')} <b>${esc(best.record.id)}</b></div>
      <p class="vx-pass-note">${esc(hasF
    ? L(`Elegida dentro de una meseta de ${int(best.size)} configuraciones parecidas, por su buen puesto en el periodo optimizado y en el forward (promediado con sus vecinas).`,
      `Chosen within a plateau of ${int(best.size)} similar configurations, for ranking well on both the optimized period and the forward (averaged with its neighbors).`)
    : L(`Elegida dentro de una meseta de ${int(best.size)} configuraciones parecidas, por su buen puesto en el periodo optimizado (promediado con sus vecinas).`,
      `Chosen within a plateau of ${int(best.size)} similar configurations, for ranking well on the optimized period (averaged with its neighbors).`))}</p>
      <div class="t3-param-chips vx-params" aria-label="${esc(L('Valores recomendados', 'Recommended values'))}">
        ${a.meta.paramNames.map((n, j) => `<span>${esc(n)} <b>${paramHtml(best.record.params[j])}</b></span>`).join('')}
      </div>
      ${actions}
      ${hasF ? `<p class="vx-fine">${esc(setCoverageNote(a, best, state.searchSet))}</p>` : ''}`;
  } else if (a.fallback) {
    pick = `<span class="vx-label">${esc(L('Qué configuración usar', 'Which configuration to use'))}</span>
      <div class="vx-pass vx-pass-risk">${esc(L('Ninguna con garantías', 'None you can rely on'))}</div>
      <p class="vx-pass-note">${L('Sugerencia orientativa:', 'Tentative suggestion:')} <b class="mono">${L('Pasada', 'Pass')} ${esc(a.fallback.record.id)}</b>. ${fallbackNote(a)}</p>`;
  } else {
    pick = `<span class="vx-label">${esc(L('Qué configuración usar', 'Which configuration to use'))}</span>
      <div class="vx-pass vx-pass-risk">${esc(t('verdict.nopick'))}</div>
      <p class="vx-pass-note">${esc(L('Ninguna meseta cumple tus mínimos con estabilidad suficiente.', 'No plateau meets your minimums with enough stability.'))}</p>`;
  }
  return `<section class="vx ${c.cls}" aria-label="${esc(L('Veredicto', 'Verdict'))}">
    <h2 class="sr-only">${esc(dv.headline)}</h2>
    <div class="vx-main">
      <div class="vx-pick">${pick}</div>
      <div class="vx-trust">
        <span class="vx-label">${esc(L('Fiabilidad', 'Reliability'))}</span>
        ${evidenceMeter(dv.level)}
        <p class="vx-trust-line">${esc(trustLine(a, dv.level))}</p>
        ${keyFigures(a, best)}
      </div>
    </div>
    ${nextSteps(a, best, hold)}
  </section>`;
}

export function renderVerdict(a) {
  const v = a.verdict;
  const dv = displayVerdictCopy(a);
  const best = a.plateaus[0];
  const hold = holdoutFact(a);
  const demoNote = state.isDemo
    ? `<div class="demo-note">${L(
      `Estos datos son <strong>sintéticos</strong>, generados por la aplicación para que puedas ver el flujo completo. La meseta real está plantada en: ${esc(Object.entries(state.demoTruth.center).map(([k, val]) => `${k}=${val}`).join(', '))}.`,
      `These data are <strong>synthetic</strong>, generated by the app so you can see the full flow. The real plateau is planted at: ${esc(Object.entries(state.demoTruth.center).map(([k, val]) => `${k}=${val}`).join(', '))}.`,
    )}</div>`
    : '';

  const src = state.source;
  const stamp = src
    // Los nombres de archivo ya estan justo encima, en la ficha plegada de carga.
    ? `<div class="run-stamp">
        <span>${esc(configsLabel(a))}</span>
        <span class="run-sep">·</span>
        <span>${esc(L('analizado', 'analyzed'))} ${esc(src.at.toLocaleString(localeTag(), { dateStyle: 'short', timeStyle: 'short' }))}</span>
        <span class="run-sep">·</span>
        <span title="${esc(L('Mínimos exigidos en este análisis: factor de beneficio, drawdown máximo y operaciones', 'Minimums required in this analysis: profit factor, maximum drawdown and trades'))}">${esc(L('Mínimos', 'Minimums'))}: PF ≥ ${num(a.meta.policy.gates.minProfitFactor, 2)} · ${esc(L('drawdown', 'drawdown'))} ≤ ${num(a.meta.policy.gates.maxDrawdownPct, 0)} % · ${int(a.meta.minTradesIs)} ${esc(L('operaciones', 'trades'))}</span>
        <span class="run-sep">·</span>
        <span class="run-holdout" title="${esc(hold.note)}">${esc(hold.short)}</span>
      </div>`
    : '';

  // "Por qué" abre con los primeros 4 pros y 4 contras. Del resto de hallazgos: los que
  // ya tienen una tabla propia en Diagnostico/Parametros (Sharpe, cobertura, estabilidad
  // interna...) se muestran alli, junto al numero que narran, no aqui otra vez; los que
  // no tienen tabla en ningun sitio quedan en "Más hallazgos". "plateau" no se muestra en
  // ningun sitio aparte: el aviso de la tarjeta de la meseta ya lo explica con mas
  // contexto (que parametro exacto, en que configuracion).
  const highlights = whyGradeHighlights(a);
  const shown = new Set([...highlights.pros, ...highlights.cons]);
  const restFindings = v.findings.filter((f) => !shown.has(f) && !categorizeFinding(f));

  // Debajo de la tarjeta principal, en este orden: el porqué (en lenguaje llano), las
  // alternativas si las hay y, plegado, el detalle técnico para quien lo quiera.
  const details = [
    detailPanel(L('Qué demuestran estos datos', 'What these data demonstrate'),
      L('Meseta, cobertura, vecinas, validación, bordes y periodo no visto, cifra a cifra.', 'Plateau, coverage, neighbors, validation, edges and unseen period, figure by figure.'),
      renderEvidenceSheet(a, best)),
    best ? detailPanel(L('Dónde volver a optimizar', 'Where to re-optimize'),
      L('El rango de cada parámetro dentro de la meseta y el sugerido para afinar.', 'Each parameter\'s range inside the plateau and the one suggested to refine.'),
      renderStableRanges(a, best)) : '',
    restFindings.length ? detailPanel(L('Más hallazgos del motor', 'More engine findings'),
      L(`${restFindings.length} ${restFindings.length === 1 ? 'observación' : 'observaciones'} más del análisis.`, `${restFindings.length} more ${restFindings.length === 1 ? 'observation' : 'observations'} from the analysis.`),
      `<ul class="findings">
        ${restFindings.map((f) => `<li class="finding f-${f.severity === 'critical' ? 'block' : f.severity}">
          <div class="finding-mark" aria-hidden="true"></div>
          <div><strong>${esc(f.title)}</strong><p>${rich(f.detail)}</p></div>
        </li>`).join('')}
      </ul>`) : '',
    a.meta.hasForward ? detailPanel(L('Gráficos: optimización frente a validación', 'Charts: optimization vs validation'),
      L('Cuánto se degrada cada configuración y qué les pasa a tus mejores.', 'How much each configuration degrades and what happens to your best ones.'),
      `<div class="grid-secondary chart-pair">
        <div>
          <h3>${L('Calidad en la optimización frente a la validación', 'Quality in optimization vs validation')}</h3>
          ${scatterIsOos(a)}
          <p class="chart-note">${L(
            'Cada punto es una configuración. La diagonal marca &laquo;no se degrada&raquo;. Los puntos por debajo pierden calidad fuera de la muestra. En lavanda, las que forman meseta.',
            'Each point is a configuration. The diagonal marks &ldquo;no degradation&rdquo;. Points below lose quality out of sample. In lavender, those that form a plateau.',
          )}</p>
        </div>
        <div>
          <h3>${L('Qué les pasa a tus mejores', 'What happens to your best ones')}</h3>
          ${degradationChart(a)}
          <p class="chart-note">${L(
            'Las configuraciones, en diez grupos según su puesto en la optimización (D10 = tu 10 % mejor). Si D10 no destaca en la validación, el orden de MT5 no predice nada.',
            'Configurations in ten groups by their optimization rank (D10 = your best 10%). If D10 does not stand out on validation, the MT5 order predicts nothing.',
          )}</p>
        </div>
      </div>`) : '',
  ].filter(Boolean).join('');

  // El título de la página ya dice el nivel: la tarjeta va primero y los datos del
  // análisis (pasadas, fecha, mínimos), que son contexto, justo debajo.
  return `${renderOutcomeBanner(a)}
  ${renderDecision(a, dv, best, hold)}
  ${stamp}
  ${demoNote}
  ${renderWhyGrade(a, highlights, dv.summary)}
  ${renderTop3(a)}
  ${details ? `<h2 class="vx-section-title">${L('Detalle técnico', 'Technical detail')}</h2>${details}` : ''}`;
}

/** Bloque plegable del detalle técnico: cerrado por defecto, con una línea de qué hay dentro. */
function detailPanel(title, hint, body) {
  return `<details class="panel vx-detail">
    <summary class="panel-head compact"><div><h2>${title}</h2><p class="vx-detail-hint">${hint}</p></div></summary>
    <div class="panel-body">${body}</div>
  </details>`;
}

export function samplingLabel(sampling) {
  return {
    grid: L('probaste todas las configuraciones', 'you tested every configuration'),
    partial: L('probaste una parte de las configuraciones', 'you tested part of the configurations'),
    sparse: L('probaste una muestra (optimización genética)', 'you tested a sample (genetic optimization)'),
  }[sampling] || sampling;
}

export function renderOutcomeBanner(a) {
  const outcome = outcomeFromAnalysis(a);
  if (outcome.code === CODE.ANALYSIS_SUCCESS) return '';
  const copy = errorCopy(outcome.code, L);
  const cls = {
    [CODE.NO_QUALIFYING_CONFIGS]: 'outcome-no-qualifying',
    [CODE.INSUFFICIENT_DATA]: 'outcome-insufficient',
    [CODE.NO_PLATEAU]: 'outcome-no-plateau',
  }[outcome.code] || 'outcome-other';
  return `<section class="outcome-banner ${cls}" role="status">
    <strong>${esc(copy.title)}</strong>
    <p>${esc(copy.hint)}</p>
  </section>`;
}

export function renderEvidenceSheet(a, best) {
  const hasF = a.meta.hasForward;
  const cov = a.meta.coverage;
  const sc = a.meta.searchCoverage;
  let covTxt = Number.isFinite(cov)
    ? `${nf(cov >= 0.1 ? 1 : 4).format(cov * 100)} % · ${samplingLabel(a.meta.sampling)}`
    : '—';
  if (sc && sc.usable && Number.isFinite(sc.coverageSearch)) {
    covTxt += L(
      ` · .set ${nf(sc.coverageSearch >= 0.1 ? 1 : 2).format(sc.coverageSearch * 100)} %`,
      ` · .set ${nf(sc.coverageSearch >= 0.1 ? 1 : 2).format(sc.coverageSearch * 100)} %`,
    );
  }

  const covNote = sc && sc.usable && Number.isFinite(sc.coverageSearch)
    ? L(
      'Primero: fracción de la malla de niveles vistos en el archivo. Segundo (.set): fracción del espacio que pediste en MT5. Un genético puede subir el primero y dejar el segundo muy bajo.',
      'First: fraction of the seen-level grid in the file. Second (.set): fraction of the space you asked MT5 for. A genetic search can inflate the first while leaving the second very low.',
    )
    : L(
      'Fracción del espacio de niveles vistos en tus archivos — no del rango del .set. Suelta el .set de la optimización para contrastarlo.',
      'Fraction of the seen-level space in your files — not the .set range. Drop the optimization .set to check it against the range you asked for.',
    );
  const nb = best && best.neighborhood;
  let neighborsVal = '—';
  let neighborsNote = L('Sin meseta seleccionada', 'No plateau selected');
  if (nb) {
    neighborsVal = `${int(nb.passing)} / ${int(nb.observed)}`;
    const bits = [
      a.meta.hasForward && a.meta.selectionMode !== 'joint'
        ? L(`${int(nb.passing)} cumplen tus mínimos en el periodo optimizado`, `${int(nb.passing)} clear your minimums on the optimized period`)
        : L(`${int(nb.passing)} pasan mínimos`, `${int(nb.passing)} pass minimums`),
      L(`${int(nb.failing)} fallan`, `${int(nb.failing)} fail`),
    ];
    if (nb.slotsComplete && Number.isFinite(nb.gaps)) {
      bits.push(L(`${int(nb.gaps)} huecos no observados (de ${int(nb.slots)})`, `${int(nb.gaps)} unobserved gaps (of ${int(nb.slots)})`));
    } else {
      bits.push(L('huecos no estimables en este muestreo', 'gaps not estimable for this sampling'));
    }
    neighborsNote = bits.join(' · ');
  }

  const retentionVal = best && Number.isFinite(best.medianRetention)
    ? pct(best.medianRetention, 0)
    : (best && hasF && Number.isFinite(best.record.retention) ? pct(best.record.retention, 0) : '—');
  const retentionNote = hasF
    ? L('Mediana de la meseta: calidad en el forward ÷ calidad en el periodo optimizado', 'Plateau median: forward quality ÷ optimized-period quality')
    : L('Sin archivo forward', 'No forward file');

  const boundaryVal = best
    ? (best.boundary.length
      ? L(`Sí · ${best.boundary.map((b) => b.name).join(', ')}`, `Yes · ${best.boundary.map((b) => b.name).join(', ')}`)
      : L('No', 'No'))
    : '—';
  const boundaryNote = L(
    'Si toca el borde, la meseta podría continuar fuera del rango que optimizaste.',
    'If it touches the edge, the plateau may continue outside the range you optimized.',
  );

  const hold = holdoutFact(a);
  const holdoutVal = hold.value;
  const holdoutNote = hold.note;

  const plateauVal = best
    ? L(`Encontrada · ${int(best.size)} configuraciones parecidas`, `Found · ${int(best.size)} similar configurations`)
    : L('No encontrada', 'Not found');

  const rows = [
    [L('Meseta', 'Plateau'), plateauVal, L('Configuraciones vecinas que también funcionan, no un pico aislado.', 'Neighboring configurations that also work, not an isolated peak.')],
    [L('Cobertura de la optimización', 'Optimization coverage'), covTxt, covNote],
    [L('Vecinas que cumplen (de las observadas)', 'Neighbors that pass (of those observed)'), neighborsVal, neighborsNote],
    [L('Se mantiene al validar', 'Holds on validation'), retentionVal, retentionNote],
    [L('Toca el borde del rango', 'Touches the range edge'), boundaryVal, boundaryNote],
    [L('Periodo no visto', 'Unseen period'), holdoutVal, holdoutNote],
  ];

  return `<div class="panel-evidence-sheet" aria-label="${esc(L('Hoja de evidencia', 'Evidence sheet'))}">
    <div class="evidence-sheet">
      ${rows.map(([label, value, note]) => `<div class="evidence-sheet-row" title="${esc(note)}">
        <span>${esc(label)}</span>
        <strong>${esc(value)}</strong>
        <em>${esc(note)}</em>
      </div>`).join('')}
    </div>
    <p class="chart-note">${a.meta.hasForward ? L(
      'El forward ya se usó para validar y ordenar las mesetas. Una meseta es estabilidad en tus datos, no una promesa de beneficio futuro.',
      'The forward was already used to validate and rank plateaus. A plateau is stability in your data, not a promise of future profit.',
    ) : L(
      'Sin forward, todo está medido sobre los datos con los que se optimizó. Una meseta es estabilidad en tus datos, no una promesa de beneficio futuro.',
      'Without a forward, everything is measured on the data used to optimize. A plateau is stability in your data, not a promise of future profit.',
    )}</p>
  </div>`;
}

/** Primeros 4 pros y 4 contras: lo que abre "Why this evidence grade". Se calcula
 * aparte para poder excluirlos de "Engine findings" y no repetir el mismo texto dos
 * veces en la misma pestana. */
export function whyGradeHighlights(a) {
  const findings = a.verdict.findings || [];
  const pros = findings.filter((f) => f.severity === 'ok' || f.severity === 'info').slice(0, 4);
  const cons = findings.filter((f) => f.severity === 'warn' || f.severity === 'critical').slice(0, 4);
  return { pros, cons };
}

export function renderWhyGrade(a, highlights, summary = '') {
  const { pros, cons } = highlights;
  if (!pros.length && !cons.length && !summary) return '';
  const item = (f, mark) => `<li><span class="why-mark" aria-hidden="true">${mark}</span><div><strong>${esc(f.title)}</strong><span>${rich(f.detail)}</span></div></li>`;
  const col = (title, items, cls, mark) => `<div class="why-col ${cls}">
    <h3>${esc(title)}</h3>
    <ul>${items.map((f) => item(f, mark)).join('')}</ul>
  </div>`;
  // Sin puntos en contra (o a favor) no se reserva media pantalla vacía: una línea basta.
  const emptyLine = (title) => `<p class="why-none"><strong>${esc(title)}:</strong> ${L('nada destacado', 'nothing notable')}.</p>`;
  const proTitle = L('A favor', 'In favor');
  const conTitle = L('En contra / límites', 'Against / limits');
  const grid = !pros.length && !cons.length
    ? ''
    : !cons.length
      ? `${col(proTitle, pros, 'why-pros', '✓')}${emptyLine(conTitle)}`
      : !pros.length
        ? `${col(conTitle, cons, 'why-cons', '!')}${emptyLine(proTitle)}`
        : `${col(proTitle, pros, 'why-pros', '✓')}${col(conTitle, cons, 'why-cons', '!')}`;
  return `<section class="panel panel-why">
    <div class="panel-head compact">
      <div>
        <h2>${L('Por qué este nivel', 'Why this level')}</h2>
      </div>
    </div>
    ${summary ? `<p class="why-summary">${esc(summary)}</p>` : ''}
    ${grid ? `<div class="why-grid${pros.length && cons.length ? '' : ' why-grid-one'}">${grid}</div>` : ''}
  </section>`;
}

export function renderStableRanges(a, best) {
  const sens = a.sensitivity || [];
  const rows = (best.refinement || []).filter((r) => !r.constant && !r.fixed && !r.categorical && r.levels > 1);
  const spanOf = (name) => {
    const j = a.meta.paramNames.indexOf(name);
    const sp = j >= 0 && best.paramSpan ? best.paramSpan[j] : null;
    if (!sp) return '—';
    return sp.min === sp.max ? paramHtml(sp.min) : `${paramHtml(sp.min)} – ${paramHtml(sp.max)}`;
  };
  if (!rows.length) return '';
  // Posicion RELATIVA, no "Alta/Media/Baja" absolutos: la medida combinada sale alta
  // tambien con ruido puro (en un dataset aleatorio daba 0,78-0,94 a todos), asi que un
  // umbral fijo ponia "Alta" a todos los parametros y no informaba de nada.
  const ranked = [...sens]
    .filter((x) => !x.constant && Number.isFinite(x.effective ?? x.sensitivity))
    .sort((x, y) => (y.effective ?? y.sensitivity) - (x.effective ?? x.sensitivity))
    .map((x) => x.name);
  const sensLabel = (name) => {
    const k = ranked.indexOf(name);
    if (k < 0) return '—';
    return L(`${k + 1}.º de ${ranked.length}`, `${k + 1} of ${ranked.length}`);
  };
  return `<div class="panel-ranges">
    <div class="vx-detail-actions">
      <button class="ghost-btn" data-export="refine" data-plateau-index="${best.rank - 1}">${L('Descargar .set de refinamiento', 'Download refinement .set')}</button>
    </div>
    <p class="chart-note">${L(
      'Centro = configuración recomendada. «Meseta» es lo que ocupan de verdad sus configuraciones; «Refinamiento», el rango sugerido para volver a optimizar alrededor del centro (el del .set de refinamiento). Ninguno de los dos es un intervalo de confianza.',
      'Center = recommended configuration. "Plateau" is what its configurations actually cover; "Refinement" is the suggested range to re-optimize around the center (the one in the refinement .set). Neither is a confidence interval.',
    )}</p>
    <div class="range-table-wrap">
      <table class="range-table">
        <thead>
          <tr>
            <th>${L('Parámetro', 'Parameter')}</th>
            <th>${L('Centro', 'Center')}</th>
            <th>${L('Meseta', 'Plateau')}</th>
            <th>${L('Refinamiento', 'Refinement')}</th>
            <th>${L('Influencia (puesto)', 'Influence (rank)')}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => `<tr>
            <td>${esc(r.name)}</td>
            <td class="mono">${paramHtml(r.center)}</td>
            <td class="mono">${spanOf(r.name)}</td>
            <td class="mono">${paramHtml(r.start)} – ${paramHtml(r.stop)}</td>
            <td>${sensLabel(r.name)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

/**
 * Las tres mejores configuraciones, una al lado de otra y con TODOS sus parametros.
 *
 * Se comparan en columnas a propósito: cuando tres mesetas independientes coinciden
 * en el valor de un parámetro, ese valor es una conclusión solida del analisis. Y
 * donde discrepan, es que ese parámetro no decide el resultado, así que puedes
 * elegirlo por criterios operativos y dejar de afinarlo.
 */
export function renderTop3(a) {
  // La recomendada ya está arriba, en la tarjeta principal, con su .set. Aquí solo se
  // muestran las alternativas (otras regiones estables independientes) y la comparación
  // de las tres, si las hay. Sin meseta, la tarjeta principal ya explica qué falta.
  const top = a.plateaus.slice(0, 3);
  if (top.length < 2) return '';
  const names = a.meta.paramNames;
  const agree = names.map((_, j) => {
    const vals = top.map((p) => p.record.params[j]);
    return vals.every((v) => v === vals[0]);
  });
  const agreeCount = agree.filter(Boolean).length;
  const WORD = {
    2: L('dos', 'two'),
    3: L('tres', 'three'),
  };
  const word = WORD[top.length] || String(top.length);
  const hasF = a.meta.hasForward;
  const alts = top.slice(1);
  const zone = (p) => L(`Meseta ${p.rank}`, `Plateau ${p.rank}`);

  const flagBadges = (p) => {
    const flags = [];
    if (p.invertedRisk && p.invertedRisk.length) {
      flags.push(`<span class="badge warn" title="${esc(L('Se apoya en un valor que el forward castiga', 'It relies on a value the forward punishes'))}">${L('valor castigado', 'punished value')}</span>`);
    }
    if (p.boundary.length) {
      flags.push(`<span class="badge warn" title="${esc(L('Pegada al borde del rango probado', 'Stuck to the edge of the tested range'))}">${L('borde', 'edge')}</span>`);
    }
    // La configuracion elegida puede fallar tus minimos en el forward: la meseta se
    // descubre en el in-sample. Que el chip diga "sin avisos" en ese caso era mentir.
    if (hasF && p.record.failsOos && p.record.failsOos.length) {
      flags.push(`<span class="badge warn" title="${esc(L('Esta configuración no cumple tus mínimos en el forward', 'This configuration does not meet your minimums on the forward'))}">${L('falla al validar', 'fails on validation')}</span>`);
    }
    if (p.oosValidation && p.oosValidation.passFrac < 0.5) {
      flags.push(`<span class="badge warn" title="${esc(L('Menos de la mitad de la meseta cumple tus mínimos en el forward', 'Less than half of the plateau meets your minimums on the forward'))}">${L('frágil al validar', 'fragile on validation')}</span>`);
    }
    return flags.join(' ') || `<span class="badge ok">${L('sin avisos', 'no warnings')}</span>`;
  };

  const altCards = `<div class="t3-alts">
    ${alts.map((p, i) => `<article class="t3-alt">
      <div class="t3-rank">${L(`Alternativa ${i + 1}`, `Alternative ${i + 1}`)} · ${zone(p)}</div>
      <div class="t3-pass">${L('Pasada', 'Pass')} ${esc(p.record.id)}</div>
      <div class="t3-score t3-score-sm">${num(p.robust, 0)}<small>${L('de 100 · robustez', 'of 100 · robustness')}</small></div>
      <div class="t3-flags">${flagBadges(p)}</div>
      <p class="t3-alt-meta">${int(p.size)} ${L('configuraciones', 'configurations')} · ${int(p.stability.support)} ${L('vecinas', 'neighbors')}</p>
      <div class="t3-alt-actions">
        ${a.meta.hasForward ? `<button class="ghost-btn t3-btn-inline" data-export="set" data-plateau-index="${p.rank - 1}">${L('Descargar .set', 'Download .set')}</button>` : ''}
        <button class="text-btn t3-btn-inline" data-plateau="${p.rank - 1}">${L('Detalle →', 'Detail →')}</button>
      </div>
    </article>`).join('')}
  </div>`;

  const header = top.map((p, i) => `<th class="t3-col ${i === 0 ? 't3-best' : ''}">
      <div class="t3-rank">${i === 0 ? L('Recomendada', 'Recommended') : L(`Alternativa ${i}`, `Alternative ${i}`)}</div>
      <div class="t3-pass">${L('Pasada', 'Pass')} ${esc(p.record.id)}</div>
    </th>`).join('');

  const metricRow = (label, fn, cls = '') => `<tr class="${cls}">
    <th class="t3-label">${label}</th>
    ${top.map((p, i) => `<td class="t3-col ${i === 0 ? 't3-best' : ''}">${fn(p)}</td>`).join('')}
  </tr>`;

  const paramRows = names.map((n, j) => `<tr class="${agree[j] ? 't3-agree' : ''}">
    <th class="t3-label mono">${esc(n)}${agree[j] ? `<span class="t3-tick" title="${esc(L(`Coinciden las ${word}`, `The ${word} agree`))}">✓</span>` : ''}</th>
    ${top.map((p, i) => `<td class="t3-col t3-value ${i === 0 ? 't3-best' : ''}">${paramHtml(p.record.params[j])}</td>`).join('')}
  </tr>`).join('');

  return `<section class="panel t3-panel">
    <div class="panel-head">
      <div>
        <h2>${L('Otras mesetas', 'Other plateaus')}</h2>
      </div>
      <div class="t3-consensus">
        <strong>${L(`${agreeCount} de ${names.length}`, `${agreeCount} of ${names.length}`)}</strong>
        <span>${L(`parámetros en los que coinciden las ${word}`, `parameters where the ${word} agree`)}</span>
      </div>
    </div>
    <p class="panel-intro">${L(
      'Mesetas independientes de la recomendada: útiles si esa choca con algún criterio tuyo. Las filas con <span class="t3-tick">✓</span> son lo más sólido del análisis: las mesetas coinciden en ese valor.',
      'Plateaus independent of the recommended one: useful if it clashes with a criterion of yours. Rows with <span class="t3-tick">✓</span> are the most solid part of the analysis: the plateaus agree on that value.',
    )}</p>
    ${altCards}
    <div class="table-wrap t3-compare-wrap">
      <table class="t3-table">
        <thead><tr><th class="t3-label">${L('Comparación', 'Comparison')}</th>${header}</tr></thead>
        <tbody>
          ${metricRow(L('Meseta', 'Plateau'), (p) => `${zone(p)} · ${int(p.size)}`)}
          ${metricRow(gloss('quality', L('Calidad al optimizar', 'Quality when optimizing')), (p) => `${num(p.record.qualityIs, 2)} <em class="t3-tag">${esc(qualityLabel(p.record.qualityIs))}</em>`)}
          ${hasF ? metricRow(L('Calidad al validar', 'Quality on validation'), (p) => `${num(p.record.qualityOos, 2)} <em class="t3-tag">${esc(qualityLabel(p.record.qualityOos))}</em>`) : ''}
          ${hasF ? metricRow(L('Al validar · PF / drawdown / operaciones', 'On validation · PF / drawdown / trades'), (p) => `${num(p.record.oos.profitFactor, 2)} / ${num(p.record.oos.drawdown, 1)} % / ${int(p.record.oos.trades)}`) : ''}
          ${metricRow(L('Al optimizar · PF / drawdown / operaciones', 'When optimizing · PF / drawdown / trades'), (p) => `${num(p.record.is.profitFactor, 2)} / ${num(p.record.is.drawdown, 1)} % / ${int(p.record.is.trades)}`)}
          <tr class="t3-params-head"><th class="t3-label" colspan="${top.length + 1}">${L('Parámetros de entrada', 'Input parameters')}</th></tr>
          ${paramRows}
        </tbody>
      </table>
    </div>
  </section>`;
}
