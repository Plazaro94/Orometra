// Worker, runAudit, progreso y errores.

import { track } from './track.js';
import { parseTable } from '../core/parse.js';
import { AnalysisError, CODE, classifyError, errorCopy, withCode } from '../core/errors.js';
import { t, L, getLocale } from './i18n.js';
import { state, api, $, $$, esc } from './ui-state.js';
import { displayVerdictLevel, levelName } from './ui-verdict.js';

export function showProgress(pct, label) {
  const value = Math.max(2, Math.min(100, pct));
  $('#statusBar').hidden = false;
  $('#progressFill').style.width = `${value}%`;
  const bar = $('#progressBar');
  if (bar) bar.setAttribute('aria-valuenow', String(Math.round(value)));
  $('#progressLabel').textContent = label;
}

export function showError(errOrMessage, code = CODE.DATA_ERROR) {
  // Los avisos de la interfaz traen su propio codigo: antes todo texto suelto caia en
  // "Datos insuficientes tras la limpieza", tambien "has soltado dos forward".
  const classified = typeof errOrMessage === 'string'
    ? { code, message: errOrMessage, details: {} }
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
  return classified.code;
}

export function clearError() {
  $('#errorBox').hidden = true;
  const hintEl = $('#errorHint');
  if (hintEl) {
    hintEl.textContent = '';
    hintEl.hidden = true;
  }
  delete $('#errorBox').dataset.code;
}

export function setBusy(busy) {
  state.busy = busy;
  $('#analyzeBtn').classList.toggle('busy', busy);
  $('#analyzeLabel').textContent = busy ? t('analyze.busy') : t('analyze.label');
  // Todo lo que puede disparar un análisis queda bloqueado: si no, se solapan dos
  // calculos y gana el que acabe el ultimo.
  $('#demoBtn').disabled = busy;
  $$('.dropzone').forEach((z) => z.classList.toggle('locked', busy));
  api.refreshAnalyzeButton();
}

export let worker = null;
export let requestId = 0;
// Peticiones vivas: si el worker muere hay que poder rechazarlas todas. Sin esto, un
// fallo del worker dejaba la promesa sin resolver y la interfaz clavada en "Auditando..."
// para siempre, sin error y sin salida salvo recargar.
export const pendingRequests = new Map();

export const WORKER_TIMEOUT_MS = 10 * 60 * 1000;

export function failAllPending(message, code = CODE.WORKER_ERROR) {
  const error = new AnalysisError(code, message);
  pendingRequests.forEach((entry) => {
    clearTimeout(entry.timer);
    entry.reject(error);
  });
  pendingRequests.clear();
}

export function getWorker() {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onerror = () => {
      const dead = worker;
      worker = null;
      if (dead && dead.terminate) dead.terminate();
      failAllPending(L(
        'El motor de análisis ha fallado de forma inesperada. Vuelve a intentarlo; si se repite, recarga la página.',
        'The analysis engine failed unexpectedly. Try again; if it repeats, reload the page.',
      ));
    };
    worker.onmessageerror = () => {
      failAllPending(L(
        'El resultado del análisis no se ha podido transferir. Prueba con una optimización más pequeña.',
        'The analysis result could not be transferred. Try a smaller optimization.',
      ));
    };
    return worker;
  } catch {
    return null;
  }
}

/** Reserva: si el worker no esta disponible, se calcula en el hilo principal. */
export async function analyseOnMainThread(payload) {
  const { runAnalysis } = await import('../core/analysis.js');
  let isTable;
  let oosTable;
  try {
    isTable = payload.isTable || parseTable(payload.isBuffer, payload.isName);
    oosTable = payload.oosTable || (payload.oosBuffer ? parseTable(payload.oosBuffer, payload.oosName) : null);
  } catch (err) {
    throw withCode(CODE.FILE_ERROR, err);
  }
  return runAnalysis({
    isTable,
    oosTable,
    policy: payload.policy,
    searchSet: payload.searchSet || null,
    onProgress: (p) => showProgress(p.pct, p.label),
  });
}

export function runInWorker(payload) {
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
      if (msg.type === 'done') resolve(msg.summary || msg.analysis);
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
      reject(new AnalysisError(CODE.WORKER_ERROR, L(
        'El análisis ha tardado demasiado y se ha cancelado. Prueba con una optimización más pequeña.',
        'The analysis took too long and was canceled. Try a smaller optimization.',
      )));
    }, WORKER_TIMEOUT_MS);
    pendingRequests.set(id, { resolve, reject, timer });
    w.addEventListener('message', onMessage);
    try {
      // Los buffers se transfieren, no se copian: con 70 MB la copia se notaba.
      const transfer = [payload.isBuffer, payload.oosBuffer, payload.buffer].filter((b) => b instanceof ArrayBuffer);
      w.postMessage({ id, ...payload }, transfer);
    } catch (err) {
      finish();
      reject(new AnalysisError(CODE.WORKER_ERROR, L(
        'No se han podido enviar los datos al motor de análisis: ',
        'Could not send data to the analysis engine: ',
      ) + (err && err.message ? err.message : String(err))));
    }
  });
}

/**
 * Comprobacion previa de un archivo: filas, parametros y metricas. Se lee en el worker
 * (y se queda alli para el analisis); solo el .xlsx, que se descomprime aqui, se resume
 * en el hilo principal. Sin metricas o sin parametros no es un export de optimizacion.
 */
export async function preflightFile(file) {
  const prepared = await prepareTable(file);
  let summary;
  const w = prepared.table ? null : getWorker();
  if (w) {
    summary = await runInWorker({
      kind: 'preflight', buffer: prepared.buffer, name: prepared.name || file.name, key: fileKey(file), locale: getLocale(),
    });
  } else {
    const { preflightSummary } = await import('../core/schema.js');
    const table = prepared.table || parseTable(prepared.buffer, prepared.name || file.name);
    summary = preflightSummary(table);
  }
  if (!summary.metrics) {
    throw new AnalysisError(CODE.FILE_ERROR, L(
      'No se reconoce ninguna métrica de MT5 (Profit, Profit Factor, Drawdown…): no parece una exportación de optimización.',
      'No MT5 metric is recognized (Profit, Profit Factor, Drawdown…): this does not look like an optimization export.',
    ));
  }
  // Sin parámetros reconocidos NO se bloquea: con los dos archivos, los parámetros se
  // reconocen por estructura (valen lo mismo en los dos periodos) y no por su número de
  // valores distintos. Si al final no hay ninguno, el análisis lo dice con su propio error.
  return { ok: true, name: file.name, ...summary };
}

/** Identifica un archivo para reutilizar su tabla ya leida en el worker. */
export const fileKey = (file) => (file && file.size !== undefined ? `${file.name}|${file.size}|${file.lastModified || 0}` : null);

export async function prepareTable(file) {
  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer.slice(0, 2));
  // Un .xlsx es un ZIP; descomprimirlo es asincrono y no cabe dentro del lector
  // sincrono, asi que se resuelve aqui y se manda ya en forma de tabla. El modulo se
  // carga solo si hace falta: la inmensa mayoria de los archivos de MT5 son XML.
  if (head[0] === 0x50 && head[1] === 0x4b) {
    const { parseXlsx } = await import('./xlsx.js');
    const { finishTable } = await import('../core/parse.js');
    try {
      return { table: finishTable(await parseXlsx(buffer), file.name) };
    } catch (err) {
      throw withCode(CODE.FILE_ERROR, err);
    }
  }
  return { buffer, name: file.name };
}

// Cancelar una auditoría: el cálculo corre en el worker y no se puede interrumpir desde
// fuera, así que se termina el worker (el siguiente análisis crea otro).
let cancelRequested = false;
const CANCELLED = () => new AnalysisError(CODE.CANCELLED, L('Análisis cancelado.', 'Analysis canceled.'));

export function cancelAudit() {
  if (!state.busy) return;
  cancelRequested = true;
  const w = worker;
  worker = null;
  if (w) {
    try { w.terminate(); } catch { /* ignore */ }
  }
  failAllPending(CANCELLED().message, CODE.CANCELLED);
}

export async function runAudit() {
  if (state.busy) return;
  cancelRequested = false;
  clearError();
  const policyProblem = api.policyInputProblem && api.policyInputProblem();
  if (policyProblem) {
    showError(policyProblem);
    return;
  }
  const demoOk = state.isDemo && state.isTable && state.oosTable;
  if (!demoOk && !state.isFile) {
    showError(L(
      'Carga al menos el archivo in-sample para auditar.',
      'Load at least the in-sample file to audit.',
    ));
    return;
  }
  setBusy(true);
  showProgress(2, L('Leyendo archivos', 'Reading files'));
  const cancelBtn = $('#cancelBtn');
  if (cancelBtn) cancelBtn.hidden = false;
  try {
    const policy = api.readPolicy();
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
        isKey: fileKey(state.isFile),
        oosKey: state.oosFile ? fileKey(state.oosFile) : null,
        oosTable: oos ? oos.table || null : null,
        oosBuffer: oos ? oos.buffer || null : null,
        oosName: oos ? oos.name : null,
        policy,
        locale: getLocale(),
        searchSet: state.searchSet || null,
      };
    }
    // Se pudo pedir cancelar mientras se leían los archivos, antes de llegar al worker.
    if (cancelRequested) throw CANCELLED();
    const analysis = await runInWorker(payload);
    state.analysis = analysis;
    state.source = {
      is: state.isDemo ? L('Ejemplo sintético', 'Synthetic example') : (state.isFile && state.isFile.name) || '—',
      oos: state.isDemo ? null : (state.oosFile && state.oosFile.name) || null,
      at: new Date(),
    };
    // El nivel MOSTRADO (sin periodo no visto, 'sólida' se muestra como moderada).
    // La pestaña del navegador dice el nivel en palabras («Evidencia moderada · …»): un
    // «!» suelto delante del nombre parecía un error.
    const shownLevel = displayVerdictLevel(analysis);
    document.title = `${L('Evidencia', 'Evidence')} ${levelName(shownLevel).toLowerCase()} · ${state.source.is} · Orometra`;
    // Primer analisis de la sesion: colapsa la ficha de carga de archivos, que si no
    // se repite entera en cada una de las 7 pestanas. Un reanalisis (mismos archivos,
    // otros minimos) no toca el estado expandido/colapsado que ya eligio el usuario.
    if (!document.body.classList.contains('has-analysis')) document.body.classList.add('intake-collapsed');
    const summaryText = $('#intakeSummaryText');
    if (summaryText) {
      summaryText.innerHTML = `<strong>${esc(state.source.is)}</strong>${state.source.oos ? ` · ${esc(state.source.oos)}` : ''}`;
    }
    state.selectedPlateau = 0;
    // El informe NO se descarta al reanalizar: es habitual soltar los tres archivos a
    // la vez, y si no correspondiese al EA analizado la comparacion de parametros lo
    // dira en voz alta. Solo se reinicia lo tecleado a mano. `tradesAudit` se conserva
    // por la misma razon: se calculo del informe, que sigue cargado.
    state.unseen = {
      plateauIndex: 0, values: {}, result: null, error: null, tradesAudit: state.unseen.tradesAudit,
    };
    state.selectedParam = api.mostSensitiveIndex(analysis);
    state.surfaceDimA = null;
    state.surfaceDimB = null;
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
    // Un informe nuevo se lee desde arriba: el título es el veredicto. Bajar hasta la
    // vista dejaba el título fuera y, en el móvil, el inicio de la tarjeta bajo las
    // pestañas fijas.
    api.setTab('verdict', false, { scroll: false });
    window.scrollTo({ top: 0 });
    api.updatePolicyPreview();
    track(state.isDemo ? 'analisis-ejemplo' : analysis.meta.hasForward ? 'analisis-is-forward' : 'analisis-solo-is');
  } catch (error) {
    if (error && error.code === CODE.CANCELLED) {
      $('#statusBar').hidden = true;
      return;
    }
    const code = showError(error);
    // Los fallos nuestros se cuentan aparte: son los que hay que arreglar.
    if (!state.isDemo) track(code === CODE.INTERNAL_ERROR ? 'analisis-error-interno' : 'analisis-error');
  } finally {
    if (cancelBtn) cancelBtn.hidden = true;
    setBusy(false);
  }
}
