// El análisis corre fuera del hilo principal: una rejilla completa de 100.000
// pasadas bloquearia la pestana durante segundos si se ejecutase en la interfaz.

import { parseTable, finishTable } from '../core/parse.js';
import { preflightSummary, roleFromTable } from '../core/schema.js';
import { gridLooksLikeReport } from '../core/report.js';
import { runAnalysis } from '../core/analysis.js';
import { setLocale } from './i18n.js';
import { AnalysisError, CODE, withCode } from '../core/errors.js';

// Tablas ya leidas en la comprobacion previa, por archivo (nombre|tamaño|fecha). Parsear
// un XML de 70 MB cuesta segundos: hacerlo en el hilo principal congelaba la pagina y
// hacerlo dos veces (comprobacion + analisis) lo pagaba doble.
const tableCache = new Map();
const CACHE_MAX = 4;
function remember(key, table) {
  if (!key) return;
  tableCache.delete(key);
  tableCache.set(key, table);
  while (tableCache.size > CACHE_MAX) tableCache.delete(tableCache.keys().next().value);
}
const isZip = (buffer) => {
  const b = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));
  return b[0] === 0x50 && b[1] === 0x4b;
};

// Un .xlsx se descomprime aquí y no en la página: antes se leía en el hilo principal hasta
// cuatro veces (detectar si era informe, detectar el periodo, comprobación previa y
// análisis) y la pestaña se congelaba con libros grandes.
async function readSheet(buffer) {
  const { parseXlsx } = await import('./xlsx.js');
  return parseXlsx(buffer);
}

async function tableFor(table, key, buffer, name) {
  if (table) return table;
  if (key && tableCache.has(key)) return tableCache.get(key);
  if (!buffer) {
    if (!key) return null;
    // La página creía que la tabla seguía aquí y no la ha mandado: que la reenvíe.
    throw new AnalysisError(CODE.CACHE_MISS, 'cache miss', { key });
  }
  let parsed;
  try {
    parsed = isZip(buffer) ? finishTable(await readSheet(buffer), name) : parseTable(buffer, name);
  } catch (err) {
    throw withCode(CODE.FILE_ERROR, err);
  }
  remember(key, parsed);
  return parsed;
}

self.onmessage = async (event) => {
  const { id, isBuffer, oosBuffer, isName, oosName, policy, locale, searchSet } = event.data;
  const post = (type, payload) => self.postMessage({ id, type, ...payload });
  try {
    // Sin esto, L() en el worker cae siempre a español (no hay document).
    if (locale === 'en' || locale === 'es') setLocale(locale);
    if (event.data.kind === 'inspect') {
      // ¿Este .xlsx es el informe de un backtest, la optimización o el forward? Si es una
      // tabla, se queda aquí leída para la comprobación previa y el análisis.
      let sheet;
      try {
        sheet = await readSheet(event.data.buffer);
      } catch (err) {
        throw withCode(CODE.FILE_ERROR, err);
      }
      if (gridLooksLikeReport(sheet.rows)) {
        post('done', { summary: { role: 'report' } });
        return;
      }
      const table = finishTable(sheet, event.data.name);
      remember(event.data.key, table);
      post('done', { summary: { role: roleFromTable(table) } });
      return;
    }
    if (event.data.kind === 'preflight') {
      const table = await tableFor(null, event.data.key, event.data.buffer, event.data.name);
      post('done', { summary: preflightSummary(table) });
      return;
    }
    post('progress', { pct: 2, label: locale === 'en' ? 'Reading files' : 'Leyendo archivos' });
    const isTable = await tableFor(event.data.isTable, event.data.isKey, isBuffer, isName);
    const oosTable = await tableFor(event.data.oosTable, event.data.oosKey, oosBuffer, oosName);
    const analysis = runAnalysis({
      isTable,
      oosTable,
      policy,
      searchSet: searchSet || null,
      onProgress: (p) => post('progress', p),
    });
    // Los arrays por configuración se quedan aquí salvo los que la interfaz dibuja.
    post('done', { analysis: stripHeavy(analysis) });
  } catch (error) {
    post('error', {
      message: error && error.message ? error.message : String(error),
      code: error && error.code ? error.code : null,
      details: error && error.details ? error.details : null,
    });
  }
};

/** Quita del mensaje lo que la interfaz no dibuja, para no copiar decenas de MB. */
function stripHeavy(a) {
  return {
    ...a,
    neighbors: undefined,
    coords: undefined,
    records: a.records.map((r) => ({
      id: r.id,
      params: r.params,
      is: r.is,
      oos: r.oos,
      criterionIs: r.criterionIs,
      criterionOos: r.criterionOos,
      qualityIs: r.qualityIs,
      qualityOos: r.qualityOos,
      score: r.score,
      retention: r.retention,
      passes: r.passes,
      failsIs: r.failsIs,
      failsOos: r.failsOos,
      oosKnown: r.oosKnown,
    })),
    // Los miembros de cada meseta se pasan enteros: el periodo no visto construye su
    // referencia con ellos (core/unseen.js) y recortarlos la sesgaba en mesetas grandes.
    plateaus: a.plateaus,
  };
}
