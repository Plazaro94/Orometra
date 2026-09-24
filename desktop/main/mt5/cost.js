// Estimador de coste de un job de optimización (antes de lanzar).

import { estimateCombinations } from './ini.js';

const DEFAULT_WARN = 50_000;

/**
 * @param {{ inputs, secondsPerPassEstimate, maxCombinationsWarn? }} opts
 * @returns {{
 *   combinations: number,
 *   optimizedParams: number,
 *   estimatedSeconds: number|null,
 *   estimatedHuman: string,
 *   warn: boolean,
 *   tooLarge: boolean,
 *   suggestions: string[],
 *   message: string,
 * }}
 */
export function estimateJobCost({
  inputs = [],
  secondsPerPassEstimate = null,
  maxCombinationsWarn = DEFAULT_WARN,
} = {}) {
  const { combinations, optimizedParams, capped } = estimateCombinations(inputs);
  const warn = combinations >= maxCombinationsWarn || capped;
  const tooLarge = combinations >= maxCombinationsWarn * 5 || capped;

  let estimatedSeconds = null;
  if (Number.isFinite(secondsPerPassEstimate) && secondsPerPassEstimate > 0) {
    estimatedSeconds = combinations * secondsPerPassEstimate;
  }

  const suggestions = [];
  if (warn) {
    suggestions.push(
      'Reduce el número de parámetros en optimización (menos DoF → más robustez).',
      'Ensancha el paso (step) o acorta el rango inicio–fin.',
      'Si aún así es enorme, considera genético (Optimization=2) solo como último recurso: sesga el muestreo.',
    );
  }
  if (optimizedParams > 5) {
    suggestions.push('Más de ~5 parámetros libres suele producir mesetas frágiles; prioriza 2–4.');
  }

  const estimatedHuman = formatDuration(estimatedSeconds);
  let message;
  if (optimizedParams === 0) {
    message = 'Sin parámetros en Y: será un único backtest.';
  } else if (tooLarge) {
    message = `Espacio enorme (~${fmtNum(combinations)} combinaciones). Reduce rangos antes de lanzar.`;
  } else if (warn) {
    message = `Muchas combinaciones (~${fmtNum(combinations)}). Revisa el estimador y considera reducir.`;
  } else {
    message = `~${fmtNum(combinations)} combinaciones${estimatedHuman ? ` · ~${estimatedHuman}` : ''}.`;
  }

  return {
    combinations,
    optimizedParams,
    estimatedSeconds,
    estimatedHuman,
    warn,
    tooLarge,
    suggestions,
    message,
    maxCombinationsWarn,
  };
}

function fmtNum(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}e9`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

function formatDuration(sec) {
  if (sec == null || !Number.isFinite(sec)) return '';
  if (sec < 60) return `${Math.ceil(sec)} s`;
  if (sec < 3600) return `${Math.ceil(sec / 60)} min`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)} h`;
  return `${(sec / 86400).toFixed(1)} días`;
}
