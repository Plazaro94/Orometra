// Worker, runAudit, progreso y errores.

import { parseTable } from '../core/parse.js';
import { AnalysisError, CODE, classifyError, errorCopy } from '../core/errors.js';
import { t, L, getLocale } from './i18n.js';
import { state, api, $, $$ } from './ui-state.js';

export function showProgress(pct, label) {
  $('#statusBar').hidden = false;
  $('#progressFill').style.width = `${Math.max(2, Math.min(100, pct))}%`;
  $('#progressLabel').textContent = label;
}

export function showError(errOrMessage) {
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
  $('#policyBtn').disabled = busy;
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

export function failAllPending(message) {
  const error = new Error(message);
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
export async function analyseOnMainThread(payload) {
  const { runAnalysis } = await import('../core/analysis.js');
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

export async function prepareTable(file) {
  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer.slice(0, 2));
  // Un .xlsx es un ZIP; descomprimirlo es asincrono y no cabe dentro del lector
  // sincrono, asi que se resuelve aqui y se manda ya en forma de tabla. El modulo se
  // carga solo si hace falta: la inmensa mayoria de los archivos de MT5 son XML.
  if (head[0] === 0x50 && head[1] === 0x4b) {
    const { parseXlsx } = await import('./xlsx.js');
    const { finishTable } = await import('../core/parse.js');
    return { table: finishTable(await parseXlsx(buffer), file.name) };
  }
  return { buffer, name: file.name };
}

export async function runAudit() {
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
    state.selectedParam = api.mostSensitiveIndex(analysis);
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
    api.setTab('verdict');
    api.updatePolicyPreview();
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}
