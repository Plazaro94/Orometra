// Mesetas, descartes, parámetros y paneles de diagnóstico.

import { qualityLabel } from '../core/metrics.js';
import { topInfluentialPair, buildAxisPairGrid } from '../core/surface.js';
import { mountPlateauSurface } from './plateau-surface.js';
import { sensitivityBars, parameterProfile, plateauHeatmap, dimRole } from './charts.js';
import { L, pctSign } from './i18n.js';
import { gloss } from './glossary.js';
import { fallbackNote } from './ui-verdict.js';
import { setCoverageNote } from './export.js';
import { state, $, num, int, pct, esc, rich, nf, paramHtml, roleBadge, findingsForCategory } from './ui-state.js';

/**
 * Hallazgos del motor que narran en prosa el mismo numero que esta tabla muestra en
 * crudo (ver js/ui-state.js#categorizeFinding). Se pintan pegados a su tabla en vez de
 * en una lista aparte en Verdict, para no explicar el mismo dato dos veces sin conexion
 * visible entre ambos.
 */
function findingsNote(findings) {
  if (!findings.length) return '';
  return `<ul class="findings findings-inline">
    ${findings.map((f) => `<li class="finding f-${f.severity === 'critical' ? 'block' : f.severity}">
      <div class="finding-mark" aria-hidden="true"></div>
      <div><strong>${esc(f.title)}</strong><p>${rich(f.detail)}</p></div>
    </li>`).join('')}
  </ul>`;
}

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
        <div class="rep-pass">${L('Pasada', 'Pass')} ${esc(r.id)}</div>
        <div class="rep-sub">${L('Meseta', 'Plateau')} ${p.rank} · ${int(p.size)} ${L('configuraciones', 'configurations')}${p.coreSize ? ` · ${int(p.coreSize)} ${L('en el centro', 'in the center')}` : ''}</div>
      </div>
      <div class="rep-score">${num(p.robust, 0)}<small>${gloss('robustness', L('robustez', 'robustness'), { align: 'right' })}</small></div>
    </div>
    <div class="param-grid">
      ${a.meta.paramNames.map((n, j) => `<div class="param"><span>${esc(n)}</span><strong>${paramHtml(r.params[j])}</strong></div>`).join('')}
    </div>
    <div class="evidence-list">
      <div><span>${L('Calidad en el periodo optimizado', 'Quality on the optimized period')}</span><strong>${num(r.qualityIs, 2)} <em>${esc(qualityLabel(r.qualityIs))}</em></strong></div>
      ${hasF ? `<div><span>${L('Calidad forward', 'Forward quality')}</span><strong>${num(r.qualityOos, 2)} <em>${esc(qualityLabel(r.qualityOos))}</em></strong></div>` : ''}
      <div><span>${L('Vecinos observados', 'Observed neighbors')}</span><strong>${p.neighborhood ? int(p.neighborhood.observed) : int(p.stability.support)}</strong></div>
      <div><span>${L('Pasan mínimos / fallan', 'Pass minimums / fail')}</span><strong>${p.neighborhood
        ? `${int(p.neighborhood.passing)} / ${int(p.neighborhood.failing)}`
        : pct(p.stability.fracPass, 0)}</strong></div>
      ${p.neighborhood && p.neighborhood.slotsComplete
        ? `<div><span>${L('Huecos no observados', 'Unobserved gaps')}</span><strong>${int(p.neighborhood.gaps)} <em>${L('de', 'of')} ${int(p.neighborhood.slots)}</em></strong></div>`
        : ''}
      <div><span>${gloss('q25', L('Sus vecinos más flojos', 'Its weakest neighbors'))}</span><strong>${num(p.stability.q25, 2)}</strong></div>
      ${hasF ? `<div><span>${L('Forward · PF / DD / ops', 'Forward · PF / DD / trades')}</span><strong>${num(r.oos.profitFactor, 3)} / ${num(r.oos.drawdown, 1)}${pctSign()} / ${int(r.oos.trades)}</strong></div>` : ''}
      <div><span>${L('Periodo optimizado · PF / DD / ops', 'Optimized period · PF / DD / trades')}</span><strong>${num(r.is.profitFactor, 3)} / ${num(r.is.drawdown, 1)}${pctSign()} / ${int(r.is.trades)}</strong></div>
    </div>
    ${p.invertedRisk && p.invertedRisk.length ? `<div class="inline-warn">${L(
      `Se apoya en ${p.invertedRisk.map((x) => `<code>${esc(x.name)} = ${paramHtml(x.bestIs)}</code>`).join(', ')}, el valor que gana en el periodo optimizado pero que el forward castiga. Puede ser mérito suyo o suerte.`,
      `It relies on ${p.invertedRisk.map((x) => `<code>${esc(x.name)} = ${paramHtml(x.bestIs)}</code>`).join(', ')}, the value that wins on the optimized period but that the forward punishes. It may be merit or luck.`,
    )}</div>` : ''}
    ${p.boundary.length ? `<div class="inline-warn">${L(
      `Pegada al borde del rango en: ${p.boundary.map((b) => `<code>${esc(b.name)} = ${paramHtml(b.atMin ? b.min : b.max)}</code>`).join(', ')}`,
      `Stuck to the range edge at: ${p.boundary.map((b) => `<code>${esc(b.name)} = ${paramHtml(b.atMin ? b.min : b.max)}</code>`).join(', ')}`,
    )}</div>` : ''}
    ${a.meta.hasForward ? `<p class="muted set-note">${esc(setCoverageNote(a, p, state.searchSet))}</p>` : ''}
    <div class="rep-actions">
      <button class="ghost-btn" data-copy="${p.rank - 1}">${L('Copiar parámetros', 'Copy parameters')}</button>
      ${hasF ? `<button class="ghost-btn" data-export="set" data-plateau-index="${p.rank - 1}">${L('Descargar .set', 'Download .set')}</button>` : ''}
      <button class="ghost-btn" data-export="refine" data-plateau-index="${p.rank - 1}">${L('.set de refinamiento', 'Refinement .set')}</button>
      <button class="text-btn" data-scroll="plateauSurfacePanel">${L('Ver la meseta completa &rarr;', 'View the full plateau &rarr;')}</button>
    </div>
  </div>`;
}

/** Nombre legible de cada métrica (en el archivo van como identificadores internos). */
const METRIC_LABEL = () => ({
  profit: L('beneficio', 'profit'),
  profitFactor: L('factor de beneficio', 'profit factor'),
  recoveryFactor: L('factor de recuperación', 'recovery factor'),
  sharpe: 'Sharpe',
  drawdown: 'drawdown',
  trades: L('operaciones', 'trades'),
  expectedPayoff: L('beneficio esperado', 'expected payoff'),
});

export function renderPlateaus(a) {
  if (!a.plateaus.length) {
    return `<div class="detail-head"><h2>${L('No se ha encontrado ninguna meseta', 'No plateau was found')}</h2>
      <p>${L(
        'Ninguna región conexa supera los mínimos con estabilidad suficiente. Revisa el diagnóstico: lo habitual es que falten datos, que el rango probado sea demasiado estrecho o que la estrategia no tenga ventaja.',
        'No plateau clears the minimums with enough stability. Check diagnostics: usually data are missing, the tested range is too narrow, or the strategy has no edge.',
      )}</p></div>
      ${a.fallback ? `<div class="inline-warn"><strong>${L('Sugerencia orientativa', 'Tentative suggestion')}: ${L('pasada', 'pass')} ${esc(a.fallback.record.id)}.</strong> ${fallbackNote(a)}</div>` : ''}
      <button class="text-btn" data-goto="diagnostics">${L('Ir al diagnóstico &rarr;', 'Go to diagnostics &rarr;')}</button>`;
  }
  const sel = a.plateaus[Math.min(state.selectedPlateau, a.plateaus.length - 1)];
  const rows = a.plateaus.map((p) => `<tr class="${p.rank === sel.rank ? 'sel' : ''}">
      <td><button class="link-btn" data-plateau="${p.rank - 1}">${L(`Meseta ${p.rank}`, `Plateau ${p.rank}`)}</button></td>
      <td class="mono">${esc(p.record.id)}</td>
      <td class="strong">${num(p.robust, 0)}</td>
      <td>${int(p.size)}</td>
      <td>${int(p.coreSize)}</td>
      <td>${num(p.q10Score, 2)}</td>
      <td>${num(p.medianScore, 2)}</td>
      <td>${num(p.coherence, 2)}</td>
      <td>${p.boundary.length ? `<span class="badge warn">${p.boundary.length}</span>` : '<span class="badge ok">0</span>'}</td>
    </tr>`).join('');

  const sparseSampling = a.meta.sampling === 'sparse' || a.meta.sampling === 'partial';

  return `<div class="detail-head">
      
      <h2>${L('Las mesetas de tu optimización', 'The plateaus in your optimization')}</h2>
      <p>${L(
        'Ordenadas por cómo rinden sus configuraciones <strong>más flojas</strong>, no las mejores. Una meseta es una zona continua donde incluso las más flojas siguen rindiendo bien.',
        'Ordered by how their <strong>weakest</strong> configurations perform, not their best. A plateau is a continuous zone where even the weakest ones keep performing well.',
      )}</p>
    </div>
    ${sparseSampling ? `<div class="inline-warn">${L(
      `Esta optimización usó ${a.meta.sampling === 'sparse' ? 'muestreo disperso (genético)' : 'una rejilla parcial'}, así que la meseta de abajo puede tener huecos sin probar. Antes de decidir con esto,`,
      `This optimization used ${a.meta.sampling === 'sparse' ? 'sparse (genetic) sampling' : 'a partial grid'}, so the plateau below can have untested gaps. Before deciding on this,`,
    )} <button class="text-btn" data-scroll="refinementPanel">${L('repite el rango en rejilla completa &rarr;', 're-run this range on a full grid &rarr;')}</button> ${L('— son pocas configuraciones y así confirmas si la meseta aguanta entera.', "— it's a small number of configurations and confirms whether the whole plateau holds.")}</div>` : ''}
    <section class="panel">
      <div class="table-wrap"><table>
        <thead><tr><th>#</th><th>${L('Pasada elegida', 'Chosen pass')}</th><th>${L('Robustez', 'Robustness')}</th><th>${L('Tamaño', 'Size')}</th><th>${L('Centro', 'Center')}</th><th>${L('Las más flojas', 'Weakest')}</th><th>${L('Mediana', 'Median')}</th><th>${L('Variación', 'Spread')}</th><th>${L('Bordes', 'Edges')}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </section>

    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Meseta', 'Plateau')} ${sel.rank}</div><h2>${L('Configuración representativa', 'Representative configuration')}</h2></div>
        <span class="status-pill">${gloss('jointpick', L('elegida por buen puesto en los dos periodos', 'chosen for ranking well in both periods'), { align: 'right' })}</span></div>
      ${renderRepCard(a, sel)}
    </section>

    ${renderPlateauSurfacePanel(a, sel)}

    <section class="panel" id="refinementPanel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Siguiente paso', 'Next step')}</div><h2>${L('Rango para reoptimizar en rejilla', 'Range for grid re-optimization')}</h2></div>
        ${sparseSampling ? `<span class="status-pill warn-pill">${L('Recomendado', 'Recommended')}</span>` : ''}</div>
      <p class="panel-intro">${L(
        `Vuelve a MT5 y lanza una optimización con el <em>algoritmo lento (búsqueda completa)</em> acotada a este rango, centrado en la configuración recomendada. Descarga el .set de refinamiento y cárgalo en la pestaña de parámetros de entrada del probador («Inputs»: clic derecho → «Cargar»): ya trae marcados los parámetros que hay que barrer, con su inicio, paso y fin. Con la búsqueda completa no quedan huecos sin probar y la forma de la meseta se mide mejor. Son <strong>${int(sel.refinement.reduce((acc, x) => acc * (x.constant ? 1 : x.levels), 1))} configuraciones</strong>, un tamaño que se puede ejecutar de verdad.`,
        `Go back to MT5 and run an optimization with the <em>Slow complete algorithm</em> bounded to this range, centered on the recommended configuration. Download the refinement .set and load it in the tester's “Inputs” tab (right-click → “Load”): it already marks the parameters to sweep, with their start, step and stop. With the complete search no gaps are left untested, and the plateau's shape is measured better. That is <strong>${int(sel.refinement.reduce((acc, x) => acc * (x.constant ? 1 : x.levels), 1))} configurations</strong> — a size you can actually run.`,
      )}</p>
      <div class="table-wrap"><table>
        <thead><tr><th>${L('Parámetro', 'Parameter')}</th><th>${L('Centro', 'Center')}</th><th>${L('Inicio', 'Start')}</th><th>${L('Paso', 'Step')}</th><th>${L('Fin', 'Stop')}</th><th>${L('Niveles', 'Levels')}</th></tr></thead>
        <tbody>${sel.refinement.map((x) => `<tr>
          <td class="mono">${esc(x.name)}</td>
          ${x.constant
            ? `<td>${paramHtml(x.value)}</td><td colspan="4" class="muted">${L('no se optimizó', 'was not optimized')}</td>`
            : x.fixed
              ? `<td class="strong">${paramHtml(x.center)}</td><td colspan="4" class="muted">${x.categorical
                ? L('booleano o enumeración: se fija; actívalo a mano si quieres barrerlo', 'boolean or enum: fixed; enable manually if you want to sweep it')
                : x.flat
                  ? L('se fija: no tiene efecto medible en tus datos', 'fixed: it has no measurable effect in your data')
                  : L('se fija: el presupuesto de la rejilla se gasta en parámetros más influyentes', 'fixed: the grid budget is spent on more influential parameters')}</td>`
              : `<td class="strong">${paramHtml(x.center)}</td><td>${paramHtml(x.start)}</td><td>${paramHtml(x.step)}</td><td>${paramHtml(x.stop)}</td><td>${int(x.levels)}</td>`}
        </tr>`).join('')}</tbody>
      </table></div>
      <div class="rep-actions"><button class="ghost-btn" data-export="refine" data-plateau-index="${sel.rank - 1}">${L('Descargar .set de refinamiento', 'Download refinement .set')}</button></div>
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
    return `<section class="panel" id="plateauSurfacePanel">
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
      `Cobertura de esta rejilla 2D: ${Math.round(grid.coverage * 100)} %. Las celdas vacías no son cero: son configuraciones que la optimización (probablemente genética) no probó con el resto de parámetros en el valor de tu meseta — no se inventa un dato ahí.`,
      `Coverage of this 2D grid: ${Math.round(grid.coverage * 100)}%. Empty cells are not zero: they are configurations the optimization (likely genetic) never tested with the other parameters at your plateau's value — nothing is invented there.`,
    )
    : L(
      'Rejilla completa para estos dos parámetros: cada celda es una pasada real.',
      'Full grid for these two parameters: every cell is a real pass.',
    );

  return `<section class="panel" id="plateauSurfacePanel">
    <div class="panel-head compact">
      <div><div class="panel-kicker">${L('Visual', 'Visual')}</div><h2>${L('Cómo se ve tu meseta elegida', 'What your chosen plateau looks like')}</h2></div>
      <div class="surface-axes">
        <label class="inline-select">${L('Eje X', 'X axis')} <select id="surfaceDimA">${surfaceAxisOptions(a, dimA, dimB)}</select></label>
        <label class="inline-select">${L('Eje Y', 'Y axis')} <select id="surfaceDimB">${surfaceAxisOptions(a, dimB, dimA)}</select></label>
      </div>
    </div>
    <p class="panel-intro">${L(
      `La altura es la calidad real de cada pasada en el periodo optimizado. En azul, las configuraciones que pertenecen a esta meseta (se descubre en el periodo optimizado; el forward solo la valida), y en lima, la pasada elegida. El resto de parámetros queda fijo en los valores de la pasada ${esc(plateau.record.id)}. Arrastra en horizontal para rotar.`,
      `Height is the real quality of each pass on the optimized period. In blue, the configurations that belong to this plateau (found on the optimized period; the forward only validates it), and in lime, the chosen pass. The rest of the parameters stay fixed at pass ${esc(plateau.record.id)}'s values. Drag horizontally to rotate.`,
    )}</p>
    <div class="chart-legend" role="list">
      <span class="chart-legend-item" role="listitem"><span class="chart-swatch chart-swatch-plateau" aria-hidden="true"></span>${L('Meseta', 'Plateau')}</span>
      <span class="chart-legend-item" role="listitem"><span class="chart-swatch chart-swatch-ground" aria-hidden="true"></span>${L('Fuera de la meseta', 'Outside the plateau')}</span>
      <span class="chart-legend-item" role="listitem"><span class="chart-swatch chart-swatch-pick" aria-hidden="true"></span>${L('Pasada elegida', 'Chosen pass')} ${esc(plateau.record.id)}</span>
    </div>
    <div class="surface-wrap">
      <canvas id="plateauSurfaceCanvas" role="img" aria-label="${esc(L('Superficie 3D de calidad real para dos parámetros', '3D surface of real quality for two parameters'))}"></canvas>
      <div class="surface-detail" id="surfaceDetail">${renderSurfaceDetail(a, grid, null)}</div>
    </div>
    <p class="chart-note">${gapNote}</p>
  </section>`;
}

function renderSurfaceDetail(a, grid, hit) {
  // Sin nada señalado se muestra la pasada elegida (la del banderín), no un hueco.
  const fine = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hint = `<p class="muted surface-hint">${fine
    ? L('Pasa el ratón sobre una barra para ver otra configuración.', 'Hover a bar to see another configuration.')
    : L('Toca una barra para ver otra configuración.', 'Tap a bar to see another configuration.')}</p>`;
  let picked = false;
  if (!hit) {
    const [ra, rb] = grid.repCell || [];
    const cell = ra >= 0 && rb >= 0 && grid.grid[rb] ? grid.grid[rb][ra] : null;
    if (!cell) return hint;
    hit = { ...cell, a: ra, b: rb };
    picked = true;
  }
  const rec = a.records[hit.recordIndex];
  return `${picked ? `<div class="surface-detail-kicker">${L('La elegida', 'The selected one')}</div>` : ''}<div class="evidence-list">
    <div><span>${esc(grid.names[0])}</span><strong>${paramHtml(grid.levelsA[hit.a])}</strong></div>
    <div><span>${esc(grid.names[1])}</span><strong>${paramHtml(grid.levelsB[hit.b])}</strong></div>
    <div><span>${L('Pasada', 'Pass')}</span><strong class="mono">${esc(rec.id)}</strong></div>
    <div><span>${L('Calidad al optimizar', 'Quality when optimizing')}</span><strong>${num(hit.quality, 2)}</strong></div>
    <div><span>${L('Calidad en el forward', 'Quality on the forward')}</span><strong>${Number.isFinite(hit.qualityOos) ? num(hit.qualityOos, 2) : '—'}</strong></div>
    <div><span>${L('¿En esta meseta?', 'In this plateau?')}</span><strong class="big ${hit.inPlateau ? 'ok' : 'warn'}">${hit.inPlateau ? L('sí', 'yes') : L('no', 'no')}</strong></div>
  </div>${hint}`;
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
    label: `${L('Pasada', 'Pass')} ${sel.record.id}`,
    onHover(cell, aIdx, bIdx) {
      const detail = $('#surfaceDetail');
      if (!detail) return;
      detail.innerHTML = renderSurfaceDetail(a, grid, cell ? { ...cell, a: aIdx, b: bIdx } : null);
    },
  });
}

/**
 * Los puestos que faltan en la tabla (p. ej. empieza en #5) son configuraciones que SI
 * estan en una meseta. Sin decirlo, parecia que la tabla estaba rota.
 */
function skippedRanksNote(peaks) {
  const shown = new Set(peaks.map((p) => p.criterionRank));
  const last = Math.max(...shown);
  const missing = [];
  for (let r = 1; r <= last; r++) if (!shown.has(r)) missing.push(r);
  if (!missing.length) return '';
  const list = missing.length <= 6 ? missing.map((r) => `#${r}`).join(', ') : L(`${missing.length} puestos`, `${missing.length} ranks`);
  return `<p class="chart-note">${missing.length === 1
    ? L(`Falta ${list}: esa configuración forma parte de una meseta, así que no es un descarte.`,
      `${list} is missing: that configuration belongs to a plateau, so it is not a rejection.`)
    : L(`Faltan ${list}: esas configuraciones forman parte de una meseta, así que no son descartes.`,
      `${list} are missing: those configurations belong to a plateau, so they are not rejections.`)}</p>`;
}

/**
 * Tus mínimos, una sola vez encima de la tabla: antes cada fila repetía la misma frase
 * larga («no cumple los mínimos (in-sample: PF < 1,20, DD > 20 %)»). En las filas queda
 * solo lo que las distingue.
 */
function rejectedMinimums(a) {
  const g = a.meta.policy.gates;
  const parts = [
    g.requireProfit ? L('beneficio positivo', 'positive profit') : '',
    `${L('factor de beneficio', 'profit factor')} ≥ ${num(g.minProfitFactor, 2)}`,
    `drawdown ≤ ${num(g.maxDrawdownPct, 0)}${pctSign()}`,
    a.meta.hasForward
      ? L(`${int(a.meta.minTradesIs)} operaciones en el periodo optimizado y ${int(a.meta.minTradesOos)} en el forward`,
        `${int(a.meta.minTradesIs)} trades on the optimized period and ${int(a.meta.minTradesOos)} on the forward`)
      : L(`${int(a.meta.minTradesIs)} operaciones`, `${int(a.meta.minTradesIs)} trades`),
  ].filter(Boolean);
  return `<p class="rejected-minimums"><strong>${L('Tus mínimos', 'Your minimums')}:</strong> ${parts.join(' · ')}. ${L('En cada fila, lo que la descarta.', 'Each row shows what rules it out.')}<span class="hover-hint"> ${L(
    'Pasa el ratón por una etiqueta para ver el detalle.',
    'Hover a tag to see the detail.',
  )}</span></p>`;
}

export function renderRejected(a) {
  const critName = a.meta.hasForward
    ? (a.meta.criterionOosName || L('criterio forward', 'forward criterion'))
    : (a.meta.criterionIsName || L('criterio', 'criterion'));
  if (!a.peaks.length) {
    return `<div class="detail-head"><h2>${L('Ningún descarte entre las mejores por tu criterio', 'No rejections among the best by your criterion')}</h2>
      <p>${L(
        'Las configuraciones que encabezan tu ranking caen dentro de alguna meseta. Es poco habitual y es buena señal.',
        'The configurations that top your ranking fall inside some plateau. That is uncommon and a good sign.',
      )}</p></div>`;
  }
  return `<div class="detail-head">
      
      <h2>${L('Primeras en MT5, descartadas aquí', 'Top in MT5, discarded here')}</h2>
      <p>${L(
        `Ordenadas por <code>${esc(critName)}</code>, que es la columna por la que MT5 te las presenta. Para cada una se indica por qué el motor no la respalda. Esta es la tabla que evita la mayoría de los errores.`,
        `Ordered by <code>${esc(critName)}</code>, the column MT5 presents them by. For each one the engine explains why it does not back it. This is the table that prevents most mistakes.`,
      )}</p>
      ${skippedRanksNote(a.peaks)}
    </div>
    <section class="panel">
      ${rejectedMinimums(a)}
      <div class="table-wrap"><table class="stack-table rej-table">
        <thead><tr><th>${L('Puesto', 'Rank')}</th><th>${L('Pasada', 'Pass')}</th><th>${esc(critName)}</th><th>${L('Calidad', 'Quality')}</th><th>${L('Vecinos', 'Neighbors')}</th><th>${L('Vecinos flojos', 'Weak neighbors')}</th><th>${L('Motivo del descarte', 'Rejection reason')}</th></tr></thead>
        <tbody>${a.peaks.map((p) => `<tr class="stack-row">
          <td data-label="${L('Puesto', 'Rank')}"><span class="rank-mini">#${int(p.criterionRank)}</span></td>
          <td class="mono" data-label="${L('Pasada', 'Pass')}">${esc(p.record.id)}</td>
          <td class="strong" data-label="${esc(critName)}">${num(p.key, 2)}</td>
          <td data-label="${L('Calidad', 'Quality')}">${num(p.score, 2)}</td>
          <td data-label="${L('Vecinos', 'Neighbors')}">${int(p.st.support)}</td>
          <td data-label="${L('Vecinos flojos', 'Weak neighbors')}">${num(p.st.q25, 2)}</td>
          <td class="reasons-cell" data-label="${L('Motivo del descarte', 'Rejection reason')}"><div class="reasons">${(p.tags || p.reasons.map((r) => ({ tag: r, detail: r }))).map((t) => `<span class="reason" title="${esc(t.detail)}"><span class="reason-tag">${esc(t.tag)}</span>${t.tag === t.detail ? '' : `<span class="reason-detail">${esc(t.detail)}</span>`}</span>`).join('')}</div></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>`;
}

export function renderParams(a) {
  const [dimA, dimB] = topTwoSensitive(a);
  const options = a.sensitivity.map((s) => `<option value="${s.index}"${s.index === state.selectedParam ? ' selected' : ''}${s.constant ? ' disabled' : ''}>${esc(s.name)}${s.constant ? L(' (constante)', ' (constant)') : ''}</option>`).join('');
  return `<div class="detail-head">
      
      <h2>${L('Qué parámetros mandan de verdad', 'Which parameters really matter')}</h2>
      <p>${L(
        'La sensibilidad mide cuánto se mueve la calidad al recorrer los valores de un parámetro. Los numéricos que influyen <strong>cuentan para buscar vecinos</strong>. Los de sí/no o de lista (por ejemplo, el tipo de media) <strong>no se miden en distancia</strong>: dos configuraciones solo son vecinas si coinciden en ellos, porque activar o no un filtro no es un paso pequeño sino otra estrategia. Solo se ignora lo demostrablemente plano.',
        'Sensitivity measures how much quality moves as you walk a parameter\'s values. Influential numerics <strong>count when finding neighbors</strong>. Yes/no and list parameters (for example, the moving-average type) <strong>are not measured in distance</strong>: two configurations are neighbors only if they match on them, because enabling a filter is not a small step — it is another strategy. Only demonstrably flat axes are ignored.',
      )}</p>
      ${a.meta.releasedBlockNames && a.meta.releasedBlockNames.length ? `<div class="inline-warn">${L(
        `Para conseguir vecinos suficientes se ha dejado de particionar por ${a.meta.releasedBlockNames.map((n) => `<code>${esc(n)}</code>`).join(', ')}, ${a.meta.releasedBlockNames.length > 1 ? 'los menos influyentes' : 'el menos influyente'}. Las configuraciones que solo difieran en ${a.meta.releasedBlockNames.length > 1 ? 'esos parámetros' : 'ese parámetro'} se consideran vecinas.`,
        `To get enough neighbors, partitioning was released on ${a.meta.releasedBlockNames.map((n) => `<code>${esc(n)}</code>`).join(', ')}, the least influential. Configurations that differ only on ${a.meta.releasedBlockNames.length > 1 ? 'those parameters' : 'that parameter'} are treated as neighbors.`,
      )}</div>` : ''}
    </div>
    <section class="panel panel-split">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Sensibilidad', 'Sensitivity')}</div><h2>${L('Influencia relativa', 'Relative influence')}</h2></div></div>
      <div class="split">${sensitivityBars(a)}
      <p class="chart-note">${L(
        `La barra es la influencia que cuenta: la mayor entre <strong>por sí solo</strong> (agrupando por el valor del parámetro) y <strong>con el resto fijo</strong> (dejando fijo todo lo demás). Donde aparece la marca <span class="ch-sens-marginal-swatch"></span> y un valor entre paréntesis, el parámetro parecía plano mirado solo — con el resto fijo sí influye. El detalle completo está en Diagnóstico.`,
        `The bar is the influence that counts: the larger of <strong>on its own</strong> (grouped by the parameter's value) and <strong>with the rest fixed</strong> (everything else held fixed). Where the <span class="ch-sens-marginal-swatch"></span> mark and a parenthesized value appear, the parameter looked flat on its own — with the rest fixed it does matter. The full breakdown is in Diagnostics.`,
      )}</p></div>
    </section>
    ${a.inversions && a.inversions.length ? `<section class="panel warn-panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Aviso', 'Warning')}</div><h2>${L('Parámetros invertidos entre periodos', 'Parameters inverted across periods')}</h2></div>
        <span class="status-pill warn-pill">${int(a.inversions.length)} ${L('detectados', 'detected')}</span></div>
      <p class="panel-intro">${L(
        'En estos parámetros, el valor que gana en el periodo optimizado <strong>es de los que pierden en el forward</strong>. Es la causa mecánica de que el ranking no transfiera: la señal no falta, apunta al revés. Afinarlos sobre el periodo optimizado es tiempo perdido; déjalos en un valor central y decide con los que sí son coherentes entre periodos.',
        'On these parameters, the value that wins on the optimized period <strong>is among those that lose on forward</strong>. That is the mechanical reason the ranking fails to transfer: the signal is not missing — it points the wrong way. Fine-tuning them on the optimized period is wasted time; leave them at a central value and decide with the ones that are coherent across periods.',
      )}</p>
      <div class="table-wrap"><table>
        <thead><tr><th>${L('Parámetro', 'Parameter')}</th><th>${L('Gana en el periodo optimizado', 'Wins on the optimized period')}</th><th>${L('Gana en forward', 'Wins in forward')}</th><th>${L('Margen que tiras', 'Margin you waste')}</th><th>${L('Perfil de calidad (valor: periodo optimizado / forward)', 'Quality profile (value: optimized period / forward)')}</th></tr></thead>
        <tbody>${a.inversions.map((x) => `<tr>
          <td class="mono">${esc(x.name)}</td>
          <td class="strong">${paramHtml(x.bestIs)}</td>
          <td class="strong">${paramHtml(x.bestOos)}</td>
          <td><span class="badge warn">${pct(x.regretShare, 0)}</span></td>
          <td class="values">${x.profile.map((p) => `${paramHtml(p.level)}: ${num(p.is, 2)}/${num(p.oos, 2)}`).join('  ·  ')}</td>
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
        'La caja abarca la mitad central de las configuraciones que pasan los mínimos; la línea, el valor típico (mediana). Una caída brusca de un valor al siguiente es un acantilado.',
        'The box spans the middle half of the configurations that pass the minimums; the line is the typical value (median). A sharp drop from one value to the next is a cliff.',
      )}</p>
    </section>
    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Mapa', 'Map')}</div><h2>${L('Los dos parámetros más influyentes', 'The two most influential parameters')}</h2></div></div>
      ${plateauHeatmap(a, dimA, dimB)}
      <p class="chart-note">${L(
        'Calidad mediana de cada par de valores, del tono más suave (peor) al más intenso (mejor). Una zona contigua de valores altos es una meseta; una celda alta rodeada de bajas es un pico.',
        'Median quality of each pair of values, from the softest shade (worst) to the strongest (best). A contiguous zone of high values is a plateau; a high cell surrounded by low ones is a peak.',
      )}</p>
    </section>
    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Rangos', 'Ranges')}</div><h2>${L('Valores probados', 'Values tested')}</h2></div></div>
      <p class="chart-note">${L(
        'La influencia de cada parámetro (por sí solo, con el resto fijo y la mayor de las dos) está en el gráfico de arriba y en el desglose completo de Diagnóstico. Aquí, solo lo que no sale en ningún otro sitio: qué valores probaste de verdad y qué papel juega cada uno en el motor.',
        "Each parameter's influence (on its own, with the rest fixed, and the larger of the two) is in the chart above and in the full breakdown in Diagnostics. Here, only what appears nowhere else: which values you actually tested and what role each plays in the engine.",
      )}</p>
      <div class="table-wrap"><table class="stack-table">
        <thead><tr><th>${L('Parámetro', 'Parameter')}</th><th>${L('Niveles', 'Levels')}</th><th>${L('Papel en el motor', 'Role in the engine')}</th><th>${L('Valores', 'Values')}</th></tr></thead>
        <tbody>${a.sensitivity.map((s) => `<tr class="stack-row">
          <td class="mono" data-label="${L('Parámetro', 'Parameter')}">${esc(s.name)}${a.meta.paramTypes && a.meta.paramTypes[s.index] !== 'number' ? ` <span class="badge">${esc(a.meta.paramTypes[s.index] === 'bool' ? 'bool' : 'enum')}</span>` : ''}</td>
          <td data-label="${L('Niveles', 'Levels')}">${int(s.levels)}</td>
          <td data-label="${L('Papel en el motor', 'Role in the engine')}">${roleBadge(dimRole(a, s))}</td>
          <td class="values" data-label="${L('Valores', 'Values')}">${(s.values || []).map(paramHtml).join(' · ')}</td>
        </tr>`).join('')}</tbody>
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
    sparse: L('Muestreo disperso, típico del algoritmo genético. El optimizador concentró las pruebas donde el periodo optimizado era bueno, así que la densidad local mide también dónde miró él, no solo dónde hay estabilidad.',
      'Sparse sampling, typical of the genetic algorithm. The optimizer concentrated trials where the optimized period looked good, so local density also measures where it looked, not only where there is stability.'),
  }[a.meta.sampling];

  const sameOpt = prov.checked
    ? (prov.mismatches === 0
      ? L('confirmada', 'confirmed')
      : L(`${int(prov.mismatches)} discrepancias`, `${int(prov.mismatches)} mismatches`))
    : L('no comprobable', 'not checkable');

  const gateName = (name) => (name === 'profitFactor'
    ? L('factor de beneficio', 'profit factor')
    : name === 'drawdown' ? 'drawdown' : L('operaciones', 'trades'));

  const findings = (a.verdict && a.verdict.findings) || [];
  const integrityFindings = findingsForCategory(findings, 'integrity');
  const coverageFindings = findingsForCategory(findings, 'coverage');
  const gatesFindings = findingsForCategory(findings, 'gates');
  const statsFindings = findingsForCategory(findings, 'stats');

  return `<div class="detail-head">
      
      <h2>${L('Datos y criterios del análisis', 'Analysis data and criteria')}</h2>
      <p>${L('Todo lo que decide el veredicto está aquí. Si algo se ha clasificado mal, se ve en esta pantalla.',
        'Everything that decides the verdict is here. If something was misclassified, it shows on this screen.')}</p>
    </div>

    <div class="grid-secondary">
      <section class="panel">
        <div class="panel-head compact"><div><div class="panel-kicker">${L('Integridad', 'Integrity')}</div><h2>${L('Emparejado de archivos', 'File matching')}</h2></div></div>
        <div class="evidence-list">
          <div><span>${L('Filas de la optimización', 'Optimization rows')}</span><strong>${int(integ.isRows)}</strong></div>
          <div><span>${L('Filas forward', 'Forward rows')}</span><strong>${integ.oosRows ? int(integ.oosRows) : '—'}</strong></div>
          <div><span>${L('Emparejadas por pasada', 'Matched by Pass')}</span><strong>${int(integ.matchedRows)}</strong></div>
          <div><span>${integ.unmatchedUsedForDiscovery ? L('Sin forward (solo en la optimización)', 'No forward (optimization only)') : L('Sin pareja (descartadas)', 'Unmatched (dropped)')}</span><strong>${int(integ.unmatchedIs)}</strong></div>
          <div><span>${L('Identificadores duplicados', 'Duplicate identifiers')}</span><strong>${int(integ.duplicateIds)}</strong></div>
          <div><span>${L('Filas con parámetros ilegibles', 'Rows with unreadable parameters')}</span><strong>${int(a.meta.droppedParams)}</strong></div>
          <div><span>${L('Pasadas con parámetros repetidos', 'Passes with repeated parameters')}</span><strong>${int(integ.duplicateParamVectors || 0)}</strong></div>
          <div><span>${L('Misma optimización', 'Same optimization')}</span><strong>${sameOpt}</strong></div>
        </div>
        <p class="chart-note">${L(
          'Comprobamos que los dos archivos son de la misma optimización: el resultado coincide pasada por pasada.',
          'We check that both files come from the same optimization: the result matches pass by pass.',
        )}</p>
        ${findingsNote(integrityFindings)}
      </section>

      <section class="panel">
        <div class="panel-head compact"><div><div class="panel-kicker">${gloss('sampling', L('Muestreo', 'Sampling'))}</div><h2>${L('Cómo optimizaste', 'How you optimized')}</h2></div></div>
        <div class="evidence-list">
          <div><span>${L('Configuraciones posibles', 'Possible configurations')}</span><strong>${int(a.meta.cartesian)}</strong></div>
          <div><span>${L('Configuraciones analizadas', 'Configurations analyzed')}</span><strong>${int(a.meta.total)}${a.integrity && a.integrity.collapsedTopology > 0 ? ` <em>${L('tras agrupar', 'after grouping')} ${esc((a.meta.flatDims || []).join(', '))}</em>` : ''}</strong></div>
          <div><span>${L('Parte probada', 'Share tested')}</span><strong>${Number.isFinite(a.meta.coverage) ? nf(1).format(a.meta.coverage * 100) + pctSign() : '—'}</strong></div>
          <div><span>${L('Cobertura vs .set', 'Coverage vs .set')}</span><strong>${a.meta.searchCoverage && a.meta.searchCoverage.usable && Number.isFinite(a.meta.searchCoverage.coverageSearch) ? nf(1).format(a.meta.searchCoverage.coverageSearch * 100) + pctSign() : L('sin .set', 'no .set')}</strong></div>
          <div><span>${L('Distancia entre vecinos', 'Neighbor distance')}</span><strong>${int(a.meta.radius)} ${L('paso(s)', 'step(s)')}</strong></div>
          <div><span>${L('Vecinos por configuración', 'Neighbors per configuration')}</span><strong>${L('mediana', 'median')} ${int(a.meta.medianSupport)}</strong></div>
          <div><span>${L('Duración forward estimada', 'Estimated forward duration')}</span><strong>${Number.isFinite(a.meta.periodRatio) ? pct(a.meta.periodRatio, 0) + L(' del periodo optimizado', ' of the optimized period') : '—'}</strong></div>
        </div>
        <p class="chart-note">${esc(samplingCopy)}</p>
        ${findingsNote(coverageFindings)}
      </section>
    </div>

    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Clasificación', 'Classification')}</div><h2>${L('Columnas detectadas', 'Detected columns')}</h2></div></div>
      <p class="panel-intro">${L(
        'Los parámetros no se reconocen por su nombre sino por su estructura: para una misma pasada, un parámetro vale lo mismo en los dos archivos y una métrica no, porque se midió sobre otro periodo.',
        'Parameters are not recognized by name but by structure: for the same Pass, a parameter has the same value in both files and a metric does not, because it was measured on another period.',
      )}</p>
      <div class="columns-grid">
        <div>
          <h3>${L('Parámetros', 'Parameters')} (${a.meta.paramNames.length})</h3>
          <div class="chips">${a.meta.paramNames.map((n) => `<span class="chip param-chip">${esc(n)}</span>`).join('')}</div>
        </div>
        <div>
          <h3>${L('Métricas usadas para juzgar', 'Metrics used for judgment')}</h3>
          <div class="chips">${a.meta.availableMetrics.map((n) => `<span class="chip">${esc(METRIC_LABEL()[n] || n)}</span>`).join('')}</div>
          <p class="chart-note">
            ${L(
              `Tu criterio de optimización${a.meta.criterionIsName ? ` (<code>${esc(a.meta.criterionIsName)}</code>)` : ''}
            se lee pero <strong>no puntúa</strong>: significa algo distinto en cada optimización y está contaminado
            por la propia selección. Se usa solo para ordenar la tabla de descartes.`,
              `Your optimization criterion${a.meta.criterionIsName ? ` (<code>${esc(a.meta.criterionIsName)}</code>)` : ''}
            is read but <strong>does not score</strong>: it means something different in every optimization and is contaminated
            by the selection itself. It is used only to order the rejection table.`,
            )}
          </p>
          ${integ && integ.vetoed && integ.vetoed.length ? `<p class="chart-note">${L(
            'Columnas tomadas como métrica por su nombre (nunca como parámetro):',
            'Columns taken as metrics by their name (never as parameters):',
          )} ${integ.vetoed.map((v) => `<code>${esc(v.name)}</code>`).join(', ')}.</p>` : ''}
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Política', 'Policy')}</div><h2>${L('Mínimos aplicados', 'Applied minimums')}</h2></div></div>
      <div class="evidence-list">
        <div><span>${L('Beneficio positivo', 'Positive profit')}</span><strong>${g.requireProfit ? L('exigido', 'required') : L('no exigido', 'not required')}</strong></div>
        <div><span>${gloss('profitFactor', L('Factor de beneficio mínimo', 'Minimum profit factor'))}</span><strong>${num(g.minProfitFactor, 2)}</strong></div>
        <div><span>${gloss('drawdown', L('Drawdown máximo', 'Maximum drawdown'))}</span><strong>${num(g.maxDrawdownPct, 0)}${pctSign()}</strong></div>
        <div><span>${L('Operaciones mínimas (periodo optimizado)', 'Minimum trades (optimized period)')}</span><strong>${int(a.meta.minTradesIs)}</strong></div>
        <div><span>${L('Operaciones mínimas (forward)', 'Minimum trades (forward)')}</span><strong>${int(a.meta.minTradesOos)}</strong></div>
        ${(a.meta.gateInfluence || []).filter((gi) => gi.name !== 'beneficio').map((gi) => `
        <div><span>· ${gateName(gi.name)}: ${L('descarta por sí solo', 'rejects on its own')}</span><strong>${gi.sole ? int(gi.sole) + L(' configuraciones', ' configurations') : `<em>${L('ninguna (no filtra nada)', 'none (filters nothing)')}</em>`}</strong></div>`).join('')}
        <div><span>${L('Se exigen en', 'Required in')}</span><strong>${a.meta.hasForward ? (a.meta.selectionMode === 'joint' ? L('los dos periodos', 'both periods') : L('periodo optimizado (buscar) · forward (validar)', 'optimized period (search) · forward (validate)')) : L('el periodo optimizado', 'the optimized period')}</strong></div>
      </div>
      ${findingsNote(gatesFindings)}
    </section>

    <details class="panel">
      <summary class="panel-head compact"><div><div class="panel-kicker">${L('Contraste', 'Checks')}</div><h2>${L('Pruebas estadísticas', 'Statistical tests')}</h2></div></summary>
      <div class="panel-body">
      <div class="evidence-list">
        <div><span>${L('Orden que se mantiene del periodo optimizado al forward', 'Ranking kept from the optimized period to the forward')}</span><strong>${num(a.stats.spearmanCriterion, 3)}</strong></div>
        <div><span>${gloss('fragility', L('Cuánto falla el orden de MT5', 'How often MT5\'s ranking fails'))}</span><strong>${Number.isFinite(a.stats.fragility) ? pct(a.stats.fragility, 0) : '—'}${Number.isFinite(a.stats.fragilityMargin) ? ` <em>±${nf(0).format(a.stats.fragilityMargin * 100)}</em>` : ''}</strong></div>
        ${a.stats.fragilityFolds ? `
        <div><span>· ${L('eligiendo en el periodo optimizado, validando en el forward', 'choosing on the optimized period, validating on the forward')}</span><strong>${pct(a.stats.fragilityFolds.isToOos.value, 0)}</strong></div>
        <div><span>· ${L('eligiendo en el forward, validando en el periodo optimizado', 'choosing on the forward, validating on the optimized period')}</span><strong>${pct(a.stats.fragilityFolds.oosToIs.value, 0)}</strong></div>
        <div><span>· ${L('asimetría entre sentidos', 'asymmetry across directions')}</span><strong>${pct(a.stats.fragilityAsymmetry, 0)}</strong></div>` : ''}
        <div><span>${L('Pruebas realizadas', 'Trials run')}</span><strong>${int(a.meta.total)}</strong></div>
        <div><span>${gloss('effectiveTrials', L('Pruebas efectivas (independientes)', 'Effective trials (independent)'))}</span><strong>${int(a.stats.effectiveTrials)}</strong></div>
        ${a.stats.sharpeTest ? `
        <div><span>${gloss('sharpe', L('Sharpe máximo observado', 'Maximum observed Sharpe'))}</span><strong>${num(a.stats.sharpeTest.observedMax, 3)}</strong></div>
        <div><span>${L('Sharpe medio entre pasadas', 'Mean Sharpe across trials')}</span><strong>${num(a.stats.sharpeTest.mean, 3)}</strong></div>
        <div><span>${L('Dispersión entre pasadas (σ)', 'Dispersion across trials (σ)')}</span><strong>${num(a.stats.sharpeTest.sigma, 3)}</strong></div>
        <div><span>${L('Umbral por azar (pruebas efectivas)', 'Chance threshold (effective trials)')}</span><strong>${num(a.stats.sharpeTest.chanceMax, 3)}</strong></div>` : ''}
        <div><span>${L('Tiempo de cálculo', 'Compute time')}</span><strong>${int(a.meta.elapsedMs)} ms</strong></div>
      </div>
      ${findingsNote(statsFindings)}
      <p class="chart-note">
        ${L(
          `<strong>Cómo leer el contraste del Sharpe.</strong> La hipótesis nula es que ninguna configuración
        tiene ventaja: entonces cada Sharpe observado sería ruido alrededor de cero, y el mejor de N pruebas
        saldría positivo por sí solo — ese es el umbral que hay que batir. La dispersión de esa nula sale de
        los Sharpe que de verdad obtuviste entre pasadas (estilo Bailey y López de Prado), no de un error de
        estimación por número de operaciones: el export de MT5 no dice cuántas barras usó para calcular cada
        Sharpe (desde el build 3210 del terminal lo calcula sobre los rendimientos logarítmicos <em>por barra</em> de la
        curva de equity, anualizado, no por operación), así que cualquier cifra basada en operaciones sería una suposición sin
        base real. En una rejilla densa de una sola estrategia, parte de esta dispersión la produce la propia
        forma de la superficie de parámetros (señal real), no solo el ruido — el umbral sube de más cuanta
        <em>más</em> señal real hay. Por eso <strong>superarlo es necesario, no suficiente, y no superarlo es
        una señal fuerte</strong>.`,
          `<strong>How to read the Sharpe test.</strong> The null hypothesis is that no configuration
        has an edge: then each observed Sharpe would be noise around zero, and the best of N trials
        would come out positive on its own — that is the threshold to beat. That null's dispersion comes
        from the Sharpes you actually got across trials (Bailey and López de Prado style), not from an
        estimation error based on trade count: MT5's export does not say how many bars it used to compute
        each Sharpe (since terminal build 3210 it is computed from the equity curve's <em>per-bar</em>
        log-returns, annualized, not per trade), so any trade-count-based figure would be a guess with no
        real basis. On a dense grid of one strategy, part of this dispersion is produced by the shape of the
        parameter surface itself (real signal), not just noise — the threshold rises too high, and more so the more real signal
        there is. So <strong>clearing it is necessary, not sufficient, and failing to clear it is a strong
        signal</strong>.`,
        )}
      </p>
      <p class="chart-note">
        ${L(
          `<strong>Por qué esto no se llama PBO.</strong> El método original (CSCV) parte la <em>serie temporal</em> de
        rendimientos de cada prueba en bloques y recombina todas las particiones. Eso exige la curva de equity de
        cada configuración, y la exportación de optimización de MT5 solo trae métricas agregadas por pasada: con
        ese archivo el CSCV completo es imposible, y no hay aproximación que lo arregle. Lo que sí se puede medir
        —y es lo que ves— es cuánto depende el resultado de qué configuraciones había en el menú, en los dos
        sentidos de la partición. Es útil, pero es otra cosa, y llamarlo PBO sería tomar prestada una autoridad
        que no nos corresponde.`,
          `<strong>Why this is not called PBO.</strong> The original method (CSCV) splits each trial's
        <em>return time series</em> into blocks and recombines all partitions. That needs each configuration's
        equity curve, and MT5's optimization export only contains aggregated metrics per pass: with
        that file full CSCV is impossible, and no approximation fixes it. What can be measured
        — and what you see — is how much the result depends on which configurations were on the menu, in both
        partition directions. It is useful, but it is something else, and calling it PBO would borrow authority
        that is not ours.`,
        )}
      </p>
      </div>
    </details>

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
  return `<details class="panel">
    <summary class="panel-head compact">
      <div><div class="panel-kicker">${L('Auditoría interna', 'Internal audit')}</div><h2>${L('¿Y si moviéramos nuestros propios umbrales?', 'What if we moved our own thresholds?')}</h2></div>
      <div class="stability-badge ${tone}">${pctRegion.toFixed(0)}${pctSign()}</div>
    </summary>
    <div class="panel-body">
    <p class="panel-intro">
      ${L(
        `Los umbrales de meseta (suelo de calidad, robustez mínima, soporte mínimo, tamaño mínimo…) son
      juicios calibrados, no cantidades derivadas de ninguna teoría. Así que la búsqueda se repite
      <strong>${int(st.draws)} veces</strong> moviéndolos al azar un <strong>±${(100 * st.perturbation).toFixed(0)} %</strong>,
      para ver cuánto de lo que te recomendamos depende de dónde pusimos nosotros los cortes.`,
        `Plateau thresholds (quality floor, minimum robustness, minimum support, minimum size…) are
      calibrated judgments, not quantities derived from any theory. So the search is repeated
      <strong>${int(st.draws)} times</strong> moving them at random by <strong>±${(100 * st.perturbation).toFixed(0)}%</strong>,
      to see how much of what we recommend depends on where we placed the cuts.`,
      )}
    </p>
    <div class="stability-cols">
      <div>
        <h3>${L('Nuestros criterios', 'Our criteria')}</h3>
        <p class="stability-sub">${L('Calidad mínima de una meseta, tamaño mínimo, vecinos mínimos…', 'Minimum plateau quality, minimum size, minimum neighbors…')}</p>
        <div class="evidence-list">
          <div><span>${L('Variaciones probadas', 'Variations tried')}</span><strong>${int(internal.draws)}</strong></div>
          <div><span>${L('Sigue existiendo alguna meseta', 'Some plateau still exists')}</span><strong>${pct(internal.plateauRate, 0)}</strong></div>
          <div><span>${L('Gana la MISMA región', 'SAME region wins')}</span><strong class="big ${tone}">${pct(internal.regionRate, 0)}</strong></div>
          <div><span>${L('Gana exactamente la misma configuración', 'Exactly the same configuration wins')}</span><strong>${pct(internal.representativeRate, 0)}</strong></div>
        </div>
      </div>
      <div>
        <h3>${L('Tus mínimos', 'Your minimums')}</h3>
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
    ${findingsNote(findingsForCategory((a.verdict && a.verdict.findings) || [], 'stability'))}
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
    </div>
  </details>`;
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
  // Mismas palabras que la tabla de parámetros (roleBadge): un concepto, un nombre.
  const role = (j) => (a.meta.activeDims.includes(j) ? `<span class="role dist">${L('cuenta para buscar vecinos', 'counts when finding neighbors')}</span>`
    : a.meta.blockDims.includes(j) ? `<span class="role block">${L('solo vecinos si coincide', 'neighbors only if equal')}</span>`
      : `<span class="role flat">${L('se ignora', 'ignored')}</span>`);
  return `<section class="panel">
    <div class="panel-head compact">
      <div><div class="panel-kicker">${L('Diagnóstico', 'Diagnostics')}</div><h2>${L('Cuánto influye cada parámetro', 'How much influence each parameter has')}</h2></div>
    </div>
    <p class="panel-intro">
      ${L(
        `<strong>Por sí solo</strong> agrupa por el valor del parámetro y promedia sobre todo lo demás.
      <strong>Con el resto fijo</strong> deja fijos todos los demás parámetros y mide el recorrido a lo largo de este.
      Un parámetro cuyo efecto se invierte según otro sale plano en la primera medida y no en la segunda;
      por eso manda <strong>la mayor de las dos</strong>. Descartar un eje que sí influye haría pasar por
      vecinos a configuraciones que no lo son, e inflaría las mesetas hasta fabricar una donde no hay ninguna.`,
        `<strong>On its own</strong> groups by the parameter value and averages over everything else.
      <strong>With the rest fixed</strong> holds all other parameters fixed and measures the range along this one.
      A parameter whose effect reverses depending on another looks flat on the first measure and not on the second;
      that is why <strong>the larger of the two</strong> wins. Dropping an axis that does influence would treat
      non-neighbors as neighbors, and inflate plateaus to the point of inventing one where none exists.`,
      )}
    </p>
    <div class="table-wrap">
      <table class="grid-table">
        <thead><tr><th>${L('Parámetro', 'Parameter')}</th><th>${L('Por sí solo', 'On its own')}</th><th>${L('Con el resto fijo', 'With the rest fixed')}</th><th>${L('El mayor', 'The larger')}</th><th>${L('Papel', 'Role')}</th></tr></thead>
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
      'the engine counts positions, not distances, so two consecutive values are always “one step” even if there is a chasm between them.',
    )}</div>` : ''}
  </section>`;
}
