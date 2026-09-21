// Orquestador del análisis completo. Es codigo puro: no toca el DOM, para poder
// ejecutarlo dentro de un Web Worker y también en los tests de Node.

import { toNumber, canonicalValue } from './parse.js';
import { pairTables, metricColumns, inferParamsSingle, estimatePeriodRatio } from './schema.js';
import { DEFAULT_POLICY, resolvePolicy, periodQuality, payoffScale, gateFailures, combineScores, retention } from './metrics.js';
import {
  ENGINE_DEFAULTS, buildCoordinates, classifyParams, normalizeByType, parameterSensitivity,
  conditionalSensitivity, selectDims, buildNeighborhood, localStability, robustnessScores,
  findPlateaus, coreMembers, chooseRepresentative, boundaryParams, refinementRange,
  detectInversions, gridRegularity, componentExtent,
} from './engine.js';
import {
  median, quantile, mad, spearman, selectionFragility, degradationByDecile, expectedMaximum,
  sharpeStandardError, normCdf, mean, stdev, extent, makeRng,
} from './stats.js';
import { buildVerdict } from './verdict.js';

const METRIC_KEYS = ['profit', 'profitFactor', 'recoveryFactor', 'sharpe', 'drawdown', 'trades', 'expectedPayoff'];

function readMetrics(row, roles) {
  const out = {};
  for (const key of METRIC_KEYS) {
    out[key] = roles[key] ? toNumber(row[roles[key].col]) : NaN;
  }
  return out;
}

function progress(cb, pct, label) {
  if (cb) cb({ pct, label });
}

/**
 * @param {{isTable:object, oosTable?:object, policy?:object, opts?:object, onProgress?:Function}} input
 */
export function runAnalysis({ isTable, oosTable, policy: rawPolicy = DEFAULT_POLICY, opts = ENGINE_DEFAULTS, onProgress } = {}) {
  const started = Date.now();
  // Las anclas de la puntuacion se derivan de los minimos que ha pedido el usuario, para
  // no imponerle nuestra escala de riesgo. Ver `resolvePolicy`.
  const policy = resolvePolicy(rawPolicy);
  const hasForward = Boolean(oosTable);
  progress(onProgress, 5, 'Emparejando archivos');

  let paramNames = [];
  let records = [];
  let integrity = null;
  let isRoles = metricColumns(isTable);
  let oosRoles = oosTable ? metricColumns(oosTable) : {};

  if (hasForward) {
    const paired = pairTables(isTable, oosTable);
    integrity = paired.integrity;
    paramNames = paired.paramColumns.map((p) => p.name);
    records = paired.matched.map((m) => ({
      id: m.id,
      params: paired.paramColumns.map((p) => canonicalValue(m.isRow[p.isCol])),
      is: readMetrics(m.isRow, isRoles),
      oos: readMetrics(m.oosRow, oosRoles),
      criterionIs: isRoles.result ? toNumber(m.isRow[isRoles.result.col]) : NaN,
      criterionOos: oosRoles.forwardResult ? toNumber(m.oosRow[oosRoles.forwardResult.col]) : NaN,
    }));
  } else {
    const inferred = inferParamsSingle(isTable);
    if (!inferred.params.length) throw new Error('No se ha podido identificar ningún parámetro en el archivo.');
    paramNames = inferred.params.map((p) => p.name);
    integrity = {
      isRows: isTable.rows.length, oosRows: 0, matchedRows: isTable.rows.length,
      unmatchedIs: 0, duplicateIds: 0, provenance: { checked: false, mismatches: 0 },
      inferredParams: inferred,
    };
    records = isTable.rows.map((row, i) => ({
      id: String(i),
      params: inferred.params.map((p) => canonicalValue(row[p.isCol])),
      is: readMetrics(row, isRoles),
      oos: {},
      criterionIs: isRoles.result ? toNumber(row[isRoles.result.col]) : NaN,
      criterionOos: NaN,
    }));
  }

  // Se descartan filas con parámetros ilegibles, pero se cuenta cuántas para el informe.
  const before = records.length;
  records = records.filter((r) => r.params.every((v) => v !== null && v !== undefined && v !== ''));
  const droppedParams = before - records.length;
  if (records.length < 10) throw new Error('Quedan muy pocas configuraciones utilizables tras la limpieza.');

  // Un mismo parámetro puede venir como número, como booleano ("true"/"false") o como
  // texto de una enumeracion. Se fija un tipo por columna y se normaliza todo a el.
  const paramTypes = classifyParams(paramNames.map((_, j) => records.map((r) => r.params[j])));
  records.forEach((r) => { r.params = r.params.map((v, j) => normalizeByType(v, paramTypes[j])); });

  progress(onProgress, 18, 'Evaluando calidad y puertas');
  const periodRatio = hasForward ? estimatePeriodRatio(records) : NaN;
  const minTradesIs = policy.gates.minTrades;
  const minTradesOos = hasForward && Number.isFinite(periodRatio)
    ? Math.max(30, policy.gates.minTrades * periodRatio)
    : policy.gates.minTrades;

  // El beneficio por operacion necesita una referencia: se toma del propio conjunto.
  const payoffValues = records.flatMap((r) => (hasForward ? [r.is.expectedPayoff, r.oos.expectedPayoff] : [r.is.expectedPayoff]));
  const payoffAnchor = payoffScale(payoffValues);

  const scores = new Array(records.length);
  const passes = new Uint8Array(records.length);
  let gatePassCount = 0;
  records.forEach((r, i) => {
    const qi = periodQuality(r.is, policy, payoffAnchor);
    // Al forward se le ajusta el ancla de operaciones por su duracion (aritmetica pura).
    // La correccion de riesgo por raiz de n NO entra en la puntuacion -supondria un modelo
    // que no podemos verificar para cada EA- y se calcula aparte solo para diagnosticar
    // cuanta de la ventaja aparente del forward viene de ser mas corto.
    const qo = hasForward ? periodQuality(r.oos, policy, payoffAnchor, periodRatio) : { score: NaN, parts: {} };
    const qoAdj = hasForward ? periodQuality(r.oos, policy, payoffAnchor, periodRatio, { adjustRisk: true }) : { score: NaN };
    r.qualityOosLengthAdjusted = qoAdj.score;
    r.qualityIs = qi.score;
    r.qualityOos = qo.score;
    r.qualityParts = { is: qi.parts, oos: qo.parts };
    r.score = hasForward ? combineScores(qi.score, qo.score) : qi.score;
    r.retention = retention(qi.score, qo.score);
    r.failsIs = gateFailures(r.is, policy, minTradesIs);
    r.failsOos = hasForward ? gateFailures(r.oos, policy, minTradesOos) : [];
    const ok = !r.failsIs.length && (!hasForward || !r.failsOos.length);
    r.passes = ok;
    passes[i] = ok ? 1 : 0;
    if (ok) gatePassCount++;
    scores[i] = r.score;
  });

  // Escala de referencia: se mide la dispersión SOLO entre configuraciones viables.
  // Si se midiera sobre todas, la masa de configuraciones con puntuacion cero
  // aplastaria la escala y cualquier meseta real pareceria un acantilado.
  const viableMask = new Uint8Array(records.length);
  let viable = [];
  for (let i = 0; i < records.length; i++) if (passes[i] && Number.isFinite(scores[i])) viable.push(scores[i]);
  if (viable.length >= 30) {
    for (let i = 0; i < records.length; i++) viableMask[i] = passes[i];
  } else {
    viable = [];
    for (let i = 0; i < records.length; i++) {
      if (Number.isFinite(scores[i]) && scores[i] > 0) {
        viable.push(scores[i]);
        viableMask[i] = 1;
      }
    }
    if (viable.length < 30) {
      viable = scores.filter(Number.isFinite);
      viableMask.fill(1);
    }
  }
  const globalScale = {
    iqr: Math.max(0.02, quantile(viable, 0.75) - quantile(viable, 0.25)),
    mad: Math.max(0.01, mad(viable)),
    population: viable.length,
  };

  progress(onProgress, 30, 'Construyendo el espacio de parámetros');
  const paramValues = paramNames.map((_, j) => records.map((r) => r.params[j]));
  const { coords, levels } = buildCoordinates(paramValues, paramTypes);
  const cartesian = levels.reduce((a, l) => a * Math.max(1, l.length), 1);
  const coverage = cartesian > 0 ? records.length / cartesian : 0;
  const optimisedDims = levels.filter((l) => l.length > 1).length;

  /*
   * GRADOS DE LIBERTAD: cuanta evidencia sostiene cada parametro que has ajustado.
   *
   * Es la division mas elemental de todas y la aplicacion no la hacia. Ajustar 13
   * parametros con 363 operaciones son 28 observaciones por parametro: con eso no se
   * puede afirmar nada sobre la forma de una superficie de 13 dimensiones, por bonita que
   * salga la meseta. Todos los contrastes de mas abajo se apoyan en que esta cifra sea
   * razonable, asi que conviene darla antes que ellos.
   *
   * No hay un numero magico y no se finge que lo haya. Lo que si se puede afirmar es que
   * por debajo de unas pocas decenas de operaciones por parametro se esta midiendo sobre
   * todo ruido, y que la referencia relevante es el periodo de VALIDACION, porque el
   * in-sample ya se gasto en elegir.
   */
  const tradesIsMedian = median(records.map((r) => r.is.trades).filter(Number.isFinite));
  const tradesOosMedian = hasForward ? median(records.map((r) => r.oos.trades).filter(Number.isFinite)) : NaN;
  const evidenceTrades = hasForward ? tradesOosMedian : tradesIsMedian;
  const degreesOfFreedom = {
    params: optimisedDims,
    tradesIs: tradesIsMedian,
    tradesOos: tradesOosMedian,
    perParamIs: optimisedDims > 0 ? tradesIsMedian / optimisedDims : NaN,
    perParamOos: optimisedDims > 0 && Number.isFinite(tradesOosMedian) ? tradesOosMedian / optimisedDims : NaN,
    perParam: optimisedDims > 0 && Number.isFinite(evidenceTrades) ? evidenceTrades / optimisedDims : NaN,
    basedOn: hasForward ? 'forward' : 'in-sample',
    // Cuantas alternativas se han probado por cada operacion disponible para juzgarlas.
    // Por encima de 1 se han explorado mas configuraciones que datos hay para separarlas.
    trialsPerTrade: Number.isFinite(evidenceTrades) && evidenceTrades > 0 ? records.length / evidenceTrades : NaN,
  };
  const sampling = coverage >= opts.denseCoverage ? 'grid' : coverage >= 0.02 ? 'partial' : 'sparse';

  /*
   * ¿QUE PUERTA ESTA DECIDIENDO DE VERDAD?
   *
   * El usuario configura tres minimos y da por hecho que los tres pesan. Medido sobre EA
   * reales no es asi: en uno de ellos el drawdown mediano de las mesetas era del 8,7 %
   * con la puerta en el 20 %, asi que moverla entre 18 y 25 no cambiaba nada en absoluto,
   * mientras que mover el factor de beneficio entre 1,15 y 1,25 devolvia tres
   * configuraciones recomendadas DISTINTAS.
   *
   * `sole` es la cifra que importa: cuantas configuraciones quedan fuera SOLO por esa
   * puerta. Si es cero, esa puerta no esta haciendo nada, y el usuario merece saberlo
   * antes de pasarse una tarde ajustandola.
   */
  const gateInfluence = (() => {
    const names = ['beneficio', 'profitFactor', 'drawdown', 'trades'];
    const test = (m, minTrades) => ({
      beneficio: Boolean(policy.gates.requireProfit && Number.isFinite(m.profit) && !(m.profit > 0)),
      profitFactor: Boolean(Number.isFinite(m.profitFactor) && m.profitFactor < policy.gates.minProfitFactor),
      drawdown: Boolean(Number.isFinite(m.drawdown) && m.drawdown > policy.gates.maxDrawdownPct),
      trades: Boolean(Number.isFinite(m.trades) && m.trades < minTrades),
    });
    const fail = Object.fromEntries(names.map((n) => [n, 0]));
    const sole = Object.fromEntries(names.map((n) => [n, 0]));
    for (const r of records) {
      const inIs = test(r.is, minTradesIs);
      const inOos = hasForward ? test(r.oos, minTradesOos) : null;
      const hit = names.filter((n) => inIs[n] || (inOos && inOos[n]));
      for (const n of hit) fail[n]++;
      if (hit.length === 1) sole[hit[0]]++;
    }
    const passing = records.filter((r) => r.passes);
    const medianOf = (pick) => (passing.length ? median(passing.map(pick).filter(Number.isFinite)) : NaN);
    const observed = {
      profitFactor: medianOf((r) => (hasForward ? Math.min(r.is.profitFactor, r.oos.profitFactor) : r.is.profitFactor)),
      drawdown: medianOf((r) => (hasForward ? Math.max(r.is.drawdown, r.oos.drawdown) : r.is.drawdown)),
      trades: medianOf((r) => (hasForward ? Math.min(r.is.trades, r.oos.trades) : r.is.trades)),
      beneficio: NaN,
    };
    const limits = {
      profitFactor: policy.gates.minProfitFactor,
      drawdown: policy.gates.maxDrawdownPct,
      trades: minTradesIs,
      beneficio: 0,
    };
    return names.map((n) => ({
      name: n,
      fail: fail[n],
      sole: sole[n],
      // Una puerta es inerte si ninguna configuracion depende SOLO de ella para quedar
      // fuera: quitarla del todo no cambiaria quien pasa.
      inert: sole[n] === 0,
      observed: observed[n],
      limit: limits[n],
    }));
  })();

  progress(onProgress, 42, 'Midiendo sensibilidad de parámetros');
  const sensitivity = parameterSensitivity(coords, levels, scores, viableMask, globalScale.iqr);
  sensitivity.forEach((s) => {
    s.name = paramNames[s.index];
    s.values = levels[s.index];
  });
  // La medida marginal tiene un punto ciego: un parametro cuyo efecto se invierte segun
  // otro aparece plano y se descartaria del espacio, inflando la vecindad. La condicional
  // no puede caer en eso. Manda la mayor de las dos.
  const conditional = conditionalSensitivity(coords, levels, scores, viableMask, globalScale.iqr, opts);
  const condByIndex = new Map(conditional.map((c) => [c.index, c]));
  sensitivity.forEach((sRec) => {
    const c = condByIndex.get(sRec.index);
    sRec.conditional = c && c.usable ? c.conditional : NaN;
    sRec.conditionalBuckets = c ? c.buckets : 0;
    sRec.effective = Math.max(sRec.sensitivity || 0, (c && c.usable && Number.isFinite(c.conditional)) ? c.conditional : 0);
  });
  const conditionalUsable = conditional.filter((c) => c.usable).length;
  // Parametros que la marginal habria tirado y la condicional rescata: es exactamente el
  // fallo que esta medida existe para evitar, asi que se informa cuando ocurre.
  const rescuedDims = sensitivity
    .filter((sRec) => !sRec.constant && paramTypes[sRec.index] === 'number'
      && (sRec.sensitivity || 0) < opts.sensitivityFloor && (sRec.effective || 0) >= opts.sensitivityFloor)
    .map((sRec) => ({ name: paramNames[sRec.index], marginal: sRec.sensitivity, conditional: sRec.conditional }));

  const dense = sampling === 'grid';
  const dims = selectDims(sensitivity, paramTypes, opts, conditional);
  const activeDims = dims.distanceDims;
  const blockDims = dims.blockDims;
  const flatDims = dims.flatDims.map((j) => paramNames[j]);

  // Saltos desproporcionados en la malla de un parametro: el motor trata todos los pasos
  // como equivalentes, asi que conviene decir cuando no lo son.
  const irregularGrids = gridRegularity(levels, paramTypes, paramNames);

  progress(onProgress, 55, 'Detectando vecindades');
  // Bloquear por todos los categoricos puede dejar particiones demasiado pequeñas.
  // Si el soporte se hunde, se van soltando los bloqueos menos influyentes y se
  // informa de cuales, porque relaja la interpretación de "vecina".
  let blocking = blockDims.slice();
  const releasedBlocks = [];
  let nb = buildNeighborhood(coords, activeDims, { dense, blockDims: blocking, opts });
  while (nb.medianSupport < opts.minSupport && blocking.length) {
    releasedBlocks.push(blocking[0]);
    blocking = blocking.slice(1);
    nb = buildNeighborhood(coords, activeDims, { dense, blockDims: blocking, opts });
  }
  const neighbors = nb.neighbors;

  progress(onProgress, 68, 'Analizando estabilidad local');
  const stability = localStability(neighbors, scores, passes, globalScale);
  const robust = robustnessScores(scores, passes, stability, opts, nb.medianSupport);

  progress(onProgress, 76, 'Buscando inversiones entre periodos');
  const inversions = hasForward
    ? detectInversions(coords, levels, paramNames, records.map((r) => r.qualityIs), records.map((r) => r.qualityOos), globalScale.iqr)
    : [];

  progress(onProgress, 78, 'Buscando mesetas');
  const components = findPlateaus(neighbors, robust, passes, stability, opts);
  const inPlateau = new Int32Array(records.length).fill(-1);
  const plateaus = components.map((comp, ci) => {
    comp.forEach((i) => { inPlateau[i] = ci; });
    // El nucleo manda: el representante y el rango de refinamiento salen de el.
    const core = coreMembers(comp, robust, stability, opts);
    const basis = core.length >= 3 ? core : comp;
    const rep = chooseRepresentative(basis, neighbors, scores, robust);
    const compScores = comp.map((i) => scores[i]).filter(Number.isFinite);
    const [worstMember] = extent(compScores);
    // Cuanto espacio abarca de verdad la region, con independencia de cuantas veces se
    // muestreo. Con algoritmo genetico, contar miembros premia donde miro el optimizador.
    const ext = componentExtent(comp, coords, activeDims.length ? activeDims : blocking, levels);
    // Mesetas que cruzan un salto desproporcionado de la malla: su continuidad es un
    // artefacto de que el motor cuenta posiciones, no distancias reales.
    const spansIrregular = [];
    for (const g of irregularGrids) {
      const occupied = new Set(comp.map((i) => coords[i][g.index]));
      const crossed = g.jumps.filter((jp) => occupied.has(jp.fromIndex) && occupied.has(jp.toIndex));
      if (crossed.length) spansIrregular.push({ name: g.name, jumps: crossed });
    }
    return {
      extent: ext,
      spansIrregular,
      id: ci,
      indices: comp,
      size: comp.length,
      core,
      coreSize: core.length,
      representative: rep,
      record: records[rep],
      robust: robust[rep],
      stability: stability[rep],
      medianScore: median(compScores),
      q10Score: quantile(compScores, 0.1),
      worstScore: worstMember,
      // Dispersión interna: una meseta coherente tiene un recorrido intercuartilico corto.
      coherence: quantile(compScores, 0.75) - quantile(compScores, 0.25),
      medianIs: median(comp.map((i) => records[i].qualityIs).filter(Number.isFinite)),
      medianOos: median(comp.map((i) => records[i].qualityOos).filter(Number.isFinite)),
      medianRetention: median(comp.map((i) => records[i].retention).filter(Number.isFinite)),
      // Riesgo accionable: la configuración RECOMENDADA esta pegada a un extremo del
      // rango probado. Listar los límites de toda la región no informa cuando la
      // región es amplia, porque entonces los toca todos.
      boundary: boundaryParams([rep], coords, levels, paramNames, paramTypes),
      boundaryRegion: boundaryParams(basis, coords, levels, paramNames, paramTypes),
      refinement: refinementRange(rep, coords, levels, paramNames, sensitivity, paramTypes),
      // Coherencia interna: si se apoya justo en el valor que gana en el in-sample de un
      // parámetro invertido, su buen resultado forward va a contracorriente de su propio
      // nivel y puede ser suerte.
      invertedRisk: inversions.filter((inv) => records[rep].params[inv.index] === inv.bestIs),
      // Ordena por el suelo de la región, no por su cima.
      rank: 0,
    };
  });
  /*
   * Orden de las mesetas. Manda el SUELO de la región, nunca su cima, pero el suelo
   * solo no basta: dos mesetas con el mismo suelo no merecen la misma confianza si una
   * se ha medido con 8 configuraciones vecinas y la otra con 22.
   *
   *   suelo x tamaño x evidencia x penalizacion por riesgo conocido
   *
   * - evidencia: crece con el soporte observado y se satura, porque pasar de 8 a 22
   *   vecinas informa mucho y de 60 a 80 ya casi nada.
   * - penalizacion: si el representante se apoya en el valor que gana en el in-sample
   *   de un parámetro invertido, la app ya lo marca como riesgo. Sería incoherente
   *   avisarlo y seguir poniendolo primero. Penaliza, no descalifica: es un riesgo
   *   identificado, no una prueba de que la configuración sea mala.
   */
  const evidenceFactor = (support) => {
    if (!Number.isFinite(support) || support <= 0) return 0.6;
    const saturated = Math.min(1, Math.log1p(support) / Math.log1p(3 * opts.targetSupport));
    return 0.6 + 0.4 * saturated;
  };
  const INVERTED_RISK_PENALTY = 0.75;
  const IRREGULAR_PENALTY = 0.85;
  /*
   * El tamano entra por `effectiveSize`, no por el numero de miembros. Son iguales en una
   * rejilla completa y distintos en una optimizacion genetica, que es donde importa: el GA
   * concentra las pruebas donde el in-sample iba bien, asi que esas zonas reunen mas
   * configuraciones y formarian componentes mas grandes sin que el terreno sea mas ancho.
   * Topar la evidencia por el volumen que la region abarca de verdad corta esa circularidad.
   */
  const rankScore = (p) => Math.max(0, p.q10Score)
    * Math.log1p(p.extent.effectiveSize)
    * evidenceFactor(p.stability.support)
    * (p.invertedRisk.length ? INVERTED_RISK_PENALTY : 1)
    * (p.spansIrregular.length ? IRREGULAR_PENALTY : 1);
  plateaus.forEach((p) => { p.rankScore = rankScore(p); });
  plateaus.sort((a, b) => b.rankScore - a.rankScore);
  plateaus.forEach((p, i) => { p.rank = i + 1; });

  progress(onProgress, 85, 'Aislando picos');
  // Se ordena por el criterio del USUARIO (lo que MT5 le pone arriba del todo), no por
  // la calidad interna. La pregunta que hay que responder es exactamente esa: "¿por que
  // no me recomiendas la que aparece primera en mi tabla?".
  const rankingKey = (r) => (hasForward && Number.isFinite(r.criterionOos) ? r.criterionOos
    : Number.isFinite(r.criterionIs) ? r.criterionIs : r.score);
  const byCriterion = records
    .map((r, i) => ({ record: r, index: i, score: scores[i], st: stability[i], robust: robust[i], key: rankingKey(r) }))
    .filter((p) => Number.isFinite(p.key))
    .sort((a, b) => b.key - a.key);
  byCriterion.forEach((p, i) => { p.criterionRank = i + 1; });
  const peaks = byCriterion
    .slice(0, 80)
    .filter((p) => inPlateau[p.index] < 0)
    .map((p) => {
      const reasons = [];
      if (p.st.support < opts.minSupport) reasons.push(`solo ${p.st.support} vecinos observados`);
      if (Number.isFinite(p.st.peakZ) && p.st.peakZ > 2) reasons.push(`sobresale ${p.st.peakZ.toFixed(1)}σ sobre su vecindad`);
      if (Number.isFinite(p.st.cliff) && p.st.cliff > 1.5) reasons.push('acantilado a un paso');
      if (!p.record.passes) reasons.push(`no pasa las puertas minimas (${[...p.record.failsIs, ...p.record.failsOos].join(', ')})`);
      if (Number.isFinite(p.st.fracPass) && p.st.fracPass < 0.9) reasons.push(`solo el ${(100 * p.st.fracPass).toFixed(0)}% de sus vecinos pasa las puertas`);
      if (Number.isFinite(p.st.q25) && p.st.q25 < opts.plateauFloorQuality) reasons.push(`el cuartil bajo de su entorno se queda en ${p.st.q25.toFixed(2)}`);
      if (!reasons.length) reasons.push('no alcanza el umbral de robustez con soporte suficiente');
      return { ...p, reasons };
    })
    .slice(0, 12);

  progress(onProgress, 90, 'Contrastes estadisticos');
  const isCriterion = records.map((r) => (Number.isFinite(r.criterionIs) ? r.criterionIs : r.qualityIs));
  const oosCriterion = records.map((r) => (Number.isFinite(r.criterionOos) ? r.criterionOos : r.qualityOos));
  const rho = hasForward ? spearman(isCriterion, oosCriterion) : NaN;
  const rhoQuality = hasForward ? spearman(records.map((r) => r.qualityIs), records.map((r) => r.qualityOos)) : NaN;
  // Contraste de seleccion en los DOS sentidos (ver `selectionFragility`): no basta con
  // entrenar en IS y validar en OOS, porque si el forward fue un tramo facil eso sale bien
  // por el motivo equivocado.
  const fragilityResult = hasForward ? selectionFragility(isCriterion, oosCriterion) : { fragility: NaN, usable: false };
  const degradation = hasForward ? degradationByDecile(isCriterion, oosCriterion) : [];

  // Número efectivo de pruebas: configuraciones vecinas no son ensayos independientes.
  // Se cuenta cuántas celdas distintas del espacio grueso se han explorado de verdad.
  const cell = new Set();
  const grain = nb.radius + 1;
  for (let i = 0; i < coords.length; i++) {
    let key = '';
    for (const d of activeDims.length ? activeDims : levels.map((_, j) => j)) key += Math.floor(coords[i][d] / grain) + ',';
    cell.add(key);
  }
  const effectiveTrials = Math.max(2, cell.size);

  // Contraste de selección sobre el Sharpe (Deflated Sharpe Ratio).
  // La hipotesis nula es "ninguna configuración tiene ventaja": entonces cada Sharpe
  // observado es ruido de estimacion alrededor de cero, con error típico dependiente
  // del número de operaciones. El mejor de N pruebas bajo esa nula ya sale positivo
  // por si solo; ese es el umbral que hay que batir.
  const period = hasForward ? 'oos' : 'is';
  const sharpePairs = records
    .map((r) => ({ sr: r[period].sharpe, n: r[period].trades }))
    .filter((x) => Number.isFinite(x.sr) && Number.isFinite(x.n) && x.n > 30);
  let sharpeTest = null;
  if (sharpePairs.length >= 30) {
    const errors = sharpePairs.map((x) => sharpeStandardError(x.sr, x.n)).filter(Number.isFinite);
    const typicalSe = median(errors);
    const best = sharpePairs.reduce((a, b) => (b.sr > a.sr ? b : a), sharpePairs[0]);
    const bestSe = sharpeStandardError(best.sr, best.n);
    const chanceMax = expectedMaximum(0, typicalSe, records.length);
    const chanceMaxEffective = expectedMaximum(0, typicalSe, effectiveTrials);
    /*
     * BANDA, no cifra unica. El Sharpe deflactado publicado (Bailey y Lopez de Prado) usa
     * como dispersion de la nula la desviacion tipica de los Sharpe ENTRE ensayos; aqui se
     * usa el error tipico de ESTIMACION de Lo (2002).
     *
     * El motivo de apartarse: en aquel planteamiento los N ensayos son estrategias
     * distintas y su dispersion mide la amplitud de la busqueda. Aqui los N son una malla
     * densa de UNA estrategia, fuertemente correlacionados, y su dispersion la produce
     * sobre todo la forma de la superficie de parametros, no el ruido. Tomarla como nula
     * sube el liston cuanto MAS senal real hay, que es justo al reves de lo que debe pasar.
     *
     * Es una adaptacion defendible, pero no es el contraste publicado, asi que se dan los
     * dos umbrales y se deja ver la distancia entre ellos en lugar de elegir por el usuario.
     */
    const crossSd = stdev(sharpePairs.map((x) => x.sr));
    const chanceMaxConservative = expectedMaximum(0, crossSd, effectiveTrials);
    sharpeTest = {
      chanceMaxConservative,
      conservativeSigma: crossSd,
      observedMax: best.sr,
      observedTrades: best.n,
      mean: mean(sharpePairs.map((x) => x.sr)),
      crossSectionalSd: stdev(sharpePairs.map((x) => x.sr)),
      typicalSe,
      bestSe,
      trials: records.length,
      effectiveTrials,
      chanceMax,
      chanceMaxEffective,
      // Probabilidad de que el mejor Sharpe no sea un artefacto de haber probado mucho.
      deflated: Number.isFinite(bestSe) && bestSe > 0 ? normCdf((best.sr - chanceMax) / bestSe) : NaN,
    };
  }

  // ¿Fue el forward un periodo más benigno que el in-sample? Si lo fue, todo lo que
  // se mide ahi viene inflado y la validación es menos exigente de lo que parece.
  const passIsOnly = records.filter((r) => !r.failsIs.length).length;
  const passOosOnly = hasForward ? records.filter((r) => !r.failsOos.length).length : 0;
  const periodComparison = hasForward ? {
    medianQualityIs: median(records.map((r) => r.qualityIs)),
    medianQualityOos: median(records.map((r) => r.qualityOos)),
    passIsPct: passIsOnly / records.length,
    passOosPct: passOosOnly / records.length,
  } : null;

  /*
   * ¿Tenia este conjunto la MINIMA masa necesaria para que pudiera existir una meseta?
   *
   * Una meseta exige `plateauMinSize` configuraciones conexas, y cada una necesita que
   * casi todas sus vecinas también superen los minimos. Eso obliga a que la región
   * viable tenga interior. Si el número de configuraciones viables ni siquiera da para
   * eso, la ausencia de meseta no dice nada del EA: dice que no hay datos suficientes
   * para pronunciarse. Confundir "no hay meseta" con "no se puede saber" sería el mismo
   * error que comete la gente al confundir "no rechazo" con "acepto".
   */
  const viableNeededForPlateau = Math.ceil(
    opts.plateauMinSize * (1 + Math.max(opts.minSupport, nb.medianSupport || 0) * opts.plateauMinFracPass),
  );
  const underpowered = !plateaus.length && gatePassCount > 0 && gatePassCount < viableNeededForPlateau;

  /*
   * ESTABILIDAD DEL VEREDICTO FRENTE A SUS PROPIAS CONSTANTES.
   *
   * Los umbrales de meseta (0.55 de suelo, 60 de robustez, 0.9 de fraccion que pasa...)
   * son juicios calibrados, no cantidades derivadas. Eso es inevitable, pero deja una
   * pregunta sin responder que el usuario tiene todo el derecho a hacer: ¿la recomendacion
   * es una propiedad de mis datos o un artefacto de vuestro ajuste?
   *
   * Aqui se responde midiendo. Se vuelven a buscar mesetas con los umbrales movidos al
   * azar dentro de un +-20 %, y se cuenta cuantas veces sigue ganando la MISMA region. Si
   * una recomendacion solo sobrevive con los numeros exactos que elegimos, no es una
   * recomendacion: es una coincidencia, y el usuario debe verlo.
   *
   * Solo se perturban las constantes de decision, que no obligan a reconstruir la
   * vecindad; por eso el calculo es barato y cabe en el analisis normal.
   */
  function assessStability(baseline) {
    if (!baseline) return null;
    const baseMembers = new Set(baseline.indices);

    // Dado un conjunto de umbrales y de pases, ¿que region gana? Reproduce el mismo
    // criterio de orden que el analisis principal.
    const winner = (drawOpts, pss, stab, rb) => {
      const comps = findPlateaus(neighbors, rb, pss, stab, drawOpts);
      if (!comps.length) return null;
      let best = null;
      let bestKey = -Infinity;
      for (const comp of comps) {
        const cs = comp.map((i) => scores[i]).filter(Number.isFinite);
        const ex = componentExtent(comp, coords, activeDims.length ? activeDims : blocking, levels);
        const core = coreMembers(comp, rb, stab, drawOpts);
        const repIdx = chooseRepresentative(core.length >= 3 ? core : comp, neighbors, scores, rb);
        const key = Math.max(0, quantile(cs, 0.1)) * Math.log1p(ex.effectiveSize)
          * evidenceFactor(stab[repIdx].support);
        if (key > bestKey) { bestKey = key; best = repIdx; }
      }
      return best;
    };

    const tally = (winners) => {
      const n = winners.length;
      const withPlateau = winners.filter((w) => w !== null).length;
      const sameRegion = winners.filter((w) => w !== null && baseMembers.has(w)).length;
      const sameRep = winners.filter((w) => w === baseline.representative).length;
      return {
        draws: n,
        withPlateau,
        sameRegion,
        sameRepresentative: sameRep,
        plateauRate: n ? withPlateau / n : NaN,
        regionRate: n ? sameRegion / n : NaN,
        representativeRate: n ? sameRep / n : NaN,
      };
    };

    // ---------------------------------------------------- A) NUESTROS umbrales internos
    const KEYS = ['plateauFloorQuality', 'plateauMinRobust', 'plateauMinFracPass',
      'coreFloorQuality', 'coreMinRobust', 'minSupport', 'plateauMinSize'];
    const rng = makeRng(20260920);
    const internalDraws = [];
    // Primero los extremos de cada constante por separado, que es donde mas se nota.
    for (const key of KEYS) {
      for (const factor of [0.8, 1.2]) internalDraws.push({ ...opts, [key]: opts[key] * factor });
    }
    // Y despues combinaciones simultaneas, porque las constantes interactuan.
    for (let d = 0; d < 36; d++) {
      const draw = { ...opts };
      for (const key of KEYS) draw[key] = opts[key] * (0.8 + 0.4 * rng());
      internalDraws.push(draw);
    }
    const internal = tally(internalDraws.map((draw) => winner(draw, passes, stability, robust)));

    /*
     * ------------------------------------------------------- B) TUS minimos
     *
     * Esta es la parte que faltaba, y era el agujero grande: el panel anterior movia
     * nuestros umbrales internos y daba un numero tranquilizador sobre la palanca
     * equivocada. Medido sobre un EA real, mover el factor de beneficio entre 1,15 y 1,25
     * devolvia TRES configuraciones recomendadas distintas, y eso no lo veia nadie.
     *
     * Cambiar una puerta cambia quien pasa, asi que hay que rehacer estabilidad local y
     * robustez; es mas caro que perturbar los umbrales internos y por eso se limita por
     * presupuesto y se hacen menos tiradas.
     *
     * El factor de beneficio se perturba sobre su EXCESO SOBRE 1, no sobre su valor: un
     * +-20 % de 1,20 daria de 0,96 a 1,44, y un PF de 0,96 no es una puerta mas laxa,
     * es ninguna puerta. Lo que significa algo es el margen que exiges por encima del
     * punto de equilibrio.
     */
    // Presupuesto deliberadamente corto: esto es un DIAGNOSTICO anadido, y nunca debe
    // pesar mas que el analisis al que acompana. Con conjuntos grandes se hacen menos
    // tiradas, y si no llegan a seis se omite y se dice.
    const gateWork = records.length * ((nb.medianSupport || 4) + 3);
    const maxGateDraws = Math.max(0, Math.min(24, Math.floor(4e6 / Math.max(1, gateWork))));
    let gates = null;
    if (maxGateDraws >= 6) {
      const g0 = policy.gates;
      const gateDraws = [];
      const mk = (fp, fd, ft) => ({
        minProfitFactor: 1 + (g0.minProfitFactor - 1) * fp,
        maxDrawdownPct: g0.maxDrawdownPct * fd,
        tradeFactor: ft,
      });
      for (const f of [0.8, 1.2]) {
        gateDraws.push(mk(f, 1, 1));
        gateDraws.push(mk(1, f, 1));
        gateDraws.push(mk(1, 1, f));
      }
      const rng2 = makeRng(20260921);
      while (gateDraws.length < maxGateDraws) {
        gateDraws.push(mk(0.8 + 0.4 * rng2(), 0.8 + 0.4 * rng2(), 0.8 + 0.4 * rng2()));
      }
      const winners = gateDraws.slice(0, maxGateDraws).map((g) => {
        const gp = { ...policy, gates: { ...g0, minProfitFactor: g.minProfitFactor, maxDrawdownPct: g.maxDrawdownPct } };
        const p2 = new Uint8Array(records.length);
        records.forEach((r, i) => {
          const fi = gateFailures(r.is, gp, minTradesIs * g.tradeFactor);
          const fo = hasForward ? gateFailures(r.oos, gp, minTradesOos * g.tradeFactor) : [];
          p2[i] = !fi.length && (!hasForward || !fo.length) ? 1 : 0;
        });
        // La escala de referencia se mantiene FIJA a proposito: se quiere aislar el efecto
        // de la puerta, no confundirlo con una vara de medir que se mueve a la vez.
        const st2 = localStability(neighbors, scores, p2, globalScale);
        const rb2 = robustnessScores(scores, p2, st2, opts, nb.medianSupport);
        return winner(opts, p2, st2, rb2);
      });
      gates = { ...tally(winners), perturbation: 0.2 };
    }

    return {
      // Se conservan los campos planos del panel original para no romper nada que ya
      // los lea; describen la auditoria de NUESTROS umbrales.
      ...internal,
      perturbation: 0.2,
      keys: KEYS,
      internal,
      gates,
      gatesSkipped: gates === null,
    };
  }

  const TIE_TOLERANCE = 0.05;
  // Si la segunda y la tercera puntuan casi como la primera, presentarlas como
  // 1.a, 2.a y 3.a sugiere una jerarquia que los datos no sostienen.
  const tiedPlateaus = plateaus.length > 1 && plateaus[0].rankScore > 0
    ? plateaus.filter((p) => p.rankScore >= plateaus[0].rankScore * (1 - TIE_TOLERANCE))
    : [];
  const tied = tiedPlateaus.length > 1 ? tiedPlateaus : [];
  tied.forEach((p) => { p.tied = true; });

  const bestPlateau = plateaus[0] || null;
  progress(onProgress, 94, 'Probando la estabilidad del veredicto');
  const stabilityCheck = assessStability(bestPlateau);

  progress(onProgress, 96, 'Emitiendo veredicto');
  const verdict = buildVerdict({
    gatePassCount,
    total: records.length,
    plateaus,
    fragility: fragilityResult.fragility,
    fragilityMargin: fragilityResult.margin,
    fragilityFolds: fragilityResult.folds,
    fragilityAsymmetry: fragilityResult.asymmetry,
    fragilityWorstDirection: fragilityResult.worstDirection,
    sharpeTest,
    spearman: rho,
    coverage,
    medianSupport: nb.medianSupport,
    periodRatio,
    integrity,
    sampling,
    inversions,
    periodComparison,
    hasForward,
    underpowered,
    viableNeededForPlateau,
    stabilityCheck,
    degreesOfFreedom,
    gateInfluence,
    irregularGrids,
    rescuedDims,
    offsetsComplete: nb.offsetsComplete,
    spansIrregular: bestPlateau ? bestPlateau.spansIrregular : [],
    tiedCount: tied.length,
    tiedRanks: tied.map((p) => p.rank),
    boundaryWorst: bestPlateau ? bestPlateau.boundary : [],
    invertedRisk: bestPlateau ? bestPlateau.invertedRisk : [],
    alternativePlateau: bestPlateau && bestPlateau.invertedRisk.length
      ? plateaus.find((p) => p.rank !== bestPlateau.rank && !p.invertedRisk.length) || null
      : null,
    bestPlateau,
  });

  progress(onProgress, 100, 'Listo');
  return {
    meta: {
      hasForward,
      generatedAt: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      total: records.length,
      droppedParams,
      paramNames,
      paramTypes,
      optimisedDims,
      levelCounts: levels.map((l) => l.length),
      cartesian,
      coverage,
      sampling,
      radius: nb.radius,
      activeDims,
      activeNames: activeDims.map((j) => paramNames[j]),
      blockDims: blocking,
      blockNames: blocking.map((j) => paramNames[j]),
      releasedBlockNames: releasedBlocks.map((j) => paramNames[j]),
      flatDims,
      medianSupport: nb.medianSupport,
      neighborhoodTruncated: nb.truncated,
      // Si el conjunto completo de desplazamientos no cabio en el presupuesto, la vecindad
      // se midio con una cruz en vez de con una bola y hay que decirlo.
      offsetsComplete: nb.offsetsComplete,
      conditionalUsable,
      conditionalDims: conditional.length,
      rescuedDims,
      irregularGrids,
      supportTargetUsed: nb.effectiveTarget,
      localityCapped: nb.localityCapped,
      underpowered,
      viableNeededForPlateau,
      degreesOfFreedom,
      gateInfluence,
      scale: globalScale,
      periodRatio,
      gatePassCount,
      gatePassPct: records.length ? gatePassCount / records.length : 0,
      minTradesIs,
      minTradesOos,
      criterionIsName: isRoles.result ? isRoles.result.name : null,
      criterionOosName: oosRoles.forwardResult ? oosRoles.forwardResult.name : null,
      availableMetrics: METRIC_KEYS.filter((k) => isRoles[k]),
      payoffAnchor,
      sheets: { is: isTable.sheet, oos: oosTable ? oosTable.sheet : null },
      formats: { is: isTable.format, oos: oosTable ? oosTable.format : null },
      policy,
    },
    integrity,
    records,
    scores,
    robust: Array.from(robust),
    stability,
    neighbors,
    coords: coords.map((z) => Array.from(z)),
    levels,
    sensitivity,
    inversions,
    periodComparison,
    plateaus,
    peaks,
    inPlateau: Array.from(inPlateau),
    stats: {
      spearmanCriterion: rho,
      spearmanQuality: rhoQuality,
      // Ya no se llama PBO: no lo es. Ver `selectionFragility` en stats.js.
      fragility: fragilityResult.fragility,
      fragilityMargin: fragilityResult.margin,
      fragilityLo: fragilityResult.lo,
      fragilityHi: fragilityResult.hi,
      fragilityFolds: fragilityResult.folds,
      fragilityAsymmetry: fragilityResult.asymmetry,
      fragilityWorstDirection: fragilityResult.worstDirection,
      fragilityUsable: fragilityResult.usable,
      stabilityCheck,
      degradation,
      sharpeTest,
      effectiveTrials,
      medianQualityIs: median(records.map((r) => r.qualityIs)),
      medianQualityOos: median(records.map((r) => r.qualityOos)),
      medianRetention: median(records.map((r) => r.retention).filter(Number.isFinite)),
    },
    verdict,
  };
}
