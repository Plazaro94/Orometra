// Tema, idioma, prefs, policy preview, tabs, empty/legal/method.

import { DEFAULT_POLICY, gateFailures } from '../core/metrics.js';
import { enhanceRadioGroups } from './radiogroup.js';
import { t, L, getLocale, setLocale, applyStaticI18n, pctSign } from './i18n.js';
import { rebuildLocalizedCopy } from '../core/verdict.js';
import { state, api, $, $$, int, num, pct, esc } from './ui-state.js';
import { displayVerdictCopy, displayVerdictLevel, levelName, compactSummary, compactAction, refreshCompactCharts } from './ui-verdict.js';
import { COMPACT_QUERY } from './charts.js';

// ---------------------------------------------------------------- preferencias
export const PREFS_KEY = 'orometra.gates';

/** Los mínimos son una decisión del usuario: no debería repetirla cada sesión. */
export const THEME_KEY = 'orometra.theme';
export const TEMAS = ['dark', 'light'];

/**
 * Tema de color. Se aplica en `documentElement` porque el `<head>` ya lo lee antes de
 * pintar para evitar el fogonazo al recargar.
 */
export function setTheme(name, persist = true) {
  // Migración: crema se eliminó; quien lo tuviera guardado pasa a claro.
  const raw = name === 'cream' ? 'light' : name;
  const t = TEMAS.includes(raw) ? raw : 'dark';
  document.documentElement.dataset.theme = t;
  $$('[data-theme-set]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeSet === t)));
  if (persist) {
    try { localStorage.setItem(THEME_KEY, t); } catch { /* modo privado */ }
  }
  if (typeof window.__orometraSyncThemeColor === 'function') window.__orometraSyncThemeColor();
}

export function initChrome() {
  // Sin elección guardada, el tema del sistema, y se sigue si cambia (modo noche automático).
  const guardado = () => {
    try { return localStorage.getItem(THEME_KEY); } catch { return null; }
  };
  const systemLight = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;
  setTheme(guardado() || (systemLight && systemLight.matches ? 'light' : 'dark'), false);
  if (systemLight) {
    systemLight.addEventListener('change', (e) => { if (!guardado()) setTheme(e.matches ? 'light' : 'dark', false); });
  }
  $$('[data-theme-set]').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeSet)));

  syncLangButtons();
  $$('[data-lang-set]').forEach((b) => b.addEventListener('click', () => changeLanguage(b.dataset.langSet)));
  applyStaticI18n();
  enhanceRadioGroups();
  initTabsFade();
  trackHeadHeight();
  mountAppMenu();

  // La marca es un enlace a la landing; no conviene interceptarlo.
  const reiniciar = $('#resetAll');
  if (reiniciar) reiniciar.addEventListener('click', resetSession);
  // «Descargar .set» de la cabecera compacta: se enlaza una vez aquí, no en
  // bindViewEvents(), que repasa [data-export] en todo el documento en cada pintado.
  const topSet = $('#topSetBtn');
  if (topSet) topSet.addEventListener('click', () => api.doExport(topSet.dataset.kind, 0));

  // Gráficos SVG del veredicto: formato compacto en el móvil, normal en el resto.
  if (typeof matchMedia === 'function') {
    matchMedia(COMPACT_QUERY).addEventListener('change', () => {
      if (!state.analysis) return;
      refreshCompactCharts(state.analysis);
      markScrollableTables();
    });
  }

  // Redimensionar puede hacer que una tabla deje de necesitar scroll, o empiece a necesitarlo.
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(markScrollableTables, 150);
  });
}

export function resetSession() {
  if (!confirm(L(
    'Se va a descartar el análisis actual y los archivos cargados. ¿Seguro?',
    'This will discard the current analysis and loaded files. Continue?',
  ))) return;
  state.isFile = null; state.oosFile = null; state.isTable = null; state.oosTable = null;
  state.analysis = null; state.isDemo = false; state.report = null; state.historyId = null; state.historyFirst = false;
  state.searchSet = null; state.searchSetName = null;
  state.selectedPlateau = 0; state.selectedParam = 0;
  state.surfaceDimA = null; state.surfaceDimB = null;
  state.unseen = {
    plateauIndex: 0, values: {}, result: null, error: null, tradesAudit: null,
  };
  state.preflight = { is: null, oos: null };
  state.tab = 'verdict';
  api.updateDropStatus();
  const setStatus = $('#setStatus');
  if (setStatus) setStatus.textContent = '';
  $$('.dropzone').forEach((d) => d.classList.remove('ready', 'error'));
  { const el = $('#mainFile'); if (el) el.value = ''; }
  api.clearError();
  api.renderPreflight();
  api.refreshAnalyzeButton();
  // Sin análisis, el menú vuelve a como estaba al abrir la página.
  $$('.nav-item').forEach((b) => { b.disabled = !['verdict', 'method'].includes(b.dataset.tab); });
  { const ex = $('#exportBtn'); if (ex) ex.disabled = true; }
  document.body.classList.remove('intake-collapsed');
  render();
  // El título de la pestaña llevaba el nombre del archivo analizado.
  applyStaticI18n();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Menú del móvil, igual que el de la portada: ayuda, guías, inicio y el tema. */
function mountAppMenu() {
  const btn = $('.header-controls .lp-menu-btn');
  const panel = $('#appMenu');
  if (!btn || !panel) return;
  // El foco pasa al primer elemento solo si el menú se abrió con el teclado. Con un toque,
  // Safari del iPhone trata ese foco por script como de teclado y le dibuja el recuadro.
  const open = (viaKeyboard = false) => {
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    const first = panel.querySelector('a');
    if (first && viaKeyboard) first.focus();
  };
  const close = (focusBtn = false) => {
    if (panel.hidden) return;
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (focusBtn) btn.focus();
  };
  // detail === 0: el clic viene del teclado (Intro o Espacio), no de un toque o del ratón.
  btn.addEventListener('click', (e) => (panel.hidden ? open(e.detail === 0) : close()));
  // Ir al aviso legal es una pestaña de la propia app: el menú se cierra al elegirla.
  panel.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => close()));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(true); });
  document.addEventListener('click', (e) => { if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) close(); });
  window.matchMedia('(min-width:721px)').addEventListener('change', (e) => { if (e.matches) close(); });
}

export function syncLangButtons() {
  const lang = getLocale();
  $$('[data-lang-set]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.langSet === lang)));
}

export function changeLanguage(lang) {
  setLocale(lang);
  syncLangButtons();
  applyStaticI18n();
  api.updateDropStatus();
  updatePolicySummary();
  api.refreshAnalyzeButton();
  api.renderPreflight();
  // El veredicto se generó en el idioma del análisis: regenerar copy sin recalcular.
  if (state.analysis) {
    state.analysis = rebuildLocalizedCopy(state.analysis);
  }
  render();
}

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return;
    const g = JSON.parse(raw);
    if (Number.isFinite(g.pf)) $('#gPf').value = g.pf;
    if (Number.isFinite(g.dd)) $('#gDd').value = g.dd;
    if (Number.isFinite(g.trades)) $('#gTrades').value = g.trades;
    if (typeof g.profit === 'boolean') $('#gProfit').checked = g.profit;
  } catch {
    // Modo privado o almacenamiento lleno: se sigue con los valores por defecto.
  }
}

/** Resumen de una linea de los minimos, para el boton plegado "Ajustes (opcional)". */
export function updatePolicySummary() {
  const el = $('#policySummary');
  if (!el) return;
  const pf = parseFloat($('#gPf').value);
  const dd = parseFloat($('#gDd').value);
  const tr = parseFloat($('#gTrades').value);
  const parts = [];
  if (Number.isFinite(pf)) parts.push(`PF ≥ ${num(pf, 2)}`);
  if (Number.isFinite(dd)) parts.push(`DD ≤ ${num(dd, 0)}${pctSign()}`);
  if (Number.isFinite(tr)) parts.push(`${int(tr)} ${L('ops', 'trades')}`);
  el.textContent = parts.join(' · ');
}

export function togglePolicy(open) {
  const next = typeof open === 'boolean' ? open : !document.body.classList.contains('policy-open');
  document.body.classList.toggle('policy-open', next);
  const btn = $('#policyToggle');
  if (btn) btn.setAttribute('aria-expanded', String(next));
}

export function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      pf: parseFloat($('#gPf').value),
      dd: parseFloat($('#gDd').value),
      trades: parseFloat($('#gTrades').value),
      profit: $('#gProfit').checked,
    }));
  } catch {
    // Guardar preferencias nunca puede romper el análisis.
  }
}

// ---------------------------------------------------------------- análisis
export function readPolicy() {
  const pf = parseFloat($('#gPf').value);
  const dd = parseFloat($('#gDd').value);
  const tr = parseFloat($('#gTrades').value);
  return {
    ...DEFAULT_POLICY,
    gates: {
      ...DEFAULT_POLICY.gates,
      requireProfit: $('#gProfit').checked,
      minProfitFactor: Number.isFinite(pf) ? pf : DEFAULT_POLICY.gates.minProfitFactor,
      maxDrawdownPct: Number.isFinite(dd) ? dd : DEFAULT_POLICY.gates.maxDrawdownPct,
      minTrades: Number.isFinite(tr) ? tr : DEFAULT_POLICY.gates.minTrades,
    },
  };
}

/**
 * Vista previa del efecto de los mínimos, sin rehacer el análisis.
 *
 * Las puertas son una función pura de las métricas de cada fila, que ya están en
 * memoria: contar cuántas pasan es instantáneo. Lo caro es la topología (vecindad,
 * mesetas), y eso solo se rehace si el usuario lo pide. Así puede mover el umbral y ver
 * al momento si el resultado aguanta al apretar, que es la pregunta que todo el mundo se
 * hace y que hasta ahora exigía un análisis entero para responder.
 */
/** Texto del problema de los campos de minimos, o null si son validos. */
export function policyInputProblem() {
  const pf = parseFloat($('#gPf').value);
  const dd = parseFloat($('#gDd').value);
  const tr = parseFloat($('#gTrades').value);
  if (!Number.isFinite(pf) || pf < 0) return L('El factor de beneficio mínimo tiene que ser un número mayor o igual que 0.', 'The minimum profit factor must be a number greater than or equal to 0.');
  if (!Number.isFinite(dd) || dd <= 0 || dd > 100) return L('El drawdown máximo tiene que estar entre 1 y 100\u00A0%.', 'The maximum drawdown must be between 1 and 100%.');
  if (!Number.isFinite(tr) || tr < 0) return L('Las operaciones mínimas tienen que ser un número mayor o igual que 0.', 'The minimum trades must be a number greater than or equal to 0.');
  return null;
}

export function updatePolicyPreview() {
  const box = $('#policyPreview');
  if (!box) return;
  const a = state.analysis;
  if (!a || !a.records || !a.records.length) {
    box.hidden = true;
    return;
  }
  // Valores fuera de rango o vacios: readPolicy() los sustituiria en silencio por los de
  // por defecto y el analisis no corresponderia a lo que se ve en los campos.
  const problem = policyInputProblem();
  if (problem) {
    box.hidden = false;
    $('#policyPreviewCount').textContent = '—';
    $('#policyPreviewNote').textContent = problem;
    $('#policyRerun').disabled = true;
    return;
  }
  const policy = readPolicy();
  const minIs = policy.gates.minTrades;
  const minOos = a.meta.hasForward && Number.isFinite(a.meta.periodRatio)
    ? Math.max(30, policy.gates.minTrades * a.meta.periodRatio)
    : policy.gates.minTrades;
  let pass = 0;
  for (const r of a.records) {
    if (gateFailures(r.is, policy, minIs).length) continue;
    if (a.meta.hasForward && gateFailures(r.oos, policy, minOos).length) continue;
    pass++;
  }
  const total = a.records.length;
  const delta = pass - a.meta.gatePassCount;
  box.hidden = false;
  $('#policyPreviewCount').textContent = L(`${int(pass)} de ${int(total)}`, `${int(pass)} of ${int(total)}`);
  $('#policyPreviewNote').textContent = delta === 0
    ? L(
      `cumplirían estos mínimos en ${a.meta.hasForward ? 'los dos periodos' : 'el periodo optimizado'} (${pct(pass / total, 0)}), igual que el análisis actual`,
      `would meet these minimums in ${a.meta.hasForward ? 'both periods' : 'the optimized period'} (${pct(pass / total, 0)}), same as the current analysis`,
    )
    : L(
      `cumplirían estos mínimos en ${a.meta.hasForward ? 'los dos periodos' : 'el periodo optimizado'} (${pct(pass / total, 0)}), ${delta > 0 ? '+' : ''}${int(delta)} respecto al análisis actual`,
      `would meet these minimums in ${a.meta.hasForward ? 'both periods' : 'the optimized period'} (${pct(pass / total, 0)}), ${delta > 0 ? '+' : ''}${int(delta)} vs the current analysis`,
    );
  // Se compara la POLITICA, no el recuento: otros minimos con el mismo numero de
  // supervivientes (0 = 0) no dejaban recalcular y los campos no casaban con el informe.
  const used = a.meta.policy && a.meta.policy.gates;
  const g = policy.gates;
  const samePolicy = Boolean(used) && used.minProfitFactor === g.minProfitFactor && used.maxDrawdownPct === g.maxDrawdownPct
    && used.minTrades === g.minTrades && used.requireProfit === g.requireProfit;
  if (!samePolicy && delta === 0) {
    $('#policyPreviewNote').textContent += L(' · los mínimos han cambiado: recalcula para actualizar el informe', ' · the minimums changed: recalculate to update the report');
  }
  $('#policyRerun').disabled = state.busy || samePolicy;
}

// ---------------------------------------------------------------- navegacion
export const TAB_HASH = {
  verdict: 'veredicto', plateaus: 'mesetas', rejected: 'descartes', params: 'parametros',
  diagnostics: 'diagnostico', unseen: 'periodo-no-visto', method: 'metodologia',
  history: 'historial', legal: 'legal',
};
export const HASH_TAB = Object.fromEntries(Object.entries(TAB_HASH).map(([k, v]) => [v, k]));

export function setTab(tab, fromHash, { scroll = true } = {}) {
  state.tab = tab;
  // El ancla permite compartir "mira la pestaña de descartes" con un enlace, y que el
  // botón de atrás del navegador haga lo que se espera.
  if (!fromHash && TAB_HASH[tab] && location.hash !== '#' + TAB_HASH[tab]) {
    history.replaceState(null, '', '#' + TAB_HASH[tab]);
  }
  $$('.nav-item').forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  render();
  const status = $('#viewStatus');
  const current = document.querySelector(`.nav-item[data-tab="${tab}"] span:last-child`);
  if (status) status.textContent = current ? current.textContent : '';
  if (scroll) scrollToView();
  revealActiveTab();
}

const narrow = matchMedia('(max-width:720px)');

/**
 * Lleva al principio de la pestaña nueva si no se ve. Con scrollIntoView('nearest'), al
 * cambiar de pestaña desde el final de una larga se aterrizaba a media pestaña nueva
 * (en el móvil, 2.000 px por debajo de su título). En el móvil, las pestañas quedan fijas
 * arriba y el título tiene que caer justo debajo de ellas, no tapado.
 */
function scrollToView(target) {
  const view = target || $('#view');
  if (!view) return;
  const strip = $('.sidebar-scroll');
  // En escritorio, lo fijo arriba es la cabecera compacta del informe (si la hay).
  const bar = $('.topbar');
  const stuck = narrow.matches
    ? (strip ? strip.getBoundingClientRect().height : 0)
    : (document.body.classList.contains('compact-top') && bar ? bar.getBoundingClientRect().height : 0);
  const top = view.getBoundingClientRect().top;
  if (top >= stuck && top < window.innerHeight * 0.6) return;
  const quiet = matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: Math.max(0, window.scrollY + top - stuck - 12), behavior: quiet ? 'auto' : 'smooth' });
}

// Orden de lectura del informe: al final de cada pestaña, un enlace a la siguiente. En el
// móvil, las últimas pestañas quedan fuera de la tira y sin esto pasaban desapercibidas.
const REPORT_ORDER = ['verdict', 'plateaus', 'rejected', 'params', 'diagnostics', 'unseen'];
function renderNextTab(tab) {
  const i = REPORT_ORDER.indexOf(tab);
  if (i < 0 || i === REPORT_ORDER.length - 1) return '';
  const next = REPORT_ORDER[i + 1];
  const nameEl = document.querySelector(`.nav-item[data-tab="${next}"] span:last-child`);
  const name = nameEl ? nameEl.textContent.trim() : next;
  return `<nav class="tab-next" aria-label="${esc(L('Siguiente sección del informe', 'Next report section'))}">
    <button class="ghost-btn tab-next-btn" type="button" data-goto="${next}">${esc(L('Siguiente', 'Next'))}: ${esc(name)} <span aria-hidden="true">→</span></button>
  </nav>`;
}

/* Movil: las 7 pestanas no caben y 3 quedaban fuera sin ninguna pista. Un difuminado
 * en el borde por el que queda mas (data-more) invita a deslizar, y la pestana activa
 * se trae a la vista al cambiar. En ordenador la barra no desliza y no se marca nada. */
function updateTabsFade() {
  const strip = $('.sidebar-scroll');
  if (!strip) return;
  const max = strip.scrollWidth - strip.clientWidth;
  const left = strip.scrollLeft > 4;
  const right = max > 4 && strip.scrollLeft < max - 4;
  strip.dataset.more = left && right ? 'both' : left ? 'left' : right ? 'right' : '';
}
/* Móvil: lo que mide la fila de la marca, para que al bajar se vaya y solo queden fijas
 * las pestañas (ver .sidebar en styles.css). */
function trackHeadHeight() {
  const head = $('.sidebar-head');
  if (!head) return;
  const sync = () => document.documentElement.style.setProperty('--sidebar-head-h', `${head.offsetHeight}px`);
  sync();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(sync).observe(head);
  else window.addEventListener('resize', sync);
}

function initTabsFade() {
  const strip = $('.sidebar-scroll');
  if (!strip) return;
  strip.addEventListener('scroll', updateTabsFade, { passive: true });
  window.addEventListener('resize', updateTabsFade);
  updateTabsFade();
}
function revealActiveTab() {
  const strip = $('.sidebar-scroll');
  const active = $('.nav-item.active');
  if (!strip || !active || strip.scrollWidth <= strip.clientWidth) return;
  const s = strip.getBoundingClientRect();
  const r = active.getBoundingClientRect();
  if (r.left < s.left + 24) strip.scrollBy({ left: r.left - s.left - 24, behavior: 'smooth' });
  else if (r.right > s.right - 24) strip.scrollBy({ left: r.right - s.right + 24, behavior: 'smooth' });
}

export function render() {
  const hayAnalisis = Boolean(state.analysis);
  document.body.classList.toggle('has-analysis', hayAnalisis);
  const resetBtn = $('#resetAll');
  if (resetBtn) resetBtn.hidden = !hayAnalisis && !state.isFile;

  const idle = document.querySelector('.topbar-idle');
  const report = document.querySelector('.topbar-report');
  if (idle) idle.hidden = hayAnalisis;
  if (report) report.hidden = !hayAnalisis;
  if (hayAnalisis && state.analysis) {
    const rt = $('#reportTitle');
    if (rt) rt.textContent = displayVerdictCopy(state.analysis).headline;
    // El título de la pestaña del navegador sigue al nivel MOSTRADO en cada pintado: al
    // cargar el periodo no visto el nivel cambia, y antes el título se quedaba en el de
    // la primera vez. Dice el nivel en palabras («Evidencia moderada · …»).
    if (state.source) {
      document.title = `${L('Evidencia', 'Evidence')} ${levelName(displayVerdictLevel(state.analysis)).toLowerCase()} · ${state.source.is} · Orometra`;
    }
  }
  // Fuera del veredicto, la cabecera se reduce a una línea (nivel, pasada y «Descargar
  // .set») y en escritorio queda fija arriba: el titular completo ya se leyó en el veredicto.
  const compact = hayAnalisis && state.tab !== 'verdict';
  document.body.classList.toggle('compact-top', compact);
  const rc = $('#reportCompact');
  if (rc) {
    rc.hidden = !compact;
    rc.innerHTML = compact ? compactSummary(state.analysis) : '';
  }
  const topSet = $('#topSetBtn');
  if (topSet) {
    const act = compact ? compactAction(state.analysis) : null;
    topSet.hidden = !act;
    if (act) { topSet.textContent = act.label; topSet.dataset.kind = act.kind; }
  }

  const view = $('#view');
  // Metodologia y legal no necesitan analisis cargado: se pueden leer siempre.
  if (state.tab === 'method' || state.tab === 'legal' || state.tab === 'history') {
    api.disposePlateauSurface();
    view.innerHTML = state.tab === 'legal' ? renderLegal() : state.tab === 'history' ? api.renderHistoryView() : renderMethod();
    bindViewEvents();
    return;
  }
  if (!state.analysis) {
    api.disposePlateauSurface();
    view.innerHTML = renderEmpty();
    bindViewEvents();
    return;
  }
  const a = state.analysis;
  const map = {
    verdict: () => api.renderVerdict(a),
    plateaus: () => api.renderPlateaus(a),
    rejected: () => api.renderRejected(a),
    params: () => api.renderParams(a),
    diagnostics: () => api.renderDiagnostics(a),
    unseen: () => api.renderUnseen(a),
  };
  view.innerHTML = (map[state.tab] || map.verdict)() + renderNextTab(map[state.tab] ? state.tab : 'verdict');
  bindViewEvents();
  if (state.tab === 'plateaus') api.mountPlateauSurfaceView(a); else api.disposePlateauSurface();
}

let glossOutsideClickBound = false;
function ensureGlossOutsideClickListener() {
  if (glossOutsideClickBound) return;
  glossOutsideClickBound = true;
  document.addEventListener('click', (e) => {
    if (e.target.closest('.gloss')) return;
    $$('.gloss.gloss-open').forEach((o) => o.classList.remove('gloss-open'));
  });
}

/** El tooltip se abre a izquierda o derecha del termino segun donde caiga
 * en el layout (ver .gloss-right en styles.css); si aun asi se sale del
 * viewport (movil estrecho, o el termino cerca de un borde), se corrige
 * con un desplazamiento horizontal via --gloss-shift-x. */
/** Marca las tablas que se salen de su tarjeta con un difuminado en el borde
 * derecho: sin esto, una columna cortada en seco parece un texto roto en vez
 * de una tabla que se puede deslizar. */
function markScrollableTables() {
  $$('.table-wrap, .range-table-wrap, .chart-scroll').forEach((el) => {
    const scrolls = el.scrollWidth > el.clientWidth + 1;
    el.classList.toggle('has-hscroll', scrolls);
    // Si se desliza, tambien con teclado: sin foco no se puede recorrer con las flechas.
    if (scrolls) el.setAttribute('tabindex', '0');
    else el.removeAttribute('tabindex');
  });
}

function positionGlossCards() {
  const margin = 12;
  $$('.gloss').forEach((el) => {
    const card = el.querySelector('.gloss-card');
    if (!card) return;
    el.style.removeProperty('--gloss-shift-x');
    const rect = card.getBoundingClientRect();
    let shift = 0;
    if (rect.left < margin) shift = margin - rect.left;
    else if (rect.right > window.innerWidth - margin) shift = (window.innerWidth - margin) - rect.right;
    // En pantallas grandes la pagina lleva zoom (ver --z en styles.css): el rect viene en
    // pixeles de pantalla y el desplazamiento se aplica en pixeles de CSS, ya ampliados.
    const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    if (shift) el.style.setProperty('--gloss-shift-x', `${Math.round(shift / zoom)}px`);
  });
}

export function bindViewEvents() {
  $$('[data-goto]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.goto)));
  $$('[data-demo]').forEach((b) => b.addEventListener('click', () => { const d = $('#demoBtn'); if (d && !d.disabled) d.click(); }));
  $$('[data-scroll]').forEach((b) => b.addEventListener('click', () => {
    const target = document.getElementById(b.dataset.scroll);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  $$('.gloss').forEach((el) => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = el.classList.contains('gloss-open');
    $$('.gloss.gloss-open').forEach((o) => o.classList.remove('gloss-open'));
    if (!wasOpen) el.classList.add('gloss-open');
  }));
  ensureGlossOutsideClickListener();
  positionGlossCards();
  markScrollableTables();
  $$('[data-plateau]').forEach((b) => b.addEventListener('click', () => {
    state.selectedPlateau = Number(b.dataset.plateau);
    setTab('plateaus');
  }));
  const paramSel = $('#paramSelect');
  if (paramSel) {
    paramSel.addEventListener('change', () => {
      state.selectedParam = Number(paramSel.value);
      render();
    });
  }
  const surfaceA = $('#surfaceDimA');
  if (surfaceA) surfaceA.addEventListener('change', () => { state.surfaceDimA = Number(surfaceA.value); render(); });
  const surfaceB = $('#surfaceDimB');
  if (surfaceB) surfaceB.addEventListener('change', () => { state.surfaceDimB = Number(surfaceB.value); render(); });
  const unseenSel = $('#unseenPlateau');
  if (unseenSel) unseenSel.addEventListener('change', () => {
    state.unseen.plateauIndex = Number(unseenSel.value);
    state.unseen.values = api.readUnseenForm();
    state.unseen.result = null;
    render();
  });
  $$('[data-unseen]').forEach((el) => el.addEventListener('input', () => {
    state.unseen.values[el.dataset.unseen] = el.value;
  }));
  const reportClear = $('#reportClear');
  if (reportClear) reportClear.addEventListener('click', () => {
    state.report = null;
    state.unseen.values = {};
    state.unseen.result = null;
    state.unseen.tradesAudit = null;
    render();
  });
  const unseenBtn = $('#unseenCheck');
  // El resultado va encima del formulario: al comparar a mano, se lleva la vista hasta él.
  if (unseenBtn) unseenBtn.addEventListener('click', () => { api.runUnseenCheck(); scrollToView($('.u-result')); });
  const unseenClear = $('#unseenClear');
  if (unseenClear) unseenClear.addEventListener('click', () => {
    state.unseen = {
      plateauIndex: state.unseen.plateauIndex, values: {}, result: null, error: null, tradesAudit: state.unseen.tradesAudit,
    };
    render();
  });
  $$('[data-copy]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    api.copyParams(Number(b.dataset.copy), b);
  }));
  $$('[data-export]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const idx = b.dataset.plateauIndex;
    api.doExport(b.dataset.export, idx === undefined ? undefined : Number(idx));
  }));
}

// ---------------------------------------------------------------- vistas
/**
 * Pantalla antes de subir nada. Antes repetia la portada (superficie 3D, titular y
 * tres pasos); quien llega aqui ya se ha convencido y solo necesita saber de donde
 * sacar los archivos, o ver un ejemplo si aun no los tiene.
 */
export function renderEmpty() {
  return `<div class="empty-state">
    <h2>${esc(t('empty.h2'))}</h2>
    <ol class="empty-steps">
      <li><span aria-hidden="true">1</span><p>${t('empty.s1')}</p></li>
      <li><span aria-hidden="true">2</span><p>${t('empty.s2')}</p></li>
      <li><span aria-hidden="true">3</span><p>${t('empty.s3')}</p></li>
    </ol>
    <p class="empty-demo">${esc(t('empty.demo'))} <button class="text-btn" type="button" data-demo>${esc(t('empty.demoBtn'))}</button></p>
  </div>`;
}

/**
 * Textos legales.
 *
 * No van en la navegacion numerada porque no forman parte del analisis: se llega a
 * ellos desde el pie de la barra lateral, como en cualquier producto serio.
 *
 * AVISO: son borradores redactados con cuidado, no asesoramiento juridico. Antes de
 * cobrar un euro tienen que pasar por un gestor. En particular, el dia que haya
 * dimension economica -cobro, publicidad, recogida de correos- la LSSI obliga a
 * anadir nombre o razon social, NIF y domicilio, que hoy no hacen falta.
 */
export function renderLegal() {
  return `<div class="detail-head">
      <div class="detail-kicker">${L('Legal', 'Legal')}</div>
      <h2>${L('Condiciones, privacidad y descargo', 'Terms, privacy and disclaimer')}</h2>
      <p>${L(
        'Lee esto antes de tomar cualquier decisión con lo que te diga esta herramienta.',
        'Read this before making any decision based on what this tool tells you.',
      )}</p>
    </div>

    <section class="panel legal-panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Lo más importante', 'Most important')}</div><h2>${L('Esto no es asesoramiento financiero', 'This is not financial advice')}</h2></div></div>
      <p class="panel-intro">
        ${L(
          `Orometra es una <strong>herramienta de análisis estadístico</strong> que examina datos históricos que tú
        le proporcionas. No es un asesor financiero, no es un servicio de inversión, no gestiona dinero y no
        recomienda operar.`,
          `Orometra is a <strong>statistical analysis tool</strong> that examines historical data you
        provide. It is not a financial adviser, not an investment service, does not manage money and does not
        recommend trading.`,
        )}
      </p>
      <ul class="limits">
        <li>${L(
          `<strong>Un veredicto favorable no es una recomendación de compra ni de venta.</strong> Significa
        únicamente que la configuración ha superado unos contrastes estadísticos sobre datos pasados. Nada más.`,
          `<strong>A favorable verdict is not a buy or sell recommendation.</strong> It only means
        the configuration passed some statistical tests on past data. Nothing more.`,
        )}</li>
        <li>${L(
          `<strong>Los resultados de un backtest no predicen resultados futuros.</strong> Esta frase se repite
        tanto que ha perdido fuerza, así que conviene decirla con precisión: todo lo que mide esta aplicación
        ocurrió en el pasado, y el mercado no tiene ninguna obligación de repetirse.`,
          `<strong>Backtest results do not predict future results.</strong> That sentence is repeated
        so often it has lost force, so it is worth saying precisely: everything this app measures
        happened in the past, and the market has no obligation to repeat itself.`,
        )}</li>
        <li>${L(
          `<strong>La calidad de la salida depende por completo de la calidad de tus datos.</strong> Si tu
        backtest usó un histórico pobre, un spread irreal o no contó las comisiones, el análisis heredará
        esos defectos sin poder detectarlos.`,
          `<strong>Output quality depends entirely on your data quality.</strong> If your
        backtest used a poor history, an unrealistic spread or ignored commissions, the analysis will inherit
        those defects without being able to detect them.`,
        )}</li>
        <li>${L(
          `<strong>Operar con apalancamiento puede hacerte perder más de lo que inviertes.</strong> La
        responsabilidad de cualquier decisión que tomes es enteramente tuya.`,
          `<strong>Trading with leverage can make you lose more than you invest.</strong>
        Responsibility for any decision you make is entirely yours.`,
        )}</li>
        <li>${L(
          `La herramienta se ofrece <strong>tal cual</strong>, sin garantía de disponibilidad, de exactitud
        ni de adecuación a ningún propósito concreto.`,
          `The tool is offered <strong>as is</strong>, with no warranty of availability, accuracy
        or fitness for any particular purpose.`,
        )}</li>
              <li>${L(
          'Orometra no está afiliado a MetaQuotes. MetaTrader y MQL5 son marcas de MetaQuotes Ltd.',
          'Orometra is not affiliated with MetaQuotes. MetaTrader and MQL5 are trademarks of MetaQuotes Ltd.',
        )}</li>
      </ul>
    </section>

    <section class="panel legal-panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Privacidad', 'Privacy')}</div><h2>${L('Tus archivos no salen de tu ordenador', 'Your files never leave your computer')}</h2></div></div>
      <p class="panel-intro">
        ${L(
          `No es una promesa de intenciones: es cómo está construida. Todo el análisis se ejecuta en el
        JavaScript de tu navegador. <strong>No hay servidor que reciba tus datos porque no hay servidor.</strong>`,
          `This is not a promise of intent: it is how it is built. The entire analysis runs in your
        browser's JavaScript. <strong>There is no server that receives your data because there is no server.</strong>`,
        )}
      </p>
      <ul class="limits">
        <li>${L(
          `<strong>No se sube ningún archivo.</strong> Los <code>.xml</code> de tu optimización y el informe
        HTML de tu backtest se leen en memoria y se descartan al cerrar la pestaña.`,
          `<strong>No file is uploaded.</strong> Your optimization <code>.xml</code> files and the
        HTML backtest report are read in memory and discarded when you close the tab.`,
        )}</li>
        <li>${L(
          `<strong>No hay cuentas ni registro.</strong> En esta app usamos solo GoatCounter, servido desde el propio
        orometra.com, para contar visitas y cuántas veces se usa cada función (por ejemplo, «se hizo un análisis» o
        «se descargó un .set»): sin cookies y sin nada de tus archivos, solo el nombre del evento. Nada de lo que
        medimos se puede relacionar con lo que analizas.`,
          `<strong>There are no accounts, no signup.</strong> In this app we only use GoatCounter, served from
        orometra.com itself, to count visits and how often each feature is used (for example, “an analysis was
        run” or “a .set was downloaded”): no cookies and nothing from your files, only the event name. Nothing we
        measure can be tied to what you analyze.`,
        )}</li>
        <li>${L(
          `<strong>Se guardan cuatro cosas en tu propio navegador</strong> (almacenamiento local, nunca enviado a
        nadie): el tema de color, el idioma, los mínimos que configures, para no tener que repetirlos, y el historial
        de análisis (un resumen de cada uno, nunca tus archivos), que puedes desactivar o borrar en la pestaña
        Historial. Puedes borrarlo todo vaciando los datos del sitio.`,
          `<strong>Four things are stored in your own browser</strong> (local storage, never sent to
        anyone): the color theme, the language, the minimums you set, so you do not have to repeat them, and the
        analysis history (a summary of each one, never your files), which you can turn off or delete in the History
        tab. You can clear everything by wiping the site data.`,
        )}</li>
        <li>${L(
          `<strong>Lo que no podemos evitar:</strong> el proveedor que aloja la página y el servicio de
        analítica reciben, como en cualquier web, tu dirección IP y los datos básicos del navegador. No está
        relacionado con el contenido de tus archivos. Responsable: Pol Lázaro
        (<a href="mailto:hello@orometra.com">hello@orometra.com</a>). Tus derechos y el detalle, en la
        <a href="../privacy/">página de privacidad</a>.`,
          `<strong>What we cannot avoid:</strong> the provider that hosts the page and the analytics service
        receive, as on any website, your IP address and basic browser data. That is unrelated to the content of
        your files. Controller: Pol Lázaro (<a href="mailto:hello@orometra.com">hello@orometra.com</a>). Your
        rights and the details are on the <a href="../privacy/">privacy page</a>.`,
        )}</li>
      </ul>
    </section>

    <section class="panel legal-panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Condiciones de uso', 'Terms of use')}</div><h2>${L('Qué puedes esperar', 'What you can expect')}</h2></div></div>
      <ul class="limits">
        <li>${L(
          `El uso no requiere registro. No se garantiza que la página esté siempre disponible ni que
        se mantenga indefinidamente.`,
          `Use requires no signup. There is no guarantee the page will always be available or
        maintained indefinitely.`,
        )}</li>
        <li>${L(
          'Puedes usar los resultados libremente, incluso con fines comerciales, bajo tu responsabilidad.',
          'You may use the results freely, including commercially, under your own responsibility.',
        )}</li>
        <li>${L(
          `El código de la aplicación y su metodología son propiedad de su autor, publicados bajo licencia
        <a href="https://polyformproject.org/licenses/noncommercial/1.0.0/" target="_blank" rel="noopener">PolyForm Noncommercial</a>:
        puedes verlo, usarlo y modificarlo para fines no comerciales; el uso comercial del código en sí
        necesita permiso.`,
          `The application code and its methodology are the property of its author, published under the
        <a href="https://polyformproject.org/licenses/noncommercial/1.0.0/" target="_blank" rel="noopener">PolyForm Noncommercial</a>
        license: you may view, use and modify it for noncommercial purposes; commercial use of the code
        itself needs permission.`,
        )}</li>
        <li>${L(
          `Si encuentras un error en los cálculos, comunícalo a <a href="mailto:hello@orometra.com">hello@orometra.com</a>: un fallo en
        una herramienta como esta puede costarle dinero a alguien, y eso importa más que cualquier otra consideración.`,
          `If you find an error in the calculations, report it to <a href="mailto:hello@orometra.com">hello@orometra.com</a>: a bug in a
        tool like this can cost someone money, and that matters more than any other consideration.`,
        )}</li>
      </ul>
      <p class="chart-note">
        ${L(
          `Estos textos son borradores cuidados, no asesoramiento jurídico. Si algún día esta herramienta pasa a
        tener dimensión económica —cobro, publicidad o recogida de datos de contacto— la normativa española
        exigirá además identificar al titular con nombre, NIF y domicilio, y estos textos tendrán que
        revisarse con un profesional.`,
          `These texts are careful drafts, not legal advice. If someday this tool acquires an
        economic dimension — charging, advertising or collecting contact data — Spanish regulations
        will also require identifying the owner with name, tax ID and address, and these texts will need
        review by a professional.`,
        )}
      </p>
    </section>`;
}

// Mismos pasos, numeracion y limites que la pagina publica /methodology/, leidos de las
// mismas claves de i18n: antes la app tenia su propia lista de 8 pasos y la pagina otra,
// y dos versiones del metodo acaban contradiciendose.
const METHOD_STEPS = ['lectura', 'minimos', 'calidad', 'mesetas', 'forward', 'suerte', 'umbrales', 'niveles', 'backtest'];
// Tantos límites como claves doc.method.lim.N haya: con un número fijo, al añadir dos
// límites a la página pública la app siguió enseñando solo los seis primeros.
const methodLimits = () => {
  const out = [];
  for (let i = 1; t(`doc.method.lim.${i}`) !== `doc.method.lim.${i}`; i++) out.push(t(`doc.method.lim.${i}`));
  return out;
};
// La pagina publica tiene una version por idioma (/methodology/ y /es/methodology/).
const methodologyHref = () => (getLocale() === 'es' ? '../es/methodology/' : '../methodology/');

export function renderMethod() {
  return `<div class="detail-head">
      
      <h2>${esc(t('doc.method.h1'))}</h2>
      <p>${esc(t('doc.method.app.lead'))}</p>
    </div>
    <section class="panel">
      <ol class="method-list">
        ${METHOD_STEPS.map((id, i) => `<li>
          <span class="method-num">${String(i + 1).padStart(2, '0')}</span>
          <div><h3>${esc(t(`doc.method.s${i + 1}.title`))}</h3><p>${esc(t(`doc.method.s${i + 1}.short`))}</p></div>
          <a class="text-btn method-more" href="${methodologyHref()}#${id}">${L('Leer', 'Read')} &rarr;<span class="sr-only"> ${esc(t(`doc.method.s${i + 1}.title`))}</span></a>
        </li>`).join('')}
      </ol>
      <p class="method-full"><a href="${methodologyHref()}">${esc(t('doc.method.app.full'))}</a></p>
    </section>
    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Límites', 'Limits')}</div><h2>${esc(t('doc.method.lim.title'))}</h2></div></div>
      <ul class="limits">
        ${methodLimits().map((x) => `<li>${esc(x)}</li>`).join('')}
      </ul>
    </section>`;
}
