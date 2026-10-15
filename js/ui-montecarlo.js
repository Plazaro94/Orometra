// Monte Carlo sobre las operaciones del informe, en la pestaña del periodo no visto
// (docs/MONTECARLO.md, secciones 0, 8.6 y 8.7). El cálculo va en el worker
// (core/trades/mc-report.js); aquí se decide qué se enseña y por qué no se enseña lo demás.
//
// - Radiografía: siempre que haya 30 operaciones o más (salvo martingala). No es una previsión.
// - Previsión a 6 y 12 meses: solo si los datos lo permiten (2 años, 100 días con operaciones,
//   sin rachas ni volatilidad agrupada), si consta que el informe es de la configuración elegida,
//   si no repite un periodo ya usado y si el usuario confirma que no usó esas fechas para elegir.
//   Orometra no puede comprobar esto último: el export de optimización no trae fechas.
// - Backtest largo (6.1): el usuario dice hasta qué fecha usó para elegir (y, si quiere, dónde
//   acaba el optimizado). Cada operación cuenta en el tramo de su fecha de cierre; la
//   radiografía sale por tramos y la previsión, solo con el tramo posterior a la elección.

import { repeatedPeriod } from '../core/unseen.js';
import { otherConfigOnSameDates } from '../core/history.js';
import { compareParams } from '../core/report.js';
import { FORECAST_MIN_DAYS, FORECAST_MIN_TRADING_DAYS, MIN_TRADES } from '../core/trades/mc-report.js';
import { radiographyChart } from './charts.js';
import { L, localeTag } from './i18n.js';
import { state, api, num, int, pct, esc } from './ui-state.js';
import { runInWorker } from './ui-audit.js';
import { repeatedPeriodText } from './ui-verdict.js';

/** Estado del Monte Carlo del informe en pantalla. Fuera de state.unseen: «Limpiar» no lo borra. */
function mcState() {
  if (!state.tradesMC || state.tradesMC.report !== state.report) {
    state.tradesMC = {
      report: state.report, sizing: null, status: 'idle', result: null, error: null, confirm: false, ddLimit: '', forecast: null,
      // Backtest largo: split 'no' (todo posterior a la elección) o 'yes' (con fechas de corte).
      split: 'no', cuts: { chooseEnd: '', optEnd: '' }, view: null,
    };
  }
  return state.tradesMC;
}

const rerender = () => { if (state.tab === 'unseen' && api.render) api.render(); };

/** Fechas de corte que se mandan al worker, o undefined si el informe es entero posterior a la elección. */
function activeCuts(mc) {
  if (mc.split !== 'yes' || !mc.cuts.chooseEnd) return undefined;
  return { chooseEnd: mc.cuts.chooseEnd, optEnd: mc.cuts.optEnd || undefined };
}

/** Radiografía y puertas, al cargar el informe o al cambiar el tipo de lote. */
export async function startTradesMC() {
  const rep = state.report;
  if (!rep || !rep.deals || !rep.deals.length) return;
  const mc = mcState();
  mc.status = 'running';
  mc.result = null;
  mc.error = null;
  mc.forecast = null;
  const token = {};
  mc.token = token;
  try {
    const result = await runInWorker({ kind: 'tradesMC', deals: rep.deals, sizing: mc.sizing || undefined, cuts: activeCuts(mc) });
    if (mc.token !== token || state.tradesMC !== mc) return;
    mc.result = result;
    mc.status = 'done';
  } catch (err) {
    if (mc.token !== token || state.tradesMC !== mc) return;
    mc.status = 'error';
    mc.error = err && err.message ? err.message : String(err);
  }
  rerender();
}

async function startForecast() {
  const rep = state.report;
  const mc = mcState();
  if (!rep || !mc.result || !mc.confirm) return;
  const limit = looseLimit(mc.ddLimit);
  const ddLimit = Number.isFinite(limit) && limit > 0 ? (mc.result.mode === 'log' ? limit / 100 : limit) : undefined;
  mc.forecast = { status: 'running', ddLimit };
  const token = {};
  mc.token = token;
  rerender();
  try {
    const result = await runInWorker({ kind: 'tradesForecast', deals: rep.deals, sizing: mc.result.sizing, ddLimit, cuts: activeCuts(mc) });
    if (mc.token !== token || state.tradesMC !== mc) return;
    mc.forecast = { status: 'done', result, ddLimit };
  } catch (err) {
    if (mc.token !== token || state.tradesMC !== mc) return;
    mc.forecast = { status: 'error', error: err && err.message ? err.message : String(err) };
  }
  rerender();
}

function looseLimit(v) {
  const t = String(v || '').trim().replace(/[\s %]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  return /^\d*\.?\d+$/.test(t) ? Number(t) : NaN;
}

/** Eventos delegados: la sección se repinta entera y no hay que volver a enlazar nada. */
export function initMonteCarlo() {
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t && t.id === 'mcSizing') {
      const mc = mcState();
      mc.sizing = t.value;
      mc.confirm = false;
      startTradesMC();
      rerender();
    } else if (t && t.name === 'mcSplit') {
      const mc = mcState();
      mc.split = t.value;
      mc.confirm = false;
      mc.view = null;
      startTradesMC();
      rerender();
    } else if (t && (t.id === 'mcChooseEnd' || t.id === 'mcOptEnd')) {
      const mc = mcState();
      mc.cuts[t.id === 'mcChooseEnd' ? 'chooseEnd' : 'optEnd'] = t.value;
      mc.confirm = false;
      mc.view = null;
      if (mc.cuts.chooseEnd) startTradesMC();
      rerender();
    } else if (t && t.id === 'mcView') {
      mcState().view = t.value;
      rerender();
    } else if (t && t.id === 'mcConfirm') {
      mcState().confirm = t.checked;
      const btn = document.getElementById('mcForecastBtn');
      if (btn) btn.disabled = !t.checked;
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'mcDdLimit') mcState().ddLimit = e.target.value;
  });
  document.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('#mcForecastBtn')) startForecast();
  });
}

// ------------------------------------------------------------------ formato
const fdate = (iso) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString(localeTag(), { timeZone: 'UTC' }) : '—');
const pctSigned = (v, d = 1) => `${v > 0 ? '+' : ''}${pct(v, d)}`;
function moneyFmt(v) {
  return num(v, Math.abs(v) >= 100 ? 0 : 2);
}
/** Probabilidad: «menos del 1 %» en vez de un 0 % que el remuestreo no puede afirmar. */
const prob = (p) => (p < 0.005 ? L('menos del 1\u00A0%', 'less than 1%') : p > 0.995 ? L('más del 99\u00A0%', 'more than 99%') : pct(p, 0));
const tickFmt = (mode) => (mode === 'log' ? (v) => pctSigned(v, 0) : (v) => num(v, Math.abs(v) >= 10 || v === 0 ? 0 : 2));
const valueFmt = (mode) => (mode === 'log' ? (v) => pctSigned(v, Math.abs(v) >= 0.1 ? 0 : 1) : moneyFmt);
const ddFmt = (mode) => (mode === 'log' ? (v) => pct(v, 1) : moneyFmt);

// ------------------------------------------------------------------ textos
const SIZING_LABEL = () => ({
  fixed: L('Lote fijo, o riesgo fijo en dinero', 'Fixed lot, or fixed risk in money'),
  proportional: L('Lote proporcional al balance', 'Lot proportional to the balance'),
  martingale: L('Martingala o rejilla (sube el lote tras perder)', 'Martingale or grid (lot goes up after a loss)'),
});

function sizingSignal(d) {
  switch (d.signal) {
    case 'lote_constante': return L('todas las operaciones llevan el mismo lote', 'every trade has the same lot');
    case 'sube_tras_perder': return L(`tras una pérdida, el lote sube un ${pct(d.martingale.upAfterLoss, 0)} de las veces; tras una ganancia, un ${pct(d.martingale.upAfterWin, 0)}`,
      `after a loss the lot goes up ${pct(d.martingale.upAfterLoss, 0)} of the time; after a win, ${pct(d.martingale.upAfterWin, 0)}`);
    case 'crece_con_balance': return L('el lote crece con el balance', 'the lot grows with the balance');
    case 'balance_estable': return L('el balance apenas cambia, así que en dinero o en % sale lo mismo', 'the balance barely changes, so money or % give the same result');
    case 'no_crece_con_balance': return L('el lote cambia, pero no crece con el balance', 'the lot changes, but it does not grow with the balance');
    case 'sin_balance': return L('el informe no trae el balance; se supone lote fijo', 'the report has no balance column; a fixed lot is assumed');
    default: return L('hay muy pocas operaciones para deducirlo; se supone lote fijo', 'too few trades to tell; a fixed lot is assumed');
  }
}

function sizingRow(res) {
  const labels = SIZING_LABEL();
  const current = res.sizing;
  const opts = ['fixed', 'proportional', 'martingale'].map((k) => `<option value="${k}"${k === current ? ' selected' : ''}>${esc(labels[k])}</option>`).join('');
  const deduced = res.detected.kind === current
    ? L(`Deducido de tus operaciones: ${sizingSignal(res.detected)}. Si no es así, cámbialo.`, `Deduced from your trades: ${sizingSignal(res.detected)}. If that is wrong, change it.`)
    : L(`Lo has cambiado tú. De tus operaciones se deducía «${labels[res.detected.kind]}» (${sizingSignal(res.detected)}).`, `You changed it. Your trades suggested "${labels[res.detected.kind]}" (${sizingSignal(res.detected)}).`);
  return `<div class="mc-sizing"><label class="inline-select">${L('Cómo calcula el lote tu EA', 'How your EA sizes its lot')} <select id="mcSizing">${opts}</select></label><small>${esc(deduced)}</small></div>`;
}

const MARTINGALE_TEXT = () => L(
  'El lote sube después de perder. El riesgo de ese sistema está en una racha que tu backtest no ha tenido, y ningún remuestreo puede inventarla: reordenar o remuestrear tus operaciones daría una falsa tranquilidad. No damos cifras.',
  'The lot goes up after a loss. The risk of that system lies in a streak your backtest has not had, and no resampling can invent it: reordering or resampling your trades would give false comfort. We give no figures.',
);

function gatesText(g) {
  const parts = [];
  if (g.streaks.hit) {
    parts.push(L('tus resultados diarios van en rachas (los días buenos tienden a seguir a días buenos, o los malos a malos) más de lo que el método puede representar',
      'your daily results come in streaks (good days tend to follow good days, or bad follow bad) more than the method can represent'));
  }
  if (g.volatility.hit) {
    parts.push(L('los días tranquilos y los agitados van agrupados (la volatilidad va por rachas) más de lo que el método puede representar',
      'calm and turbulent days come in clusters (volatility comes in streaks) more than the method can represent'));
  }
  if (!parts.length) {
    return L('Con tan pocos días no se puede comprobar si tus resultados van en rachas.', 'With so few days it cannot be checked whether your results come in streaks.');
  }
  return L(`En estas operaciones, ${parts.join(', y ')}.`, `In these trades, ${parts.join(', and ')}.`);
}

const VOL_CAVEAT = () => L(
  'Ojo: con resultados muy desiguales, dos días extraordinarios cerca uno del otro pueden bastar para que salte este aviso. Es un error del lado prudente (niega cifras, no da cifras malas) y lo estamos mejorando.',
  'Note: with very uneven results, two extraordinary days close to each other can be enough to trigger this warning. It errs on the side of caution (it withholds figures, it does not give bad ones) and we are improving it.',
);

// ------------------------------------------------------------------ tramos
const SEGMENT_LABEL = () => ({
  opt: L('Periodo optimizado', 'Optimized period'),
  fwd: L('Forward', 'Forward'),
  used: L('Usado para elegir', 'Used for choosing'),
  clean: L('Posterior a la elección', 'After the choice'),
  all: L('Todo el informe', 'Whole report'),
});

const CUT_ERROR = (e, period) => {
  const range = period ? L(`del ${fdate(period.from)} al ${fdate(period.to)}`, `from ${fdate(period.from)} to ${fdate(period.to)}`) : '';
  switch (e) {
    case 'orden': return L('El fin del periodo optimizado no puede ser posterior al último día que usaste para elegir.', 'The end of the optimized period cannot be later than the last day you used for choosing.');
    case 'sin_operaciones_antes': return L(`Esa fecha es anterior a la primera operación: las operaciones del informe van ${range}.`, `That date is before the first trade: the report's trades run ${range}.`);
    case 'sin_operaciones_despues': return L(`Después de esa fecha no hay operaciones: las del informe van ${range}. Si el informe entero es posterior a la elección, elige «No».`, `There are no trades after that date: the report's trades run ${range}. If the whole report is after the choice, pick "No".`);
    case 'fecha_no_valida': return L('Esa fecha no es válida.', 'That date is not valid.');
    default: return L('El informe no trae fechas de cierre reconocibles.', "The report doesn't have recognizable closing dates.");
  }
};

/** ¿El informe incluye fechas usadas para elegir? Con fechas de corte, se parte en tramos. */
function periodsRow(mc, res) {
  const rep = state.report;
  const day = (d) => (d instanceof Date && !Number.isNaN(d.valueOf()) ? d.toISOString().slice(0, 10) : '');
  const min = (res.period && res.period.from) || day(rep.meta.from);
  const max = (res.period && res.period.to) || day(rep.meta.to);
  const yes = mc.split === 'yes';
  const radio = (v, text) => `<label><input type="radio" name="mcSplit" value="${v}"${mc.split === v ? ' checked' : ''}> <span>${text}</span></label>`;
  const dates = yes ? `<div class="mc-dates">
      <label class="field"><span>${L('Último día que usaste para elegir (fin del forward)', 'Last day you used for choosing (end of the forward)')}</span>
        <input type="date" id="mcChooseEnd" value="${esc(mc.cuts.chooseEnd)}" min="${esc(min)}" max="${esc(max)}"></label>
      <label class="field"><span>${L('Fin del periodo optimizado (opcional, para verlo aparte del forward)', 'End of the optimized period (optional, to see it apart from the forward)')}</span>
        <input type="date" id="mcOptEnd" value="${esc(mc.cuts.optEnd)}" min="${esc(min)}" max="${esc(max)}"></label>
    </div>
    <small>${L(`Cada operación cuenta en el tramo de su fecha de cierre. Las operaciones del informe van del ${fdate(min)} al ${fdate(max)}.`, `Each trade counts in the segment of its closing date. The report's trades run from ${fdate(min)} to ${fdate(max)}.`)}</small>` : '';
  const err = res.reason === 'cortes' ? `<p class="inline-warn">${esc(CUT_ERROR(res.cutError, res.period))}</p>` : '';
  return `<fieldset class="mc-periods">
      <legend>${L('¿Este informe incluye fechas que usaste para elegir la configuración (el periodo optimizado o el forward)?', 'Does this report include dates you used to choose the configuration (the optimized period or the forward)?')}</legend>
      <div class="mc-radios">${radio('no', L('No: todo es posterior a la elección', 'No: all of it is after the choice'))}${radio('yes', L('Sí: es un backtest largo', 'Yes: it is a long backtest'))}</div>
      ${dates}${err}
    </fieldset>`;
}

const orderWord = (worse) => (worse >= 0.8 ? L('favorable', 'favorable') : worse <= 0.2 ? L('desfavorable', 'unfavorable') : L('normal', 'normal'));

/** Radiografía de cada tramo, en una tabla: así se ve qué tramo tuvo suerte con el orden. */
function segmentsTable(res) {
  const labels = SEGMENT_LABEL();
  const dd = ddFmt(res.mode);
  const cols = [L('Fechas', 'Dates'), L('Operaciones', 'Trades'), L('Caída máxima', 'Maximum drop'), L('Con otro orden, mayor en', 'With another order, larger in'), L('El orden fue', 'The order was')];
  const rows = res.segments.map((sg) => {
    const r = sg.radiography;
    const ok = r && r.usable;
    const cell = (i, v) => `<td data-label="${esc(cols[i])}">${v}</td>`;
    return `<tr class="stack-row${sg.key === 'clean' ? ' mc-row-clean' : ''}"><td class="strong">${esc(labels[sg.key])}</td>${cell(0, `${fdate(sg.from)} – ${fdate(sg.to)}`)}${cell(1, int(sg.trades))}${cell(2, ok ? esc(dd(r.real.maxDd)) : '—')}${cell(3, ok ? pct(r.worseOrderShare, 0) : '—')}${cell(4, ok ? esc(orderWord(r.worseOrderShare)) : esc(L(`menos de ${MIN_TRADES} operaciones`, `fewer than ${MIN_TRADES} trades`)))}</tr>`;
  }).join('');
  const straddling = res.segments.reduce((a, sg) => a + sg.straddling, 0);
  const options = res.segments.filter((sg) => sg.radiography && sg.radiography.usable)
    .map((sg) => `<option value="${sg.key}"${sg.key === viewKey(res) ? ' selected' : ''}>${esc(labels[sg.key])}</option>`).join('');
  return `<div class="table-wrap"><table class="stack-table mc-seg-table">
      <thead><tr><th>${L('Tramo', 'Segment')}</th>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody></table></div>
    <p class="chart-note">${L(
    'En los tramos con los que elegiste, lo esperable es un orden favorable: la configuración se eligió porque le fue bien ahí. El tramo que cuenta es el posterior a la elección.',
    'In the segments you chose with, a favorable order is to be expected: the configuration was chosen because it did well there. The segment that counts is the one after the choice.',
  )}${straddling ? ` ${L(`${int(straddling)} ${straddling === 1 ? 'operación se abrió' : 'operaciones se abrieron'} antes de un corte y ${straddling === 1 ? 'se cerró' : 'se cerraron'} después: ${straddling === 1 ? 'cuenta' : 'cuentan'} en el tramo posterior.`, `${int(straddling)} ${straddling === 1 ? 'trade was' : 'trades were'} opened before a cut and closed after it: ${straddling === 1 ? 'it counts' : 'they count'} in the later segment.`)}` : ''}</p>
    ${options ? `<div class="mc-sizing"><label class="inline-select">${L('Ver el gráfico de', 'Show the chart for')} <select id="mcView">${options}</select></label></div>` : ''}`;
}

/** Tramo del gráfico: el que eligió el usuario, o el posterior a la elección, o el informe entero. */
function viewKey(res) {
  const mc = mcState();
  const usable = (k) => res.segments.some((sg) => sg.key === k && sg.radiography && sg.radiography.usable);
  if (mc.view && usable(mc.view)) return mc.view;
  return usable('clean') ? 'clean' : 'all';
}

// ------------------------------------------------------------------ radiografía
function radiographyBlock(res) {
  const r = res.radiography;
  if (!r) {
    return `<div class="mc-off"><p>${esc(L('Este tramo no tiene operaciones.', 'This segment has no trades.'))}</p></div>`;
  }
  if (!r.usable) {
    const why = r.reason === 'pocas_operaciones'
      ? L(`Hacen falta al menos ${MIN_TRADES} operaciones y aquí hay ${int(r.trades)}: con menos, cualquier orden parece posible y no se puede decir nada.`,
        `At least ${MIN_TRADES} trades are needed and there are ${int(r.trades)} here: with fewer, any order looks possible and nothing can be said.`)
      : L('Todas las operaciones caen el mismo día: no hay días que reordenar.', 'All the trades fall on the same day: there are no days to reorder.');
    return `<div class="mc-off"><p>${esc(why)}</p></div>`;
  }
  const v = valueFmt(res.mode);
  const dd = ddFmt(res.mode);
  const worse = r.worseOrderShare;
  const reading = worse >= 0.8
    ? L('<strong>El orden te favoreció</strong>: con estas mismas operaciones, cuenta con caídas mayores que la de tu backtest.',
      '<strong>The order favored you</strong>: with these same trades, expect larger drops than your backtest had.')
    : worse <= 0.2
      ? L('<strong>Te tocó un orden desfavorable</strong>: la caída de tu backtest es de las peores que dan estas operaciones.',
        '<strong>You got an unfavorable order</strong>: your backtest\'s drop is among the worst these trades can give.')
      : L('<strong>Un orden normal</strong>: tu caída es de las habituales con estas operaciones.',
        '<strong>A normal order</strong>: your drop is a usual one for these trades.');
  const label = L(
    `Tus ${int(r.trades)} operaciones en ${int(r.sims)} órdenes distintos de sus días: todas acaban en ${v(r.total)}. Tu caída máxima fue de ${dd(r.real.maxDd)}; con otro orden habría sido mayor en el ${pct(worse, 0)} de los casos.`,
    `Your ${int(r.trades)} trades in ${int(r.sims)} different orders of their days: all end at ${v(r.total)}. Your maximum drop was ${dd(r.real.maxDd)}; with another order it would have been larger in ${pct(worse, 0)} of cases.`,
  );
  const chart = radiographyChart(r, { fmt: tickFmt(res.mode), label, yLabel: res.mode === 'log' ? L('Resultado acumulado (%)', 'Cumulative result (%)') : L('Resultado acumulado', 'Cumulative result') });
  const gateWarn = res.gates && (res.gates.streaks.hit || res.gates.volatility.hit)
    ? `<div class="inline-warn">${esc(gatesText(res.gates))} ${esc(L('Reordenar los días rompe eso, así que las caídas y las rachas de esta radiografía se quedan cortas.', 'Reordering the days breaks that, so the drops and streaks in this radiography fall short.'))}</div>`
    : '';
  const unit = res.mode === 'log'
    ? L('En % del balance, porque el lote crece con él.', 'As % of the balance, because the lot grows with it.')
    : L('En dinero de la cuenta.', 'In account money.');
  return `<span class="mc-tag">${L('Esto analiza tu backtest; no es una previsión', 'This analyzes your backtest; it is not a forecast')}</span>
    <p class="chart-note">${L(
    `Son tus mismas ${int(r.trades)} operaciones con sus días en otro orden (${int(r.sims)} órdenes; dentro de cada día, el orden real). Todas las curvas acaban en el mismo resultado, ${esc(v(r.total))}; lo que cambia es el camino. ${unit}`,
    `These are your same ${int(r.trades)} trades with their days in another order (${int(r.sims)} orders; within each day, the real order). Every curve ends at the same result, ${esc(v(r.total))}; what changes is the path. ${unit}`,
  )}</p>
    ${chart}
    <ul class="mc-facts">
      <li>${L(
    `Tu caída máxima de balance fue de <strong>${esc(dd(r.real.maxDd))}</strong>. Con otro orden, habría sido mayor en el <strong>${pct(worse, 0)}</strong> de los casos: la mitad de las veces, hasta ${esc(dd(r.maxDd.p50))}; 1 de cada 20, más de ${esc(dd(r.maxDd.p95))}.`,
    `Your maximum balance drop was <strong>${esc(dd(r.real.maxDd))}</strong>. With another order, it would have been larger in <strong>${pct(worse, 0)}</strong> of cases: half the time, up to ${esc(dd(r.maxDd.p50))}; 1 in 20, more than ${esc(dd(r.maxDd.p95))}.`,
  )} ${reading}</li>
      <li>${L(
    `Tu racha más larga de operaciones perdedoras: <strong>${int(r.real.longestLosingStreak)}</strong> seguidas. Con otro orden, lo normal sería ${int(r.longestLosingStreak.p50)}, y 1 de cada 20 veces, ${int(r.longestLosingStreak.p95)} o más.`,
    `Your longest run of losing trades: <strong>${int(r.real.longestLosingStreak)}</strong> in a row. With another order, the usual would be ${int(r.longestLosingStreak.p50)}, and 1 in 20 times, ${int(r.longestLosingStreak.p95)} or more.`,
  )}</li>
    </ul>
    ${gateWarn}`;
}

// ------------------------------------------------------------------ previsión
/** Lo que impide la previsión y no depende de los datos: de qué configuración y de qué tramo es. */
function processBlockers(a, p, res) {
  const rep = state.report;
  const out = [];
  const pcmp = compareParams(rep.params, a.meta.paramNames, p.record.params);
  if (!pcmp.matches) {
    out.push(pcmp.different.length
      ? L('Este informe es de otra configuración, no de la que estás validando.', 'This report is from another configuration, not the one you are validating.')
      : L('No consta que este informe sea de la configuración que estás validando (al informe le faltan parámetros optimizados).', 'It is not confirmed that this report is from the configuration you are validating (the report is missing optimized parameters).'));
  }
  const repeated = pcmp.matches ? repeatedPeriod(p.record, rep.metrics) : null;
  if (repeated) out.push(repeatedPeriodText(repeated, p.record.id).short);
  // Otra configuración (otra meseta) ya comparada con fechas que se solapan: si se eligió entre
  // ellas, este tramo ya no es ciego. La misma configuración en otro tramo no es elegir.
  const day = (d) => (d instanceof Date && !Number.isNaN(d.valueOf()) ? d.toISOString().slice(0, 10) : null);
  const from = res.cuts ? res.cleanFrom : day(rep.meta.from);
  const to = res.cuts ? res.cleanTo : day(rep.meta.to);
  const current = Math.min(state.unseen.plateauIndex || 0, a.plateaus.length - 1) + 1;
  const overlapping = otherConfigOnSameDates(state.unseenTries, { from, to, plateau: current });
  if (overlapping.length) {
    out.push(L('Ya has comparado otra configuración con fechas que se solapan con estas. Si elegiste entre ellas, este tramo ya no es ciego y la previsión saldría optimista.',
      'You already compared another configuration with dates that overlap these. If you chose between them, this segment is no longer blind and the forecast would come out optimistic.'));
  }
  return out;
}

function dataBlockers(res) {
  const out = [];
  const miss = res.forecastData.missing;
  const where = res.cuts
    ? L(`el tramo posterior al ${fdate(res.cuts.chooseEnd)}`, `the segment after ${fdate(res.cuts.chooseEnd)}`)
    : L('este informe', 'this report');
  if (miss.includes('dias')) {
    out.push(L(`Hacen falta 2 años de operaciones que no usaste para elegir (${int(FORECAST_MIN_DAYS)} días de mercado) y ${where} tiene ${int(res.days)}. Con menos, en nuestras pruebas las cifras no cumplían lo que prometían.`,
      `It needs 2 years of trades you did not use for choosing (${int(FORECAST_MIN_DAYS)} market days) and ${where} has ${int(res.days)}. With less, in our tests the figures did not deliver what they promised.`));
  }
  if (miss.includes('dias_con_operaciones')) {
    out.push(L(`Hacen falta al menos ${int(FORECAST_MIN_TRADING_DAYS)} días con operaciones y ${where} tiene ${int(res.tradingDays)}.`,
      `It needs at least ${int(FORECAST_MIN_TRADING_DAYS)} days with trades and ${where} has ${int(res.tradingDays)}.`));
  }
  if (miss.includes('puertas')) {
    out.push(`${gatesText(res.gates)} ${L('En esos casos el método se quedaba corto en nuestras pruebas, así que no damos cifras.', 'In those cases the method fell short in our tests, so we give no figures.')}${res.gates.volatility.hit ? ` ${VOL_CAVEAT()}` : ''}`);
  }
  return out;
}

function forecastBar(h, mode) {
  const W = 300; const H = 44; const pad = 6;
  const lo = Math.min(h.total.p05, 0); const hi = Math.max(h.total.p95, 0);
  const span = hi - lo || 1;
  const x = (v) => pad + ((v - lo) / span) * (W - 2 * pad);
  const v = valueFmt(mode);
  const label = L(`Resultado: entre ${v(h.total.p05)} y ${v(h.total.p95)}, mitad por encima de ${v(h.total.p50)}.`, `Result: between ${v(h.total.p05)} and ${v(h.total.p95)}, half above ${v(h.total.p50)}.`);
  const tx = (val, anchor) => `<text class="mc-bar-label" x="${x(val).toFixed(1)}" y="40" text-anchor="${anchor}">${esc(v(val))}</text>`;
  return `<svg class="mc-bar" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    <rect class="mc-bar-range" x="${x(h.total.p05).toFixed(1)}" y="6" width="${Math.max(1, x(h.total.p95) - x(h.total.p05)).toFixed(1)}" height="14" rx="3"/>
    <line class="mc-bar-zero" x1="${x(0).toFixed(1)}" y1="2" x2="${x(0).toFixed(1)}" y2="24"/>
    <line class="mc-bar-mid" x1="${x(h.total.p50).toFixed(1)}" y1="4" x2="${x(h.total.p50).toFixed(1)}" y2="22"/>
    ${tx(h.total.p05, 'start')}${tx(h.total.p95, 'end')}
  </svg>`;
}

function forecastCards(f, ddLimit) {
  const v = valueFmt(f.mode);
  const dd = ddFmt(f.mode);
  const months = (h) => (h === 126 ? L('En 6 meses', 'In 6 months') : L('En 12 meses', 'In 12 months'));
  return `<div class="mc-cards">${f.horizons.map((h) => `<div class="mc-card">
      <h4>${months(h.horizon)} <span class="muted">· ${int(h.horizon)} ${L('días de mercado', 'market days')}</span></h4>
      <p>${L(`Resultado: 9 de cada 10 veces, <strong>entre ${esc(v(h.total.p05))} y ${esc(v(h.total.p95))}</strong>; la mitad, por encima de ${esc(v(h.total.p50))}.`,
    `Result: 9 in 10 times, <strong>between ${esc(v(h.total.p05))} and ${esc(v(h.total.p95))}</strong>; half the time, above ${esc(v(h.total.p50))}.`)}</p>
      ${forecastBar(h, f.mode)}
      <p>${L(`Caída máxima de balance: la mitad de las veces hasta ${esc(dd(h.maxDd.p50))}; <strong>1 de cada 20, más de ${esc(dd(h.maxDd.p95))}</strong>.`,
    `Maximum balance drop: half the time up to ${esc(dd(h.maxDd.p50))}; <strong>1 in 20, more than ${esc(dd(h.maxDd.p95))}</strong>.`)}</p>
      <p>${L(`Probabilidad de acabar en pérdidas: <strong>${prob(h.probLoss)}</strong>.`, `Probability of ending at a loss: <strong>${prob(h.probLoss)}</strong>.`)}</p>
      ${ddLimit && h.probDd.length ? `<p>${L(`Probabilidad de caer ${esc(dd(ddLimit))} o más: <strong>${prob(h.probDd[0].p)}</strong>.`, `Probability of dropping ${esc(dd(ddLimit))} or more: <strong>${prob(h.probDd[0].p)}</strong>.`)}</p>` : ''}
    </div>`).join('')}</div>`;
}

function forecastBlock(a, p, res) {
  const mcs = mcState();
  if (mcs.split === 'yes' && !res.cuts) {
    return `<div class="mc-off"><p>${esc(L('Indica arriba el último día que usaste para elegir: la previsión solo se calcula con lo posterior.', 'Enter above the last day you used for choosing: the forecast is only computed with what comes after.'))}</p></div>`;
  }
  const blockers = [...dataBlockers(res), ...processBlockers(a, p, res)];
  const no3m = L('A 3 meses no damos previsión: en nuestras pruebas no fue fiable con ningún tamaño de muestra.', 'We give no 3-month forecast: in our tests it was not reliable with any sample size.');
  if (blockers.length) {
    return `<div class="mc-off">${blockers.map((b) => `<p>${esc(b)}</p>`).join('')}<p>${esc(no3m)}</p></div>`;
  }
  const mc = mcState();
  const f = mc.forecast;
  if (f && f.status === 'done' && f.result && f.result.usable) {
    return `${forecastCards(f.result, f.ddLimit)}
      <p class="chart-note">${L(
      `Con las operaciones del ${fdate(f.result.from)} al ${fdate(f.result.to)}, que según nos dices no usaste para elegir. Supone que el mercado se sigue comportando como en esas fechas: si cambia, o si llega una pérdida mayor que cualquiera de tu backtest, estas cifras no lo saben. La caída es de balance, operación a operación. ${no3m}`,
      `From the trades of ${fdate(f.result.from)} to ${fdate(f.result.to)}, which you tell us you did not use for choosing. It assumes the market keeps behaving as on those dates: if it changes, or if a loss larger than any in your backtest arrives, these figures do not know it. The drop is on the balance, trade by trade. ${no3m}`,
    )}</p>
      <p class="chart-note">${L(
      'Método comprobado antes de publicarlo, con casos simulados de respuesta conocida y reglas fijadas de antemano: remuestreo bayesiano por bloques de días con el nivel calibrado por doble bootstrap (detalle en la metodología).',
      'Method tested before publishing, on simulated cases with a known answer and rules set in advance: Bayesian block resampling of days with the level calibrated by double bootstrap (details in the methodology).',
    )}</p>`;
  }
  if (f && f.status === 'running') {
    return `<div class="mc-confirm" aria-live="polite"><p>${L('Calculando la previsión… tarda unos segundos.', 'Computing the forecast… it takes a few seconds.')}</p></div>`;
  }
  const err = f && f.status === 'error' ? `<p class="inline-warn">${esc(f.error)}</p>` : '';
  const unit = res.mode === 'log' ? L('en % del balance', 'as % of the balance') : L('en dinero de la cuenta', 'in account money');
  return `<div class="mc-confirm">
      <p>${res.cuts ? L(
    `Se calcula solo con las operaciones posteriores al ${fdate(res.cuts.chooseEnd)}: del <strong>${fdate(res.from)}</strong> al <strong>${fdate(res.to)}</strong>. `,
    `It is computed only with the trades after ${fdate(res.cuts.chooseEnd)}: from <strong>${fdate(res.from)}</strong> to <strong>${fdate(res.to)}</strong>. `,
  ) : ''}${L(
    `${res.cuts ? 'Esas' : 'Estas'} operaciones van del <strong>${fdate(res.from)}</strong> al <strong>${fdate(res.to)}</strong>. La previsión solo vale si <strong>ninguna de esas fechas se usó para elegir la configuración</strong>: ni para optimizar, ni para el forward, ni para comparar varias configuraciones. Orometra no puede comprobarlo por ti.`,
    `${res.cuts ? 'Those' : 'These'} trades run from <strong>${fdate(res.from)}</strong> to <strong>${fdate(res.to)}</strong>. The forecast is only valid if <strong>none of those dates was used to choose the configuration</strong>: not for optimizing, not for the forward, not for comparing several configurations. Orometra cannot check this for you.`,
  )}</p>
      <label><input type="checkbox" id="mcConfirm"${mc.confirm ? ' checked' : ''}> <span>${L('No usé ninguna de estas fechas para elegir', 'I did not use any of these dates for choosing')}</span></label>
      <label class="field"><span>${L(`Caída de balance que no aguantarías (opcional, ${unit})`, `Balance drop you could not stand (optional, ${unit})`)}</span>
        <input type="text" inputmode="decimal" autocomplete="off" id="mcDdLimit" value="${esc(mc.ddLimit)}" placeholder="${res.mode === 'log' ? '20' : '10000'}"></label>
      <div><button class="primary-btn" id="mcForecastBtn" type="button"${mc.confirm ? '' : ' disabled'}>${L('Calcular la previsión', 'Compute the forecast')}</button></div>
      ${err}
    </div>`;
}

/**
 * Sección «Monte Carlo» dentro de la ficha de las operaciones (js/ui-unseen.js#renderTradesAudit).
 * Lo que no se puede calcular ocupa el mismo sitio, con el motivo.
 */
export function renderMonteCarlo(a, p) {
  const mc = mcState();
  if (mc.status === 'idle') {
    // Informe cargado por un camino que no lanzó el cálculo: se lanza ahora.
    queueMicrotask(startTradesMC);
    mc.status = 'running';
  }
  if (mc.status === 'running') {
    return `<p class="muted" aria-live="polite">${L('Calculando la radiografía de tus operaciones…', 'Computing the radiography of your trades…')}</p>`;
  }
  if (mc.status === 'error') return `<p class="inline-warn">${esc(mc.error)}</p>`;
  const res = mc.result;
  if (res.sizing === 'martingale') {
    return `${sizingRow(res)}<div class="mc-off"><p>${esc(MARTINGALE_TEXT())}</p></div>`;
  }
  if (res.reason === 'cortes') {
    return `${sizingRow(res)}${periodsRow(mc, res)}`;
  }
  if (!res.usable) {
    const why = res.reason === 'balance_no_valido'
      ? L('Para trabajar en % hace falta el balance tras cada operación, y el informe no lo trae completo. Prueba con «lote fijo».', 'Working in % needs the balance after each trade, and the report does not have it complete. Try "fixed lot".')
      : L('El informe no trae fechas de cierre reconocibles: no se pueden agrupar las operaciones por día sin inventar un reparto.', "The report doesn't have recognizable closing dates: trades can't be grouped by day without making one up.");
    return `${sizingRow(res)}<div class="mc-off"><p>${esc(why)}</p></div>`;
  }
  const view = res.segments ? res.segments.find((sg) => sg.key === viewKey(res)) : null;
  return `${sizingRow(res)}
    ${periodsRow(mc, res)}
    <h4 class="mc-h">${L('Radiografía: ¿fue suerte el orden?', 'Radiography: was the order luck?')}</h4>
    ${res.segments ? segmentsTable(res) : ''}
    ${radiographyBlock(view || res)}
    <h4 class="mc-h">${L('Previsión a 6 y 12 meses', '6- and 12-month forecast')}</h4>
    ${forecastBlock(a, p, res)}`;
}
