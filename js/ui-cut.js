// Fecha de corte del informe cargado: «¿hasta qué día miraste para elegir?». La comparten la
// prueba de fuego (el contraste con la meseta, js/ui-unseen.js), el historial de intentos
// (js/ui-history.js) y el Monte Carlo (js/ui-montecarlo.js), para que toda la pestaña hable de
// los mismos dos trozos: antes y después de elegir (docs/MONTECARLO.md, 6.1).
//
// Con la fecha, las cifras del contraste salen de las operaciones de después
// (core/trades/mc-report.js#summaryFromDeals): operaciones, beneficio neto y factor de beneficio,
// calculados como los calcula MT5. El drawdown, el factor de recuperación y el Sharpe no se
// pueden reproducir desde las operaciones y se quedan en blanco.

import { splitByCuts, summaryFromDeals } from '../core/trades/mc-report.js';
import { dropWholeReportTry } from '../core/history.js';
import { L, localeTag } from './i18n.js';
import { state, api, esc } from './ui-state.js';

/** Estado de la fecha de corte del informe en pantalla (se reinicia al cambiar de informe). */
export function reportCut() {
  if (!state.reportCut || state.reportCut.report !== state.report) {
    state.reportCut = { report: state.report, split: 'no', chooseEnd: '' };
  }
  return state.reportCut;
}

/** { chooseEnd } si el usuario ha dicho hasta qué día miró para elegir; si no, undefined. */
export function activeCut() {
  const c = reportCut();
  return state.report && c.split === 'yes' && c.chooseEnd ? { chooseEnd: c.chooseEnd } : undefined;
}

/** ¿El usuario dice que el informe incluye días usados para elegir, pero falta la fecha o no vale? */
export function cutPending() {
  const c = reportCut();
  if (!state.report || c.split !== 'yes') return false;
  const s = cutSplit();
  return !s || !s.ok;
}

/** Reparto de las operaciones en antes y después de elegir, o null sin fecha. */
export function cutSplit() {
  const cut = activeCut();
  if (!cut || !state.report.deals || !state.report.deals.length) return null;
  const memo = reportCut();
  if (memo.splitFor !== cut.chooseEnd) {
    memo.split_ = splitByCuts(state.report.deals, cut);
    memo.splitFor = cut.chooseEnd;
  }
  return memo.split_;
}

/** Fechas (AAAA-MM-DD) de lo que se compara: lo de después de elegir, o el informe entero. */
export function cutWindow() {
  const s = cutSplit();
  if (s && s.ok) {
    const clean = s.segments[s.segments.length - 1];
    return { from: clean.from, to: clean.to, cut: true };
  }
  const rep = state.report;
  const day = (d) => (d instanceof Date && !Number.isNaN(d.valueOf()) ? d.toISOString().slice(0, 10) : null);
  return rep ? { from: day(rep.meta.from), to: day(rep.meta.to), cut: false } : null;
}

/** Cifras con las que se rellena el formulario de la prueba de fuego. */
export function unseenValuesFromReport() {
  const rep = state.report;
  if (!rep) return {};
  const s = cutSplit();
  if (s && s.ok) {
    const m = summaryFromDeals(s.clean);
    return { trades: m.trades, profit: Number(m.profit.toFixed(2)), profitFactor: Number.isFinite(m.profitFactor) ? Number(m.profitFactor.toFixed(6)) : '', drawdown: '', recoveryFactor: '', sharpe: '' };
  }
  if (reportCut().split === 'yes') return {};
  // Una cifra que el informe no trae se queda en blanco (antes salía «NaN» en el formulario).
  const m = rep.metrics;
  const v = (x) => (Number.isFinite(x) ? x : '');
  return { trades: v(m.trades), profit: v(m.profit), profitFactor: v(m.profitFactor), drawdown: v(m.drawdown), recoveryFactor: v(m.recoveryFactor), sharpe: v(m.sharpe) };
}

const fdate = (iso) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString(localeTag(), { timeZone: 'UTC' }) : '—');

const CUT_ERROR = (e, period) => {
  const range = period ? L(`del ${fdate(period.from)} al ${fdate(period.to)}`, `from ${fdate(period.from)} to ${fdate(period.to)}`) : '';
  switch (e) {
    case 'sin_operaciones_antes': return L(`Esa fecha es anterior a la primera operación: las operaciones del informe van ${range}.`, `That date is before the first trade: the report's trades run ${range}.`);
    case 'sin_operaciones_despues': return L(`Después de esa fecha no hay operaciones: las del informe van ${range}. Si no miraste ninguna de estas fechas para elegir, marca «No».`, `There are no trades after that date: the report's trades run ${range}. If you did not look at any of these dates for choosing, pick "No".`);
    case 'fecha_no_valida': return L('Esa fecha no es válida.', 'That date is not valid.');
    default: return L('El informe no trae fechas de cierre reconocibles.', "The report doesn't have recognizable closing dates.");
  }
};

/** La pregunta, en la ficha del informe: vale para toda la pestaña. */
export function renderCutQuestion() {
  const rep = state.report;
  if (!rep || !rep.deals || !rep.deals.length) return '';
  const c = reportCut();
  const day = (d) => (d instanceof Date && !Number.isNaN(d.valueOf()) ? d.toISOString().slice(0, 10) : '');
  const s = cutSplit();
  const period = (s && s.period) || splitByCuts(rep.deals, { chooseEnd: '0000-00-00' }).period || { from: day(rep.meta.from), to: day(rep.meta.to) };
  const radio = (v, text) => `<label><input type="radio" name="mcSplit" value="${v}"${c.split === v ? ' checked' : ''}> <span>${text}</span></label>`;
  const date = c.split === 'yes' ? `<label class="field mc-date"><span>${L('¿Hasta qué día miraste para elegir? (optimización y forward incluidos)', 'Up to what day did you look for choosing? (optimization and forward included)')}</span>
        <input type="date" id="mcChooseEnd" value="${esc(c.chooseEnd)}" min="${esc(period.from)}" max="${esc(period.to)}"></label>
    <small>${L(`Las operaciones del informe van del ${fdate(period.from)} al ${fdate(period.to)}. Cada una cuenta el día que se cerró. Con la fecha, todo lo de esta pestaña usa solo lo de después.`, `The report's trades run from ${fdate(period.from)} to ${fdate(period.to)}. Each one counts on the day it was closed. With the date, everything on this tab uses only what comes after.`)}</small>` : '';
  const err = s && !s.ok ? `<p class="inline-warn">${esc(CUT_ERROR(s.error, s.period))}</p>` : '';
  return `<fieldset class="mc-periods">
      <legend>${L('¿Este informe incluye días que miraste para elegir la configuración?', 'Does this report include days you looked at to choose the configuration?')}</legend>
      <div class="mc-radios">${radio('no', L('No', 'No'))}${radio('yes', L('Sí', 'Yes'))}</div>
      ${date}${err}
    </fieldset>`;
}

/** Cambia la fecha: se rehacen el contraste y el Monte Carlo con lo de después. */
function applyCut() {
  if (activeCut() && !cutPending()) {
    const rep = state.report;
    const day = (d) => (d instanceof Date && !Number.isNaN(d.valueOf()) ? d.toISOString().slice(0, 10) : null);
    state.unseenTries = dropWholeReportTry(state.unseenTries, { file: rep.meta.file || null, from: day(rep.meta.from), to: day(rep.meta.to) });
  }
  state.unseen.values = unseenValuesFromReport();
  state.unseen.result = null;
  state.unseen.error = null;
  if (api.startTradesMC) api.startTradesMC();
  if (activeCut() && !cutPending()) {
    if (api.runUnseenCheck) api.runUnseenCheck({ fromState: true });
  } else if (reportCut().split === 'no') {
    if (api.runUnseenCheck) api.runUnseenCheck({ fromState: true });
  } else if (api.render) api.render();
}

export function initCut() {
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t || !state.report) return;
    if (t.name === 'mcSplit') {
      reportCut().split = t.value;
      applyCut();
    } else if (t.id === 'mcChooseEnd') {
      reportCut().chooseEnd = t.value;
      applyCut();
    }
  });
}
