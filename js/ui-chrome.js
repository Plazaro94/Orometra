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
    view.innerHTML = state.tab === 'legal' ? renderLegal() : renderMethod();
    bindViewEvents();
    return;
  }
  if (!state.analysis) {
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
}

export function bindViewEvents() {
  $$('[data-goto]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.goto)));
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
    ['01', L('Lectura sin suposiciones', 'Reading without assumptions'),
      L('MT5 guarda los resultados como XML Spreadsheet, tanto si la extension es .xml como si la cambias a .xls. Se lee de forma nativa, con tolerancia a formatos numericos regionales, y se avisa de cada fila descartada.',
        'MT5 stores results as XML Spreadsheet, whether the extension is .xml or you rename it to .xls. It is read natively, with tolerance for regional numeric formats, and every dropped row is reported.')],
    ['02', L('Que es parámetro y que es métrica', 'What is a parameter and what is a metric'),
      L('No se decide por el nombre de la columna, que depende del EA y del idioma. Se decide por estructura: para un mismo Pass, un parámetro vale lo mismo en el in-sample y en el forward; una métrica no, porque se midio sobre otro periodo.',
        'It is not decided by column name, which depends on the EA and language. It is decided by structure: for the same Pass, a parameter has the same value in-sample and forward; a metric does not, because it was measured on another period.')],
    ['03', L('Nunca se juzga con la vara del usuario', 'Never judged by the user\'s yardstick'),
      L('La columna Result es el criterio que elegiste en MT5: significa algo distinto en cada optimizacion y esta contaminada por la seleccion. La calidad se reconstruye con las columnas objetivas que MT5 exporta siempre: factor de beneficio, recuperacion, Sharpe, drawdown y número de operaciones.',
        'The Result column is the criterion you chose in MT5: it means something different in every optimization and is contaminated by selection. Quality is rebuilt from the objective columns MT5 always exports: profit factor, recovery, Sharpe, drawdown and trade count.')],
    ['04', L('Mínimos absolutos antes que rankings', 'Absolute minima before rankings'),
      L('Una configuración solo entra en el análisis si supera unos mínimos en los dos periodos. Esto es lo que permite decir que no hay nada: un percentil siempre encontraria un mejor 5 %, incluso en una optimizacion donde todo pierde dinero.',
        'A configuration only enters the analysis if it clears minima in both periods. That is what allows saying there is nothing: a percentile would always find a top 5 %, even in an optimization where everything loses money.')],
    ['05', L('El peor de los dos periodos', 'The worse of the two periods'),
      L('La calidad combinada es el mínimo entre in-sample y forward, no su media. Una configuración vale lo que vale su peor periodo; promediar dejaria que un in-sample espectacular tapase un forward malo.',
        'Combined quality is the minimum of in-sample and forward, not their average. A configuration is worth what its worse period is worth; averaging would let a spectacular in-sample hide a bad forward.')],
    ['06', L('Vecindad en pasos, no en unidades', 'Neighborhood in steps, not units'),
      L('Cada parámetro se convierte a su posicion entre los valores que probaste. Así un salto de 30 a 50 y otro de 0,1 a 0,2 son ambos un paso. El radio se amplia solo lo justo para conseguir soporte suficiente, y se informa del radio usado. Si tu rejilla tiene saltos desiguales -por ejemplo 10, 20, 30, 100, 500- la aplicación lo detecta y lo avisa, porque ahi esa equivalencia deja de ser inocente.',
        'Each parameter is converted to its position among the values you tested. So a jump from 30 to 50 and one from 0.1 to 0.2 are both one step. The radius expands just enough to get sufficient support, and the radius used is reported. If your grid has uneven steps — for example 10, 20, 30, 100, 500 — the app detects and warns, because there that equivalence stops being innocent.')],
    ['07', L('Un parámetro puede parecer plano y no serlo', 'A parameter can look flat and not be'),
      L('La influencia se mide de dos formas. Aislada: se agrupa por el valor del parámetro y se promedia sobre todo lo demás. Combinada: se deja fijo todo lo demás y se mide el recorrido a lo largo de ese eje. Manda la MAYOR de las dos, y la razón es concreta: un parámetro cuyo efecto se invierte según otro -un filtro de regimen, por ejemplo- sale exactamente plano en la primera medida. Descartarlo haría pasar por vecinas a configuraciones que no lo son, inflaría el soporte y fabricaría una meseta donde no hay ninguna.',
        'Influence is measured two ways. Isolated: group by the parameter value and average over everything else. Combined: hold everything else fixed and measure the range along that axis. The LARGER of the two wins, for a concrete reason: a parameter whose effect reverses depending on another — a regime filter, for example — looks exactly flat on the first measure. Dropping it would treat non-neighbors as neighbors, inflate support and invent a plateau where none exists.')],
    ['08', L('Meseta y nucleo', 'Plateau and core'),
      L('Pertenecer a una meseta exige que el cuartil bajo del entorno mantenga calidad buena, que casi todas las vecinas pasen los mínimos y que la robustez supere el umbral. El nucleo es la parte donde incluso el entorno es excelente, y de ahi sale la recomendacion.',
        'Belonging to a plateau requires that the lower quartile of the neighborhood keeps good quality, that almost all neighbors pass the minima, and that robustness clears the threshold. The core is the part where even the neighborhood is excellent, and that is where the recommendation comes from.')],
    ['09', L('Se elige el centro, no la cima', 'The center is chosen, not the peak'),
      L('El representante se escoge por criterio maximin: es la configuración cuyo PEOR vecino es el mejor posible. La cima de una meseta suele estar en su borde y es justo la que peor envejece.',
        'The representative is chosen by maximin: the configuration whose WORST neighbor is the best possible. The peak of a plateau usually sits on its edge and is exactly the one that ages worst.')],
    ['10', L('Acantilados y picos', 'Cliffs and peaks'),
      L('Se mide cuánto cae la calidad al dar un solo paso, en unidades de la dispersión entre configuraciones viables, y cuánto sobresale un punto sobre su propio entorno. Un máximo rodeado de resultados peores pierde el respaldo y se lista como descarte.',
        'It measures how much quality drops in a single step, in units of dispersion among viable configurations, and how much a point sticks out above its own neighborhood. A maximum surrounded by worse results loses support and is listed as a rejection.')],
    ['11', L('Cuanto vale tu ranking, en los dos sentidos', 'What your ranking is worth, both ways'),
      L('Se remuestrea el conjunto de configuraciones miles de veces: se elige la mejor segun un periodo y se mira donde cae en el otro. Y se hace en las DOS direcciones, no solo in-sample a forward. El motivo no es academico: si el tramo forward resulto ser mas facil, elegir por in-sample y validar en forward sale bien por el motivo equivocado. Una ventaja real es aproximadamente simetrica; una diferencia de regimen no lo es.',
        'The set of configurations is resampled thousands of times: pick the best by one period and see where it falls in the other. And it is done in BOTH directions, not only in-sample to forward. The reason is not academic: if the forward segment happened to be easier, choosing by in-sample and validating on forward looks good for the wrong reason. A real edge is approximately symmetric; a regime difference is not.')],
    ['12', L('El precio de haber probado mucho', 'The cost of having tried a lot'),
      L('Probar miles de combinaciones produce buenos resultados por si solo. Se calcula el mejor Sharpe que cabria esperar por puro azar con ese número de pruebas, y se compara con el que has obtenido.',
        'Trying thousands of combinations produces good results on its own. The best Sharpe you could expect by pure chance with that many trials is computed and compared with what you obtained.')],
    ['13', L('El periodo no visto se juzga por normalidad', 'The unseen period is judged by normality'),
      L('El último paso no pregunta si los numeros son buenos, sino si son normales PARA ESTE EA: se comparan con el recorrido que la meseta entera ya demostro en los dos periodos. Un tramo corto puede tocar una mala racha sin que eso invalide nada; lo que invalida es que sea peor que cualquier cosa ya atravesada.',
        'The last step does not ask whether the numbers are good, but whether they are normal FOR THIS EA: they are compared with the range the whole plateau already showed in both periods. A short segment can hit a bad streak without invalidating anything; what invalidates is being worse than anything already traversed.')],
    ['14', L('Corregir por duración antes de comparar', 'Correct for duration before comparing'),
      L('El drawdown máximo y el factor de recuperacion dependen del número de operaciones: el primero crece con la raiz del recuento y el segundo tambien. Un tramo con la cuarta parte de operaciones debería mostrar la mitad de drawdown. Compararlos en crudo contra un periodo más largo lleva justo a la conclusión contraria, y es el error que se comete al mirarlo a ojo. Esa correccion se aplica en el periodo no visto, donde comparamos tramos de duración muy distinta; NO se aplica a la puntuación de in-sample y forward, porque la ley de la raiz supone un paseo sin deriva y una estrategia rentable si la tiene.',
        'Maximum drawdown and recovery factor depend on trade count: the first grows with the square root of the count and so does the second. A segment with a quarter of the trades should show half the drawdown. Comparing them raw against a longer period leads to exactly the opposite conclusion, and that is the mistake of eyeballing it. That correction is applied on the unseen period, where we compare segments of very different length; it is NOT applied to in-sample and forward scores, because the square-root law assumes a driftless walk and a profitable strategy does have drift.')],
    ['15', L('Auditar nuestros propios umbrales', 'Audit our own thresholds'),
      L('Los cortes internos (suelo de calidad, robustez minima, soporte minimo) son juicios calibrados, no cantidades derivadas. Así que la búsqueda se repite decenas de veces moviendolos al azar un ±20 % y se cuenta cuantas veces sigue ganando la misma región. Si una recomendacion solo sobrevive con los números exactos que elegimos nosotros, no es una recomendacion, y se dice.',
        'Internal cuts (quality floor, minimum robustness, minimum support) are calibrated judgments, not derived quantities. So the search is repeated dozens of times moving them at random by ±20 % and counting how often the same region still wins. If a recommendation only survives with the exact numbers we chose, it is not a recommendation — and that is said.')],
  ];
  return `<div class="detail-head">
      <div class="detail-kicker">${L('07 / Metodología', '07 / Methodology')}</div>
      <h2>${L('Como decide el motor', 'How the engine decides')}</h2>
      <p>${L(
        'Todo es determinista: los mismos archivos y los mínimos producen siempre el mismo veredicto. Los dos remuestreos que hay -el de fragilidad de la selección y el de estabilidad frente a los umbrales- usan semilla fija.',
        'Everything is deterministic: the same files and minima always produce the same verdict. The two resamples — selection fragility and threshold stability — use a fixed seed.',
      )}</p>
    </div>
    <section class="panel">
      <div class="method-grid">
        ${steps.map(([n, title, d]) => `<div><span>${n}</span><h3>${esc(title)}</h3><p>${esc(d)}</p></div>`).join('')}
      </div>
    </section>
    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Límites', 'Limits')}</div><h2>${L('Lo que esta herramienta no puede hacer', 'What this tool cannot do')}</h2></div></div>
      <ul class="limits">
        <li>${L(
          'No sustituye a una prueba en un periodo que no hayas usado ni para optimizar ni para validar. En cuánto eliges mirando el forward, ese forward deja de ser ciego.',
          'It does not replace a test on a period you have not used for optimizing or validating. As soon as you choose looking at the forward, that forward stops being blind.',
        )}</li>
        <li>${L(
          `No ve la curva de capital de cada configuración: la exportación de optimización solo trae métricas agregadas por pasada. Esa es una limitación del fichero de entrada, no nuestra, y tiene una consecuencia concreta: el CSCV original de Bailey y López de Prado, que parte las series temporales en bloques, es <strong>imposible</strong> de calcular aquí. Lo que se mide es la fragilidad de la regla de selección, en los dos sentidos de la partición, y por eso no se llama PBO.`,
          `It does not see each configuration's equity curve: the optimization export only brings aggregated metrics per pass. That is a limitation of the input file, not ours, and it has a concrete consequence: the original CSCV of Bailey and López de Prado, which splits time series into blocks, is <strong>impossible</strong> to compute here. What is measured is the fragility of the selection rule, in both partition directions, and that is why it is not called PBO.`,
        )}</li>
        <li>${L(
          'Tampoco se ejecutan los contrastes de White (Reality Check) ni el SPA de Hansen, por la misma razón: necesitan las series de rendimientos de todas las estrategias a la vez.',
          'Neither White\'s Reality Check nor Hansen\'s SPA is run, for the same reason: they need the return series of all strategies at once.',
        )}</li>
        <li>${L(
          'Las cifras del forward participan en la selección (filtran y puntúan), así que están algo infladas, igual que las del in-sample. Es preferible a desperdiciar esa información, pero implica que el único número limpio que verás es el del periodo no visto.',
          'Forward figures participate in selection (they filter and score), so they are somewhat inflated, just like in-sample. That is preferable to wasting that information, but it means the only clean number you will see is the unseen period.',
        )}</li>
        <li>${L(
          'Con muchos parámetros optimizados, enumerar todos los desplazamientos dentro del radio se vuelve costoso y la vecindad pasa a considerar solo los que mueven uno o dos a la vez. Es conservador -puede subestimar el soporte, nunca inventarlo- y se avisa cuando ocurre.',
          'With many optimised parameters, enumerating all displacements within the radius becomes costly and the neighborhood only considers those that move one or two at a time. That is conservative — it may underestimate support, never invent it — and it is reported when it happens.',
        )}</li>
        <li>${L(
          'Con optimización genética, la densidad de configuraciones probadas mide dónde miró el optimizador tanto como dónde hay estabilidad. Para cortar esa circularidad, el tamaño de una meseta se tope por el volumen del espacio que abarca de verdad, no por cuántas veces se muestreó.',
          'With genetic optimization, the density of tested configurations measures where the optimizer looked as much as where there is stability. To cut that circularity, plateau size is capped by the volume of space it truly covers, not by how many times it was sampled.',
        )}</li>
        <li>${L(
          'No conoce las fechas de tus periodos. La duración relativa del forward se estima con el número de operaciones.',
          'It does not know your period dates. Relative forward duration is estimated from trade count.',
        )}</li>
        <li>${L(
          'No juzga la lógica de tu estrategia, la calidad de tus datos historicos ni el spread o la comision que usaste. Un backtest optimista de origen seguira siendo optimista aqui.',
          'It does not judge your strategy logic, the quality of your historical data, or the spread or commission you used. An optimistic backtest at the source will still be optimistic here.',
        )}</li>
      </ul>
    </section>`;
}
