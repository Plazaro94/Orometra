// Validación del periodo no visto e informe de backtest.

import { evaluateUnseen } from '../core/unseen.js';
import { parseBacktestReport, compareParams } from '../core/report.js';
import { L, localeTag } from './i18n.js';
import { state, api, $, num, int, esc, rawValue, paramValue, decodeHead } from './ui-state.js';

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
  { key: 'recoveryFactor', label: L('Factor de recuperacion', 'Recovery factor'), hint: 'Recovery Factor', step: '0.001' },
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
        y trae aquí sus numeros. La pregunta no es si son espectaculares, sino si son
        <strong>normales para este EA</strong>.`,
          `You already chose a configuration looking at in-sample and forward, so neither is
        still blind. This is the last step: run in MT5 a backtest of the chosen configuration
        on a segment you <strong>have not used for optimizing or validating</strong>,
        and bring its numbers here. The question is not whether they are spectacular, but whether they are
        <strong>normal for this EA</strong>.`,
        )}
      </p>
    </div>`;

  if (!a.plateaus.length) {
    return `${head}<section class="panel"><p class="muted">${L('No hay ninguna configuración propuesta que validar. Vuelve al', 'There is no proposed configuration to validate. Go back to the')} <button class="text-btn" data-goto="verdict">${L('veredicto', 'verdict')}</button> ${L('para ver por que.', 'to see why.')}</p></section>`;
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
      sin el número de operaciones no se puede corregir por duración, y esa correccion es justo lo
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

  if (!res) return `${head}${reportCard}${form}${params}`;

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
        <thead><tr><th>${L('Métrica', 'Metric')}</th><th>${L('Tu tramo', 'Your segment')}</th><th>${L('Rango que el EA ya demostro', 'Range the EA already showed')}</th><th>${L('Habitual (Q10&ndash;Q90)', 'Typical (Q10&ndash;Q90)')}</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="chart-note">
        ${L(
          `La caja marca el recorrido habitual y la linea fina todo lo que el EA ha llegado a mostrar.
        El punto es tu tramo. Las métricas con <span class="u-scaled">&#8597;</span> se han ajustado a
        las ${int(res.trades)} operaciones de tu periodo: el drawdown máximo y el factor de
        recuperacion dependen de cuántas operaciones haya, así que compararlos en crudo contra un
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
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Lectura', 'Reading')}</div><h2>${L('Que significa', 'What it means')}</h2></div></div>
      <ul class="limits">${res.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
    </section>`;

  return `${head}${reportCard}${form}${result}${params}`;
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
