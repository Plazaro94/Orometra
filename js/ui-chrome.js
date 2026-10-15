// Tema, idioma, prefs, policy preview, tabs, empty/method.

import { DEFAULT_POLICY, gateFailures } from '../core/metrics.js';
import { enhanceRadioGroups } from './radiogroup.js';
import { t, L, getLocale, setLocale, applyStaticI18n, pctSign } from './i18n.js';
import { rebuildLocalizedCopy } from '../core/verdict.js';
import { state, api, $, $$, int, num, pct, esc } from './ui-state.js';
import { displayVerdictCopy, displayVerdictLevel, levelName, compactSummary, compactAction, refreshCompactCharts, answerLine } from './ui-verdict.js';
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
  state.analyzedFrom = null; state.pendingDrop = null; state.analysisRejected = null;
  state.selectedPlateau = 0; state.selectedParam = 0;
  state.surfaceDimA = null; state.surfaceDimB = null;
  state.unseenTries = [];
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
  // Lo que se abre en otra pestaña (privacidad) no saca de la app: al volver, el menú ya
  // no debe seguir abierto.
  panel.querySelectorAll('a[target="_blank"]').forEach((b) => b.addEventListener('click', () => close()));
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

/**
 * Los campos de mínimos son de texto (inputmode decimal): un <input type=number> convertía
 * «1,5» en 15 en algunos navegadores, y el teclado del móvil en español escribe coma.
 * Factor de beneficio y drawdown admiten coma o punto decimal; las operaciones, separador
 * de miles («1.000»).
 */
export function decimalField(sel) {
  const raw = String(($(sel) && $(sel).value) || '').trim().replace(/\s/g, '').replace(',', '.');
  return raw === '' || !/^-?\d*\.?\d+$/.test(raw) ? NaN : Number(raw);
}
export function integerField(sel) {
  let raw = String(($(sel) && $(sel).value) || '').trim().replace(/\s/g, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) raw = raw.replace(/[.,]/g, '');
  raw = raw.replace(',', '.');
  return raw === '' || !/^-?\d*\.?\d+$/.test(raw) ? NaN : Number(raw);
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
  const pf = decimalField('#gPf');
  const dd = decimalField('#gDd');
  const tr = integerField('#gTrades');
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
      pf: decimalField('#gPf'),
      dd: decimalField('#gDd'),
      trades: integerField('#gTrades'),
      profit: $('#gProfit').checked,
    }));
  } catch {
    // Guardar preferencias nunca puede romper el análisis.
  }
}

// ---------------------------------------------------------------- análisis
export function readPolicy() {
  const pf = decimalField('#gPf');
  const dd = decimalField('#gDd');
  const tr = integerField('#gTrades');
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
/** El primer campo de mínimos no válido: { sel, text }, o null. */
function policyCheck() {
  const pf = decimalField('#gPf');
  const dd = decimalField('#gDd');
  const tr = integerField('#gTrades');
  if (!Number.isFinite(pf) || pf < 0) return { sel: '#gPf', text: L('El factor de beneficio mínimo tiene que ser un número mayor o igual que 0 (por ejemplo, 1,2).', 'The minimum profit factor must be a number greater than or equal to 0 (for example, 1.2).') };
  if (!Number.isFinite(dd) || dd <= 0 || dd > 100) return { sel: '#gDd', text: L('El drawdown máximo tiene que ser mayor que 0 y como mucho 100\u00A0%.', 'The maximum drawdown must be greater than 0 and at most 100%.') };
  if (!Number.isFinite(tr) || tr < 0) return { sel: '#gTrades', text: L('Las operaciones mínimas tienen que ser un número mayor o igual que 0.', 'The minimum trades must be a number greater than or equal to 0.') };
  return null;
}

/** Texto del problema de los campos de minimos, o null si son validos. */
export function policyInputProblem() {
  const c = policyCheck();
  return c ? c.text : null;
}

/** El campo que hay que corregir, para enfocarlo (ui-audit.js). */
export function policyInputField() {
  const c = policyCheck();
  return c ? $(c.sel) : null;
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
  history: 'historial',
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
    // El titular es una frase que contesta («Tu optimización tiene una zona estable…»); el
    // nivel («Evidencia sólida») queda encima, como etiqueta.
    const rt = $('#reportTitle');
    if (rt) rt.textContent = answerLine(state.analysis);
    const eb = $('#reportEyebrow');
    if (eb) eb.textContent = displayVerdictCopy(state.analysis).headline;
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
  // Metodologia e historial no necesitan analisis cargado: se pueden leer siempre. Son
  // paginas propias, asi que no llevan encima la cabecera ni la carga de archivos.
  const pageView = state.tab === 'method' || state.tab === 'history';
  document.body.classList.toggle('page-view', pageView);
  if (pageView) {
    api.disposePlateauSurface();
    view.innerHTML = state.tab === 'history' ? api.renderHistoryView() : renderMethod();
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
  $$('[data-demo]').forEach((b) => b.addEventListener('click', () => { if (api.loadDemo) api.loadDemo(b.dataset.demo || 'good'); }));
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
    api.updateDropStatus();
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
      <li><span aria-hidden="true">4</span><p>${t('empty.s4')}</p></li>
    </ol>
    <p class="empty-demo">${esc(t('empty.demo'))} <button class="text-btn" type="button" data-demo="noedge">${esc(t('empty.demoNoEdge'))}</button></p>
  </div>`;
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
// La pagina publica tiene una version por idioma (/methodology/ y /es/methodology/). Se abre
// en otra pestana, como todas las paginas desde la app: salir perderia el analisis cargado.
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
          <a class="text-btn method-more" href="${methodologyHref()}#${id}" target="_blank" rel="noopener">${L('Leer', 'Read')} &rarr;<span class="sr-only"> ${esc(t(`doc.method.s${i + 1}.title`))}</span></a>
        </li>`).join('')}
      </ol>
      <p class="method-full"><a href="${methodologyHref()}" target="_blank" rel="noopener">${esc(t('doc.method.app.full'))}</a></p>
    </section>
    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Límites', 'Limits')}</div><h2>${esc(t('doc.method.lim.title'))}</h2></div></div>
      <ul class="limits">
        ${methodLimits().map((x) => `<li>${esc(x)}</li>`).join('')}
      </ul>
    </section>`;
}
