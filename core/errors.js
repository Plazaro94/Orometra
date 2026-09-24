// Taxonomía de fallos y resultados. Separa errores técnicos de resultados
// estadísticos: no son lo mismo "XML inválido" y "0 configuraciones pasan mínimos".

export const CODE = {
  FILE_ERROR: 'FILE_ERROR',
  SCHEMA_ERROR: 'SCHEMA_ERROR',
  DATA_ERROR: 'DATA_ERROR',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  NO_QUALIFYING_CONFIGS: 'NO_QUALIFYING_CONFIGS',
  NO_PLATEAU: 'NO_PLATEAU',
  WORKER_ERROR: 'WORKER_ERROR',
  ANALYSIS_SUCCESS: 'ANALYSIS_SUCCESS',
};

export class AnalysisError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AnalysisError';
    this.code = code;
    this.details = details;
  }
}

/** Clasifica un Error genérico (p. ej. del parser) en un código tipado. */
export function classifyError(err) {
  if (err && err.code && CODE[err.code]) {
    return { code: err.code, message: err.message || String(err), details: err.details || {} };
  }
  const message = err && err.message ? err.message : String(err);
  const m = message.toLowerCase();

  if (/worker|tardado|timeout|transfer|inesperad|unexpected|demasiado/.test(m)) {
    return { code: CODE.WORKER_ERROR, message, details: {} };
  }
  if (/pass|emparej|coincid|parámetro|parametro|comun|común|procedencia|misma optim|same optim/.test(m)) {
    return { code: CODE.SCHEMA_ERROR, message, details: {} };
  }
  if (/xml|xlsx|xls|csv|zip|cabecera|header|formato|format|vac[ií]o|empty|hoja|sheet|binario|opt\b|compatible|unsupported|corrupt|descomprim/.test(m)) {
    return { code: CODE.FILE_ERROR, message, details: {} };
  }
  if (/pocas configur|muy pocas|utilizables|limpi/.test(m)) {
    return { code: CODE.DATA_ERROR, message, details: {} };
  }
  return { code: CODE.DATA_ERROR, message, details: {} };
}

/** Estado del análisis cuando el motor sí termina (no es un throw). */
export function outcomeFromAnalysis(a) {
  if (!a || !a.meta) return { code: CODE.DATA_ERROR };
  if (!a.meta.gatePassCount) {
    return {
      code: CODE.NO_QUALIFYING_CONFIGS,
      gatePassCount: 0,
      total: a.meta.total,
    };
  }
  if (a.meta.underpowered) {
    return {
      code: CODE.INSUFFICIENT_DATA,
      gatePassCount: a.meta.gatePassCount,
      viableNeeded: a.meta.viableNeededForPlateau,
    };
  }
  if (!a.plateaus.length) {
    return {
      code: CODE.NO_PLATEAU,
      gatePassCount: a.meta.gatePassCount,
    };
  }
  return {
    code: CODE.ANALYSIS_SUCCESS,
    plateaus: a.plateaus.length,
    gatePassCount: a.meta.gatePassCount,
  };
}

/** Título + pista cortas para la UI (bilingüe vía L del caller). */
export function errorCopy(code, L) {
  const map = {
    [CODE.FILE_ERROR]: {
      title: L('Error de archivo', 'File error'),
      hint: L(
        'El fichero no se pudo leer como exportación de MT5. Vuelve a exportar el informe XML desde el probador.',
        'The file could not be read as an MT5 export. Re-export the XML report from the tester.',
      ),
    },
    [CODE.SCHEMA_ERROR]: {
      title: L('Error de datos / esquema', 'Data / schema error'),
      hint: L(
        'Los archivos no encajan como in-sample y forward de la misma optimización (Pass, parámetros o procedencia).',
        'The files do not match as in-sample and forward from the same optimization (Pass, parameters, or provenance).',
      ),
    },
    [CODE.DATA_ERROR]: {
      title: L('Datos insuficientes tras la limpieza', 'Insufficient data after cleaning'),
      hint: L(
        'Quedaron demasiadas pocas configuraciones legibles. Revisa columnas, valores vacíos o el emparejado IS/Forward.',
        'Too few readable configurations remained. Check columns, empty values, or the IS/Forward pairing.',
      ),
    },
    [CODE.WORKER_ERROR]: {
      title: L('Fallo del motor de análisis', 'Analysis engine failure'),
      hint: L(
        'El cálculo se interrumpió. Reintenta; si se repite, usa una optimización más pequeña o recarga la página.',
        'The calculation was interrupted. Retry; if it repeats, use a smaller optimization or reload the page.',
      ),
    },
    [CODE.INSUFFICIENT_DATA]: {
      title: L('Evidencia insuficiente para una meseta', 'Insufficient evidence for a plateau'),
      hint: L(
        'Hay configuraciones que pasan los mínimos, pero no hay masa interior suficiente para afirmar una región estable.',
        'Some configurations clear the minima, but there is not enough interior mass to claim a stable region.',
      ),
    },
    [CODE.NO_QUALIFYING_CONFIGS]: {
      title: L('Ninguna configuración pasa los mínimos', 'No configuration clears the minima'),
      hint: L(
        'Eso no es un fallo técnico: con estos mínimos no hay candidatos. Relaja PF/DD/ops o revisa la estrategia.',
        'This is not a technical failure: with these minima there are no candidates. Relax PF/DD/trades or revisit the strategy.',
      ),
    },
    [CODE.NO_PLATEAU]: {
      title: L('Sin meseta estable', 'No stable plateau'),
      hint: L(
        'Hay candidatos, pero no una región conexa con soporte local suficiente. Revisa descartes y cobertura.',
        'There are candidates, but no connected region with enough local support. Check rejected peaks and coverage.',
      ),
    },
    [CODE.ANALYSIS_SUCCESS]: {
      title: L('Auditoría completada', 'Audit complete'),
      hint: L('Se encontró al menos una región estable con el criterio actual.', 'At least one stable region was found under the current criteria.'),
    },
  };
  return map[code] || map[CODE.DATA_ERROR];
}
