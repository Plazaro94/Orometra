// Politica de evaluacion: puertas absolutas y puntuacion de calidad.
//
// Regla central del producto: NUNCA se evalua con la vara con la que se optimizo.
// La columna "Result" (o "Custom") es el criterio que eligio el usuario en MT5 y
// significa algo distinto en cada optimizacion, así que no puntua. Se puntua con las
// columnas objetivas que MT5 exporta siempre.

export const DEFAULT_POLICY = {
  gates: {
    requireProfit: true,
    minProfitFactor: 1.2,
    maxDrawdownPct: 20,
    minTrades: 100,
    bothPeriods: true,
  },
  /*
   * Anclas: el valor que puntua 0 y el que puntua 1.
   *
   * El ancla del DRAWDOWN se estrecho de {40, 8} a {30, 5} tras medir que la anterior
   * saturaba. Con `full: 8` cualquier configuracion por debajo del 8 % puntuaba 1,0
   * clavado, de modo que el tramo donde viven casi todos los EA -del 5 % al 20 %- se
   * comprimia en el tercio alto de la escala y el riesgo apenas podia mover la nota.
   * El factor de beneficio, mientras tanto, recorria la escala entera.
   */
  anchors: {
    profitFactor: { zero: 1.0, full: 1.5 },
    recoveryFactor: { zero: 0, full: 3 },
    drawdown: { zero: 30, full: 5 },
    sharpe: { zero: 0, full: 2.5 },
    trades: { zero: 50, full: 500 },
    // El beneficio por operacion se mide contra el propio conjunto, no contra una
    // cifra absoluta: depende del activo, del lote y de la divisa de la cuenta, asi
    // que un ancla fija no significaria lo mismo para dos EA distintos.
    expectedPayoff: { relative: true },
  },

  /*
   * ESTRUCTURA POR EJES, y no una lista plana de pesos.
   *
   * El motivo salio de medir, no de la teoria. Las seis metricas que exporta MT5
   * correlacionan entre si de 0,85 a 0,99: son, en la practica, una sola medida con
   * adornos. Con una lista plana de pesos, cuatro de ellas -factor de beneficio, factor
   * de recuperacion, Sharpe y payoff- miden todas lo mismo y sumaban 0,74 frente al 0,18
   * del drawdown. Cuatro contra uno.
   *
   * El resultado era demostrable y grave: a IGUAL factor de beneficio, asumir el doble de
   * drawdown SUBIA la nota un 33 % en un EA real, y solo la bajaba un 7,5 % en el otro.
   * Mientras tanto un 15 % mas de factor de beneficio valia un +95 %. La puntuacion no
   * estaba ajustada por riesgo: era una puntuacion de retorno con el riesgo de adorno.
   *
   * Aqui las metricas se agrupan por lo que MIDEN y la combinacion final es geometrica
   * entre EJES, no entre metricas. Asi el riesgo tiene un 0,35 propio que ninguna
   * cantidad de retorno puede compensar, que es justo lo que hace falta: el drawdown no
   * es una metrica mas, es lo que hace que un operador abandone un sistema. Todo el
   * sentido de buscar una configuracion robusta es poder sostenerla.
   *
   * Cambiar solo los pesos no habria servido de nada: con metricas colineales, mover
   * pesos no mueve el orden. Habia que separar los ejes.
   */
  groups: {
    // Ventaja, medida de forma INDEPENDIENTE DEL TAMANO DE LA APUESTA. El factor de
    // beneficio (bruto ganado / bruto perdido) no cambia si doblas el lote, y eso es
    // exactamente lo que hace falta aqui.
    retorno: { weight: 0.30, metrics: { profitFactor: 1 } },
    riesgo: { weight: 0.35, metrics: { drawdown: 1 } },
    // Retorno POR UNIDAD de riesgo: ni retorno puro ni riesgo puro. El factor de
    // recuperacion tambien es insensible al lote (si doblas, beneficio y caida doblan).
    eficiencia: { weight: 0.25, metrics: { recoveryFactor: 0.6, sharpe: 0.4 } },
    // Cuanta evidencia sostiene todo lo anterior.
    evidencia: { weight: 0.10, metrics: { trades: 1 } },
  },
};

/*
 * POR QUE EL BENEFICIO POR OPERACION YA NO PUNTUA.
 *
 * Se anadio con un argumento flojo -"MT5 lo exporta y no lo estabamos usando"- y al
 * medirlo resulto que empujaba en la direccion contraria. Aislando una banda estrecha de
 * factor de beneficio en un EA real, con la ventaja practicamente fija en 1,231:
 *
 *     beneficio por operacion   seguras 40,79   arriesgadas 63,26
 *     eje retorno               seguras  0,168  arriesgadas  0,496
 *     drawdown                  seguras   5,4 %  arriesgadas  10,0 %
 *
 * A igual ventaja, ganar mas euros por operacion significa apostar mas por operacion. El
 * beneficio por trade y el drawdown son las dos caras de la misma moneda, y premiar la
 * primera mientras se castiga la segunda deja el saldo a favor del riesgo. Es una medida
 * de APALANCAMIENTO disfrazada de calidad.
 *
 * Sigue leyendose y mostrandose, porque si dice algo util: un payoff de 2 puntos no
 * sobrevive a que se abra el spread y uno de 60 si. Pero eso es una pregunta de UMBRAL
 * (¿cubre los costes?), no de orden, y no debe decidir que configuracion es mejor.
 */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Resuelve las anclas a partir de los MINIMOS QUE EL USUARIO HA DECLARADO.
 *
 * Con anclas fijas, la escala del riesgo era una suposicion nuestra impuesta a todo el
 * mundo. Si alguien tolera un 35 % de drawdown y nosotros damos cero a partir del 30 %,
 * le anulamos medio espacio de busqueda y no encuentra ninguna meseta, no porque su EA
 * sea malo sino porque su tolerancia no coincide con la nuestra.
 *
 * El maximo drawdown que acepta ES su declaracion de tolerancia al riesgo, asi que es la
 * escala natural sobre la que juzgarlo:
 *
 *     cero  = 1,5 x su maximo     (claramente intolerable para el)
 *     pleno = 0,25 x su maximo    (holgadamente comodo)
 *
 * Con los valores por defecto (20 %) sale {30, 5}, que es exactamente la escala elegida a
 * mano; lo unico que cambia es que ahora se adapta a quien pide otra cosa.
 *
 * Efecto secundario deseado: la puerta del drawdown deja de ser inerte. Antes solo
 * filtraba -y en EA con poco drawdown no filtraba nada-; ahora ademas fija la escala con
 * la que se puntua, asi que moverla se nota.
 *
 * El cero del factor de beneficio NO se ata a la puerta: 1,0 es el punto de equilibrio,
 * un cero con significado propio que no depende de lo exigente que sea nadie.
 */
export function resolvePolicy(policy = DEFAULT_POLICY) {
  const g = policy.gates || {};
  const anchors = { ...(policy.anchors || DEFAULT_POLICY.anchors) };
  if (Number.isFinite(g.maxDrawdownPct) && g.maxDrawdownPct > 0) {
    anchors.drawdown = { zero: g.maxDrawdownPct * 1.5, full: Math.max(1, g.maxDrawdownPct * 0.25) };
  }
  if (Number.isFinite(g.minProfitFactor) && g.minProfitFactor > 1) {
    anchors.profitFactor = { zero: 1.0, full: Math.max(1.5, g.minProfitFactor + 0.3) };
  }
  if (Number.isFinite(g.minTrades) && g.minTrades > 0) {
    anchors.trades = { zero: Math.max(5, g.minTrades * 0.5), full: g.minTrades * 5 };
  }
  return { ...policy, anchors, groups: policy.groups || DEFAULT_POLICY.groups };
}

function linearScore(value, anchor) {
  if (!Number.isFinite(value)) return NaN;
  const { zero, full } = anchor;
  if (zero === full) return NaN;
  return clamp01((value - zero) / (full - zero));
}

function logScore(value, anchor) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const { zero, full } = anchor;
  if (zero <= 0 || full <= zero) return NaN;
  return clamp01(Math.log(value / zero) / Math.log(full / zero));
}

/**
 * CORRECCION POR LONGITUD DE PERIODO.
 *
 * El drawdown maximo y el factor de recuperacion no son invariantes a la duracion: en un
 * paseo aleatorio la caida maxima crece con la RAIZ del numero de operaciones. Un forward
 * que dura la cuarta parte que el in-sample ensena, mecanicamente, la mitad de drawdown,
 * sin que eso diga nada bueno de la estrategia.
 *
 * PERO la ley de la raiz vale para un paseo SIN deriva, y una estrategia rentable tiene
 * deriva positiva, con la que la caida maxima crece bastante mas despacio. Ademas MT5
 * reporta el drawdown en PORCENTAJE sobre el pico de equity, y con lote proporcional un
 * porcentaje ya no escala como una cantidad absoluta.
 *
 * Por eso esta correccion NO se aplica a la puntuacion principal: seria imponer a los
 * datos de cada usuario un modelo estocastico que no podemos comprobar para su EA, y
 * castigar al forward por una suposicion nuestra es exactamente el tipo de cosa que esta
 * aplicacion no debe hacer. Se usa solo como DIAGNOSTICO -para poder decir cuanta de la
 * aparente ventaja del forward viene solo de ser mas corto- y hay que pedirla
 * explicitamente con `adjustRisk`.
 *
 * Lo que si se corrige siempre es el ancla del NUMERO DE OPERACIONES, porque ahi no hay
 * modelo que suponer: las operaciones escalan linealmente con la duracion, es aritmetica.
 * Exigirle 500 operaciones a un tramo que dura la cuarta parte seria pedirle cuatro veces
 * mas frecuencia que al in-sample.
 */
function lengthAdjust(m, ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return m;
  const r = Math.min(20, Math.max(0.05, ratio));
  const k = Math.sqrt(r);
  return {
    ...m,
    drawdown: Number.isFinite(m.drawdown) ? Math.min(100, m.drawdown / k) : m.drawdown,
    recoveryFactor: Number.isFinite(m.recoveryFactor) ? m.recoveryFactor / k : m.recoveryFactor,
    __lengthRatio: r,
  };
}

/**
 * Calidad de un periodo en [0,1]. Media geometrica ponderada: si un solo componente
 * se hunde (por ejemplo 70% de drawdown) la puntuacion entera se hunde, que es
 * justo lo que debe pasar. Una media aritmetica dejaria compensar riesgo con retorno.
 *
 * `lengthRatio` expresa la duracion de ESTE periodo relativa a la de referencia (el
 * in-sample). Se pasa solo para el forward, y ajusta el ancla de operaciones. Con
 * `adjustRisk` ademas reescala drawdown y factor de recuperacion, que es una suposicion
 * fuerte y solo se usa para diagnosticar; ver `lengthAdjust`.
 *
 * Se combina en DOS niveles, los dos geometricos: primero las metricas dentro de su eje,
 * despues los ejes entre si. La media geometrica hace que un componente hundido hunda el
 * conjunto, y aplicarla tambien entre ejes es lo que impide que el retorno compre riesgo.
 */
export function periodQuality(m, policy = DEFAULT_POLICY, scale = null, lengthRatio = NaN, { adjustRisk = false } = {}) {
  const { anchors } = policy;
  const groups = policy.groups || DEFAULT_POLICY.groups;
  const adj = adjustRisk && Number.isFinite(lengthRatio) && lengthRatio > 0 ? lengthAdjust(m, lengthRatio) : m;
  const tradeAnchor = Number.isFinite(lengthRatio) && lengthRatio > 0
    ? { zero: anchors.trades.zero * Math.min(20, Math.max(0.05, lengthRatio)), full: anchors.trades.full * Math.min(20, Math.max(0.05, lengthRatio)) }
    : anchors.trades;
  const raw = {
    profitFactor: linearScore(adj.profitFactor, anchors.profitFactor),
    recoveryFactor: linearScore(adj.recoveryFactor, anchors.recoveryFactor),
    drawdown: linearScore(adj.drawdown, anchors.drawdown),
    sharpe: linearScore(adj.sharpe, anchors.sharpe),
    trades: logScore(adj.trades, tradeAnchor),
    // Beneficio por operacion: no depende de la duracion del periodo, asi que aporta
    // informacion que ninguna de las otras da.
    expectedPayoff: scale ? linearScore(adj.expectedPayoff, scale) : NaN,
  };

  const EPS = 0.02;
  const used = {};
  const axes = {};
  let wsum = 0;
  let acc = 0;

  for (const [name, group] of Object.entries(groups)) {
    let gw = 0;
    let gacc = 0;
    for (const [key, w] of Object.entries(group.metrics)) {
      const sc = raw[key];
      if (!Number.isFinite(sc) || !(w > 0)) continue;
      used[key] = sc;
      gw += w;
      gacc += w * Math.log(Math.max(EPS, sc));
    }
    // Un eje sin ninguna metrica disponible no puntua ni resta: su peso se reparte solo,
    // porque `wsum` solo acumula los ejes que si han podido medirse.
    if (!gw) continue;
    const gs = Math.exp(gacc / gw);
    axes[name] = gs;
    wsum += group.weight;
    acc += group.weight * Math.log(Math.max(EPS, gs));
  }

  if (!wsum) return { score: NaN, parts: used, axes };
  // Un beneficio negativo invalida el periodo entero, aunque los ratios enganen.
  if (Number.isFinite(m.profit) && m.profit <= 0) return { score: 0, parts: used, axes };
  return { score: Math.exp(acc / wsum), parts: used, axes };
}

/** Evalua las puertas absolutas de un periodo. Devuelve la lista de fallos. */
export function gateFailures(m, policy, minTrades) {
  const g = policy.gates;
  const fails = [];
  // Una métrica ausente no es una métrica suspendida: sin columna de beneficio no hay
  // nada que juzgar. Antes esta puerta era la única que no lo comprobaba, y un export
  // sin esa columna hacia suspender al 100 % con un motivo que era falso.
  if (g.requireProfit && Number.isFinite(m.profit) && !(m.profit > 0)) fails.push('beneficio <= 0');
  if (Number.isFinite(m.profitFactor) && m.profitFactor < g.minProfitFactor) fails.push(`PF < ${g.minProfitFactor}`);
  if (Number.isFinite(m.drawdown) && m.drawdown > g.maxDrawdownPct) fails.push(`DD > ${g.maxDrawdownPct}%`);
  if (Number.isFinite(m.trades) && m.trades < minTrades) fails.push(`operaciones < ${Math.round(minTrades)}`);
  return fails;
}

/**
 * Puntuacion combinada de una configuracion.
 * Se toma el MINIMO de los dos periodos, no la media: una configuración vale lo que
 * vale su peor periodo. Promediar permitiria que un IS espectacular tapase un OOS malo.
 */
export function combineScores(qIs, qOos) {
  if (!Number.isFinite(qIs)) return qOos;
  if (!Number.isFinite(qOos)) return qIs;
  return Math.min(qIs, qOos);
}

export function retention(qIs, qOos) {
  if (!Number.isFinite(qIs) || !Number.isFinite(qOos) || qIs <= 0) return NaN;
  return qOos / qIs;
}

/**
 * Ancla del beneficio por operacion, deducida del propio conjunto.
 * Cero en la mediana de los que pierden o empatan, uno en el percentil 90.
 */
export function payoffScale(values) {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (clean.length < 20) return null;
  const at = (q) => clean[Math.max(0, Math.min(clean.length - 1, Math.floor((clean.length - 1) * q)))];
  const zero = Math.max(0, at(0.25));
  const full = at(0.9);
  if (!(full > zero)) return null;
  return { zero, full };
}

/** Etiqueta legible para una puntuacion 0..1. */
export function qualityLabel(score) {
  if (!Number.isFinite(score)) return 'sin datos';
  if (score >= 0.7) return 'excelente';
  if (score >= 0.55) return 'buena';
  if (score >= 0.4) return 'aceptable';
  if (score >= 0.25) return 'debil';
  return 'mala';
}
