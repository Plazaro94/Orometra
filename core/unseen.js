// Validación en el periodo no visto.
//
// La pregunta que responde este modulo NO es "¿los numeros son buenos?" sino
// "¿son NORMALES para este EA?".
//
// Un tramo no visto suele ser corto, así que por varianza o por un cambio de regimen
// puede tocarte una mala racha. Eso no invalida nada: lo que invalida es que la mala
// racha sea PEOR que cualquier cosa que el EA ya haya atravesado en el in-sample y en
// el forward. Por eso no se compara contra un objetivo, sino contra el comportamiento
// que la propia meseta ya ha demostrado.
//
// La parte delicada es que no todas las métricas se pueden comparar entre periodos de
// distinta duración, y hacerlo a ojo lleva sistematicamente a la conclusión contraria:
//
//   - El factor de beneficio o el beneficio por operación son por-operación: no
//     dependen de cuántas haya, se comparan tal cual.
//   - El DRAWDOWN MAXIMO crece con el número de operaciones, por acumulacion. Un tramo
//     con la mitad de operaciones debería mostrar un drawdown MENOR solo por ser más
//     corto. Si lo iguala, eso es una señal de alarma, no de tranquilidad.
//   - El factor de recuperacion es beneficio/drawdown: el numerador crece con n y el
//     denominador con la raiz de n, así que crece con la raiz de n.
//
// Se usa la aproximación clasica de paseo aleatorio: la excursion maxima escala con la
// raiz del número de pasos. Es una aproximación, y como tal se declara en la interfaz.

import { quantile, median, extent } from './stats.js';

export const UNSEEN_METRICS = [
  { key: 'profitFactor', label: 'Factor de beneficio', better: 'high', scale: 'none', digits: 3 },
  { key: 'payoffPerTrade', label: 'Beneficio por operación', better: 'high', scale: 'none', digits: 2 },
  { key: 'drawdown', label: 'Drawdown máximo (%)', better: 'low', scale: 'sqrt', digits: 2 },
  { key: 'recoveryFactor', label: 'Factor de recuperación', better: 'high', scale: 'sqrt', digits: 3 },
  { key: 'sharpe', label: 'Sharpe', better: 'high', scale: 'none', digits: 3 },
];

/** Normaliza un valor a "por unidad de raiz de operaciones" cuando la métrica escala. */
function normalize(value, trades, scale) {
  if (!Number.isFinite(value) || !Number.isFinite(trades) || trades <= 0) return NaN;
  return scale === 'sqrt' ? value / Math.sqrt(trades) : value;
}

/** Deshace la normalización para el número de operaciones del periodo no visto. */
function denormalize(normalized, trades, scale) {
  if (!Number.isFinite(normalized)) return NaN;
  return scale === 'sqrt' ? normalized * Math.sqrt(trades) : normalized;
}

function periodMetrics(rec, period) {
  const m = rec[period];
  if (!m) return null;
  const trades = m.trades;
  if (!Number.isFinite(trades) || trades <= 0) return null;
  return {
    trades,
    profitFactor: m.profitFactor,
    payoffPerTrade: Number.isFinite(m.profit) ? m.profit / trades : NaN,
    drawdown: m.drawdown,
    recoveryFactor: m.recoveryFactor,
    sharpe: m.sharpe,
  };
}

/**
 * Reune el comportamiento que la meseta ya ha demostrado: cada configuración aporta
 * una observacion por periodo disponible.
 *
 * Se usa la meseta entera y no solo la configuración elegida por una razon: con dos
 * observaciones (su IS y su OOS) no hay dispersión que estimar. Las vecinas de la
 * meseta son, por construccion, configuraciones equivalentes, así que su recorrido
 * describe el margen de variacion normal del EA.
 */
export function buildReference(analysis, plateau) {
  const members = plateau.indices && plateau.indices.length ? plateau.indices : [plateau.representative];
  const periods = analysis.meta.hasForward ? ['is', 'oos'] : ['is'];
  const observations = [];
  for (const i of members) {
    const rec = analysis.records[i];
    if (!rec) continue;
    for (const p of periods) {
      const m = periodMetrics(rec, p);
      if (m) observations.push({ ...m, period: p });
    }
  }
  return {
    observations,
    periods,
    memberCount: members.length,
    medianTrades: median(observations.map((o) => o.trades)),
  };
}

/**
 * Compara lo observado en el periodo no visto contra esa referencia.
 *
 * @param {object} analysis  resultado de runAnalysis
 * @param {object} plateau   meseta elegida
 * @param {object} observed  { trades, profit, profitFactor, drawdown, recoveryFactor, sharpe }
 */
export function evaluateUnseen(analysis, plateau, observed) {
  const reference = buildReference(analysis, plateau);
  const trades = Number(observed.trades);
  if (!Number.isFinite(trades) || trades <= 0) {
    throw new Error('Hace falta el número de operaciones del periodo no visto: sin él no se puede corregir por duración.');
  }
  if (reference.observations.length < 4) {
    throw new Error('La meseta elegida no tiene suficientes configuraciones para establecer que es normal en este EA.');
  }

  const obs = {
    trades,
    profitFactor: Number(observed.profitFactor),
    payoffPerTrade: Number.isFinite(Number(observed.profit)) ? Number(observed.profit) / trades : NaN,
    drawdown: Number(observed.drawdown),
    recoveryFactor: Number(observed.recoveryFactor),
    sharpe: Number(observed.sharpe),
  };

  const results = [];
  for (const spec of UNSEEN_METRICS) {
    const refNorm = reference.observations
      .map((o) => normalize(o[spec.key], o.trades, spec.scale))
      .filter(Number.isFinite);
    if (refNorm.length < 4 || !Number.isFinite(obs[spec.key])) continue;

    // Banda esperada, ya traida al número de operaciones del periodo no visto.
    const band = {
      min: denormalize(extent(refNorm)[0], trades, spec.scale),
      q10: denormalize(quantile(refNorm, 0.1), trades, spec.scale),
      median: denormalize(median(refNorm), trades, spec.scale),
      q90: denormalize(quantile(refNorm, 0.9), trades, spec.scale),
      max: denormalize(extent(refNorm)[1], trades, spec.scale),
    };
    const value = obs[spec.key];

    let status;
    if (spec.better === 'high') {
      if (value >= band.q10) status = 'normal';
      else if (value >= band.min) status = 'cola';
      else status = 'fuera';
    } else {
      if (value <= band.q90) status = 'normal';
      else if (value <= band.max) status = 'cola';
      else status = 'fuera';
    }

    results.push({
      key: spec.key,
      label: spec.label,
      better: spec.better,
      digits: spec.digits,
      scaled: spec.scale === 'sqrt',
      value,
      band,
      status,
    });
  }

  if (!results.length) {
    throw new Error('No hay ninguna métrica comparable entre el periodo no visto y la referencia.');
  }

  // Potencia del contraste: con pocas operaciones, casi nada quedara fuera de rango.
  const refTrades = reference.medianTrades;
  const tradeShare = Number.isFinite(refTrades) && refTrades > 0 ? trades / refTrades : NaN;
  const lowPower = trades < 30 || (Number.isFinite(tradeShare) && tradeShare < 0.15);

  const outside = results.filter((r) => r.status === 'fuera');
  const tail = results.filter((r) => r.status === 'cola');

  let level;
  let headline;
  if (outside.length) {
    level = 'outside';
    headline = outside.length === 1
      ? `Fuera de lo que este EA había mostrado nunca en ${outside[0].label.toLowerCase()}`
      : `Fuera de rango en ${outside.length} métricas`;
  } else if (tail.length) {
    level = 'tail';
    headline = 'Dentro de lo visto, pero en la parte baja de su historial';
  } else {
    level = 'normal';
    headline = 'El periodo no visto entra dentro de la normalidad del EA';
  }

  const notes = [];
  notes.push(level === 'normal'
    ? 'Ninguna métrica se sale del recorrido que la meseta ya había demostrado. No hacia falta que los numeros fuesen espectaculares: hacia falta que fuesen normales, y lo son.'
    : level === 'tail'
      ? `Todo sigue dentro de lo que el EA ya había atravesado alguna vez, pero rozando su peor cara en: ${tail.map((r) => r.label.toLowerCase()).join(', ')}. Un tramo corto puede dar esto por pura varianza; dos seguidos ya no.`
      : `Hay métricas peores que cualquier cosa vista en el in-sample y en el forward: ${outside.map((r) => r.label.toLowerCase()).join(', ')}. Eso ya no se explica por mala suerte dentro de lo conocido.`);

  const scaledOnes = results.filter((r) => r.scaled);
  if (scaledOnes.length) {
    notes.push(`${scaledOnes.map((r) => r.label.toLowerCase()).join(' y ')} se han corregido por duración: dependen del número de operaciones, así que compararlos en crudo contra un periodo más largo llevaria a la conclusión contraria. La referencia mostrada ya esta ajustada a las ${Math.round(trades)} operaciones de tu tramo.`);
  }
  if (lowPower) {
    notes.push(`Aviso de potencia: con ${Math.round(trades)} operaciones${Number.isFinite(tradeShare) ? ` (un ${(100 * tradeShare).toFixed(0)} % de lo habitual en la referencia)` : ''}, este contraste detecta poco. Que salga "normal" significa sobre todo que no hay evidencia en contra, no que este confirmado.`);
  }

  return {
    level,
    headline,
    notes,
    results,
    trades,
    lowPower,
    tradeShare,
    reference: {
      observations: reference.observations.length,
      members: reference.memberCount,
      periods: reference.periods,
      medianTrades: refTrades,
    },
  };
}
