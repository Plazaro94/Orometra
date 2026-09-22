// Interfaz. Toda la lógica de calculo vive en los modulos del motor; aquí solo se
// orquesta la carga de archivos, el worker y el pintado.

import { parseTable } from './parse.js';
import { DEFAULT_POLICY, qualityLabel, gateFailures } from './metrics.js';
import { metricColumns, inferParamsSingle, roleFromTable } from './schema.js';
import { buildDemoTables } from './demo.js';
import { evaluateUnseen } from './unseen.js';
import { parseBacktestReport, looksLikeReport, compareParams } from './report.js';
import { mountBrandMark } from './brandmark.js';
import { mountHeroSurface } from './hero-surface.js';
import { buildSetFile, buildRefinementSetFile, buildReport, buildCsv, downloadText, formatSetValue } from './export.js';
import { scatterIsOos, parameterProfile, degradationChart, sensitivityBars, plateauHeatmap, dimRole } from './charts.js';
import { t, L, getLocale, setLocale, localeTag, applyStaticI18n } from './i18n.js';
import { AnalysisError, CODE, classifyError, outcomeFromAnalysis, errorCopy } from './errors.js';
import { parseSetText, looksLikeSetFile } from './setfile.js';
import { rebuildLocalizedCopy } from './verdict.js';

const roleBadge = (role) => {
  const ROLE_COPY = {
    distancia: ['ok', L('mide la distancia', 'measures distance')],
    particion: ['', L('parte el espacio', 'partitions the space')],
    liberado: ['', L('bloqueo liberado', 'block released')],
    plano: ['', L('plano: se ignora', 'flat: ignored')],
    'no optimizado': ['', L('no optimizado', 'not optimized')],
  };
  const [cls, label] = ROLE_COPY[role] || ['', role];
  return `<span class="badge ${cls}">${label}</span>`;
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  isFile: null,
  oosFile: null,
  isTable: null,
  oosTable: null,
  analysis: null,
  tab: 'verdict',
  selectedPlateau: 0,
  selectedParam: 0,
  isDemo: false,
  busy: false,
  // Periodo no visto: lo que el usuario teclea y el último resultado calculado.
  unseen: { plateauIndex: 0, values: {}, result: null, error: null },
  report: null,
  preflight: { is: null, oos: null },
  searchSet: null,
  searchSetName: null,
};

// ---------------------------------------------------------------- formato
const nf = (d = 2) => new Intl.NumberFormat(localeTag(), { minimumFractionDigits: d, maximumFractionDigits: d });
const num = (v, d = 2) => (Number.isFinite(v) ? nf(d).format(v) : '—');
const int = (v) => (Number.isFinite(v) ? new Intl.NumberFormat(localeTag()).format(Math.round(v)) : '—');
const pct = (v, d = 1) => (Number.isFinite(v) ? `${nf(d).format(v * 100)} %` : '—');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Escape HTML but keep the inline tags the verdict engine embeds in finding details. */
const rich = (s) => esc(s).replace(/&lt;(\/?(?:strong|em))&gt;/gi, '<$1>');
const money = (v) => (Number.isFinite(v) ? new Intl.NumberFormat(localeTag(), { maximumFractionDigits: 0 }).format(v) : '—');
/** Valor tal como lo escribe MT5: punto decimal y sin separador de millares. */
const rawValue = (v) => {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
};

const paramValue = (v) => {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return v;
  if (!Number.isFinite(v)) return '—';
  return Number.isInteger(v) ? String(v) : nf(4).format(v).replace(/,?0+$/, '');
};

// ---------------------------------------------------------------- carga de archivos
const BINARY_HINT = /\.(xlsx|xlsm)$/i;

/**
 * Averigua por el CONTENIDO si un archivo es el in-sample o el forward.
 *
 * El export del forward trae columnas "Forward Result" y "Back Result"; el del
 * in-sample no. Así el usuario no tiene que acertar en que caja suelta cada archivo:
 * puede soltar los dos donde sea, o los dos a la vez, y la app los coloca. Un paso
 * menos donde equivocarse, y equivocarse ahi invalidaba el análisis entero en silencio.
 */
async function detectRole(file) {
  try {
    if (/\.set$/i.test(file.name)) return 'set';
    // .xlsx es ZIP: hay que parsear para ver cabeceras (Forward Result / Back Result).
    if (BINARY_HINT.test(file.name) || /\.xlsx?$/i.test(file.name)) {
      const prepared = await prepareTable(file);
      if (prepared.table) return roleFromTable(prepared.table);
    }
    const buf = await file.slice(0, 131072).arrayBuffer();
    const head = decodeHead(buf);
    if (looksLikeSetFile(file.name, head)) return 'set';
    if (looksLikeReport(head)) return 'report';
    if (/Forward\s*Result|Resultado\s*(del\s*)?forward/i.test(head)) return 'oos';
    if (/Back\s*Result/i.test(head)) return 'oos';
    // CSV/XML cortos: si el trozo no basta, parsear entero cuando quepa.
    if (file.size <= 2 * 1024 * 1024) {
      const full = await file.arrayBuffer();
      try {
        const table = parseTable(full, file.name);
        return roleFromTable(table);
      } catch {
        /* sigue con heurística de cabecera */
      }
    }
    return 'is';
  } catch {
    return null;
  }
}

/** MT5 guarda el informe en UTF-16; las optimizaciones, en UTF-8. */
function decodeHead(buffer) {
  const b = new Uint8Array(buffer);
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(buffer);
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(buffer);
  return new TextDecoder('utf-8').decode(buffer);
}

/**
 * Carga el informe del backtest del periodo no visto: rellena el formulario solo y
 * comprueba que los parametros del backtest son los de la configuracion propuesta.
 */
async function setReport(file) {
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
    clearError();
    if (state.analysis) {
      setTab('unseen');
      runUnseenCheck();
    }
  } catch (err) {
    showError(err && err.message ? err.message : String(err));
  }
}

async function setSearchSet(file) {
  try {
    const text = decodeHead(await file.arrayBuffer());
    const parsed = parseSetText(text);
    if (!parsed.params.length) {
      showError(L('El .set no contiene parámetros legibles.', 'The .set contains no readable parameters.'));
      return;
    }
    state.searchSet = parsed;
    state.searchSetName = file.name;
    clearError();
    const status = $('#setStatus');
    if (status) status.textContent = `${file.name} · ${parsed.params.length} ${L('parámetros', 'parameters')}`;
    if (state.isFile || state.isDemo) {
      // Re-auditar con el contraste de cobertura cuando ya hay datos.
      if (!state.busy && (state.isTable || state.isFile)) runAudit();
    }
  } catch (err) {
    showError(err && err.message ? err.message : String(err));
  }
}

/** Reparte una tanda de archivos entre las dos cajas según lo que sean. */
async function acceptFiles(fileList, preferred) {
  // Hasta cuatro: IS, forward, informe unseen y .set de rangos.
  const files = Array.from(fileList || []).slice(0, 4);
  if (!files.length) return;
  if (files.length === 1) {
    const role = await detectRole(files[0]);
    if (role === 'report') {
      await setReport(files[0]);
      return;
    }
    if (role === 'set') {
      await setSearchSet(files[0]);
      return;
    }
    setFile(role || preferred || 'is', files[0]);
    return;
  }
  const roles = await Promise.all(files.map(detectRole));
  const setIdx = roles.indexOf('set');
  if (setIdx >= 0) {
    await setSearchSet(files[setIdx]);
    const rest = files.filter((_, i) => i !== setIdx);
    if (rest.length) await acceptFiles(rest, preferred);
    return;
  }
  const reportIdx = roles.indexOf('report');
  if (reportIdx >= 0) {
    await setReport(files[reportIdx]);
    const rest = files.filter((_, i) => i !== reportIdx);
    if (rest.length) await acceptFiles(rest, preferred);
    return;
  }
  const oosIdx = roles.indexOf('oos');
  if (oosIdx >= 0) {
    setFile('oos', files[oosIdx]);
    setFile('is', files[1 - oosIdx] || files.find((_, i) => i !== oosIdx));
  } else if (roles[0] === 'is' && roles[1] === 'is') {
    // Ambos parecen in-sample: no asignar el segundo a forward en silencio.
    setFile('is', files[0]);
    showError(L(
      'Los dos archivos parecen in-sample (ninguno trae columnas Forward Result / Back Result). Carga el export del forward en la caja Forward, o un solo archivo si no usaste forward.',
      'Both files look like in-sample (neither has Forward Result / Back Result columns). Load the forward export into the Forward box, or a single file if you did not use forward.',
    ));
  } else {
    setFile('is', files[0]);
    setFile('oos', files[1]);
  }
}

function setFile(which, file) {
  const statusEl = which === 'is' ? $('#isStatus') : $('#oosStatus');
  const boxEl = which === 'is' ? $('#isDrop') : $('#oosDrop');
  if (!file) return;
  const MAX_BYTES = 80 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    statusEl.textContent = L(
      `Archivo demasiado grande (>${Math.round(MAX_BYTES / 1048576)} MB). Exporta un XML más reducido o recorta la optimización.`,
      `File too large (>${Math.round(MAX_BYTES / 1048576)} MB). Export a smaller XML or trim the optimization.`,
    );
    boxEl.classList.add('error');
    boxEl.classList.remove('ready');
    return;
  }
  if (/\.opt$/i.test(file.name)) {
    statusEl.textContent = L(
      'El .opt es la cache interna del probador y no se puede leer. Exporta con clic derecho → Informe → XML.',
      'The .opt is the tester\'s internal cache and cannot be read. Export with right-click → Report → XML.',
    );
    boxEl.classList.add('error');
    boxEl.classList.remove('ready');
    return;
  }
  if (!/\.(xls|xlsx|xlsm|xml|csv|tsv|txt)$/i.test(file.name)) {
    statusEl.textContent = L(
      'Formato no compatible. Usa el XML que exporta MT5 (o .xls, o CSV).',
      'Unsupported format. Use the XML that MT5 exports (or .xls, or CSV).',
    );
    boxEl.classList.add('error');
    boxEl.classList.remove('ready');
    return;
  }
  state[which === 'is' ? 'isFile' : 'oosFile'] = file;
  state.isDemo = false;
  clearError(); // el fallo anterior ya no describe lo que hay cargado
  statusEl.textContent = `${file.name} · ${(file.size / 1048576).toFixed(1)} MB`;
  boxEl.classList.remove('error');
  boxEl.classList.add('ready');
  refreshAnalyzeButton();
  queuePreflight(which);
}

const preflightToken = { is: 0, oos: 0 };

async function resolveTable(file) {
  const prepared = await prepareTable(file);
  if (prepared.table) return prepared.table;
  return parseTable(prepared.buffer, prepared.name || file.name);
}

async function buildPreflightSummary(file) {
  const table = await resolveTable(file);
  const metrics = metricColumns(table);
  const inferred = inferParamsSingle(table);
  return {
    ok: true,
    name: file.name,
    rows: table.rows.length,
    cols: table.headers.length,
    params: inferred.params.length,
    metrics: Object.keys(metrics).length,
    format: table.format || 'table',
  };
}

async function queuePreflight(which) {
  const key = which === 'is' ? 'is' : 'oos';
  const file = key === 'is' ? state.isFile : state.oosFile;
  const token = ++preflightToken[key];
  if (!file) {
    state.preflight[key] = null;
    renderPreflight();
    return;
  }
  state.preflight[key] = { ok: null, name: file.name, reading: true };
  renderPreflight();
  try {
    const summary = await buildPreflightSummary(file);
    if (preflightToken[key] !== token) return;
    state.preflight[key] = summary;
  } catch (err) {
    if (preflightToken[key] !== token) return;
    const classified = classifyError(err);
    state.preflight[key] = {
      ok: false,
      name: file.name,
      error: classified,
    };
    const boxEl = key === 'is' ? $('#isDrop') : $('#oosDrop');
    const statusEl = key === 'is' ? $('#isStatus') : $('#oosStatus');
    if (boxEl) boxEl.classList.add('error');
    if (statusEl) statusEl.textContent = `${file.name} · ${t('preflight.error')}`;
  }
  renderPreflight();
  refreshAnalyzeButton();
}

function renderPreflight() {
  const host = $('#preflight');
  const grid = $('#preflightGrid');
  const note = $('#preflightNote');
  if (!host || !grid) return;
  const slots = [
    { key: 'is', label: L('In-sample', 'In-sample') },
    { key: 'oos', label: L('Forward', 'Forward') },
  ];
  const hasAny = slots.some((s) => state.preflight[s.key]);
  host.hidden = !hasAny;
  if (!hasAny) return;

  let hasError = false;
  let reading = false;
  grid.innerHTML = slots.map((s) => {
    const p = state.preflight[s.key];
    if (!p) {
      return `<div class="preflight-card preflight-empty">
        <span class="preflight-role">${esc(s.label)}</span>
        <strong>—</strong>
        <em>${L('Sin archivo', 'No file')}</em>
      </div>`;
    }
    if (p.reading) {
      reading = true;
      return `<div class="preflight-card preflight-reading">
        <span class="preflight-role">${esc(s.label)}</span>
        <strong>${esc(p.name)}</strong>
        <em>${esc(t('preflight.reading'))}</em>
      </div>`;
    }
    if (p.ok === false) {
      hasError = true;
      return `<div class="preflight-card preflight-bad">
        <span class="preflight-role">${esc(s.label)}</span>
        <strong>${esc(p.name)}</strong>
        <em>${esc(p.error && p.error.message ? p.error.message : t('preflight.error'))}</em>
      </div>`;
    }
    return `<div class="preflight-card preflight-ok">
      <span class="preflight-role">${esc(s.label)}</span>
      <strong>${esc(p.name)}</strong>
      <em>${esc(t('preflight.rows'))} ${int(p.rows)} · ${esc(t('preflight.params'))} ${int(p.params)} · ${esc(t('preflight.metrics'))} ${int(p.metrics)}</em>
    </div>`;
  }).join('');

  if (note) {
    if (hasError) {
      note.textContent = t('preflight.note.warn');
    } else if (reading) {
      note.textContent = t('preflight.reading');
    } else if (state.analysis) {
      note.textContent = L(
        'Archivos leídos. Puedes volver a auditar si cambias los mínimos.',
        'Files read. You can audit again if you change the minima.',
      );
    } else {
      note.textContent = t('preflight.note.ok');
    }
    note.classList.toggle('is-warn', hasError);
  }
}

function refreshAnalyzeButton() {
  const hasIs = Boolean(state.isFile || (state.isDemo && state.isTable));
  const hasOos = Boolean(state.oosFile || (state.isDemo && state.oosTable));
  const ready = hasIs && hasOos;
  const preflightBlocked = (state.preflight.is && state.preflight.is.ok === false)
    || (state.preflight.oos && state.preflight.oos.ok === false);
  $('#analyzeBtn').disabled = !ready || state.busy || preflightBlocked;
  $('#analyzeSub').textContent = !hasIs
    ? t('analyze.needIs')
    : !hasOos
      ? t('analyze.needOos')
      : preflightBlocked
        ? t('preflight.note.warn')
        : t('analyze.ready');
}

function bindDropzone(zoneSel, inputSel, which) {
  const zone = $(zoneSel);
  const input = $(inputSel);
  // El <input type=file> lleva `hidden`, que lo saca del orden de tabulacion, y una
  // <label> tampoco es enfocable por si sola. Sin esto la aplicacion entera era
  // inutilizable sin raton.
  zone.setAttribute('tabindex', '0');
  zone.setAttribute('role', 'button');
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', async (e) => {
    // Copiar ANTES de limpiar: input.files es una referencia viva y vaciar el input
    // la deja vacia tambien. Limpiarlo hace falta para poder reelegir el mismo archivo.
    const picked = Array.from(e.target.files || []);
    input.value = '';
    await acceptFiles(picked, which);
  });
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => {
    e.preventDefault();
    zone.classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => {
    e.preventDefault();
    zone.classList.remove('drag');
  }));
  zone.addEventListener('drop', (e) => {
    // Se corta la propagacion para que el manejador global no lo procese otra vez.
    e.stopPropagation();
    hideDropOverlay();
    acceptFiles(e.dataTransfer && e.dataTransfer.files, which);
  });
}

// ---------------------------------------------------------------- preferencias
const PREFS_KEY = 'orometra.gates';

/** Los mínimos son una decisión del usuario: no debería repetirla cada sesión. */
const THEME_KEY = 'orometra.theme';
const TEMAS = ['dark', 'light', 'cream'];
let repaintMark = () => {};
let emptySurface = null;

/**
 * Tema de color. Se aplica en `documentElement` porque el `<head>` ya lo lee antes de
 * pintar para evitar el fogonazo al recargar.
 */
function setTheme(name, persist = true) {
  const t = TEMAS.includes(name) ? name : 'dark';
  document.documentElement.dataset.theme = t;
  $$('[data-theme-set]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeSet === t)));
  if (persist) {
    try { localStorage.setItem(THEME_KEY, t); } catch { /* modo privado */ }
  }
  if (typeof window.__orometraSyncThemeColor === 'function') window.__orometraSyncThemeColor();
  // La figura de la marca se dibuja con los colores del tema: hay que repintarla.
  repaintMark();
}

function initChrome() {
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

function resetSession() {
  if (!confirm(L(
    'Se va a descartar el análisis actual y los archivos cargados. ¿Seguro?',
    'This will discard the current analysis and loaded files. Continue?',
  ))) return;
  state.isFile = null; state.oosFile = null; state.isTable = null; state.oosTable = null;
  state.analysis = null; state.isDemo = false; state.report = null;
  state.searchSet = null; state.searchSetName = null;
  state.selectedPlateau = 0; state.selectedParam = 0;
  state.unseen = { plateauIndex: 0, values: {}, result: null, error: null };
  state.preflight = { is: null, oos: null };
  state.tab = 'verdict';
  for (const [sel, key] of [['#isStatus', 'drop.is.status'], ['#oosStatus', 'drop.oos.status']]) {
    const el = $(sel); if (el) el.textContent = t(key);
  }
  const setStatus = $('#setStatus');
  if (setStatus) setStatus.textContent = '';
  $$('.dropzone').forEach((d) => d.classList.remove('ready', 'error'));
  ['#isFile', '#oosFile'].forEach((sel) => { const el = $(sel); if (el) el.value = ''; });
  clearError();
  renderPreflight();
  refreshAnalyzeButton();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function syncLangButtons() {
  const lang = getLocale();
  $$('[data-lang-set]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.langSet === lang)));
}

function changeLanguage(lang) {
  setLocale(lang);
  syncLangButtons();
  applyStaticI18n();
  refreshAnalyzeButton();
  // El veredicto se generó en el idioma del análisis: regenerar copy sin recalcular.
  if (state.analysis) {
    state.analysis = rebuildLocalizedCopy(state.analysis);
  }
  render();
}

function loadPrefs() {
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

function savePrefs() {
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
function readPolicy() {
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
function updatePolicyPreview() {
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

function showProgress(pct, label) {
  $('#statusBar').hidden = false;
  $('#progressFill').style.width = `${Math.max(2, Math.min(100, pct))}%`;
  $('#progressLabel').textContent = label;
}

function showError(errOrMessage) {
  const classified = typeof errOrMessage === 'string'
    ? { code: CODE.DATA_ERROR, message: errOrMessage, details: {} }
    : classifyError(errOrMessage);
  const copy = errorCopy(classified.code, L);
  $('#errorBox').hidden = false;
  const titleEl = $('#errorTitle');
  if (titleEl) titleEl.textContent = copy.title;
  $('#errorText').textContent = classified.message;
  const hintEl = $('#errorHint');
  if (hintEl) {
    hintEl.textContent = copy.hint;
    hintEl.hidden = !copy.hint;
  }
  $('#statusBar').hidden = true;
  $('#errorBox').dataset.code = classified.code;
}

function clearError() {
  $('#errorBox').hidden = true;
  const hintEl = $('#errorHint');
  if (hintEl) {
    hintEl.textContent = '';
    hintEl.hidden = true;
  }
  delete $('#errorBox').dataset.code;
}

function setBusy(busy) {
  state.busy = busy;
  $('#analyzeBtn').classList.toggle('busy', busy);
  $('#analyzeLabel').textContent = busy ? t('analyze.busy') : t('analyze.label');
  // Todo lo que puede disparar un análisis queda bloqueado: si no, se solapan dos
  // calculos y gana el que acabe el ultimo.
  $('#demoBtn').disabled = busy;
  $('#policyBtn').disabled = busy;
  $$('.dropzone').forEach((z) => z.classList.toggle('locked', busy));
  refreshAnalyzeButton();
}

let worker = null;
let requestId = 0;
// Peticiones vivas: si el worker muere hay que poder rechazarlas todas. Sin esto, un
// fallo del worker dejaba la promesa sin resolver y la interfaz clavada en "Auditando..."
// para siempre, sin error y sin salida salvo recargar.
const pendingRequests = new Map();

const WORKER_TIMEOUT_MS = 10 * 60 * 1000;

function failAllPending(message) {
  const error = new Error(message);
  pendingRequests.forEach((entry) => {
    clearTimeout(entry.timer);
    entry.reject(error);
  });
  pendingRequests.clear();
}

function getWorker() {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onerror = () => {
      const dead = worker;
      worker = null;
      if (dead && dead.terminate) dead.terminate();
      failAllPending(L(
        'El motor de análisis ha fallado de forma inesperada. Vuelve a intentarlo; si se repite, recarga la pagina.',
        'The analysis engine failed unexpectedly. Try again; if it repeats, reload the page.',
      ));
    };
    worker.onmessageerror = () => {
      failAllPending(L(
        'El resultado del análisis no se ha podido transferir. Prueba con una optimizacion más pequena.',
        'The analysis result could not be transferred. Try a smaller optimization.',
      ));
    };
    return worker;
  } catch {
    return null;
  }
}

/** Reserva: si el worker no esta disponible, se calcula en el hilo principal. */
async function analyseOnMainThread(payload) {
  const { runAnalysis } = await import('./analysis.js');
  const isTable = payload.isTable || parseTable(payload.isBuffer, payload.isName);
  const oosTable = payload.oosTable || (payload.oosBuffer ? parseTable(payload.oosBuffer, payload.oosName) : null);
  return runAnalysis({
    isTable,
    oosTable,
    policy: payload.policy,
    searchSet: payload.searchSet || null,
    onProgress: (p) => showProgress(p.pct, p.label),
  });
}

function runInWorker(payload) {
  const w = getWorker();
  if (!w) return analyseOnMainThread(payload);
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const finish = () => {
      const entry = pendingRequests.get(id);
      if (entry) clearTimeout(entry.timer);
      pendingRequests.delete(id);
      w.removeEventListener('message', onMessage);
    };
    function onMessage(event) {
      const msg = event.data;
      if (!msg || msg.id !== id) return;
      if (msg.type === 'progress') { showProgress(msg.pct, msg.label); return; }
      finish();
      if (msg.type === 'done') resolve(msg.analysis);
      else if (msg.type === 'error') {
        reject(msg.code
          ? new AnalysisError(msg.code, msg.message, msg.details || {})
          : new Error(msg.message));
      }
    }
    // Red de seguridad por si el worker se queda mudo sin llegar a lanzar un error.
    const timer = setTimeout(() => {
      finish();
      try {
        w.terminate();
      } catch { /* ignore */ }
      worker = null;
      reject(new Error(L(
        'El análisis ha tardado demasiado y se ha cancelado. Prueba con una optimizacion más pequena.',
        'The analysis took too long and was cancelled. Try a smaller optimization.',
      )));
    }, WORKER_TIMEOUT_MS);
    pendingRequests.set(id, { resolve, reject, timer });
    w.addEventListener('message', onMessage);
    try {
      w.postMessage({ id, ...payload });
    } catch (err) {
      finish();
      reject(new Error(L(
        'No se han podido enviar los datos al motor de análisis: ',
        'Could not send data to the analysis engine: ',
      ) + (err && err.message ? err.message : String(err))));
    }
  });
}

async function prepareTable(file) {
  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer.slice(0, 2));
  // Un .xlsx es un ZIP; descomprimirlo es asincrono y no cabe dentro del lector
  // sincrono, asi que se resuelve aqui y se manda ya en forma de tabla. El modulo se
  // carga solo si hace falta: la inmensa mayoria de los archivos de MT5 son XML.
  if (head[0] === 0x50 && head[1] === 0x4b) {
    const { parseXlsx } = await import('./xlsx.js');
    const { finishTable } = await import('./parse.js');
    return { table: finishTable(await parseXlsx(buffer), file.name) };
  }
  return { buffer, name: file.name };
}

async function runAudit() {
  if (state.busy) return;
  clearError();
  const demoOk = state.isDemo && state.isTable && state.oosTable;
  if (!demoOk && (!state.isFile || !state.oosFile)) {
    showError(L(
      'Para auditar hacen falta in-sample y forward. Sin forward no hay contraste fuera de muestra.',
      'Audit needs both in-sample and forward. Without forward there is no out-of-sample contrast.',
    ));
    return;
  }
  setBusy(true);
  showProgress(2, L('Leyendo archivos', 'Reading files'));
  try {
    const policy = readPolicy();
    let payload;
    if (state.isDemo && state.isTable) {
      payload = {
        isTable: state.isTable,
        oosTable: state.oosTable,
        policy,
        locale: getLocale(),
        searchSet: state.searchSet || null,
      };
    } else {
      const is = await prepareTable(state.isFile);
      const oos = state.oosFile ? await prepareTable(state.oosFile) : null;
      payload = {
        isTable: is.table || null,
        isBuffer: is.buffer || null,
        isName: is.name || (state.isFile && state.isFile.name),
        oosTable: oos ? oos.table || null : null,
        oosBuffer: oos ? oos.buffer || null : null,
        oosName: oos ? oos.name : null,
        policy,
        locale: getLocale(),
        searchSet: state.searchSet || null,
      };
    }
    const analysis = await runInWorker(payload);
    state.analysis = analysis;
    state.source = {
      is: state.isDemo ? L('Ejemplo sintético', 'Synthetic example') : (state.isFile && state.isFile.name) || '—',
      oos: state.isDemo ? null : (state.oosFile && state.oosFile.name) || null,
      at: new Date(),
    };
    const mark = analysis.verdict.level === 'strong' ? '✓' : analysis.verdict.level === 'moderate' ? '!' : '·';
    document.title = `${mark} ${state.source.is} · Orometra`;
    state.selectedPlateau = 0;
    // El informe NO se descarta al reanalizar: es habitual soltar los tres archivos a
    // la vez, y si no correspondiese al EA analizado la comparacion de parametros lo
    // dira en voz alta. Solo se reinicia lo tecleado a mano.
    state.unseen = { plateauIndex: 0, values: {}, result: null, error: null };
    state.selectedParam = mostSensitiveIndex(analysis);
    $('#statusBar').hidden = true;
    $('#exportBtn').disabled = false;
    $$('.nav-item').forEach((b) => { b.disabled = false; });
    // Si ya habia un informe cargado, se vuelven a tomar sus cifras contra el analisis
    // recien hecho.
    if (state.report) {
      const m = state.report.metrics;
      state.unseen.values = {
        trades: m.trades, profit: m.profit, profitFactor: m.profitFactor,
        drawdown: m.drawdown, recoveryFactor: m.recoveryFactor, sharpe: m.sharpe,
      };
    }
    setTab('verdict');
    updatePolicyPreview();
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

function mostSensitiveIndex(a) {
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

function topTwoSensitive(a) {
  const ranked = a.sensitivity.filter((s) => !s.constant).sort((x, y) => y.sensitivity - x.sensitivity);
  return [ranked[0] ? ranked[0].index : 0, ranked[1] ? ranked[1].index : (ranked[0] ? ranked[0].index : 0)];
}

// ---------------------------------------------------------------- navegacion
const TAB_HASH = {
  verdict: 'veredicto', plateaus: 'mesetas', rejected: 'descartes', params: 'parametros',
  diagnostics: 'diagnostico', unseen: 'periodo-no-visto', method: 'metodologia',
  legal: 'legal',
};
const HASH_TAB = Object.fromEntries(Object.entries(TAB_HASH).map(([k, v]) => [v, k]));

function setTab(tab, fromHash) {
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

function render() {
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
    verdict: () => renderVerdict(a),
    plateaus: () => renderPlateaus(a),
    rejected: () => renderRejected(a),
    params: () => renderParams(a),
    diagnostics: () => renderDiagnostics(a),
    unseen: () => renderUnseen(a),
  };
  view.innerHTML = (map[state.tab] || map.verdict)();
  bindViewEvents();
}

function bindViewEvents() {
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
    state.unseen.values = readUnseenForm();
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
    render();
  });
  const unseenBtn = $('#unseenCheck');
  if (unseenBtn) unseenBtn.addEventListener('click', runUnseenCheck);
  const unseenClear = $('#unseenClear');
  if (unseenClear) unseenClear.addEventListener('click', () => {
    state.unseen = { plateauIndex: state.unseen.plateauIndex, values: {}, result: null, error: null };
    render();
  });
  $$('[data-copy]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    copyParams(Number(b.dataset.copy), b);
  }));
  $$('[data-export]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const idx = b.dataset.plateauIndex;
    doExport(b.dataset.export, idx === undefined ? undefined : Number(idx));
  }));
}

function disposeEmptySurface() {
  if (emptySurface && typeof emptySurface.dispose === 'function') emptySurface.dispose();
  emptySurface = null;
}

function mountEmptySurface() {
  disposeEmptySurface();
  const canvas = $('#emptySurface');
  if (!canvas) return;
  emptySurface = mountHeroSurface(canvas);
}

// ---------------------------------------------------------------- vistas
function renderEmpty() {
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

/*
 * El sello califica la FUERZA DE LA EVIDENCIA, no la estrategia. Antes decia
 * "NO RECOMENDADO" / "SUPERA LA AUDITORIA", que era decidir por el usuario sobre algo
 * que la aplicacion no mide. Ahora describe lo que sostiene el hallazgo.
 */
function verdictCopy(level) {
  if (level === 'insufficient') return { label: t('verdict.insufficient'), cls: 'v-no' };
  if (level === 'weak') return { label: t('verdict.weak'), cls: 'v-weak' };
  if (level === 'moderate') return { label: t('verdict.moderate'), cls: 'v-warn' };
  return { label: t('verdict.strong'), cls: 'v-go' };
}

/** Estado del holdout para sello / hoja de evidencia (forward ≠ periodo no visto). */
function holdoutFact(a) {
  const res = state.unseen && state.unseen.result;
  if (!res) {
    return {
      value: L('No aportado', 'Not supplied'),
      note: a && a.meta && a.meta.hasForward
        ? L('El forward ya entró en la selección. Falta un tramo no visto.', 'Forward already entered selection. An unseen segment is still missing.')
        : L('Validación independiente aún no cargada.', 'Independent validation not loaded yet.'),
      short: L('Holdout: no aportado', 'Holdout: not supplied'),
      done: false,
      ok: false,
    };
  }
  const value = res.level === 'normal'
    ? L('Normal', 'Normal')
    : res.level === 'tail'
      ? L('En la cola', 'In the tail')
      : L('Fuera de rango', 'Out of range');
  return {
    value,
    note: res.headline || '',
    short: L(`Holdout: ${value}`, `Holdout: ${value}`),
    done: true,
    ok: res.level === 'normal' || res.level === 'tail',
  };
}

/**
 * Evidencia "fuerte" sin holdout limpio se muestra como moderada: el forward ya se usó.
 */
function displayVerdictLevel(a) {
  let level = a.verdict.level;
  if (level === 'strong' && a.meta.hasForward) {
    const h = holdoutFact(a);
    if (!h.done || !h.ok) level = 'moderate';
  }
  return level;
}

function renderVerdict(a) {
  const v = a.verdict;
  const displayLevel = displayVerdictLevel(a);
  const c = verdictCopy(displayLevel);
  const best = a.plateaus[0];
  const mainRisk = (v.findings || []).find((f) => f.severity === 'critical' || f.severity === 'warn');
  const hold = holdoutFact(a);
  const demoNote = state.isDemo
    ? `<div class="demo-note">${L(
      `Estos datos son <strong>sintéticos</strong>, generados por la aplicacion para que puedas ver el flujo completo. La meseta real esta plantada en: ${esc(Object.entries(state.demoTruth.center).map(([k, val]) => `${k}=${val}`).join(', '))}.`,
      `These data are <strong>synthetic</strong>, generated by the app so you can see the full flow. The real plateau is planted at: ${esc(Object.entries(state.demoTruth.center).map(([k, val]) => `${k}=${val}`).join(', '))}.`,
    )}</div>`
    : '';

  const src = state.source;
  const stamp = src
    ? `<div class="run-stamp">
        <span class="run-files">${esc(src.is)}${src.oos ? ' <b>+</b> ' + esc(src.oos) : ''}</span>
        <span class="run-sep">·</span>
        <span>${int(a.meta.total)} ${L('configuraciones', 'configurations')}</span>
        <span class="run-sep">·</span>
        <span>${esc(L('analizado', 'analyzed'))} ${esc(src.at.toLocaleString(localeTag(), { dateStyle: 'short', timeStyle: 'short' }))}</span>
        <span class="run-sep">·</span>
        <span title="${esc(L('Mínimos exigidos en este análisis', 'Minima required in this analysis'))}">PF ≥ ${num(a.meta.policy.gates.minProfitFactor, 2)} · DD ≤ ${num(a.meta.policy.gates.maxDrawdownPct, 0)} % · ${int(a.meta.minTradesIs)} ops</span>
        <span class="run-sep">·</span>
        <span class="run-holdout" title="${esc(hold.note)}">${esc(hold.short)}</span>
      </div>`
    : '';

  const pickBlock = best
    ? `<div class="verdict-fact">
        <span class="verdict-fact-label">${esc(t('verdict.pick'))}</span>
        <strong class="verdict-fact-value mono">Pass ${esc(best.record.id)}</strong>
        <span class="verdict-fact-note">M${best.rank} · ${int(best.size)} ${L('configs', 'configs')} · ${num(best.robust, 0)} ${L('robustez', 'robustness')}</span>
      </div>`
    : `<div class="verdict-fact">
        <span class="verdict-fact-label">${esc(t('verdict.pick'))}</span>
        <strong class="verdict-fact-value">${esc(t('verdict.nopick'))}</strong>
      </div>`;

  const holdBlock = `<div class="verdict-fact${hold.done && !hold.ok ? ' verdict-fact-risk' : ''}">
      <span class="verdict-fact-label">${L('Holdout', 'Holdout')}</span>
      <strong class="verdict-fact-value">${esc(hold.value)}</strong>
      <span class="verdict-fact-note">${esc(hold.note)}</span>
    </div>`;

  const riskBlock = mainRisk
    ? `<div class="verdict-fact verdict-fact-risk">
        <span class="verdict-fact-label">${esc(t('verdict.risk'))}</span>
        <strong class="verdict-fact-value">${esc(mainRisk.title)}</strong>
        <span class="verdict-fact-note">${esc(mainRisk.detail)}</span>
      </div>`
    : '';

  return `${demoNote}${stamp}
  ${renderOutcomeBanner(a)}
  <section class="verdict-banner ${c.cls}">
    <div class="verdict-stamp-col">
      <div class="verdict-stamp">${c.label}</div>
    </div>
    <div class="verdict-body">
      <h2>${esc(v.headline)}</h2>
      ${v.summary ? `<p>${esc(v.summary)}</p>` : ''}
    </div>
    <div class="verdict-aside">
      ${pickBlock}
      ${holdBlock}
      ${riskBlock}
      <div class="verdict-fact verdict-fact-next">
        <span class="verdict-fact-label">${esc(t('verdict.next'))}</span>
        <strong class="verdict-fact-value">${esc(v.nextStep)}</strong>
      </div>
    </div>
  </section>

  ${renderEvidenceSheet(a, best)}

  ${renderWhyGrade(a)}

  ${best ? renderStableRanges(a, best) : ''}

  ${renderTop3(a)}

  <section class="panel panel-evidence">
    <div class="panel-head"><div><div class="panel-kicker">${L('Detalle', 'Detail')}</div><h2>${L('Hallazgos del motor', 'Engine findings')}</h2></div></div>
    <ul class="findings">
      ${v.findings.map((f) => `<li class="finding f-${f.severity === 'critical' ? 'block' : f.severity}">
        <div class="finding-mark" aria-hidden="true"></div>
        <div><strong>${esc(f.title)}</strong><p>${rich(f.detail)}</p></div>
      </li>`).join('')}
    </ul>
  </section>

  <div class="grid-secondary">
    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Transferencia', 'Transfer')}</div><h2>${L('Calidad in-sample frente a forward', 'In-sample quality vs forward')}</h2></div></div>
      ${scatterIsOos(a)}
      <p class="chart-note">${L(
        'Cada punto es una configuracion. La diagonal marca &laquo;no se degrada&raquo;. Los puntos por debajo pierden calidad fuera de muestra. En verde, las que forman meseta.',
        'Each point is a configuration. The diagonal marks &laquo;no degradation&raquo;. Points below lose quality out of sample. In green, those that form a plateau.',
      )}</p>
    </section>
    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Degradacion', 'Degradation')}</div><h2>${L('Que le pasa a tus mejores', 'What happens to your best')}</h2></div></div>
      ${degradationChart(a)}
      <p class="chart-note">${L(
        'Si D10 (tus mejores in-sample) no destaca sobre el resto, el ranking que usas para elegir no tiene valor predictivo.',
        'If D10 (your best in-sample) does not stand out from the rest, the ranking you use to choose has no predictive value.',
      )}</p>
    </section>
  </div>`;
}

function samplingLabel(sampling) {
  return {
    grid: L('rejilla completa', 'full grid'),
    partial: L('cobertura parcial', 'partial coverage'),
    sparse: L('muestreo disperso / genético', 'sparse / genetic sampling'),
  }[sampling] || sampling;
}

function renderOutcomeBanner(a) {
  const outcome = outcomeFromAnalysis(a);
  if (outcome.code === CODE.ANALYSIS_SUCCESS) return '';
  const copy = errorCopy(outcome.code, L);
  const cls = {
    [CODE.NO_QUALIFYING_CONFIGS]: 'outcome-no-qualifying',
    [CODE.INSUFFICIENT_DATA]: 'outcome-insufficient',
    [CODE.NO_PLATEAU]: 'outcome-no-plateau',
  }[outcome.code] || 'outcome-other';
  return `<section class="outcome-banner ${cls}" role="status">
    <strong>${esc(copy.title)}</strong>
    <p>${esc(copy.hint)}</p>
  </section>`;
}

function renderEvidenceSheet(a, best) {
  const hasF = a.meta.hasForward;
  const cov = a.meta.coverage;
  const sc = a.meta.searchCoverage;
  let covTxt = Number.isFinite(cov)
    ? `${nf(cov >= 0.1 ? 1 : 4).format(cov * 100)} % · ${samplingLabel(a.meta.sampling)}`
    : '—';
  if (sc && sc.usable && Number.isFinite(sc.coverageSearch)) {
    covTxt += L(
      ` · .set ${nf(sc.coverageSearch >= 0.1 ? 1 : 2).format(sc.coverageSearch * 100)} %`,
      ` · .set ${nf(sc.coverageSearch >= 0.1 ? 1 : 2).format(sc.coverageSearch * 100)} %`,
    );
  } else if (!sc || !sc.present) {
    covTxt += L(' · sin .set', ' · no .set');
  }

  const covNote = sc && sc.usable && Number.isFinite(sc.coverageSearch)
    ? L(
      'Primero: fracción de la malla de niveles vistos en el archivo. Segundo (.set): fracción del espacio que pediste en MT5. Un genético puede subir el primero y dejar el segundo muy bajo.',
      'First: fraction of the seen-level grid in the file. Second (.set): fraction of the space you asked MT5 for. A genetic can inflate the first while leaving the second very low.',
    )
    : L(
      'Fracción del espacio de niveles vistos en tus archivos — no del rango del .set. Suelta el .set de la optimización para contrastarlo.',
      'Fraction of the seen-level space in your files — not the .set range. Drop the optimization .set to contrast it.',
    );
  const nb = best && best.neighborhood;
  let neighborsVal = '—';
  let neighborsNote = L('Sin meseta seleccionada', 'No plateau selected');
  if (nb) {
    neighborsVal = `${int(nb.passing)} / ${int(nb.observed)}`;
    const bits = [
      L(`${int(nb.passing)} pasan mínimos`, `${int(nb.passing)} pass minima`),
      L(`${int(nb.failing)} fallan`, `${int(nb.failing)} fail`),
    ];
    if (nb.slotsComplete && Number.isFinite(nb.gaps)) {
      bits.push(L(`${int(nb.gaps)} huecos no observados (de ${int(nb.slots)})`, `${int(nb.gaps)} unobserved gaps (of ${int(nb.slots)})`));
    } else {
      bits.push(L('huecos no estimables en este muestreo', 'gaps not estimable for this sampling'));
    }
    neighborsNote = bits.join(' · ');
  }

  const retentionVal = best && Number.isFinite(best.medianRetention)
    ? pct(best.medianRetention, 0)
    : (best && hasF && Number.isFinite(best.record.retention) ? pct(best.record.retention, 0) : '—');
  const retentionNote = hasF
    ? L('Retención de calidad en el forward (participó en la selección)', 'Quality retention on forward (took part in selection)')
    : L('Sin archivo forward', 'No forward file');

  const boundaryVal = best
    ? (best.boundary.length
      ? L(`Sí · ${best.boundary.map((b) => b.name).join(', ')}`, `Yes · ${best.boundary.map((b) => b.name).join(', ')}`)
      : L('No', 'No'))
    : '—';
  const boundaryNote = L(
    'Si toca el borde, la meseta podría continuar fuera del rango que optimizaste.',
    'If it touches the edge, the plateau may continue outside the range you optimized.',
  );

  const hold = holdoutFact(a);
  const holdoutVal = hold.value;
  const holdoutNote = hold.note;

  const plateauVal = best
    ? L(`Encontrada · M${best.rank} · ${int(best.size)} configs`, `Found · M${best.rank} · ${int(best.size)} configs`)
    : L('No encontrada', 'Not found');

  const rows = [
    [L('Meseta', 'Plateau'), plateauVal, L('Región conexa con soporte local, no un pico aislado.', 'Connected region with local support, not an isolated peak.')],
    [L('Cobertura de la optimización', 'Optimization coverage'), covTxt, covNote],
    [L('Vecinas (pasan / observadas)', 'Neighbors (pass / observed)'), neighborsVal, neighborsNote],
    [L('Retención forward', 'Forward retention'), retentionVal, retentionNote],
    [L('Toca borde del rango', 'Touches search boundary'), boundaryVal, boundaryNote],
    [L('Holdout independiente', 'Independent holdout'), holdoutVal, holdoutNote],
  ];

  return `<section class="panel panel-evidence-sheet" aria-label="${esc(L('Hoja de evidencia', 'Evidence sheet'))}">
    <div class="panel-head compact">
      <div>
        <div class="panel-kicker">${L('Evidencia', 'Evidence')}</div>
        <h2>${L('Qué demuestran estos datos', 'What these data demonstrate')}</h2>
      </div>
    </div>
    <div class="evidence-sheet">
      ${rows.map(([label, value, note]) => `<div class="evidence-sheet-row" title="${esc(note)}">
        <span>${esc(label)}</span>
        <strong>${esc(value)}</strong>
        <em>${esc(note)}</em>
      </div>`).join('')}
    </div>
    <p class="chart-note">${L(
      'Forward forma parte de la selección. Un holdout no visto es la comprobación limpia. Una meseta es estabilidad en tu muestra — no una promesa de beneficio futuro.',
      'Forward takes part in selection. An unseen holdout is the clean check. A plateau is stability in your sample — not a promise of future profit.',
    )}</p>
  </section>`;
}

function renderWhyGrade(a) {
  const findings = a.verdict.findings || [];
  const pros = findings.filter((f) => f.severity === 'ok' || f.severity === 'info').slice(0, 4);
  const cons = findings.filter((f) => f.severity === 'warn' || f.severity === 'critical').slice(0, 4);
  if (!pros.length && !cons.length) return '';
  const col = (title, items, cls) => `<div class="why-col ${cls}">
    <h3>${esc(title)}</h3>
    <ul>${items.length
      ? items.map((f) => `<li><strong>${esc(f.title)}</strong><span>${esc(f.detail)}</span></li>`).join('')
      : `<li class="why-empty">${L('Nada destacado', 'Nothing notable')}</li>`}
    </ul>
  </div>`;
  return `<section class="panel panel-why">
    <div class="panel-head compact">
      <div>
        <div class="panel-kicker">${L('Lectura', 'Reading')}</div>
        <h2>${L('Por qué este grado de evidencia', 'Why this evidence grade')}</h2>
      </div>
    </div>
    <div class="why-grid">
      ${col(L('A favor', 'In favor'), pros, 'why-pros')}
      ${col(L('En contra / límites', 'Against / limits'), cons, 'why-cons')}
    </div>
  </section>`;
}

function renderStableRanges(a, best) {
  const sens = a.sensitivity || [];
  const sensByName = new Map(sens.map((s) => [s.name, s]));
  const rows = (best.refinement || []).filter((r) => !r.constant && !r.fixed && !r.categorical && r.levels > 1);
  if (!rows.length) return '';
  const sensLabel = (name) => {
    const s = sensByName.get(name);
    const v = s && Number.isFinite(s.effective) ? s.effective : (s && s.sensitivity);
    if (!Number.isFinite(v)) return '—';
    if (v < 0.2) return L('Baja', 'Low');
    if (v < 0.45) return L('Media', 'Medium');
    return L('Alta', 'High');
  };
  return `<section class="panel panel-ranges">
    <div class="panel-head compact">
      <div>
        <div class="panel-kicker">${L('Rangos estables', 'Stable ranges')}</div>
        <h2>${L('Cuánto puedes mover cada parámetro', 'How far you can move each parameter')}</h2>
      </div>
      <button class="ghost-btn" data-export="refine" data-plateau-index="${best.rank - 1}">${L('.set de refinamiento', 'Refinement .set')}</button>
    </div>
    <p class="chart-note">${L(
      'Centro recomendado = Pass seleccionado. La zona es el rango de refinamiento alrededor de la meseta — no un intervalo de confianza.',
      'Recommended center = selected Pass. The zone is the refinement range around the plateau — not a confidence interval.',
    )}</p>
    <div class="range-table-wrap">
      <table class="range-table">
        <thead>
          <tr>
            <th>${L('Parámetro', 'Parameter')}</th>
            <th>${L('Centro', 'Center')}</th>
            <th>${L('Zona estable', 'Stable zone')}</th>
            <th>${L('Sensibilidad', 'Sensitivity')}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => `<tr>
            <td>${esc(r.name)}</td>
            <td class="mono">${paramValue(r.center)}</td>
            <td class="mono">${paramValue(r.start)} – ${paramValue(r.stop)}</td>
            <td>${sensLabel(r.name)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </section>`;
}

/**
 * Las tres mejores configuraciones, una al lado de otra y con TODOS sus parametros.
 *
 * Se comparan en columnas a propósito: cuando tres mesetas independientes coinciden
 * en el valor de un parámetro, ese valor es una conclusión solida del analisis. Y
 * donde discrepan, es que ese parámetro no decide el resultado, así que puedes
 * elegirlo por criterios operativos y dejar de afinarlo.
 */
function renderTop3(a) {
  const top = a.plateaus.slice(0, 3);
  if (!top.length) {
    return `<section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Decisión', 'Decision')}</div><h2>${L('Configuraciones ganadoras', 'Winning configurations')}</h2></div></div>
      <p class="muted">${L(
        'No hay ninguna región que cumpla los mínimos con estabilidad suficiente, así que no se propone ninguna configuracion. Revisa el',
        'No region meets the minima with enough stability, so no configuration is proposed. Check the',
      )} <button class="text-btn" data-goto="diagnostics">${L('diagnostico', 'diagnostics')}</button> ${L('para ver por que.', 'to see why.')}</p>
    </section>`;
  }
  const names = a.meta.paramNames;
  const agree = names.map((_, j) => {
    const vals = top.map((p) => p.record.params[j]);
    return vals.every((v) => v === vals[0]);
  });
  const agreeCount = agree.filter(Boolean).length;
  const WORD = {
    1: L('una', 'one'),
    2: L('dos', 'two'),
    3: L('tres', 'three'),
  };
  const word = WORD[top.length] || String(top.length);
  const showConsensus = top.length >= 2;
  const hasF = a.meta.hasForward;
  const featured = top[0];
  const alts = top.slice(1);

  const flagBadges = (p) => {
    const flags = [];
    if (p.invertedRisk && p.invertedRisk.length) {
      flags.push(`<span class="badge warn" title="${esc(L('Se apoya en un valor que el forward castiga', 'It relies on a value the forward punishes'))}">${L('valor castigado', 'punished value')}</span>`);
    }
    if (p.boundary.length) {
      flags.push(`<span class="badge warn" title="${esc(L('Pegada al borde del rango probado', 'Stuck to the edge of the tested range'))}">${L('borde', 'edge')}</span>`);
    }
    return flags.join(' ') || `<span class="badge ok">${L('sin avisos', 'no warnings')}</span>`;
  };

  const featuredCard = `<article class="t3-featured">
    <div class="t3-featured-head">
      <div>
        <div class="t3-rank">${L('Recomendada', 'Recommended')}</div>
        <div class="t3-pass">Pass ${esc(featured.record.id)}</div>
        <div class="t3-flags">${flagBadges(featured)}</div>
      </div>
      <div class="t3-score">${num(featured.robust, 0)}<small>${L('robustez', 'robustness')}</small></div>
    </div>
    <div class="t3-featured-metrics">
      <div><span>${L('Meseta', 'Plateau')}</span><strong>M${featured.rank} · ${int(featured.size)}</strong></div>
      <div><span>${L('Pasan / observadas', 'Pass / observed')}</span><strong>${featured.neighborhood
        ? `${int(featured.neighborhood.passing)} / ${int(featured.neighborhood.observed)}`
        : `${int(featured.stability.support)}`}</strong></div>
      <div><span>${L('Calidad IS', 'IS quality')}</span><strong>${num(featured.record.qualityIs, 2)}</strong></div>
      ${hasF ? `<div><span>${L('Calidad FW', 'FW quality')}</span><strong>${num(featured.record.qualityOos, 2)}</strong></div>` : ''}
    </div>
    <div class="t3-param-chips">
      ${names.map((n, j) => `<span class="${agree[j] && showConsensus ? 't3-chip-agree' : ''}">${esc(n)} <b>${paramValue(featured.record.params[j])}</b></span>`).join('')}
    </div>
    <div class="t3-featured-actions">
      <button class="primary-btn t3-btn-inline" data-export="set" data-plateau-index="${featured.rank - 1}">${L('Descargar .set', 'Download .set')}</button>
      <button class="ghost-btn t3-btn-inline" data-copy="${featured.rank - 1}">${L('Copiar parámetros', 'Copy parameters')}</button>
      <button class="text-btn t3-btn-inline" data-plateau="${featured.rank - 1}">${L('Ver detalle →', 'View detail →')}</button>
    </div>
  </article>`;

  const altCards = alts.length
    ? `<div class="t3-alts">
        ${alts.map((p, i) => `<article class="t3-alt">
          <div class="t3-rank">${L(`Alternativa ${i + 1}`, `Alternative ${i + 1}`)}</div>
          <div class="t3-pass">Pass ${esc(p.record.id)}</div>
          <div class="t3-score t3-score-sm">${num(p.robust, 0)}<small>${L('robustez', 'robustness')}</small></div>
          <div class="t3-flags">${flagBadges(p)}</div>
          <p class="t3-alt-meta">M${p.rank} · ${int(p.size)} ${L('configs', 'configs')} · ${int(p.stability.support)} ${L('vecinos', 'neighbors')}</p>
          <div class="t3-alt-actions">
            <button class="ghost-btn t3-btn-inline" data-export="set" data-plateau-index="${p.rank - 1}">.set</button>
            <button class="text-btn t3-btn-inline" data-plateau="${p.rank - 1}">${L('Detalle →', 'Detail →')}</button>
          </div>
        </article>`).join('')}
      </div>`
    : '';

  const header = top.map((p, i) => `<th class="t3-col ${i === 0 ? 't3-best' : ''}">
      <div class="t3-rank">${i === 0 ? L('Recomendada', 'Recommended') : L(`Alternativa ${i}`, `Alternative ${i}`)}</div>
      <div class="t3-pass">Pass ${esc(p.record.id)}</div>
    </th>`).join('');

  const metricRow = (label, fn, cls = '') => `<tr class="${cls}">
    <th class="t3-label">${esc(label)}</th>
    ${top.map((p, i) => `<td class="t3-col ${i === 0 ? 't3-best' : ''}">${fn(p)}</td>`).join('')}
  </tr>`;

  const paramRows = names.map((n, j) => `<tr class="${agree[j] ? 't3-agree' : ''}">
    <th class="t3-label mono">${esc(n)}${agree[j] ? `<span class="t3-tick" title="${esc(L(`Coinciden las ${word}`, `The ${word} agree`))}">✓</span>` : ''}</th>
    ${top.map((p, i) => `<td class="t3-col t3-value ${i === 0 ? 't3-best' : ''}">${paramValue(p.record.params[j])}</td>`).join('')}
  </tr>`).join('');

  return `<section class="panel t3-panel panel-recommend">
    <div class="panel-head">
      <div>
        <div class="panel-kicker">${L('Decisión', 'Decision')}</div>
        <h2>${top.length === 1
          ? L('Configuración ganadora', 'Winning configuration')
          : L(`Top ${top.length}: configuraciones ganadoras`, `Top ${top.length}: winning configurations`)}</h2>
      </div>
      ${showConsensus ? `<div class="t3-consensus">
        <strong>${L(`${agreeCount} de ${names.length}`, `${agreeCount} of ${names.length}`)}</strong>
        <span>${L(`parámetros en los que coinciden las ${word}`, `parameters where the ${word} agree`)}</span>
      </div>` : ''}
    </div>
    <p class="panel-intro">
      ${top.length === 1
        ? L(
          `Es la única región estable que ha superado los mínimos con soporte suficiente. Se elige por
           criterio maximin: es la configuración cuyo <em>peor</em> vecino es el mejor posible, no la que
           más rinde. Al haber una sola meseta no hay consenso entre regiones que contrastar.`,
          `It is the only stable region that cleared the minima with enough support. It is chosen by
           maximin: the configuration whose <em>worst</em> neighbor is the best possible, not the one
           that performs most. With a single plateau there is no cross-region consensus to contrast.`,
        )
        : L(
          `La recomendada es la meseta más sólida por criterio maximin. Las alternativas son otras
           regiones estables independientes: útiles si la recomendada choca con un criterio operativo.
           Las filas con <span class="t3-tick">✓</span> son el consenso más sólido del análisis.`,
          `The recommended pick is the strongest plateau by maximin. Alternatives are other
           independent stable regions — useful if the recommended one conflicts with an operational constraint.
           Rows with <span class="t3-tick">✓</span> are the most solid consensus in the analysis.`,
        )}
    </p>
    <div class="t3-podium">
      ${featuredCard}
      ${altCards}
    </div>
    ${showConsensus || top.length > 1 ? `<div class="table-wrap t3-compare-wrap">
      <table class="t3-table">
        <thead><tr><th class="t3-label">${L('Comparación', 'Comparison')}</th>${header}</tr></thead>
        <tbody>
          ${metricRow(L('Meseta', 'Plateau'), (p) => `M${p.rank} · ${int(p.size)} ${L('configs', 'configs')}${p.coreSize ? ` (${L('nucleo', 'core')} ${int(p.coreSize)})` : ''}`)}
          ${metricRow(L('Calidad in-sample', 'In-sample quality'), (p) => `${num(p.record.qualityIs, 2)} <em class="t3-tag">${esc(qualityLabel(p.record.qualityIs))}</em>`)}
          ${hasF ? metricRow(L('Calidad forward', 'Forward quality'), (p) => `${num(p.record.qualityOos, 2)} <em class="t3-tag">${esc(qualityLabel(p.record.qualityOos))}</em>`) : ''}
          ${hasF ? metricRow(L('Forward · PF / DD / ops', 'Forward · PF / DD / trades'), (p) => `${num(p.record.oos.profitFactor, 3)} / ${num(p.record.oos.drawdown, 1)}% / ${int(p.record.oos.trades)}`) : ''}
          ${metricRow(L('In-sample · PF / DD / ops', 'In-sample · PF / DD / trades'), (p) => `${num(p.record.is.profitFactor, 3)} / ${num(p.record.is.drawdown, 1)}% / ${int(p.record.is.trades)}`)}
          ${metricRow(L('Vecinas / suelo Q25', 'Neighbors / Q25 floor'), (p) => `${int(p.stability.support)} / ${num(p.stability.q25, 2)}`, 't3-sep')}
          <tr class="t3-params-head"><th class="t3-label" colspan="${top.length + 1}">${L('Parámetros de entrada', 'Input parameters')}</th></tr>
          ${paramRows}
        </tbody>
      </table>
    </div>` : ''}
  </section>`;
}

function renderRepCard(a, p) {
  const r = p.record;
  const hasF = a.meta.hasForward;
  return `<div class="rep-card">
    <div class="rep-head">
      <div>
        <div class="rep-pass">Pass ${esc(r.id)}</div>
        <div class="rep-sub">${L('Meseta', 'Plateau')} ${p.rank} · ${int(p.size)} ${L('configuraciones', 'configurations')}${p.coreSize ? ` · ${L('nucleo de', 'core of')} ${int(p.coreSize)}` : ''}</div>
      </div>
      <div class="rep-score">${num(p.robust, 0)}<small>${L('robustez', 'robustness')}</small></div>
    </div>
    <div class="param-grid">
      ${a.meta.paramNames.map((n, j) => `<div class="param"><span>${esc(n)}</span><strong>${paramValue(r.params[j])}</strong></div>`).join('')}
    </div>
    <div class="evidence-list">
      <div><span>${L('Calidad in-sample', 'In-sample quality')}</span><strong>${num(r.qualityIs, 2)} <em>${esc(qualityLabel(r.qualityIs))}</em></strong></div>
      ${hasF ? `<div><span>${L('Calidad forward', 'Forward quality')}</span><strong>${num(r.qualityOos, 2)} <em>${esc(qualityLabel(r.qualityOos))}</em></strong></div>` : ''}
      <div><span>${L('Vecinas observadas', 'Observed neighbors')}</span><strong>${p.neighborhood ? int(p.neighborhood.observed) : int(p.stability.support)}</strong></div>
      <div><span>${L('Pasan mínimos / fallan', 'Pass minima / fail')}</span><strong>${p.neighborhood
        ? `${int(p.neighborhood.passing)} / ${int(p.neighborhood.failing)}`
        : pct(p.stability.fracPass, 0)}</strong></div>
      ${p.neighborhood && p.neighborhood.slotsComplete
        ? `<div><span>${L('Huecos no observados', 'Unobserved gaps')}</span><strong>${int(p.neighborhood.gaps)} <em>${L('de', 'of')} ${int(p.neighborhood.slots)}</em></strong></div>`
        : ''}
      <div><span>${L('Suelo de su entorno (Q25)', 'Neighborhood floor (Q25)')}</span><strong>${num(p.stability.q25, 2)}</strong></div>
      ${hasF ? `<div><span>${L('Forward · PF / DD / ops', 'Forward · PF / DD / trades')}</span><strong>${num(r.oos.profitFactor, 3)} / ${num(r.oos.drawdown, 1)}% / ${int(r.oos.trades)}</strong></div>` : ''}
      <div><span>${L('In-sample · PF / DD / ops', 'In-sample · PF / DD / trades')}</span><strong>${num(r.is.profitFactor, 3)} / ${num(r.is.drawdown, 1)}% / ${int(r.is.trades)}</strong></div>
    </div>
    ${p.invertedRisk && p.invertedRisk.length ? `<div class="inline-warn">${L(
      `Se apoya en ${p.invertedRisk.map((x) => `<code>${esc(x.name)} = ${paramValue(x.bestIs)}</code>`).join(', ')}, el valor que gana en el in-sample pero que el forward castiga. Puede ser merito suyo o suerte.`,
      `It relies on ${p.invertedRisk.map((x) => `<code>${esc(x.name)} = ${paramValue(x.bestIs)}</code>`).join(', ')}, the value that wins in-sample but that the forward punishes. It may be merit or luck.`,
    )}</div>` : ''}
    ${p.boundary.length ? `<div class="inline-warn">${L(
      `Pegada al borde del rango en: ${p.boundary.map((b) => `<code>${esc(b.name)} = ${paramValue(b.atMin ? b.min : b.max)}</code>`).join(', ')}`,
      `Stuck to the range edge at: ${p.boundary.map((b) => `<code>${esc(b.name)} = ${paramValue(b.atMin ? b.min : b.max)}</code>`).join(', ')}`,
    )}</div>` : ''}
    <div class="rep-actions">
      <button class="ghost-btn" data-copy="${p.rank - 1}">${L('Copiar parámetros', 'Copy parameters')}</button>
      <button class="ghost-btn" data-export="set">${L('Descargar .set', 'Download .set')}</button>
      <button class="ghost-btn" data-export="refine">${L('.set de refinamiento', 'Refinement .set')}</button>
      <button class="text-btn" data-plateau="0">${L('Ver la meseta completa &rarr;', 'View the full plateau &rarr;')}</button>
    </div>
  </div>`;
}

function renderPlateaus(a) {
  if (!a.plateaus.length) {
    return `<div class="detail-head"><div class="detail-kicker">${L('02 / Mesetas', '02 / Plateaus')}</div><h2>${L('No se ha encontrado ninguna meseta', 'No plateau was found')}</h2>
      <p>${L(
        'Ninguna región conexa supera los mínimos con estabilidad suficiente. Revisa el diagnostico: lo habitual es que falten datos, que el rango probado sea demasiado estrecho o que la estrategia no tenga ventaja.',
        'No connected region clears the minima with enough stability. Check diagnostics: usually data are missing, the tested range is too narrow, or the strategy has no edge.',
      )}</p></div>
      <button class="text-btn" data-goto="diagnostics">${L('Ir al diagnostico &rarr;', 'Go to diagnostics &rarr;')}</button>`;
  }
  const sel = a.plateaus[Math.min(state.selectedPlateau, a.plateaus.length - 1)];
  const rows = a.plateaus.map((p) => `<tr class="${p.rank === sel.rank ? 'sel' : ''}">
      <td><button class="link-btn" data-plateau="${p.rank - 1}">M${p.rank}</button></td>
      <td class="mono">${esc(p.record.id)}</td>
      <td class="strong">${num(p.robust, 0)}</td>
      <td>${int(p.size)}</td>
      <td>${int(p.coreSize)}</td>
      <td>${num(p.q10Score, 2)}</td>
      <td>${num(p.medianScore, 2)}</td>
      <td>${num(p.coherence, 2)}</td>
      <td>${p.boundary.length ? `<span class="badge warn">${p.boundary.length}</span>` : '<span class="badge ok">0</span>'}</td>
    </tr>`).join('');

  return `<div class="detail-head">
      <div class="detail-kicker">${L('02 / Mesetas', '02 / Plateaus')}</div>
      <h2>${L('Regiones estables detectadas', 'Stable regions detected')}</h2>
      <p>${L(
        'Ordenadas por el <strong>suelo</strong> de la región, no por su cima. Una meseta es un conjunto conexo de configuraciones donde incluso el cuartil bajo del entorno mantiene calidad buena.',
        'Ordered by the region <strong>floor</strong>, not its peak. A plateau is a connected set of configurations where even the lower quartile of the neighborhood keeps good quality.',
      )}</p>
    </div>
    <section class="panel">
      <div class="table-wrap"><table>
        <thead><tr><th>#</th><th>${L('Pass repr.', 'Repr. pass')}</th><th>${L('Robustez', 'Robustness')}</th><th>${L('Tamaño', 'Size')}</th><th>${L('Nucleo', 'Core')}</th><th>${L('Suelo (Q10)', 'Floor (Q10)')}</th><th>${L('Mediana', 'Median')}</th><th>${L('Dispersión', 'Dispersion')}</th><th>${L('Bordes', 'Edges')}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </section>

    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Meseta', 'Plateau')} ${sel.rank}</div><h2>${L('Configuración representativa', 'Representative configuration')}</h2></div>
        <span class="status-pill">${L('elegida por criterio maximin', 'chosen by maximin')}</span></div>
      ${renderRepCard(a, sel)}
    </section>

    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Siguiente paso', 'Next step')}</div><h2>${L('Rango para reoptimizar en rejilla', 'Range for grid re-optimization')}</h2></div></div>
      <p class="panel-intro">${L(
        `Vuelve a MT5 y lanza una optimizacion <em>Todos los parámetros</em> acotada a este rango, centrado en la configuración recomendada. Sobre una rejilla completa la geometría de la meseta se mide sin los huecos que deja el genetico. Son <strong>${int(sel.refinement.reduce((acc, x) => acc * (x.constant ? 1 : x.levels), 1))} combinaciones</strong>, un tamaño que se puede ejecutar de verdad.`,
        `Go back to MT5 and run an <em>All parameters</em> optimization bounded to this range, centered on the recommended configuration. On a full grid the plateau geometry is measured without the gaps the genetic leaves. That is <strong>${int(sel.refinement.reduce((acc, x) => acc * (x.constant ? 1 : x.levels), 1))} combinations</strong> — a size you can actually run.`,
      )}</p>
      <div class="table-wrap"><table>
        <thead><tr><th>${L('Parámetro', 'Parameter')}</th><th>${L('Centro', 'Center')}</th><th>${L('Inicio', 'Start')}</th><th>${L('Paso', 'Step')}</th><th>${L('Fin', 'Stop')}</th><th>${L('Niveles', 'Levels')}</th></tr></thead>
        <tbody>${sel.refinement.map((x) => `<tr>
          <td class="mono">${esc(x.name)}</td>
          ${x.constant
            ? `<td>${paramValue(x.value)}</td><td colspan="4" class="muted">${L('no se optimizo', 'was not optimised')}</td>`
            : x.fixed
              ? `<td class="strong">${paramValue(x.center)}</td><td colspan="4" class="muted">${x.categorical
                ? L('booleano o enumeracion: se fija, actívalo a mano si quieres barrerlo', 'boolean or enum: fixed; enable manually if you want to sweep it')
                : L('se fija: el presupuesto de la rejilla se gasta en parámetros más influyentes', 'fixed: the grid budget is spent on more influential parameters')}</td>`
              : `<td class="strong">${paramValue(x.center)}</td><td>${paramValue(x.start)}</td><td>${paramValue(x.step)}</td><td>${paramValue(x.stop)}</td><td>${int(x.levels)}</td>`}
        </tr>`).join('')}</tbody>
      </table></div>
      <div class="rep-actions"><button class="ghost-btn" data-export="refine">${L('Descargar .set de refinamiento', 'Download refinement .set')}</button></div>
    </section>`;
}

function renderRejected(a) {
  const critName = a.meta.hasForward
    ? (a.meta.criterionOosName || L('criterio forward', 'forward criterion'))
    : (a.meta.criterionIsName || L('criterio', 'criterion'));
  if (!a.peaks.length) {
    return `<div class="detail-head"><div class="detail-kicker">${L('03 / Descartes', '03 / Rejected')}</div><h2>${L('Ningún descarte entre las mejores por tu criterio', 'No rejections among the best by your criterion')}</h2>
      <p>${L(
        'Las configuraciones que encabezan tu ranking caen dentro de alguna meseta. Es poco habitual y es buena señal.',
        'The configurations that top your ranking fall inside some plateau. That is uncommon and a good sign.',
      )}</p></div>`;
  }
  return `<div class="detail-head">
      <div class="detail-kicker">${L('03 / Descartes', '03 / Rejected')}</div>
      <h2>${L('Las que encabezan tu tabla y aún así no se recomiendan', 'Ones that top your table and still are not recommended')}</h2>
      <p>${L(
        `Ordenadas por <code>${esc(critName)}</code>, que es la columna por la que MT5 te las presenta. Para cada una se indica por que el motor no la respalda. Esta es la tabla que evita la mayoria de los errores.`,
        `Ordered by <code>${esc(critName)}</code>, the column MT5 presents them by. For each one the engine explains why it does not back it. This is the table that prevents most mistakes.`,
      )}</p>
    </div>
    <section class="panel">
      <div class="table-wrap"><table>
        <thead><tr><th>${L('Puesto', 'Rank')}</th><th>Pass</th><th>${esc(critName)}</th><th>${L('Calidad', 'Quality')}</th><th>${L('Vecinas', 'Neighbors')}</th><th>${L('Suelo entorno', 'Neighborhood floor')}</th><th>${L('Motivo del descarte', 'Rejection reason')}</th></tr></thead>
        <tbody>${a.peaks.map((p) => `<tr>
          <td><span class="rank-mini">#${int(p.criterionRank)}</span></td>
          <td class="mono">${esc(p.record.id)}</td>
          <td class="strong">${num(p.key, 2)}</td>
          <td>${num(p.score, 2)}</td>
          <td>${int(p.st.support)}</td>
          <td>${num(p.st.q25, 2)}</td>
          <td class="reasons">${p.reasons.map((r) => `<span class="reason">${esc(r)}</span>`).join('')}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>`;
}

function renderParams(a) {
  const [dimA, dimB] = topTwoSensitive(a);
  const options = a.sensitivity.map((s) => `<option value="${s.index}"${s.index === state.selectedParam ? ' selected' : ''}${s.constant ? ' disabled' : ''}>${esc(s.name)}${s.constant ? L(' (constante)', ' (constant)') : ''}</option>`).join('');
  return `<div class="detail-head">
      <div class="detail-kicker">${L('04 / Parámetros', '04 / Parameters')}</div>
      <h2>${L('Que parámetros mandan de verdad', 'Which parameters really matter')}</h2>
      <p>${L(
        'La sensibilidad mide cuánto se mueve la calidad al recorrer los valores de un parámetro. Los numéricos que influyen <strong>miden la distancia</strong>. Los booleanos y las enumeraciones <strong>parten el espacio</strong>: dos configuraciones solo son vecinas si coinciden en ellos, porque activar o no un filtro no es un paso pequeño sino otra estrategia. Solo se ignora lo demostrablemente plano.',
        'Sensitivity measures how much quality moves as you walk a parameter\'s values. Influential numerics <strong>measure distance</strong>. Booleans and enums <strong>partition the space</strong>: two configurations are neighbors only if they match on them, because enabling a filter is not a small step — it is another strategy. Only demonstrably flat axes are ignored.',
      )}</p>
      ${a.meta.releasedBlockNames && a.meta.releasedBlockNames.length ? `<div class="inline-warn">${L(
        `Para conseguir vecinos suficientes se ha dejado de particionar por ${a.meta.releasedBlockNames.map((n) => `<code>${esc(n)}</code>`).join(', ')}, el menos influyente. Las configuraciones que solo difieran en ${a.meta.releasedBlockNames.length > 1 ? 'esos parámetros' : 'ese parámetro'} se consideran vecinas.`,
        `To get enough neighbors, partitioning was released on ${a.meta.releasedBlockNames.map((n) => `<code>${esc(n)}</code>`).join(', ')}, the least influential. Configurations that differ only on ${a.meta.releasedBlockNames.length > 1 ? 'those parameters' : 'that parameter'} are treated as neighbors.`,
      )}</div>` : ''}
    </div>
    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Sensibilidad', 'Sensitivity')}</div><h2>${L('Influencia relativa', 'Relative influence')}</h2></div></div>
      ${sensitivityBars(a)}
    </section>
    ${a.inversions && a.inversions.length ? `<section class="panel warn-panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Aviso', 'Warning')}</div><h2>${L('Parámetros invertidos entre periodos', 'Parameters inverted across periods')}</h2></div>
        <span class="status-pill warn-pill">${int(a.inversions.length)} ${L('detectados', 'detected')}</span></div>
      <p class="panel-intro">${L(
        'En estos parámetros, el valor que gana en el in-sample <strong>es de los que pierden en el forward</strong>. Es la causa mecánica de que el ranking no transfiera: la señal no falta, apunta al revés. Afinarlos sobre el in-sample es tiempo perdido; déjalos en un valor central y decide con los que sí son coherentes entre periodos.',
        'On these parameters, the value that wins in-sample <strong>is among those that lose on forward</strong>. That is the mechanical reason the ranking fails to transfer: the signal is not missing — it points the wrong way. Fine-tuning them on in-sample is wasted time; leave them at a central value and decide with the ones that are coherent across periods.',
      )}</p>
      <div class="table-wrap"><table>
        <thead><tr><th>${L('Parámetro', 'Parameter')}</th><th>${L('Gana en IS', 'Wins in IS')}</th><th>${L('Gana en forward', 'Wins in forward')}</th><th>${L('Margen que tiras', 'Margin you waste')}</th><th>${L('Perfil de calidad (valor: IS / forward)', 'Quality profile (value: IS / forward)')}</th></tr></thead>
        <tbody>${a.inversions.map((x) => `<tr>
          <td class="mono">${esc(x.name)}</td>
          <td class="strong">${paramValue(x.bestIs)}</td>
          <td class="strong">${paramValue(x.bestOos)}</td>
          <td><span class="badge warn">${pct(x.regretShare, 0)}</span></td>
          <td class="values">${x.profile.map((p) => `${paramValue(p.level)}: ${num(p.is, 2)}/${num(p.oos, 2)}`).join('  ·  ')}</td>
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
        'Caja: recorrido intercuartilico de la calidad entre las configuraciones que pasan los minimos. Linea: mediana. Una caida brusca de un valor al siguiente es un acantilado.',
        'Box: interquartile range of quality among configurations that pass the minima. Line: median. A sharp drop from one value to the next is a cliff.',
      )}</p>
    </section>
    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Mapa', 'Map')}</div><h2>${L('Los dos parámetros más influyentes', 'The two most influential parameters')}</h2></div></div>
      ${plateauHeatmap(a, dimA, dimB)}
      <p class="chart-note">${L(
        'Calidad mediana de cada combinacion. Las zonas claras contiguas son mesetas; una celda clara rodeada de oscuras es un pico.',
        'Median quality of each combination. Contiguous light zones are plateaus; a light cell surrounded by dark ones is a peak.',
      )}</p>
    </section>
    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Rangos', 'Ranges')}</div><h2>${L('Valores probados', 'Values tested')}</h2></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>${L('Parámetro', 'Parameter')}</th><th>${L('Niveles', 'Levels')}</th><th>${L('Sensibilidad', 'Sensitivity')}</th><th>${L('Papel en el motor', 'Role in the engine')}</th><th>${L('Valores', 'Values')}</th></tr></thead>
        <tbody>${a.sensitivity.map((s) => `<tr>
          <td class="mono">${esc(s.name)}${a.meta.paramTypes && a.meta.paramTypes[s.index] !== 'number' ? ` <span class="badge">${esc(a.meta.paramTypes[s.index] === 'bool' ? 'bool' : 'enum')}</span>` : ''}</td>
          <td>${int(s.levels)}</td>
          <td>${s.constant ? '—' : num(s.sensitivity, 2)}</td>
          <td>${roleBadge(dimRole(a, s))}</td>
          <td class="values">${(s.values || []).map(paramValue).join(' · ')}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>`;
}

function renderDiagnostics(a) {
  const g = a.meta.policy.gates;
  const integ = a.integrity;
  const prov = integ.provenance || {};
  const samplingCopy = {
    grid: L('Rejilla completa o casi completa. Es el escenario ideal: la vecindad es exacta.',
      'Full or near-full grid. Ideal case: neighborhood is exact.'),
    partial: L('Rejilla parcial. La vecindad es razonable pero tiene huecos.',
      'Partial grid. Neighborhood is reasonable but has gaps.'),
    sparse: L('Muestreo disperso, típico del algoritmo genetico. El optimizador concentro las pruebas donde el in-sample era bueno, así que la densidad local mide también donde miro el, no solo donde hay estabilidad.',
      'Sparse sampling, typical of the genetic algorithm. The optimizer concentrated trials where in-sample was good, so local density also measures where it looked, not only where there is stability.'),
  }[a.meta.sampling];

  const sameOpt = prov.checked
    ? (prov.mismatches === 0
      ? L('confirmada', 'confirmed')
      : L(`${int(prov.mismatches)} discrepancias`, `${int(prov.mismatches)} mismatches`))
    : L('no comprobable', 'not checkable');

  const gateName = (name) => (name === 'profitFactor'
    ? L('factor de beneficio', 'profit factor')
    : name === 'drawdown' ? 'drawdown' : L('operaciones', 'trades'));

  return `<div class="detail-head">
      <div class="detail-kicker">${L('05 / Diagnostico', '05 / Diagnostics')}</div>
      <h2>${L('Que se ha leido y con que se ha juzgado', 'What was read and what it was judged by')}</h2>
      <p>${L('Todo lo que decide el veredicto esta aqui. Si algo se ha clasificado mal, se ve en esta pantalla.',
        'Everything that decides the verdict is here. If something was misclassified, it shows on this screen.')}</p>
    </div>

    <div class="grid-secondary">
      <section class="panel">
        <div class="panel-head compact"><div><div class="panel-kicker">${L('Integridad', 'Integrity')}</div><h2>${L('Emparejado de archivos', 'File matching')}</h2></div></div>
        <div class="evidence-list">
          <div><span>${L('Filas in-sample', 'In-sample rows')}</span><strong>${int(integ.isRows)}</strong></div>
          <div><span>${L('Filas forward', 'Forward rows')}</span><strong>${integ.oosRows ? int(integ.oosRows) : '—'}</strong></div>
          <div><span>${L('Emparejadas por Pass', 'Matched by Pass')}</span><strong>${int(integ.matchedRows)}</strong></div>
          <div><span>${L('Sin pareja (descartadas)', 'Unmatched (dropped)')}</span><strong>${int(integ.unmatchedIs)}</strong></div>
          <div><span>${L('Identificadores duplicados', 'Duplicate identifiers')}</span><strong>${int(integ.duplicateIds)}</strong></div>
          <div><span>${L('Filas con parámetros ilegibles', 'Rows with unreadable parameters')}</span><strong>${int(a.meta.droppedParams)}</strong></div>
          <div><span>${L('Misma optimizacion', 'Same optimization')}</span><strong>${sameOpt}</strong></div>
        </div>
        <p class="chart-note">${L(
          'La procedencia se confirma comprobando que el resultado del backtest que trae el archivo forward reproduce exactamente el del archivo in-sample, pasada por pasada.',
          'Provenance is confirmed by checking that the backtest result in the forward file exactly reproduces the in-sample file, pass by pass.',
        )}</p>
      </section>

      <section class="panel">
        <div class="panel-head compact"><div><div class="panel-kicker">${L('Muestreo', 'Sampling')}</div><h2>${L('Como optimizaste', 'How you optimised')}</h2></div></div>
        <div class="evidence-list">
          <div><span>${L('Espacio cartesiano', 'Cartesian space')}</span><strong>${int(a.meta.cartesian)}</strong></div>
          <div><span>${L('Configuraciones probadas', 'Configurations tested')}</span><strong>${int(a.meta.total)}</strong></div>
          <div><span>${L('Cobertura (niveles vistos)', 'Coverage (seen levels)')}</span><strong>${Number.isFinite(a.meta.coverage) ? nf(5).format(a.meta.coverage * 100) + ' %' : '—'}</strong></div>
          <div><span>${L('Cobertura vs .set', 'Coverage vs .set')}</span><strong>${a.meta.searchCoverage && a.meta.searchCoverage.usable && Number.isFinite(a.meta.searchCoverage.coverageSearch) ? nf(4).format(a.meta.searchCoverage.coverageSearch * 100) + ' %' : L('sin .set', 'no .set')}</strong></div>
          <div><span>${L('Radio de vecindad', 'Neighborhood radius')}</span><strong>${int(a.meta.radius)} ${L('paso(s)', 'step(s)')}</strong></div>
          <div><span>${L('Vecinas por configuración', 'Neighbors per configuration')}</span><strong>${L('mediana', 'median')} ${int(a.meta.medianSupport)}</strong></div>
          <div><span>${L('Duración forward estimada', 'Estimated forward duration')}</span><strong>${Number.isFinite(a.meta.periodRatio) ? pct(a.meta.periodRatio, 0) + L(' del in-sample', ' of in-sample') : '—'}</strong></div>
        </div>
        <p class="chart-note">${esc(samplingCopy)}</p>
      </section>
    </div>

    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Clasificación', 'Classification')}</div><h2>${L('Columnas detectadas', 'Detected columns')}</h2></div></div>
      <p class="panel-intro">${L(
        'Los parámetros no se reconocen por su nombre sino por su estructura: para un mismo Pass, un parámetro vale lo mismo en los dos archivos y una métrica no, porque se midio sobre otro periodo.',
        'Parameters are not recognized by name but by structure: for the same Pass, a parameter has the same value in both files and a metric does not, because it was measured on another period.',
      )}</p>
      <div class="columns-grid">
        <div>
          <h3>${L('Parámetros', 'Parameters')} (${a.meta.paramNames.length})</h3>
          <div class="chips">${a.meta.paramNames.map((n) => `<span class="chip param-chip">${esc(n)}</span>`).join('')}</div>
        </div>
        <div>
          <h3>${L('Métricas usadas para juzgar', 'Metrics used for judgment')}</h3>
          <div class="chips">${a.meta.availableMetrics.map((n) => `<span class="chip">${esc(n)}</span>`).join('')}</div>
          <p class="chart-note">
            ${L(
              `Tu criterio de optimizacion${a.meta.criterionIsName ? ` (<code>${esc(a.meta.criterionIsName)}</code>)` : ''}
            se lee pero <strong>no puntua</strong>: significa algo distinto en cada optimizacion y esta contaminado
            por la propia seleccion. Se usa solo para ordenar la tabla de descartes.`,
              `Your optimization criterion${a.meta.criterionIsName ? ` (<code>${esc(a.meta.criterionIsName)}</code>)` : ''}
            is read but <strong>does not score</strong>: it means something different in every optimization and is contaminated
            by the selection itself. It is used only to order the rejection table.`,
            )}
          </p>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Politica', 'Policy')}</div><h2>${L('Mínimos aplicados', 'Applied minima')}</h2></div></div>
      <div class="evidence-list">
        <div><span>${L('Beneficio positivo', 'Positive profit')}</span><strong>${g.requireProfit ? L('exigido', 'required') : L('no exigido', 'not required')}</strong></div>
        <div><span>${L('Factor de beneficio mínimo', 'Minimum profit factor')}</span><strong>${num(g.minProfitFactor, 2)}</strong></div>
        <div><span>${L('Drawdown máximo', 'Maximum drawdown')}</span><strong>${num(g.maxDrawdownPct, 0)} %</strong></div>
        <div><span>${L('Operaciones minimas (IS)', 'Minimum trades (IS)')}</span><strong>${int(a.meta.minTradesIs)}</strong></div>
        <div><span>${L('Operaciones minimas (forward)', 'Minimum trades (forward)')}</span><strong>${int(a.meta.minTradesOos)}</strong></div>
        ${(a.meta.gateInfluence || []).filter((gi) => gi.name !== 'beneficio').map((gi) => `
        <div><span>· ${gateName(gi.name)}: ${L('descarta ella sola', 'rejects on its own')}</span><strong>${gi.sole ? int(gi.sole) + L(' configuraciones', ' configurations') : `<em>${L('ninguna (no filtra nada)', 'none (filters nothing)')}</em>`}</strong></div>`).join('')}
        <div><span>${L('Se exigen en', 'Required in')}</span><strong>${a.meta.hasForward ? L('los dos periodos', 'both periods') : L('el in-sample', 'in-sample')}</strong></div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head compact"><div><div class="panel-kicker">${L('Contraste', 'Contrast')}</div><h2>${L('Pruebas estadísticas', 'Statistical tests')}</h2></div></div>
      <div class="evidence-list">
        <div><span>${L('Correlación de rangos IS &rarr; forward', 'Rank correlation IS &rarr; forward')}</span><strong>${num(a.stats.spearmanCriterion, 3)}</strong></div>
        <div><span>${L('Fragilidad de la selección (peor sentido)', 'Selection fragility (worse direction)')}</span><strong>${Number.isFinite(a.stats.fragility) ? pct(a.stats.fragility, 0) : '—'}${Number.isFinite(a.stats.fragilityMargin) ? ` <em>±${nf(0).format(a.stats.fragilityMargin * 100)}</em>` : ''}</strong></div>
        ${a.stats.fragilityFolds ? `
        <div><span>· ${L('eligiendo por IS, validando en forward', 'choosing by IS, validating on forward')}</span><strong>${pct(a.stats.fragilityFolds.isToOos.value, 0)}</strong></div>
        <div><span>· ${L('eligiendo por forward, validando en IS', 'choosing by forward, validating on IS')}</span><strong>${pct(a.stats.fragilityFolds.oosToIs.value, 0)}</strong></div>
        <div><span>· ${L('asimetria entre sentidos', 'asymmetry across directions')}</span><strong>${pct(a.stats.fragilityAsymmetry, 0)}</strong></div>` : ''}
        <div><span>${L('Pruebas realizadas', 'Trials run')}</span><strong>${int(a.meta.total)}</strong></div>
        <div><span>${L('Pruebas efectivas (regiones distintas)', 'Effective trials (distinct regions)')}</span><strong>${int(a.stats.effectiveTrials)}</strong></div>
        ${a.stats.sharpeTest ? `
        <div><span>${L('Sharpe máximo observado', 'Maximum observed Sharpe')}</span><strong>${num(a.stats.sharpeTest.observedMax, 3)} <em>${L('con', 'with')} ${int(a.stats.sharpeTest.observedTrades)} ops</em></strong></div>
        <div><span>${L('Error típico de un Sharpe', 'Typical Sharpe standard error')}</span><strong>${num(a.stats.sharpeTest.typicalSe, 4)}</strong></div>
        <div><span>${L(`Umbral por azar con ${int(a.stats.sharpeTest.trials)} pruebas`, `Chance threshold with ${int(a.stats.sharpeTest.trials)} trials`)}</span><strong>${num(a.stats.sharpeTest.chanceMax, 3)}</strong></div>
        <div><span>${L('Umbral con pruebas efectivas', 'Threshold with effective trials')}</span><strong>${num(a.stats.sharpeTest.chanceMaxEffective, 3)}</strong></div>
        <div><span>${L('Umbral del contraste Bailey (más estricto)', 'Bailey-style threshold (stricter)')}</span><strong>${num(a.stats.sharpeTest.chanceMaxConservative, 3)}</strong></div>
        <div><span>${L('Prob. bajo azar (Lo)', 'Chance probability (Lo)')}</span><strong>${Number.isFinite(a.stats.sharpeTest.deflated) ? pct(a.stats.sharpeTest.deflated, 1) : '—'}</strong></div>` : ''}
        <div><span>${L('Tiempo de calculo', 'Compute time')}</span><strong>${int(a.meta.elapsedMs)} ms</strong></div>
      </div>
      <p class="chart-note">
        ${L(
          `<strong>Como leer el contraste del Sharpe.</strong> La hipotesis nula es que ninguna configuración
        tiene ventaja: entonces cada Sharpe observado sería ruido alrededor de cero, y el mejor de N pruebas
        saldria positivo por si solo. El error típico se calcula con el número de operaciones de cada
        configuración, asumiendo que el Sharpe de MT5 se estima sobre esas operaciones. Si en tu versión del
        terminal esa cifra viniese anualizada, el umbral real sería más alto que el mostrado. Por eso
        <strong>suspender esta prueba es una señal fuerte, pero aprobarla no demuestra nada por si solo</strong>.
        El umbral con pruebas efectivas cuenta regiones distintas del espacio en lugar de configuraciones,
        porque dos vecinos no son dos pruebas independientes.`,
          `<strong>How to read the Sharpe contrast.</strong> The null hypothesis is that no configuration
        has an edge: then each observed Sharpe would be noise around zero, and the best of N trials
        would come out positive on its own. The typical error is computed from each configuration's
        trade count, assuming MT5's Sharpe is estimated on those trades. If in your terminal version
        that figure were annualized, the real threshold would be higher than shown. So
        <strong>failing this test is a strong signal, but passing it proves nothing on its own</strong>.
        The effective-trials threshold counts distinct regions of the space instead of configurations,
        because two neighbors are not two independent trials.`,
        )}
      </p>
      <p class="chart-note">
        ${L(
          `<strong>Los dos umbrales del Sharpe.</strong> El contraste tipo Bailey usa como
        dispersión de la hipótesis nula la desviación típica de los Sharpe <em>entre configuraciones</em>. Aquí se
        usa el error de estimación de un Sharpe (Lo, 2002), y es una decisión deliberada: en una malla densa de
        UNA estrategia esa dispersión la produce sobre todo la forma de la superficie de parámetros, no el ruido,
        de modo que tomarla como nula sube el listón cuanta <em>más</em> señal real hay. Se muestran los dos para
        que la distancia entre ellos la juzgues tú — no se presenta como “Sharpe deflactado” clásico aprobado.`,
          `<strong>The two Sharpe thresholds.</strong> The Bailey-style contrast uses as
        null dispersion the standard deviation of Sharpes <em>across configurations</em>. Here we
        use the estimation error of a Sharpe (Lo, 2002), and that is deliberate: on a dense grid of
        ONE strategy that dispersion is produced mostly by the shape of the parameter surface, not noise,
        so taking it as null raises the bar the <em>more</em> real signal there is. Both are shown so
        you can judge the distance between them — not as a classic approved “deflated Sharpe”.`,
        )}
      </p>
      <p class="chart-note">
        ${L(
          `<strong>Por qué esto no se llama PBO.</strong> El método original (CSCV) parte la <em>serie temporal</em> de
        rendimientos de cada prueba en bloques y recombina todas las particiones. Eso exige la curva de equity de
        cada configuración, y la exportación de optimización de MT5 solo trae métricas agregadas por pasada: con
        ese fichero el CSCV completo es imposible, y no hay aproximación que lo arregle. Lo que sí se puede medir
        -y es lo que ves- es cuánto depende el resultado de qué configuraciones había en el menú, en los dos
        sentidos de la partición. Es útil, pero es otra cosa, y llamarlo PBO sería tomar prestada una autoridad
        que no nos corresponde.`,
          `<strong>Why this is not called PBO.</strong> The original method (CSCV) splits each trial's
        <em>return time series</em> into blocks and recombines all partitions. That needs each configuration's
        equity curve, and MT5's optimization export only brings aggregated metrics per pass: with
        that file full CSCV is impossible, and no approximation fixes it. What can be measured
        — and what you see — is how much the result depends on which configurations were on the menu, in both
        partition directions. It is useful, but it is something else, and calling it PBO would borrow authority
        that is not ours.`,
        )}
      </p>
    </section>

    ${renderStabilityPanel(a)}
    ${renderSensitivityPanel(a)}`;
}

/**
 * Estabilidad del veredicto frente a sus propias constantes.
 *
 * Responde con un numero a la pregunta mas incomoda que se le puede hacer a esta app:
 * ¿la recomendacion sale de mis datos o del ajuste de vuestros umbrales?
 */
function renderStabilityPanel(a) {
  const st = a.stats.stabilityCheck;
  if (!st || !st.draws) return '';
  const internal = st.internal || st;
  const gates = st.gates;
  const pctRegion = 100 * internal.regionRate;
  const tone = internal.regionRate >= 0.8 ? 'ok' : internal.regionRate >= 0.5 ? 'warn' : 'bad';
  const gTone = gates ? (gates.regionRate >= 0.8 ? 'ok' : gates.regionRate >= 0.5 ? 'warn' : 'bad') : '';
  return `<section class="panel">
    <div class="panel-head compact">
      <div><div class="panel-kicker">${L('Auditoría interna', 'Internal audit')}</div><h2>${L('¿Y si moviéramos nuestros propios umbrales?', 'What if we moved our own thresholds?')}</h2></div>
      <div class="stability-badge ${tone}">${pctRegion.toFixed(0)} %</div>
    </div>
    <p class="panel-intro">
      ${L(
        `Los umbrales de meseta (suelo de calidad, robustez mínima, soporte mínimo, tamaño mínimo…) son
      juicios calibrados, no cantidades derivadas de ninguna teoría. Así que la búsqueda se repite
      <strong>${int(st.draws)} veces</strong> moviéndolos al azar un <strong>±${(100 * st.perturbation).toFixed(0)} %</strong>,
      para ver cuánto de lo que te recomendamos depende de dónde pusimos nosotros los cortes.`,
        `Plateau thresholds (quality floor, minimum robustness, minimum support, minimum size…) are
      calibrated judgments, not quantities derived from any theory. So the search is repeated
      <strong>${int(st.draws)} times</strong> moving them at random by <strong>±${(100 * st.perturbation).toFixed(0)} %</strong>,
      to see how much of what we recommend depends on where we placed the cuts.`,
      )}
    </p>
    <div class="stability-cols">
      <div>
        <h3>${L('Nuestros umbrales internos', 'Our internal thresholds')}</h3>
        <p class="stability-sub">${L('Suelo de calidad, robustez mínima, soporte mínimo, tamaño mínimo.', 'Quality floor, minimum robustness, minimum support, minimum size.')}</p>
        <div class="evidence-list">
          <div><span>${L('Variaciones probadas', 'Variations tried')}</span><strong>${int(internal.draws)}</strong></div>
          <div><span>${L('Sigue existiendo alguna meseta', 'Some plateau still exists')}</span><strong>${pct(internal.plateauRate, 0)}</strong></div>
          <div><span>${L('Gana la MISMA región', 'SAME region wins')}</span><strong class="big ${tone}">${pct(internal.regionRate, 0)}</strong></div>
          <div><span>${L('Gana exactamente la misma configuración', 'Exactly the same configuration wins')}</span><strong>${pct(internal.representativeRate, 0)}</strong></div>
        </div>
      </div>
      <div>
        <h3>${L('Tus mínimos', 'Your minima')}</h3>
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
  </section>`;
}

/**
 * Influencia de cada parametro medida de dos formas. La distincion importa: un parametro
 * puede parecer plano por separado y ser decisivo en combinacion con otro.
 */
function renderSensitivityPanel(a) {
  const rows = (a.sensitivity || []).filter((x) => !x.constant);
  if (!rows.length) return '';
  const floor = 0.12;
  const sorted = [...rows].sort((x, y) => (y.effective || 0) - (x.effective || 0));
  const role = (j) => (a.meta.activeDims.includes(j) ? `<span class="role dist">${L('distancia', 'distance')}</span>`
    : a.meta.blockDims.includes(j) ? `<span class="role block">${L('partición', 'partition')}</span>`
      : `<span class="role flat">${L('ignorado', 'ignored')}</span>`);
  return `<section class="panel">
    <div class="panel-head compact">
      <div><div class="panel-kicker">${L('Diagnóstico', 'Diagnostics')}</div><h2>${L('Cuánto influye cada parámetro', 'How much each parameter influences')}</h2></div>
    </div>
    <p class="panel-intro">
      ${L(
        `<strong>Aislado</strong> agrupa por el valor del parámetro y promedia sobre todo lo demás.
      <strong>Combinado</strong> deja fijos todos los demás parámetros y mide el recorrido a lo largo de este.
      Un parámetro cuyo efecto se invierte según otro sale plano en la primera medida y no en la segunda;
      por eso manda <strong>la mayor de las dos</strong>. Descartar un eje que sí influye haría pasar por
      vecinos a configuraciones que no lo son, e inflaría las mesetas hasta fabricar una donde no hay ninguna.`,
        `<strong>Isolated</strong> groups by the parameter value and averages over everything else.
      <strong>Combined</strong> holds all other parameters fixed and measures the range along this one.
      A parameter whose effect reverses depending on another looks flat on the first measure and not on the second;
      that is why <strong>the larger of the two</strong> wins. Dropping an axis that does influence would treat
      non-neighbors as neighbors, and inflate plateaus until inventing one where none exists.`,
      )}
    </p>
    <div class="table-wrap">
      <table class="grid-table">
        <thead><tr><th>${L('Parámetro', 'Parameter')}</th><th>${L('Aislado', 'Isolated')}</th><th>${L('Combinado', 'Combined')}</th><th>${L('Efectivo', 'Effective')}</th><th>${L('Papel', 'Role')}</th></tr></thead>
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
      'the engine counts positions, not distances, so two consecutive values are always &laquo;one step&raquo; even if there is a chasm between them.',
    )}</div>` : ''}
  </section>`;
}

// ---------------------------------------------------------------- periodo no visto
const unseenFields = () => [
  { key: 'trades', label: L('Operaciones', 'Trades'), hint: L('Total de operaciones del tramo', 'Total trades in the segment'), step: '1', required: true },
  { key: 'profit', label: L('Beneficio neto', 'Net profit'), hint: L('En la divisa de la cuenta', 'In the account currency'), step: 'any', required: true },
  { key: 'profitFactor', label: L('Factor de beneficio', 'Profit factor'), hint: 'Profit Factor', step: '0.001' },
  { key: 'drawdown', label: L('Drawdown máximo (%)', 'Maximum drawdown (%)'), hint: 'Equity DD %', step: '0.01' },
  { key: 'recoveryFactor', label: L('Factor de recuperacion', 'Recovery factor'), hint: 'Recovery Factor', step: '0.001' },
  { key: 'sharpe', label: 'Sharpe', hint: 'Sharpe Ratio', step: '0.001' },
];

const unseenStatus = () => ({
  normal: ['ok', L('normal', 'normal')],
  cola: ['warn', L('en la cola', 'in the tail')],
  fuera: ['bad', L('fuera de lo visto', 'outside what was seen')],
});

/**
 * Barra de rango: donde cae lo observado dentro de lo que el EA ya había demostrado.
 * Un número suelto no dice nada; verlo situado contra su propio historial, si.
 */
function unseenBand(r) {
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
function renderReportCard(a, plateau) {
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

function renderUnseen(a) {
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

function readUnseenForm() {
  const out = {};
  unseenFields().forEach((f) => {
    const el = $(`#u_${f.key}`);
    if (el) out[f.key] = el.value;
  });
  return out;
}

function runUnseenCheck() {
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
  render();
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
function renderLegal() {
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

function renderMethod() {
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
      L('La influencia se mide de dos formas. Aislada: se agrupa por el valor del parámetro y se promedia sobre todo lo demás. Combinada: se deja fijo todo lo demás y se mide el recorrido a lo largo de ese eje. Manda la MAYOR de las dos, y la razón es concreta: un parámetro cuyo efecto se invierte según otro -un filtro de régimen, por ejemplo- sale exactamente plano en la primera medida. Descartarlo haría pasar por vecinos a configuraciones que no lo son, inflaría el soporte y fabricaría una meseta donde no hay ninguna.',
        'Influence is measured two ways. Isolated: group by the parameter value and average over everything else. Combined: hold everything else fixed and measure the range along that axis. The LARGER of the two wins, for a concrete reason: a parameter whose effect reverses depending on another — a regime filter, for example — looks exactly flat on the first measure. Dropping it would treat non-neighbors as neighbors, inflate support and invent a plateau where none exists.')],
    ['08', L('Meseta y nucleo', 'Plateau and core'),
      L('Pertenecer a una meseta exige que el cuartil bajo del entorno mantenga calidad buena, que casi todos los vecinos pasen los mínimos y que la robustez supere el umbral. El núcleo es la parte donde incluso el entorno es excelente, y de ahí sale la recomendación.',
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


async function copyParams(index, button) {
  const a = state.analysis;
  if (!a || !a.plateaus.length) return;
  const p = a.plateaus[Math.min(index, a.plateaus.length - 1)];
  // Mismo formato que el .set de MT5 (punto decimal), no Intl local.
  const text = a.meta.paramNames
    .map((n, j) => `${n}=${formatSetValue(p.record.params[j])}`)
    .join('\n');
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = L('Copiado ✓', 'Copied ✓');
  } catch {
    button.textContent = L('No se ha podido copiar', 'Could not copy');
  }
  setTimeout(() => { button.textContent = original; }, 1800);
}

// ---------------------------------------------------------------- exportación
function doExport(kind, plateauIndex) {
  const a = state.analysis;
  if (!a) return;
  const stamp = new Date().toISOString().slice(0, 10);
  const idx = Number.isFinite(plateauIndex) ? plateauIndex : state.selectedPlateau;
  const best = a.plateaus[Math.min(idx, Math.max(0, a.plateaus.length - 1))];
  if (kind === 'set') {
    if (!best) return showError(L('No hay ninguna meseta que exportar.', 'There is no plateau to export.'));
    if (!a.meta.hasForward) {
      return showError(L(
        'Sin forward no se exporta un .set de despliegue: la región solo se midió in-sample. Exporta el rango de refinamiento, o vuelve a auditar con el archivo forward.',
        'Without forward, a deployment .set is not exported: the region was only measured in-sample. Export the refinement range, or re-audit with the forward file.',
      ));
    }
    downloadText(`robustness-M${best.rank}-pass${best.record.id}.set`, buildSetFile(a, best));
  } else if (kind === 'refine') {
    if (!best) return showError(L('No hay ninguna meseta que refinar.', 'There is no plateau to refine.'));
    downloadText(`robustness-M${best.rank}-refinamiento.set`, buildRefinementSetFile(a, best));
  } else if (kind === 'json') {
    downloadText(`robustness-informe-${stamp}.json`, JSON.stringify(buildReport(a, {
      source: state.source ? { is: state.source.is, oos: state.source.oos || null, at: state.source.at } : null,
    }), null, 2), 'application/json');
  } else if (kind === 'csv') {
    downloadText(`robustness-configuraciones-${stamp}.csv`, buildCsv(a), 'text/csv;charset=utf-8');
  }
}

let closeExportMenu = null;

function toggleExportMenu() {
  if (closeExportMenu) {
    closeExportMenu();
    return;
  }
  let menu = $('#exportMenu');
  if (menu) menu.remove();
  menu = document.createElement('div');
  menu.id = 'exportMenu';
  menu.className = 'export-menu';
  menu.innerHTML = `
    <button data-export="json">${esc(t('export.json'))}</button>
    <button data-export="csv">${esc(t('export.csv'))}</button>
    <button data-export="set" ${state.analysis && !state.analysis.meta.hasForward ? 'disabled title="' + esc(L('Requiere forward', 'Requires forward')) + '"' : ''}>${esc(t('export.set'))}</button>
    <button data-export="refine">${esc(t('export.refine'))}</button>`;
  $('.top-actions').appendChild(menu);
  menu.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => {
    doExport(b.dataset.export);
    menu.remove();
  }));
  // Un único punto de cierre: así no se acumula un listener por cada apertura.
  const onDocClick = (e) => {
    if (!menu.contains(e.target) && e.target !== $('#exportBtn')) closeExportMenu();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      closeExportMenu();
      $('#exportBtn').focus();
    }
  };
  closeExportMenu = () => {
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onKey);
    menu.remove();
    closeExportMenu = null;
  };
  setTimeout(() => {
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
  }, 0);
}

// ---------------------------------------------------------------- arranque
function loadDemo() {
  const demo = buildDemoTables();
  state.isTable = demo.isTable;
  state.oosTable = demo.oosTable;
  state.demoTruth = demo.truth;
  state.isDemo = true;
  state.isFile = { name: demo.isTable.name };
  state.oosFile = { name: demo.oosTable.name };
  const summarizeTable = (table) => {
    const metrics = metricColumns(table);
    const inferred = inferParamsSingle(table);
    return {
      ok: true,
      name: table.name,
      rows: table.rows.length,
      cols: table.headers.length,
      params: inferred.params.length,
      metrics: Object.keys(metrics).length,
      format: table.format || 'demo',
    };
  };
  state.preflight = { is: summarizeTable(demo.isTable), oos: summarizeTable(demo.oosTable) };
  $('#isStatus').textContent = t('demo.loaded');
  $('#oosStatus').textContent = t('demo.loaded');
  $('#isDrop').classList.add('ready');
  $('#oosDrop').classList.add('ready');
  renderPreflight();
  refreshAnalyzeButton();
  runAudit();
}

/**
 * Soltar archivos en CUALQUIER punto de la pagina.
 *
 * Sin esto, un archivo soltado a un centimetro de la caja se lo queda el navegador y
 * abre su dialogo de descarga: el usuario cree que ha fallado la app y en realidad
 * nunca le llego el archivo. Por eso el documento entero es zona valida y, ademas, se
 * anula siempre el comportamiento por defecto aunque el archivo no sea utilizable.
 */
function dragHasFiles(event) {
  const dt = event.dataTransfer;
  if (!dt) return false;
  if (dt.types && Array.prototype.indexOf.call(dt.types, 'Files') >= 0) return true;
  return Boolean(dt.files && dt.files.length);
}

let dropDepth = 0;

function showDropOverlay() {
  const el = $('#dropOverlay');
  if (el) el.hidden = false;
}

function hideDropOverlay() {
  dropDepth = 0;
  const el = $('#dropOverlay');
  if (el) el.hidden = true;
}

function bindGlobalDrop() {
  window.addEventListener('dragenter', (e) => {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    dropDepth += 1;
    showDropOverlay();
  });
  window.addEventListener('dragover', (e) => {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', (e) => {
    if (!dragHasFiles(e)) return;
    dropDepth = Math.max(0, dropDepth - 1);
    if (!dropDepth) hideDropOverlay();
  });
  window.addEventListener('drop', (e) => {
    // Siempre, haya o no archivos utilizables: si no, el navegador abre el fichero.
    e.preventDefault();
    hideDropOverlay();
    if (dragHasFiles(e)) acceptFiles(e.dataTransfer.files, null);
  });
  // Si el arrastre acaba fuera de la ventana, el overlay no puede quedarse colgado.
  window.addEventListener('dragend', hideDropOverlay);
  window.addEventListener('blur', hideDropOverlay);
}

initChrome();
loadPrefs();
bindDropzone('#isDrop', '#isFile', 'is');
bindDropzone('#oosDrop', '#oosFile', 'oos');
bindGlobalDrop();
$('#analyzeBtn').addEventListener('click', runAudit);
$('#demoBtn').addEventListener('click', loadDemo);
$('#exportBtn').addEventListener('click', toggleExportMenu);
$('#policyBtn').addEventListener('click', () => {
  const panel = $('#policyPanel');
  panel.hidden = !panel.hidden;
  $('#policyBtn').setAttribute('aria-expanded', String(!panel.hidden));
  if (!panel.hidden) updatePolicyPreview();
});
['#gPf', '#gDd', '#gTrades', '#gProfit'].forEach((sel) => {
  $(sel).addEventListener('input', () => {
    savePrefs();
    updatePolicyPreview();
  });
});
$('#policyRerun').addEventListener('click', () => {
  if (!state.busy) runAudit();
});

// Ancla inicial y botón de atrás del navegador.
window.addEventListener('hashchange', () => {
  const tab = HASH_TAB[location.hash.replace('#', '')];
  if (tab && tab !== state.tab && (state.analysis || tab === 'method')) setTab(tab, true);
});
{
  const initial = HASH_TAB[location.hash.replace('#', '')];
  if (initial === 'method' || initial === 'legal') setTab(initial, true);
}
$$('.nav-item').forEach((b) => b.addEventListener('click', () => {
  if (!b.disabled) setTab(b.dataset.tab);
}));
// El enlace legal del pie no es una pestana numerada, pero navega igual.
$$('.legal-links [data-tab]').forEach((b) => b.addEventListener('click', () => {
  setTab(b.dataset.tab);
}));

render();

// Enlace desde la landing: /app/?demo=1
if (new URLSearchParams(location.search).get('demo') === '1') {
  loadDemo();
}