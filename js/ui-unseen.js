// Validación del periodo no visto e informe de backtest.

import { evaluateUnseen } from '../core/unseen.js';
import { parseBacktestReport, compareParams } from '../core/report.js';
import { auditUnseenTrades } from '../core/matrix/from-deals.js';
import { L, localeTag } from './i18n.js';
import { state, api, $, num, int, pct, esc, rawValue, paramValue, decodeHead } from './ui-state.js';

export async function setReport(file) {
  try {
    const buffer = await file.arrayBuffer();
    const report = parseBacktestReport(decodeHead(buffer), file.name);
    state.report = report;
    state.unseen.values = {
      trades: report.metrics.trades,
      profit: report.metrics.profit,
      profitFactor: report.metrics.profitFactor,
      drawdown: report.metrics.drawdown,
      recoveryFactor: report.metrics.recoveryFactor,
      sharpe: report.metrics.sharpe,
    };
    state.unseen.result = null;
    state.unseen.error = null;
    // A partir de la lista de operaciones (no de los seis campos agregados), y solo si
    // el informe trae suficientes: Monte Carlo, tamaño de muestra y stress de costes.
    // Ver core/matrix/from-deals.js.
    state.unseen.tradesAudit = report.deals && report.deals.length
      ? auditUnseenTrades(report.deals)
      : null;
    api.clearError();
    if (state.analysis) {
      api.setTab('unseen');
      runUnseenCheck();
    }
  } catch (err) {
    api.showError(err && err.message ? err.message : String(err));
  }
}

// ---------------------------------------------------------------- periodo no visto
export const unseenFields = () => [
  { key: 'trades', label: L('Operaciones', 'Trades'), hint: L('Total de operaciones del tramo', 'Total trades in the segment'), step: '1', required: true },
  { key: 'profit', label: L('Beneficio neto', 'Net profit'), hint: L('En la divisa de la cuenta', 'In the account currency'), step: 'any', required: true },
  { key: 'profitFactor', label: L('Factor de beneficio', 'Profit factor'), hint: 'Profit Factor', step: '0.001' },
  { key: 'drawdown', label: L('Drawdown máximo (%)', 'Maximum drawdown (%)'), hint: 'Equity DD %', step: '0.01' },
  { key: 'recoveryFactor', label: L('Factor de recuperación', 'Recovery factor'), hint: 'Recovery Factor', step: '0.001' },
  { key: 'sharpe', label: 'Sharpe', hint: 'Sharpe Ratio', step: '0.001' },
];

export const unseenStatus = () => ({
  normal: ['ok', L('normal', 'normal')],
  cola: ['warn', L('en la cola', 'in the tail')],
  fuera: ['bad', L('fuera de lo visto', 'outside what was seen')],
});

/**
 * Barra de rango: donde cae lo observado dentro de lo que el EA ya había demostrado.
 * Un número suelto no dice nada; verlo situado contra su propio historial, si.
 */
export function unseenBand(r) {
  const W = 230;
  const H = 30;
  const lo = Math.min(r.band.min, r.value);
  const hi = Math.max(r.band.max, r.value);
  const span = hi - lo;
  const pad = span > 0 ? span * 0.12 : Math.abs(hi || 1) * 0.2 + 1;
  const a = lo - pad;
  const b = hi + pad;
  const x = (v) => ((v - a) / (b - a || 1)) * W;
  const mid = H / 2;
  const cls = unseenStatus()[r.status][0];
  return `<svg class="ub" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">
    <line class="ub-range" x1="${x(r.band.min).toFixed(1)}" y1="${mid}" x2="${x(r.band.max).toFixed(1)}" y2="${mid}"/>
    <rect class="ub-box" x="${x(r.band.q10).toFixed(1)}" y="${mid - 6}" width="${Math.max(1, x(r.band.q90) - x(r.band.q10)).toFixed(1)}" height="12" rx="2"/>
    <line class="ub-median" x1="${x(r.band.median).toFixed(1)}" y1="${mid - 7}" x2="${x(r.band.median).toFixed(1)}" y2="${mid + 7}"/>
    <circle class="ub-obs ub-${cls}" cx="${x(r.value).toFixed(1)}" cy="${mid}" r="5"/>
  </svg>`;
}

/**
 * Ficha del informe cargado, con la comprobacion que evita el error mas facil de
 * cometer y mas dificil de ver: lanzar el backtest del periodo no visto con una
 * configuracion distinta de la que se estaba validando.
 */
export function renderReportCard(a, plateau) {
  const rep = state.report;
  if (!rep) {
    return `<section class="panel report-drop" id="reportDrop">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Atajo', 'Shortcut')}</div><h2>${L('Suelta aquí el informe del backtest', 'Drop the backtest report here')}</h2></div></div>
      <p class="panel-intro">
        ${L(
          `En el probador, clic derecho sobre los resultados → <em>Informe</em> → <em>HTML</em>. Si lo
        sueltas aquí (o en cualquier parte de la página) se rellenan solas las seis cifras, se
        usan las fechas reales del periodo y se comprueba que el backtest se lanzó con la
        configuración correcta.`,
          `In the tester, right-click the results → <em>Report</em> → <em>HTML</em>. If you
        drop it here (or anywhere on the page) the six figures fill in automatically,
        the real period dates are used, and it checks that the backtest was run with the
        correct configuration.`,
        )}
      </p>
      <p class="panel-intro">
        ${L(
          `Ese mismo informe trae algo que el export de optimización nunca tiene: la lista de
        operaciones una a una. Con ella, debajo aparecerán un <strong>Monte Carlo</strong> sobre tus
        operaciones reales, un aviso de si la <strong>muestra alcanza</strong>, y una tabla de
        <strong>stress de costes</strong> — sin instalar nada más.`,
          `That same report carries something the optimization export never has: the trade-by-trade
        list. With it, a <strong>Monte Carlo</strong> over your real trades, a
        <strong>sample-size</strong> check, and a <strong>cost-stress</strong> table will appear
        below — nothing else to install.`,
        )}
      </p>
    </section>`;
  }

  const cmp = compareParams(rep.params, a.meta.paramNames, plateau.record.params);
  const fecha = (d) => (d instanceof Date && !Number.isNaN(d.valueOf()) ? d.toLocaleDateString(localeTag()) : '—');
  const mismatch = cmp.different.length
    ? `<div class="inline-warn report-mismatch">
        <strong>${L('El backtest no se ha lanzado con la configuración propuesta.', 'The backtest was not run with the proposed configuration.')}</strong>
        ${cmp.different.slice(0, 6).map((d) => `<code>${esc(d.name)}</code>: ${L(
          `el informe trae <b>${esc(String(d.report))}</b> y debería ser <b>${esc(rawValue(d.expected))}</b>`,
          `the report has <b>${esc(String(d.report))}</b> and it should be <b>${esc(rawValue(d.expected))}</b>`,
        )}`).join('; ')}${cmp.different.length > 6 ? L(` y ${cmp.different.length - 6} más`, ` and ${cmp.different.length - 6} more`) : ''}.
        ${L('Lo que valides así no dice nada de la configuración que has elegido.', 'What you validate this way says nothing about the configuration you chose.')}
      </div>`
    : cmp.same.length
      ? `<div class="report-ok">${L(
        `Los ${int(cmp.same.length)} parámetros del informe coinciden con la configuración propuesta.`,
        `The ${int(cmp.same.length)} parameters in the report match the proposed configuration.`,
      )}</div>`
      : '';

  return `<section class="panel">
    <div class="panel-head compact">
      <div><div class="panel-kicker">${L('Informe cargado', 'Report loaded')}</div><h2>${esc(rep.meta.expert || rep.meta.file)}</h2></div>
      <button class="text-btn" id="reportClear" type="button">${L('Quitar', 'Remove')}</button>
    </div>
    <div class="evidence-list">
      <div><span>${L('Instrumento y marco', 'Instrument and timeframe')}</span><strong>${esc(rep.meta.symbol || '—')} ${esc(rep.meta.timeframe || '')}</strong></div>
      <div><span>${L('Periodo del backtest', 'Backtest period')}</span><strong>${fecha(rep.meta.from)} – ${fecha(rep.meta.to)}${Number.isFinite(rep.meta.days) ? ` <em>${int(rep.meta.days)} ${L('días', 'days')}</em>` : ''}</strong></div>
      <div><span>${L('Operaciones', 'Trades')}</span><strong>${int(rep.metrics.trades)}${rep.deals.length ? ` <em>${int(rep.deals.length)} ${L('leídas una a una', 'read one by one')}</em>` : ''}</strong></div>
      <div><span>${L('Beneficio neto', 'Net profit')}</span><strong>${num(rep.metrics.profit, 2)}</strong></div>
    </div>
    ${mismatch}
  </section>`;
}

/**
 * Robustez calculada a partir de las operaciones una a una del informe: lo único que
 * el export de optimización nunca trae. Independiente del contraste numérico de arriba
 * (no hace falta rellenar ni pulsar "Comprobar"): basta con haber soltado el informe.
 */
export function renderTradesAudit() {
  const rep = state.report;
  if (!rep || !rep.deals.length) return '';
  const aud = state.unseen.tradesAudit;
  if (!aud) return '';

  const head = `<div class="panel-head compact">
      <div><div class="panel-kicker">${L('Desde tus operaciones', 'From your trades')}</div><h2>${L('Robustez frente a costes y muestra', 'Robustness against costs and sample size')}</h2></div>
    </div>`;

  if (!aud.usable) {
    const reason = aud.reason === 'pocos_dias'
      ? L(
        `Solo ${int(aud.days)} días con operaciones: hacen falta al menos 5 para simular algo. No es un fallo, es
        que el tramo es demasiado corto para esto en concreto (el contraste de arriba sigue siendo válido).`,
        `Only ${int(aud.days)} days with trades: at least 5 are needed to simulate anything. It's not a
        failure, this particular check just needs a longer segment (the contrast above still stands).`,
      )
      : L(
        'El informe no trae fechas de cierre reconocibles, así que no se puede agrupar por día sin inventar un reparto.',
        "The report doesn't have recognizable closing dates, so trades can't be grouped by day without making one up.",
      );
    return `<section class="panel"><div class="panel-head compact"><div><h2>${L('Desde tus operaciones', 'From your trades')}</h2></div></div><p class="muted">${esc(reason)}</p></section>`;
  }

  const { bootstrap: bs, sample: sa, costs, breakEven, warnings } = aud;

  // El bootstrap acorta cada horizonte a los días que de verdad hay (core/matrix/
  // bootstrap.js: h = min(dias, 63|126|252)). Con menos de 63 días los tres horizontes
  // se calculan sobre el mismo tramo y darian el mismo numero con etiquetas distintas:
  // eso es peor que no mostrarlo. Solo se enseña el horizonte que el tramo cubre entero.
  const horizon = (days, threshold, value) => (days >= threshold ? pct(value) : '—');
  const shortHorizons = bs.usable && aud.days < 252;

  const mc = bs.usable
    ? `<div class="evidence-list">
        <div><span>${L('Resultado si repites un tramo así (mediana de 10.000 simulaciones)', 'Result if you repeat a segment like this (median of 10,000 simulations)')}</span><strong>${num(bs.returnCi.p50, 2)}</strong></div>
        <div><span>${L('Rango habitual (P05–P95)', 'Typical range (P05–P95)')}</span><strong>${num(bs.returnCi.p05, 2)} &ndash; ${num(bs.returnCi.p95, 2)}</strong></div>
        <div><span>${L('Drawdown máximo esperado (mediana)', 'Expected maximum drawdown (median)')}</span><strong>${num(bs.maxDdCi.p50, 2)}</strong></div>
        <div><span>${L('Probabilidad de pérdida a 3 meses (~63 días)', 'Probability of a loss at 3 months (~63 days)')}</span><strong>${horizon(aud.days, 63, bs.probLoss.m3)}</strong></div>
        <div><span>${L('a 6 meses (~126 días)', 'at 6 months (~126 days)')}</span><strong>${horizon(aud.days, 126, bs.probLoss.m6)}</strong></div>
        <div><span>${L('a 12 meses (~252 días)', 'at 12 months (~252 days)')}</span><strong>${horizon(aud.days, 252, bs.probLoss.m12)}</strong></div>
      </div>
      <p class="chart-note">${L(
        `Reordena tus propias operaciones al azar 10.000 veces (bootstrap estacionario, Politis &amp;
        Romano 1994), respetando bloques para no romper la dependencia entre operaciones seguidas. No
        inventa una distribución: solo baraja lo que ya pasó.
        ${shortHorizons ? `Con ${int(aud.days)} días de histórico, algún horizonte queda por encima de lo que el
        tramo cubre y se marca con «—» en vez de repetir el mismo número con otra etiqueta.` : ''}`,
        `Your own trades reshuffled at random 10,000 times (stationary bootstrap, Politis &amp; Romano
        1994), keeping blocks intact so it doesn't break the dependence between consecutive trades. It
        doesn't invent a distribution: it only reshuffles what already happened.
        ${shortHorizons ? `With ${int(aud.days)} days of history, some horizon is longer than what the
        segment covers and is marked "—" instead of repeating the same number under another label.` : ''}`,
      )}</p>`
    : `<p class="muted">${L('Muy pocos días para simular con garantías.', 'Too few days to simulate reliably.')}</p>`;

  const sufficient = sa.verdictHint === 'sample_ok';
  const sampleRow = `<div class="evidence-list">
      <div><span>${L('Días de datos', 'Days of data')}</span><strong>${int(sa.n)}</strong></div>
      <div><span>${L('Potencia (¿se distingue de cero?)', 'Power (distinguishable from zero?)')}</span><strong class="big ${sufficient ? 'ok' : 'warn'}">${sa.power.usable ? pct(sa.power.power) : '—'}</strong></div>
      <div><span>${L('Intervalo de confianza del resultado diario medio', 'Confidence interval of the average daily result')}</span><strong>${sa.meanCi.usable ? `${num(sa.meanCi.ci.p05, 3)} &ndash; ${num(sa.meanCi.ci.p95, 3)}` : '—'}</strong></div>
    </div>
    <p class="chart-note">${sufficient
      ? L(
        'Con estos días, el resultado medio diario se distingue de cero con razonable seguridad.',
        "With this many days, the average daily result is distinguishable from zero with reasonable confidence.",
      )
      : L(
        `Con estos días <strong>no se puede distinguir con confianza el resultado medio de cero</strong>: podría
        ser ventaja real, podría ser ruido. No es un veredicto negativo, es una advertencia sobre el tamaño
        de la muestra.`,
        `With this many days <strong>the average result cannot be confidently distinguished from zero</strong>:
        it could be a real edge, it could be noise. It isn't a negative verdict, it's a warning about
        sample size.`,
      )}</p>`;

  const scenLabel = { base: L('Base (tal cual)', 'Base (as is)'), moderate: L('Moderado', 'Moderate'), severe: L('Severo', 'Severe') };
  const costRows = ['base', 'moderate', 'severe'].map((k) => {
    const c = costs[k];
    return `<tr>
      <td class="strong">${scenLabel[k]}</td>
      <td>${num(c.stressedNet, 2)}</td>
      <td>${pct(c.degradation, 1)}</td>
      <td>${num(c.maxDrawdownStressed, 2)}</td>
      <td><span class="badge ${c.stillProfitable ? 'ok' : 'bad'}">${c.stillProfitable ? L('sí', 'yes') : L('no', 'no')}</span></td>
    </tr>`;
  }).join('');

  const costs2 = `<div class="table-wrap"><table>
      <thead><tr><th>${L('Escenario', 'Scenario')}</th><th>${L('Neto tras el coste extra', 'Net after the extra cost')}</th><th>${L('Degradación', 'Degradation')}</th><th>${L('Drawdown máx.', 'Max drawdown')}</th><th>${L('¿Sigue rentable?', 'Still profitable?')}</th></tr></thead>
      <tbody>${costRows}</tbody>
    </table></div>
    <p class="chart-note">${L(
      `Resta spread, slippage y comisión extra a cada operación (escenarios orientativos, no los costes
      exactos de tu bróker) y recalcula. El escenario base es tal cual lo mediste; moderado y severo
      preguntan qué pasa si tus costes reales en vivo son peores que los que usaste al optimizar.
      ${breakEven.usable ? `El coste extra por operación que anularía toda la ventaja es de <strong>${num(breakEven.breakEven, 2)}</strong>.` : ''}`,
      `Subtracts extra spread, slippage and commission from every trade (orientative scenarios, not your
      broker's exact costs) and recalculates. The base scenario is as measured; moderate and severe ask
      what happens if your real live costs are worse than the ones you optimized with.
      ${breakEven.usable ? `The extra cost per trade that would wipe out the whole edge is <strong>${num(breakEven.breakEven, 2)}</strong>.` : ''}`,
    )}</p>`;

  // `dataWarnings` (core/matrix/risk.js) es un módulo puro y devuelve `detail` en un
  // solo idioma: no le corresponde saber en qué idioma está la interfaz. El texto que
  // se muestra se decide aquí, por `code`, igual que el resto de esta pantalla.
  const WARNING_TEXT = {
    SWAP_DOMINANCE: L(
      'El tester aplica los swaps actuales a todo el histórico simulado: el swap pesa una parte grande del resultado neto.',
      'The tester applies current swap rates to the whole simulated history: swap accounts for a large share of the net result.',
    ),
    MIXED_TICKS: L(
      'Heurística: el periodo podría mezclar tramos con ticks reales y generados.',
      'Heuristic: the period may mix segments with real and generated ticks.',
    ),
    DATA_FINGERPRINT: L(
      'La huella de datos difiere entre experimentos de la misma estrategia.',
      'The data fingerprint differs between experiments of the same strategy.',
    ),
  };
  const swapWarn = warnings.length
    ? `<div class="inline-warn">${warnings.map((w) => esc(WARNING_TEXT[w.code] || w.detail)).join(' ')}</div>`
    : '';

  return `<section class="panel">
    ${head}
    <p class="panel-intro">${L(
      `Esto no sale de las seis cifras que rellenaste arriba, sino de las <strong>${int(rep.deals.length)}
      operaciones una a una</strong> que trae el informe: es el único dato de MT5 que permite esto sin
      inventar nada.`,
      `This doesn't come from the six figures filled in above, but from the
      <strong>${int(rep.deals.length)} individual trades</strong> in the report: it's the only piece of
      MT5 data that allows this without making anything up.`,
    )}</p>
    <h3>${L('Monte Carlo', 'Monte Carlo')}</h3>
    ${mc}
    <h3>${L('¿Alcanza la muestra?', 'Is the sample enough?')}</h3>
    ${sampleRow}
    <h3>${L('Si tus costes reales son peores', 'If your real costs are worse')}</h3>
    ${costs2}
    ${swapWarn}
  </section>`;
}

export function renderUnseen(a) {
  const fieldsDef = unseenFields();
  const head = `<div class="detail-head">
      <div class="detail-kicker">${L('06 / Periodo no visto', '06 / Unseen period')}</div>
      <h2>${L('La prueba de fuego', 'The acid test')}</h2>
      <p>
        ${L(
          `Ya has elegido configuración mirando el in-sample y el forward, así que ninguno de los dos
        sigue siendo ciego. Este es el último paso: lanza en MT5 un backtest de la configuración
        elegida sobre un tramo que <strong>no hayas usado ni para optimizar ni para validar</strong>,
        y trae aquí sus números. La pregunta no es si son espectaculares, sino si son
        <strong>normales para este EA</strong>. Es un contraste distinto del grado de evidencia
        del veredicto — aquí no se mide la fuerza de la meseta, se mide si este tramo nuevo encaja
        con lo que el EA ya demostró.`,
          `You already chose a configuration looking at in-sample and forward, so neither is
        still blind. This is the last step: run in MT5 a backtest of the chosen configuration
        on a segment you <strong>have not used for optimizing or validating</strong>,
        and bring its numbers here. The question is not whether they are spectacular, but whether they are
        <strong>normal for this EA</strong>. This is a different contrast from the verdict's evidence
        grade — it does not measure the plateau's strength, it measures whether this new segment
        fits what the EA has already shown.`,
        )}
      </p>
    </div>`;

  if (!a.plateaus.length) {
    return `${head}<section class="panel"><p class="muted">${L('No hay ninguna configuración propuesta que validar. Vuelve al', 'There is no proposed configuration to validate. Go back to the')} <button class="text-btn" data-goto="verdict">${L('veredicto', 'verdict')}</button> ${L('para ver por qué.', 'to see why.')}</p></section>`;
  }

  const idx = Math.min(state.unseen.plateauIndex, a.plateaus.length - 1);
  const p = a.plateaus[idx];
  const v = state.unseen.values;
  const res = state.unseen.result;

  const options = a.plateaus.slice(0, 5).map((pl, i) => `<option value="${i}"${i === idx ? ' selected' : ''}>M${pl.rank} - Pass ${esc(pl.record.id)}${i === 0 ? L(' (recomendada)', ' (recommended)') : ''}</option>`).join('');

  const fields = fieldsDef.map((f) => `<label class="field">
      <span>${esc(f.label)}${f.required ? ' <em class="req-mark">*</em>' : ''}</span>
      <input type="number" step="${f.step}" id="u_${f.key}" data-unseen="${f.key}"
        value="${v[f.key] !== undefined && v[f.key] !== '' ? esc(v[f.key]) : ''}" placeholder="${esc(f.hint)}">
    </label>`).join('');

  const reportCard = renderReportCard(a, p);
  const tradesAudit = renderTradesAudit();

  const form = `<section class="panel">
    <div class="panel-head compact">
      <div><div class="panel-kicker">${L('Datos del tramo', 'Segment data')}</div><h2>${L('Resultados del backtest', 'Backtest results')}</h2></div>
      <label class="inline-select">${L('Configuración', 'Configuration')} <select id="unseenPlateau">${options}</select></label>
    </div>
    <p class="panel-intro">
      ${state.report
        ? L('Rellenadas desde el informe que has cargado. Puedes corregirlas a mano si hace falta.', 'Filled from the report you loaded. You can correct them by hand if needed.')
        : L('Copia las cifras que te muestra el probador al terminar.', 'Copy the figures the tester shows when it finishes.')}
      ${L(
        ` Las dos primeras son imprescindibles:
      sin el número de operaciones no se puede corregir por duración, y esa corrección es justo lo
      que distingue este contraste de mirarlo a ojo.`,
        ` The first two are required:
      without the trade count duration cannot be corrected, and that correction is exactly what
      distinguishes this contrast from eyeballing it.`,
      )}
    </p>
    <div class="policy-grid">${fields}</div>
    <div class="rep-actions">
      <button class="primary-btn" id="unseenCheck" type="button">${L('Comprobar contra el historial del EA', 'Check against the EA history')}</button>
      <button class="text-btn" id="unseenClear" type="button">${L('Limpiar', 'Clear')}</button>
    </div>
    ${state.unseen.error ? `<div class="error-box" style="margin-top:12px" role="alert"><strong>${L('No se ha podido comprobar', 'Could not check')}</strong><span>${esc(state.unseen.error)}</span></div>` : ''}
  </section>`;

  const params = `<section class="panel">
    <div class="panel-head compact"><div><div class="panel-kicker">${L('Recordatorio', 'Reminder')}</div><h2>${L('Configuración que debes probar', 'Configuration you must test')}</h2></div>
      <button class="ghost-btn" data-export="set" data-plateau-index="${idx}">${L('Descargar .set', 'Download .set')}</button></div>
    <div class="param-grid">
      ${a.meta.paramNames.map((n, j) => `<div class="param"><span>${esc(n)}</span><strong>${paramValue(p.record.params[j])}</strong></div>`).join('')}
    </div>
  </section>`;

  if (!res) return `${head}${reportCard}${tradesAudit}${form}${params}`;

  // Si el informe es de OTRA configuracion, el contraste es aritmeticamente correcto
  // pero no valida nada: seria enganoso ensenarlo en verde. Se degrada a aviso y se
  // dice por que.
  const paramsOk = !state.report || !compareParams(state.report.params, a.meta.paramNames, p.record.params).different.length;
  const cls = !paramsOk ? 'v-warn' : res.level === 'outside' ? 'v-no' : res.level === 'tail' ? 'v-warn' : 'v-go';
  const stamp = !paramsOk ? L('NO VALIDA', 'DOES NOT VALIDATE')
    : res.level === 'outside' ? L('FUERA DE RANGO', 'OUT OF RANGE')
      : res.level === 'tail' ? L('EN EL LIMITE', 'AT THE EDGE') : L('DENTRO DE LO NORMAL', 'WITHIN NORMAL');
  const headline = paramsOk ? res.headline : L('Estas cifras son de otra configuración', 'These figures are from another configuration');
  const subline = paramsOk
    ? L(
      `Contrastado con ${int(res.reference.observations)} observaciones de la meseta: ${int(res.reference.members)} configuraciones equivalentes por ${res.reference.periods.length} periodo(s).`,
      `Contrasted with ${int(res.reference.observations)} plateau observations: ${int(res.reference.members)} equivalent configurations across ${res.reference.periods.length} period(s).`,
    )
    : L(
      'El backtest se lanzó con parámetros distintos de los propuestos, así que este contraste no dice nada sobre la configuración que estás validando. Vuelve a lanzarlo en MT5 con el .set correcto.',
      'The backtest was run with parameters different from those proposed, so this contrast says nothing about the configuration you are validating. Run it again in MT5 with the correct .set.',
    );

  const statusMap = unseenStatus();
  const rows = res.results.map((r) => {
    const st = statusMap[r.status];
    return `<tr class="u-${st[0]}">
      <td class="u-label">${esc(r.label)}${r.scaled ? `<span class="u-scaled" title="${esc(L('Corregido por la duración del periodo', 'Corrected for period duration'))}">&#8597;</span>` : ''}</td>
      <td class="strong">${num(r.value, r.digits)}</td>
      <td class="u-band">${unseenBand(r)}</td>
      <td class="u-range">${num(r.band.q10, r.digits)} &ndash; ${num(r.band.q90, r.digits)}<small>${L('visto', 'seen')}: ${num(r.band.min, r.digits)} ${L('a', 'to')} ${num(r.band.max, r.digits)}</small></td>
      <td><span class="badge ${st[0] === 'ok' ? 'ok' : st[0] === 'warn' ? 'warn' : 'bad'}">${st[1]}</span></td>
    </tr>`;
  }).join('');

  const result = `<section class="verdict-banner ${cls}" style="margin-top:12px">
      <div class="verdict-stamp">${stamp}</div>
      <div class="verdict-body"><h2>${esc(headline)}</h2>
        <p>${esc(subline)}</p></div>
    </section>
    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Métrica a métrica', 'Metric by metric')}</div><h2>${L('Donde cae cada cifra', 'Where each figure falls')}</h2></div></div>
      <div class="table-wrap"><table class="u-table">
        <thead><tr><th>${L('Métrica', 'Metric')}</th><th>${L('Tu tramo', 'Your segment')}</th><th>${L('Rango que el EA ya demostró', 'Range the EA already showed')}</th><th>${L('Habitual (Q10&ndash;Q90)', 'Typical (Q10&ndash;Q90)')}</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="chart-note">
        ${L(
          `La caja marca el recorrido habitual y la línea fina todo lo que el EA ha llegado a mostrar.
        El punto es tu tramo. Las métricas con <span class="u-scaled">&#8597;</span> se han ajustado a
        las ${int(res.trades)} operaciones de tu periodo: el drawdown máximo y el factor de
        recuperación dependen de cuántas operaciones haya, así que compararlos en crudo contra un
        periodo más largo lleva justo a la conclusión contraria.`,
          `The box marks the typical range and the thin line everything the EA has ever shown.
        The dot is your segment. Metrics with <span class="u-scaled">&#8597;</span> have been adjusted to
        the ${int(res.trades)} trades in your period: maximum drawdown and recovery
        factor depend on how many trades there are, so comparing them raw against a
        longer period leads to exactly the opposite conclusion.`,
        )}
      </p>
    </section>
    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Lectura', 'Reading')}</div><h2>${L('Qué significa', 'What it means')}</h2></div></div>
      <ul class="limits">${res.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
    </section>`;

  return `${head}${reportCard}${tradesAudit}${form}${result}${params}`;
}

export function readUnseenForm() {
  const out = {};
  unseenFields().forEach((f) => {
    const el = $(`#u_${f.key}`);
    if (el) out[f.key] = el.value;
  });
  return out;
}

export function runUnseenCheck() {
  const a = state.analysis;
  if (!a || !a.plateaus.length) return;
  state.unseen.values = readUnseenForm();
  state.unseen.error = null;
  state.unseen.result = null;
  const idx = Math.min(state.unseen.plateauIndex, a.plateaus.length - 1);
  const raw = state.unseen.values;
  const observed = {};
  unseenFields().forEach((f) => {
    const n = parseFloat(String(raw[f.key] === undefined ? '' : raw[f.key]).replace(',', '.'));
    if (Number.isFinite(n)) observed[f.key] = n;
  });
  try {
    state.unseen.result = evaluateUnseen(a, a.plateaus[idx], observed);
  } catch (err) {
    state.unseen.error = err && err.message ? err.message : String(err);
  }
  api.render();
}
