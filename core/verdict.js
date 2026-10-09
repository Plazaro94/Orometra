// Motor de diagnostico metodologico.
//
// REGLA CENTRAL, y es la que define el producto: esto NO decide por el usuario.
//
// Antes se emitia un GO / NO-GO, y era una afirmacion que nunca pudimos sostener: la
// aplicacion mide lo que contienen unos datos, no si una estrategia va a funcionar.
// Decir "no recomendado" era opinar sobre algo que no se habia medido. Ya reventó una
// vez: con un EA real se emitio NO-GO mientras 2.925 de 2.925 configuraciones eran
// rentables fuera de muestra.
//
// Ahora se califica LA FUERZA DE LA EVIDENCIA, que si es algo que se puede medir:
//
//     "no recomendado"                 -> juicio sobre una accion del usuario
//     "no hay region conexa en estos   -> hecho sobre sus datos
//      datos"
//
// Solo se emite la segunda clase de afirmacion. Los hallazgos concretos -acantilados,
// bordes de rango, inversiones, puertas inertes- se conservan intactos: son lo valioso.

import { L, localeTag, pctSign } from '../js/i18n.js';

/** Numero en el formato del idioma activo (1,20 en ES, 1.20 en EN). */
const fmt = (v, d = 2) => (Number.isFinite(v)
  ? new Intl.NumberFormat(localeTag(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v)
  : '—');
/** Cifra observada de un minimo, con las unidades y decimales de ese minimo. */
/** Singular o plural según la cifra («1 configuración», «2 configuraciones»). */
const pl = (n, uno, varios) => (Number(n) === 1 ? uno : varios);
const gateValue = (name, v) => (name === 'drawdown' ? `${fmt(v, 1)}${pctSign()}` : name === 'trades' ? fmt(v, 0) : fmt(v, 2));

export const LEVELS = {
  STRONG: 'strong',            // meseta validada en el forward, sin avisos sobre ella
  GOOD: 'good',                // validada, con un aviso sobre ella
  MODERATE: 'moderate',        // hay region, con avisos que leer
  WEAK: 'weak',                // hay algo, pero apenas lo sostiene nada
  INSUFFICIENT: 'insufficient', // no hay masa para pronunciarse en ninguna direccion
};

// 'critical' y no 'block': ya no se bloquea nada, se senala una limitacion grave de la
// evidencia. El usuario decide que hacer con ella.
const SEV = { CRITICAL: 'critical', WARN: 'warn', INFO: 'info', OK: 'ok' };

export function buildVerdict(ctx) {
  const findings = [];
  // `category` dice en que panel de la interfaz se explica el hallazgo con su tabla
  // ('stats', 'coverage'…); null = se queda suelto en el veredicto. Antes la interfaz lo
  // adivinaba buscando palabras en el texto, y cambiar una frase lo movia en silencio.
  // Una categoria olvidada NUNCA debe parar un analisis: el hallazgo se queda suelto en
  // el veredicto. Quien la vigila es tests/finding-categories.test.js (todas las llamadas).
  const add = (severity, title, detail, category = null) => {
    findings.push({ severity, title, detail, category });
  };
  // Avisos sobre el ORDEN de la tabla de MT5 o sobre cómo MT5 arma el forward, no sobre
  // la meseta propuesta: se leen igual, pero no impiden «buena» ni «sólida». El de la
  // preselección del forward sale en todo export real de MT5 (solo reexporta las mejores),
  // y mientras bloqueaba, con archivos reales nunca se pasaba de «moderada».
  const tableOnly = () => { findings[findings.length - 1].scope = 'table'; };

  const { gatePassCount, total, plateaus, fragility, fragilityQuality, fragilityFolds, fragilityAsymmetry,
    fragilityWorstDirection, sharpeTest, spearman, coverage, searchCoverage, medianSupport,
    periodRatio, integrity, sampling, boundaryWorst, bestPlateau, inversions, periodComparison,
    hasForward, invertedRisk, alternativePlateau, underpowered, viableNeededForPlateau,
    tiedCount, tiedRanks, stabilityCheck, irregularGrids, rescuedDims, offsetsComplete,
    spansIrregular, degreesOfFreedom, gateInfluence, selectionMode } = ctx;

  // Los porcentajes que exigen los DOS periodos se miden sobre las configuraciones que
  // tienen forward: MT5 solo reexporta las mejores, así que sobre el total nunca pasarían
  // de ~25 % aunque todas las del forward cumplieran.
  const fwdBase = hasForward && Number.isFinite(ctx.forwardCount) && ctx.forwardCount > 0 ? ctx.forwardCount : total;
  // ---- Bloqueantes
  const searchPassCount = Number.isFinite(ctx.searchPassCount) ? ctx.searchPassCount : gatePassCount;
  if (!gatePassCount && hasForward && searchPassCount > 0) {
    add(SEV.CRITICAL, L('Ninguna configuración cumple tus mínimos en el forward', 'No configuration meets your minimums in the forward'),
      L(`${searchPassCount.toLocaleString(localeTag())} ${pl(searchPassCount, 'configuración los cumple', 'configuraciones los cumplen')} en el periodo optimizado, pero ninguna en el forward. Con estos mínimos, lo que se encuentra en el periodo optimizado no se sostiene fuera de él.`,
        `${searchPassCount.toLocaleString(localeTag())} ${pl(searchPassCount, 'configuration meets', 'configurations meet')} them on the optimized period, but none in the forward. With these minimums, what is found on the optimized period does not hold outside it.`), null);
  } else if (!gatePassCount) {
    add(SEV.CRITICAL, L('Ninguna configuración pasa los mínimos', 'No configuration passes the minimum gates'),
      hasForward
        ? L(`De ${total.toLocaleString(localeTag())} configuraciones, ninguna cumple tus mínimos en el periodo optimizado y en el forward. Con estos mínimos no hay nada que seleccionar.`,
          `Of ${total.toLocaleString(localeTag())} configurations, none meet your minimums in both the optimized period and the forward. With these minimums there is nothing to select.`)
        : L(`De ${total.toLocaleString(localeTag())} configuraciones, ninguna cumple tus mínimos. Con estos mínimos no hay nada que seleccionar.`,
          `Of ${total.toLocaleString(localeTag())} configurations, none meet your minimums. With these minimums there is nothing to select.`), null);
  } else if (gatePassCount / fwdBase < 0.02) {
    add(SEV.CRITICAL, L('Solo un resquicio del espacio sobrevive', 'Only a sliver of the space survives'),
      L(`Apenas ${gatePassCount} de ${fwdBase.toLocaleString(localeTag())} configuraciones${hasForward ? ' con forward' : ''} (${fmt((100 * gatePassCount / fwdBase), 1)}\u00A0%) pasan los mínimos. Una estrategia que solo funciona en un punto concreto del espacio de parámetros casi siempre es un artefacto del optimizador.`,
        `Barely ${gatePassCount} of ${fwdBase.toLocaleString(localeTag())} configurations${hasForward ? ' with forward' : ''} (${fmt((100 * gatePassCount / fwdBase), 1)}%) pass the gates. A strategy that only works at one specific point in parameter space is almost always an optimizer artifact.`), null);
  }

  if (Array.isArray(ctx.missingMetrics) && ctx.missingMetrics.length) {
    const NAME_ES = { profit: 'beneficio', profitFactor: 'factor de beneficio', drawdown: 'drawdown', trades: 'número de operaciones' };
    const NAME_EN = { profit: 'profit', profitFactor: 'profit factor', drawdown: 'drawdown', trades: 'number of trades' };
    const listEs = ctx.missingMetrics.map((k) => NAME_ES[k]).join(', ');
    const listEn = ctx.missingMetrics.map((k) => NAME_EN[k]).join(', ');
    const others = (ctx.unrecognizedColumns || []).slice(0, 12).join(', ');
    add(SEV.CRITICAL, L('No se han reconocido columnas clave del archivo', 'Key columns of the file were not recognized'),
      L(`No se encuentran las columnas de: ${listEs}. Sin ellas, esos mínimos no se pueden aplicar (todas las configuraciones los cumplirían) y este veredicto se apoya en menos de lo que parece. Orometra lee cabeceras de MT5 en inglés y en español${others ? `; las columnas que no ha reconocido son: ${others}` : ''}. Si tu terminal exporta en otro idioma, renombra esas cabeceras a Profit, Profit Factor, Equity DD % y Trades, o cambia el idioma del terminal y vuelve a exportar.`,
        `The columns for: ${listEn} were not found. Without them, those minimums cannot be applied (every configuration would meet them) and this verdict rests on less than it seems. Orometra reads MT5 headers in English and Spanish${others ? `; the columns it did not recognize are: ${others}` : ''}. If your terminal exports in another language, rename those headers to Profit, Profit Factor, Equity DD % and Trades, or switch the terminal language and export again.`), null);
  }

  /*
   * Densidad de evidencia (ops / parámetros ajustados). No son "grados de libertad"
   * formales: condicionan la lectura de todo lo demas.
   */
  if (degreesOfFreedom && Number.isFinite(degreesOfFreedom.perParam) && degreesOfFreedom.params > 0) {
    const d = degreesOfFreedom;
    const per = d.perParam;
    const periodoEs = d.basedOn === 'forward' ? 'el forward' : 'el periodo optimizado';
    const periodoEn = d.basedOn === 'forward' ? 'the forward' : 'the optimized period';
    const tradesN = Math.round(d.basedOn === 'forward' ? d.tradesOos : d.tradesIs).toLocaleString(localeTag());
    const extraEs = Number.isFinite(d.trialsPerTrade) && d.trialsPerTrade > 1
      ? ` Además has probado ${fmt(d.trialsPerTrade, 1)} configuraciones por cada operación disponible para distinguirlas: hay más alternativas que datos con los que separarlas.`
      : '';
    const extraEn = Number.isFinite(d.trialsPerTrade) && d.trialsPerTrade > 1
      ? ` You have also tried ${fmt(d.trialsPerTrade, 1)} configurations for each trade available to tell them apart: there are more alternatives than data to separate them.`
      : '';
    if (per < 15) {
      add(SEV.CRITICAL, L(`Poca evidencia: ~${fmt(per, 0)} operaciones por parámetro`, `Thin evidence: ~${fmt(per, 0)} trades per parameter`),
        L(`Has optimizado ${d.params} ${pl(d.params, 'parámetro', 'parámetros')} y en ${periodoEs} hay ${tradesN} operaciones (mediana de las configuraciones probadas): ~${fmt(per, 0)} por parámetro. Con esa proporción, la superficie que medimos es mayoritariamente ruido. No es un defecto de tu EA: faltan datos para tantos parámetros a la vez. Reduce parámetros o alarga el periodo.${extraEs}`,
          `You optimized ${d.params} ${pl(d.params, 'parameter', 'parameters')} and in ${periodoEn} there are ${tradesN} trades (median of the tested configurations): ~${fmt(per, 0)} per parameter. At that ratio, the surface we measure is mostly noise. Not an EA flaw: there is not enough data for so many parameters at once. Reduce parameters or lengthen the period.${extraEn}`), null);
    } else if (per < 50) {
      add(SEV.WARN, L(`Evidencia limitada: ~${fmt(per, 0)} operaciones por parámetro`, `Limited evidence: ~${fmt(per, 0)} trades per parameter`),
        L(`${d.params} ${pl(d.params, 'parámetro optimizado', 'parámetros optimizados')} frente a ${tradesN} operaciones en ${periodoEs} (mediana de las configuraciones probadas). Todo lo que sigue debe leerse como provisional.${extraEs}`,
          `${d.params} ${pl(d.params, 'optimized parameter', 'optimized parameters')} versus ${tradesN} trades in ${periodoEn} (median of the tested configurations). Everything that follows should be read as provisional.${extraEn}`), null);
    } else if (per >= 100) {
      add(SEV.OK, L(`Operaciones de sobra: ~${fmt(per, 0)} por parámetro`, `Plenty of trades: ~${fmt(per, 0)} per parameter`),
        L(`${d.params} ${pl(d.params, 'parámetro optimizado', 'parámetros optimizados')} frente a ${tradesN} operaciones en ${periodoEs} (mediana de las configuraciones probadas). Con tantas operaciones por parámetro, el tamaño de la muestra no es el punto débil.`,
          `${d.params} ${pl(d.params, 'optimized parameter', 'optimized parameters')} versus ${tradesN} trades in ${periodoEn} (median of the tested configurations). With this many trades per parameter, sample size is not the weak point.`), null);
    }
  }

  if (!plateaus.length && underpowered) {
    // No es lo mismo "no hay meseta" que "no hay datos para saberlo". La cifra es la del
    // conjunto donde se buscan las mesetas (`searchPassCount`), la misma que decide
    // `underpowered` y que da el resumen: antes aquí salía la de los dos periodos, otra.
    add(SEV.CRITICAL, L('El conjunto es demasiado pequeño para pronunciarse', 'The set is too small to draw any conclusion'),
      L(`Solo ${searchPassCount} ${pl(searchPassCount, 'configuración supera', 'configuraciones superan')} los mínimos${hasForward && selectionMode === 'isThenOos' ? ' en el periodo optimizado' : ''}; una meseta necesitaría al menos ${viableNeededForPlateau}, con vecinas que también cumplan. Esto no dice que tu EA sea malo: dice que estos datos no permiten afirmar nada. Amplía el rango de los parámetros, añade valores intermedios o relaja los mínimos, y vuelve a optimizar.`,
        `Only ${searchPassCount} ${pl(searchPassCount, 'configuration clears', 'configurations clear')} the minimums${hasForward && selectionMode === 'isThenOos' ? ' on the optimized period' : ''}; a plateau would need at least ${viableNeededForPlateau}, with neighbors that also pass. This does not say your EA is bad: it says these data cannot support any claim. Widen the parameter ranges, add intermediate values or relax the minimums, and optimize again.`), null);
  } else if (!plateaus.length) {
    add(SEV.CRITICAL, L('No se ha encontrado ninguna meseta', 'No plateau was found'),
      L('No hay ningún grupo de configuraciones vecinas que superen el umbral de robustez con soporte suficiente. Con datos suficientes para detectarlo, lo que hay son puntos sueltos, y un punto suelto no es un sistema: es una coincidencia.',
        'There is no group of neighboring configurations that clear the robustness threshold with enough support. With enough data to detect one, what remains are isolated points, and an isolated point is not a system: it is a coincidence.'), null);
  }

  /*
   * "Hay refugio": existe una parte amplia del espacio que supera los mínimos Y forma
   * regiones estables. Es lo que distingue "el ranking no sirve, pero puedes elegir por
   * región" de "el ranking no sirve y ademas no hay donde refugiarse".
   *
   * El corte esta en una de cada cuatro configuraciones probadas. Es un juicio, pero uno
   * razonado: si un 25 % supera mínimos ABSOLUTOS en los dos periodos y ademas se agrupa
   * en mesetas, el resultado no depende de haber acertado un valor concreto. Antes era un
   * 60 % fijo, y tenia un efecto perverso: al endurecer los mínimos bajaba el porcentaje
   * por construccion, así que exigir más convertia avisos en bloqueos por partida doble.
   */
  const VIABLE_REFUGE = 0.25;
  const viableShare = fwdBase > 0 ? gatePassCount / fwdBase : 0;
  const hasRegion = plateaus.length > 0;
  const hasRefuge = viableShare >= VIABLE_REFUGE && hasRegion;
  if (Number.isFinite(fragility)) {
    if (fragility >= 0.5 && hasRefuge) {
      add(SEV.WARN, L(`Tu ranking MT5 (Result) no se sostiene: falla el ${fmt((100 * fragility), 0)}\u00A0%`, `Your MT5 ranking (Result) does not hold: it fails ${fmt((100 * fragility), 0)}%`),
        L(`Al quedarte con la mejor fila según la columna Result de un periodo, cae por debajo de la mediana del otro el ${fmt((100 * fragility), 0)}\u00A0% de las veces. Eso condena el orden de tu tabla, no la región de calidad que propone Orometra. Ignora el ranking y quédate con la meseta de abajo.`,
          `When you keep the best row by the Result column of one period, it falls below the median of the other period ${fmt((100 * fragility), 0)}% of the time. That condemns your table order, not the plateau Orometra proposes. Ignore the ranking and keep the plateau below.`), 'stats');
      tableOnly();
    } else if (fragility >= 0.5) {
      add(SEV.CRITICAL, L(`La regla «primera de Result» falla el ${fmt((100 * fragility), 0)}\u00A0% de las veces`, `The "top Result row" rule fails ${fmt((100 * fragility), 0)}% of the time`),
        L(`Elegir por la columna Result falla el ${fmt((100 * fragility), 0)}\u00A0% al cruzar periodos, y no hay región amplia donde refugiarse. Por encima del 50\u00A0% ese ranking vale menos que lanzar una moneda.`,
          `Choosing by the Result column fails ${fmt((100 * fragility), 0)}% across periods, and there is no broad region to fall back on. Above 50% that ranking is worth less than a coin flip.`), 'stats');
    } else if (fragility >= 0.3) {
      add(SEV.WARN, L(`El orden de MT5 solo se mantiene a medias: falla el ${fmt((100 * fragility), 0)}\u00A0%`, `The MT5 order only half holds: it fails ${fmt((100 * fragility), 0)}%`),
        L(`La mejor fila según la columna Result de un periodo cae por debajo de la mitad de la tabla en el otro el ${fmt((100 * fragility), 0)}\u00A0% de las veces. Ese orden conserva algo de valor, pero no el suficiente para fiarte de la primera fila: elige por meseta.`,
          `The best row by the Result column of one period falls below the middle of the table in the other period ${fmt((100 * fragility), 0)}% of the time. That order keeps some value, but not enough to trust the top row: choose by plateau.`), 'stats');
      tableOnly();
    } else {
      add(SEV.OK, L(`El orden de MT5 se mantiene entre periodos: solo falla el ${fmt((100 * fragility), 0)}\u00A0%`, `The MT5 order holds across periods: it only fails ${fmt((100 * fragility), 0)}%`),
        L(`La mejor fila según la columna Result de un periodo solo cae por debajo de la mitad de la tabla en el otro el ${fmt((100 * fragility), 0)}\u00A0% de las veces: ese orden sí anticipa algo.`,
          `The best row by the Result column of one period only falls below the middle of the table in the other period ${fmt((100 * fragility), 0)}% of the time: that order does anticipate something.`), 'stats');
    }
  }

  if (Number.isFinite(fragilityQuality)) {
    if (fragilityQuality >= 0.5) {
      add(SEV.WARN, L(`La nota de Orometra también se tambalea entre periodos: falla el ${fmt((100 * fragilityQuality), 0)}\u00A0%`, `The Orometra score also wobbles across periods: it fails ${fmt((100 * fragilityQuality), 0)}%`),
        L('Aunque no se use la columna Result, la nota con varias métricas a la vez (factor de beneficio, drawdown, operaciones…) también pierde orden al pasar de un periodo a otro. Eso afecta al puesto de cada configuración en la tabla, no a la meseta, que se valida aparte en el forward: elige por meseta, no por puesto.',
          'Even without the Result column, the score built from several metrics at once (profit factor, drawdown, trades…) also loses order from one period to the other. That affects each configuration\'s rank in the table, not the plateau, which is validated separately on the forward: choose by plateau, not by rank.'), 'stats');
      tableOnly();
    } else if (fragilityQuality < 0.3) {
      add(SEV.OK, L(`La nota de Orometra se mantiene entre periodos: solo falla el ${fmt((100 * fragilityQuality), 0)}\u00A0%`, `The Orometra score holds across periods: it only fails ${fmt((100 * fragilityQuality), 0)}%`),
        L('La nota con varias métricas a la vez (factor de beneficio, drawdown, operaciones…) conserva el orden de las configuraciones de un periodo a otro.',
          'The score built from several metrics at once (profit factor, drawdown, trades…) keeps the order of configurations from one period to the other.'), null);
    }
  }

  if (selectionMode === 'isThenOos' && hasForward) {
    add(SEV.INFO, L('La meseta se busca en el periodo optimizado y se valida en el forward', 'The plateau is found on the optimized period and validated on the forward'),
      L('El motor busca mesetas con la calidad y los mínimos del periodo optimizado. El forward no crea ni amplía la meseta: la comprueba después, y si muchas de sus configuraciones no cumplen tus mínimos en el forward, esa meseta baja de puesto. Pesa menos en la elección que si puntuara, pero no es un tramo ciego.',
        'The engine finds plateaus by quality and minimums on the optimized period. The forward neither creates nor widens the plateau: it validates it afterwards, and if many of its configurations fail your minimums on the forward, that plateau drops in rank. It weighs less in the choice than if it scored, but it is not a blind period.'), null);
    const v = bestPlateau && bestPlateau.oosValidation;
    const partial = v && Number.isFinite(v.withForward) && v.withForward < v.size;
    const basis = partial
      ? L(` (de las ${v.withForward} de sus ${v.size} configuraciones que MT5 probó en el forward)`, ` (of the ${v.withForward} of its ${v.size} configurations that MT5 tested on the forward)`)
      : '';
    if (v && v.withForward === 0) {
      add(SEV.WARN, L('La meseta recomendada no tiene ninguna configuración probada en el forward', 'The recommended plateau has no configuration tested on the forward'),
        L('MT5 solo pasa al forward las mejores pasadas y ninguna de esta meseta estaba entre ellas. Trátala como provisional hasta probarla en un periodo no visto.',
          'MT5 only sends the best passes to the forward and none of this plateau was among them. Treat it as provisional until you test it on an unseen period.'), null);
    } else if (v && Number.isFinite(ctx.plateauForwardCritical) && v.passFrac < ctx.plateauForwardCritical) {
      add(SEV.CRITICAL, L(`La meseta recomendada no se sostiene en el forward: solo aguanta el ${fmt((100 * v.passFrac), 0)} %${basis}`, `The recommended plateau does not hold on the forward: only ${fmt((100 * v.passFrac), 0)}%${basis}`),
        L(`Menos de ${fmt(100 * ctx.plateauForwardCritical, 0)} de cada 100 configuraciones de la meseta cumplen tus mínimos en el forward. Una meseta con ventaja real suele aprobarlo en casi todas; sin ventaja, una meseta entera puede aprobarlo a medias por pura suerte del periodo. No la uses sin probarla antes en un periodo no visto.`,
          `Fewer than ${fmt(100 * ctx.plateauForwardCritical, 0)} in 100 configurations in the plateau meet your minimums on the forward. A plateau with a real edge usually passes it in nearly all of them; without an edge, a whole plateau can half-pass it by pure luck of the period. Do not use it without first testing it on an unseen period.`), null);
    } else if (v && v.passFrac < 0.8) {
      add(SEV.WARN, L(`La meseta recomendada solo aguanta el ${fmt((100 * v.passFrac), 0)}\u00A0% en forward${basis}`, `The recommended plateau only holds ${fmt((100 * v.passFrac), 0)}% on forward${basis}`),
        L('Una parte de la meseta falla los mínimos del forward. Trátala como provisional hasta probarla en un periodo no visto.',
          'Part of the plateau fails the forward minimums. Treat it as provisional until you test it on an unseen period.'), null);
    }
  } else if (selectionMode === 'joint' && hasForward) {
    add(SEV.INFO, L('Modo joint: el forward participa en la selección', 'Joint mode: forward takes part in selection'),
      L('Tus mínimos y la puntuación miran el peor de los dos periodos, así que las cifras del forward ya están algo contaminadas.',
        'Your minimums and the score look at the worse of the two periods, so the forward figures are already somewhat contaminated.'), null);
  }

  /*
   * Asimetria entre los dos sentidos del contraste. Que elegir por IS y validar en OOS
   * salga mucho peor -o mucho mejor- que al reves significa que los dos tramos no son
   * intercambiables: uno de ellos es sistematicamente mas facil. Una ventaja real es
   * aproximadamente simetrica; una diferencia de regimen no lo es.
   */
  if (fragilityFolds && Number.isFinite(fragilityAsymmetry) && fragilityAsymmetry >= 0.25) {
    const a = fragilityFolds.isToOos.value;
    const b = fragilityFolds.oosToIs.value;
    add(SEV.WARN, L('Los dos periodos no son intercambiables', 'The two periods are not interchangeable'),
      L(`Elegir en el periodo optimizado y validar en el forward falla el ${fmt((100 * a), 0)}\u00A0% de las veces; al revés, el ${fmt((100 * b), 0)}\u00A0%. Una ventaja real daría cifras parecidas: una diferencia de ${fmt((100 * fragilityAsymmetry), 0)} puntos indica que uno de los tramos es más fácil o es otro régimen de mercado. Mide el orden de la tabla, no la meseta, pero conviene tenerlo en cuenta: un periodo no visto es la mejor forma de comprobar que la meseta no depende del tramo fácil.`,
        `Choosing on the optimized period and validating on the forward fails ${fmt((100 * a), 0)}% of the time; the other way around, ${fmt((100 * b), 0)}%. A real edge would give similar figures: a ${fmt((100 * fragilityAsymmetry), 0)}-point gap means one stretch is easier or a different market regime. It measures the table order, not the plateau, but it is worth keeping in mind: an unseen period is the best way to check that the plateau does not depend on the easy stretch.`), 'stats');
    tableOnly();
  }

  /*
   * Puertas que no hacen nada. El usuario configura tres minimos y da por hecho que los
   * tres pesan; conviene decirle cuando uno de ellos es decorativo, para que no se pase
   * una tarde ajustando una palanca desconectada.
   */
  if (gateInfluence) {
    const ETIQUETA_ES = { beneficio: 'beneficio positivo', profitFactor: 'factor de beneficio', drawdown: 'drawdown máximo', trades: 'número de operaciones' };
    const ETIQUETA_EN = { beneficio: 'positive profit', profitFactor: 'profit factor', drawdown: 'maximum drawdown', trades: 'number of trades' };
    const inertes = gateInfluence.filter((g) => g.inert && g.name !== 'beneficio');
    const dominante = [...gateInfluence].sort((a, b) => b.sole - a.sole)[0];
    if (inertes.length) {
      const listEs = inertes.map((g) => {
        const obs = Number.isFinite(g.observed) && Number.isFinite(g.observedOos) && Number.isFinite(g.limitOos)
          ? ` (tus límites son ${gateValue(g.name, g.limit)} en el periodo optimizado y ${gateValue(g.name, g.limitOos)} en el forward; la mediana de lo que pasa está en ${gateValue(g.name, g.observed)} y ${gateValue(g.name, g.observedOos)})`
          : Number.isFinite(g.observed)
            ? ` (tu límite es ${gateValue(g.name, g.limit)}, y la mediana de lo que pasa está en ${gateValue(g.name, g.observed)}${g.name === 'drawdown' && hasForward ? ' en su peor periodo' : ''})`
            : '';
        return `<strong>${ETIQUETA_ES[g.name]}</strong>${obs}`;
      }).join('; ');
      const listEn = inertes.map((g) => {
        const obs = Number.isFinite(g.observed) && Number.isFinite(g.observedOos) && Number.isFinite(g.limitOos)
          ? ` (your limits are ${gateValue(g.name, g.limit)} on the optimized period and ${gateValue(g.name, g.limitOos)} on the forward; the median of what passes sits at ${gateValue(g.name, g.observed)} and ${gateValue(g.name, g.observedOos)})`
          : Number.isFinite(g.observed)
            ? ` (your limit is ${gateValue(g.name, g.limit)}, and the median of what passes sits at ${gateValue(g.name, g.observed)}${g.name === 'drawdown' && hasForward ? ' in its worst period' : ''})`
            : '';
        return `<strong>${ETIQUETA_EN[g.name]}</strong>${obs}`;
      }).join('; ');
      const domEs = dominante && dominante.sole > 0
        ? ` Quien decide aquí es <strong>${ETIQUETA_ES[dominante.name]}</strong>: descarta ${dominante.sole.toLocaleString(localeTag())} ${dominante.sole === 1 ? 'configuración' : 'configuraciones'} él solo.`
        : '';
      const domEn = dominante && dominante.sole > 0
        ? ` What decides here is <strong>${ETIQUETA_EN[dominante.name]}</strong>: it alone discards ${dominante.sole.toLocaleString(localeTag())} ${dominante.sole === 1 ? 'configuration' : 'configurations'}.`
        : '';
      add(SEV.INFO, L(`${inertes.length === 1 ? 'Uno de tus mínimos no está filtrando nada' : `${inertes.length} de tus mínimos no están filtrando nada`}`,
          `${inertes.length === 1 ? 'One of your minimums is not filtering anything' : `${inertes.length} of your minimums are not filtering anything`}`),
        L(`${listEs}. Ninguna configuración queda fuera únicamente por ${inertes.length === 1 ? 'ese motivo, así que moverlo' : 'ninguno de ellos, así que moverlos'} no cambiará el resultado.${domEs}`,
          `${listEn}. No configuration is excluded solely for ${inertes.length === 1 ? 'that reason, so moving it' : 'any of them, so moving them'} will not change the outcome.${domEn}`), 'gates');
    }
  }

  /*
   * Estabilidad del propio veredicto frente a sus constantes. Es la pregunta que un
   * usuario critico debe hacer -¿esto sale de mis datos o de vuestro ajuste?- y aqui
   * viene respondida con un numero en lugar de con una promesa.
   */
  if (stabilityCheck && stabilityCheck.draws) {
    const pctRegion = 100 * stabilityCheck.regionRate;
    if (stabilityCheck.regionRate >= 0.8) {
      add(SEV.OK, L(`La recomendación aguanta el ${fmt(pctRegion, 0)}\u00A0% de las variaciones de umbral`, `The recommendation holds through ${fmt(pctRegion, 0)}% of threshold variations`),
        L(`Se ha repetido la búsqueda ${stabilityCheck.draws} veces moviendo al azar un ±20\u00A0% nuestros criterios (calidad mínima de una meseta, tamaño mínimo, vecinas mínimas…). En el ${fmt(pctRegion, 0)}\u00A0% de los casos la configuración ganadora sigue cayendo dentro de la MISMA meseta. La recomendación es una propiedad de tus datos, no del ajuste de la herramienta.`,
          `The search was repeated ${stabilityCheck.draws} times randomly shifting our criteria by ±20% (minimum plateau quality, minimum size, minimum neighbors…). In ${fmt(pctRegion, 0)}% of cases the winning configuration still falls inside the SAME plateau. The recommendation is a property of your data, not of the tool's tuning.`), 'stability');
    } else if (stabilityCheck.regionRate >= 0.5) {
      add(SEV.WARN, L(`La recomendación solo aguanta el ${fmt(pctRegion, 0)}\u00A0% de las variaciones de umbral`, `The recommendation only holds through ${fmt(pctRegion, 0)}% of threshold variations`),
        L(`Moviendo un ±20\u00A0% nuestros criterios, la meseta ganadora cambia hasta en la mitad de los casos. Hay señal, pero la frontera entre las mesetas candidatas es difusa: trata el Top como un conjunto de opciones equivalentes y decide por criterio operativo, no por el orden.`,
          `Shifting our criteria by ±20%, the winning plateau changes in up to half the cases. There is signal, but the boundary between candidate plateaus is diffuse: treat the Top as a set of equivalent options and decide by operational criteria, not by rank.`), 'stability');
    } else {
      add(SEV.CRITICAL, L(`La recomendación no sobrevive a sus propios umbrales (${fmt(pctRegion, 0)}\u00A0%)`, `The recommendation does not survive its own thresholds (${fmt(pctRegion, 0)}%)`),
        L(`Repitiendo la búsqueda ${stabilityCheck.draws} veces con los umbrales movidos un ±20\u00A0%, la meseta ganadora solo se mantiene el ${fmt(pctRegion, 0)}\u00A0% de las veces. Lo que sale primero depende de dónde pusimos los cortes, no de tus datos.`,
          `Repeating the search ${stabilityCheck.draws} times with thresholds shifted ±20%, the winning plateau holds only ${fmt(pctRegion, 0)}% of the time. What comes first depends on where we placed the cuts, not on your data.`), 'stability');
    }

    /*
     * Y la misma pregunta sobre TUS minimos, que es la que faltaba. El panel anterior
     * solo movia nuestros umbrales internos y daba una cifra tranquilizadora sobre la
     * palanca equivocada: medido en un EA real, mover el factor de beneficio entre 1,15 y
     * 1,25 devolvia tres configuraciones recomendadas distintas.
     */
    const gs = stabilityCheck.gates;
    if (gs && gs.draws) {
      const p = 100 * gs.regionRate;
      if (gs.regionRate >= 0.8) {
        add(SEV.OK, L(`La recomendación aguanta el ${fmt(p, 0)}\u00A0% de las variaciones de TUS mínimos`, `The recommendation holds through ${fmt(p, 0)}% of variations in YOUR minimums`),
          L(`Moviendo un ±20\u00A0% el factor de beneficio exigido, el drawdown máximo y el número mínimo de operaciones, la configuración ganadora sigue cayendo en la misma meseta. No depende de haber acertado con unos mínimos concretos.`,
            `Shifting the required profit factor, maximum drawdown and minimum trade count by ±20%, the winning configuration still falls in the same plateau. It does not depend on having hit particular minimums.`), 'stability');
      } else if (gs.regionRate >= 0.5) {
        add(SEV.WARN, L(`Tus mínimos mueven la recomendación (aguanta el ${fmt(p, 0)}\u00A0%)`, `Your minimums move the recommendation (it holds ${fmt(p, 0)}%)`),
          L(`Moviendo un ±20\u00A0% los mínimos que has configurado, la meseta ganadora cambia hasta en la mitad de los casos. Antes de decidir, prueba a subir y bajar el factor de beneficio exigido y mira si te sigue recomendando lo mismo: si no, lo que estás eligiendo es tu umbral, no una propiedad de tu EA.`,
            `Shifting the minimums you configured by ±20%, the winning plateau changes in up to half the cases. Before deciding, try raising and lowering the required profit factor and see whether it still recommends the same thing: if not, what you are choosing is your threshold, not a property of your EA.`), 'stability');
      } else {
        add(SEV.CRITICAL, L(`La recomendación depende de los mínimos que elijas (${fmt(p, 0)}\u00A0%)`, `The recommendation depends on the minimums you choose (${fmt(p, 0)}%)`),
          L(`Con los mínimos movidos un ±20\u00A0%, la meseta ganadora solo se mantiene el ${fmt(p, 0)}\u00A0% de las veces. La recomendación la decide el umbral que has escrito, no tus datos: con un factor de beneficio de 1,25 en vez de 1,15 saldría otra, igual de válida.`,
            `With minimums shifted ±20%, the winning plateau holds only ${fmt(p, 0)}% of the time. The threshold you wrote decides the recommendation, not your data: a profit factor of 1.25 instead of 1.15 would give another, equally valid one.`), 'stability');
      }
    } else if (stabilityCheck.gatesSkipped) {
      add(SEV.INFO, L('No se ha podido auditar el efecto de tus mínimos', 'The effect of your minimums could not be audited'),
        L('Comprobar cómo cambia la recomendación al mover los mínimos exige rehacer la vecindad decenas de veces, y con un conjunto de este tamaño habría hecho el análisis demasiado lento. Nuestros criterios sí se han auditado.',
          'Checking how the recommendation changes when minimums move requires rebuilding the neighborhood dozens of times, and with a set of this size it would have made the analysis too slow. Our criteria have been audited.'), 'stability');
    }
  }

  if (sharpeTest && Number.isFinite(sharpeTest.observedMax) && Number.isFinite(sharpeTest.chanceMax)) {
    const { observedMax, chanceMax, trials } = sharpeTest;
    // El umbral se calcula con las pruebas EFECTIVAS (zonas distintas del espacio), no
    // con todas las pasadas: hay que decir el número que de verdad se usa.
    const eff = Number.isFinite(sharpeTest.effectiveTrials) ? sharpeTest.effectiveTrials : trials;
    const n = (v) => v.toLocaleString(localeTag());
    const howMany = eff < trials
      ? L(`${n(eff)} pruebas efectivas (las partes distintas del espacio que cubren tus ${n(trials)} pasadas: las configuraciones vecinas no son pruebas independientes)`,
        `${n(eff)} effective trials (the distinct zones covered by your ${n(trials)} passes: neighboring configurations are not independent trials)`)
      : L(`${n(eff)} pruebas`, `${n(eff)} trials`);
    if (observedMax <= chanceMax) {
      add(SEV.CRITICAL, L('El mejor Sharpe no supera el umbral del azar', 'Best Sharpe does not beat the chance threshold'),
        L(`Con ${howMany}, el Sharpe máximo esperable sin ninguna ventaja real es ${fmt(chanceMax, 2)}. El mejor observado${sharpeTest.period === 'oos' ? ' en el forward' : ''} es ${fmt(observedMax, 2)}. Probar muchas configuraciones produce buenos resultados por sí solo, y este no destaca sobre ese ruido.`,
          `With ${howMany}, the maximum Sharpe expected with no real edge is ${fmt(chanceMax, 2)}. The best observed${sharpeTest.period === 'oos' ? ' on the forward' : ''} is ${fmt(observedMax, 2)}. Trying many configurations produces good results on its own, and this one does not stand out above that noise.`), 'stats');
    } else {
      add(SEV.OK, L('El mejor Sharpe supera el umbral del azar', 'Best Sharpe beats the chance threshold'),
        L(`Sharpe máximo${sharpeTest.period === 'oos' ? ' en el forward' : ''} ${fmt(observedMax, 2)} frente a ${fmt(chanceMax, 2)} esperable sin ventaja real con ${howMany}. Superar este contraste es condición necesaria, no suficiente: descarta que el resultado venga solo de haber probado mucho, pero no valida la estrategia.`,
          `Maximum Sharpe${sharpeTest.period === 'oos' ? ' on the forward' : ''} ${fmt(observedMax, 2)} versus ${fmt(chanceMax, 2)} expected with no real edge with ${howMany}. Passing this test is a necessary condition, not a sufficient one: it rules out that the result comes only from trying a lot, but it does not validate the strategy.`), 'stats');
    }
  }

  // ---- Avisos metodologicos
  if (!hasForward) {
    add(SEV.CRITICAL, L('Sin periodo forward no hay validación posible', 'Without a forward period there is no possible validation'),
      L('Solo has subido el periodo optimizado, así que todo lo que ves está medido sobre los mismos datos con los que se eligieron los parámetros. Las mesetas son reales como estructura, pero nadie ha comprobado que sobrevivan fuera. Repite la optimización en MT5 con la opción Forward activada: es la diferencia entre describir el pasado y predecir algo.',
        'You only uploaded the optimized period, so everything you see is measured on the same data used to choose the parameters. The plateaus are real as structure, but nobody has checked that they survive outside. Repeat the optimization in MT5 with Forward enabled: that is the difference between describing the past and predicting something.'), null);
  }

  /*
   * Contaminacion del forward por la seleccion. Es un punto conceptual que casi ninguna
   * herramienta reconoce y conviene decirlo sin rodeos: en cuanto el forward se usa para
   * FILTRAR y para PUNTUAR, sus cifras dejan de ser una estimacion limpia de lo que viene.
   * Usarlo asi es lo correcto -desperdiciar esa informacion seria peor-, pero callarlo no.
   */
  if (hasForward && selectionMode === 'joint') {
    add(SEV.INFO, L('Las cifras del forward ya se han usado para elegir', 'Forward figures have already been used for selection'),
      L('Los mínimos se aplican también al forward y cada configuración puntúa por el peor de los dos periodos, así que el forward ha intervenido en la elección. Por eso sus cifras salen algo mejores que sobre datos de verdad nuevos. Aprovecharlo es mejor que tirarlo, pero el único número limpio será el del periodo no visto: ese paso no es opcional.',
        'The minimums are also applied to the forward and each configuration scores by the worse of the two periods, so the forward has taken part in the choice. That is why its figures come out somewhat better than on truly new data. Using it beats discarding it, but the only clean number will be the unseen period\'s: that step is not optional.'), null);
  } else if (hasForward) {
    add(SEV.INFO, L('El forward ya se ha usado para validar y ordenar', 'The forward has already been used to validate and rank'),
      L('La meseta sale solo del periodo optimizado, pero el forward decide qué mesetas bajan de puesto y da todas las cifras de validación. Por eso sus cifras salen algo mejores que sobre datos de verdad nuevos. Aprovecharlo es mejor que tirarlo, pero el único número limpio será el del periodo no visto: ese paso no es opcional.',
        'The plateau comes from the optimized period alone, but the forward decides which plateaus drop in rank and provides every validation figure. That is why its figures come out somewhat better than on truly new data. Using it beats discarding it, but the only clean number will be the unseen period\'s: that step is not optional.'), null);
  }

  if (rescuedDims && rescuedDims.length) {
    const listEs = rescuedDims.map((d) => `${d.name} (efecto aislado ${fmt(d.marginal, 2)}, combinado ${fmt(d.conditional, 2)})`).join('; ');
    const listEn = rescuedDims.map((d) => `${d.name} (isolated effect ${fmt(d.marginal, 2)}, combined ${fmt(d.conditional, 2)})`).join('; ');
    add(SEV.INFO, L(`${rescuedDims.length} ${pl(rescuedDims.length, 'parámetro se ha conservado', 'parámetros se han conservado')} por su efecto combinado`, `${rescuedDims.length} ${pl(rescuedDims.length, 'parameter was', 'parameters were')} kept for their combined effect`),
      L(`${listEs}. Vistos por separado parecen planos, pero al dejar fijo todo lo demás sí mueven el resultado: su efecto depende del valor de otros parámetros. Se mantienen en el espacio de búsqueda, porque descartarlos haría pasar por vecinas a configuraciones que no lo son e inflaría las mesetas.`,
        `${listEn}. Seen alone they look flat, but with everything else held fixed they do move the result: their effect depends on the value of other parameters. They stay in the search space, because discarding them would treat non-neighbors as neighbors and inflate the plateaus.`), 'sensitivity');
  }

  if (irregularGrids && irregularGrids.length) {
    const top = irregularGrids.slice(0, 3);
    const listEs = top.map((g) => `${g.name}: el salto mayor (${g.maxStep}) es ${fmt(g.ratio, 0)} veces el menor (${g.minStep})`).join('; ');
    const listEn = top.map((g) => `${g.name}: the largest step (${g.maxStep}) is ${fmt(g.ratio, 0)} times the smallest (${g.minStep})`).join('; ');
    const spanEs = spansIrregular && spansIrregular.length
      ? ` La meseta recomendada cruza uno de esos saltos (${spansIrregular.map((x) => x.name).join(', ')}).`
      : '';
    const spanEn = spansIrregular && spansIrregular.length
      ? ` The recommended plateau crosses one of those jumps (${spansIrregular.map((x) => x.name).join(', ')}).`
      : '';
    add(SEV.WARN, L(`La rejilla de ${irregularGrids.length} ${pl(irregularGrids.length, 'parámetro', 'parámetros')} tiene saltos desiguales`, `The grid of ${irregularGrids.length} ${pl(irregularGrids.length, 'parameter', 'parameters')} has uneven steps`),
      L(`${listEs}. El motor cuenta POSICIONES, no distancias: dos valores consecutivos de tu lista están siempre «a un paso» aunque entre ellos haya un abismo. Donde los saltos son desiguales, la continuidad de una meseta puede ser un espejismo. Optimiza esos parámetros con un paso uniforme.${spanEs}`,
        `${listEn}. The engine counts POSITIONS, not distances: two consecutive values on your list are always "one step apart" even if there is a gulf between them. Where steps are uneven, plateau continuity can be an illusion. Optimize those parameters with a uniform step.${spanEn}`), 'sensitivity');
  }

  if (offsetsComplete === false) {
    add(SEV.INFO, L('La vecindad se ha medido de forma aproximada', 'Neighborhood was measured approximately'),
      L('Con tantos parámetros optimizados, enumerar todos los desplazamientos posibles dentro del radio sería demasiado costoso, así que solo se han considerado los que mueven uno o dos parámetros a la vez. Es una aproximación conservadora: puede subestimar el soporte, nunca inventarlo.',
        'With so many optimized parameters, enumerating every possible offset within the radius would be too costly, so only those that move one or two parameters at a time were considered. It is a conservative approximation: it may understate support, never invent it.'), null);
  }

  if (sampling === 'sparse') {
    add(SEV.WARN, L(`Muestreo disperso (sobre niveles vistos): ${fmt((100 * coverage), 4)}\u00A0%`, `Sparse sampling (on seen levels): ${fmt((100 * coverage), 4)}%`),
      L('Has optimizado con algoritmo genético, no con rejilla completa. El GA concentra las pruebas donde el periodo optimizado era bueno, así que la densidad de vecinas mide dónde miró el optimizador tanto como dónde hay estabilidad. Usa el rango de refinamiento que propone la app y repite con rejilla completa.',
        'You optimized with a genetic algorithm, not a full grid. The GA concentrates trials where the optimized period was good, so neighbor density measures where the optimizer looked as much as where there is stability. Use the refinement range the app proposes and repeat with a full grid.'), 'coverage');
  }

  if (searchCoverage && searchCoverage.usable && Number.isFinite(searchCoverage.coverageSearch)) {
    const cs = searchCoverage.coverageSearch;
    const obs = Number.isFinite(coverage) ? coverage : NaN;
    if (cs < 0.02) {
      add(SEV.WARN, L(`Solo ${fmt((100 * cs), 2)}\u00A0% del rango del .set`, `Only ${fmt((100 * cs), 2)}% of the .set search range`),
        L(`El .set pide un espacio de ${searchCoverage.searchCartesian.toLocaleString(localeTag())} configuraciones; tus archivos cubren ${searchCoverage.uniqueObserved.toLocaleString(localeTag())} celdas distintas. La cobertura «alta» sobre niveles vistos no implica que hayas explorado el rango que pediste en MT5.`,
          `The .set asks for a space of ${searchCoverage.searchCartesian.toLocaleString(localeTag())} configurations; your files cover ${searchCoverage.uniqueObserved.toLocaleString(localeTag())} distinct cells. High coverage on seen levels does not mean you explored the range you asked MT5 for.`), 'coverage');
    } else if (Number.isFinite(obs) && obs >= 0.5 && cs < obs * 0.5) {
      add(SEV.WARN, L('La cobertura observada engaña frente al .set', 'Observed coverage misleads vs the .set'),
        L(`Sobre niveles vistos cubres el ${fmt((100 * obs), 1)}\u00A0%; frente al rango del .set, solo el ${fmt((100 * cs), 2)}\u00A0%. Una optimización genética concentrada en un rincón produce exactamente esa discrepancia.`,
          `On seen levels you cover ${fmt((100 * obs), 1)}%; versus the .set range, only ${fmt((100 * cs), 2)}%. A genetic optimization concentrated in one corner produces exactly that gap.`), 'coverage');
    } else if (cs >= 0.95) {
      add(SEV.OK, L(`Cobertura del .set: ${fmt((100 * cs), 1)}\u00A0%`, `.set coverage: ${fmt((100 * cs), 1)}%`),
        L('Las pasadas cubren casi todo el espacio de búsqueda declarado en el .set.',
          'Passes cover almost the entire search space declared in the .set.'), 'coverage');
    } else {
      add(SEV.INFO, L(`Cobertura del .set: ${fmt((100 * cs), 2)}\u00A0%`, `.set coverage: ${fmt((100 * cs), 2)}%`),
        L(`${searchCoverage.uniqueObserved.toLocaleString(localeTag())} celdas distintas de ${searchCoverage.searchCartesian.toLocaleString(localeTag())} pedidas en el .set.`,
          `${searchCoverage.uniqueObserved.toLocaleString(localeTag())} distinct cells of ${searchCoverage.searchCartesian.toLocaleString(localeTag())} requested in the .set.`), 'coverage');
    }
    if (searchCoverage.outsideAny) {
      add(SEV.WARN, L('Hay pasadas fuera del rango del .set', 'Some passes fall outside the .set range'),
        L('Algunos valores observados no encajan en inicio/paso/fin del .set aportado. Puede ser otro .set, un redondeo, o una optimización distinta.',
          'Some observed values do not fit the .set start/step/stop. It may be another .set, rounding, or a different optimization.'), 'coverage');
    }
    if (searchCoverage.missingInSet && searchCoverage.missingInSet.length) {
      add(SEV.INFO, L(`${searchCoverage.missingInSet.length} ${pl(searchCoverage.missingInSet.length, 'parámetro del archivo no está', 'parámetros del archivo no están')} en el .set`, `${searchCoverage.missingInSet.length} ${pl(searchCoverage.missingInSet.length, 'file parameter', 'file parameters')} missing from the .set`),
        L(`No se contrastaron: ${searchCoverage.missingInSet.slice(0, 6).join(', ')}${searchCoverage.missingInSet.length > 6 ? '…' : ''}.`,
          `Not checked: ${searchCoverage.missingInSet.slice(0, 6).join(', ')}${searchCoverage.missingInSet.length > 6 ? '…' : ''}.`), 'coverage');
    }
  } else if (!searchCoverage || !searchCoverage.present) {
    add(SEV.INFO, L('Sin .set de optimización: cobertura solo sobre niveles vistos', 'No optimization .set: coverage is on seen levels only'),
      L('Suelta el .set con el que lanzaste la optimización (el que guarda el inicio, el paso y el fin de cada parámetro) para medir qué parte del rango pedido cubren tus archivos.',
        'Drop the .set you launched the optimization with (the one that stores each parameter’s start, step and stop) to measure how much of the requested range your files cover.'), 'coverage');
  }

  if (Number.isFinite(medianSupport) && medianSupport < 4) {
    add(SEV.WARN, L(`Soporte local insuficiente (mediana de ${fmt(medianSupport, 0)} vecinas)`, `Insufficient local support (median of ${fmt(medianSupport, 0)} neighbors)`),
      L('La mayoría de configuraciones tiene muy pocas vecinas observadas. Cualquier afirmación sobre mesetas es provisional hasta que refines con una rejilla.',
        'Most configurations have very few observed neighbors. Any claim about plateaus is provisional until you refine with a grid.'), 'coverage');
  }

  // Una correlación nula entre periodos NO significa lo mismo según cuánta parte del
  // espacio sea viable. Si casi todo pierde dinero, es que no hay ventaja. Si casi
  // todo gana, la ventaja existe y lo que no sirve es el RANKING. Confundir ambas
  // cosas lleva a descartar estrategias buenas por el motivo equivocado.
  if (Number.isFinite(spearman)) {
    if (spearman < 0.1 && hasRefuge) {
      add(SEV.WARN, L(`El ranking no transfiere de un periodo al otro (rho = ${fmt(spearman, 2)})`, `The ranking does not transfer from one period to the other (rho = ${fmt(spearman, 2)})`),
        L(`De las ${fwdBase.toLocaleString(localeTag())} configuraciones que MT5 pasó al forward, el ${fmt((100 * gatePassCount / fwdBase), 0)}\u00A0% cumple los mínimos en los dos periodos: hay configuraciones que aguantan. Lo que no vale es el orden: la primera en el periodo optimizado no predice la primera en el forward. Elige por meseta estable en los dos periodos, no por puesto.`,
          `Of the ${fwdBase.toLocaleString(localeTag())} configurations MT5 passed to the forward, ${fmt((100 * gatePassCount / fwdBase), 0)}% meet the minimums in both periods: some configurations do hold. What has no value is the order: first on the optimized period does not predict first on the forward. Choose by a plateau stable in both periods, not by rank.`), 'stats');
      tableOnly();
    } else if (spearman < 0.1) {
      add(SEV.CRITICAL, L(`Lo que rinde bien en el periodo optimizado no dice nada del forward (${fmt(spearman, 2)} sobre 1)`, `What does well on the optimized period says nothing about the forward (${fmt(spearman, 2)} out of 1)`),
        L(`Solo el ${fmt((100 * gatePassCount / fwdBase), 0)}\u00A0% de las configuraciones con forward cumple los mínimos y además lo que rinde en el periodo optimizado no dice nada sobre el forward. Es compatible con un sistema sin ventaja real.`,
          `Only ${fmt((100 * gatePassCount / fwdBase), 0)}% of configurations with forward meet the minimums and what does well on the optimized period says nothing about the forward. That is consistent with a system with no real edge.`), 'stats');
    } else if (spearman < 0.3) {
      add(SEV.WARN, L(`Lo que rinde bien en el periodo optimizado dice poco del forward (${fmt(spearman, 2)} sobre 1)`, `What does well on the optimized period says little about the forward (${fmt(spearman, 2)} out of 1)`),
        L('Hay algo de señal en el orden general, pero poca: el puesto en la tabla anticipa poco del forward. Elige por meseta, no por puesto.',
          'There is some signal in the overall order, but little: rank in the table anticipates little of the forward. Choose by plateau, not by rank.'), 'stats');
      tableOnly();
    } else {
      add(SEV.OK, L(`Lo que rinde bien en el periodo optimizado tiende a rendir bien en el forward (${fmt(spearman, 2)} sobre 1)`, `What does well on the optimized period tends to do well on the forward (${fmt(spearman, 2)} out of 1)`),
        L('El orden general de las configuraciones se conserva de un periodo al otro.',
          'The overall order of the configurations carries over from one period to the other.'), 'stats');
    }
  }

  if (hasForward && viableShare >= 0.6) {
    add(SEV.OK, L(hasForward && fwdBase < total ? 'Casi todas las configuraciones que MT5 pasó al forward cumplen los mínimos' : 'La estrategia aguanta en casi todo el espacio de parámetros', hasForward && fwdBase < total ? 'Nearly all configurations MT5 passed to the forward meet the minimums' : 'The strategy holds across nearly the whole parameter space'),
      L(`${gatePassCount.toLocaleString(localeTag())} de ${fwdBase.toLocaleString(localeTag())} configuraciones${fwdBase < total ? ' con forward' : ''} (${fmt((100 * viableShare), 0)}\u00A0%) cumplen los mínimos en los dos periodos. El resultado no depende de haber acertado con unos valores concretos.${fwdBase < total ? ' Ojo: MT5 solo pasa al forward las mejores del periodo optimizado, así que es una proporción sobre esas, no sobre todo lo que probaste.' : ''}`,
        `${gatePassCount.toLocaleString(localeTag())} of ${fwdBase.toLocaleString(localeTag())} configurations${fwdBase < total ? ' with forward' : ''} (${fmt((100 * viableShare), 0)}%) meet the minimums in both periods. The result does not depend on having hit particular values.${fwdBase < total ? ' Note: MT5 only passes the best configurations of the optimized period to the forward, so this is a share of those, not of everything you tested.' : ''}`), null);
  } else if (hasForward && hasRefuge) {
    add(SEV.OK, L('Hay una parte amplia del espacio que supera los mínimos', 'A broad part of the space clears the minimums'),
      L(`${gatePassCount.toLocaleString(localeTag())} de ${fwdBase.toLocaleString(localeTag())} configuraciones${fwdBase < total ? ' con forward' : ''} (${fmt((100 * viableShare), 0)}\u00A0%) los cumplen en los dos periodos, y se agrupan en ${plateaus.length === 1 ? 'una meseta' : `${plateaus.length} mesetas`}. No dependes de haber acertado un valor concreto: hay de dónde elegir.`,
        `${gatePassCount.toLocaleString(localeTag())} of ${fwdBase.toLocaleString(localeTag())} configurations${fwdBase < total ? ' with forward' : ''} (${fmt((100 * viableShare), 0)}%) meet them in both periods, and they cluster into ${plateaus.length === 1 ? 'one plateau' : `${plateaus.length} plateaus`}. You do not depend on having hit a particular value: there is room to choose.`), null);
  }

  if (inversions && inversions.length) {
    const top = inversions.slice(0, 5);
    const listEs = top.map((x) => `${x.name}: el periodo optimizado prefiere ${x.bestIs}, pero en el forward gana ${x.bestOos} (quedarte con el valor del periodo optimizado tira el ${fmt((100 * x.regretShare), 0)}\u00A0% del margen disponible)`).join('; ');
    const listEn = top.map((x) => `${x.name}: the optimized period prefers ${x.bestIs}, but on the forward ${x.bestOos} wins (keeping the optimized period value throws away ${fmt((100 * x.regretShare), 0)}% of the available margin)`).join('; ');
    add(SEV.WARN, L(`En ${inversions.length} ${pl(inversions.length, 'parámetro', 'parámetros')}, el valor que gana en el periodo optimizado no es el que gana en el forward`, `In ${inversions.length} ${pl(inversions.length, 'parameter', 'parameters')}, the value that wins on the optimized period is not the one that wins on the forward`),
      L(`${listEs}. Es una de las razones por las que el orden de la tabla no se mantiene entre periodos: el mejor valor de esos parámetros se movió de un periodo a otro, y puede depender más del momento del mercado que de la estrategia. Afinarlos sobre el periodo optimizado aporta poco: déjalos en un valor central y decide con los que sí son coherentes entre periodos.`,
        `${listEn}. It is one of the reasons the table order does not hold across periods: the best value of those parameters moved from one period to the other, and it may depend more on the market phase than on the strategy. Fine-tuning them on the optimized period adds little: leave them at a central value and decide with those that are coherent across periods.`), 'parameters');
    tableOnly();
  }

  if (periodComparison) {
    const { medianQualityIs, medianQualityOos, passIsPct, passOosPct } = periodComparison;
    if (Number.isFinite(medianQualityOos) && Number.isFinite(medianQualityIs)
      && medianQualityOos > medianQualityIs + 0.05 && passOosPct > passIsPct + 0.05) {
      add(SEV.WARN, L('El periodo forward fue más benigno que el periodo optimizado', 'The forward period was more benign than the optimized period'),
        L(`Calidad mediana ${fmt(medianQualityOos, 2)} en el forward frente a ${fmt(medianQualityIs, 2)} en el periodo optimizado; pasan los mínimos el ${fmt((100 * passOosPct), 0)}\u00A0% frente al ${fmt((100 * passIsPct), 0)}\u00A0%. Puede ser solidez de la estrategia o un tramo fácil: repite la prueba en otro tramo antes de darla por buena.`,
          `Median quality ${fmt(medianQualityOos, 2)} on the forward versus ${fmt(medianQualityIs, 2)} on the optimized period; ${fmt((100 * passOosPct), 0)}% pass the minimums versus ${fmt((100 * passIsPct), 0)}%. It may be the strategy's strength or an easy stretch: repeat the test on another stretch before trusting it.`), null);
    }
  }

  if (tiedCount > 1) {
    add(SEV.INFO, L(`Las ${tiedCount === 2 ? 'dos' : tiedCount === 3 ? 'tres' : tiedCount} primeras mesetas están empatadas`, `The first ${tiedCount === 2 ? 'two' : tiedCount === 3 ? 'three' : tiedCount} plateaus are tied`),
      L(`${tiedRanks.map((r) => 'M' + r).join(', ')} puntúan prácticamente igual: la diferencia está dentro del ruido y el orden en que aparecen no significa que una sea mejor. Compáralas en la tabla del Top y elige por criterio operativo.`,
        `${tiedRanks.map((r) => 'M' + r).join(', ')} score practically the same: the difference is within noise and the order they appear does not mean one is better. Compare them in the Top table and choose by operational criteria.`), null);
  }

  if (invertedRisk && invertedRisk.length && bestPlateau) {
    const altEs = alternativePlateau
      ? ` La meseta ${alternativePlateau.rank} (representante: pasada ${alternativePlateau.record.id}) no tiene ese problema y es la alternativa natural.`
      : '';
    const altEn = alternativePlateau
      ? ` Plateau ${alternativePlateau.rank} (representative: pass ${alternativePlateau.record.id}) does not have that problem and is the natural alternative.`
      : '';
    add(SEV.WARN, L('La configuración propuesta usa un valor que gana en el periodo optimizado, pero no en el forward', 'The proposed configuration uses a value that wins on the optimized period, but not on the forward'),
      L(`${invertedRisk.map((x) => `${x.name} = ${x.bestIs}`).join(', ')}: es el valor que gana en el periodo optimizado, pero en el forward gana otro y quedarse con este cuesta margen. Que esta configuración concreta aguante en el forward puede ser mérito suyo o puede ser suerte, y no hay forma de distinguirlo con estos datos.${altEs}`,
        `${invertedRisk.map((x) => `${x.name} = ${x.bestIs}`).join(', ')}: that is the value that wins on the optimized period, but another one wins on the forward and keeping this one costs margin. That this specific configuration holds on the forward may be its merit or may be luck, and there is no way to tell with these data.${altEn}`), 'plateau');
  }

  if (boundaryWorst && boundaryWorst.length) {
    add(SEV.WARN, L('La configuración recomendada está pegada al borde del rango probado', 'The recommended configuration sits on the edge of the tested range'),
      L(`Afecta a: ${boundaryWorst.map((b) => `${b.name} = ${b.atMin ? b.min : b.max}`).join(', ')}. Más allá de ese valor no has probado nada: la meseta puede continuar o puede caer en picado justo después. Amplía el rango de esos parámetros y vuelve a optimizar.`,
        `Affects: ${boundaryWorst.map((b) => `${b.name} = ${b.atMin ? b.min : b.max}`).join(', ')}. Beyond that value you have tested nothing: the plateau may continue or may drop sharply right after. Widen the range of those parameters and optimize again.`), 'plateau');
  }

  if (Number.isFinite(periodRatio)) {
    if (periodRatio < 0.15) {
      add(SEV.WARN, L(`El forward es muy corto (aprox. ${fmt((100 * periodRatio), 0)}\u00A0% del periodo optimizado)`, `The forward is very short (approx. ${fmt((100 * periodRatio), 0)}% of the optimized period)`),
        L('Un forward demasiado breve produce validaciones ruidosas. Lo habitual es situarlo entre el 20\u00A0% y el 50\u00A0% del periodo optimizado.',
          'An overly short forward produces noisy validations. The usual range is between 20% and 50% of the optimized period.'), 'coverage');
    } else if (periodRatio > 1.2) {
      add(SEV.INFO, L(`El forward es más largo que el periodo optimizado (aprox. ${fmt((100 * periodRatio), 0)}\u00A0%)`, `The forward is longer than the optimized period (approx. ${fmt((100 * periodRatio), 0)}%)`),
        L('Validación exigente, lo cual es bueno, pero revisa que el reparto sea el que pretendías.',
          'A demanding validation, which is good, but check that the split is the one you intended.'), 'coverage');
    }
  }

  if (integrity) {
    if (integrity.provenance && integrity.provenance.checked && integrity.provenance.mismatches > 0) {
      add(SEV.CRITICAL, L('Los dos archivos no parecen de la misma optimización', 'The two files do not appear to be from the same optimization'),
        L(`En ${integrity.provenance.mismatches} ${pl(integrity.provenance.mismatches, 'fila', 'filas')} el resultado del backtest del archivo forward no coincide con el del archivo de la optimización. Revisa que no hayas mezclado exportaciones.`,
          `In ${integrity.provenance.mismatches} ${pl(integrity.provenance.mismatches, 'row', 'rows')} the forward file's backtest result does not match the optimization file. Check that you have not mixed exports.`), 'integrity');
    }
    if (integrity.forwardSelectionSuspect) {
      const pct = Number.isFinite(integrity.forwardRowRatio)
        ? (100 * integrity.forwardRowRatio).toFixed(0)
        : '?';
      add(SEV.WARN,
        L('MT5 solo pasó al forward una parte de las configuraciones (las mejores)',
          'MT5 only passed part of the configurations to the forward (the best ones)'),
        L(`El export del forward trae ${integrity.oosRows.toLocaleString(localeTag())} filas frente a ${integrity.isRows.toLocaleString(localeTag())} del export de la optimización (~${pct}\u00A0%). MT5 solo prueba en el forward las mejores pasadas según tu criterio de optimización, así que las mesetas y la fragilidad en forward se miden solo entre candidatas ya preseleccionadas: la validación queda sesgada al alza. Interpreta el forward con cautela.`,
          `The forward export has ${integrity.oosRows.toLocaleString(localeTag())} rows versus ${integrity.isRows.toLocaleString(localeTag())} in the optimization export (~${pct}%). MT5 only tests the best passes by your optimization criterion in the forward, so plateaus and forward fragility are measured only among already pre-selected candidates: validation is biased upward. Treat the forward with caution.`), 'integrity');
      tableOnly();
    }
    if (integrity.duplicateIds > 0) {
      add(SEV.WARN, L(`${integrity.duplicateIds} identificadores duplicados`, `${integrity.duplicateIds} duplicate identifiers`),
        L('Se ha conservado la primera aparición de cada pasada duplicada.',
          'The first appearance of each duplicate Pass was kept.'), 'integrity');
    }
    if (integrity.unmatchedIs > 0 && integrity.unmatchedUsedForDiscovery) {
      add(SEV.INFO, L(`${integrity.unmatchedIs} ${pl(integrity.unmatchedIs, 'pasada', 'pasadas')} sin forward`, `${integrity.unmatchedIs} ${pl(integrity.unmatchedIs, 'pass', 'passes')} without forward`),
        L('MT5 solo prueba en el forward las mejores pasadas. Las demás se usan para buscar las mesetas en el periodo optimizado, porque así se ven también las vecinas que fallan tus mínimos, pero no cuentan como validadas en el forward.',
          'MT5 only tests the best passes on the forward. The rest are used to find the plateaus on the optimized period, because that way the neighbors that fail your minimums are seen too, but they do not count as validated on the forward.'), 'integrity');
    } else if (integrity.unmatchedIs > 0) {
      const sev = (integrity.isRows > 0 && integrity.unmatchedIs / integrity.isRows > 0.05) ? SEV.WARN : SEV.INFO;
      add(sev, L(`${integrity.unmatchedIs} ${pl(integrity.unmatchedIs, 'pasada', 'pasadas')} sin pareja`, `${integrity.unmatchedIs} ${pl(integrity.unmatchedIs, 'unpaired pass', 'unpaired passes')}`),
        integrity.unmatchedIs === 1
          ? L('Esta fila existe en un archivo y no en el otro, y se ha descartado del análisis.',
            'This row exists in one file and not the other, and was discarded from the analysis.')
          : L('Estas filas existen en un archivo y no en el otro, y se han descartado del análisis.',
            'These rows exist in one file and not the other, and were discarded from the analysis.'), 'integrity');
    }
    if (integrity.duplicateParamVectors > 0) {
      const base = integrity.matchedRows || integrity.isRows || 0;
      const sev = base > 0 && integrity.duplicateParamVectors / base > 0.05 ? SEV.WARN : SEV.INFO;
      add(sev, L(`${integrity.duplicateParamVectors} ${pl(integrity.duplicateParamVectors, 'pasada', 'pasadas')} con parámetros repetidos`, `${integrity.duplicateParamVectors} ${pl(integrity.duplicateParamVectors, 'pass', 'passes')} with repeated parameters`),
        L('Varias pasadas tienen exactamente los mismos valores de parámetros, algo habitual en la optimización genética. Se analiza una sola por configuración. Si son muchas, revisa en «Columnas detectadas» que ningún parámetro se haya tomado por una métrica.',
          'Several passes have exactly the same parameter values, which is common in genetic optimization. Only one per configuration is analyzed. If there are many, check in "Detected columns" that no parameter was taken for a metric.'), 'integrity');
    }
  }

  /*
   * ---- Fuerza de la evidencia
   *
   * Lo que se califica es NUESTRO PROPIO ANALISIS, no la estrategia del usuario. El
   * titular describe que se ha encontrado y cuanto lo sostiene; nunca dice que hacer.
   */
  const criticas = findings.filter((f) => f.severity === SEV.CRITICAL);
  const warnings = findings.filter((f) => f.severity === SEV.WARN);
  const regiones = plateaus.length;
  // «Buena» y «sólida» se ganan con criterios que se cumplen, no con la ausencia de todo
  // aviso: la meseta recomendada tiene configuraciones probadas en el forward y no cae por
  // debajo de lo crítico allí, y la recomendación se ha repetido moviendo los umbrales.
  // Los avisos que quedan (los que no son solo de la tabla) dicen cuánto falta: ninguno,
  // «sólida»; uno, «buena», siempre que no sea el de la estabilidad frente a los umbrales
  // (el tercer examen del banco dio «buena» sin ventaja real justo con ese aviso). Lo
  // calibra bench/ (enmiendas del 2026-10-09 en PREREGISTRO.md).
  const bpv = bestPlateau && bestPlateau.oosValidation;
  const validated = Boolean(hasForward && selectionMode === 'isThenOos' && bpv && bpv.withForward > 0
    && stabilityCheck && stabilityCheck.draws);
  const blocking = warnings.filter((f) => f.scope !== 'table');

  let level;
  let headline;
  let summary;
  if (underpowered) {
    // No es un suspenso: es que no hay masa para afirmar nada en ninguna direccion.
    level = LEVELS.INSUFFICIENT;
    headline = L('Evidencia insuficiente', 'Insufficient evidence');
    const where = hasForward && selectionMode === 'isThenOos';
    summary = L(`Con ${searchPassCount} ${pl(searchPassCount, 'configuración', 'configuraciones')} por encima de tus mínimos${where ? ' en el periodo optimizado' : ''} no hay masa suficiente para que pudiera existir una meseta: harían falta al menos ${viableNeededForPlateau}. Esto no dice nada sobre tu EA: dice que estos datos no permiten pronunciarse en ninguna dirección.`,
      `With ${searchPassCount} ${pl(searchPassCount, 'configuration', 'configurations')} above your minimums${where ? ' on the optimized period' : ''} there is not enough mass for a plateau to exist; at least ${viableNeededForPlateau} would be needed. This says nothing about your EA: it says these data do not support a conclusion either way.`);
  } else if (criticas.length) {
    level = LEVELS.WEAK;
    headline = regiones
      ? L('Evidencia débil (hay meseta)', 'Weak evidence (plateau found)')
      : L('Evidencia débil', 'Weak evidence');
    summary = regiones
      ? L(`Sí hay ${regiones === 1 ? 'una meseta' : `${regiones} mesetas`} en tus datos (abajo). Lo que es débil no es «que no exista meseta», sino el peso que puedes darle: ${criticas.length === 1 ? 'hay una limitación seria' : `hay ${criticas.length} limitaciones serias`} en lo que la sostiene. Tenlo en cuenta antes de decidir.`,
          `There ${regiones === 1 ? 'is a plateau' : `are ${regiones} plateaus`} in your data (below). What is weak is not “that no plateau exists”, but how much weight you can give it: ${criticas.length === 1 ? 'there is one serious limitation' : `there are ${criticas.length} serious limitations`} in what supports it. Keep that in mind before deciding.`)
      : L('No hay ninguna meseta en estos datos, solo configuraciones sueltas. Abajo tienes las mejores, pero un punto aislado puede ser suerte.',
          'There is no plateau in these data, only isolated configurations. Below you have the best ones, but an isolated point may be luck.');
  } else if (validated && blocking.length === 0) {
    level = LEVELS.STRONG;
    headline = L('Evidencia sólida', 'Solid evidence');
    summary = L(`${regiones === 1 ? 'La meseta propuesta' : 'Las mesetas propuestas'} se ${regiones === 1 ? 'apoya' : 'apoyan'} en vecinas que también cumplen tus mínimos, ${regiones === 1 ? 'aguanta' : 'aguantan'} en el forward y la recomendación se mantiene al mover los umbrales. Es lo máximo que el periodo optimizado y el forward pueden respaldar; un periodo no visto puede mantenerla o bajarla.`,
      `${regiones === 1 ? 'The proposed plateau rests' : 'The proposed plateaus rest'} on neighbors that also clear your minimums, ${regiones === 1 ? 'holds' : 'hold'} on the forward, and the recommendation holds when thresholds are moved. That is the most the optimized period and the forward can support; an unseen period can keep it there or lower it.`);
  } else if (validated && blocking.length === 1 && stabilityCheck.regionRate >= 0.8) {
    level = LEVELS.GOOD;
    headline = L('Evidencia buena', 'Good evidence');
    summary = L(`${regiones === 1 ? 'La meseta propuesta' : 'Las mesetas propuestas'} se ${regiones === 1 ? 'apoya' : 'apoyan'} en vecinas que también cumplen tus mínimos, ${regiones === 1 ? 'aguanta' : 'aguantan'} en el forward y la recomendación se mantiene al mover los umbrales. Se queda a un paso de sólida: hay un aviso que conviene leer antes de decidir.`,
      `${regiones === 1 ? 'The proposed plateau rests' : 'The proposed plateaus rest'} on neighbors that also clear your minimums, ${regiones === 1 ? 'holds' : 'hold'} on the forward, and the recommendation holds when thresholds are moved. It stays one step short of strong: there is one warning worth reading before deciding.`);
  } else {
    // Con avisos sobre la meseta, o sin forward con el que validarla.
    level = LEVELS.MODERATE;
    headline = L('Evidencia moderada', 'Moderate evidence');
    summary = warnings.length
      ? L(`Hay ${regiones === 1 ? 'una meseta' : `${regiones} mesetas`} con soporte real, pero con ${warnings.length === 1 ? 'un aviso que conviene leer' : `${warnings.length} avisos que conviene leer`} antes de decidir.`,
        `There ${regiones === 1 ? 'is one plateau' : `are ${regiones} plateaus`} with real support, but with ${warnings.length === 1 ? 'one warning worth reading' : `${warnings.length} warnings worth reading`} before deciding.`)
      : L(`Hay ${regiones === 1 ? 'una meseta' : `${regiones} mesetas`} con soporte real, pero no se ha podido validar en el forward.`,
        `There ${regiones === 1 ? 'is one plateau' : `are ${regiones} plateaus`} with real support, but it could not be validated on the forward.`);
  }

  /*
   * El siguiente paso se formula como una opcion, no como una orden. La diferencia
   * importa: "puedes hacer X" describe un camino; "no hagas Y" decide por el usuario.
   */
  let nextStep;
  if (level === LEVELS.INSUFFICIENT) {
    nextStep = L('Para que estos datos puedan decir algo, amplía el rango de los parámetros, añade valores intermedios o relaja los mínimos, y vuelve a optimizar. Con lo que hay ahora, cualquier conclusión sería inventada.',
      'For these data to say anything, widen the parameter ranges, add intermediate values or relax the minimums, and optimize again. With what is here now, any conclusion would be made up.');
  } else if (!bestPlateau) {
    nextStep = L('Refina la optimización antes de seguir.', 'Refine the optimization before continuing.');
  } else if (Number.isFinite(fragility) && fragility >= 0.5) {
    nextStep = L('Ignora el orden de tu tabla de MT5: aquí engaña. La meseta de abajo sigue siendo el hallazgo; exporta el .set de la configuración representativa y pruébala en un tramo que no hayas usado ni para optimizar ni para validar. Fija los criterios de aceptación ANTES de mirar el resultado.',
      'Ignore the order of your MT5 table: here it misleads. The plateau below is still the finding; export the .set of the representative configuration and test it on a stretch you have not used for optimization or validation. Set your acceptance criteria BEFORE looking at the result.');
  } else {
    nextStep = L('Exporta el .set de la configuración representativa y pruébala en un periodo que no hayas usado ni para optimizar ni para validar. Fija los criterios de aceptación ANTES de mirar el resultado.',
      'Export the .set of the representative configuration and test it on a period you have not used for optimization or validation. Set your acceptance criteria BEFORE looking at the result.');
  }

  return {
    level, headline, summary, findings, nextStep,
    counts: { critical: criticas.length, warnings: warnings.length },
  };
}

/** Motivos de descarte de picos (bilingües; se pueden regenerar al cambiar idioma). */
/** Traduce un fallo de minimos del motor ('PF < 1.2', 'operaciones < 50'…) al idioma activo. */
function gateFailLabel(token) {
  let m = /^PF < (.+)$/.exec(token);
  if (m) return L(`factor de beneficio < ${fmt(Number(m[1]), 2)}`, `profit factor < ${fmt(Number(m[1]), 2)}`);
  m = /^DD > (.+)%$/.exec(token);
  if (m) return `drawdown > ${fmt(Number(m[1]), 0)}${pctSign()}`;
  m = /^operaciones < (.+)$/.exec(token);
  if (m) return L(`operaciones < ${m[1]}`, `trades < ${m[1]}`);
  if (token === 'beneficio <= 0') return L('beneficio ≤ 0', 'profit ≤ 0');
  return token;
}

/** Nombre corto de cada mínimo, para las etiquetas de la tabla de descartes. */
function gateShortName(token) {
  if (/^PF /.test(token)) return L('factor de beneficio', 'profit factor');
  if (/^DD /.test(token)) return 'drawdown';
  if (/^operaciones /.test(token)) return L('operaciones', 'trades');
  if (/^beneficio /.test(token)) return L('beneficio', 'profit');
  return token;
}

/**
 * Por qué no se respalda un pico, motivo a motivo: `tag` es la etiqueta breve que va en
 * la tabla (lo que distingue a esa fila) y `detail` la frase completa, con las cifras.
 */
export function peakRejectTags(p, opts = {}) {
  const minSupport = opts.minSupport ?? 4;
  const plateauFloorQuality = opts.plateauFloorQuality ?? 0.42;
  const out = [];
  const tagged = (tag, detail) => out.push({ tag, detail });
  if (p.st.support < minSupport) {
    tagged(L(`Solo ${p.st.support} ${p.st.support === 1 ? 'vecina' : 'vecinas'}`, `Only ${p.st.support} ${p.st.support === 1 ? 'neighbor' : 'neighbors'}`),
      p.st.support === 1
        ? L('solo 1 vecina probada', 'only 1 neighbor tested')
        : L(`solo ${p.st.support} ${pl(p.st.support, 'vecina probada', 'vecinas probadas')}`, `only ${p.st.support} ${pl(p.st.support, 'neighbor tested', 'neighbors tested')}`));
  }
  if (Number.isFinite(p.st.peakZ) && p.st.peakZ > 2) {
    tagged(L('Pico de suerte', 'Lucky peak'),
      L('sobresale muy por encima de sus vecinas: típico de un pico de suerte', 'stands far above its neighbors: typical of a lucky peak'));
  }
  if (Number.isFinite(p.st.cliff) && p.st.cliff > 1.5) {
    tagged(L('Se desploma a un paso', 'Collapses one step away'),
      L('a un solo paso, el resultado se desploma', 'one step away, the result collapses'));
  }
  const rawIs = p.record.failsIs || [];
  const rawOos = p.record.failsOos || [];
  if (!p.record.passes || rawOos.length) {
    // Con el periodo delante: una configuracion puede cumplir en el in-sample y fallar
    // solo en el forward, y esa diferencia es justo lo que interesa ver.
    const failsIs = rawIs.map(gateFailLabel);
    const failsOos = rawOos.map(gateFailLabel);
    const parts = [];
    if (failsIs.length) parts.push(`${L('periodo optimizado', 'optimized period')}: ${failsIs.join(', ')}`);
    if (failsOos.length) parts.push(`forward: ${failsOos.join(', ')}`);
    if (parts.length) {
      const names = [...new Set(rawIs.map(gateShortName))];
      const oosOnly = [...new Set(rawOos.map(gateShortName))].filter((n) => !names.includes(n));
      const tag = [names.join(', '), oosOnly.length ? `forward: ${oosOnly.join(', ')}` : ''].filter(Boolean).join(' · ');
      tagged(L(`Mínimos: ${tag}`, `Minimums: ${tag}`),
        L(`no cumple tus mínimos (${parts.join(' · ')})`, `does not meet your minimums (${parts.join(' · ')})`));
    }
  }
  if (Number.isFinite(p.st.fracPass) && p.st.fracPass < 0.9) {
    tagged(L(`${fmt(100 * p.st.fracPass, 0)}\u00A0% de vecinas cumple`, `${fmt(100 * p.st.fracPass, 0)}% of neighbors pass`),
      L(`solo el ${fmt(100 * p.st.fracPass, 0)}\u00A0% de sus vecinas cumple tus mínimos`,
        `only ${fmt(100 * p.st.fracPass, 0)}% of its neighbors clear the minimums`));
  }
  if (Number.isFinite(p.st.q25) && p.st.q25 < plateauFloorQuality) {
    tagged(L('Vecinas flojas', 'Weak neighbors'),
      L(`sus vecinas más flojas se quedan en ${fmt(p.st.q25, 2)} de calidad (una meseta pide ${fmt(plateauFloorQuality, 2)})`,
        `its weakest neighbors stay at ${fmt(p.st.q25, 2)} quality (a plateau needs ${fmt(plateauFloorQuality, 2)})`));
  }
  if (!out.length) {
    // Si su robustez sí llega, lo que falla es que su zona conexa tiene menos configuraciones
    // de las que pide una meseta (engine.js, plateauMinSize): «poca robustez» era falso.
    const minRobust = opts.plateauMinRobust ?? 50;
    const minSize = opts.plateauMinSize ?? 3;
    if (Number.isFinite(p.robust) && p.robust >= minRobust) {
      tagged(L('Zona demasiado pequeña', 'Zone too small'),
        L(`cumple lo que se pide a una meseta, pero forma una zona de menos de ${minSize} configuraciones así`,
          `it meets what a plateau requires, but it forms a zone of fewer than ${minSize} such configurations`));
    } else {
      tagged(L('Poca robustez', 'Low robustness'),
        L('tiene vecinas suficientes, pero no llega a la robustez que se pide a una meseta',
          'has enough neighbors but does not reach the robustness required of a plateau'));
    }
  }
  return out;
}

export function peakRejectReasons(p, opts = {}) {
  return peakRejectTags(p, opts).map((t) => t.detail);
}

/**
 * Regenera el veredicto (y textos de picos) en el idioma activo, sin reanalizar.
 * Usar tras setLocale() cuando ya hay un informe en pantalla.
 */
export function rebuildLocalizedCopy(analysis) {
  if (!analysis || !analysis.meta) return analysis;
  const m = analysis.meta;
  const s = analysis.stats || {};
  const plateaus = analysis.plateaus || [];
  const bestPlateau = plateaus[0] || null;
  const tied = plateaus.filter((p) => p.tied);
  const tiedList = tied.length > 1 ? tied : [];
  const verdict = buildVerdict({
    gatePassCount: m.gatePassCount,
    discoverPassCount: m.discoverPassCount,
    searchPassCount: m.searchPassCount,
    forwardCount: m.forwardCount,
    missingMetrics: m.missingMetrics,
    unrecognizedColumns: m.unrecognizedColumns,
    plateauForwardCritical: m.plateauForwardCritical,
    total: m.total,
    plateaus,
    fragility: s.fragility,
    fragilityQuality: s.fragilityQuality,
    fragilityMargin: s.fragilityMargin,
    fragilityFolds: s.fragilityFolds,
    fragilityAsymmetry: s.fragilityAsymmetry,
    fragilityWorstDirection: s.fragilityWorstDirection,
    sharpeTest: s.sharpeTest,
    spearman: s.spearmanCriterion,
    spearmanQuality: s.spearmanQuality,
    coverage: m.coverage,
    searchCoverage: m.searchCoverage,
    medianSupport: m.medianSupport,
    periodRatio: m.periodRatio,
    integrity: analysis.integrity,
    sampling: m.sampling,
    selectionMode: m.selectionMode,
    inversions: analysis.inversions || [],
    periodComparison: analysis.periodComparison,
    hasForward: m.hasForward,
    underpowered: m.underpowered,
    viableNeededForPlateau: m.viableNeededForPlateau,
    stabilityCheck: s.stabilityCheck,
    degreesOfFreedom: m.degreesOfFreedom,
    gateInfluence: m.gateInfluence,
    irregularGrids: m.irregularGrids,
    rescuedDims: m.rescuedDims,
    offsetsComplete: m.offsetsComplete,
    spansIrregular: bestPlateau ? bestPlateau.spansIrregular : [],
    tiedCount: m.tiedCount != null ? m.tiedCount : tiedList.length,
    tiedRanks: m.tiedRanks || tiedList.map((p) => p.rank),
    boundaryWorst: bestPlateau ? bestPlateau.boundary : [],
    invertedRisk: bestPlateau ? bestPlateau.invertedRisk : [],
    alternativePlateau: bestPlateau && bestPlateau.invertedRisk && bestPlateau.invertedRisk.length
      ? plateaus.find((p) => p.rank !== bestPlateau.rank && !(p.invertedRisk && p.invertedRisk.length)) || null
      : null,
    bestPlateau,
  });
  const peakOpts = {
    minSupport: (m.policy && m.policy.minSupport) || 4,
    plateauFloorQuality: 0.42,
  };
  // ENGINE opts live on analysis via meta if we stored them; use defaults matching engine.
  const peaks = (analysis.peaks || []).map((p) => ({
    ...p,
    reasons: peakRejectReasons(p, peakOpts),
    tags: peakRejectTags(p, peakOpts),
  }));
  return { ...analysis, verdict, peaks };
}

export { SEV };
