// Carga de archivos, dropzones, preflight y roles.

import { parseTable } from '../core/parse.js';
import { metricColumns, inferParamsSingle, roleFromTable } from '../core/schema.js';
import { looksLikeReport, mentionsReport } from '../core/report.js';
import { looksLikeSetFile, parseSetText } from '../core/setfile.js';
import { classifyError, CODE } from '../core/errors.js';
import { buildDemoTables } from './demo.js';
import { t, L } from './i18n.js';
import { state, api, $, $$, esc, int, decodeHead } from './ui-state.js';

// ---------------------------------------------------------------- carga de archivos
export const BINARY_HINT = /\.(xlsx|xlsm)$/i;

/**
 * Averigua por el CONTENIDO si un archivo es el in-sample o el forward.
 *
 * El export del forward trae columnas "Forward Result" y "Back Result"; el del
 * in-sample no. Así el usuario no tiene que acertar en que caja suelta cada archivo:
 * puede soltar los dos donde sea, o los dos a la vez, y la app los coloca. Un paso
 * menos donde equivocarse, y equivocarse ahi invalidaba el análisis entero en silencio.
 */
export async function detectRole(file) {
  try {
    if (/\.set$/i.test(file.name)) return 'set';
    // Los exports de optimización nunca son HTML; el informe de un backtest sí. Un informe
    // que no se reconociera por su cabecera (otro idioma del terminal) acababa como
    // in-sample: mejor mandarlo al lector de informes, que explica qué le falta.
    if (/\.html?$/i.test(file.name)) return 'report';
    // Un .xlsx (ZIP) se abre una sola vez, en el worker: dice si es el informe de un
    // backtest o una tabla de optimización, y en ese caso de qué periodo. La tabla se queda
    // en el worker para la comprobación previa y el análisis.
    if (BINARY_HINT.test(file.name)) {
      try {
        const role = await api.inspectXlsx(file);
        if (role) return role;
      } catch { /* no es un libro legible: sigue la detección normal */ }
    }
    if (/\.xml$/i.test(file.name)) {
      const text = decodeHead(await file.slice(0, 262144).arrayBuffer());
      if (/<Workbook\b/i.test(text) && mentionsReport(text) && !/Forward\s*Result|Back\s*Result|<Data[^>]*>\s*Pass\s*</i.test(text)) return 'report';
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

export async function setSearchSet(file) {
  try {
    const text = decodeHead(await file.arrayBuffer());
    const parsed = parseSetText(text);
    if (!parsed.params.length) {
      api.showError(L('El .set no contiene parámetros legibles.', 'The .set contains no readable parameters.'), CODE.FILE_ERROR);
      return;
    }
    state.searchSet = parsed;
    state.searchSetName = file.name;
    api.clearError();
    const status = $('#setStatus');
    if (status) status.textContent = `${file.name} · ${parsed.params.length} ${L('parámetros', 'parameters')}`;
    // Volver a analizar con el contraste de cobertura solo si lo cargado es lo que se
    // analizó: con archivos nuevos (sin comprobar aún) se espera a que se pulse Analizar.
    if (!state.busy && api.analyzedCurrentFiles && api.analyzedCurrentFiles()) await api.runAudit();
  } catch (err) {
    api.showError(err && err.message ? err.message : String(err));
  }
}

/** Mismo archivo soltado dos veces (o una copia exacta con otro nombre). */
function sameFile(a, b) {
  if (!a || !b) return false;
  if (a.size !== b.size) return false;
  return a.name === b.name || (a.lastModified && a.lastModified === b.lastModified);
}

/** Reparte una tanda de archivos entre las dos cajas según lo que sean. */
export async function acceptFiles(fileList, preferred) {
  const all = Array.from(fileList || []);
  if (!all.length) return;
  // Durante un análisis no se toca nada de lo cargado: el análisis en marcha leería a
  // medias los archivos nuevos y el informe saldría con nombres que no son los suyos.
  // Lo soltado espera y se coloca al terminar (o al cancelar).
  if (state.busy) {
    state.pendingDrop = { files: all, preferred };
    api.showProgress(state.progressPct || 2, state.progressText || t('progress'));
    return;
  }
  // Hasta cuatro: IS, forward, informe unseen y .set de rangos.
  const files = all.slice(0, 4);
  state.dropNote = all.length > files.length
    ? L(
      `Has soltado ${all.length} archivos y solo se leen 4 (optimización, forward, informe del backtest y .set). Los demás se han ignorado.`,
      `You dropped ${all.length} files and only 4 are read (optimization, forward, backtest report and .set). The rest were ignored.`,
    )
    : '';
  const roles = await Promise.all(files.map(detectRole));
  // En la pestaña del periodo no visto, lo que se suelta es el informe del backtest
  // (salvo que sea claramente otra cosa: un forward o un .set).
  if (files.length === 1 && state.tab === 'unseen' && state.analysis && roles[0] !== 'oos' && roles[0] !== 'set') {
    await api.setReport(files[0]);
    return;
  }
  // Primero las tablas, después el .set y al final el informe. El .set solo vuelve a
  // analizar si los archivos cargados son los del análisis que hay en pantalla: si se
  // procesara antes que las tablas de su misma tanda, analizaría las anteriores.
  const setIdx = roles.indexOf('set');
  const reportIdx = roles.indexOf('report');
  const data = files.filter((_, i) => roles[i] !== 'set' && roles[i] !== 'report');
  const dataRoles = roles.filter((r) => r !== 'set' && r !== 'report');
  if (data.length) placeTables(data, dataRoles, preferred);
  if (setIdx >= 0) await setSearchSet(files[setIdx]);
  if (reportIdx >= 0) await api.setReport(files[reportIdx]);
}

/** Lo soltado durante un análisis, al terminar. Llamada desde ui-audit.js. */
export async function flushPendingDrop() {
  const pending = state.pendingDrop;
  state.pendingDrop = null;
  if (pending) await acceptFiles(pending.files, pending.preferred);
}

/** Coloca las tablas de optimización/forward de una tanda en su ranura. */
function placeTables(files, roles, preferred) {
  if (files.length === 1) {
    // Un segundo in-sample soltado solo sustituye al primero. Puede ser a propósito
    // (cambiar de archivo), pero si se quería añadir el forward, hay que decirlo.
    const target = roles[0] || preferred || 'is';
    if (target === 'is' && state.isFile && !state.oosFile && !state.isDemo && !sameFile(state.isFile, files[0])) {
      state.dropNote = L(
        `${state.isFile.name} se ha sustituido por ${files[0].name}: los dos son exportaciones de la optimización (ninguno trae Forward Result / Back Result). Si querías añadir el forward, exporta la tabla de la pestaña de resultados del forward.`,
        `${state.isFile.name} was replaced by ${files[0].name}: both are optimization exports (neither has Forward Result / Back Result). If you meant to add the forward, export the table from the forward results tab.`,
      );
    }
    setFile(target, files[0]);
    return;
  }
  const pair = files.slice(0, 2);
  if (pair.length === 2 && sameFile(pair[0], pair[1])) {
    api.showError(L(
      'Has soltado el mismo archivo dos veces. Hacen falta el export de la optimización y el del forward de la misma ejecución.',
      'You dropped the same file twice. The optimization export and the forward export of the same run are needed.',
    ), CODE.SCHEMA_ERROR);
    return;
  }
  const oosIdx = roles.indexOf('oos');
  if (oosIdx >= 0 && roles.filter((r) => r === 'oos').length >= 2) {
    // Dos exports forward: asignar uno como in-sample en silencio compararia el forward
    // consigo mismo y daria un veredicto limpio falso.
    api.showError(L(
      'Los dos archivos son exportaciones forward (traen Forward Result / Back Result). Falta el export de la optimización: en MT5, pestaña de resultados de optimización → clic derecho → Exportar a XML.',
      'Both files are forward exports (they have Forward Result / Back Result). The optimization export is missing: in MT5, optimization results tab → right-click → Export to XML.',
    ), CODE.SCHEMA_ERROR);
    return;
  }
  if (oosIdx >= 0) {
    setFile('oos', files[oosIdx]);
    setFile('is', files[1 - oosIdx] || files.find((_, i) => i !== oosIdx));
  } else if (roles[0] === 'is' && roles[1] === 'is') {
    // Ambos parecen in-sample: no asignar el segundo a forward en silencio.
    setFile('is', files[0]);
    api.showError(L(
      'Los dos archivos parecen exports de la optimización (ninguno trae columnas Forward Result / Back Result). Se ha cargado solo el primero. Si tienes el export forward, suéltalo también; si no, puedes auditar solo la optimización.',
      'Both files look like optimization exports (neither has Forward Result / Back Result columns). Only the first one was loaded. If you have the forward export, drop it too; if not, you can audit the optimization alone.',
    ), CODE.SCHEMA_ERROR);
  } else {
    setFile('is', files[0]);
    setFile('oos', files[1]);
  }
}

/**
 * Una sola zona de carga: la app decide que archivo es cada cual (detectRole), asi que
 * dos cajas "In-Sample" y "Forward" solo invitaban a pensar que habia que acertar la
 * caja. El estado de cada archivo se resume aqui y se detalla en la ficha de
 * comprobacion (#preflight).
 */
export function updateDropStatus() {
  const statusEl = $('#mainDropStatus');
  const boxEl = $('#mainDrop');
  if (!statusEl || !boxEl) return;
  const isName = state.isFile && state.isFile.name;
  const oosName = state.oosFile && state.oosFile.name;
  boxEl.classList.remove('error');
  boxEl.classList.toggle('ready', Boolean(isName));
  // Con archivos cargados, la ayuda de "como conseguir los archivos" ya no hace falta.
  document.body.classList.toggle('has-files', Boolean(isName || oosName));
  if (state.isDemo) { statusEl.textContent = t('demo.loaded'); return; }
  if (!isName && !oosName) { statusEl.textContent = t('drop.main.status'); return; }
  statusEl.textContent = [
    `${L('Optimización', 'Optimization')}: ${isName || L('falta', 'missing')}`,
    `${L('Forward', 'Forward')}: ${oosName || L('no cargado (opcional)', 'not loaded (optional)')}`,
  ].join(' · ') + (state.dropNote ? ` · ${state.dropNote}` : '');
}

function dropError(message) {
  const statusEl = $('#mainDropStatus');
  const boxEl = $('#mainDrop');
  if (statusEl) statusEl.textContent = message;
  if (boxEl) { boxEl.classList.add('error'); boxEl.classList.remove('ready'); }
}

export function setFile(which, file) {
  if (!file) return;
  const MAX_BYTES = 80 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    dropError(L(
      `${file.name}: archivo demasiado grande (>${Math.round(MAX_BYTES / 1048576)} MB). Exporta un XML más reducido o recorta la optimización.`,
      `${file.name}: file too large (>${Math.round(MAX_BYTES / 1048576)} MB). Export a smaller XML or trim the optimization.`,
    ));
    return;
  }
  if (/\.opt$/i.test(file.name)) {
    dropError(L(
      'El .opt es la caché interna del probador y no se puede leer. En la pestaña Optimización del probador, haz clic derecho sobre la tabla → Exportar a XML.',
      'The .opt is the tester\'s internal cache and cannot be read. In the tester\'s Optimization tab, right-click the table → Export to XML.',
    ));
    return;
  }
  if (!/\.(xls|xlsx|xlsm|xml|csv|tsv|txt)$/i.test(file.name)) {
    dropError(L(
      `${file.name}: formato no compatible. Usa el XML que exporta MT5 (o .xls, o CSV).`,
      `${file.name}: unsupported format. Use the XML that MT5 exports (or .xls, or CSV).`,
    ));
    return;
  }
  if (state.isDemo) {
    // Las ranuras del ejemplo no son archivos (solo llevan el nombre): un archivo propio
    // junto a la otra mitad del ejemplo acababa en «Error interno» al analizar.
    state.isFile = null; state.oosFile = null;
    state.isTable = null; state.oosTable = null; state.demoTruth = null;
    state.preflight = { is: null, oos: null };
    preflightToken.is++; preflightToken.oos++;
  }
  state[which === 'is' ? 'isFile' : 'oosFile'] = file;
  state.isDemo = false;
  document.body.classList.remove('intake-collapsed'); // cambiar de archivo reabre el detalle
  api.clearError(); // el fallo anterior ya no describe lo que hay cargado
  updateDropStatus();
  refreshAnalyzeButton();
  queuePreflight(which);
}

export const preflightToken = { is: 0, oos: 0 };


export async function buildPreflightSummary(file) {
  return api.preflightFile(file);
}

export async function queuePreflight(which) {
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
    // Sin quitar 'ready' la caja seguia en verde junto al error.
    dropError(L(
      `${file.name}: no se puede leer como exportación de optimización de MT5 (detalle abajo). En el probador, pestaña Optimización, clic derecho sobre la tabla → Exportar a XML.`,
      `${file.name}: it cannot be read as an MT5 optimization export (details below). In the tester, Optimization tab, right-click the table → Export to XML.`,
    ));
  }
  renderPreflight();
  refreshAnalyzeButton();
}

export function renderPreflight() {
  const host = $('#preflight');
  const grid = $('#preflightGrid');
  const note = $('#preflightNote');
  if (!host || !grid) return;
  const slots = [
    { key: 'is', label: L('Optimización', 'Optimization') },
    { key: 'oos', label: L('Forward', 'Forward') },
  ];
  const hasAny = slots.some((s) => state.preflight[s.key]);
  host.hidden = !hasAny;
  if (!hasAny) return;

  let hasError = false;
  let hasMissing = false;
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
    const MISSING = {
      profit: L('beneficio', 'profit'), profitFactor: L('factor de beneficio', 'profit factor'),
      drawdown: L('drawdown', 'drawdown'), trades: L('operaciones', 'trades'),
    };
    const miss = Array.isArray(p.missing) ? p.missing : [];
    if (miss.length) hasMissing = true;
    const paramsText = p.params
      ? int(p.params)
      : L('se detectan al emparejar con el forward', 'detected when paired with the forward');
    return `<div class="preflight-card preflight-ok${miss.length ? ' preflight-warnmiss' : ''}">
      <span class="preflight-role">${esc(s.label)}</span>
      <strong>${esc(p.name)}</strong>
      <em>${esc(t('preflight.rows'))} ${int(p.rows)} · ${esc(t('preflight.params'))} ${esc(paramsText)} · ${esc(t('preflight.metrics'))} ${int(p.metrics)}</em>
      ${miss.length ? `<em class="preflight-warn">${esc(L(
    `No se reconocen las columnas de: ${miss.map((m) => MISSING[m]).join(', ')}. Orometra lee cabeceras de MT5 en inglés y en español; sin estas columnas, sus mínimos no se pueden aplicar.`,
    `Columns not recognized for: ${miss.map((m) => MISSING[m]).join(', ')}. Orometra reads MT5 headers in English and Spanish; without these columns, their minimums cannot be applied.`,
  ))}</em>` : ''}
    </div>`;
  }).join('');

  const title = $('#preflightTitle');
  if (title) {
    title.textContent = hasError
      ? t('preflight.title.error')
      : reading
        ? t('preflight.title.reading')
        : state.preflight.oos
          ? t('preflight.title')
          : t('preflight.title.isOnly');
  }
  if (note) {
    if (hasError) {
      note.textContent = t('preflight.note.warn');
    } else if (reading) {
      note.textContent = t('preflight.reading');
    } else if (!state.preflight.oos && !state.analysis) {
      note.textContent = t('preflight.note.isOnly');
    } else if (state.analysis) {
      note.textContent = L(
        'Archivos leídos. Puedes volver a auditar si cambias los mínimos.',
        'Files read. You can audit again if you change the minimums.',
      );
    } else {
      note.textContent = t('preflight.note.ok');
    }
    if (!hasError && !reading && hasMissing) {
      note.textContent = L(
        'Faltan columnas clave: los mínimos correspondientes no se aplicarán y el veredicto no será fiable. Mira el aviso de la ficha.',
        'Key columns are missing: the corresponding minimums will not be applied and the verdict will not be reliable. See the notice on the card.',
      );
    }
    // Un archivo que no se puede leer es un error (rojo, como su ficha); unas columnas
    // que faltan, un aviso (ámbar).
    note.classList.toggle('is-danger', hasError);
    note.classList.toggle('is-warn', !hasError && hasMissing);
  }
}

export function refreshAnalyzeButton() {
  const hasIs = Boolean(state.isFile || (state.isDemo && state.isTable));
  const hasOos = Boolean(state.oosFile || (state.isDemo && state.oosTable));
  // El forward es opcional: sin el, el motor audita solo el in-sample, lo avisa como
  // critico y no pasa de "debil". Bloquearlo dejaba sin salida a quien no usa Forward.
  const ready = hasIs;
  const preflightBlocked = (state.preflight.is && state.preflight.is.ok === false)
    || (state.preflight.oos && state.preflight.oos.ok === false);
  // Mientras se lee un archivo no se puede auditar: se lanzaria con la lectura a medias.
  const reading = Boolean((state.preflight.is && state.preflight.is.reading) || (state.preflight.oos && state.preflight.oos.reading));
  $('#analyzeBtn').disabled = !ready || state.busy || preflightBlocked || reading;
  $('#analyzeSub').textContent = !hasIs
    ? t('analyze.needIs')
    : reading
      ? t('preflight.title.reading')
      : preflightBlocked
      ? t('analyze.blocked')
      : !hasOos
        ? t('analyze.needOos')
        : t('analyze.ready');
}

export function bindDropzone(zoneSel, inputSel, which) {
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
  // Es un <div role="button"> (una <label> no admite ese rol): el clic abre el selector.
  zone.addEventListener('click', (e) => {
    if (e.target !== input) input.click();
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

// ---------------------------------------------------------------- arranque
export async function loadDemo() {
  if (state.busy) return;
  // Generar las 30.240 filas del ejemplo bloquea ~200 ms. Hacerlo dentro del clic
  // retrasaba la respuesta del boton (INP "mejorable" en Cloudflare): primero se pinta
  // el aviso de progreso y despues se genera.
  $('#demoBtn').disabled = true;
  api.showProgress(1, L('Generando el ejemplo…', 'Generating the example…'));
  await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
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
  updateDropStatus();
  renderPreflight();
  refreshAnalyzeButton();
  api.runAudit();
}

/**
 * Soltar archivos en CUALQUIER punto de la pagina.
 *
 * Sin esto, un archivo soltado a un centimetro de la caja se lo queda el navegador y
 * abre su dialogo de descarga: el usuario cree que ha fallado la app y en realidad
 * nunca le llego el archivo. Por eso el documento entero es zona valida y, ademas, se
 * anula siempre el comportamiento por defecto aunque el archivo no sea utilizable.
 */
export function dragHasFiles(event) {
  const dt = event.dataTransfer;
  if (!dt) return false;
  if (dt.types && Array.prototype.indexOf.call(dt.types, 'Files') >= 0) return true;
  return Boolean(dt.files && dt.files.length);
}

export let dropDepth = 0;

export function showDropOverlay() {
  const el = $('#dropOverlay');
  if (!el) return;
  // En el periodo no visto se espera el informe del backtest, no los exports.
  const unseen = state.tab === 'unseen' && Boolean(state.analysis);
  const title = el.querySelector('[data-i18n="drop.overlay.title"]');
  const body = el.querySelector('[data-i18n="drop.overlay.body"]');
  if (title) title.textContent = unseen ? L('Suelta aquí el informe del backtest', 'Drop the backtest report here') : t('drop.overlay.title');
  if (body) body.textContent = unseen
    ? L('Se usará para el periodo no visto.', 'It will be used for the unseen period.')
    : t('drop.overlay.body');
  el.hidden = false;
}

export function hideDropOverlay() {
  dropDepth = 0;
  const el = $('#dropOverlay');
  if (el) el.hidden = true;
}

export function bindGlobalDrop() {
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
