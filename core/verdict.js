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

import { L, localeTag } from '../js/i18n.js';

/** Numero en el formato del idioma activo (1,20 en ES, 1.20 en EN). */
const fmt = (v, d = 2) => (Number.isFinite(v)
  ? new Intl.NumberFormat(localeTag(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v)
  : '—');
/** Cifra observada de un minimo, con las unidades y decimales de ese minimo. */
const gateValue = (name, v) => (name === 'drawdown' ? `${fmt(v, 1)} %` : name === 'trades' ? fmt(v, 0) : fmt(v, 2));

export const LEVELS = {
  STRONG: 'strong',            // region amplia y bien sostenida
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
    add(SEV.CRITICAL, L('Ninguna configuración cumple tus mínimos en el forward', 'No configuration meets your minima in the forward'),
      L(`${searchPassCount.toLocaleString(localeTag())} configuraciones los cumplen en el in-sample, pero ninguna en el forward. Con estos mínimos, lo que se encuentra en el in-sample no se sostiene fuera de él.`,
        `${searchPassCount.toLocaleString(localeTag())} configurations meet them in-sample, but none in the forward. With these minima, what is found in-sample does not hold outside it.`), null);
  } else if (!gatePassCount) {
    add(SEV.CRITICAL, L('Ninguna configuración pasa los mínimos', 'No configuration passes the minimum gates'),
      hasForward
        ? L(`De ${total.toLocaleString(localeTag())} configuraciones, ninguna cumple tus mínimos en el in-sample y en el forward. Con estos mínimos no hay nada que seleccionar.`,
          `Of ${total.toLocaleString(localeTag())} configurations, none meet your minima in both in-sample and forward. With these minima there is nothing to select.`)
        : L(`De ${total.toLocaleString(localeTag())} configuraciones, ninguna cumple tus mínimos. Con estos mínimos no hay nada que seleccionar.`,
          `Of ${total.toLocaleString(localeTag())} configurations, none meet your minima. With these minima there is nothing to select.`), null);
  } else if (gatePassCount / fwdBase < 0.02) {
    add(SEV.CRITICAL, L('Solo un resquicio del espacio sobrevive', 'Only a sliver of the space survives'),
      L(`Apenas ${gatePassCount} de ${fwdBase.toLocaleString(localeTag())} configuraciones${hasForward ? ' con forward' : ''} (${fmt((100 * gatePassCount / fwdBase), 1)}%) pasan los mínimos. Una estrategia que solo funciona en un punto concreto del espacio de parámetros casi siempre es un artefacto del optimizador.`,
        `Barely ${gatePassCount} of ${fwdBase.toLocaleString(localeTag())} configurations${hasForward ? ' with forward' : ''} (${fmt((100 * gatePassCount / fwdBase), 1)}%) pass the gates. A strategy that only works at one specific point in parameter space is almost always an optimizer artifact.`), null);
  }

  /*
   * Densidad de evidencia (ops / parámetros ajustados). No son "grados de libertad"
   * formales: condicionan la lectura de todo lo demas.
   */
  if (degreesOfFreedom && Number.isFinite(degreesOfFreedom.perParam) && degreesOfFreedom.params > 0) {
    const d = degreesOfFreedom;
    const per = d.perParam;
    const periodoEs = d.basedOn === 'forward' ? 'el forward' : 'el in-sample';
    const periodoEn = d.basedOn === 'forward' ? 'the forward' : 'the in-sample';
    const tradesN = Math.round(d.basedOn === 'forward' ? d.tradesOos : d.tradesIs).toLocaleString(localeTag());
    const extraEs = Number.isFinite(d.trialsPerTrade) && d.trialsPerTrade > 1
      ? ` Además has probado ${fmt(d.trialsPerTrade, 1)} configuraciones por cada operación disponible para distinguirlas: hay más alternativas que datos con los que separarlas.`
      : '';
    const extraEn = Number.isFinite(d.trialsPerTrade) && d.trialsPerTrade > 1
      ? ` You have also tried ${fmt(d.trialsPerTrade, 1)} configurations for each trade available to tell them apart: there are more alternatives than data to separate them.`
      : '';
    if (per < 15) {
      add(SEV.CRITICAL, L(`Poca evidencia: ~${fmt(per, 0)} operaciones por parámetro`, `Thin evidence: ~${fmt(per, 0)} trades per parameter`),
        L(`Has optimizado ${d.params} parámetros y en ${periodoEs} hay ${tradesN} operaciones: ~${fmt(per, 0)} por parámetro. Con esa proporción, la superficie que medimos es mayoritariamente ruido. No es un defecto de tu EA: faltan datos para tantos parámetros a la vez. Reduce parámetros o alarga el periodo.${extraEs}`,
          `You optimized ${d.params} parameters and in ${periodoEn} there are ${tradesN} trades: ~${fmt(per, 0)} per parameter. At that ratio, the surface we measure is mostly noise. Not an EA flaw: there is not enough data for so many parameters at once. Reduce parameters or lengthen the period.${extraEn}`), null);
    } else if (per < 50) {
      add(SEV.WARN, L(`Evidencia limitada: ~${fmt(per, 0)} operaciones por parámetro`, `Limited evidence: ~${fmt(per, 0)} trades per parameter`),
        L(`${d.params} parámetros optimizados frente a ${tradesN} operaciones en ${periodoEs}. Todo lo que sigue debe leerse como provisional.${extraEs}`,
          `${d.params} optimized parameters versus ${tradesN} trades in ${periodoEn}. Everything that follows should be read as provisional.${extraEn}`), null);
    } else if (per >= 100) {
      add(SEV.OK, L(`~${fmt(per, 0)} operaciones por parámetro ajustado`, `~${fmt(per, 0)} trades per fitted parameter`),
        L(`${d.params} parámetros frente a ${tradesN} operaciones en ${periodoEs}. Hay bastantes operaciones por parámetro: la muestra no es el punto débil.`,
          `${d.params} parameters versus ${tradesN} trades in ${periodoEn}. There are plenty of trades per parameter: sample size is not the weak point.`), null);
    }
  }

  if (!plateaus.length && underpowered) {
    // No es lo mismo "no hay meseta" que "no hay datos para saberlo".
    add(SEV.CRITICAL, L('El conjunto es demasiado pequeño para pronunciarse', 'The set is too small to pronounce on'),
      L(`Solo ${gatePassCount} configuraciones superan los mínimos, y para que pudiera existir una meseta harían falta al menos ${viableNeededForPlateau}: una región estable necesita configuraciones con vecinos que también cumplan, es decir, necesita interior. Esto NO dice que tu EA sea malo; dice que con estos datos no se puede afirmar nada en ninguna dirección. Amplía el rango de los parámetros, añade valores intermedios o relaja los mínimos, y vuelve a optimizar.`,
        `Only ${gatePassCount} configurations clear the minima, and for a plateau to exist you would need at least ${viableNeededForPlateau}: a stable region needs configurations whose neighbors also pass, that is, it needs interior. This does NOT say your EA is bad; it says that with these data nothing can be asserted in either direction. Widen the parameter ranges, add intermediate values or relax the minima, and optimize again.`), null);
  } else if (!plateaus.length) {
    add(SEV.CRITICAL, L('No se ha encontrado ninguna meseta', 'No plateau was found'),
      L('No existe ninguna región conexa de configuraciones que superen el umbral de robustez con soporte suficiente. Con datos suficientes para detectarla, lo que hay son puntos sueltos, y un punto suelto no es un sistema: es una coincidencia.',
        'There is no connected region of configurations that clear the robustness threshold with enough support. With enough data to detect one, what remains are isolated points, and an isolated point is not a system: it is a coincidence.'), null);
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
      add(SEV.WARN, L(`Tu ranking MT5 (Result) no se sostiene: falla el ${fmt((100 * fragility), 0)}%`, `Your MT5 ranking (Result) does not hold: fails ${fmt((100 * fragility), 0)}%`),
        L(`Al quedarte con la mejor fila según la columna Result de un periodo, cae por debajo de la mediana del otro el ${fmt((100 * fragility), 0)}% de las veces. Eso condena el orden de tu tabla, no la región de calidad que propone Orometra. Ignora el ranking y quédate con la meseta de abajo.`,
          `When you keep the best row by the Result column of one period, it falls below the median of the other ${fmt((100 * fragility), 0)}% of the time. That condemns your table order, not the quality region Orometra proposes. Ignore the ranking and keep the plateau below.`), 'stats');
    } else if (fragility >= 0.5) {
      add(SEV.CRITICAL, L(`La regla "primera de Result" falla el ${fmt((100 * fragility), 0)}% de las veces`, `The "top Result row" rule fails ${fmt((100 * fragility), 0)}% of the time`),
        L(`Elegir por la columna Result falla el ${fmt((100 * fragility), 0)}% al cruzar periodos, y no hay región amplia donde refugiarse. Por encima del 50% ese ranking vale menos que una moneda.`,
          `Choosing by the Result column fails ${fmt((100 * fragility), 0)}% across periods, and there is no broad region to fall back on. Above 50% that ranking is worth less than a coin flip.`), 'stats');
    } else if (fragility >= 0.3) {
      add(SEV.WARN, L(`Fragilidad del ranking Result: ${fmt((100 * fragility), 0)}%`, `Result-ranking fragility: ${fmt((100 * fragility), 0)}%`),
        L('El orden de Result conserva algo de valor, pero no el suficiente para fiarte de la cima. Selecciona por meseta.',
          'Result order retains some value, but not enough to trust the top. Select by plateau.'), 'stats');
    } else {
      add(SEV.OK, L(`Fragilidad del ranking Result: ${fmt((100 * fragility), 0)}%`, `Result-ranking fragility: ${fmt((100 * fragility), 0)}%`),
        L('El orden de Result de un periodo conserva valor predictivo en el otro.',
          'Result order in one period retains predictive value in the other.'), 'stats');
    }
  }

  if (Number.isFinite(fragilityQuality)) {
    if (fragilityQuality >= 0.5) {
      add(SEV.WARN, L(`Fragilidad de la calidad Orometra: ${fmt((100 * fragilityQuality), 0)}%`, `Orometra quality fragility: ${fmt((100 * fragilityQuality), 0)}%`),
        L('Aunque no uses Result, la calidad reconstruida (PF/DD/ops…) también pierde orden al cruzar periodos. La meseta sigue siendo mejor que la cima, pero el periodo no visto es imprescindible.',
          'Even without Result, rebuilt quality (PF/DD/trades…) also loses rank across periods. The plateau is still better than the peak, but the unseen period is essential.'), 'stats');
    } else if (fragilityQuality < 0.3) {
      add(SEV.OK, L(`Fragilidad de la calidad Orometra: ${fmt((100 * fragilityQuality), 0)}%`, `Orometra quality fragility: ${fmt((100 * fragilityQuality), 0)}%`),
        L('La calidad reconstruida conserva orden entre periodos mejor que un ranking frágil.',
          'Rebuilt quality keeps order across periods better than a fragile ranking.'), null);
    }
  }

  if (selectionMode === 'isThenOos' && hasForward) {
    add(SEV.INFO, L('Mesetas descubiertas in-sample y validadas en forward', 'Plateaus discovered in-sample and validated on forward'),
      L('El motor busca zonas con la calidad y los mínimos del in-sample. El forward no crea ni amplía la meseta: la valida después, y si muchas de sus configuraciones fallan tus mínimos en forward, esa meseta baja de puesto. Pesa menos en la elección que si puntuara, pero no es un tramo ciego.',
        'The engine finds regions with in-sample quality and minima. The forward neither creates nor widens the plateau: it validates it afterwards, and if many of its configurations fail your minima on the forward, that plateau drops in rank. It weighs less in the choice than if it scored, but it is not a blind period.'), null);
    const v = bestPlateau && bestPlateau.oosValidation;
    const partial = v && Number.isFinite(v.withForward) && v.withForward < v.size;
    const basis = partial
      ? L(` (de las ${v.withForward} de sus ${v.size} configuraciones que MT5 probó en el forward)`, ` (of the ${v.withForward} of its ${v.size} configurations that MT5 tested on the forward)`)
      : '';
    if (v && v.withForward === 0) {
      add(SEV.WARN, L('La meseta recomendada no tiene ninguna configuración probada en el forward', 'The recommended plateau has no configuration tested on the forward'),
        L('MT5 solo pasa al forward las mejores pasadas y ninguna de esta meseta estaba entre ellas. Trátala como provisional hasta probarla en un periodo no visto.',
          'MT5 only passes the best passes to the forward and none of this plateau was among them. Treat it as provisional until you test it on an unseen period.'), null);
    } else if (v && Number.isFinite(ctx.plateauForwardCritical) && v.passFrac < ctx.plateauForwardCritical) {
      add(SEV.CRITICAL, L(`La meseta recomendada no se sostiene en el forward: solo aguanta el ${fmt((100 * v.passFrac), 0)} %${basis}`, `The recommended plateau does not hold on the forward: only ${fmt((100 * v.passFrac), 0)}%${basis}`),
        L(`Menos de ${fmt(100 * ctx.plateauForwardCritical, 0)} de cada 100 configuraciones de la región cumplen tus mínimos en el forward. Una zona con ventaja real suele aprobarlo en casi todas; sin ventaja, una región entera puede aprobarlo a medias por pura suerte del periodo. No la uses sin probarla antes en un periodo no visto.`,
          `Fewer than ${fmt(100 * ctx.plateauForwardCritical, 0)} in 100 configurations in the region meet your minima on the forward. A zone with a real edge usually passes it in nearly all of them; without an edge, a whole region can half-pass it by pure luck of the period. Do not use it without first testing it on an unseen period.`), null);
    } else if (v && v.passFrac < 0.8) {
      add(SEV.WARN, L(`La meseta recomendada solo aguanta el ${fmt((100 * v.passFrac), 0)} % en forward${basis}`, `The recommended plateau only holds ${fmt((100 * v.passFrac), 0)}% on forward${basis}`),
        L('Una parte de la región falla los mínimos del forward. Trátala como provisional hasta probarla en un periodo no visto.',
          'Part of the region fails forward gates. Treat it as provisional until you test it on an unseen period.'), null);
    }
  } else if (selectionMode === 'joint' && hasForward) {
    add(SEV.INFO, L('Modo joint: el forward participa en la selección', 'Joint mode: forward takes part in selection'),
      L('Puertas y score usan min(IS, forward). Las cifras del forward ya están algo contaminadas.',
        'Gates and score use min(IS, forward). Forward figures are already somewhat contaminated.'), null);
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
      L(`Elegir por in-sample y validar en forward falla el ${fmt((100 * a), 0)} % de las veces; hacerlo al revés, el ${fmt((100 * b), 0)} %. Esa diferencia de ${fmt((100 * fragilityAsymmetry), 0)} puntos no la produce una ventaja real, que sería aproximadamente simétrica: la produce que uno de los dos tramos es más fácil o responde a otro régimen de mercado. Cualquier conclusión que saques depende de cuál te tocó, así que el periodo no visto deja de ser recomendable y pasa a ser imprescindible.`,
        `Choosing by in-sample and validating on forward fails ${fmt((100 * a), 0)}% of the time; doing it the other way, ${fmt((100 * b), 0)}%. That ${fmt((100 * fragilityAsymmetry), 0)}-point gap is not produced by a real edge, which would be roughly symmetric: it is produced by one of the two stretches being easier or responding to another market regime. Any conclusion you draw depends on which period fell where, so the unseen period stops being optional and becomes essential.`), 'stats');
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
          ? ` (tus límites son ${gateValue(g.name, g.limit)} en el in-sample y ${gateValue(g.name, g.limitOos)} en el forward; la mediana de lo que pasa está en ${gateValue(g.name, g.observed)} y ${gateValue(g.name, g.observedOos)})`
          : Number.isFinite(g.observed)
            ? ` (tu límite es ${gateValue(g.name, g.limit)}, y la mediana de lo que pasa está en ${gateValue(g.name, g.observed)}${g.name === 'drawdown' && hasForward ? ' en su peor periodo' : ''})`
            : '';
        return `<strong>${ETIQUETA_ES[g.name]}</strong>${obs}`;
      }).join('; ');
      const listEn = inertes.map((g) => {
        const obs = Number.isFinite(g.observed) && Number.isFinite(g.observedOos) && Number.isFinite(g.limitOos)
          ? ` (your limits are ${gateValue(g.name, g.limit)} in-sample and ${gateValue(g.name, g.limitOos)} on the forward; the median of what passes sits at ${gateValue(g.name, g.observed)} and ${gateValue(g.name, g.observedOos)})`
          : Number.isFinite(g.observed)
            ? ` (your limit is ${gateValue(g.name, g.limit)}, and the median of what passes sits at ${gateValue(g.name, g.observed)}${g.name === 'drawdown' && hasForward ? ' in its worst period' : ''})`
            : '';
        return `<strong>${ETIQUETA_EN[g.name]}</strong>${obs}`;
      }).join('; ');
      const domEs = dominante && dominante.sole > 0
        ? ` Quien decide aquí es <strong>${ETIQUETA_ES[dominante.name]}</strong>: descarta ${dominante.sole.toLocaleString(localeTag())} configuraciones él solo.`
        : '';
      const domEn = dominante && dominante.sole > 0
        ? ` What decides here is <strong>${ETIQUETA_EN[dominante.name]}</strong>: it alone discards ${dominante.sole.toLocaleString(localeTag())} configurations.`
        : '';
      add(SEV.INFO, L(`${inertes.length === 1 ? 'Uno de tus mínimos no está filtrando nada' : `${inertes.length} de tus mínimos no están filtrando nada`}`,
          `${inertes.length === 1 ? 'One of your minima is not filtering anything' : `${inertes.length} of your minima are not filtering anything`}`),
        L(`${listEs}. Ninguna configuración queda fuera únicamente por ese motivo, así que moverlo no cambiará el resultado.${domEs}`,
          `${listEn}. No configuration is excluded solely for that reason, so moving it will not change the outcome.${domEn}`), 'gates');
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
      add(SEV.OK, L(`La recomendación aguanta el ${fmt(pctRegion, 0)} % de las variaciones de umbral`, `The recommendation holds through ${fmt(pctRegion, 0)}% of threshold variations`),
        L(`Se ha repetido la búsqueda ${stabilityCheck.draws} veces moviendo al azar un ±20 % los umbrales internos (suelo de calidad, robustez mínima, soporte mínimo...). En el ${fmt(pctRegion, 0)} % de los casos la configuración ganadora sigue cayendo dentro de la MISMA región. La recomendación es una propiedad de tus datos, no del ajuste de la herramienta.`,
          `The search was repeated ${stabilityCheck.draws} times randomly shifting internal thresholds by ±20% (quality floor, minimum robustness, minimum support…). In ${fmt(pctRegion, 0)}% of cases the winning configuration still falls inside the SAME region. The recommendation is a property of your data, not of the tool's tuning.`), 'stability');
    } else if (stabilityCheck.regionRate >= 0.5) {
      add(SEV.WARN, L(`La recomendación solo aguanta el ${fmt(pctRegion, 0)} % de las variaciones de umbral`, `The recommendation only holds through ${fmt(pctRegion, 0)}% of threshold variations`),
        L(`Moviendo un ±20 % los umbrales internos, la región ganadora cambia en cerca de la mitad de los casos. Hay señal, pero la frontera entre las regiones candidatas es difusa: trata el Top como un conjunto de opciones equivalentes y decide por criterio operativo, no por el orden.`,
          `Shifting internal thresholds by ±20%, the winning region changes in roughly half the cases. There is signal, but the boundary between candidate regions is diffuse: treat the Top as a set of equivalent options and decide by operational criteria, not by rank.`), 'stability');
    } else {
      add(SEV.CRITICAL, L(`La recomendación no sobrevive a sus propios umbrales (${fmt(pctRegion, 0)} %)`, `The recommendation does not survive its own thresholds (${fmt(pctRegion, 0)}%)`),
        L(`Repitiendo la búsqueda ${stabilityCheck.draws} veces con los umbrales movidos un ±20 %, la región ganadora solo se mantiene el ${fmt(pctRegion, 0)} % de las veces. Eso significa que lo que sale primero depende de dónde pusimos nosotros los cortes, no de la forma de tu superficie de parámetros. Dicho de otro modo: lo que sale primero aquí es una coincidencia de calibración, no una propiedad de tus datos.`,
          `Repeating the search ${stabilityCheck.draws} times with thresholds shifted ±20%, the winning region holds only ${fmt(pctRegion, 0)}% of the time. That means what comes first depends on where we placed the cuts, not on the shape of your parameter surface. In other words: what comes first here is a calibration coincidence, not a property of your data.`), 'stability');
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
        add(SEV.OK, L(`La recomendación aguanta el ${fmt(p, 0)} % de las variaciones de TUS mínimos`, `The recommendation holds through ${fmt(p, 0)}% of YOUR minima variations`),
          L(`Moviendo un ±20 % el factor de beneficio exigido, el drawdown máximo y el número mínimo de operaciones, la configuración ganadora sigue cayendo en la misma región. No depende de haber acertado con unos mínimos concretos.`,
            `Shifting the required profit factor, maximum drawdown and minimum trade count by ±20%, the winning configuration still falls in the same region. It does not depend on having hit particular minima.`), 'stability');
      } else if (gs.regionRate >= 0.5) {
        add(SEV.WARN, L(`Tus mínimos mueven la recomendación (aguanta el ${fmt(p, 0)} %)`, `Your minima move the recommendation (it holds ${fmt(p, 0)}%)`),
          L(`Moviendo un ±20 % los mínimos que has configurado, la región ganadora cambia en cerca de la mitad de los casos. Antes de decidir, prueba a subir y bajar el factor de beneficio exigido y mira si te sigue recomendando lo mismo: si no, lo que estás eligiendo es tu umbral, no una propiedad de tu EA.`,
            `Shifting the minima you configured by ±20%, the winning region changes in roughly half the cases. Before deciding, try raising and lowering the required profit factor and see whether it still recommends the same thing: if not, what you are choosing is your threshold, not a property of your EA.`), 'stability');
      } else {
        add(SEV.CRITICAL, L(`La recomendación depende de los mínimos que elijas (${fmt(p, 0)} %)`, `The recommendation depends on the minima you choose (${fmt(p, 0)}%)`),
          L(`Con los mínimos movidos un ±20 %, la región ganadora solo se mantiene el ${fmt(p, 0)} % de las veces. Es decir: quien está decidiendo qué configuración sale recomendada es el umbral que has escrito, no la forma de tu superficie de parámetros. Cambiar el factor de beneficio exigido de 1,15 a 1,25 te devolvería otra respuesta distinta, y ninguna de las dos tendría más derecho que la otra.`,
            `With minima shifted ±20%, the winning region holds only ${fmt(p, 0)}% of the time. That is: what decides which configuration is recommended is the threshold you wrote, not the shape of your parameter surface. Changing the required profit factor from 1.15 to 1.25 would return a different answer, and neither would have more claim than the other.`), 'stability');
      }
    } else if (stabilityCheck.gatesSkipped) {
      add(SEV.INFO, L('No se ha podido auditar el efecto de tus mínimos', 'The effect of your minima could not be audited'),
        L('Comprobar cómo cambia la recomendación al mover los mínimos exige rehacer la vecindad decenas de veces, y con un conjunto de este tamaño habría hecho el análisis demasiado lento. Los umbrales internos sí se han auditado.',
          'Checking how the recommendation changes when minima move requires rebuilding the neighborhood dozens of times, and with a set of this size it would have made the analysis too slow. The internal thresholds have been audited.'), 'stability');
    }
  }

  if (sharpeTest && Number.isFinite(sharpeTest.observedMax) && Number.isFinite(sharpeTest.chanceMax)) {
    const { observedMax, chanceMax, trials } = sharpeTest;
    // El umbral se calcula con las pruebas EFECTIVAS (zonas distintas del espacio), no
    // con todas las pasadas: hay que decir el número que de verdad se usa.
    const eff = Number.isFinite(sharpeTest.effectiveTrials) ? sharpeTest.effectiveTrials : trials;
    const n = (v) => v.toLocaleString(localeTag());
    const howMany = eff < trials
      ? L(`${n(eff)} pruebas efectivas (las zonas distintas que cubren tus ${n(trials)} pasadas: las configuraciones vecinas no son pruebas independientes)`,
        `${n(eff)} effective trials (the distinct zones covered by your ${n(trials)} passes: neighboring configurations are not independent trials)`)
      : L(`${n(eff)} pruebas`, `${n(eff)} trials`);
    if (observedMax <= chanceMax) {
      add(SEV.CRITICAL, L('El mejor Sharpe no supera el umbral del azar', 'Best Sharpe does not beat the chance threshold'),
        L(`Con ${howMany}, el Sharpe máximo esperable sin ninguna ventaja real es ${fmt(chanceMax, 2)}. El mejor observado${sharpeTest.period === 'oos' ? ' en el forward' : ''} es ${fmt(observedMax, 2)}. Probar muchas combinaciones produce buenos resultados por sí solo, y este no destaca sobre ese ruido.`,
          `With ${howMany}, the maximum Sharpe expected with no real edge is ${fmt(chanceMax, 2)}. The best observed${sharpeTest.period === 'oos' ? ' on the forward' : ''} is ${fmt(observedMax, 2)}. Trying many combinations produces good results on its own, and this one does not stand out above that noise.`), 'stats');
    } else {
      add(SEV.OK, L('El mejor Sharpe supera el umbral del azar', 'Best Sharpe beats the chance threshold'),
        L(`Sharpe máximo${sharpeTest.period === 'oos' ? ' en el forward' : ''} ${fmt(observedMax, 2)} frente a ${fmt(chanceMax, 2)} esperable sin ventaja real con ${howMany}. Superar este contraste es condición necesaria, no suficiente: descarta que el resultado venga solo de haber probado mucho, pero no valida la estrategia.`,
          `Maximum Sharpe${sharpeTest.period === 'oos' ? ' on the forward' : ''} ${fmt(observedMax, 2)} versus ${fmt(chanceMax, 2)} expected with no real edge with ${howMany}. Passing this contrast is a necessary condition, not a sufficient one: it rules out that the result comes only from trying a lot, but it does not validate the strategy.`), 'stats');
    }
  }

  // ---- Avisos metodologicos
  if (!hasForward) {
    add(SEV.CRITICAL, L('Sin periodo forward no hay validación posible', 'Without a forward period there is no possible validation'),
      L('Solo has subido el in-sample, así que todo lo que ves está medido sobre los mismos datos con los que se eligieron los parámetros. Las mesetas son reales como estructura, pero nadie ha comprobado que sobrevivan fuera. Repite la optimización en MT5 con la opción Forward activada: es la diferencia entre describir el pasado y predecir algo.',
        'You only uploaded the in-sample, so everything you see is measured on the same data used to choose the parameters. The plateaus are real as structure, but nobody has checked that they survive outside. Repeat the optimization in MT5 with Forward enabled: that is the difference between describing the past and predicting something.'), null);
  }

  /*
   * Contaminacion del forward por la seleccion. Es un punto conceptual que casi ninguna
   * herramienta reconoce y conviene decirlo sin rodeos: en cuanto el forward se usa para
   * FILTRAR y para PUNTUAR, sus cifras dejan de ser una estimacion limpia de lo que viene.
   * Usarlo asi es lo correcto -desperdiciar esa informacion seria peor-, pero callarlo no.
   */
  if (hasForward && selectionMode === 'joint') {
    add(SEV.INFO, L('Las cifras del forward ya se han usado para elegir', 'Forward figures have already been used for selection'),
      L('Los mínimos se aplican también al forward, y la puntuación de cada configuración es el peor de los dos periodos, así que el forward interviene en la selección. Eso hace que sus números salgan algo mejores de lo que serían sobre datos de verdad no vistos, igual que pasa con el in-sample. No es un defecto del método: aprovechar esa información es preferible a tirarla. Pero significa que el ÚNICO número no contaminado que vas a ver es el del periodo no visto, y por eso ese paso no es un extra.',
        'The minimum gates are also applied to the forward, and each configuration\'s score is the worse of the two periods, so the forward takes part in selection. That makes its numbers come out somewhat better than they would on truly unseen data, just as with the in-sample. That is not a flaw of the method: using that information is preferable to discarding it. But it means the ONLY uncontaminated number you will see is the unseen period\'s, and that is why that step is not optional.'), null);
  } else if (hasForward) {
    add(SEV.INFO, L('El forward ya se ha usado para validar y ordenar', 'The forward has already been used to validate and rank'),
      L('La meseta se descubre solo con el in-sample, pero el forward decide qué mesetas bajan de puesto y es la base de todas las cifras de validación. Eso hace que sus números salgan algo mejores de lo que serían sobre datos de verdad no vistos. No es un defecto del método: aprovechar esa información es preferible a tirarla. Pero significa que el ÚNICO número no contaminado que vas a ver es el del periodo no visto, y por eso ese paso no es un extra.',
        'The plateau is discovered from the in-sample alone, but the forward decides which plateaus drop in rank and underlies every validation figure. That makes its numbers come out somewhat better than they would on truly unseen data. That is not a flaw of the method: using that information is preferable to discarding it. But it means the ONLY uncontaminated number you will see is the unseen period\'s, and that is why that step is not optional.'), null);
  }

  if (rescuedDims && rescuedDims.length) {
    const listEs = rescuedDims.map((d) => `${d.name} (efecto aislado ${fmt(d.marginal, 2)}, combinado ${fmt(d.conditional, 2)})`).join('; ');
    const listEn = rescuedDims.map((d) => `${d.name} (isolated effect ${fmt(d.marginal, 2)}, combined ${fmt(d.conditional, 2)})`).join('; ');
    add(SEV.INFO, L(`${rescuedDims.length} parámetro(s) se han conservado por su efecto combinado`, `${rescuedDims.length} parameter(s) were kept for their combined effect`),
      L(`${listEs}. Vistos por separado parecen planos, pero al dejar fijo todo lo demás sí mueven el resultado: su efecto depende del valor de otros parámetros. Se mantienen en el espacio de búsqueda, porque descartarlos haría pasar por vecinos a configuraciones que no lo son e inflaría las mesetas.`,
        `${listEn}. Seen alone they look flat, but with everything else held fixed they do move the result: their effect depends on the value of other parameters. They stay in the search space, because discarding them would treat non-neighbors as neighbors and inflate the plateaus.`), 'sensitivity');
  }

  if (irregularGrids && irregularGrids.length) {
    const top = irregularGrids.slice(0, 3);
    const listEs = top.map((g) => `${g.name}: el salto mayor (${g.maxStep}) es ${fmt(g.ratio, 0)} veces el menor (${g.minStep})`).join('; ');
    const listEn = top.map((g) => `${g.name}: the largest step (${g.maxStep}) is ${fmt(g.ratio, 0)} times the smallest (${g.minStep})`).join('; ');
    const spanEs = spansIrregular && spansIrregular.length
      ? ` La región recomendada cruza uno de esos saltos (${spansIrregular.map((x) => x.name).join(', ')}).`
      : '';
    const spanEn = spansIrregular && spansIrregular.length
      ? ` The recommended region crosses one of those jumps (${spansIrregular.map((x) => x.name).join(', ')}).`
      : '';
    add(SEV.WARN, L(`La rejilla de ${irregularGrids.length} parámetro(s) tiene saltos desiguales`, `The grid of ${irregularGrids.length} parameter(s) has uneven steps`),
      L(`${listEs}. El motor cuenta POSICIONES, no distancias: dos valores consecutivos de tu lista están siempre "a un paso" aunque entre ellos haya un abismo. Donde los saltos son desiguales, la continuidad de una meseta puede ser un espejismo. Optimiza esos parámetros con un paso uniforme.${spanEs}`,
        `${listEn}. The engine counts POSITIONS, not distances: two consecutive values on your list are always "one step apart" even if there is a gulf between them. Where steps are uneven, plateau continuity can be an illusion. Optimize those parameters with a uniform step.${spanEn}`), 'sensitivity');
  }

  if (offsetsComplete === false) {
    add(SEV.INFO, L('La vecindad se ha medido de forma aproximada', 'Neighborhood was measured approximately'),
      L('Con tantos parámetros optimizados, enumerar todos los desplazamientos posibles dentro del radio sería demasiado costoso, así que solo se han considerado los que mueven uno o dos parámetros a la vez. Es una aproximación conservadora: puede subestimar el soporte, nunca inventarlo.',
        'With so many optimized parameters, enumerating every possible offset within the radius would be too costly, so only those that move one or two parameters at a time were considered. It is a conservative approximation: it may understate support, never invent it.'), null);
  }

  if (sampling === 'sparse') {
    add(SEV.WARN, L(`Muestreo disperso (sobre niveles vistos): ${fmt((100 * coverage), 4)}%`, `Sparse sampling (on seen levels): ${fmt((100 * coverage), 4)}%`),
      L('Has optimizado con algoritmo genético, no con rejilla completa. El GA concentra las pruebas donde el in-sample era bueno, así que la densidad de vecinos mide dónde miró el optimizador tanto como dónde hay estabilidad. Usa el rango de refinamiento que propone la app y repite con rejilla completa.',
        'You optimized with a genetic algorithm, not a full grid. The GA concentrates trials where the in-sample was good, so neighbor density measures where the optimizer looked as much as where there is stability. Use the refinement range the app proposes and repeat with a full grid.'), 'coverage');
  }

  if (searchCoverage && searchCoverage.usable && Number.isFinite(searchCoverage.coverageSearch)) {
    const cs = searchCoverage.coverageSearch;
    const obs = Number.isFinite(coverage) ? coverage : NaN;
    if (cs < 0.02) {
      add(SEV.WARN, L(`Solo ${fmt((100 * cs), 2)}% del rango del .set`, `Only ${fmt((100 * cs), 2)}% of the .set search range`),
        L(`El .set pide un espacio de ${searchCoverage.searchCartesian.toLocaleString(localeTag())} combinaciones; tus archivos cubren ${searchCoverage.uniqueObserved.toLocaleString(localeTag())} celdas distintas. La cobertura “alta” sobre niveles vistos no implica que hayas explorado el rango que pediste en MT5.`,
          `The .set asks for a space of ${searchCoverage.searchCartesian.toLocaleString(localeTag())} combinations; your files cover ${searchCoverage.uniqueObserved.toLocaleString(localeTag())} distinct cells. High coverage on seen levels does not mean you explored the range you asked MT5 for.`), 'coverage');
    } else if (Number.isFinite(obs) && obs >= 0.5 && cs < obs * 0.5) {
      add(SEV.WARN, L('La cobertura observada engaña frente al .set', 'Observed coverage misleads vs the .set'),
        L(`Sobre niveles vistos cubres el ${fmt((100 * obs), 1)}%; frente al rango del .set, solo el ${fmt((100 * cs), 2)}%. Un genético denso en un rincón produce exactamente esa discrepancia.`,
          `On seen levels you cover ${fmt((100 * obs), 1)}%; versus the .set range, only ${fmt((100 * cs), 2)}%. A genetic dense in a corner produces exactly that gap.`), 'coverage');
    } else if (cs >= 0.95) {
      add(SEV.OK, L(`Cobertura del .set: ${fmt((100 * cs), 1)}%`, `.set coverage: ${fmt((100 * cs), 1)}%`),
        L('Las pasadas cubren casi todo el espacio de búsqueda declarado en el .set.',
          'Passes cover almost the entire search space declared in the .set.'), 'coverage');
    } else {
      add(SEV.INFO, L(`Cobertura del .set: ${fmt((100 * cs), 2)}%`, `.set coverage: ${fmt((100 * cs), 2)}%`),
        L(`${searchCoverage.uniqueObserved.toLocaleString(localeTag())} celdas distintas de ${searchCoverage.searchCartesian.toLocaleString(localeTag())} pedidas en el .set.`,
          `${searchCoverage.uniqueObserved.toLocaleString(localeTag())} distinct cells of ${searchCoverage.searchCartesian.toLocaleString(localeTag())} asked in the .set.`), 'coverage');
    }
    if (searchCoverage.outsideAny) {
      add(SEV.WARN, L('Hay pasadas fuera del rango del .set', 'Some passes fall outside the .set range'),
        L('Algunos valores observados no encajan en inicio/paso/fin del .set aportado. Puede ser otro .set, un redondeo, o una optimización distinta.',
          'Some observed values do not fit the .set start/step/stop. It may be another .set, rounding, or a different optimization.'), 'coverage');
    }
    if (searchCoverage.missingInSet && searchCoverage.missingInSet.length) {
      add(SEV.INFO, L(`${searchCoverage.missingInSet.length} parámetro(s) del archivo no están en el .set`, `${searchCoverage.missingInSet.length} file parameter(s) missing from the .set`),
        L(`No se contrastaron: ${searchCoverage.missingInSet.slice(0, 6).join(', ')}${searchCoverage.missingInSet.length > 6 ? '…' : ''}.`,
          `Not contrasted: ${searchCoverage.missingInSet.slice(0, 6).join(', ')}${searchCoverage.missingInSet.length > 6 ? '…' : ''}.`), 'coverage');
    }
  } else if (!searchCoverage || !searchCoverage.present) {
    add(SEV.INFO, L('Sin .set de optimización: cobertura solo sobre niveles vistos', 'No optimization .set: coverage is on seen levels only'),
      L('Suelta el .set con el que lanzaste la optimización (inicio||paso||fin||Y) para medir qué fracción del rango pedido cubren tus archivos.',
        'Drop the .set you launched the optimization with (start||step||stop||Y) to measure what fraction of the requested range your files cover.'), 'coverage');
  }

  if (Number.isFinite(medianSupport) && medianSupport < 4) {
    add(SEV.WARN, L(`Soporte local insuficiente (mediana de ${fmt(medianSupport, 0)} vecinos)`, `Insufficient local support (median of ${fmt(medianSupport, 0)} neighbors)`),
      L('La mayoría de configuraciones tiene muy pocos vecinos observados. Cualquier afirmación sobre mesetas es provisional hasta que refines con una rejilla.',
        'Most configurations have very few observed neighbors. Any claim about plateaus is provisional until you refine with a grid.'), 'coverage');
  }

  // Una correlación nula entre periodos NO significa lo mismo según cuánta parte del
  // espacio sea viable. Si casi todo pierde dinero, es que no hay ventaja. Si casi
  // todo gana, la ventaja existe y lo que no sirve es el RANKING. Confundir ambas
  // cosas lleva a descartar estrategias buenas por el motivo equivocado.
  if (Number.isFinite(spearman)) {
    if (spearman < 0.1 && hasRefuge) {
      add(SEV.WARN, L(`El ranking no transfiere de un periodo al otro (rho = ${fmt(spearman, 2)})`, `The ranking does not transfer from one period to the other (rho = ${fmt(spearman, 2)})`),
        L(`Ojo con la lectura: de las ${fwdBase.toLocaleString(localeTag())} configuraciones que MT5 pasó al forward, el ${fmt((100 * gatePassCount / fwdBase), 0)} % cumple los mínimos en los dos periodos, así que hay configuraciones que aguantan. Lo que no tiene valor es el ORDEN: cuál queda primera en el in-sample no predice cuál quedará primera en el forward. Elige por región estable en ambos periodos, nunca por puesto en la tabla.`,
          `Read carefully: of the ${fwdBase.toLocaleString(localeTag())} configurations MT5 passed to the forward, ${fmt((100 * gatePassCount / fwdBase), 0)}% meet the minima in both periods, so some configurations do hold. What has no value is the ORDER: which one ranks first in-sample does not predict which will rank first on the forward. Choose by a region stable in both periods, never by table rank.`), 'stats');
    } else if (spearman < 0.1) {
      add(SEV.CRITICAL, L(`Correlación IS -> OOS prácticamente nula (rho = ${fmt(spearman, 2)})`, `IS -> OOS correlation practically null (rho = ${fmt(spearman, 2)})`),
        L(`Solo el ${fmt((100 * gatePassCount / fwdBase), 0)} % de las configuraciones con forward cumple los mínimos y además el comportamiento en entrenamiento no dice nada sobre el de validación. Es compatible con un sistema sin ventaja real.`,
          `Only ${fmt((100 * gatePassCount / fwdBase), 0)}% of configurations with forward meet the minima and training behavior says nothing about validation. That is consistent with a system with no real edge.`), 'stats');
    } else if (spearman < 0.3) {
      add(SEV.WARN, L(`Correlación IS -> OOS débil (rho = ${fmt(spearman, 2)})`, `Weak IS -> OOS correlation (rho = ${fmt(spearman, 2)})`),
        L('Hay algo de señal, pero poca. Conviene ampliar el periodo de datos antes de tomar decisiones.',
          'There is some signal, but little. It is worth widening the data period before deciding.'), 'stats');
    } else {
      add(SEV.OK, L(`Correlación IS -> OOS de ${fmt(spearman, 2)}`, `IS -> OOS correlation of ${fmt(spearman, 2)}`),
        L('El comportamiento in-sample conserva información sobre el out-of-sample a nivel global.',
          'In-sample behavior retains information about out-of-sample at the global level.'), 'stats');
    }
  }

  if (hasForward && viableShare >= 0.6) {
    add(SEV.OK, L(hasForward && fwdBase < total ? 'Casi todas las configuraciones que MT5 pasó al forward cumplen los mínimos' : 'La estrategia aguanta en casi todo el espacio de parámetros', hasForward && fwdBase < total ? 'Nearly all configurations MT5 passed to the forward meet the minima' : 'The strategy holds across nearly the whole parameter space'),
      L(`${gatePassCount.toLocaleString(localeTag())} de ${fwdBase.toLocaleString(localeTag())} configuraciones${fwdBase < total ? ' con forward' : ''} (${fmt((100 * viableShare), 0)} %) cumplen los mínimos en los dos periodos. El resultado no depende de haber acertado con unos valores concretos.${fwdBase < total ? ' Ojo: MT5 solo pasa al forward las mejores del in-sample, así que es una proporción sobre esas, no sobre todo lo que probaste.' : ''}`,
        `${gatePassCount.toLocaleString(localeTag())} of ${fwdBase.toLocaleString(localeTag())} configurations${fwdBase < total ? ' with forward' : ''} (${fmt((100 * viableShare), 0)}%) meet the minima in both periods. The result does not depend on having hit particular values.${fwdBase < total ? ' Note: MT5 only passes the best in-sample configurations to the forward, so this is a share of those, not of everything you tested.' : ''}`), null);
  } else if (hasForward && hasRefuge) {
    add(SEV.OK, L('Hay una parte amplia del espacio que supera los mínimos', 'A broad part of the space clears the minima'),
      L(`${gatePassCount.toLocaleString(localeTag())} de ${fwdBase.toLocaleString(localeTag())} configuraciones${fwdBase < total ? ' con forward' : ''} (${fmt((100 * viableShare), 0)} %) los cumplen en los dos periodos, y se agrupan en ${plateaus.length} región(es) estable(s). No dependes de haber acertado un valor concreto: hay de dónde elegir.`,
        `${gatePassCount.toLocaleString(localeTag())} of ${fwdBase.toLocaleString(localeTag())} configurations${fwdBase < total ? ' with forward' : ''} (${fmt((100 * viableShare), 0)}%) meet them in both periods, and they cluster into ${plateaus.length} stable region(s). You do not depend on having hit a particular value: there is room to choose.`), null);
  }

  if (inversions && inversions.length) {
    const top = inversions.slice(0, 5);
    const listEs = top.map((x) => `${x.name}: el in-sample prefiere ${x.bestIs}, pero en el forward gana ${x.bestOos} (quedarte con el valor del in-sample tira el ${fmt((100 * x.regretShare), 0)} % del margen disponible)`).join('; ');
    const listEn = top.map((x) => `${x.name}: in-sample prefers ${x.bestIs}, but on the forward ${x.bestOos} wins (keeping the in-sample value throws away ${fmt((100 * x.regretShare), 0)}% of the available margin)`).join('; ');
    add(SEV.WARN, L(`En ${inversions.length} parámetro(s), el valor que gana en el in-sample es de los que pierden en el forward`, `In ${inversions.length} parameter(s), the value that wins in-sample is among those that lose on the forward`),
      L(`${listEs}. Esta es la causa mecánica de que el ranking no transfiera: la señal no falta, apunta al revés. El óptimo de esos parámetros depende del régimen de mercado y no de la estrategia, así que afinarlos sobre el in-sample es tiempo perdido. Déjalos en un valor central y decide con los que sí son coherentes entre periodos.`,
        `${listEn}. This is the mechanical cause of the ranking not transferring: signal is not missing, it points the wrong way. The optimum of those parameters depends on market regime, not on the strategy, so tuning them on the in-sample is wasted time. Leave them at a central value and decide with those that are coherent across periods.`), 'parameters');
  }

  if (periodComparison) {
    const { medianQualityIs, medianQualityOos, passIsPct, passOosPct } = periodComparison;
    if (Number.isFinite(medianQualityOos) && Number.isFinite(medianQualityIs)
      && medianQualityOos > medianQualityIs + 0.05 && passOosPct > passIsPct + 0.05) {
      add(SEV.WARN, L('El periodo forward fue más benigno que el in-sample', 'The forward period was more benign than the in-sample'),
        L(`Calidad mediana ${fmt(medianQualityOos, 2)} en el forward frente a ${fmt(medianQualityIs, 2)} en el in-sample, y pasan los mínimos el ${fmt((100 * passOosPct), 0)} % frente al ${fmt((100 * passIsPct), 0)} %. Que casi todo funcione fuera de muestra puede deberse tanto a la solidez de la estrategia como a que le tocó un tramo fácil. No tomes el forward como prueba de fuego mientras no lo repitas en un tramo distinto.`,
          `Median quality ${fmt(medianQualityOos, 2)} on the forward versus ${fmt(medianQualityIs, 2)} in-sample, and ${fmt((100 * passOosPct), 0)}% pass the minima versus ${fmt((100 * passIsPct), 0)}%. That almost everything works out of sample may owe as much to the strategy's strength as to an easy stretch. Do not treat the forward as a trial by fire until you repeat it on a different stretch.`), null);
    }
  }

  if (tiedCount > 1) {
    add(SEV.INFO, L(`Las ${tiedCount === 2 ? 'dos' : tiedCount === 3 ? 'tres' : tiedCount} primeras mesetas están empatadas`, `The first ${tiedCount === 2 ? 'two' : tiedCount === 3 ? 'three' : tiedCount} plateaus are tied`),
      L(`${tiedRanks.map((r) => 'M' + r).join(', ')} puntúan prácticamente igual: la diferencia está dentro del ruido y el orden en que aparecen no significa que una sea mejor. Compáralas en la tabla del Top y elige por criterio operativo.`,
        `${tiedRanks.map((r) => 'M' + r).join(', ')} score practically the same: the difference is within noise and the order they appear does not mean one is better. Compare them in the Top table and choose by operational criteria.`), null);
  }

  if (invertedRisk && invertedRisk.length && bestPlateau) {
    const altEs = alternativePlateau
      ? ` La meseta ${alternativePlateau.rank} (representante Pass ${alternativePlateau.record.id}) no tiene ese problema y es la alternativa natural.`
      : '';
    const altEn = alternativePlateau
      ? ` Plateau ${alternativePlateau.rank} (representative Pass ${alternativePlateau.record.id}) does not have that problem and is the natural alternative.`
      : '';
    add(SEV.WARN, L('La configuración propuesta se apoya en un valor que el forward castiga', 'The proposed configuration leans on a value the forward punishes'),
      L(`${invertedRisk.map((x) => `${x.name} = ${x.bestIs}`).join(', ')}: es el valor que gana en el in-sample, pero su nivel es de los peores en el forward. Que esta configuración concreta aguante ahí puede ser mérito suyo o puede ser suerte, y no hay forma de distinguirlo con estos datos.${altEs}`,
        `${invertedRisk.map((x) => `${x.name} = ${x.bestIs}`).join(', ')}: that is the value that wins in-sample, but its level is among the worst on the forward. That this specific configuration holds there may be its merit or may be luck, and there is no way to tell with these data.${altEn}`), 'plateau');
  }

  if (boundaryWorst && boundaryWorst.length) {
    add(SEV.WARN, L('La configuración recomendada está pegada al borde del rango probado', 'The recommended configuration sits on the edge of the tested range'),
      L(`Afecta a: ${boundaryWorst.map((b) => `${b.name} = ${b.atMin ? b.min : b.max}`).join(', ')}. Más allá de ese valor no has probado nada: la meseta puede continuar o puede caer en picado justo después. Amplía el rango de esos parámetros y vuelve a optimizar.`,
        `Affects: ${boundaryWorst.map((b) => `${b.name} = ${b.atMin ? b.min : b.max}`).join(', ')}. Beyond that value you have tested nothing: the plateau may continue or may drop sharply right after. Widen the range of those parameters and optimize again.`), 'plateau');
  }

  if (Number.isFinite(periodRatio)) {
    if (periodRatio < 0.15) {
      add(SEV.WARN, L(`El periodo OOS es muy corto (aprox. ${fmt((100 * periodRatio), 0)}% del IS)`, `The OOS period is very short (approx. ${fmt((100 * periodRatio), 0)}% of IS)`),
        L('Un forward demasiado breve produce validaciones ruidosas. Lo habitual es situarlo entre el 20% y el 50% del in-sample.',
          'An overly short forward produces noisy validations. The usual range is between 20% and 50% of the in-sample.'), 'coverage');
    } else if (periodRatio > 1.2) {
      add(SEV.INFO, L(`El periodo OOS es más largo que el IS (aprox. ${fmt((100 * periodRatio), 0)}%)`, `The OOS period is longer than IS (approx. ${fmt((100 * periodRatio), 0)}%)`),
        L('Validación exigente, lo cual es bueno, pero revisa que el reparto sea el que pretendías.',
          'A demanding validation, which is good, but check that the split is the one you intended.'), 'coverage');
    }
  }

  if (integrity) {
    if (integrity.provenance && integrity.provenance.checked && integrity.provenance.mismatches > 0) {
      add(SEV.CRITICAL, L('Los dos archivos no parecen de la misma optimización', 'The two files do not appear to be from the same optimization'),
        L(`En ${integrity.provenance.mismatches} filas el resultado del backtest del archivo forward no coincide con el del archivo in-sample. Revisa que no hayas mezclado exportaciones.`,
          `In ${integrity.provenance.mismatches} rows the forward file's backtest result does not match the in-sample file. Check that you have not mixed exports.`), 'integrity');
    }
    if (integrity.forwardSelectionSuspect) {
      const pct = Number.isFinite(integrity.forwardRowRatio)
        ? (100 * integrity.forwardRowRatio).toFixed(0)
        : '?';
      add(SEV.WARN,
        L('El forward es un subconjunto del in-sample (sesgo de selección)',
          'Forward is a subset of in-sample (selection bias)'),
        L(`El export forward trae ${integrity.oosRows} filas frente a ${integrity.isRows} del in-sample (~${pct} %). MT5 solo prueba en el forward las mejores pasadas según tu criterio de optimización, así que las mesetas y la fragilidad en forward se miden solo entre candidatas ya preseleccionadas: la validación queda sesgada al alza. Interpreta el forward con cautela.`,
          `The forward export has ${integrity.oosRows} rows versus ${integrity.isRows} in-sample (~${pct}%). MT5 only tests the best passes by your optimization criterion in the forward, so plateaus and forward fragility are measured only among already pre-selected candidates: validation is biased upward. Treat the forward with caution.`), 'integrity');
    }
    if (integrity.duplicateIds > 0) {
      add(SEV.WARN, L(`${integrity.duplicateIds} identificadores duplicados`, `${integrity.duplicateIds} duplicate identifiers`),
        L('Se ha conservado la primera aparición de cada pasada duplicada.',
          'The first appearance of each duplicate Pass was kept.'), 'integrity');
    }
    if (integrity.unmatchedIs > 0 && integrity.unmatchedUsedForDiscovery) {
      add(SEV.INFO, L(`${integrity.unmatchedIs} pasadas sin forward`, `${integrity.unmatchedIs} passes without forward`),
        L('MT5 solo prueba en el forward las mejores pasadas. Las demás se usan para buscar las mesetas en el in-sample, porque así se ven también las vecinas que fallan tus mínimos, pero no cuentan como validadas en el forward.',
          'MT5 only tests the best passes on the forward. The rest are used to find the plateaus in-sample, because that way the neighbors that fail your minima are seen too, but they do not count as validated on the forward.'), 'integrity');
    } else if (integrity.unmatchedIs > 0) {
      const sev = (integrity.isRows > 0 && integrity.unmatchedIs / integrity.isRows > 0.05) ? SEV.WARN : SEV.INFO;
      add(sev, L(`${integrity.unmatchedIs} pasadas sin pareja`, `${integrity.unmatchedIs} unpaired passes`),
        L('Estas filas existen en un archivo y no en el otro, y se han descartado del análisis.',
          'These rows exist in one file and not the other, and were discarded from the analysis.'), 'integrity');
    }
    if (integrity.duplicateParamVectors > 0) {
      const base = integrity.matchedRows || integrity.isRows || 0;
      const sev = base > 0 && integrity.duplicateParamVectors / base > 0.05 ? SEV.WARN : SEV.INFO;
      add(sev, L(`${integrity.duplicateParamVectors} pasadas con parámetros repetidos`, `${integrity.duplicateParamVectors} passes with repeated parameters`),
        L('Varias pasadas tienen exactamente los mismos valores de parámetros, algo habitual en la optimización genética. Se analiza una sola por combinación. Si son muchas, revisa en «Columnas detectadas» que ningún parámetro se haya tomado por una métrica.',
          'Several passes have exactly the same parameter values, which is common in genetic optimization. Only one per combination is analyzed. If there are many, check in "Detected columns" that no parameter was taken for a metric.'), 'integrity');
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

  let level;
  let headline;
  let summary;
  if (underpowered) {
    // No es un suspenso: es que no hay masa para afirmar nada en ninguna direccion.
    level = LEVELS.INSUFFICIENT;
    headline = L('Evidencia insuficiente', 'Insufficient evidence');
    const where = hasForward && selectionMode === 'isThenOos';
    summary = L(`Con ${searchPassCount} configuraciones por encima de tus mínimos${where ? ' en el in-sample' : ''} no hay masa suficiente para que pudiera existir una región estable: harían falta al menos ${viableNeededForPlateau}. Esto no dice nada sobre tu EA: dice que estos datos no permiten pronunciarse en ninguna dirección.`,
      `With ${searchPassCount} configurations above your minima${where ? ' in-sample' : ''} there is not enough mass for a stable region to exist; at least ${viableNeededForPlateau} would be needed. This says nothing about your EA: it says these data do not allow a pronouncement in either direction.`);
  } else if (criticas.length) {
    level = LEVELS.WEAK;
    headline = regiones
      ? L('Evidencia débil (hay región)', 'Weak evidence (region found)')
      : L('Evidencia débil', 'Weak evidence');
    summary = regiones
      ? L(`Sí hay ${regiones === 1 ? 'una región estable' : `${regiones} regiones estables`} en tus datos (abajo). Lo que es débil no es “que no exista zona”, sino el peso que puedes darle: ${criticas.length === 1 ? 'hay una limitación seria' : `hay ${criticas.length} limitaciones serias`} en lo que la sostiene. Léela antes de decidir.`,
          `There ${regiones === 1 ? 'is a stable region' : `are ${regiones} stable regions`} in your data (below). What is weak is not “that no zone exists”, but how much weight you can give it: ${criticas.length === 1 ? 'there is one serious limitation' : `there are ${criticas.length} serious limitations`} in what supports it. Read it before deciding.`)
      : L('No hay ninguna región conexa en estos datos: lo que hay son configuraciones sueltas. Abajo tienes las mejores, pero un punto aislado no es una zona estable.',
          'There is no connected region in these data: what there is are isolated configurations. Below you have the best ones, but an isolated point is not a stable zone.');
  } else if (warnings.length) {
    level = LEVELS.MODERATE;
    headline = L('Evidencia moderada', 'Moderate evidence');
    summary = L(`Hay ${regiones === 1 ? 'una región estable' : `${regiones} regiones estables`} con soporte real, pero con ${warnings.length === 1 ? 'un aviso que conviene leer' : `${warnings.length} avisos que conviene leer`} antes de decidir.`,
      `There ${regiones === 1 ? 'is one stable region' : `are ${regiones} stable regions`} with real support, but with ${warnings.length === 1 ? 'one warning worth reading' : `${warnings.length} warnings worth reading`} before deciding.`);
  } else {
    level = LEVELS.STRONG;
    headline = L('Evidencia sólida', 'Solid evidence');
    summary = L(`${regiones === 1 ? 'La región propuesta' : 'Las regiones propuestas'} se ${regiones === 1 ? 'apoya' : 'apoyan'} en vecinos que también superan tus mínimos, y el resultado aguanta al mover los umbrales. Es lo máximo que estos datos pueden respaldar.`,
      `${regiones === 1 ? 'The proposed region rests' : 'The proposed regions rest'} on neighbors that also clear your minima, and the result holds when thresholds are moved. That is the most these data can support.`);
  }

  /*
   * El siguiente paso se formula como una opcion, no como una orden. La diferencia
   * importa: "puedes hacer X" describe un camino; "no hagas Y" decide por el usuario.
   */
  let nextStep;
  if (level === LEVELS.INSUFFICIENT) {
    nextStep = L('Para que estos datos puedan decir algo, amplía el rango de los parámetros, añade valores intermedios o relaja los mínimos, y vuelve a optimizar. Con lo que hay ahora, cualquier conclusión sería inventada.',
      'For these data to say anything, widen the parameter ranges, add intermediate values or relax the minima, and optimize again. With what is here now, any conclusion would be made up.');
  } else if (!bestPlateau) {
    nextStep = L('Refina la optimización antes de seguir.', 'Refine the optimization before continuing.');
  } else if (Number.isFinite(fragility) && fragility >= 0.5) {
    nextStep = L('Ignora el orden de tu tabla de MT5: aquí engaña. La región de abajo sigue siendo el hallazgo; exporta el .set de la configuración representativa y pruébala en un tramo que no hayas usado ni para optimizar ni para validar. Fija los criterios de aceptación ANTES de mirar el resultado.',
      'Ignore the order of your MT5 table: here it misleads. The region below is still the finding; export the .set of the representative configuration and test it on a stretch you have not used for optimization or validation. Fix acceptance criteria BEFORE looking at the result.');
  } else {
    nextStep = L('Exporta el .set de la configuración representativa y pruébala en un periodo que no hayas usado ni para optimizar ni para validar. Fija los criterios de aceptación ANTES de mirar el resultado.',
      'Export the .set of the representative configuration and test it on a period you have not used for optimization or validation. Fix acceptance criteria BEFORE looking at the result.');
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
  if (m) return `PF < ${fmt(Number(m[1]), 2)}`;
  m = /^DD > (.+)%$/.exec(token);
  if (m) return `DD > ${fmt(Number(m[1]), 0)} %`;
  m = /^operaciones < (.+)$/.exec(token);
  if (m) return L(`operaciones < ${m[1]}`, `trades < ${m[1]}`);
  if (token === 'beneficio <= 0') return L('beneficio ≤ 0', 'profit ≤ 0');
  return token;
}

export function peakRejectReasons(p, opts = {}) {
  const minSupport = opts.minSupport ?? 4;
  const plateauFloorQuality = opts.plateauFloorQuality ?? 0.42;
  const reasons = [];
  if (p.st.support < minSupport) {
    reasons.push(p.st.support === 1
      ? L('solo 1 vecino observado', 'only 1 neighbor observed')
      : L(`solo ${p.st.support} vecinos observados`, `only ${p.st.support} neighbors observed`));
  }
  if (Number.isFinite(p.st.peakZ) && p.st.peakZ > 2) {
    reasons.push(L(`sobresale ${fmt(p.st.peakZ, 1)}σ sobre su vecindad`, `stands out ${fmt(p.st.peakZ, 1)}σ above its neighborhood`));
  }
  if (Number.isFinite(p.st.cliff) && p.st.cliff > 1.5) {
    reasons.push(L('acantilado a un paso', 'cliff one step away'));
  }
  const failsIs = (p.record.failsIs || []).map(gateFailLabel);
  const failsOos = (p.record.failsOos || []).map(gateFailLabel);
  if (!p.record.passes || failsOos.length) {
    // Con el periodo delante: una configuracion puede cumplir en el in-sample y fallar
    // solo en el forward, y esa diferencia es justo lo que interesa ver.
    const parts = [];
    if (failsIs.length) parts.push(`in-sample: ${failsIs.join(', ')}`);
    if (failsOos.length) parts.push(`forward: ${failsOos.join(', ')}`);
    if (parts.length) reasons.push(L(`no cumple los mínimos (${parts.join(' · ')})`, `does not meet the minima (${parts.join(' · ')})`));
  }
  if (Number.isFinite(p.st.fracPass) && p.st.fracPass < 0.9) {
    reasons.push(L(
      `solo el ${fmt(100 * p.st.fracPass, 0)} % de sus vecinos pasa los mínimos`,
      `only ${fmt(100 * p.st.fracPass, 0)}% of its neighbors clear the minima`,
    ));
  }
  if (Number.isFinite(p.st.q25) && p.st.q25 < plateauFloorQuality) {
    reasons.push(L(
      `el cuartil bajo (Q25) de su entorno se queda en ${fmt(p.st.q25, 2)}`,
      `the lower quartile (Q25) of its surroundings sits at ${fmt(p.st.q25, 2)}`,
    ));
  }
  if (!reasons.length) {
    reasons.push(L(
      'no alcanza el umbral de robustez con soporte suficiente',
      'does not reach the robustness threshold with enough support',
    ));
  }
  return reasons;
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
  }));
  return { ...analysis, verdict, peaks };
}

export { SEV };
