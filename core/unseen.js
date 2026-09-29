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

import { L } from '../js/i18n.js';
import { quantile, median, extent } from './stats.js';

export const UNSEEN_METRICS = [
  { key: 'profitFactor', label: ['Factor de beneficio', 'Profit factor'], better: 'high', scale: 'none', digits: 3 },
  { key: 'payoffPerTrade', label: ['Beneficio por operación', 'Profit per trade'], better: 'high', scale: 'none', digits: 2 },
  { key: 'drawdown', label: ['Drawdown máximo (%)', 'Maximum drawdown (%)'], better: 'low', scale: 'sqrt', digits: 2 },
  { key: 'recoveryFactor', label: ['Factor de recuperación', 'Recovery factor'], better: 'high', scale: 'sqrt', digits: 3 },
  { key: 'sharpe', label: ['Sharpe', 'Sharpe'], better: 'high', scale: 'none', digits: 3 },
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
    throw new Error(L('Hace falta el número de operaciones del periodo no visto: sin él no se puede corregir por duración.', 'The number of trades of the unseen period is required: without it the duration cannot be corrected.'));
  }
  if (reference.observations.length < 4) {
    throw new Error(L('La meseta elegida no tiene suficientes configuraciones para establecer que es normal en este EA.', 'The chosen plateau does not have enough configurations to establish what is normal for this EA.'));
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
    // 'mejor': mejor que todo lo que el EA había mostrado. No es un fallo, pero tampoco es
    // "normal": hay que decirlo, porque un tramo muy superior al historial suele ser un
    // periodo favorable (o un periodo que no es tan «no visto» como se cree).
    if (spec.better === 'high') {
      if (value > band.max) status = 'mejor';
      else if (value >= band.q10) status = 'normal';
      else if (value >= band.min) status = 'cola';
      else status = 'fuera';
    } else {
      if (value < band.min) status = 'mejor';
      else if (value <= band.q90) status = 'normal';
      else if (value <= band.max) status = 'cola';
      else status = 'fuera';
    }

    results.push({
      key: spec.key,
      label: L(spec.label[0], spec.label[1]),
      better: spec.better,
      digits: spec.digits,
      scaled: spec.scale === 'sqrt',
      value,
      band,
      status,
    });
  }

  if (!results.length) {
    throw new Error(L('No hay ninguna métrica comparable entre el periodo no visto y la referencia.', 'There is no comparable metric between the unseen period and the reference.'));
  }

  // Potencia del contraste: con pocas operaciones, casi nada quedara fuera de rango.
  const refTrades = reference.medianTrades;
  const tradeShare = Number.isFinite(refTrades) && refTrades > 0 ? trades / refTrades : NaN;
  const lowPower = trades < 30 || (Number.isFinite(tradeShare) && tradeShare < 0.15);

  const outside = results.filter((r) => r.status === 'fuera');
  const above = results.filter((r) => r.status === 'mejor');
  const tail = results.filter((r) => r.status === 'cola');

  let level;
  let headline;
  if (outside.length) {
    level = 'outside';
    headline = outside.length === 1
      ? L(`Fuera de lo que este EA había mostrado nunca en ${outside[0].label.toLowerCase()}`, `Outside anything this EA had ever shown in ${outside[0].label.toLowerCase()}`)
      : L(`Fuera de rango en ${outside.length} métricas`, `Out of range in ${outside.length} metrics`);
  } else if (tail.length) {
    level = 'tail';
    headline = L('Dentro de lo visto, pero en la parte baja de su historial', 'Within what was seen, but at the low end of its history');
  } else {
    level = 'normal';
    headline = above.length
      ? L(`Nada por debajo de lo normal del EA, y ${above.length === 1 ? 'una métrica mejor' : `${above.length} métricas mejores`} que todo lo visto`,
        `Nothing below what is normal for this EA, and ${above.length === 1 ? 'one metric better' : `${above.length} metrics better`} than anything seen`)
      : L('El periodo no visto no contradice lo que el EA ya había mostrado', 'The unseen period does not contradict what the EA had already shown');
  }

  const listEs = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}` : xs.join(''));
  const listEn = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs.join(''));
  const notes = [];
  notes.push(level === 'normal' && above.length
    ? L(`Ninguna métrica queda por debajo de lo que la meseta ya había demostrado, y ${listEs(above.map((r) => r.label.toLowerCase()))} ${above.length === 1 ? 'supera' : 'superan'} todo lo visto en el in-sample y en el forward. Eso no es un fallo, pero tampoco demuestra más ventaja: lo habitual es que el tramo haya sido especialmente favorable. Espera en vivo algo más cercano al rango habitual, no a estas cifras. Y comprueba que este periodo no se solapa con el in-sample ni con el forward: un periodo «no visto» que en realidad sí se usó da justo esto.`,
      `No metric falls below what the plateau had already shown, and ${listEn(above.map((r) => r.label.toLowerCase()))} ${above.length === 1 ? 'exceeds' : 'exceed'} anything seen in the in-sample and the forward. That is not a failure, but it does not show more edge either: usually the period was especially favorable. Expect live results closer to the usual range, not these figures. And check that this period does not overlap the in-sample or the forward: an "unseen" period that was actually used produces exactly this.`)
    : level === 'normal'
    ? L('Ninguna métrica se sale del recorrido que la meseta ya había demostrado. No hacía falta que los números fuesen espectaculares: hacía falta que no contradijeran lo visto, y no lo contradicen.',
      'No metric leaves the range the plateau had already shown. The numbers did not need to be spectacular: they needed not to contradict what was seen, and they do not.')
    : level === 'tail'
      ? L(`Todo sigue dentro de lo que el EA ya había atravesado alguna vez, pero rozando su peor cara en: ${tail.map((r) => r.label.toLowerCase()).join(', ')}. Un tramo corto puede dar esto por pura varianza; dos seguidos ya no.`,
        `Everything is still within what the EA had gone through at some point, but close to its worst side in: ${tail.map((r) => r.label.toLowerCase()).join(', ')}. A short period can do this by pure variance; two in a row cannot.`)
      : L(`Hay métricas peores que cualquier cosa vista en el in-sample y en el forward: ${outside.map((r) => r.label.toLowerCase()).join(', ')}. Eso ya no se explica por mala suerte dentro de lo conocido.`,
        `Some metrics are worse than anything seen in the in-sample and the forward: ${outside.map((r) => r.label.toLowerCase()).join(', ')}. That is no longer explained by bad luck within what is known.`));

  // Alcance del contraste, medido con datos simulados de verdad conocida (bench/unseen.js).
  notes.push(L('Alcance de este contraste: es una prueba de sentido común, no una confirmación. En simulaciones con verdad conocida avisó en 4 de cada 10 casos en que la ventaja había caído (49 % si desapareció del todo, 38 % si se redujo a la mitad) y dio falsa alarma en algo más de 1 de cada 5 cuando la ventaja se mantenía. Que salga «no contradice» significa que no hay evidencia en contra, no que la estrategia esté confirmada; que avise sí merece atención.',
    'Scope of this check: it is a common-sense test, not a confirmation. In simulations with known truth it flagged 4 in 10 cases where the edge had dropped (49% if it vanished entirely, 38% if it was halved) and gave a false alarm in a bit over 1 in 5 when the edge held. A “does not contradict” result means there is no evidence against, not that the strategy is confirmed; a warning does deserve attention.'));

  const scaledOnes = results.filter((r) => r.scaled);
  if (scaledOnes.length) {
    notes.push(L(`${scaledOnes.map((r) => r.label.toLowerCase()).join(' y ')} se han corregido por duración: dependen del número de operaciones, así que compararlos en crudo contra un periodo más largo llevaría a la conclusión contraria. La referencia mostrada ya está ajustada a las ${Math.round(trades)} operaciones de tu tramo.`,
      `${scaledOnes.map((r) => r.label.toLowerCase()).join(' and ')} were corrected for duration: they depend on the number of trades, so comparing them raw against a longer period would lead to the opposite conclusion. The reference shown is already adjusted to the ${Math.round(trades)} trades of your period.`));
  }
  if (lowPower) {
    notes.push(L(`Aviso de potencia: con ${Math.round(trades)} operaciones${Number.isFinite(tradeShare) ? ` (un ${(100 * tradeShare).toFixed(0)} % de lo habitual en la referencia)` : ''}, este contraste detecta poco. Que salga "normal" significa sobre todo que no hay evidencia en contra, no que esté confirmado.`,
      `Power warning: with ${Math.round(trades)} trades${Number.isFinite(tradeShare) ? ` (${(100 * tradeShare).toFixed(0)}% of what is usual in the reference)` : ''}, this check detects little. A "normal" result mostly means there is no evidence against, not that it is confirmed.`));
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
