// Primitivas estadisticas. Sin dependencias, deterministas.

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function sortedCopy(a) {
  const s = Float64Array.from(a);
  s.sort();
  return s;
}

/** Cuantil por interpolacion lineal sobre un array ya ordenado. */
export function quantileSorted(sorted, q) {
  const n = sorted.length;
  if (!n) return NaN;
  if (n === 1) return sorted[0];
  const pos = (n - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function quantile(values, q) {
  const clean = values.filter(isNum);
  if (!clean.length) return NaN;
  return quantileSorted(sortedCopy(clean), q);
}

export function median(values) {
  return quantile(values, 0.5);
}

export function mean(values) {
  const clean = values.filter(isNum);
  if (!clean.length) return NaN;
  let s = 0;
  for (const v of clean) s += v;
  return s / clean.length;
}

export function stdev(values) {
  const clean = values.filter(isNum);
  if (clean.length < 2) return NaN;
  const m = mean(clean);
  let s = 0;
  for (const v of clean) s += (v - m) ** 2;
  return Math.sqrt(s / (clean.length - 1));
}

/** Desviacion absoluta mediana, escalada para ser comparable a una sigma normal. */
export function mad(values) {
  const clean = values.filter(isNum);
  if (clean.length < 2) return 0;
  const m = median(clean);
  return 1.4826 * median(clean.map((v) => Math.abs(v - m)));
}

/** min/max sin operador spread: `Math.min(...arr)` revienta la pila con arrays grandes. */
export function extent(values) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (!isNum(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo === Infinity ? [NaN, NaN] : [lo, hi];
}

/** Rango percentil en [0,1], con empates promediados. NaN donde el valor no es finito. */
export function percentileRanks(values) {
  const idx = [];
  for (let i = 0; i < values.length; i++) if (isNum(values[i])) idx.push(i);
  idx.sort((a, b) => values[a] - values[b]);
  const out = new Array(values.length).fill(NaN);
  const n = idx.length;
  let p = 0;
  while (p < n) {
    let q = p + 1;
    while (q < n && values[idx[q]] === values[idx[p]]) q++;
    const rank = (p + q + 1) / 2;
    for (let k = p; k < q; k++) out[idx[k]] = rank / n;
    p = q;
  }
  return out;
}

export function spearman(a, b) {
  const ra = percentileRanks(a);
  const rb = percentileRanks(b);
  const xs = [];
  const ys = [];
  for (let i = 0; i < ra.length; i++) {
    if (isNum(ra[i]) && isNum(rb[i])) {
      xs.push(ra[i]);
      ys.push(rb[i]);
    }
  }
  if (xs.length < 3) return NaN;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den ? num / den : NaN;
}

/** Inversa de la normal estandar. Algoritmo de Acklam, error relativo < 1.15e-9. */
export function normInv(p) {
  if (!(p > 0 && p < 1)) return NaN;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let q;
  let r;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5;
  r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** CDF normal estandar via aproximación de Abramowitz-Stegun para erf. */
export function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

/**
 * Máximo esperado de N normales estandar i.i.d. (Bailey & Lopez de Prado).
 * Cuantas desviaciones típicas por encima de la media cabe esperar del mejor de N.
 */
export function expectedMaxZ(n) {
  if (!(n > 1)) return NaN;
  const g = 0.5772156649015329;
  return (1 - g) * normInv(1 - 1 / n) + g * normInv(1 - 1 / (n * Math.E));
}

export function expectedMaximum(mu, sigma, n) {
  if (!isNum(mu) || !isNum(sigma) || !(n > 1)) return NaN;
  return mu + sigma * expectedMaxZ(n);
}

/**
 * Error típico asintotico de un Sharpe estimado con `n` observaciones (Lo, 2002),
 * asumiendo rendimientos independientes: SE = sqrt((1 + SR^2/2) / (n - 1)).
 *
 * Es la cifra correcta para el contraste de seleccion. La alternativa tentadora
 * -usar la dispersión del Sharpe ENTRE configuraciones- esta mal: esa dispersión la
 * produce sobre todo la forma de la superficie de parámetros, no el ruido de
 * estimacion, y al tomarla como hipotesis nula infla el umbral hasta declarar
 * "azar" resultados que no lo son.
 */
export function sharpeStandardError(sharpe, observations) {
  if (!isNum(sharpe) || !(observations > 2)) return NaN;
  return Math.sqrt((1 + 0.5 * sharpe * sharpe) / (observations - 1));
}

import { makeRng } from './rng.js';
export { makeRng };

/**
 * FRAGILIDAD DE LA REGLA DE SELECCION.
 *
 * Aviso importante sobre el nombre, porque aquí se juega la honestidad del producto:
 * esto NO es el PBO de Bailey y Lopez de Prado, y llamarlo así sería tomar prestada
 * la autoridad de un metodo que no estamos ejecutando.
 *
 * El CSCV original parte la SERIE TEMPORAL de rendimientos de cada prueba en S bloques
 * y recombina todas las particiones entrenamiento/prueba. Eso exige la curva de equity
 * de cada configuracion. La exportacion de optimizacion de MT5 no la trae: solo da
 * metricas agregadas por pasada. Con esos datos el CSCV completo es IMPOSIBLE, y no hay
 * aproximacion que lo arregle; es una limitacion estructural del fichero de entrada.
 *
 * Lo que si se puede medir, y es util, es otra cosa: dado que la particion IS/OOS esta
 * FIJA, ¿cuanto depende el resultado de QUE configuraciones habia en el menu? En cada
 * repeticion se toma un subconjunto de configuraciones, se elige la mejor segun el
 * periodo de entrenamiento, y se mira en que percentil del periodo de prueba cae.
 *
 *   fragilidad = fraccion de veces que la elegida cae por debajo de la mediana
 *
 * Interpretacion honesta: mide si la REGLA "quedate con la primera de la tabla" resiste,
 * no la probabilidad de sobreajuste en sentido estricto.
 */
function fragilityOneWay(pairs, trainKey, testKey, rng, repeats, take) {
  const n = pairs.length;
  const lambdas = [];
  let below = 0;
  // Muestreo SIN reemplazo (Fisher-Yates parcial). Antes se sorteaba con reemplazo, lo
  // que metia la misma configuracion varias veces en el mismo subconjunto y sesgaba
  // tanto la eleccion del maximo como el percentil contra el que se compara.
  const idx = new Int32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  for (let r = 0; r < repeats; r++) {
    for (let i = 0; i < take; i++) {
      const k = i + Math.floor(rng() * (n - i));
      const tmp = idx[i]; idx[i] = idx[k]; idx[k] = tmp;
    }
    let bestAt = idx[0];
    for (let i = 1; i < take; i++) if (pairs[idx[i]][trainKey] > pairs[bestAt][trainKey]) bestAt = idx[i];
    const chosen = pairs[bestAt][testKey];
    let rank = 0;
    for (let i = 0; i < take; i++) if (pairs[idx[i]][testKey] < chosen) rank++;
    const w = rank / take;
    if (w < 0.5) below++;
    const clamped = Math.min(1 - 1e-6, Math.max(1e-6, w));
    lambdas.push(Math.log(clamped / (1 - clamped)));
  }
  const p = below / repeats;
  const se = Math.sqrt(Math.max(0, p * (1 - p)) / repeats);
  return { p, margin: 2 * se, lo: Math.max(0, p - 2 * se), hi: Math.min(1, p + 2 * se), lambdas };
}

/**
 * Contraste de seleccion en LOS DOS SENTIDOS: validacion cruzada simetrica de 2 pliegues.
 *
 * Es el minimo honesto que la particion IS/OOS permite, y es lo que el CSCV hace por
 * construccion: no basta con entrenar en IS y probar en OOS, hay que hacerlo tambien al
 * reves. El motivo es concreto y no es academico: si el tramo forward resulto ser mas
 * facil, elegir por IS y validar en OOS sale bien por el motivo equivocado. Comparar las
 * dos direcciones lo destapa, porque una ventaja real es aproximadamente simetrica y un
 * artefacto de que un periodo sea mas benigno no lo es.
 *
 * - `fragility`    : el PEOR de los dos sentidos. Una regla de seleccion vale lo que vale
 *                    en su direccion mala, igual que una configuracion vale lo que su peor
 *                    periodo.
 * - `asymmetry`    : diferencia entre sentidos. Grande = los dos periodos no son
 *                    intercambiables, y cualquier conclusion depende de cual toco de cual.
 */
export function selectionFragility(isScores, oosScores, { repeats = 2000, fraction = 0.5, seed = 20260919 } = {}) {
  const pairs = [];
  for (let i = 0; i < isScores.length; i++) {
    if (isNum(isScores[i]) && isNum(oosScores[i])) pairs.push([isScores[i], oosScores[i]]);
  }
  const n = pairs.length;
  if (n < 20) return { fragility: NaN, n, usable: false, folds: null };
  // Presupuesto: take grande (para no sesgar la fragilidad al alza en rejillas
  // densas) y repeats que quepan. Antes, take=n/2 en 100k configs × 2 sentidos
  // × fragilidad dual volvía el análisis inviable.
  const BUDGET = 5_000_000;
  const rawTake = Math.max(10, Math.min(n - 1, Math.floor(n * fraction)));
  const take = Math.min(rawTake, 15000);
  const effRepeats = Math.max(100, Math.min(repeats, Math.floor(BUDGET / Math.max(1, take))));
  const forward = fragilityOneWay(pairs, 0, 1, makeRng(seed), effRepeats, take);
  const reverse = fragilityOneWay(pairs, 1, 0, makeRng(seed ^ 0x5bf03635), effRepeats, take);
  const worst = forward.p >= reverse.p ? forward : reverse;
  return {
    fragility: worst.p,
    margin: worst.margin,
    lo: worst.lo,
    hi: worst.hi,
    lambdas: worst.lambdas,
    folds: {
      isToOos: { value: forward.p, margin: forward.margin },
      oosToIs: { value: reverse.p, margin: reverse.margin },
    },
    asymmetry: Math.abs(forward.p - reverse.p),
    worstDirection: forward.p >= reverse.p ? 'is->oos' : 'oos->is',
    n,
    repeats: effRepeats,
    take,
    usable: true,
  };
}

/** Degradacion IS -> OOS por deciles de IS. */
export function degradationByDecile(isScores, oosScores, bins = 10) {
  const pairs = [];
  for (let i = 0; i < isScores.length; i++) {
    if (isNum(isScores[i]) && isNum(oosScores[i])) pairs.push([isScores[i], oosScores[i]]);
  }
  if (pairs.length < bins * 3) return [];
  pairs.sort((a, b) => a[0] - b[0]);
  const out = [];
  const per = pairs.length / bins;
  for (let b = 0; b < bins; b++) {
    const slice = pairs.slice(Math.floor(b * per), Math.floor((b + 1) * per));
    out.push({
      decile: b + 1,
      count: slice.length,
      isMedian: median(slice.map((p) => p[0])),
      oosMedian: median(slice.map((p) => p[1])),
      oosQ25: quantile(slice.map((p) => p[1]), 0.25),
    });
  }
  return out;
}
