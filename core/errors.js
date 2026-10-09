// Taxonomía de fallos y resultados. Separa errores técnicos de resultados
// estadísticos: no son lo mismo "XML inválido" y "0 configuraciones pasan mínimos".

export const CODE = {
  FILE_ERROR: 'FILE_ERROR',
  SCHEMA_ERROR: 'SCHEMA_ERROR',
  // Los mínimos tecleados no son válidos: no es culpa de ningún archivo.
  POLICY_ERROR: 'POLICY_ERROR',
  DATA_ERROR: 'DATA_ERROR',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  NO_QUALIFYING_CONFIGS: 'NO_QUALIFYING_CONFIGS',
  NO_PLATEAU: 'NO_PLATEAU',
  WORKER_ERROR: 'WORKER_ERROR',
  REPORT_ERROR: 'REPORT_ERROR',
  TOO_LARGE: 'TOO_LARGE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  // Lo pidió el usuario: no es un fallo y no se muestra como tal.
  CANCELLED: 'CANCELLED',
  // Interno: el worker ya no tiene la tabla que la página creía que tenía. La página la
  // reenvía; nunca llega a mostrarse.
  CACHE_MISS: 'CACHE_MISS',
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

/**
 * Clasifica un error por su código. Los fallos previstos (archivo, esquema, motor…) se
 * lanzan como AnalysisError con código; cualquier otro es un fallo nuestro, no de los
 * datos del usuario. Antes se adivinaba por el texto del mensaje y lo que no encajaba
 * salía como "datos no utilizables": el usuario culpaba a su archivo de un error interno.
 */
export function classifyError(err) {
  const message = err && err.message ? err.message : String(err);
  if (err && err.code && CODE[err.code]) {
    return { code: err.code, message, details: err.details || {} };
  }
  return { code: CODE.INTERNAL_ERROR, message, details: {} };
}

/**
 * El mismo error con `code` si no traía uno. Para las fronteras donde cualquier fallo es
 * del archivo (leerlo y descomprimirlo): un XML truncado puede romper el lector de mil
 * formas, y todas significan "este archivo no se puede leer".
 */
export function withCode(code, err) {
  if (err && err.code && CODE[err.code]) return err;
  const message = err && err.message ? err.message : String(err);
  return new AnalysisError(code, message, { cause: err && err.name ? err.name : undefined });
}

/** Estado del análisis cuando el motor sí termina (no es un throw). */
export function outcomeFromAnalysis(a) {
  if (!a || !a.meta) return { code: CODE.DATA_ERROR };
  // Sin candidatas para BUSCAR mesetas. Si hay meseta en el in-sample y ninguna pasa en
  // el forward, no es "nada que analizar": el veredicto lo explica como hallazgo.
  const searchCount = Number.isFinite(a.meta.searchPassCount) ? a.meta.searchPassCount : a.meta.gatePassCount;
  if (!searchCount) {
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
        'El fichero no se pudo leer como exportación de MT5. Vuelve a exportar el XML de la optimización desde el probador.',
        'The file could not be read as an MT5 export. Re-export the optimization XML from the tester.',
      ),
    },
    [CODE.SCHEMA_ERROR]: {
      title: L('Los archivos no encajan', 'The files do not match'),
      hint: L(
        'Exporta los dos de la misma optimización: la tabla de resultados de la optimización y la del forward, sin volver a lanzarla entre medias.',
        'Export both from the same optimization: the optimization results table and the forward one, without running it again in between.',
      ),
    },
    [CODE.POLICY_ERROR]: {
      title: L('Revisa los mínimos', 'Check the minimums'),
      hint: '',
    },
    [CODE.DATA_ERROR]: {
      title: L('Datos no utilizables', 'Unusable data'),
      hint: L(
        'Comprueba que el export es la tabla completa de resultados de MT5, sin filtrar ni recortar.',
        'Check that the export is the full MT5 results table, unfiltered and untrimmed.',
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
        'Hay configuraciones que pasan los mínimos, pero son demasiado pocas para afirmar que hay una meseta.',
        'Some configurations clear the minimums, but too few to claim a plateau.',
      ),
    },
    [CODE.NO_QUALIFYING_CONFIGS]: {
      title: L('Ninguna configuración pasa los mínimos', 'No configuration clears the minimums'),
      hint: L(
        'Eso no es un fallo técnico: con estos mínimos no hay candidatos. Relaja los mínimos (factor de beneficio, drawdown, operaciones) o revisa el rango que optimizaste.',
        'This is not a technical failure: with these minimums there are no candidates. Relax the minimums (profit factor, drawdown, trades) or review the range you optimized.',
      ),
    },
    [CODE.NO_PLATEAU]: {
      title: L('Sin meseta estable', 'No stable plateau'),
      hint: L(
        'Hay candidatos, pero ninguno forma una meseta: no hay una zona continua con suficientes configuraciones vecinas. Revisa descartes y cobertura.',
        'There are candidates, but none forms a plateau: no continuous zone has enough neighboring configurations. Check rejected peaks and coverage.',
      ),
    },
    [CODE.REPORT_ERROR]: {
      title: L('No se ha podido leer el informe del backtest', 'The backtest report could not be read'),
      hint: L(
        'El periodo no visto se contrasta con el informe de un backtest individual de la configuración elegida, no con una optimización.',
        'The unseen period is checked against the report of a single backtest of the chosen configuration, not an optimization.',
      ),
    },
    [CODE.TOO_LARGE]: {
      title: L('Optimización demasiado grande', 'Optimization too large'),
      hint: L(
        'Recorta los rangos de los parámetros o divide la optimización en partes y analízalas por separado.',
        'Narrow the parameter ranges, or split the optimization into parts and analyze them separately.',
      ),
    },
    [CODE.INTERNAL_ERROR]: {
      title: L('Error interno de Orometra', 'Orometra internal error'),
      hint: L(
        'No es culpa de tu archivo: el análisis ha fallado por un error nuestro. Vuelve a intentarlo; si se repite, escríbenos a hello@orometra.com con el mensaje de arriba.',
        'It is not your file: the analysis failed because of a bug on our side. Try again; if it repeats, write to hello@orometra.com with the message above.',
      ),
    },
    [CODE.ANALYSIS_SUCCESS]: {
      title: L('Auditoría completada', 'Audit complete'),
      hint: L('Se encontró al menos una meseta con el criterio actual.', 'At least one plateau was found under the current criteria.'),
    },
  };
  return map[code] || map[CODE.INTERNAL_ERROR];
}
