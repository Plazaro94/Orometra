// El análisis corre fuera del hilo principal: una rejilla completa de 100.000
// pasadas bloquearia la pestana durante segundos si se ejecutase en la interfaz.

import { parseTable } from './parse.js';
import { runAnalysis } from './analysis.js';
import { setLocale } from './i18n.js';

self.onmessage = (event) => {
  const { id, isBuffer, oosBuffer, isName, oosName, policy, locale, searchSet } = event.data;
  const post = (type, payload) => self.postMessage({ id, type, ...payload });
  try {
    // Sin esto, L() en el worker cae siempre a español (no hay document).
    if (locale === 'en' || locale === 'es') setLocale(locale);
    post('progress', { pct: 2, label: locale === 'en' ? 'Reading files' : 'Leyendo archivos' });
    // Los Excel binarios llegan ya parseados desde el hilo principal, porque el
    // lector opcional solo puede cargarse alli.
    const isTable = event.data.isTable || parseTable(isBuffer, isName);
    const oosTable = event.data.oosTable || (oosBuffer ? parseTable(oosBuffer, oosName) : null);
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
    })),
    plateaus: a.plateaus.map((p) => ({ ...p, indices: p.indices.slice(0, 5000), core: p.core.slice(0, 5000) })),
  };
}
