// Expectativa ajustada por selección: cuánto de lo que una configuración saca de más se
// puede esperar que conserve fuera de los datos con los que se eligió.
//
// MODELO. Para cada configuración z y cada periodo p (in-sample I, forward O), el
// beneficio esperado por operación es
//
//     X_p(z) = mu_p + theta(z) + e_p(z)
//
//   - mu_p     nivel de la familia en ese periodo (recoge el régimen del mercado);
//   - theta(z) ventaja propia de la configuración, la que se arrastra de un periodo a otro;
//   - e_p(z)   suerte de esa configuración en ese periodo, independiente entre periodos,
//              con varianza k / T_p(z): el mismo ruido por operación en los dos periodos,
//              y menos operaciones, más ruido.
//
// TODA LA SELECCIÓN DEPENDE SOLO DEL IN-SAMPLE: el genético decide qué se prueba mirando
// el in-sample, tus mínimos filtran por el in-sample y MT5 solo pasa al forward las mejores
// del in-sample. Por eso NO se usa la dispersión del in-sample entre las que quedan (está
// recortada por esa misma selección; una versión anterior la usaba y encogía de más: en el
// banco, la ventaja propia salía con un sesgo de −6 y su intervalo cubría la verdad el 33 %
// de las veces). Lo que la selección por el in-sample no sesga es la relación del forward
// CONDICIONADA al in-sample. De ella sale todo:
//
//   1. Regresión de X_O sobre X_I entre las que tienen forward: m(x) = a + beta x es lo que
//      saca en el forward, de media, una configuración con ese in-sample. beta es la
//      fracción de lo que una configuración saca de más en el in-sample que se conserva.
//   2. Su varianza residual r = V + k E[1/T_O], con V = Var(theta | X_I) (lo que sigue sin
//      saberse de la ventaja propia tras ver el in-sample) y k E[1/T_O] el ruido del forward.
//   3. Con el modelo normal, beta = Var(theta) / (Var(theta) + k E[1/T_I]), de donde
//      V = Var(theta)(1 - beta) = beta k E[1/T_I]. Con 2: k = r / (beta E[1/T_I] + E[1/T_O]).
//
// Con eso, la expectativa de una configuración dados su in-sample y su forward es la
// media a posteriori (actualización de m con su propio forward, pesado por su ruido):
//
//     esperado = m(x_I) + V / (V + k / T_O) · (x_O - m(x_I))
//
// La media a posteriori descuenta la «maldición del ganador» siempre que condicione sobre
// todos los datos con los que se eligió. Orometra elige por vecindad, así que cada
// candidata se mide con su vecindad (core/analysis.js); medida sola, el banco mostraba que
// encogía de más a las recomendadas.
//
// INCERTIDUMBRE: la varianza a posteriori (lo que no se sabe de theta con el modelo
// conocido) más la del bootstrap por bloques (lo que no se sabe del modelo). Las vecinas
// comparten suerte, así que se remuestrean por celdas del espacio de parámetros (las mismas
// que cuentan las pruebas efectivas).
//
// SOLO SE DA EL LÍMITE INFERIOR de la ventaja sobre la familia, y es a propósito. Medido en
// el banco (bench/shrink.js, 2026-10-14): sin ventaja real, ese límite queda por encima de
// cero el 5 % de las veces en la calibración y el 9 % en el sexto examen (5 de 56); con
// ventaja real, la
// estimación se queda corta, no se pasa (la verdad cae por encima del intervalo en 103 de
// 108 fallos), así que un intervalo de dos lados no cubriría el 95 % que diría. Tampoco se
// da intervalo del beneficio esperado total: su mayor incertidumbre es el nivel de la
// familia en el próximo periodo (el régimen), que con un solo forward no se puede medir.
//
// LÍMITES (se dicen en la app): supone que el próximo periodo se parece al forward en
// nivel y que la ventaja propia se arrastra igual que del in-sample al forward. Un cambio
// de régimen mueve a toda la familia, y eso ningún dato pasado lo anticipa.

import { makeRng } from './rng.js';

const num = (v) => typeof v === 'number' && Number.isFinite(v);

function meanOf(idx, get) {
  let s = 0;
  for (const i of idx) s += get(i);
  return s / idx.length;
}

/** Parámetros del modelo sobre un subconjunto (lista de índices, puede repetir). */
function estimate(items, sample, minN) {
  const fwd = sample.filter((i) => num(items[i].xo));
  if (sample.length < minN || fwd.length < minN) return null;
  const xi = (i) => items[i].xi;
  const xo = (i) => items[i].xo;
  const mI = meanOf(fwd, xi);
  const mO = meanOf(fwd, xo);
  let sxy = 0;
  let sxx = 0;
  for (const i of fwd) {
    sxy += (xi(i) - mI) * (xo(i) - mO);
    sxx += (xi(i) - mI) ** 2;
  }
  if (!(sxx > 0)) return null;
  const beta = sxy / sxx;
  // Sin relación positiva entre periodos no hay ventaja propia que estimar: todo lo que
  // separa a unas configuraciones de otras es suerte del periodo.
  const b = Math.min(1, Math.max(0, beta));
  const a = mO - b * mI;
  let r = 0;
  for (const i of fwd) r += (xo(i) - a - b * xi(i)) ** 2;
  r /= Math.max(1, fwd.length - 2);
  const eI = meanOf(sample, (i) => 1 / items[i].ti);
  const eO = meanOf(fwd, (i) => 1 / items[i].to);
  const k = r / (b * eI + eO);
  const V = b * k * eI;
  // Nivel del forward de una candidata cualquiera (todas, con o sin forward).
  const family = a + b * meanOf(sample, xi);
  return { beta, a, b, k, V, family, n: sample.length, nForward: fwd.length };
}

/** Media y varianza a posteriori del beneficio esperado por operación de un elemento. */
function posterior(est, it) {
  const m = est.a + est.b * it.xi;
  if (!num(it.xo) || !(est.V > 0)) return { mean: m, v: est.V };
  const sO = est.k / it.to;
  const w = est.V / (est.V + sO);
  return { mean: m + w * (it.xo - m), v: est.V * (1 - w) };
}

const pctl = (sorted, q) => {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

const sdAround = (vals, centre) => Math.sqrt(vals.reduce((acc, x) => acc + (x - centre) ** 2, 0) / Math.max(1, vals.length - 1));

/**
 * @param {object} input
 * @param {Array<{xi:number, xo:number, ti:number, to:number, block:string|number}>} input.items
 *   Candidatas (las que cumplen los mínimos del in-sample). `xo` es NaN si no tiene
 *   forward. `xi`/`xo`: beneficio esperado por operación; `ti`/`to`: operaciones.
 * @param {number[]} input.targets  índices de `items` para los que se quiere la expectativa.
 * @returns {{usable:boolean, reason?:string, beta?:number, betaLo?:number, betaHi?:number,
 *   family?:number, n?:number, nForward?:number, blocks?:number, reps?:number,
 *   predictions?:Array<{index:number, expected:number, own:number, ownLo:number}>}}
 *   `own` es la ventaja sobre la familia (esperado menos `family`); `ownLo`, su límite
 *   inferior (1,96 desviaciones).
 */
/**
 * El modelo ajustado sobre todas las candidatas, sin bootstrap, para evaluar otras
 * unidades (una meseta entera, por ejemplo) con `unitPosterior`. Null si no hay datos.
 */
export function fitShrinkModel(items, minN = 30) {
  const ok = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (num(it.xi) && it.ti > 0 && (!num(it.xo) || it.to > 0)) ok.push(i);
  }
  return estimate(items, ok, minN);
}

/** Beneficio esperado por operación de una unidad {xi, ti, xo, to}: media y varianza. */
export function unitPosterior(model, unit) {
  if (!model || !num(unit.xi) || !(unit.ti > 0)) return null;
  return posterior(model, unit);
}

export function selectionShrinkage({ items, targets = [], seed = 20261014, reps = null, minN = 30 } = {}) {
  const ok = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (num(it.xi) && it.ti > 0 && (!num(it.xo) || it.to > 0)) ok.push(i);
  }
  const base = estimate(items, ok, minN);
  if (!base) return { usable: false, reason: 'few' };
  const byBlock = new Map();
  for (const i of ok) {
    const k = items[i].block;
    if (!byBlock.has(k)) byBlock.set(k, []);
    byBlock.get(k).push(i);
  }
  const blocks = [...byBlock.values()];
  if (blocks.length < 10) return { usable: false, reason: 'blocks' };
  // Presupuesto de trabajo parecido al de la fragilidad: repeticiones x configuraciones.
  const R = reps || Math.max(100, Math.min(500, Math.floor(2e7 / Math.max(1, ok.length))));
  const rng = makeRng(seed);
  const betas = [];
  const owns = targets.map(() => []);
  for (let r = 0; r < R; r++) {
    const sample = [];
    for (let b = 0; b < blocks.length; b++) {
      const blk = blocks[Math.floor(rng() * blocks.length)];
      for (const i of blk) sample.push(i);
    }
    const est = estimate(items, sample, minN);
    if (!est) continue;
    betas.push(est.beta);
    targets.forEach((t, k) => {
      const p = posterior(est, items[t]);
      owns[k].push(p.mean - est.family);
    });
  }
  const sb = Float64Array.from(betas).sort();
  return {
    usable: true,
    beta: base.beta,
    betaLo: pctl(sb, 0.025),
    betaHi: pctl(sb, 0.975),
    family: base.family,
    n: base.n,
    nForward: base.nForward,
    blocks: blocks.length,
    reps: betas.length,
    predictions: targets.map((t, k) => {
      const p = posterior(base, items[t]);
      const own = p.mean - base.family;
      return {
        index: t,
        expected: p.mean,
        own,
        ownLo: own - 1.96 * Math.sqrt(p.v + sdAround(owns[k], own) ** 2),
      };
    }),
  };
}
