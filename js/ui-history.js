// Historial local de análisis: lo guarda en el navegador y lo pinta (comparación en el
// veredicto y pestaña «Historial»). La lógica pura está en core/history.js.
//
// Solo en este navegador (localStorage, clave 'orometra.history'): un resumen por análisis,
// nunca los archivos. Activado por defecto, con un aviso la primera vez y un interruptor
// en la pestaña. El ejemplo sintético no se guarda.

import {
  summarize, parseStore, emptyStore, addEntry, previousFor, attempts, compare,
  ATTEMPT_WARN, LEVEL_ORDER,
} from '../core/history.js';
import { L, localeTag, pctSign } from './i18n.js';
import { state, api, esc, num, int, paramHtml } from './ui-state.js';
import { displayVerdictLevel, levelName, holdoutFact } from './ui-verdict.js';

const KEY = 'orometra.history';

export function loadStore() {
  try { return parseStore(localStorage.getItem(KEY)); } catch { return emptyStore(); }
}
function saveStore(store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
    return true;
  } catch {
    // Sin sitio (o modo privado): se guarda la mitad más reciente; si tampoco, nada.
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...store, entries: store.entries.slice(-Math.floor(store.entries.length / 2)) }));
      return true;
    } catch { return false; }
  }
}

let seq = 0;
const newId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** Tras cada análisis (no del ejemplo): guarda su resumen. Llamada desde ui-audit.js. */
export function recordAnalysis(analysis) {
  state.historyId = null;
  state.historyFirst = false;
  if (state.isDemo || !analysis) return;
  const store = loadStore();
  if (store.off) return;
  const entry = summarize(analysis, {
    id: newId(),
    at: new Date().toISOString(),
    level: displayVerdictLevel(analysis),
    files: { is: state.source ? state.source.is : '', oos: state.source ? state.source.oos : null },
  });
  store.entries = addEntry(store.entries, entry);
  const saved = store.entries[store.entries.length - 1];
  if (saveStore(store)) {
    state.historyId = saved.id;
    state.historyFirst = !store.seen;
  }
}

/** Tras comprobar el periodo no visto: lo apunta en el análisis actual. */
export function updateHistoryUnseen(analysis) {
  if (!state.historyId || !analysis) return;
  const store = loadStore();
  const e = store.entries.find((x) => x.id === state.historyId);
  if (!e) return;
  const res = state.unseen && state.unseen.result;
  const hold = holdoutFact(analysis);
  e.unseen = res ? { level: res.level, validates: hold.ok, against: Boolean(hold.against) } : null;
  e.level = displayVerdictLevel(analysis);
  saveStore(store);
}

// ------------------------------------------------------------------ formato
const ordinal = (n) => L(`${n}.º`, `${n}${(n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`);
const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.valueOf()) ? '—' : d.toLocaleString(localeTag(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const pill = (level) => {
  const i = LEVEL_ORDER.indexOf(level);
  return i < 0 ? '—' : `<span class="rc-level hist-pill" style="--s:var(--lv-${i + 1})"><span class="rc-dot" aria-hidden="true"></span>${esc(levelName(level))}</span>`;
};
const span = (s) => (!s ? '—' : s.min === s.max ? paramHtml(s.min) : `${paramHtml(s.min)}–${paramHtml(s.max)}`);
const gatesText = (g) => `PF ≥ ${num(g.minProfitFactor, 2)} · DD ≤ ${num(g.maxDrawdownPct, 0)}${pctSign()} · ${int(g.minTrades)} ${L('op.', 'trades')}`;
const unseenText = (u) => {
  if (!u) return L('sin comprobar', 'not checked');
  const v = u.level === 'normal' ? L('no contradice', 'not contradicted') : u.level === 'tail' ? L('en la cola', 'in the tail') : L('fuera de rango', 'out of range');
  return u.validates || u.against ? v : L(`${v} · no valida`, `${v} · does not validate`);
};

// ------------------------------------------------------------------ en el veredicto
/** Bloque bajo la tarjeta del veredicto: aviso de primera vez y comparación con el anterior. */
export function renderHistoryCompare() {
  if (!state.historyId) return '';
  const store = loadStore();
  const cur = store.entries.find((e) => e.id === state.historyId);
  if (!cur) return '';
  const notice = state.historyFirst && !store.seen ? `<div class="hist-notice" role="note">
      <p>${L(
        'Hemos guardado un <strong>resumen de este análisis en tu navegador</strong> (no tus archivos) para compararlo cuando vuelvas a analizar este EA. No sale de tu equipo.',
        'We saved a <strong>summary of this analysis in your browser</strong> (not your files) to compare it next time you analyze this EA. It never leaves your computer.',
      )}</p>
      <div class="hist-notice-actions">
        <button class="ghost-btn" type="button" data-hist="ack">${L('Entendido', 'Got it')}</button>
        <button class="text-btn" type="button" data-hist="off-now">${L('No guardar historial', 'Do not keep history')}</button>
      </div>
    </div>` : '';
  const prev = previousFor(store.entries, cur);
  if (!prev) return notice;
  const c = compare(prev, cur);
  const n = attempts(store.entries, cur.fp);
  const label = store.labels[cur.fp];

  const levelLine = `${pill(c.levelBefore)} <span class="hist-arrow" aria-hidden="true">→</span> ${pill(c.levelNow)}`;
  const notComparable = !c.levelsComparable ? `<p class="hist-caveat">${esc(c.reasons.includes('gates')
    ? L('Cambiaste los mínimos desde la otra vez: con otras reglas, un nivel distinto no dice nada del EA.', 'You changed the minimums since last time: under other rules, a different level says nothing about the EA.')
    : L('Uno de los dos análisis no tenía forward: los niveles no se pueden comparar.', 'One of the two analyses had no forward: the levels cannot be compared.'))}</p>` : '';

  let place = '';
  if (c.bothPicks && c.params.length) {
    const total = c.params.length;
    const k = c.insideCount;
    const head = k === total
      ? L(`Sí: la configuración recomendada ahora cae dentro de la meseta de la otra vez en sus ${total} parámetros.`, `Yes: the configuration recommended now falls inside last time's plateau on all ${total} parameters.`)
      : k === 0
        ? L('No: la configuración recomendada ahora cae fuera de la meseta de la otra vez en todos sus parámetros. La meseta ha cambiado de sitio.', 'No: the configuration recommended now falls outside last time\'s plateau on every parameter. The plateau has moved.')
        : L(`En parte: ${k} de ${total} parámetros caen dentro de la meseta de la otra vez.`, `Partly: ${k} of ${total} parameters fall inside last time's plateau.`);
    place = `<h3>${L('¿La meseta sigue en el mismo sitio?', 'Is the plateau still in the same place?')}</h3>
      <p class="hist-lead">${esc(head)}</p>
      <ul class="hist-params">${c.params.map((p) => `<li class="${p.inside ? 'is-in' : 'is-out'}">
        <code>${esc(p.name)}</code> <b>${paramHtml(p.now)}</b>
        <span>${p.inside ? L('dentro', 'inside') : L('fuera', 'outside')} (${span(p.span)})</span>
      </li>`).join('')}</ul>
      <p class="hist-fine">${esc(L(
        'Que caiga en el mismo sitio es coherente con una meseta real; si los dos análisis son sobre los mismos datos, no es una prueba independiente.',
        'Landing in the same place is consistent with a real plateau; if both analyses use the same data, it is not an independent test.',
      ))}</p>`;
  } else {
    place = `<p class="hist-lead">${esc(L('Uno de los dos análisis no tiene meseta: no hay posición que comparar.', 'One of the two analyses has no plateau: there is no position to compare.'))}</p>`;
  }

  const warn = n >= ATTEMPT_WARN ? `<div class="hist-attempts" role="note">
      <strong>${esc(L(`Es tu ${ordinal(n)} análisis de este EA en este navegador.`, `This is your ${ordinal(n)} analysis of this EA in this browser.`))}</strong>
      ${esc(L(
        'Si son sobre el mismo periodo, subir de nivel tras varios intentos no es más evidencia: es probar más veces, y con cada intento es más fácil encontrar algo por azar. La comprobación limpia es un periodo que no hayas usado. (El XML de MT5 no trae fechas, así que no podemos saber si es el mismo periodo.)',
        'If they use the same period, a higher level after several attempts is not more evidence: it is trying more times, and every attempt makes it easier to find something by chance. The clean check is a period you have not used. (The MT5 XML has no dates, so we cannot tell whether it is the same period.)',
      ))}
    </div>` : '';

  return `${notice}<section class="panel hist-panel" aria-label="${esc(L('Comparación con tu análisis anterior', 'Comparison with your previous analysis'))}">
    <div class="panel-head compact">
      <div><div class="panel-kicker">${L('Historial', 'History')}</div><h2>${L('Frente a tu análisis anterior de este EA', 'Compared with your previous analysis of this EA')}</h2></div>
      <button class="text-btn" type="button" data-goto="history">${L('Ver historial', 'See history')} <span aria-hidden="true">→</span></button>
    </div>
    <p class="hist-meta">${esc(label ? `${label} · ` : '')}${esc(when(c.prevAt))} · ${esc(prev.files.is || '—')}${c.sameFiles ? ` · ${esc(L('mismos archivos', 'same files'))}` : ''}</p>
    <div class="hist-grid">
      <div class="hist-stat"><span>${L('Fiabilidad', 'Reliability')}</span><div>${levelLine}</div></div>
      ${c.bothPicks ? `<div class="hist-stat"><span>${L('Tamaño de la meseta', 'Plateau size')}</span><div><b>${int(c.sizeBefore)}</b> → <b>${int(c.sizeNow)}</b></div></div>
      <div class="hist-stat"><span>${L('Robustez', 'Robustness')}</span><div><b>${num(c.robustBefore, 0)}</b> → <b>${num(c.robustNow, 0)}</b></div></div>` : ''}
    </div>
    ${notComparable}
    ${place}
    ${warn}
  </section>`;
}

// ------------------------------------------------------------------ pestaña Historial
export function renderHistoryView() {
  const store = loadStore();
  const groups = [];
  for (const e of [...store.entries].reverse()) {
    let g = groups.find((x) => x.fp === e.fp);
    if (!g) { g = { fp: e.fp, entries: [] }; groups.push(g); }
    g.entries.push(e);
  }
  const intro = `<div class="detail-head">
      <h2>${L('Tu historial', 'Your history')}</h2>
      <p class="panel-intro">${L(
        'Un resumen de cada análisis, guardado <strong>solo en este navegador</strong>: nunca tus archivos. Sirve para comparar cuando vuelves a analizar un EA y para contar los intentos. Para ver un informe completo hay que volver a soltar sus archivos.',
        'A summary of each analysis, stored <strong>only in this browser</strong>: never your files. It lets you compare when you analyze an EA again and counts the attempts. To see a full report, drop its files again.',
      )}</p>
    </div>`;
  const controls = `<section class="panel hist-controls">
      <label class="hist-switch">
        <input type="checkbox" data-hist="toggle"${store.off ? '' : ' checked'}>
        <span>${L('Guardar un resumen de cada análisis en este navegador', 'Keep a summary of each analysis in this browser')}</span>
      </label>
      ${store.entries.length ? `<button class="ghost-btn hist-clear" type="button" data-hist="clear">${L('Borrar todo el historial', 'Delete all history')}</button>` : ''}
    </section>`;
  if (!groups.length) {
    return `${intro}${controls}<section class="panel"><p class="hist-empty">${esc(store.off
      ? L('El historial está desactivado: no se guarda nada.', 'History is off: nothing is saved.')
      : L('Aún no hay análisis guardados. Cuando analices tus archivos, aparecerán aquí (el ejemplo no se guarda).', 'No analyses saved yet. When you analyze your files they will show up here (the sample is not saved).'))}</p></section>`;
  }
  const body = groups.map((g) => {
    const latest = g.entries[0];
    const n = g.entries.length;
    return `<section class="panel hist-group">
      <div class="hist-group-head">
        <label class="hist-label"><span class="sr-only">${L('Nombre de este EA', 'Name of this EA')}</span>
          <input type="text" maxlength="60" data-hist-label="${esc(g.fp)}" value="${esc(store.labels[g.fp] || '')}" placeholder="${esc(latest.files.is || L('EA sin nombre', 'Unnamed EA'))}">
        </label>
        <span class="hist-count">${esc(L(`${n} análisis`, `${n} ${n === 1 ? 'analysis' : 'analyses'}`))} · ${esc(L(`${latest.params.length} parámetros`, `${latest.params.length} parameters`))}</span>
      </div>
      <p class="hist-params-names">${latest.params.map((p) => `<code>${esc(p)}</code>`).join(' ')}</p>
      ${n >= ATTEMPT_WARN ? `<p class="hist-caveat">${esc(L(`${n} intentos con este EA: si son sobre el mismo periodo, un nivel más alto en el último no es más evidencia.`, `${n} attempts with this EA: if they use the same period, a higher level in the last one is not more evidence.`))}</p>` : ''}
      <div class="table-wrap"><table class="stack-table hist-table">
        <thead><tr><th>${L('Fecha', 'Date')}</th><th>${L('Archivos', 'Files')}</th><th>${L('Mínimos', 'Minimums')}</th><th>${L('Fiabilidad', 'Reliability')}</th><th>${L('Recomendada', 'Recommended')}</th><th>${L('Periodo no visto', 'Unseen period')}</th><th><span class="sr-only">${L('Acciones', 'Actions')}</span></th></tr></thead>
        <tbody>${g.entries.map((e) => `<tr class="stack-row">
          <td data-label="${L('Fecha', 'Date')}">${esc(when(e.at))}</td>
          <td data-label="${L('Archivos', 'Files')}" class="hist-files"><div>${esc(e.files.is || '—')}${e.files.oos ? `<span>${esc(e.files.oos)}</span>` : ''}</div></td>
          <td data-label="${L('Mínimos', 'Minimums')}">${esc(gatesText(e.gates))}</td>
          <td data-label="${L('Fiabilidad', 'Reliability')}">${pill(e.level)}</td>
          <td data-label="${L('Recomendada', 'Recommended')}">${e.pick
    ? `<span class="hist-pick">${e.params.map((p, j) => `<span>${esc(p)} <b>${paramHtml(e.pick.values[j])}</b></span>`).join('')}</span>`
    : esc(e.fallback ? L('ninguna con garantías', 'none you can rely on') : '—')}</td>
          <td data-label="${L('Periodo no visto', 'Unseen period')}">${esc(unseenText(e.unseen))}</td>
          <td class="hist-actions"><button class="text-btn" type="button" data-hist="delete" data-id="${esc(e.id)}">${L('Borrar', 'Delete')}</button></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>`;
  }).join('');
  return `${intro}${controls}${body}`;
}

// ------------------------------------------------------------------ eventos
/** Un solo oyente delegado en #view (que no se sustituye): no se duplica al repintar. */
export function initHistory() {
  const view = document.getElementById('view');
  if (!view) return;
  let clearArmed = false;
  view.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-hist]');
    if (!b || b.tagName === 'INPUT') return;
    const store = loadStore();
    const act = b.dataset.hist;
    if (act === 'ack') {
      store.seen = true; saveStore(store); state.historyFirst = false; api.render();
    } else if (act === 'off-now') {
      // «No guardar»: se apaga y se borra lo que acaba de guardarse.
      saveStore({ ...store, off: true, seen: true, entries: [] });
      state.historyId = null; state.historyFirst = false; api.render();
    } else if (act === 'delete') {
      store.entries = store.entries.filter((e) => e.id !== b.dataset.id);
      if (state.historyId === b.dataset.id) state.historyId = null;
      saveStore(store); api.render();
    } else if (act === 'clear') {
      // Dos pasos: el primer toque pide confirmación en el propio botón.
      if (!clearArmed) {
        clearArmed = true;
        b.textContent = L('¿Seguro? Toca otra vez para borrar todo', 'Sure? Tap again to delete everything');
        b.classList.add('is-armed');
        setTimeout(() => { clearArmed = false; }, 5000);
        return;
      }
      clearArmed = false;
      saveStore({ ...store, entries: [], labels: {} });
      state.historyId = null; api.render();
    }
  });
  view.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.matches && t.matches('[data-hist="toggle"]')) {
      const store = loadStore();
      store.off = !t.checked;
      store.seen = true;
      saveStore(store);
      api.render();
    } else if (t.matches && t.matches('[data-hist-label]')) {
      const store = loadStore();
      const v = t.value.trim().slice(0, 60);
      if (v) store.labels[t.dataset.histLabel] = v; else delete store.labels[t.dataset.histLabel];
      saveStore(store);
    }
  });
}

