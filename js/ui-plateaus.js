// Mesetas, descartes, parámetros y paneles de diagnóstico.

import { qualityLabel } from '../core/metrics.js';
import { topInfluentialPair, buildAxisPairGrid } from '../core/surface.js';
import { mountPlateauSurface } from './plateau-surface.js';
import { sensitivityBars, parameterProfile, plateauHeatmap, dimRole } from './charts.js';
import { L } from './i18n.js';
import { state, $, num, int, pct, esc, nf, paramValue, roleBadge } from './ui-state.js';

export function mostSensitiveIndex(a) {
  let best = 0;
  let bestVal = -Infinity;
  a.sensitivity.forEach((s) => {
    if (!s.constant && s.sensitivity > bestVal) {
      bestVal = s.sensitivity;
      best = s.index;
    }
  });
  return best;
}

export function topTwoSensitive(a) {
  const ranked = a.sensitivity.filter((s) => !s.constant).sort((x, y) => y.sensitivity - x.sensitivity);
  return [ranked[0] ? ranked[0].index : 0, ranked[1] ? ranked[1].index : (ranked[0] ? ranked[0].index : 0)];
}

export function renderRepCard(a, p) {
  const r = p.record;
  const hasF = a.meta.hasForward;
  return `<div class="rep-card">
    <div class="rep-head">
      <div>
        <div class="rep-pass">Pass ${esc(r.id)}</div>
        <div class="rep-sub">${L('Meseta', 'Plateau')} ${p.rank} · ${int(p.size)} ${L('configuraciones', 'configurations')}${p.coreSize ? ` · ${L('nucleo de', 'core of')} ${int(p.coreSize)}` : ''}</div>
      </div>
      <div class="rep-score">${num(p.robust, 0)}<small>${L('robustez', 'robustness')}</small></div>
    </div>
    <div class="param-grid">
      ${a.meta.paramNames.map((n, j) => `<div class="param"><span>${esc(n)}</span><strong>${paramValue(r.params[j])}</strong></div>`).join('')}
    </div>
    <div class="evidence-list">
      <div><span>${L('Calidad in-sample', 'In-sample quality')}</span><strong>${num(r.qualityIs, 2)} <em>${esc(qualityLabel(r.qualityIs))}</em></strong></div>
      ${hasF ? `<div><span>${L('Calidad forward', 'Forward quality')}</span><strong>${num(r.qualityOos, 2)} <em>${esc(qualityLabel(r.qualityOos))}</em></strong></div>` : ''}
      <div><span>${L('Vecinas observadas', 'Observed neighbors')}</span><strong>${p.neighborhood ? int(p.neighborhood.observed) : int(p.stability.support)}</strong></div>
      <div><span>${L('Pasan mínimos / fallan', 'Pass minima / fail')}</span><strong>${p.neighborhood
        ? `${int(p.neighborhood.passing)} / ${int(p.neighborhood.failing)}`
        : pct(p.stability.fracPass, 0)}</strong></div>
      ${p.neighborhood && p.neighborhood.slotsComplete
        ? `<div><span>${L('Huecos no observados', 'Unobserved gaps')}</span><strong>${int(p.neighborhood.gaps)} <em>${L('de', 'of')} ${int(p.neighborhood.slots)}</em></strong></div>`
        : ''}
      <div><span>${L('Suelo de su entorno (Q25)', 'Neighborhood floor (Q25)')}</span><strong>${num(p.stability.q25, 2)}</strong></div>
      ${hasF ? `<div><span>${L('Forward · PF / DD / ops', 'Forward · PF / DD / trades')}</span><strong>${num(r.oos.profitFactor, 3)} / ${num(r.oos.drawdown, 1)}% / ${int(r.oos.trades)}</strong></div>` : ''}
      <div><span>${L('In-sample · PF / DD / ops', 'In-sample · PF / DD / trades')}</span><strong>${num(r.is.profitFactor, 3)} / ${num(r.is.drawdown, 1)}% / ${int(r.is.trades)}</strong></div>
    </div>
    ${p.invertedRisk && p.invertedRisk.length ? `<div class="inline-warn">${L(
      `Se apoya en ${p.invertedRisk.map((x) => `<code>${esc(x.name)} = ${paramValue(x.bestIs)}</code>`).join(', ')}, el valor que gana en el in-sample pero que el forward castiga. Puede ser merito suyo o suerte.`,
      `It relies on ${p.invertedRisk.map((x) => `<code>${esc(x.name)} = ${paramValue(x.bestIs)}</code>`).join(', ')}, the value that wins in-sample but that the forward punishes. It may be merit or luck.`,
    )}</div>` : ''}
    ${p.boundary.length ? `<div class="inline-warn">${L(
      `Pegada al borde del rango en: ${p.boundary.map((b) => `<code>${esc(b.name)} = ${paramValue(b.atMin ? b.min : b.max)}</code>`).join(', ')}`,
      `Stuck to the range edge at: ${p.boundary.map((b) => `<code>${esc(b.name)} = ${paramValue(b.atMin ? b.min : b.max)}</code>`).join(', ')}`,
    )}</div>` : ''}
    <div class="rep-actions">
      <button class="ghost-btn" data-copy="${p.rank - 1}">${L('Copiar parámetros', 'Copy parameters')}</button>
      <button class="ghost-btn" data-export="set">${L('Descargar .set', 'Download .set')}</button>
      <button class="ghost-btn" data-export="refine">${L('.set de refinamiento', 'Refinement .set')}</button>
      <button class="text-btn" data-plateau="0">${L('Ver la meseta completa &rarr;', 'View the full plateau &rarr;')}</button>
    </div>
  </div>`;
}

export function renderPlateaus(a) {
  if (!a.plateaus.length) {
    return `<div class="detail-head"><div class="detail-kicker">${L('02 / Mesetas', '02 / Plateaus')}</div><h2>${L('No se ha encontrado ninguna meseta', 'No plateau was found')}</h2>
      <p>${L(
        'Ninguna región conexa supera los mínimos con estabilidad suficiente. Revisa el diagnostico: lo habitual es que falten datos, que el rango probado sea demasiado estrecho o que la estrategia no tenga ventaja.',
        'No connected region clears the minima with enough stability. Check diagnostics: usually data are missing, the tested range is too narrow, or the strategy has no edge.',
      )}</p></div>
      <button class="text-btn" data-goto="diagnostics">${L('Ir al diagnostico &rarr;', 'Go to diagnostics &rarr;')}</button>`;
  }
  const sel = a.plateaus[Math.min(state.selectedPlateau, a.plateaus.length - 1)];
  const rows = a.plateaus.map((p) => `<tr class="${p.rank === sel.rank ? 'sel' : ''}">
      <td><button class="link-btn" data-plateau="${p.rank - 1}">M${p.rank}</button></td>
      <td class="mono">${esc(p.record.id)}</td>
      <td class="strong">${num(p.robust, 0)}</td>
      <td>${int(p.size)}</td>
      <td>${int(p.coreSize)}</td>
      <td>${num(p.q10Score, 2)}</td>
      <td>${num(p.medianScore, 2)}</td>
      <td>${num(p.coherence, 2)}</td>
      <td>${p.boundary.length ? `<span class="badge warn">${p.boundary.length}</span>` : '<span class="badge ok">0</span>'}</td>
    </tr>`).join('');

  return `<div class="detail-head">
      <div class="detail-kicker">${L('02 / Mesetas', '02 / Plateaus')}</div>
      <h2>${L('Regiones estables detectadas', 'Stable regions detected')}</h2>
      <p>${L(
        'Ordenadas por el <strong>suelo</strong> de la región, no por su cima. Una meseta es un conjunto conexo de configuraciones donde incluso el cuartil bajo del entorno mantiene calidad buena.',
        'Ordered by the region <strong>floor</strong>, not its peak. A plateau is a connected set of configurations where even the lower quartile of the neighborhood keeps good quality.',
      )}</p>
    </div>
    <section class="panel">
      <div class="table-wrap"><table>
        <thead><tr><th>#</th><th>${L('Pass repr.', 'Repr. pass')}</th><th>${L('Robustez', 'Robustness')}</th><th>${L('Tamaño', 'Size')}</th><th>${L('Nucleo', 'Core')}</th><th>${L('Suelo (Q10)', 'Floor (Q10)')}</th><th>${L('Mediana', 'Median')}</th><th>${L('Dispersión', 'Dispersion')}</th><th>${L('Bordes', 'Edges')}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </section>

    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Meseta', 'Plateau')} ${sel.rank}</div><h2>${L('Configuración representativa', 'Representative configuration')}</h2></div>
        <span class="status-pill">${L('elegida por criterio maximin', 'chosen by maximin')}</span></div>
      ${renderRepCard(a, sel)}
    </section>

    ${renderPlateauSurfacePanel(a, sel)}

    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Siguiente paso', 'Next step')}</div><h2>${L('Rango para reoptimizar en rejilla', 'Range for grid re-optimization')}</h2></div></div>
      <p class="panel-intro">${L(
        `Vuelve a MT5 y lanza una optimizacion <em>Todos los parámetros</em> acotada a este rango, centrado en la configuración recomendada. Sobre una rejilla completa la geometría de la meseta se mide sin los huecos que deja el genetico. Son <strong>${int(sel.refinement.reduce((acc, x) => acc * (x.constant ? 1 : x.levels), 1))} combinaciones</strong>, un tamaño que se puede ejecutar de verdad.`,
        `Go back to MT5 and run an <em>All parameters</em> optimization bounded to this range, centered on the recommended configuration. On a full grid the plateau geometry is measured without the gaps the genetic leaves. That is <strong>${int(sel.refinement.reduce((acc, x) => acc * (x.constant ? 1 : x.levels), 1))} combinations</strong> — a size you can actually run.`,
      )}</p>
      <div class="table-wrap"><table>
        <thead><tr><th>${L('Parámetro', 'Parameter')}</th><th>${L('Centro', 'Center')}</th><th>${L('Inicio', 'Start')}</th><th>${L('Paso', 'Step')}</th><th>${L('Fin', 'Stop')}</th><th>${L('Niveles', 'Levels')}</th></tr></thead>
        <tbody>${sel.refinement.map((x) => `<tr>
          <td class="mono">${esc(x.name)}</td>
          ${x.constant
            ? `<td>${paramValue(x.value)}</td><td colspan="4" class="muted">${L('no se optimizo', 'was not optimised')}</td>`
            : x.fixed
              ? `<td class="strong">${paramValue(x.center)}</td><td colspan="4" class="muted">${x.categorical
                ? L('booleano o enumeracion: se fija, actívalo a mano si quieres barrerlo', 'boolean or enum: fixed; enable manually if you want to sweep it')
                : L('se fija: el presupuesto de la rejilla se gasta en parámetros más influyentes', 'fixed: the grid budget is spent on more influential parameters')}</td>`
              : `<td class="strong">${paramValue(x.center)}</td><td>${paramValue(x.start)}</td><td>${paramValue(x.step)}</td><td>${paramValue(x.stop)}</td><td>${int(x.levels)}</td>`}
        </tr>`).join('')}</tbody>
      </table></div>
      <div class="rep-actions"><button class="ghost-btn" data-export="refine">${L('Descargar .set de refinamiento', 'Download refinement .set')}</button></div>
    </section>`;
}

// ------------------------------------------------------- superficie 3D de la meseta
//
// Una superficie solo puede mostrar dos parámetros a la vez. Con más de dos
// optimizados se fijan el resto en los valores de la configuración representativa
// y se dibuja la rejilla real de esos dos ejes — igual que el mapa de "los dos
// parámetros más influyentes" de Parámetros (04), pero con una diferencia
// deliberada: aquella promedia todas las combinaciones del resto de parámetros
// (una vista general del espacio); esta fija el resto en TU meseta elegida, así
// que cada celda es una pasada real de tu rejilla, no una mezcla. Por eso vive
// aquí, junto a la meseta concreta que ilustra, y por eso puede tener huecos que
// el mapa general no tiene: no se rellenan con nada inventado.
let plateauSurfaceHandle = null;

function surfaceAxisOptions(a, selected, excludeDim) {
  return a.sensitivity
    .filter((s) => !s.constant && s.index !== excludeDim)
    .map((s) => `<option value="${s.index}"${s.index === selected ? ' selected' : ''}>${esc(s.name)}</option>`)
    .join('');
}

function renderPlateauSurfacePanel(a, plateau) {
  const nonConstant = a.sensitivity.filter((s) => !s.constant);
  if (nonConstant.length < 2) {
    return `<section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Visual', 'Visual')}</div><h2>${L('Cómo se ve tu meseta elegida', 'What your chosen plateau looks like')}</h2></div></div>
      <p class="muted">${L('Hacen falta al menos dos parámetros con varios valores para dibujar una superficie.', 'At least two parameters with several values are needed to draw a surface.')}</p>
    </section>`;
  }
  const defaults = topInfluentialPair(a.sensitivity) || [nonConstant[0].index, nonConstant[1].index];
  if (state.surfaceDimA == null || state.surfaceDimA === state.surfaceDimB) [state.surfaceDimA, state.surfaceDimB] = defaults;
  if (state.surfaceDimB == null || state.surfaceDimB === state.surfaceDimA) {
    const alt = nonConstant.find((s) => s.index !== state.surfaceDimA);
    state.surfaceDimB = alt ? alt.index : state.surfaceDimA;
  }
  const dimA = state.surfaceDimA;
  const dimB = state.surfaceDimB;
  const grid = buildAxisPairGrid(a, plateau, dimA, dimB);
  const gapNote = grid.coverage < 0.999
    ? L(
      `Cobertura de esta rejilla 2D: ${Math.round(grid.coverage * 100)} %. Las celdas vacías no son cero: son combinaciones que la optimización (probablemente genética) no probó con el resto de parámetros en el valor de tu meseta — no se inventa un dato ahí.`,
      `Coverage of this 2D grid: ${Math.round(grid.coverage * 100)} %. Empty cells are not zero: they are combinations the optimization (likely genetic) never tested with the other parameters at your plateau's value — nothing is invented there.`,
    )
    : L(
      'Rejilla completa para estos dos parámetros: cada celda es una pasada real.',
      'Full grid for these two parameters: every cell is a real pass.',
    );

  return `<section class="panel">
    <div class="panel-head compact">
      <div><div class="panel-kicker">${L('Visual', 'Visual')}</div><h2>${L('Cómo se ve tu meseta elegida', 'What your chosen plateau looks like')}</h2></div>
      <div class="surface-axes">
        <label class="inline-select">${L('Eje X', 'X axis')} <select id="surfaceDimA">${surfaceAxisOptions(a, dimA, dimB)}</select></label>
        <label class="inline-select">${L('Eje Y', 'Y axis')} <select id="surfaceDimB">${surfaceAxisOptions(a, dimB, dimA)}</select></label>
      </div>
    </div>
    <p class="panel-intro">${L(
      `La altura es la calidad in-sample real de cada pasada. En <strong>turquesa</strong>, las configuraciones que pertenecen a esta meseta — las que también aguantan en el periodo forward. El resto de parámetros queda fijo en los valores de Pass ${esc(plateau.record.id)}. Arrastra para rotar.`,
      `Height is the real in-sample quality of each pass. In <strong>teal</strong>, the configurations that belong to this plateau — the ones that also hold up in the forward period. The rest of the parameters stay fixed at Pass ${esc(plateau.record.id)}'s values. Drag to rotate.`,
    )}</p>
    <div class="surface-wrap">
      <canvas id="plateauSurfaceCanvas" role="img" aria-label="${esc(L('Superficie 3D de calidad real para dos parámetros', '3D surface of real quality for two parameters'))}"></canvas>
      <div class="surface-detail" id="surfaceDetail">${renderSurfaceDetail(a, grid, null)}</div>
    </div>
    <p class="chart-note">${gapNote}</p>
  </section>`;
}

function renderSurfaceDetail(a, grid, hit) {
  if (!hit) {
    return `<p class="muted">${L('Pasa el ratón sobre una barra para ver la pasada exacta.', 'Hover a bar to see the exact pass.')}</p>`;
  }
  const rec = a.records[hit.recordIndex];
  return `<div class="evidence-list">
    <div><span>${esc(grid.names[0])}</span><strong>${paramValue(grid.levelsA[hit.a])}</strong></div>
    <div><span>${esc(grid.names[1])}</span><strong>${paramValue(grid.levelsB[hit.b])}</strong></div>
    <div><span>Pass</span><strong class="mono">${esc(rec.id)}</strong></div>
    <div><span>${L('Calidad in-sample', 'In-sample quality')}</span><strong>${num(hit.quality, 3)}</strong></div>
    <div><span>${L('Calidad forward', 'Forward quality')}</span><strong>${Number.isFinite(hit.qualityOos) ? num(hit.qualityOos, 3) : '—'}</strong></div>
    <div><span>${L('¿En esta meseta?', 'In this plateau?')}</span><strong class="big ${hit.inPlateau ? 'ok' : 'warn'}">${hit.inPlateau ? L('sí', 'yes') : L('no', 'no')}</strong></div>
  </div>`;
}

export function disposePlateauSurface() {
  if (plateauSurfaceHandle) plateauSurfaceHandle.destroy();
  plateauSurfaceHandle = null;
}

export function mountPlateauSurfaceView(a) {
  disposePlateauSurface();
  const canvas = $('#plateauSurfaceCanvas');
  if (!canvas || !a.plateaus.length) return;
  const sel = a.plateaus[Math.min(state.selectedPlateau, a.plateaus.length - 1)];
  if (state.surfaceDimA == null || state.surfaceDimB == null) return; // renderPlateauSurfacePanel aun no corrio
  const grid = buildAxisPairGrid(a, sel, state.surfaceDimA, state.surfaceDimB);
  plateauSurfaceHandle = mountPlateauSurface(canvas, grid, {
    onHover(cell, aIdx, bIdx) {
      const detail = $('#surfaceDetail');
      if (!detail) return;
      detail.innerHTML = renderSurfaceDetail(a, grid, cell ? { ...cell, a: aIdx, b: bIdx } : null);
    },
  });
}

export function renderRejected(a) {
  const critName = a.meta.hasForward
    ? (a.meta.criterionOosName || L('criterio forward', 'forward criterion'))
    : (a.meta.criterionIsName || L('criterio', 'criterion'));
  if (!a.peaks.length) {
    return `<div class="detail-head"><div class="detail-kicker">${L('03 / Descartes', '03 / Rejected')}</div><h2>${L('Ningún descarte entre las mejores por tu criterio', 'No rejections among the best by your criterion')}</h2>
      <p>${L(
        'Las configuraciones que encabezan tu ranking caen dentro de alguna meseta. Es poco habitual y es buena señal.',
        'The configurations that top your ranking fall inside some plateau. That is uncommon and a good sign.',
      )}</p></div>`;
  }
  return `<div class="detail-head">
      <div class="detail-kicker">${L('03 / Descartes', '03 / Rejected')}</div>
      <h2>${L('Las que encabezan tu tabla y aún así no se recomiendan', 'Ones that top your table and still are not recommended')}</h2>
      <p>${L(
        `Ordenadas por <code>${esc(critName)}</code>, que es la columna por la que MT5 te las presenta. Para cada una se indica por que el motor no la respalda. Esta es la tabla que evita la mayoria de los errores.`,
        `Ordered by <code>${esc(critName)}</code>, the column MT5 presents them by. For each one the engine explains why it does not back it. This is the table that prevents most mistakes.`,
      )}</p>
    </div>
    <section class="panel">
      <div class="table-wrap"><table>
        <thead><tr><th>${L('Puesto', 'Rank')}</th><th>Pass</th><th>${esc(critName)}</th><th>${L('Calidad', 'Quality')}</th><th>${L('Vecinas', 'Neighbors')}</th><th>${L('Suelo entorno', 'Neighborhood floor')}</th><th>${L('Motivo del descarte', 'Rejection reason')}</th></tr></thead>
        <tbody>${a.peaks.map((p) => `<tr>
          <td><span class="rank-mini">#${int(p.criterionRank)}</span></td>
          <td class="mono">${esc(p.record.id)}</td>
          <td class="strong">${num(p.key, 2)}</td>
          <td>${num(p.score, 2)}</td>
          <td>${int(p.st.support)}</td>
          <td>${num(p.st.q25, 2)}</td>
          <td class="reasons">${p.reasons.map((r) => `<span class="reason">${esc(r)}</span>`).join('')}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>`;
}

export function renderParams(a) {
  const [dimA, dimB] = topTwoSensitive(a);
  const options = a.sensitivity.map((s) => `<option value="${s.index}"${s.index === state.selectedParam ? ' selected' : ''}${s.constant ? ' disabled' : ''}>${esc(s.name)}${s.constant ? L(' (constante)', ' (constant)') : ''}</option>`).join('');
  return `<div class="detail-head">
      <div class="detail-kicker">${L('04 / Parámetros', '04 / Parameters')}</div>
      <h2>${L('Que parámetros mandan de verdad', 'Which parameters really matter')}</h2>
      <p>${L(
        'La sensibilidad mide cuánto se mueve la calidad al recorrer los valores de un parametro. Los numericos que influyen <strong>miden la distancia</strong>. Los booleanos y las enumeraciones <strong>parten el espacio</strong>: dos configuraciones solo son vecinas si coinciden en ellos, porque activar o no un filtro no es un paso pequeño sino otra estrategia. Solo se ignora lo demostrablemente plano.',
        'Sensitivity measures how much quality moves as you walk a parameter\'s values. Influential numerics <strong>measure distance</strong>. Booleans and enums <strong>partition the space</strong>: two configurations are neighbors only if they match on them, because enabling a filter is not a small step — it is another strategy. Only demonstrably flat axes are ignored.',
      )}</p>
      ${a.meta.releasedBlockNames && a.meta.releasedBlockNames.length ? `<div class="inline-warn">${L(
        `Para conseguir vecinos suficientes se ha dejado de particionar por ${a.meta.releasedBlockNames.map((n) => `<code>${esc(n)}</code>`).join(', ')}, el menos influyente. Las configuraciones que solo difieran en ${a.meta.releasedBlockNames.length > 1 ? 'esos parámetros' : 'ese parámetro'} se consideran vecinas.`,
        `To get enough neighbors, partitioning was released on ${a.meta.releasedBlockNames.map((n) => `<code>${esc(n)}</code>`).join(', ')}, the least influential. Configurations that differ only on ${a.meta.releasedBlockNames.length > 1 ? 'those parameters' : 'that parameter'} are treated as neighbors.`,
      )}</div>` : ''}
    </div>
    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Sensibilidad', 'Sensitivity')}</div><h2>${L('Influencia relativa', 'Relative influence')}</h2></div></div>
      ${sensitivityBars(a)}
      <p class="chart-note">${L(
        `La barra es el <strong>efectivo</strong>: el mayor entre la influencia aislada (agrupando por el valor del parámetro) y la combinada (dejando fijo todo lo demás). Donde aparece la marca <span class="ch-sens-marginal-swatch"></span> y un valor entre paréntesis, el parámetro parecía plano mirado solo — la combinada lo rescata. El detalle completo (aislado, combinado, efectivo) está en Diagnóstico.`,
        `The bar is the <strong>effective</strong> value: the larger of the isolated influence (grouped by the parameter's value) and the combined one (everything else held fixed). Where the <span class="ch-sens-marginal-swatch"></span> mark and a parenthesised value appear, the parameter looked flat on its own — the combined measure rescues it. The full breakdown (isolated, combined, effective) is in Diagnostics.`,
      )}</p>
    </section>
    ${a.inversions && a.inversions.length ? `<section class="panel warn-panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Aviso', 'Warning')}</div><h2>${L('Parámetros invertidos entre periodos', 'Parameters inverted across periods')}</h2></div>
        <span class="status-pill warn-pill">${int(a.inversions.length)} ${L('detectados', 'detected')}</span></div>
      <p class="panel-intro">${L(
        'En estos parámetros, el valor que gana en el in-sample <strong>es de los que pierden en el forward</strong>. Es la causa mecánica de que el ranking no transfiera: la señal no falta, apunta al reves. Afinarlos sobre el in-sample es tiempo perdido; dejalos en un valor central y decide con los que si son coherentes entre periodos.',
        'On these parameters, the value that wins in-sample <strong>is among those that lose on forward</strong>. That is the mechanical reason the ranking fails to transfer: the signal is not missing — it points the wrong way. Fine-tuning them on in-sample is wasted time; leave them at a central value and decide with the ones that are coherent across periods.',
      )}</p>
      <div class="table-wrap"><table>
        <thead><tr><th>${L('Parámetro', 'Parameter')}</th><th>${L('Gana en IS', 'Wins in IS')}</th><th>${L('Gana en forward', 'Wins in forward')}</th><th>${L('Margen que tiras', 'Margin you waste')}</th><th>${L('Perfil de calidad (valor: IS / forward)', 'Quality profile (value: IS / forward)')}</th></tr></thead>
        <tbody>${a.inversions.map((x) => `<tr>
          <td class="mono">${esc(x.name)}</td>
          <td class="strong">${paramValue(x.bestIs)}</td>
          <td class="strong">${paramValue(x.bestOos)}</td>
          <td><span class="badge warn">${pct(x.regretShare, 0)}</span></td>
          <td class="values">${x.profile.map((p) => `${paramValue(p.level)}: ${num(p.is, 2)}/${num(p.oos, 2)}`).join('  ·  ')}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>` : ''}
    <section class="panel">
      <div class="panel-head compact">
        <div><div class="panel-kicker">${L('Perfil', 'Profile')}</div><h2>${L('Calidad por valor del parámetro', 'Quality by parameter value')}</h2></div>
        <label class="inline-select">${L('Parámetro', 'Parameter')} <select id="paramSelect">${options}</select></label>
      </div>
      ${parameterProfile(a, state.selectedParam)}
      <p class="chart-note">${L(
        'Caja: recorrido intercuartilico de la calidad entre las configuraciones que pasan los minimos. Linea: mediana. Una caida brusca de un valor al siguiente es un acantilado.',
        'Box: interquartile range of quality among configurations that pass the minima. Line: median. A sharp drop from one value to the next is a cliff.',
      )}</p>
    </section>
    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Mapa', 'Map')}</div><h2>${L('Los dos parámetros más influyentes', 'The two most influential parameters')}</h2></div></div>
      ${plateauHeatmap(a, dimA, dimB)}
      <p class="chart-note">${L(
        'Calidad mediana de cada combinacion. Las zonas claras contiguas son mesetas; una celda clara rodeada de oscuras es un pico.',
        'Median quality of each combination. Contiguous light zones are plateaus; a light cell surrounded by dark ones is a peak.',
      )}</p>
    </section>
    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Rangos', 'Ranges')}</div><h2>${L('Valores probados', 'Values tested')}</h2></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>${L('Parámetro', 'Parameter')}</th><th>${L('Niveles', 'Levels')}</th><th>${L('Sensibilidad (efectivo)', 'Sensitivity (effective)')}</th><th>${L('Papel en el motor', 'Role in the engine')}</th><th>${L('Valores', 'Values')}</th></tr></thead>
        <tbody>${a.sensitivity.map((s) => {
          const effVal = Number.isFinite(s.effective) ? s.effective : s.sensitivity;
          const rescued = !s.constant && Number.isFinite(s.conditional) && effVal - (s.sensitivity || 0) > 0.05;
          return `<tr>
          <td class="mono">${esc(s.name)}${a.meta.paramTypes && a.meta.paramTypes[s.index] !== 'number' ? ` <span class="badge">${esc(a.meta.paramTypes[s.index] === 'bool' ? 'bool' : 'enum')}</span>` : ''}</td>
          <td>${int(s.levels)}</td>
          <td>${s.constant ? '—' : `${num(effVal, 2)}${rescued ? ` <em title="${esc(L('Aislado (solo este parámetro)', 'Isolated (this parameter alone)'))}">(${L('aislado', 'isolated')} ${num(s.sensitivity, 2)})</em>` : ''}`}</td>
          <td>${roleBadge(dimRole(a, s))}</td>
          <td class="values">${(s.values || []).map(paramValue).join(' · ')}</td>
        </tr>`;
        }).join('')}</tbody>
      </table></div>
    </section>`;
}

export function renderDiagnostics(a) {
  const g = a.meta.policy.gates;
  const integ = a.integrity;
  const prov = integ.provenance || {};
  const samplingCopy = {
    grid: L('Rejilla completa o casi completa. Es el escenario ideal: la vecindad es exacta.',
      'Full or near-full grid. Ideal case: neighborhood is exact.'),
    partial: L('Rejilla parcial. La vecindad es razonable pero tiene huecos.',
      'Partial grid. Neighborhood is reasonable but has gaps.'),
    sparse: L('Muestreo disperso, típico del algoritmo genetico. El optimizador concentro las pruebas donde el in-sample era bueno, así que la densidad local mide también donde miro el, no solo donde hay estabilidad.',
      'Sparse sampling, typical of the genetic algorithm. The optimizer concentrated trials where in-sample was good, so local density also measures where it looked, not only where there is stability.'),
  }[a.meta.sampling];

  const sameOpt = prov.checked
    ? (prov.mismatches === 0
      ? L('confirmada', 'confirmed')
      : L(`${int(prov.mismatches)} discrepancias`, `${int(prov.mismatches)} mismatches`))
    : L('no comprobable', 'not checkable');

  const gateName = (name) => (name === 'profitFactor'
    ? L('factor de beneficio', 'profit factor')
    : name === 'drawdown' ? 'drawdown' : L('operaciones', 'trades'));

  return `<div class="detail-head">
      <div class="detail-kicker">${L('05 / Diagnostico', '05 / Diagnostics')}</div>
      <h2>${L('Que se ha leido y con que se ha juzgado', 'What was read and what it was judged by')}</h2>
      <p>${L('Todo lo que decide el veredicto esta aqui. Si algo se ha clasificado mal, se ve en esta pantalla.',
        'Everything that decides the verdict is here. If something was misclassified, it shows on this screen.')}</p>
    </div>

    <div class="grid-secondary">
      <section class="panel">
        <div class="panel-head compact"><div><div class="panel-kicker">${L('Integridad', 'Integrity')}</div><h2>${L('Emparejado de archivos', 'File matching')}</h2></div></div>
        <div class="evidence-list">
          <div><span>${L('Filas in-sample', 'In-sample rows')}</span><strong>${int(integ.isRows)}</strong></div>
          <div><span>${L('Filas forward', 'Forward rows')}</span><strong>${integ.oosRows ? int(integ.oosRows) : '—'}</strong></div>
          <div><span>${L('Emparejadas por Pass', 'Matched by Pass')}</span><strong>${int(integ.matchedRows)}</strong></div>
          <div><span>${L('Sin pareja (descartadas)', 'Unmatched (dropped)')}</span><strong>${int(integ.unmatchedIs)}</strong></div>
          <div><span>${L('Identificadores duplicados', 'Duplicate identifiers')}</span><strong>${int(integ.duplicateIds)}</strong></div>
          <div><span>${L('Filas con parámetros ilegibles', 'Rows with unreadable parameters')}</span><strong>${int(a.meta.droppedParams)}</strong></div>
          <div><span>${L('Misma optimizacion', 'Same optimization')}</span><strong>${sameOpt}</strong></div>
        </div>
        <p class="chart-note">${L(
          'La procedencia se confirma comprobando que el resultado del backtest que trae el archivo forward reproduce exactamente el del archivo in-sample, pasada por pasada.',
          'Provenance is confirmed by checking that the backtest result in the forward file exactly reproduces the in-sample file, pass by pass.',
        )}</p>
      </section>

      <section class="panel">
        <div class="panel-head compact"><div><div class="panel-kicker">${L('Muestreo', 'Sampling')}</div><h2>${L('Como optimizaste', 'How you optimised')}</h2></div></div>
        <div class="evidence-list">
          <div><span>${L('Espacio cartesiano', 'Cartesian space')}</span><strong>${int(a.meta.cartesian)}</strong></div>
          <div><span>${L('Configuraciones probadas', 'Configurations tested')}</span><strong>${int(a.meta.total)}</strong></div>
          <div><span>${L('Cobertura (niveles vistos)', 'Coverage (seen levels)')}</span><strong>${Number.isFinite(a.meta.coverage) ? nf(5).format(a.meta.coverage * 100) + ' %' : '—'}</strong></div>
          <div><span>${L('Cobertura vs .set', 'Coverage vs .set')}</span><strong>${a.meta.searchCoverage && a.meta.searchCoverage.usable && Number.isFinite(a.meta.searchCoverage.coverageSearch) ? nf(4).format(a.meta.searchCoverage.coverageSearch * 100) + ' %' : L('sin .set', 'no .set')}</strong></div>
          <div><span>${L('Radio de vecindad', 'Neighborhood radius')}</span><strong>${int(a.meta.radius)} ${L('paso(s)', 'step(s)')}</strong></div>
          <div><span>${L('Vecinas por configuración', 'Neighbors per configuration')}</span><strong>${L('mediana', 'median')} ${int(a.meta.medianSupport)}</strong></div>
          <div><span>${L('Duración forward estimada', 'Estimated forward duration')}</span><strong>${Number.isFinite(a.meta.periodRatio) ? pct(a.meta.periodRatio, 0) + L(' del in-sample', ' of in-sample') : '—'}</strong></div>
        </div>
        <p class="chart-note">${esc(samplingCopy)}</p>
      </section>
    </div>

    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Clasificación', 'Classification')}</div><h2>${L('Columnas detectadas', 'Detected columns')}</h2></div></div>
      <p class="panel-intro">${L(
        'Los parámetros no se reconocen por su nombre sino por su estructura: para un mismo Pass, un parámetro vale lo mismo en los dos archivos y una métrica no, porque se midio sobre otro periodo.',
        'Parameters are not recognized by name but by structure: for the same Pass, a parameter has the same value in both files and a metric does not, because it was measured on another period.',
      )}</p>
      <div class="columns-grid">
        <div>
          <h3>${L('Parámetros', 'Parameters')} (${a.meta.paramNames.length})</h3>
          <div class="chips">${a.meta.paramNames.map((n) => `<span class="chip param-chip">${esc(n)}</span>`).join('')}</div>
        </div>
        <div>
          <h3>${L('Métricas usadas para juzgar', 'Metrics used for judgment')}</h3>
          <div class="chips">${a.meta.availableMetrics.map((n) => `<span class="chip">${esc(n)}</span>`).join('')}</div>
          <p class="chart-note">
            ${L(
              `Tu criterio de optimizacion${a.meta.criterionIsName ? ` (<code>${esc(a.meta.criterionIsName)}</code>)` : ''}
            se lee pero <strong>no puntua</strong>: significa algo distinto en cada optimizacion y esta contaminado
            por la propia seleccion. Se usa solo para ordenar la tabla de descartes.`,
              `Your optimization criterion${a.meta.criterionIsName ? ` (<code>${esc(a.meta.criterionIsName)}</code>)` : ''}
            is read but <strong>does not score</strong>: it means something different in every optimization and is contaminated
            by the selection itself. It is used only to order the rejection table.`,
            )}
          </p>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Politica', 'Policy')}</div><h2>${L('Mínimos aplicados', 'Applied minima')}</h2></div></div>
      <div class="evidence-list">
        <div><span>${L('Beneficio positivo', 'Positive profit')}</span><strong>${g.requireProfit ? L('exigido', 'required') : L('no exigido', 'not required')}</strong></div>
        <div><span>${L('Factor de beneficio mínimo', 'Minimum profit factor')}</span><strong>${num(g.minProfitFactor, 2)}</strong></div>
        <div><span>${L('Drawdown máximo', 'Maximum drawdown')}</span><strong>${num(g.maxDrawdownPct, 0)} %</strong></div>
        <div><span>${L('Operaciones minimas (IS)', 'Minimum trades (IS)')}</span><strong>${int(a.meta.minTradesIs)}</strong></div>
        <div><span>${L('Operaciones minimas (forward)', 'Minimum trades (forward)')}</span><strong>${int(a.meta.minTradesOos)}</strong></div>
        ${(a.meta.gateInfluence || []).filter((gi) => gi.name !== 'beneficio').map((gi) => `
        <div><span>· ${gateName(gi.name)}: ${L('descarta ella sola', 'rejects on its own')}</span><strong>${gi.sole ? int(gi.sole) + L(' configuraciones', ' configurations') : `<em>${L('ninguna (no filtra nada)', 'none (filters nothing)')}</em>`}</strong></div>`).join('')}
        <div><span>${L('Se exigen en', 'Required in')}</span><strong>${a.meta.hasForward ? L('los dos periodos', 'both periods') : L('el in-sample', 'in-sample')}</strong></div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Contraste', 'Contrast')}</div><h2>${L('Pruebas estadísticas', 'Statistical tests')}</h2></div></div>
      <div class="evidence-list">
        <div><span>${L('Correlación de rangos IS &rarr; forward', 'Rank correlation IS &rarr; forward')}</span><strong>${num(a.stats.spearmanCriterion, 3)}</strong></div>
        <div><span>${L('Fragilidad de la selección (peor sentido)', 'Selection fragility (worse direction)')}</span><strong>${Number.isFinite(a.stats.fragility) ? pct(a.stats.fragility, 0) : '—'}${Number.isFinite(a.stats.fragilityMargin) ? ` <em>±${nf(0).format(a.stats.fragilityMargin * 100)}</em>` : ''}</strong></div>
        ${a.stats.fragilityFolds ? `
        <div><span>· ${L('eligiendo por IS, validando en forward', 'choosing by IS, validating on forward')}</span><strong>${pct(a.stats.fragilityFolds.isToOos.value, 0)}</strong></div>
        <div><span>· ${L('eligiendo por forward, validando en IS', 'choosing by forward, validating on IS')}</span><strong>${pct(a.stats.fragilityFolds.oosToIs.value, 0)}</strong></div>
        <div><span>· ${L('asimetria entre sentidos', 'asymmetry across directions')}</span><strong>${pct(a.stats.fragilityAsymmetry, 0)}</strong></div>` : ''}
        <div><span>${L('Pruebas realizadas', 'Trials run')}</span><strong>${int(a.meta.total)}</strong></div>
        <div><span>${L('Pruebas efectivas (regiones distintas)', 'Effective trials (distinct regions)')}</span><strong>${int(a.stats.effectiveTrials)}</strong></div>
        ${a.stats.sharpeTest ? `
        <div><span>${L('Sharpe máximo observado', 'Maximum observed Sharpe')}</span><strong>${num(a.stats.sharpeTest.observedMax, 3)} <em>${L('con', 'with')} ${int(a.stats.sharpeTest.observedTrades)} ops</em></strong></div>
        <div><span>${L('Error típico de un Sharpe', 'Typical Sharpe standard error')}</span><strong>${num(a.stats.sharpeTest.typicalSe, 4)}</strong></div>
        <div><span>${L(`Umbral por azar con ${int(a.stats.sharpeTest.trials)} pruebas`, `Chance threshold with ${int(a.stats.sharpeTest.trials)} trials`)}</span><strong>${num(a.stats.sharpeTest.chanceMax, 3)}</strong></div>
        <div><span>${L('Umbral con pruebas efectivas', 'Threshold with effective trials')}</span><strong>${num(a.stats.sharpeTest.chanceMaxEffective, 3)}</strong></div>
        <div><span>${L('Umbral del contraste Bailey (más estricto)', 'Bailey-style threshold (stricter)')}</span><strong>${num(a.stats.sharpeTest.chanceMaxConservative, 3)}</strong></div>
        <div><span>${L('Prob. bajo azar (Lo)', 'Chance probability (Lo)')}</span><strong>${Number.isFinite(a.stats.sharpeTest.deflated) ? pct(a.stats.sharpeTest.deflated, 1) : '—'}</strong></div>` : ''}
        <div><span>${L('Tiempo de calculo', 'Compute time')}</span><strong>${int(a.meta.elapsedMs)} ms</strong></div>
      </div>
      <p class="chart-note">
        ${L(
          `<strong>Como leer el contraste del Sharpe.</strong> La hipotesis nula es que ninguna configuración
        tiene ventaja: entonces cada Sharpe observado sería ruido alrededor de cero, y el mejor de N pruebas
        saldria positivo por si solo. El error típico se calcula con el número de operaciones de cada
        configuración, asumiendo que el Sharpe de MT5 se estima sobre esas operaciones. Si en tu versión del
        terminal esa cifra viniese anualizada, el umbral real sería más alto que el mostrado. Por eso
        <strong>suspender esta prueba es una señal fuerte, pero aprobarla no demuestra nada por si solo</strong>.
        El umbral con pruebas efectivas cuenta regiones distintas del espacio en lugar de configuraciones,
        porque dos vecinos no son dos pruebas independientes.`,
          `<strong>How to read the Sharpe contrast.</strong> The null hypothesis is that no configuration
        has an edge: then each observed Sharpe would be noise around zero, and the best of N trials
        would come out positive on its own. The typical error is computed from each configuration's
        trade count, assuming MT5's Sharpe is estimated on those trades. If in your terminal version
        that figure were annualized, the real threshold would be higher than shown. So
        <strong>failing this test is a strong signal, but passing it proves nothing on its own</strong>.
        The effective-trials threshold counts distinct regions of the space instead of configurations,
        because two neighbors are not two independent trials.`,
        )}
      </p>
      <p class="chart-note">
        ${L(
          `<strong>Los dos umbrales del Sharpe.</strong> El contraste tipo Bailey usa como
        dispersión de la hipótesis nula la desviación típica de los Sharpe <em>entre configuraciones</em>. Aquí se
        usa el error de estimación de un Sharpe (Lo, 2002), y es una decisión deliberada: en una malla densa de
        UNA estrategia esa dispersión la produce sobre todo la forma de la superficie de parámetros, no el ruido,
        de modo que tomarla como nula sube el listón cuanta <em>más</em> señal real hay. Se muestran los dos para
        que la distancia entre ellos la juzgues tú — no se presenta como “Sharpe deflactado” clásico aprobado.`,
          `<strong>The two Sharpe thresholds.</strong> The Bailey-style contrast uses as
        null dispersion the standard deviation of Sharpes <em>across configurations</em>. Here we
        use the estimation error of a Sharpe (Lo, 2002), and that is deliberate: on a dense grid of
        ONE strategy that dispersion is produced mostly by the shape of the parameter surface, not noise,
        so taking it as null raises the bar the <em>more</em> real signal there is. Both are shown so
        you can judge the distance between them — not as a classic approved “deflated Sharpe”.`,
        )}
      </p>
      <p class="chart-note">
        ${L(
          `<strong>Por qué esto no se llama PBO.</strong> El método original (CSCV) parte la <em>serie temporal</em> de
        rendimientos de cada prueba en bloques y recombina todas las particiones. Eso exige la curva de equity de
        cada configuración, y la exportación de optimización de MT5 solo trae métricas agregadas por pasada: con
        ese fichero el CSCV completo es imposible, y no hay aproximación que lo arregle. Lo que sí se puede medir
        -y es lo que ves- es cuánto depende el resultado de qué configuraciones había en el menú, en los dos
        sentidos de la partición. Es útil, pero es otra cosa, y llamarlo PBO sería tomar prestada una autoridad
        que no nos corresponde.`,
          `<strong>Why this is not called PBO.</strong> The original method (CSCV) splits each trial's
        <em>return time series</em> into blocks and recombines all partitions. That needs each configuration's
        equity curve, and MT5's optimization export only brings aggregated metrics per pass: with
        that file full CSCV is impossible, and no approximation fixes it. What can be measured
        — and what you see — is how much the result depends on which configurations were on the menu, in both
        partition directions. It is useful, but it is something else, and calling it PBO would borrow authority
        that is not ours.`,
        )}
      </p>
    </section>

    ${renderStabilityPanel(a)}
    ${renderSensitivityPanel(a)}`;
}

/**
 * Estabilidad del veredicto frente a sus propias constantes.
 *
 * Responde con un numero a la pregunta mas incomoda que se le puede hacer a esta app:
 * ¿la recomendacion sale de mis datos o del ajuste de vuestros umbrales?
 */
export function renderStabilityPanel(a) {
  const st = a.stats.stabilityCheck;
  if (!st || !st.draws) return '';
  const internal = st.internal || st;
  const gates = st.gates;
  const pctRegion = 100 * internal.regionRate;
  const tone = internal.regionRate >= 0.8 ? 'ok' : internal.regionRate >= 0.5 ? 'warn' : 'bad';
  const gTone = gates ? (gates.regionRate >= 0.8 ? 'ok' : gates.regionRate >= 0.5 ? 'warn' : 'bad') : '';
  return `<section class="panel">
    <div class="panel-head compact">
      <div><div class="panel-kicker">${L('Auditoría interna', 'Internal audit')}</div><h2>${L('¿Y si moviéramos nuestros propios umbrales?', 'What if we moved our own thresholds?')}</h2></div>
      <div class="stability-badge ${tone}">${pctRegion.toFixed(0)} %</div>
    </div>
    <p class="panel-intro">
      ${L(
        `Los umbrales de meseta (suelo de calidad, robustez mínima, soporte mínimo, tamaño mínimo…) son
      juicios calibrados, no cantidades derivadas de ninguna teoría. Así que la búsqueda se repite
      <strong>${int(st.draws)} veces</strong> moviéndolos al azar un <strong>±${(100 * st.perturbation).toFixed(0)} %</strong>,
      para ver cuánto de lo que te recomendamos depende de dónde pusimos nosotros los cortes.`,
        `Plateau thresholds (quality floor, minimum robustness, minimum support, minimum size…) are
      calibrated judgments, not quantities derived from any theory. So the search is repeated
      <strong>${int(st.draws)} times</strong> moving them at random by <strong>±${(100 * st.perturbation).toFixed(0)} %</strong>,
      to see how much of what we recommend depends on where we placed the cuts.`,
      )}
    </p>
    <div class="stability-cols">
      <div>
        <h3>${L('Nuestros umbrales internos', 'Our internal thresholds')}</h3>
        <p class="stability-sub">${L('Suelo de calidad, robustez mínima, soporte mínimo, tamaño mínimo.', 'Quality floor, minimum robustness, minimum support, minimum size.')}</p>
        <div class="evidence-list">
          <div><span>${L('Variaciones probadas', 'Variations tried')}</span><strong>${int(internal.draws)}</strong></div>
          <div><span>${L('Sigue existiendo alguna meseta', 'Some plateau still exists')}</span><strong>${pct(internal.plateauRate, 0)}</strong></div>
          <div><span>${L('Gana la MISMA región', 'SAME region wins')}</span><strong class="big ${tone}">${pct(internal.regionRate, 0)}</strong></div>
          <div><span>${L('Gana exactamente la misma configuración', 'Exactly the same configuration wins')}</span><strong>${pct(internal.representativeRate, 0)}</strong></div>
        </div>
      </div>
      <div>
        <h3>${L('Tus mínimos', 'Your minima')}</h3>
        <p class="stability-sub">${L('Factor de beneficio exigido, drawdown máximo, operaciones mínimas.', 'Required profit factor, maximum drawdown, minimum trades.')}</p>
        ${gates ? `<div class="evidence-list">
          <div><span>${L('Variaciones probadas', 'Variations tried')}</span><strong>${int(gates.draws)}</strong></div>
          <div><span>${L('Sigue existiendo alguna meseta', 'Some plateau still exists')}</span><strong>${pct(gates.plateauRate, 0)}</strong></div>
          <div><span>${L('Gana la MISMA región', 'SAME region wins')}</span><strong class="big ${gTone}">${pct(gates.regionRate, 0)}</strong></div>
          <div><span>${L('Gana exactamente la misma configuración', 'Exactly the same configuration wins')}</span><strong>${pct(gates.representativeRate, 0)}</strong></div>
        </div>` : `<p class="stability-sub">${L(
          'No se ha podido auditar: rehacer la vecindad decenas de veces con un conjunto de este tamaño habría hecho el análisis demasiado lento.',
          'Could not be audited: rebuilding the neighborhood dozens of times on a set this size would have made the analysis too slow.',
        )}</p>`}
      </div>
    </div>
    <p class="chart-note">
      ${L(
        `La fila que importa es <strong>gana la misma región</strong>. Si la recomendación es una propiedad de la
      forma de tu superficie de parámetros, esa cifra es alta en las dos columnas. La última fila casi siempre
      es menor, y eso es normal y sano: dentro de una meseta buena hay varias configuraciones casi
      equivalentes, y cuál gana entre ellas sí es cuestión de detalle.`,
        `The row that matters is <strong>same region wins</strong>. If the recommendation is a property of the
      shape of your parameter surface, that figure is high in both columns. The last row is almost always
      lower, and that is normal and healthy: inside a good plateau there are several nearly
      equivalent configurations, and which one wins among them is a matter of detail.`,
      )}
    </p>
    <p class="chart-note">
      ${L(
        `<strong>Por qué hay dos columnas.</strong> Durante un tiempo esta auditoría solo movía nuestros umbrales
      internos, y daba una cifra tranquilizadora sobre la palanca equivocada: medido en un EA real, cambiar el
      factor de beneficio exigido de 1,15 a 1,20 y a 1,25 devolvía <em>tres configuraciones recomendadas
      distintas</em>, y eso no lo veía nadie. El mínimo que tú escribes es, a menudo, la variable que más
      manda, así que también se audita.`,
        `<strong>Why there are two columns.</strong> For a while this audit only moved our internal
      thresholds, and gave a reassuring figure on the wrong lever: measured on a real EA, changing the
      required profit factor from 1.15 to 1.20 and to 1.25 returned <em>three different recommended
      configurations</em>, and nobody saw that. The minimum you type is often the variable that
      matters most, so it is audited too.`,
      )}
    </p>
  </section>`;
}

/**
 * Influencia de cada parametro medida de dos formas. La distincion importa: un parametro
 * puede parecer plano por separado y ser decisivo en combinacion con otro.
 */
export function renderSensitivityPanel(a) {
  const rows = (a.sensitivity || []).filter((x) => !x.constant);
  if (!rows.length) return '';
  const floor = 0.12;
  const sorted = [...rows].sort((x, y) => (y.effective || 0) - (x.effective || 0));
  const role = (j) => (a.meta.activeDims.includes(j) ? `<span class="role dist">${L('distancia', 'distance')}</span>`
    : a.meta.blockDims.includes(j) ? `<span class="role block">${L('partición', 'partition')}</span>`
      : `<span class="role flat">${L('ignorado', 'ignored')}</span>`);
  return `<section class="panel">
    <div class="panel-head compact">
      <div><div class="panel-kicker">${L('Diagnóstico', 'Diagnostics')}</div><h2>${L('Cuánto influye cada parámetro', 'How much each parameter influences')}</h2></div>
    </div>
    <p class="panel-intro">
      ${L(
        `<strong>Aislado</strong> agrupa por el valor del parámetro y promedia sobre todo lo demás.
      <strong>Combinado</strong> deja fijos todos los demás parámetros y mide el recorrido a lo largo de este.
      Un parámetro cuyo efecto se invierte según otro sale plano en la primera medida y no en la segunda;
      por eso manda <strong>la mayor de las dos</strong>. Descartar un eje que sí influye haría pasar por
      vecinos a configuraciones que no lo son, e inflaría las mesetas hasta fabricar una donde no hay ninguna.`,
        `<strong>Isolated</strong> groups by the parameter value and averages over everything else.
      <strong>Combined</strong> holds all other parameters fixed and measures the range along this one.
      A parameter whose effect reverses depending on another looks flat on the first measure and not on the second;
      that is why <strong>the larger of the two</strong> wins. Dropping an axis that does influence would treat
      non-neighbors as neighbors, and inflate plateaus until inventing one where none exists.`,
      )}
    </p>
    <div class="table-wrap">
      <table class="grid-table">
        <thead><tr><th>${L('Parámetro', 'Parameter')}</th><th>${L('Aislado', 'Isolated')}</th><th>${L('Combinado', 'Combined')}</th><th>${L('Efectivo', 'Effective')}</th><th>${L('Papel', 'Role')}</th></tr></thead>
        <tbody>
          ${sorted.map((x) => `<tr${(x.sensitivity || 0) < floor && (x.effective || 0) >= floor ? ' class="rescued"' : ''}>
            <td><code>${esc(x.name)}</code></td>
            <td>${num(x.sensitivity, 3)}</td>
            <td>${Number.isFinite(x.conditional) ? num(x.conditional, 3) : `<em>${L('n/d', 'n/a')}</em>`}</td>
            <td><strong>${num(x.effective, 3)}</strong></td>
            <td>${role(x.index)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    ${a.meta.rescuedDims && a.meta.rescuedDims.length ? `<div class="report-ok">${L(
      'Las filas resaltadas se habrían descartado midiendo solo el efecto aislado. Se conservan por su efecto combinado.',
      'Highlighted rows would have been dropped measuring only the isolated effect. They are kept for their combined effect.',
    )}</div>` : ''}
    ${a.meta.irregularGrids && a.meta.irregularGrids.length ? `<div class="inline-warn"><strong>${L('Saltos desiguales en la rejilla.', 'Uneven grid steps.')}</strong> ${a.meta.irregularGrids.slice(0, 3).map((g) => `<code>${esc(g.name)}</code> (×${g.ratio.toFixed(0)})`).join(', ')}: ${L(
      'el motor cuenta posiciones, no distancias, así que dos valores consecutivos están siempre &laquo;a un paso&raquo; aunque entre ellos haya un abismo.',
      'the engine counts positions, not distances, so two consecutive values are always &laquo;one step&raquo; even if there is a chasm between them.',
    )}</div>` : ''}
  </section>`;
}
