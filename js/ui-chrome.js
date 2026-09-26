// Tema, idioma, prefs, policy preview, tabs, empty/legal/method.

import { DEFAULT_POLICY, gateFailures } from '../core/metrics.js';
import { mountBrandMark } from './brandmark.js';
import { mountHeroSurface } from './hero-surface.js';
import { t, L, getLocale, setLocale, applyStaticI18n } from './i18n.js';
import { rebuildLocalizedCopy } from '../core/verdict.js';
import { state, api, $, $$, int, pct, esc } from './ui-state.js';

// ---------------------------------------------------------------- preferencias
export const PREFS_KEY = 'orometra.gates';

/** Los mínimos son una decisión del usuario: no debería repetirla cada sesión. */
export const THEME_KEY = 'orometra.theme';
export const TEMAS = ['dark', 'light'];
export let repaintMark = () => {};
export let emptySurface = null;

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
  // La figura de la marca se dibuja con los colores del tema: hay que repintarla.
  repaintMark();
}

export function initChrome() {
  const guardado = (() => {
    try { return localStorage.getItem(THEME_KEY); } catch { return null; }
  })();
  setTheme(guardado || 'dark', false);
  $$('[data-theme-set]').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeSet)));

  syncLangButtons();
  $$('[data-lang-set]').forEach((b) => b.addEventListener('click', () => changeLanguage(b.dataset.langSet)));
  applyStaticI18n();

  const mark = $('#brandMark');
  if (mark) repaintMark = mountBrandMark(mark);

  // La marca es un enlace a la landing; no conviene interceptarlo.
  const reiniciar = $('#resetAll');
  if (reiniciar) reiniciar.addEventListener('click', resetSession);
}

export function resetSession() {
  if (!confirm(L(
    'Se va a descartar el análisis actual y los archivos cargados. ¿Seguro?',
    'This will discard the current analysis and loaded files. Continue?',
  ))) return;
  state.isFile = null; state.oosFile = null; state.isTable = null; state.oosTable = null;
  state.analysis = null; state.isDemo = false; state.report = null;
  state.searchSet = null; state.searchSetName = null;
  state.selectedPlateau = 0; state.selectedParam = 0;
  state.surfaceDimA = null; state.surfaceDimB = null;
  state.unseen = {
    plateauIndex: 0, values: {}, result: null, error: null, tradesAudit: null,
  };
  state.preflight = { is: null, oos: null };
  state.tab = 'verdict';
  for (const [sel, key] of [['#isStatus', 'drop.is.status'], ['#oosStatus', 'drop.oos.status']]) {
    const el = $(sel); if (el) el.textContent = t(key);
  }
  const setStatus = $('#setStatus');
  if (setStatus) setStatus.textContent = '';
  $$('.dropzone').forEach((d) => d.classList.remove('ready', 'error'));
  ['#isFile', '#oosFile'].forEach((sel) => { const el = $(sel); if (el) el.value = ''; });
  api.clearError();
  api.renderPreflight();
  api.refreshAnalyzeButton();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function syncLangButtons() {
  const lang = getLocale();
  $$('[data-lang-set]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.langSet === lang)));
}

export function changeLanguage(lang) {
  setLocale(lang);
  syncLangButtons();
  applyStaticI18n();
  api.refreshAnalyzeButton();
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
export function updatePolicyPreview() {
  const box = $('#policyPreview');
  if (!box) return;
  const a = state.analysis;
  if (!a || !a.records || !a.records.length) {
    box.hidden = true;
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
      `superarían estos mínimos (${pct(pass / total, 0)}), igual que el análisis actual`,
      `would pass these minima (${pct(pass / total, 0)}), same as the current analysis`,
    )
    : L(
      `superarían estos mínimos (${pct(pass / total, 0)}), ${delta > 0 ? '+' : ''}${int(delta)} respecto al análisis actual`,
      `would pass these minima (${pct(pass / total, 0)}), ${delta > 0 ? '+' : ''}${int(delta)} vs the current analysis`,
    );
  $('#policyRerun').disabled = state.busy || delta === 0;
}

// ---------------------------------------------------------------- navegacion
export const TAB_HASH = {
  verdict: 'veredicto', plateaus: 'mesetas', rejected: 'descartes', params: 'parametros',
  diagnostics: 'diagnostico', unseen: 'periodo-no-visto', method: 'metodologia',
  legal: 'legal',
};
export const HASH_TAB = Object.fromEntries(Object.entries(TAB_HASH).map(([k, v]) => [v, k]));

export function setTab(tab, fromHash) {
  state.tab = tab;
  // El ancla permite compartir "mira la pestaña de descartes" con un enlace, y que el
  // botón de atrás del navegador haga lo que se espera.
  if (!fromHash && TAB_HASH[tab] && location.hash !== '#' + TAB_HASH[tab]) {
    history.replaceState(null, '', '#' + TAB_HASH[tab]);
  }
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  render();
  $('#view').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    const rm = $('#reportMeta');
    if (rt) rt.textContent = state.analysis.verdict.headline;
    if (rm && state.source) {
      const parts = [state.source.is];
      if (state.source.oos) parts.push(state.source.oos);
      parts.push(`${int(state.analysis.meta.total)} ${L('configs', 'configs')}`);
      rm.textContent = parts.join(' · ');
    }
  }

  const view = $('#view');
  // Metodologia y legal no necesitan analisis cargado: se pueden leer siempre.
  if (state.tab === 'method' || state.tab === 'legal') {
    disposeEmptySurface();
    api.disposePlateauSurface();
    view.innerHTML = state.tab === 'legal' ? renderLegal() : renderMethod();
    bindViewEvents();
    return;
  }
  if (!state.analysis) {
    api.disposePlateauSurface();
    view.innerHTML = renderEmpty();
    bindViewEvents();
    mountEmptySurface();
    return;
  }
  disposeEmptySurface();
  const a = state.analysis;
  const map = {
    verdict: () => api.renderVerdict(a),
    plateaus: () => api.renderPlateaus(a),
    rejected: () => api.renderRejected(a),
    params: () => api.renderParams(a),
    diagnostics: () => api.renderDiagnostics(a),
    unseen: () => api.renderUnseen(a),
  };
  view.innerHTML = (map[state.tab] || map.verdict)();
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
    if (shift) el.style.setProperty('--gloss-shift-x', `${Math.round(shift)}px`);
  });
}

export function bindViewEvents() {
  $$('[data-goto]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.goto)));
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
  if (unseenBtn) unseenBtn.addEventListener('click', () => api.runUnseenCheck());
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

export function disposeEmptySurface() {
  if (emptySurface && typeof emptySurface.dispose === 'function') emptySurface.dispose();
  emptySurface = null;
}

export function mountEmptySurface() {
  disposeEmptySurface();
  const canvas = $('#emptySurface');
  if (!canvas) return;
  emptySurface = mountHeroSurface(canvas);
}

// ---------------------------------------------------------------- vistas
export function renderEmpty() {
  return `<div class="empty-state">
    <div class="lp-surface empty-surface" tabindex="0" role="img" aria-label="${esc(L('Superficie de parámetros: los picos caen y queda la meseta', 'Parameter surface: peaks collapse into the plateau'))}">
      <canvas class="lp-surface-canvas" id="emptySurface" width="720" height="360" aria-hidden="true"></canvas>
      <div class="lp-surface-caption">
        <span class="lp-surface-peak">${esc(L('Pico aislado', 'Isolated peak'))}</span>
        <span class="lp-surface-hint">${esc(
          (typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches)
            ? L('Pasa el ratón — los picos caen y queda la meseta', 'Hover — peaks collapse into the plateau')
            : L('Mira — los picos caen y queda la meseta', 'Watch — peaks fall and the plateau remains')
        )}</span>
        <span class="lp-surface-ok">${esc(L('Meseta estable', 'Stable plateau'))}</span>
      </div>
    </div>
    <h2>${esc(t('empty.h2'))}</h2>
    <p>${esc(t('empty.p'))}</p>
    <div class="empty-steps">
      <div><span>01</span><p>${t('empty.s1')}</p></div>
      <div><span>02</span><p>${t('empty.s2')}</p></div>
      <div><span>03</span><p>${esc(t('empty.s3'))}</p></div>
    </div>
    <button class="text-btn" data-goto="method">${esc(t('empty.method'))}</button>
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
        'Read this before making any decision from what this tool tells you.',
      )}</p>
    </div>

    <section class="panel legal-panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Lo más importante', 'The most important')}</div><h2>${L('Esto no es asesoramiento financiero', 'This is not financial advice')}</h2></div></div>
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
        the configuration passed some statistical contrasts on past data. Nothing more.`,
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
          `<strong>No hay cuentas, ni registro, ni cookies, ni analítica.</strong> No sabemos quién eres ni
        cuántas veces la usas.`,
          `<strong>There are no accounts, no signup, no cookies, no analytics.</strong> We do not know who you are or
        how often you use it.`,
        )}</li>
        <li>${L(
          `<strong>Se guardan dos cosas en tu propio navegador</strong> (almacenamiento local, nunca enviado a
        nadie): el tema de color que elijas y los mínimos que configures, para no tener que repetirlos. Puedes
        borrarlos vaciando los datos del sitio.`,
          `<strong>Two things are stored in your own browser</strong> (local storage, never sent to
        anyone): the color theme you choose and the minima you set, so you do not have to repeat them. You can
        clear them by wiping the site data.`,
        )}</li>
        <li>${L(
          `<strong>Lo único que no controlamos:</strong> el proveedor que aloja la página registra, como
        cualquier servidor web, las peticiones que recibe (dirección IP, fecha, navegador). Es inevitable al
        servir una página y no está relacionado con el contenido de tus archivos.`,
          `<strong>The only thing we do not control:</strong> the provider that hosts the page logs, like
        any web server, the requests it receives (IP address, date, browser). That is inevitable when
        serving a page and is unrelated to the content of your files.`,
        )}</li>
      </ul>
    </section>

    <section class="panel legal-panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Condiciones de uso', 'Terms of use')}</div><h2>${L('Qué puedes esperar', 'What you can expect')}</h2></div></div>
      <ul class="limits">
        <li>${L(
          `El uso es gratuito y sin registro. No se garantiza que la página esté siempre disponible ni que
        se mantenga indefinidamente.`,
          `Use is free and without signup. There is no guarantee the page will always be available or
        maintained indefinitely.`,
        )}</li>
        <li>${L(
          'Puedes usar los resultados libremente, incluso con fines comerciales, bajo tu responsabilidad.',
          'You may use the results freely, including commercially, under your own responsibility.',
        )}</li>
        <li>${L(
          'El código de la aplicación y su metodología son propiedad de su autor.',
          'The application code and its methodology are the property of its author.',
        )}</li>
        <li>${L(
          `Si encuentras un error en los cálculos, comunícalo: un fallo en una herramienta como esta puede
        costarle dinero a alguien, y eso importa más que cualquier otra consideración.`,
          `If you find an error in the calculations, report it: a bug in a tool like this can
        cost someone money, and that matters more than any other consideration.`,
        )}</li>
      </ul>
      <p class="chart-note">
        ${L(
          `Estos textos son borradores cuidados, no asesoramiento jurídico. Si algún día esta herramienta pasa a
        tener dimensión económica -cobro, publicidad o recogida de datos de contacto- la normativa española
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

export function renderMethod() {
  const steps = [
    ['01', L('Lectura del export', 'Reading the export'),
      L('Lee el XML Spreadsheet de MT5 (.xml/.xls), con formatos numéricos regionales, y avisa de cada fila descartada.',
        'Reads MT5’s XML Spreadsheet (.xml/.xls), with regional number formats, and reports every dropped row.')],
    ['02', L('Parámetro vs métrica', 'Parameter vs metric'),
      L('No se fía del nombre de columna. Misma Pass → un parámetro coincide en IS y forward; una métrica no.',
        'It does not trust column names. Same Pass → a parameter matches in IS and forward; a metric does not.')],
    ['03', L('Calidad sin Result', 'Quality without Result'),
      L('Result es tu criterio de optimización y está sesgado. La calidad se reconstruye con PF, recuperación, Sharpe, drawdown y operaciones. Puntuación = el peor de IS y forward.',
        'Result is your optimization criterion and is biased. Quality is rebuilt from PF, recovery, Sharpe, drawdown and trades. Score = the worse of IS and forward.')],
    ['04', L('Mínimos antes que rankings', 'Minima before rankings'),
      L('Solo entran configs que superan tus suelos en ambos periodos. Un percentil siempre inventa un “top 5 %”, aunque todo pierda.',
        'Only setups that clear your floors in both periods enter. A percentile always invents a “top 5%”, even if everything loses.')],
    ['05', L('Vecinos en pasos', 'Neighbors in steps'),
      L('La distancia es en pasos de tu rejilla (30→50 y 0,1→0,2 = un paso). Si la rejilla es irregular, se avisa.',
        'Distance is in steps of your grid (30→50 and 0.1→0.2 = one step). Uneven grids get a warning.')],
    ['06', L('Meseta y centro', 'Plateau and center'),
      L('Meseta = zona donde los vecinos también pasan mínimos. Se elige el centro (maximin: el peor vecino, lo mejor posible), no el pico de beneficio.',
        'Plateau = a zone where neighbors also clear minima. We pick the center (maximin: best worst-neighbor), not the profit peak.')],
    ['07', L('Descartes y ranking', 'Rejects and ranking'),
      L('Picos aislados y caídas bruscas se listan como descartes. Se mide cuánto vale tu ranking IS↔forward en los dos sentidos.',
        'Isolated peaks and sharp drops are listed as rejects. Your IS↔forward ranking is tested both ways.')],
    ['08', L('Azar, umbrales y no visto', 'Chance, thresholds and unseen'),
      L('Se compara tu Sharpe con lo esperable por azar al probar mucho. Se mueven umbrales ±20 % para ver si la misma zona aguanta. El periodo no visto se juzga por normalidad para este EA, no por “números bonitos”.',
        'Your Sharpe is compared with what chance alone can produce after many trials. Thresholds are nudged ±20% to see if the same zone holds. The unseen period is judged by normality for this EA — not by “pretty numbers”.')],
  ];
  return `<div class="detail-head">
      <div class="detail-kicker">${L('07 / Metodología', '07 / Methodology')}</div>
      <h2>${L('Cómo decide el motor', 'How the engine decides')}</h2>
      <p>${L(
        'Misma idea que la página pública, con el detalle operativo. Determinista: mismos archivos y mínimos → mismo veredicto (semilla fija en los remuestreos).',
        'Same idea as the public page, with operational detail. Deterministic: same files and minima → same verdict (fixed seed on resamples).',
      )}</p>
    </div>
    <section class="panel">
      <div class="method-grid">
        ${steps.map(([n, title, d]) => `<div><span>${n}</span><h3>${esc(title)}</h3><p>${esc(d)}</p></div>`).join('')}
      </div>
    </section>
    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Límites', 'Limits')}</div><h2>${L('Lo que no hace', 'What it does not do')}</h2></div></div>
      <ul class="limits">
        <li>${L(
          'No sustituye un periodo verdaderamente no visto. Si eliges mirando el forward, ese forward deja de ser ciego.',
          'It does not replace a truly unseen period. If you choose while looking at forward, that forward is no longer blind.',
        )}</li>
        <li>${L(
          'No calcula PBO / Reality Check / SPA clásicos: el export de MT5 no trae curvas de equity por config. Mide fragilidad de la regla de selección — y por eso no se llama PBO.',
          'It does not compute classic PBO / Reality Check / SPA: MT5 exports lack per-config equity curves. It measures selection-rule fragility — which is why it is not called PBO.',
        )}</li>
        <li>${L(
          'El forward ya filtra y puntúa, así que está algo inflado (igual que el IS). El número más limpio es el del periodo no visto.',
          'Forward already filters and scores, so it is somewhat inflated (like IS). The cleanest number is the unseen period.',
        )}</li>
        <li>${L(
          'No juzga la lógica del EA, la calidad del histórico ni el spread/comisión. Un backtest optimista de origen sigue siendo optimista aquí.',
          'It does not judge EA logic, history quality, or spread/commission. An optimistic source backtest stays optimistic here.',
        )}</li>
        <li>${L(
          'Con muchos parámetros o genética, la vecindad y el tamaño de meseta se acotan de forma conservadora (puede subestimar soporte; no lo inventa) y se avisa cuando ocurre.',
          'With many parameters or genetic search, neighborhood and plateau size are capped conservatively (may underestimate support; never invents it) and that is reported.',
        )}</li>
      </ul>
    </section>`;
}
