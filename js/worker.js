// El análisis corre fuera del hilo principal: una rejilla completa de 100.000
// pasadas bloquearia la pestana durante segundos si se ejecutase en la interfaz.

import { parseTable } from '../core/parse.js';
import { metricColumns, inferParamsSingle } from '../core/schema.js';
import { runAnalysis } from '../core/analysis.js';
import { setLocale } from './i18n.js';

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
function tableFor(table, key, buffer, name) {
  if (table) return table;
  if (key && tableCache.has(key)) return tableCache.get(key);
  if (!buffer) return null;
  const parsed = parseTable(buffer, name);
  remember(key, parsed);
  return parsed;
}

self.onmessage = (event) => {
  const { id, isBuffer, oosBuffer, isName, oosName, policy, locale, searchSet } = event.data;
  const post = (type, payload) => self.postMessage({ id, type, ...payload });
  try {
    // Sin esto, L() en el worker cae siempre a español (no hay document).
    if (locale === 'en' || locale === 'es') setLocale(locale);
    if (event.data.kind === 'preflight') {
      const table = tableFor(null, event.data.key, event.data.buffer, event.data.name);
      post('done', {
        summary: {
          rows: table.rows.length,
          cols: table.headers.length,
          params: inferParamsSingle(table).params.length,
          metrics: Object.keys(metricColumns(table)).length,
          format: table.format || 'table',
        },
      });
      return;
    }
    post('progress', { pct: 2, label: locale === 'en' ? 'Reading files' : 'Leyendo archivos' });
    // Los Excel binarios llegan ya parseados desde el hilo principal, porque el
    // lector opcional solo puede cargarse alli.
    const isTable = tableFor(event.data.isTable, event.data.isKey, isBuffer, isName);
    const oosTable = tableFor(event.data.oosTable, event.data.oosKey, oosBuffer, oosName);
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
    plateaus: a.plateaus.map((p) => ({ ...p, indices: p.indices.slice(0, 5000), core: p.core.slice(0, 5000) })),
  };
}
