// Motor de topología: vecindad, estabilidad local, acantilados y mesetas.
//
// Todo lo que sale de aquí es ABSOLUTO, no percentil. Un percentil siempre encuentra
// un "mejor 5%", incluso en una optimizacion donde todo pierde dinero. Un umbral
// absoluto puede decir que no hay nada, que es el resultado más útil del producto.

import { median, quantile, mad, quantileSorted, sortedCopy } from './stats.js';

export const ENGINE_DEFAULTS = {
  targetSupport: 8,
  minSupport: 4,
  // Un vecindario deja de ser local si abarca una parte apreciable de todo lo probado.
  maxLocalShare: 0.05,
  maxRadius: 3,
  sensitivityFloor: 0.12,
  // Un parametro se considera plano solo si lo es por las DOS medidas (marginal y
  // condicional). Ver `conditionalSensitivity`.
  conditionalMinBuckets: 5,
  // Presupuesto de trabajo de la vecindad: desplazamientos x configuraciones.
  neighborWorkBudget: 8e6,
  denseCoverage: 0.35,
  bruteForceLimit: 30000,
  /*
   * UMBRALES DE MESETA, Y DE DONDE SALEN SUS NUMEROS.
   *
   * Pertenecer a una meseta exige que el cuartil inferior de la vecindad sea de calidad
   * buena: no basta con que el punto sea bueno, tiene que serlo su entorno.
   *
   * Estos valores se recalibraron al reestructurar la puntuacion por ejes (ver
   * `metrics.js`). No se tocaron a ojo hasta que los tests pasaran: se anclaron a dos
   * puntos de referencia con significado, calculados sobre la escala nueva con los
   * minimos por defecto (PF 1,20 · DD 20 % · 100 operaciones):
   *
   *   - una configuracion JUSTO EN LAS PUERTAS del usuario          -> 0,40
   *   - una configuracion CLARAMENTE BUENA (PF 1,35 · DD 8 % ·
   *     recuperacion 3 · Sharpe 2 · 400 operaciones)                -> 0,83
   *
   * En la escala ANTERIOR esos mismos dos puntos valian 0,53 y 0,94, porque el factor de
   * beneficio saturaba a partir de 1,30 y casi todo lo decente puntuaba de sobra. Los
   * umbrales se han trasladado conservando su POSICION RELATIVA entre esos dos puntos,
   * que es lo que les da sentido:
   *
   *     suelo de meseta   0,55 -> 0,42     (apenas por encima de "en las puertas")
   *     suelo de nucleo   0,70 -> 0,58     (a un 40 % del camino hacia "buena")
   *     robustez minima     60 -> 50
   *     robustez de nucleo  75 -> 65
   *
   * Si algun dia se vuelve a cambiar la escala de puntuacion, hay que rehacer esta
   * traslacion; dejar los numeros quietos seria endurecer o relajar el criterio sin
   * haberlo decidido.
   */
  plateauFloorQuality: 0.42,
  plateauMinRobust: 50,
  plateauMinFracPass: 0.9,
  plateauMinSize: 3,
  // El nucleo es la parte de la meseta donde hasta el entorno es "excelente".
  // Es de donde se elige la configuración a desplegar.
  coreFloorQuality: 0.58,
  coreMinRobust: 65,
};

/**
 * Tipo de cada parámetro según los valores observados: numerico, booleano o
 * categorico. Un parámetro con valores mezclados se trata como categorico.
 */
export function classifyParams(paramValues) {
  return paramValues.map((vals) => {
    let num = 0;
    let bool = 0;
    let total = 0;
    for (const v of vals) {
      if (v === null || v === undefined) continue;
      total++;
      if (typeof v === 'number') num++;
      else if (typeof v === 'boolean') bool++;
    }
    if (!total) return 'text';
    if (num === total) return 'number';
    if (bool === total) return 'bool';
    return 'text';
  });
}

export function normalizeByType(value, type) {
  if (value === null || value === undefined) return null;
  if (type === 'number') return typeof value === 'number' ? value : null;
  if (type === 'bool') return typeof value === 'boolean' ? value : Boolean(value);
  return String(value);
}

/**
 * Convierte cada parámetro a su posicion ordinal entre los valores observados.
 * Los numeros se ordenan por valor; los booleanos como falso < verdadero; el texto
 * alfabeticamente. Para texto el orden es arbitrario, pero basta: lo único que
 * necesita el motor es saber que dos valores distintos están a un paso.
 */
export function buildCoordinates(paramValues, types) {
  const dims = paramValues.length;
  const kinds = types || classifyParams(paramValues);
  const levels = [];
  const index = [];
  for (let j = 0; j < dims; j++) {
    const uniq = [...new Set(paramValues[j].filter((v) => v !== null && v !== undefined))];
    let sorted;
    if (kinds[j] === 'number') sorted = uniq.sort((a, b) => a - b);
    else if (kinds[j] === 'bool') sorted = [false, true].filter((v) => uniq.includes(v));
    else sorted = uniq.map(String).sort((a, b) => a.localeCompare(b, 'es'));
    levels.push(sorted);
    index.push(new Map(sorted.map((v, k) => [v, k])));
  }
  const n = paramValues[0] ? paramValues[0].length : 0;
  const coords = [];
  for (let i = 0; i < n; i++) {
    const z = new Int32Array(dims);
    for (let j = 0; j < dims; j++) {
      const at = index[j].get(paramValues[j][i]);
      z[j] = at === undefined ? -1 : at;
    }
    coords.push(z);
  }
  return { coords, levels, types: kinds };
}

/**
 * Sensibilidad de cada parámetro: cuánto se mueve la calidad mediana al recorrer sus
 * niveles, en unidades de la dispersión global. Un parámetro plano no aporta a la
 * distancia y, al excluirlo, la densidad de vecinos sube mucho en optimizaciones GA.
 */
export function parameterSensitivity(coords, levels, scores, mask = null, scaleIqr = null) {
  const dims = levels.length;
  const population = [];
  for (let i = 0; i < scores.length; i++) {
    if (!Number.isFinite(scores[i])) continue;
    if (mask && !mask[i]) continue;
    population.push(scores[i]);
  }
  const iqr = Number.isFinite(scaleIqr) && scaleIqr > 0
    ? scaleIqr
    : Math.max(1e-6, quantile(population, 0.75) - quantile(population, 0.25));
  const out = [];
  for (let j = 0; j < dims; j++) {
    if (levels[j].length < 2) {
      out.push({ index: j, sensitivity: 0, levels: levels[j].length, constant: true, levelMedians: [] });
      continue;
    }
    const buckets = Array.from({ length: levels[j].length }, () => []);
    for (let i = 0; i < coords.length; i++) {
      if (!Number.isFinite(scores[i])) continue;
      if (mask && !mask[i]) continue;
      const z = coords[i][j];
      if (z >= 0) buckets[z].push(scores[i]);
    }
    const mins = buckets.map((b) => (b.length >= 3 ? median(b) : NaN)).filter(Number.isFinite);
    const spread = mins.length >= 2 ? Math.max(...mins) - Math.min(...mins) : 0;
    out.push({
      index: j,
      sensitivity: spread / iqr,
      levels: levels[j].length,
      constant: false,
      levelMedians: buckets.map((b) => (b.length ? median(b) : NaN)),
      levelCounts: buckets.map((b) => b.length),
    });
  }
  return out;
}

/**
 * SENSIBILIDAD CONDICIONAL: cuanto cambia la calidad al mover UN parametro dejando
 * todos los demas FIJOS.
 *
 * Existe porque la medida marginal tiene un punto ciego demostrable. La marginal agrupa
 * por el nivel de un parametro y promedia sobre todo lo demas; si el efecto de ese
 * parametro se INVIERTE segun el valor de otro, los dos efectos se cancelan en la media
 * y el parametro aparece perfectamente plano.
 *
 * Caso reproducible: `Stop` mejora cuando `Filtro` esta activo y empeora exactamente
 * igual cuando no lo esta. Sensibilidad marginal = 0.0000, por debajo del suelo, asi que
 * se excluye del espacio. A partir de ahi dos configuraciones que difieren SOLO en `Stop`
 * pasan a ocupar la misma casilla y se cuentan como vecinas: el soporte mediano se
 * multiplica por diez y se fabrica una meseta que no existe. Es el peor fallo posible
 * aqui, porque no da error: da una recomendacion con aire de solidez.
 *
 * La medida condicional no puede caer en eso por construccion. Se agrupan las
 * configuraciones que coinciden en TODOS los demas ejes y, dentro de cada grupo, se mide
 * el recorrido de la calidad a lo largo del eje estudiado. Devuelve la MEDIANA de esos
 * recorridos, para que un grupo raro no mande.
 *
 * Los filtros de regimen ("solo opero si la volatilidad supera X") producen justo este
 * patron, y son comunes en los EA reales, asi que no es una patologia de laboratorio.
 */
export function conditionalSensitivity(coords, levels, scores, mask = null, scaleIqr = null, opts = ENGINE_DEFAULTS) {
  const dims = levels.length;
  const usable = [];
  for (let i = 0; i < coords.length; i++) {
    if (!Number.isFinite(scores[i])) continue;
    if (mask && !mask[i]) continue;
    usable.push(i);
  }
  const pop = usable.map((i) => scores[i]);
  const iqr = Number.isFinite(scaleIqr) && scaleIqr > 0
    ? scaleIqr
    : Math.max(1e-6, quantile(pop, 0.75) - quantile(pop, 0.25));

  /*
   * La clave de agrupacion es "todas las coordenadas MENOS la j". Construirla como texto
   * costaba O(dimensiones) por fila y por eje, y con cien mil configuraciones y diez
   * parametros eso son millones de cadenas: el analisis se acercaba al limite de tiempo.
   *
   * Se sustituye por dos hashes polinomicos acumulados UNA sola vez por fila. Quitar el
   * eje j de la clave es entonces una resta, O(1). Se combinan los dos hashes en un
   * entero seguro para que la probabilidad de que dos vecindades distintas colisionen
   * sea despreciable; una colision suelta solo mezclaria dos grupos en una mediana.
   */
  const P1 = 1000003;
  const P2 = 1000033;
  const M1 = 67108859;  // ~2^26, primos distintos para los dos hashes
  const M2 = 67108837;
  const pow1 = new Float64Array(dims);
  const pow2 = new Float64Array(dims);
  for (let k = 0; k < dims; k++) {
    pow1[k] = k === 0 ? 1 : (pow1[k - 1] * P1) % M1;
    pow2[k] = k === 0 ? 1 : (pow2[k - 1] * P2) % M2;
  }
  const termA = new Float64Array(usable.length * dims);
  const termB = new Float64Array(usable.length * dims);
  const fullA = new Float64Array(usable.length);
  const fullB = new Float64Array(usable.length);
  for (let u = 0; u < usable.length; u++) {
    const z = coords[usable[u]];
    let a = 0;
    let b = 0;
    for (let k = 0; k < dims; k++) {
      const ta = ((z[k] + 1) * pow1[k]) % M1;
      const tb = ((z[k] + 1) * pow2[k]) % M2;
      termA[u * dims + k] = ta;
      termB[u * dims + k] = tb;
      a = (a + ta) % M1;
      b = (b + tb) % M2;
    }
    fullA[u] = a;
    fullB[u] = b;
  }

  const out = [];
  for (let j = 0; j < dims; j++) {
    if (levels[j].length < 2) {
      out.push({ index: j, conditional: 0, buckets: 0, usable: false, constant: true });
      continue;
    }
    const groups = new Map();
    for (let u = 0; u < usable.length; u++) {
      const key = ((fullA[u] - termA[u * dims + j] + M1) % M1) * M2
        + ((fullB[u] - termB[u * dims + j] + M2) % M2);
      let g = groups.get(key);
      if (!g) groups.set(key, (g = []));
      g.push(scores[usable[u]]);
    }
    const swings = [];
    for (const g of groups.values()) {
      if (g.length < 2) continue; // un grupo con un solo punto no dice nada de este eje
      let lo = Infinity;
      let hi = -Infinity;
      for (const v of g) { if (v < lo) lo = v; if (v > hi) hi = v; }
      swings.push(hi - lo);
    }
    const ok = swings.length >= opts.conditionalMinBuckets;
    out.push({
      index: j,
      // Recorrido tipico de la calidad a lo largo del eje, con lo demas fijo, en
      // unidades de la dispersion entre configuraciones viables.
      conditional: ok ? median(swings) / iqr : NaN,
      buckets: swings.length,
      usable: ok,
      constant: false,
    });
  }
  return out;
}

/**
 * Reparte los parámetros en tres papeles.
 *
 * - `distanceDims`: numericos que influyen. Son los que definen "estar a un paso".
 * - `blockDims`: booleanos y enumeraciones que influyen. NO entran en la distancia:
 *   parten el espacio en superficies separadas y dos configuraciones solo son vecinas
 *   si coinciden en todos ellos. Un booleano que importa deja a cada configuración
 *   pegada a su opuesto, mucho peor; tratarlo como un paso más haría imposible
 *   encontrar mesetas, cuando en realidad activar o no un filtro es una decisión de
 *   diseño que nadie cambia por accidente.
 * - `flatDims`: influencia por debajo del suelo. Se ignoran por completo.
 *
 * Solo se excluye un parámetro cuando es DEMOSTRABLEMENTE plano. Recortar por un tope
 * de comodidad equivaldria a llamar "vecinas" a configuraciones que son distintas, lo
 * que infla el soporte y fabrica mesetas falsas.
 */
export function selectDims(sensitivity, types, opts = ENGINE_DEFAULTS, conditional = null) {
  const usable = sensitivity.filter((s) => !s.constant);
  const isCategorical = (j) => types && types[j] !== 'number';

  /*
   * Influencia efectiva = la MAYOR de las dos medidas.
   *
   * La asimetria es deliberada y va en la direccion segura. Conservar un eje que no
   * influye solo hace la vecindad mas dispersa, y eso la app lo detecta y lo avisa como
   * soporte insuficiente. Descartar un eje que SI influye es invisible y fabrica mesetas
   * falsas. Ante la duda, se conserva.
   */
  const condOf = new Map();
  if (conditional) for (const c of conditional) if (c.usable && Number.isFinite(c.conditional)) condOf.set(c.index, c.conditional);
  const influence = (srec) => Math.max(srec.sensitivity || 0, condOf.get(srec.index) || 0);
  usable.forEach((srec) => { srec.effective = influence(srec); srec.conditional = condOf.has(srec.index) ? condOf.get(srec.index) : NaN; });

  // Los categoricos parten SIEMPRE, sin mirar su sensibilidad. Dos motivos: un
  // booleano nunca es "un paso pequeño" en ningún caso, y ademas su sensibilidad se
  // mide sobre la poblacion viable, donde un parámetro cuyo valor malo eliminan las
  // puertas aparece enganosamente plano.
  const categorical = usable.filter((s) => isCategorical(s.index));
  const numeric = usable.filter((s) => !isCategorical(s.index));

  let influential = numeric.filter((s) => influence(s) >= opts.sensitivityFloor);
  if (!influential.length && numeric.length) {
    influential = [...numeric].sort((a, b) => influence(b) - influence(a)).slice(0, Math.min(2, numeric.length));
  }
  let distanceDims = influential.map((s) => s.index);
  // Ordenados de menos a más influyente: si hace falta soltar bloqueos para recuperar
  // soporte, se suelta primero el que menos importa.
  let blockDims = [...categorical].sort((a, b) => influence(a) - influence(b)).map((s) => s.index);

  // Sin ningún numerico útil, los categoricos tienen que sostener la distancia.
  if (!distanceDims.length) {
    distanceDims = blockDims.slice().sort((a, b) => a - b);
    blockDims = [];
  }
  const used = new Set([...distanceDims, ...blockDims]);
  return {
    distanceDims: distanceDims.sort((a, b) => a - b),
    blockDims,
    flatDims: usable.filter((s) => !used.has(s.index)).map((s) => s.index).sort((a, b) => a - b),
  };
}

function encodeKey(z, dims) {
  let s = '';
  for (let k = 0; k < dims.length; k++) s += z[dims[k]] + ',';
  return s;
}

/**
 * Desplazamientos con distancia Manhattan <= radius.
 *
 * COMPLETO: cualquier numero de ejes a la vez. La version anterior solo generaba
 * desplazamientos que tocaban uno o dos ejes, y eso producia una incoherencia: en un
 * espacio de diez parametros, una configuracion que difiere UN paso en tres ejes esta a
 * distancia 3 -dentro del radio- y no se contaba como vecina, mientras que otra a TRES
 * pasos en un solo eje si. Se median los alrededores con una cruz en vez de con una
 * bola, lo que sesgaba las mesetas hacia crestas alineadas con los ejes y subestimaba el
 * soporte en dimension alta.
 *
 * Si el conjunto completo no cabe en el presupuesto se devuelve `complete:false` y el
 * motor lo avisa, en lugar de degradar en silencio.
 */
function completeOffsets(dimCount, radius, maxOffsets) {
  const out = [];
  const cur = new Int32Array(dimCount);
  let overflow = false;
  const walk = (pos, left) => {
    if (overflow) return;
    if (pos === dimCount) {
      let any = false;
      for (let k = 0; k < dimCount; k++) if (cur[k] !== 0) { any = true; break; }
      if (!any) return;
      out.push(Int32Array.from(cur));
      if (out.length > maxOffsets) overflow = true;
      return;
    }
    // Poda: si no queda margen, el resto de ejes solo puede valer cero.
    if (left === 0) {
      for (let k = pos; k < dimCount; k++) cur[k] = 0;
      walk(dimCount, 0);
      return;
    }
    for (let v = -left; v <= left; v++) {
      cur[pos] = v;
      walk(pos + 1, left - Math.abs(v));
      if (overflow) return;
    }
    cur[pos] = 0;
  };
  walk(0, radius);
  return overflow ? null : out;
}

/** Respaldo cuando el conjunto completo no cabe: uno o dos ejes, como antes. */
function axisPairOffsets(dimCount, radius) {
  const out = [];
  for (let a = 0; a < dimCount; a++) {
    for (let d = -radius; d <= radius; d++) {
      if (d === 0) continue;
      const off = new Int32Array(dimCount);
      off[a] = d;
      out.push(off);
    }
    for (let b = a + 1; b < dimCount; b++) {
      for (let da = -radius; da <= radius; da++) {
        if (da === 0) continue;
        for (let db = -radius; db <= radius; db++) {
          if (db === 0) continue;
          if (Math.abs(da) + Math.abs(db) > radius) continue;
          const off = new Int32Array(dimCount);
          off[a] = da;
          off[b] = db;
          out.push(off);
        }
      }
    }
  }
  return out;
}

function buildOffsets(dimCount, radius, maxOffsets) {
  const full = completeOffsets(dimCount, radius, maxOffsets);
  if (full) return { offsets: full, complete: true };
  return { offsets: axisPairOffsets(dimCount, radius), complete: false };
}

function neighborsDense(coords, activeDims, blockDims, radius, maxOffsets = Infinity) {
  // El prefijo de bloqueo va en la clave, así que dos configuraciones nunca se cruzan
  // si difieren en un booleano o en una enumeracion.
  const buckets = new Map();
  for (let i = 0; i < coords.length; i++) {
    const key = encodeKey(coords[i], blockDims) + '|' + encodeKey(coords[i], activeDims);
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(i);
  }
  const { offsets, complete } = buildOffsets(activeDims.length, radius, maxOffsets);
  const neighbors = new Array(coords.length);
  neighbors.offsetsComplete = complete;
  for (let i = 0; i < coords.length; i++) {
    const acc = [];
    const block = encodeKey(coords[i], blockDims) + '|';
    // Mismas coordenadas en la distancia: difieren solo en ejes planos.
    const same = buckets.get(block + encodeKey(coords[i], activeDims));
    if (same) for (const k of same) if (k !== i) acc.push(k);
    for (const off of offsets) {
      let key = block;
      for (let k = 0; k < activeDims.length; k++) key += (coords[i][activeDims[k]] + off[k]) + ',';
      const list = buckets.get(key);
      if (list) for (const k of list) if (k !== i) acc.push(k);
    }
    neighbors[i] = acc;
  }
  return neighbors;
}

function neighborsSparse(coords, activeDims, blockDims, radius) {
  const n = coords.length;
  const neighbors = Array.from({ length: n }, () => []);
  const d = activeDims.length;
  const b = blockDims.length;
  for (let i = 0; i < n; i++) {
    const zi = coords[i];
    outer: for (let k = i + 1; k < n; k++) {
      const zk = coords[k];
      for (let a = 0; a < b; a++) if (zi[blockDims[a]] !== zk[blockDims[a]]) continue outer;
      let dist = 0;
      for (let a = 0; a < d; a++) {
        dist += Math.abs(zi[activeDims[a]] - zk[activeDims[a]]);
        if (dist > radius) continue outer;
      }
      neighbors[i].push(k);
      neighbors[k].push(i);
    }
  }
  return neighbors;
}

/**
 * Construye la vecindad ampliando el radio hasta alcanzar un soporte mediano util.
 * El radio efectivo se informa: es una decisión del motor que el usuario debe ver.
 */
export function buildNeighborhood(coords, activeDims, { dense, blockDims = [], opts = ENGINE_DEFAULTS }) {
  if (!activeDims.length) {
    return { neighbors: coords.map(() => []), radius: 0, medianSupport: 0, truncated: false };
  }
  const truncated = !dense && coords.length > opts.bruteForceLimit;

  /*
   * El radio se amplia hasta reunir vecinas suficientes, pero el objetivo NO puede ser
   * un número absoluto: en una rejilla de 25 configuraciones, exigir 8 vecinas obliga a
   * un radio que abarca casi la mitad del espacio, y entonces la "estabilidad local" ya
   * no es local, es el promedio de todo. El objetivo se limita por tanto a una fraccion
   * de lo realmente probado. Con optimizaciones grandes el límite no ata y manda el
   * objetivo de siempre; con rejillas pequeñas de 2 o 3 parámetros, que es donde fallaba,
   * el vecindario se queda donde debe.
   */
  const localityCap = Math.max(opts.minSupport, Math.floor(coords.length * opts.maxLocalShare));
  const effectiveTarget = Math.min(opts.targetSupport, localityCap);

  // Cuantos desplazamientos caben sin que el calculo se vuelva lento. El conjunto
  // completo de la bola de Manhattan crece deprisa con la dimension, asi que se acota
  // por trabajo total (desplazamientos x configuraciones) y se informa si no ha cabido.
  const maxOffsets = Math.max(64, Math.floor((opts.neighborWorkBudget || 8e6) / Math.max(1, coords.length)));
  const build = (r) => (dense || truncated
    ? neighborsDense(coords, activeDims, blockDims, r, maxOffsets)
    : neighborsSparse(coords, activeDims, blockDims, r));

  // Radio 1 siempre es aceptable: es la vecindad más local que existe. A partir de ahi
  // solo se amplia mientras el resultado SIGA siendo local. Antes se ampliaba hasta
  // alcanzar el objetivo costase lo que costase, y en rejillas pequeñas eso convertia
  // el "vecindario" en un tercio del espacio.
  let radius = 1;
  let neighbors = build(1);
  let med = median(neighbors.map((a) => a.length));
  while (radius < opts.maxRadius && med < opts.targetSupport) {
    const nextNeighbors = build(radius + 1);
    const nextMed = median(nextNeighbors.map((a) => a.length));
    if (nextMed > localityCap) break; // ampliar más dejaria de medir estabilidad local
    radius += 1;
    neighbors = nextNeighbors;
    med = nextMed;
  }
  return {
    neighbors,
    radius,
    medianSupport: median(neighbors.map((a) => a.length)),
    effectiveTarget,
    localityCapped: effectiveTarget < opts.targetSupport,
    truncated,
    // `neighborsSparse` compara distancias de verdad, asi que siempre es exacta. La
    // densa depende de haber podido generar la bola completa de desplazamientos.
    offsetsComplete: neighbors.offsetsComplete !== false,
  };
}

/**
 * Regularidad de la rejilla de cada parametro numerico.
 *
 * El motor trabaja con POSICIONES ordinales: el nivel 3 esta "a un paso" del 4 sea cual
 * sea la distancia real entre sus valores. Si alguien optimiza StopLoss en
 * {10, 20, 30, 100, 500}, el salto 30 -> 100 cuenta igual que 10 -> 20, y una meseta que
 * abarque de 100 a 500 no es una meseta en ningun sentido economico.
 *
 * No se corrige automaticamente -cambiar la distancia rompe la rejilla entera de enteros
 * sobre la que se apoya la busqueda-, pero se DETECTA y se avisa, y se marca que mesetas
 * cruzan un salto desproporcionado.
 */
export function gridRegularity(levels, types, paramNames, tolerance = 3) {
  const out = [];
  for (let j = 0; j < levels.length; j++) {
    if (types && types[j] !== 'number') continue;
    const lv = levels[j];
    if (lv.length < 3) continue;
    const steps = [];
    for (let k = 1; k < lv.length; k++) {
      const d = lv[k] - lv[k - 1];
      if (Number.isFinite(d) && d > 0) steps.push(d);
    }
    if (steps.length < 2) continue;
    const lo = Math.min(...steps);
    const hi = Math.max(...steps);
    if (!(lo > 0)) continue;
    const ratio = hi / lo;
    if (ratio < tolerance) continue;
    // Donde estan los saltos grandes, para poder decir cuales y marcar las mesetas.
    const jumps = [];
    for (let k = 1; k < lv.length; k++) {
      const d = lv[k] - lv[k - 1];
      if (d >= lo * tolerance) jumps.push({ fromIndex: k - 1, toIndex: k, from: lv[k - 1], to: lv[k], step: d });
    }
    out.push({ index: j, name: paramNames ? paramNames[j] : String(j), ratio, minStep: lo, maxStep: hi, jumps });
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}

/**
 * Extension de una meseta en el espacio de parametros, no en numero de configuraciones.
 *
 * Importa por el sesgo circular del algoritmo genetico: el GA insiste donde el in-sample
 * iba bien, asi que esas zonas acumulan mas configuraciones probadas y, por tanto,
 * componentes mas grandes. Medir el tamano contando miembros premia en parte DONDE MIRO
 * EL OPTIMIZADOR en vez de donde el terreno es estable.
 *
 * El volumen de la caja que ocupa la region (en niveles de rejilla) no depende de cuanto
 * se muestreo, asi que sirve de tope: una region no puede reclamar mas evidencia que el
 * espacio que de verdad abarca.
 */
export function componentExtent(component, coords, activeDims, levels) {
  const dims = activeDims && activeDims.length ? activeDims : levels.map((_, j) => j);
  const perDim = [];
  let volume = 1;
  for (const j of dims) {
    let lo = Infinity;
    let hi = -Infinity;
    const seen = new Set();
    for (const i of component) {
      const z = coords[i][j];
      if (z < 0) continue;
      seen.add(z);
      if (z < lo) lo = z;
      if (z > hi) hi = z;
    }
    if (!seen.size) continue;
    const width = hi - lo + 1;
    perDim.push({ index: j, width, distinct: seen.size, minIndex: lo, maxIndex: hi });
    volume = Math.min(volume * width, 1e12);
  }
  const size = component.length;
  return {
    perDim,
    boundingVolume: volume,
    // >1 significa que se han probado mas configuraciones de las que caben en la caja:
    // imposible en rejilla, normal en genetico con valores fuera de una malla regular.
    occupancy: volume > 0 ? size / volume : NaN,
    // Evidencia que la region puede reclamar sin que el muestreo la infle.
    effectiveSize: Math.max(1, Math.min(size, volume)),
    // Anchura tipica en niveles por parametro: la cifra que un operador entiende.
    typicalWidth: perDim.length
      ? Math.exp(perDim.reduce((a, d) => a + Math.log(Math.max(1, d.width)), 0) / perDim.length)
      : 1,
  };
}

/**
 * Estadística local de cada configuración: suelo de la vecindad, fraccion que pasa
 * las puertas, acantilado (caida maxima de un paso) y z de pico aislado.
 *
 * `globalScale` DEBE calcularse sobre la poblacion viable (las que pasan las puertas),
 * no sobre todas. En una optimizacion típica la mayoria de configuraciones puntuan
 * cero; si se toma esa poblacion como referencia, la dispersión tiende a cero y
 * cualquier meseta legitima parece un acantilado.
 */
export function localStability(neighbors, scores, passes, globalScale) {
  const n = scores.length;
  const out = new Array(n);
  const globalMad = Math.max(1e-6, globalScale.mad);
  const iqr = Math.max(1e-6, globalScale.iqr);
  for (let i = 0; i < n; i++) {
    const nb = neighbors[i];
    const vals = [];
    let passCount = 0;
    for (const k of nb) {
      if (Number.isFinite(scores[k])) vals.push(scores[k]);
      if (passes[k]) passCount++;
    }
    if (!vals.length) {
      out[i] = { support: nb.length, fracPass: NaN, q25: NaN, q10: NaN, medianNb: NaN, worst: NaN, cliff: NaN, peakZ: NaN };
      continue;
    }
    const sorted = sortedCopy(vals);
    const medNb = quantileSorted(sorted, 0.5);
    const localMad = Math.max(mad(vals), globalMad * 0.5);
    const own = scores[i];
    out[i] = {
      support: nb.length,
      fracPass: nb.length ? passCount / nb.length : NaN,
      q25: quantileSorted(sorted, 0.25),
      q10: quantileSorted(sorted, 0.1),
      medianNb: medNb,
      worst: sorted[0],
      // Acantilado: cuánto se cae, en unidades de dispersión global, al dar un paso.
      cliff: Number.isFinite(own) ? Math.max(0, own - sorted[0]) / iqr : NaN,
      // Pico: cuánto sobresale el punto respecto a su propia vecindad.
      peakZ: Number.isFinite(own) ? (own - medNb) / localMad : NaN,
    };
  }
  return out;
}

/**
 * Puntuacion de robustez 0..100, absoluta.
 * Producto geometrico: calidad propia, suelo de la vecindad y fraccion que pasa
 * puertas. Si cualquiera se hunde, la robustez se hunde. Después se penaliza el
 * acantilado y el pico aislado, y se escala por el soporte disponible.
 */
export function robustnessScores(scores, passes, stability, opts = ENGINE_DEFAULTS, supportTarget = null) {
  const n = scores.length;
  const out = new Float64Array(n).fill(NaN);
  /*
   * El soporte se mide contra lo que ESTA OPTIMIZACION puede dar, no contra un número
   * absoluto. En una rejilla de dos parámetros, cuatro vecinas son toda la información
   * local que existe; dividir por un objetivo fijo de 8 recortaria la robustez a la
   * mitad en todo el conjunto y haría inalcanzable el umbral de meseta.
   *
   * Que el soporte global sea escaso es un problema real, pero es un problema GLOBAL:
   * se avisa aparte en el veredicto. Meterlo ademas en la puntuacion de cada punto lo
   * contaba dos veces y dejaba clases enteras de optimizaciones sin ninguna meseta.
   */
  const target = Number.isFinite(supportTarget) && supportTarget > 0
    ? Math.min(opts.targetSupport, Math.max(opts.minSupport, supportTarget))
    : opts.targetSupport;
  for (let i = 0; i < n; i++) {
    const st = stability[i];
    if (!Number.isFinite(scores[i]) || !st || !Number.isFinite(st.q25)) continue;
    if (!passes[i]) {
      out[i] = 0;
      continue;
    }
    const own = Math.max(0, scores[i]);
    const floor = Math.max(0, st.q25);
    const frac = Number.isFinite(st.fracPass) ? st.fracPass : 0;
    const core = Math.pow(own, 0.3) * Math.pow(floor, 0.4) * Math.pow(frac, 0.3);
    const cliffPenalty = 1 / (1 + Math.max(0, (st.cliff || 0) - 1.5));
    const peakPenalty = 1 / (1 + Math.max(0, (st.peakZ || 0) - 2));
    const supportFactor = Math.min(1, st.support / target);
    out[i] = 100 * core * cliffPenalty * peakPenalty * supportFactor;
  }
  return out;
}

/** Marca las configuraciones que pueden formar parte de una meseta. */
export function plateauCandidates(robust, passes, stability, opts = ENGINE_DEFAULTS) {
  const n = robust.length;
  const candidate = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const st = stability[i];
    if (!passes[i] || !st || !Number.isFinite(robust[i])) continue;
    if (st.support < opts.minSupport) continue;
    if (!(st.q25 >= opts.plateauFloorQuality)) continue;
    if (!(st.fracPass >= opts.plateauMinFracPass)) continue;
    if (robust[i] < opts.plateauMinRobust) continue;
    candidate[i] = 1;
  }
  return candidate;
}

/** Subconjunto de una meseta donde incluso el entorno es excelente. */
export function coreMembers(component, robust, stability, opts = ENGINE_DEFAULTS) {
  return component.filter((i) => stability[i].q25 >= opts.coreFloorQuality && robust[i] >= opts.coreMinRobust);
}

/** Componentes conexas de candidatos. */
export function findPlateaus(neighbors, robust, passes, stability, opts = ENGINE_DEFAULTS) {
  const n = robust.length;
  const candidate = plateauCandidates(robust, passes, stability, opts);
  const seen = new Uint8Array(n);
  const components = [];
  for (let s = 0; s < n; s++) {
    if (!candidate[s] || seen[s]) continue;
    const stack = [s];
    seen[s] = 1;
    const comp = [];
    while (stack.length) {
      const u = stack.pop();
      comp.push(u);
      for (const v of neighbors[u]) {
        if (candidate[v] && !seen[v]) {
          seen[v] = 1;
          stack.push(v);
        }
      }
    }
    components.push(comp);
  }
  return components.filter((c) => c.length >= opts.plateauMinSize);
}

/**
 * Elige el representante de una meseta por criterio maximin: la configuración cuyo
 * PEOR vecino es el mejor posible. Deliberadamente NO se elige el máximo de la zona;
 * la cima de una meseta suele estar en su borde y es la que peor envejece.
 */
export function chooseRepresentative(component, neighbors, scores, robust) {
  let best = component[0];
  let bestKey = -Infinity;
  const inComp = new Set(component);
  for (const i of component) {
    const nb = neighbors[i];
    let worst = Number.isFinite(scores[i]) ? scores[i] : 0;
    let inside = 0;
    for (const k of nb) {
      if (inComp.has(k)) inside++;
      if (Number.isFinite(scores[k]) && scores[k] < worst) worst = scores[k];
    }
    const interior = nb.length ? inside / nb.length : 0;
    const key = worst * 0.6 + interior * 0.3 + (robust[i] / 100) * 0.1;
    if (key > bestKey) {
      bestKey = key;
      best = i;
    }
  }
  return best;
}

/**
 * Parámetros de la meseta que tocan el límite del rango explorado.
 * Solo tiene sentido para parámetros numericos: en un booleano o una enumeracion no
 * hay un "más alla" que no se haya probado.
 */
export function boundaryParams(component, coords, levels, paramNames, types) {
  const touched = [];
  for (let j = 0; j < levels.length; j++) {
    if (levels[j].length < 2) continue; // constante: no se optimizo, no es frontera
    if (types && types[j] !== 'number') continue;
    let atMin = false;
    let atMax = false;
    for (const i of component) {
      if (coords[i][j] === 0) atMin = true;
      if (coords[i][j] === levels[j].length - 1) atMax = true;
    }
    if (atMin || atMax) {
      touched.push({
        name: paramNames[j],
        index: j,
        atMin,
        atMax,
        min: levels[j][0],
        max: levels[j][levels[j].length - 1],
      });
    }
  }
  return touched;
}

/**
 * Parámetros cuyo óptimo in-sample NO SIRVE fuera de muestra.
 *
 * La medida no es la correlación entre los perfiles de cada periodo, sino el
 * ARREPENTIMIENTO: cuánta calidad forward se pierde por haber elegido el valor que
 * ganaba en el in-sample, en lugar del que gana en el forward. Es lo que de verdad
 * cuesta la decisión, y capta casos que la correlación se deja: un perfil puede estar
 * invertido solo a medias y aún así llevarte al peor valor posible.
 *
 * Se exige ademas que el perfil in-sample tenga preferencia real: si es plano, su
 * "mejor valor" es ruido y no hay nada que reprochar. Y el arrepentimiento se mide en
 * unidades de la dispersión entre configuraciones viables, para no señalar milesimas.
 */
export function detectInversions(coords, levels, paramNames, isQuality, oosQuality, scaleIqr, opts = {}) {
  const minPerLevel = opts.minPerLevel || 10;
  const scale = Math.max(1e-6, scaleIqr);
  const minRegret = opts.minRegret !== undefined ? opts.minRegret : 0.25 * scale;
  const minSwing = opts.minSwing !== undefined ? opts.minSwing : 0.25 * scale;
  const out = [];
  for (let j = 0; j < levels.length; j++) {
    if (levels[j].length < 2) continue;
    const bIs = Array.from({ length: levels[j].length }, () => []);
    const bOos = Array.from({ length: levels[j].length }, () => []);
    for (let i = 0; i < coords.length; i++) {
      const z = coords[i][j];
      if (z < 0) continue;
      if (Number.isFinite(isQuality[i])) bIs[z].push(isQuality[i]);
      if (Number.isFinite(oosQuality[i])) bOos[z].push(oosQuality[i]);
    }
    const usable = [];
    for (let k = 0; k < levels[j].length; k++) {
      if (bIs[k].length < minPerLevel || bOos[k].length < minPerLevel) continue;
      usable.push({ level: levels[j][k], is: median(bIs[k]), oos: median(bOos[k]), n: bOos[k].length });
    }
    if (usable.length < 2) continue;
    const vals = (key) => usable.map((u) => u[key]);
    const swingIs = Math.max(...vals('is')) - Math.min(...vals('is'));
    const swingOos = Math.max(...vals('oos')) - Math.min(...vals('oos'));
    // Un perfil in-sample plano no expresa ninguna preferencia que reprochar.
    if (swingIs < minSwing) continue;

    const bestIs = usable.reduce((a, b) => (b.is > a.is ? b : a));
    const bestOos = usable.reduce((a, b) => (b.oos > a.oos ? b : a));
    const regret = bestOos.oos - bestIs.oos;
    if (regret < minRegret) continue;

    const rankOf = (key) => {
      const order = usable.map((_, i) => i).sort((a, b) => usable[a][key] - usable[b][key]);
      const r = new Array(usable.length);
      order.forEach((idx, pos) => { r[idx] = pos; });
      return r;
    };
    const ra = rankOf('is');
    const rb = rankOf('oos');
    const n = usable.length;
    const m = (n - 1) / 2;
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < n; i++) {
      num += (ra[i] - m) * (rb[i] - m);
      da += (ra[i] - m) ** 2;
      db += (rb[i] - m) ** 2;
    }
    const rho = da && db ? num / Math.sqrt(da * db) : 0;
    out.push({
      index: j,
      name: paramNames[j],
      rho,
      regret,
      // Fraccion del margen forward disponible que se tira por elegir con el in-sample.
      regretShare: swingOos > 0 ? regret / swingOos : 0,
      swingIs,
      swingOos,
      bestIs: bestIs.level,
      bestOos: bestOos.level,
      profile: usable,
    });
  }
  return out.sort((a, b) => b.regret - a.regret);
}

/**
 * Rango para una segunda optimizacion en rejilla, centrado en la configuración
 * recomendada y con un presupuesto de combinaciones que se pueda ejecutar de verdad.
 *
 * Abarcar toda la meseta no sirve: cuando la región es amplia, su envolvente es casi
 * el rango original y la "segunda optimizacion" sería igual de grande que la primera.
 * Aquí se parte del representante, se abre un paso en cada eje y después se reparte
 * el presupuesto dando más amplitud a los parámetros más influyentes.
 */
export function refinementRange(repIndex, coords, levels, paramNames, sensitivity, types, budget = 20000) {
  const z0 = coords[repIndex];
  const optimised = [];
  const isNumeric = (j) => !types || types[j] === 'number';
  const radius = levels.map((lv, j) => {
    // Un booleano o una enumeracion no se barre por rango: se deja en su valor.
    if (lv.length < 2 || !isNumeric(j)) return 0;
    optimised.push(j);
    return 1;
  });
  const sensOf = (j) => {
    const s = sensitivity && sensitivity[j];
    return s && Number.isFinite(s.sensitivity) ? s.sensitivity : 0;
  };
  const spanOf = (j) => {
    if (levels[j].length < 2) return 1;
    const lo = Math.max(0, z0[j] - radius[j]);
    const hi = Math.min(levels[j].length - 1, z0[j] + radius[j]);
    return hi - lo + 1;
  };
  const total = () => optimised.reduce((acc, j) => acc * spanOf(j), 1);

  // Recorta por el parámetro menos influyente hasta entrar en el presupuesto.
  let guard = 0;
  while (total() > budget && guard++ < 500) {
    const shrinkable = optimised.filter((j) => radius[j] > 0).sort((a, b) => sensOf(a) - sensOf(b));
    if (!shrinkable.length) break;
    radius[shrinkable[0]] -= 1;
  }
  // Y amplia por el más influyente mientras quepa.
  guard = 0;
  while (guard++ < 500) {
    const candidates = optimised
      .filter((j) => spanOf(j) < levels[j].length)
      .sort((a, b) => sensOf(b) - sensOf(a));
    let grew = false;
    for (const j of candidates) {
      const before = spanOf(j);
      radius[j] += 1;
      if (spanOf(j) === before) continue; // ya tocaba los dos extremos
      if (total() <= budget) {
        grew = true;
        break;
      }
      radius[j] -= 1;
    }
    if (!grew) break;
  }

  return levels.map((lv, j) => {
    const type = types ? types[j] : 'number';
    if (lv.length < 2) return { name: paramNames[j], type, constant: true, value: lv[0] };
    if (!isNumeric(j)) {
      return { name: paramNames[j], type, constant: false, center: lv[z0[j]], levels: 1, fixed: true, categorical: true };
    }
    const lo = Math.max(0, z0[j] - radius[j]);
    const hi = Math.min(lv.length - 1, z0[j] + radius[j]);
    const inner = lv.slice(lo, hi + 1);
    const steps = inner.slice(1).map((v, k) => v - inner[k]).filter((d) => Number.isFinite(d) && d > 0);
    return {
      name: paramNames[j],
      type,
      constant: false,
      center: lv[z0[j]],
      start: inner[0],
      stop: inner[inner.length - 1],
      step: steps.length ? Math.min(...steps) : 0,
      levels: inner.length,
      fixed: inner.length === 1,
    };
  });
}
