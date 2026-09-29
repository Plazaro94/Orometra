// Veredicto, evidencia, why-grade, outcome y top3.

import { qualityLabel } from '../core/metrics.js';
import { compareParams } from '../core/report.js';
import { outcomeFromAnalysis, CODE, errorCopy } from '../core/errors.js';
import { scatterIsOos, degradationChart } from './charts.js';
import { t, L, localeTag } from './i18n.js';
import { state, num, int, pct, esc, rich, nf, paramHtml, categorizeFinding } from './ui-state.js';

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
  return { label: t('verdict.strong'), cls: 'v-go' };
}

/** Estado del holdout para sello / hoja de evidencia (forward ≠ periodo no visto). */
export function holdoutFact(a) {
  const res = state.unseen && state.unseen.result;
  if (!res) {
    return {
      value: L('No aportado', 'Not supplied'),
      note: a && a.meta && a.meta.hasForward
        ? L('El forward ya se usó para validar. Falta un periodo no visto.', 'The forward was already used to validate. An unseen period is still missing.')
        : L('Validación independiente aún no cargada.', 'Independent validation not loaded yet.'),
      short: L('Periodo no visto: no aportado', 'Unseen period: not supplied'),
      done: false,
      ok: false,
    };
  }
  const value = res.level === 'normal'
    ? L('Normal', 'Normal')
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
  } else if (idx > 0) {
    problem = L(`Se evaluó la meseta M${idx + 1}, no la recomendada (M1).`, `Plateau M${idx + 1} was evaluated, not the recommended one (M1).`);
  }
  return {
    value: problem ? L(`${value} · no valida`, `${value} · does not validate`) : value,
    note: problem || res.headline || '',
    short: problem
      ? L(`Periodo no visto: ${value} · no valida`, `Unseen period: ${value} · does not validate`)
      : L(`Periodo no visto: ${value}`, `Unseen period: ${value}`),
    done: true,
    ok: !problem && res.level === 'normal',
  };
}

/**
 * Evidencia "fuerte" sin holdout limpio se muestra como moderada: el forward ya se usó.
 */
export function displayVerdictLevel(a) {
  let level = a.verdict.level;
  if (level === 'strong' && a.meta.hasForward) {
    const h = holdoutFact(a);
    if (!h.done || !h.ok) level = 'moderate';
  }
  return level;
}

/**
 * Titular y resumen coherentes con el nivel MOSTRADO, no con el que calculó el
 * motor. displayVerdictLevel() rebaja "sólida" a "moderada" cuando falta un
 * holdout limpio, pero a.verdict.headline/summary siguen siendo el texto que
 * el motor generó para "sólida" -- usarlos tal cual contradice al sello (un
 * recuadro moderado/ámbar con el titular "Evidencia sólida" encima).
 */
export function displayVerdictCopy(a) {
  const level = displayVerdictLevel(a);
  const v = a.verdict;
  if (level === v.level) return { level, headline: v.headline, summary: v.summary };
  // Unico caso posible hoy: sólida -> moderada por falta de holdout.
  return {
    level,
    // El titular empieza por el nivel MOSTRADO. Antes decia "Evidencia sólida, aún sin
    // validar" bajo un sello "moderada": la frase mas leida admitia dos lecturas.
    headline: L('Evidencia moderada: meseta sólida, falta el periodo no visto', 'Moderate evidence: solid plateau, unseen period still missing'),
    summary: L(
      'La región propuesta se apoya en vecinos que también superan tus mínimos y aguanta al mover los umbrales: con in-sample y forward no se puede pedir más. Se queda en moderada porque el forward ya se ha usado para validar y ordenar las mesetas, y falta un periodo que no hayas tocado para confirmarla.',
      'The proposed region rests on neighbors that also clear your minima and holds when thresholds are moved: in-sample and forward cannot give more. It stays at moderate because the forward was already used to validate and rank the plateaus, and a period you have not touched is still missing to confirm it.',
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
    : L(' Ninguna configuración cumple tus mínimos en los dos periodos: esta solo los cumple en el in-sample.',
      ' No configuration meets your minima in both periods: this one only meets them in-sample.');
  return L(
    `Sin zona estable. Es la que mejor combina in-sample y forward junto con sus vecinas (${params}).${gates} No la uses sin probarla antes en un periodo no visto.`,
    `No stable region. It is the one that best combines in-sample and forward together with its neighbors (${params}).${gates} Do not use it without first testing it on an unseen period.`,
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
      'Ya ha superado el periodo no visto. Siguiente paso: pruébala en demo o en real con riesgo reducido, y compara sus resultados en vivo con el rango habitual de la meseta, no con las mejores cifras.',
      'It has already passed the unseen period. Next step: run it on demo or live with reduced risk, and compare its live results with the plateau\'s usual range, not with the best figures.',
    );
  }
  return L(
    'El periodo no visto no la confirma. Revisa en esa pestaña qué métrica falla (o si el informe es de otra configuración) antes de dar ningún paso más.',
    'The unseen period does not confirm it. Check in that tab which metric fails (or whether the report is from another configuration) before taking any further step.',
  );
}

export function renderVerdict(a) {
  const v = a.verdict;
  const dv = displayVerdictCopy(a);
  const c = verdictCopy(dv.level);
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
        <span title="${esc(L('Mínimos exigidos en este análisis', 'Minima required in this analysis'))}">PF ≥ ${num(a.meta.policy.gates.minProfitFactor, 2)} · DD ≤ ${num(a.meta.policy.gates.maxDrawdownPct, 0)} % · ${int(a.meta.minTradesIs)} ops</span>
        <span class="run-sep">·</span>
        <span class="run-holdout" title="${esc(hold.note)}">${esc(hold.short)}</span>
      </div>`
    : '';

  // Lo que el usuario viene a buscar (que configuracion y su .set) va aqui, en la
  // primera tarjeta, no cuatro bloques mas abajo. Sin forward no hay .set de despliegue
  // (ver doExport): se ofrece el rango de refinamiento, que si tiene sentido.
  const pickActions = best
    ? `<div class="verdict-actions">
        ${a.meta.hasForward
    ? `<button class="primary-btn" data-export="set" data-plateau-index="${best.rank - 1}">${L('Descargar .set', 'Download .set')}</button>`
    : `<button class="primary-btn" data-export="refine" data-plateau-index="${best.rank - 1}">${L('Descargar rango para reoptimizar', 'Download range to re-optimize')}</button>`}
        <button class="ghost-btn" data-copy="${best.rank - 1}">${L('Copiar parámetros', 'Copy parameters')}</button>
      </div>`
    : '';
  const pickBlock = best
    ? `<div class="verdict-fact">
        <span class="verdict-fact-label">${esc(t('verdict.pick'))}</span>
        <strong class="verdict-fact-value mono">${L('Pasada', 'Pass')} ${esc(best.record.id)}</strong>
        <span class="verdict-fact-note">M${best.rank} · ${int(best.size)} ${L('configs', 'configs')} · ${num(best.robust, 0)} ${L('robustez', 'robustness')}</span>
        ${pickActions}
      </div>`
    : a.fallback
      ? `<div class="verdict-fact verdict-fact-risk">
        <span class="verdict-fact-label">${L('Sugerencia orientativa', 'Tentative suggestion')}</span>
        <strong class="verdict-fact-value mono">${L('Pasada', 'Pass')} ${esc(a.fallback.record.id)}</strong>
        <span class="verdict-fact-note verdict-fact-note-full">${fallbackNote(a)}</span>
      </div>`
      : `<div class="verdict-fact">
        <span class="verdict-fact-label">${esc(t('verdict.pick'))}</span>
        <strong class="verdict-fact-value">${esc(t('verdict.nopick'))}</strong>
      </div>`;

  const holdBlock = `<div class="verdict-fact${hold.done && !hold.ok ? ' verdict-fact-risk' : ''}">
      <span class="verdict-fact-label">${L('Periodo no visto', 'Unseen period')}</span>
      <strong class="verdict-fact-value">${esc(hold.value)}</strong>
      <span class="verdict-fact-note">${esc(hold.note)}</span>
      ${!hold.done ? `<button class="text-btn verdict-fact-cta" data-goto="unseen">${L('Ir al periodo no visto &rarr;', 'Go to unseen period &rarr;')}</button>` : ''}
    </div>`;

  // El riesgo principal (el primer hallazgo warn/critical) es SIEMPRE el mismo objeto
  // que el primero de "En contra / límites" de Why Grade, un poco más abajo: mostrarlo
  // aparte en la ficha lateral era repetir la misma frase dos veces en la misma pantalla.

  // "Why this evidence grade" ya abre con los primeros 4 pros y 4 contras. Del resto de
  // hallazgos: los que ya tienen una tabla propia en Diagnostico/Parametros (Sharpe,
  // cobertura, estabilidad interna...) se muestran alli, junto al numero que narran, no
  // aqui otra vez; los que no tienen tabla en ningun sitio quedan en "More engine
  // findings" mas abajo. "plateau" no se muestra en ningun sitio aparte: el badge de
  // Top 3 y el aviso de la tarjeta de la meseta ya lo explican con mas contexto (que
  // parametro exacto, en que configuracion).
  const highlights = whyGradeHighlights(a);
  const shown = new Set([...highlights.pros, ...highlights.cons]);
  const restFindings = v.findings.filter((f) => !shown.has(f) && !categorizeFinding(f));

  // El titular ya es el titulo de la pagina (#reportTitle): aqui no se repite.
  return `${stamp}
  ${renderOutcomeBanner(a)}
  <section class="verdict-banner ${c.cls}">
    <div class="verdict-stamp-col">
      <div class="verdict-stamp">${c.label}</div>
    </div>
    <div class="verdict-body">
      <h2 class="sr-only">${esc(dv.headline)}</h2>
      ${dv.summary ? `<p>${esc(dv.summary)}</p>` : ''}
    </div>
    <div class="verdict-aside">
      ${pickBlock}
      ${holdBlock}
      <div class="verdict-fact verdict-fact-next">
        <span class="verdict-fact-label">${esc(t('verdict.next'))}</span>
        <strong class="verdict-fact-value">${esc(nextStepText(a, hold))}</strong>
      </div>
    </div>
  </section>

  ${demoNote}

  ${renderEvidenceSheet(a, best)}

  ${renderWhyGrade(a, highlights)}

  ${best ? renderStableRanges(a, best) : ''}

  ${renderTop3(a)}

  ${restFindings.length ? `<section class="panel panel-evidence">
    <div class="panel-head"><div><div class="panel-kicker">${L('Detalle', 'Detail')}</div><h2>${L('Más hallazgos del motor', 'More engine findings')}</h2></div></div>
    <ul class="findings">
      ${restFindings.map((f) => `<li class="finding f-${f.severity === 'critical' ? 'block' : f.severity}">
        <div class="finding-mark" aria-hidden="true"></div>
        <div><strong>${esc(f.title)}</strong><p>${rich(f.detail)}</p></div>
      </li>`).join('')}
    </ul>
  </section>` : ''}

  <div class="grid-secondary">
    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Transferencia', 'Transfer')}</div><h2>${L('Calidad in-sample frente a forward', 'In-sample quality vs forward')}</h2></div></div>
      ${scatterIsOos(a)}
      <p class="chart-note">${L(
        'Cada punto es una configuración. La diagonal marca &laquo;no se degrada&raquo;. Los puntos por debajo pierden calidad fuera de muestra. En verde, las que forman meseta.',
        'Each point is a configuration. The diagonal marks &laquo;no degradation&raquo;. Points below lose quality out of sample. In green, those that form a plateau.',
      )}</p>
    </section>
    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Degradación', 'Degradation')}</div><h2>${L('Qué le pasa a tus mejores', 'What happens to your best')}</h2></div></div>
      ${degradationChart(a)}
      <p class="chart-note">${L(
        'Si D10 (tus mejores in-sample) no destaca sobre el resto, el ranking que usas para elegir no tiene valor predictivo.',
        'If D10 (your best in-sample) does not stand out from the rest, the ranking you use to choose has no predictive value.',
      )}</p>
    </section>
  </div>`;
}

export function samplingLabel(sampling) {
  return {
    grid: L('rejilla completa', 'full grid'),
    partial: L('cobertura parcial', 'partial coverage'),
    sparse: L('muestreo disperso / genético', 'sparse / genetic sampling'),
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
  } else if (!sc || !sc.present) {
    covTxt += L(' · sin .set', ' · no .set');
  }

  const covNote = sc && sc.usable && Number.isFinite(sc.coverageSearch)
    ? L(
      'Primero: fracción de la malla de niveles vistos en el archivo. Segundo (.set): fracción del espacio que pediste en MT5. Un genético puede subir el primero y dejar el segundo muy bajo.',
      'First: fraction of the seen-level grid in the file. Second (.set): fraction of the space you asked MT5 for. A genetic can inflate the first while leaving the second very low.',
    )
    : L(
      'Fracción del espacio de niveles vistos en tus archivos — no del rango del .set. Suelta el .set de la optimización para contrastarlo.',
      'Fraction of the seen-level space in your files — not the .set range. Drop the optimization .set to contrast it.',
    );
  const nb = best && best.neighborhood;
  let neighborsVal = '—';
  let neighborsNote = L('Sin meseta seleccionada', 'No plateau selected');
  if (nb) {
    neighborsVal = `${int(nb.passing)} / ${int(nb.observed)}`;
    const bits = [
      a.meta.hasForward && a.meta.selectionMode !== 'joint'
        ? L(`${int(nb.passing)} pasan mínimos in-sample`, `${int(nb.passing)} pass in-sample minima`)
        : L(`${int(nb.passing)} pasan mínimos`, `${int(nb.passing)} pass minima`),
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
    ? L('Mediana de la meseta: calidad forward ÷ calidad in-sample', 'Plateau median: forward quality ÷ in-sample quality')
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
    ? L(`Encontrada · M${best.rank} · ${int(best.size)} configs`, `Found · M${best.rank} · ${int(best.size)} configs`)
    : L('No encontrada', 'Not found');

  const rows = [
    [L('Meseta', 'Plateau'), plateauVal, L('Región conexa con soporte local, no un pico aislado.', 'Connected region with local support, not an isolated peak.')],
    [L('Cobertura de la optimización', 'Optimization coverage'), covTxt, covNote],
    [L('Vecinos (pasan / observados)', 'Neighbors (pass / observed)'), neighborsVal, neighborsNote],
    [L('Retención forward', 'Forward retention'), retentionVal, retentionNote],
    [L('Toca borde del rango', 'Touches search boundary'), boundaryVal, boundaryNote],
    [L('Periodo no visto', 'Unseen period'), holdoutVal, holdoutNote],
  ];

  return `<section class="panel panel-evidence-sheet" aria-label="${esc(L('Hoja de evidencia', 'Evidence sheet'))}">
    <div class="panel-head compact">
      <div>
        <div class="panel-kicker">${L('Evidencia', 'Evidence')}</div>
        <h2>${L('Qué demuestran estos datos', 'What these data demonstrate')}</h2>
      </div>
    </div>
    <div class="evidence-sheet">
      ${rows.map(([label, value, note]) => `<div class="evidence-sheet-row" title="${esc(note)}">
        <span>${esc(label)}</span>
        <strong>${esc(value)}</strong>
        <em>${esc(note)}</em>
      </div>`).join('')}
    </div>
    <p class="chart-note">${a.meta.hasForward ? L(
      'El forward ya se usó para validar y ordenar las mesetas. Un periodo no visto es la comprobación limpia. Una meseta es estabilidad en tu muestra — no una promesa de beneficio futuro.',
      'The forward was already used to validate and rank plateaus. An unseen period is the clean check. A plateau is stability in your sample — not a promise of future profit.',
    ) : L(
      'Sin forward, todo está medido sobre los datos con los que se optimizó. Un periodo no visto es la comprobación limpia. Una meseta es estabilidad en tu muestra — no una promesa de beneficio futuro.',
      'Without a forward, everything is measured on the data used to optimize. An unseen period is the clean check. A plateau is stability in your sample — not a promise of future profit.',
    )}</p>
  </section>`;
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

export function renderWhyGrade(a, highlights) {
  const { pros, cons } = highlights;
  if (!pros.length && !cons.length) return '';
  const col = (title, items, cls) => `<div class="why-col ${cls}">
    <h3>${esc(title)}</h3>
    <ul>${items.length
      ? items.map((f) => `<li><strong>${esc(f.title)}</strong><span>${rich(f.detail)}</span></li>`).join('')
      : `<li class="why-empty">${L('Nada destacado', 'Nothing notable')}</li>`}
    </ul>
  </div>`;
  return `<section class="panel panel-why">
    <div class="panel-head compact">
      <div>
        <div class="panel-kicker">${L('Lectura', 'Reading')}</div>
        <h2>${L('Por qué este grado de evidencia', 'Why this evidence grade')}</h2>
      </div>
    </div>
    <div class="why-grid">
      ${col(L('A favor', 'In favor'), pros, 'why-pros')}
      ${col(L('En contra / límites', 'Against / limits'), cons, 'why-cons')}
    </div>
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
  return `<section class="panel panel-ranges">
    <div class="panel-head compact">
      <div>
        <div class="panel-kicker">${L('Rangos', 'Ranges')}</div>
        <h2>${L('Dónde está la meseta y dónde volver a optimizar', 'Where the plateau is and where to re-optimize')}</h2>
      </div>
      <button class="ghost-btn" data-export="refine" data-plateau-index="${best.rank - 1}">${L('.set de refinamiento', 'Refinement .set')}</button>
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
  </section>`;
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
  const top = a.plateaus.slice(0, 3);
  if (!top.length) {
    return `<section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Decisión', 'Decision')}</div><h2>${L('Configuraciones ganadoras', 'Winning configurations')}</h2></div></div>
      <p class="muted">${L(
        'No hay ninguna región que cumpla los mínimos con estabilidad suficiente, así que no se propone ninguna configuración. Revisa el',
        'No region meets the minima with enough stability, so no configuration is proposed. Check the',
      )} <button class="text-btn" data-goto="diagnostics">${L('diagnóstico', 'diagnostics')}</button> ${L('para ver por qué.', 'to see why.')}</p>
    </section>`;
  }
  const names = a.meta.paramNames;
  const agree = names.map((_, j) => {
    const vals = top.map((p) => p.record.params[j]);
    return vals.every((v) => v === vals[0]);
  });
  const agreeCount = agree.filter(Boolean).length;
  const WORD = {
    1: L('una', 'one'),
    2: L('dos', 'two'),
    3: L('tres', 'three'),
  };
  const word = WORD[top.length] || String(top.length);
  const showConsensus = top.length >= 2;
  const hasF = a.meta.hasForward;
  const featured = top[0];
  const alts = top.slice(1);

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
      flags.push(`<span class="badge warn" title="${esc(L('Esta configuración no cumple tus mínimos en el forward', 'This configuration does not meet your minima on the forward'))}">${L('falla en forward', 'fails on forward')}</span>`);
    }
    if (p.oosValidation && p.oosValidation.passFrac < 0.5) {
      flags.push(`<span class="badge warn" title="${esc(L('Menos de la mitad de la meseta cumple tus mínimos en el forward', 'Less than half of the plateau meets your minima on the forward'))}">${L('meseta frágil en forward', 'plateau weak on forward')}</span>`);
    }
    return flags.join(' ') || `<span class="badge ok">${L('sin avisos de la meseta', 'no plateau warnings')}</span>`;
  };

  const featuredCard = `<article class="t3-featured">
    <div class="t3-featured-head">
      <div>
        <div class="t3-rank">${L('Recomendada', 'Recommended')}</div>
        <div class="t3-pass">${L('Pasada', 'Pass')} ${esc(featured.record.id)}</div>
        <div class="t3-flags">${flagBadges(featured)}</div>
      </div>
      <div class="t3-score">${num(featured.robust, 0)}<small>${L('robustez', 'robustness')}</small></div>
    </div>
    <div class="t3-featured-metrics">
      <div><span>${L('Meseta', 'Plateau')}</span><strong>M${featured.rank} · ${int(featured.size)}</strong></div>
      <div><span>${L('Pasan / observadas', 'Pass / observed')}</span><strong>${featured.neighborhood
        ? `${int(featured.neighborhood.passing)} / ${int(featured.neighborhood.observed)}`
        : `${int(featured.stability.support)}`}</strong></div>
      <div><span>${L('Calidad IS', 'IS quality')}</span><strong>${num(featured.record.qualityIs, 2)}</strong></div>
      ${hasF ? `<div><span>${L('Calidad FW', 'FW quality')}</span><strong>${num(featured.record.qualityOos, 2)}</strong></div>` : ''}
    </div>
    ${alts.length ? '' : `<div class="t3-param-chips">
      ${names.map((n, j) => `<span>${esc(n)} <b>${paramHtml(featured.record.params[j])}</b></span>`).join('')}
    </div>`}
    <div class="t3-featured-actions">
      <button class="primary-btn t3-btn-inline" data-export="set" data-plateau-index="${featured.rank - 1}">${L('Descargar .set', 'Download .set')}</button>
      <button class="ghost-btn t3-btn-inline" data-copy="${featured.rank - 1}">${L('Copiar parámetros', 'Copy parameters')}</button>
      <button class="text-btn t3-btn-inline" data-plateau="${featured.rank - 1}">${L('Ver detalle →', 'View detail →')}</button>
    </div>
  </article>`;

  const altCards = alts.length
    ? `<div class="t3-alts">
        ${alts.map((p, i) => `<article class="t3-alt">
          <div class="t3-rank">${L(`Alternativa ${i + 1}`, `Alternative ${i + 1}`)}</div>
          <div class="t3-pass">${L('Pasada', 'Pass')} ${esc(p.record.id)}</div>
          <div class="t3-score t3-score-sm">${num(p.robust, 0)}<small>${L('robustez', 'robustness')}</small></div>
          <div class="t3-flags">${flagBadges(p)}</div>
          <p class="t3-alt-meta">M${p.rank} · ${int(p.size)} ${L('configs', 'configs')} · ${int(p.stability.support)} ${L('vecinos', 'neighbors')}</p>
          <div class="t3-alt-actions">
            <button class="ghost-btn t3-btn-inline" data-export="set" data-plateau-index="${p.rank - 1}">.set</button>
            <button class="text-btn t3-btn-inline" data-plateau="${p.rank - 1}">${L('Detalle →', 'Detail →')}</button>
          </div>
        </article>`).join('')}
      </div>`
    : '';

  const header = top.map((p, i) => `<th class="t3-col ${i === 0 ? 't3-best' : ''}">
      <div class="t3-rank">${i === 0 ? L('Recomendada', 'Recommended') : L(`Alternativa ${i}`, `Alternative ${i}`)}</div>
      <div class="t3-pass">${L('Pasada', 'Pass')} ${esc(p.record.id)}</div>
    </th>`).join('');

  const metricRow = (label, fn, cls = '') => `<tr class="${cls}">
    <th class="t3-label">${esc(label)}</th>
    ${top.map((p, i) => `<td class="t3-col ${i === 0 ? 't3-best' : ''}">${fn(p)}</td>`).join('')}
  </tr>`;

  const paramRows = names.map((n, j) => `<tr class="${agree[j] ? 't3-agree' : ''}">
    <th class="t3-label mono">${esc(n)}${agree[j] ? `<span class="t3-tick" title="${esc(L(`Coinciden las ${word}`, `The ${word} agree`))}">✓</span>` : ''}</th>
    ${top.map((p, i) => `<td class="t3-col t3-value ${i === 0 ? 't3-best' : ''}">${paramHtml(p.record.params[j])}</td>`).join('')}
  </tr>`).join('');

  return `<section class="panel t3-panel panel-recommend">
    <div class="panel-head">
      <div>
        <div class="panel-kicker">${L('Decisión', 'Decision')}</div>
        <h2>${top.length === 1
          ? L('Configuración ganadora', 'Winning configuration')
          : L(`Top ${top.length}: configuraciones ganadoras`, `Top ${top.length}: winning configurations`)}</h2>
      </div>
      ${showConsensus ? `<div class="t3-consensus">
        <strong>${L(`${agreeCount} de ${names.length}`, `${agreeCount} of ${names.length}`)}</strong>
        <span>${L(`parámetros en los que coinciden las ${word}`, `parameters where the ${word} agree`)}</span>
      </div>` : ''}
    </div>
    <p class="panel-intro">
      ${top.length === 1
        ? L(
          `Es la única región estable que ha superado los mínimos con soporte suficiente. Dentro de ella se
           elige la configuración con mejor puesto conjunto en in-sample y forward, promediado con sus
           vecinas: no la que más rinde en un solo periodo. Al haber una sola meseta no hay consenso entre regiones que contrastar.`,
          `It is the only stable region that cleared the minima with enough support. Inside it, the
           pick is the configuration with the best combined in-sample and forward rank, averaged with
           its neighbors: not the one that performs most in a single period. With a single plateau there is no cross-region consensus to contrast.`,
        )
        : L(
          `La recomendada es la meseta más sólida por su suelo de calidad y su validación en el forward. Las alternativas son otras
           regiones estables independientes: útiles si la recomendada choca con un criterio operativo.
           Las filas con <span class="t3-tick">✓</span> son el consenso más sólido del análisis.`,
          `The recommended pick is the strongest plateau by its quality floor and forward validation. Alternatives are other
           independent stable regions — useful if the recommended one conflicts with an operational constraint.
           Rows with <span class="t3-tick">✓</span> are the most solid consensus in the analysis.`,
        )}
    </p>
    <div class="t3-podium">
      ${featuredCard}
      ${altCards}
    </div>
    ${showConsensus || top.length > 1 ? `<div class="table-wrap t3-compare-wrap">
      <table class="t3-table">
        <thead><tr><th class="t3-label">${L('Comparación', 'Comparison')}</th>${header}</tr></thead>
        <tbody>
          ${metricRow(L('Meseta', 'Plateau'), (p) => `M${p.rank} · ${int(p.size)} ${L('configs', 'configs')}${p.coreSize ? ` (${L('núcleo', 'core')} ${int(p.coreSize)})` : ''}`)}
          ${metricRow(L('Calidad in-sample', 'In-sample quality'), (p) => `${num(p.record.qualityIs, 2)} <em class="t3-tag">${esc(qualityLabel(p.record.qualityIs))}</em>`)}
          ${hasF ? metricRow(L('Calidad forward', 'Forward quality'), (p) => `${num(p.record.qualityOos, 2)} <em class="t3-tag">${esc(qualityLabel(p.record.qualityOos))}</em>`) : ''}
          ${hasF ? metricRow(L('Forward · PF / DD / ops', 'Forward · PF / DD / trades'), (p) => `${num(p.record.oos.profitFactor, 3)} / ${num(p.record.oos.drawdown, 1)}% / ${int(p.record.oos.trades)}`) : ''}
          ${metricRow(L('In-sample · PF / DD / ops', 'In-sample · PF / DD / trades'), (p) => `${num(p.record.is.profitFactor, 3)} / ${num(p.record.is.drawdown, 1)}% / ${int(p.record.is.trades)}`)}
          ${metricRow(L('Vecinos / suelo Q25', 'Neighbors / Q25 floor'), (p) => `${int(p.stability.support)} / ${num(p.stability.q25, 2)}`, 't3-sep')}
          <tr class="t3-params-head"><th class="t3-label" colspan="${top.length + 1}">${L('Parámetros de entrada', 'Input parameters')}</th></tr>
          ${paramRows}
        </tbody>
      </table>
    </div>` : ''}
  </section>`;
}
