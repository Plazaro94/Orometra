/**
 * Veredicto integrado Fase 5: Descartar / Investigar más / Apto para incubación.
 * Nunca «apto para real».
 */

import { L } from '../js/i18n.js';

export const VERDICT = {
  DISCARD: 'discard',
  INVESTIGATE: 'investigate',
  INCUBATE: 'incubate',
};

/**
 * @param ctx {
 *   riskVeto, costStillProfitableModerate, pbo, dsr,
 *   reservedOk, sampleInsufficient, plateauOk,
 *   thresholdPerturbationChanged
 * }
 */
export function integratedVerdict(ctx) {
  const reasons = [];
  const cards = [];

  const addCard = (id, traffic, line) => cards.push({ id, traffic, line });

  if (ctx.riskVeto) {
    reasons.push(L(
      'Estructura de riesgo peligrosa (martingala, grid o sin stops).',
      'Dangerous risk structure (martingale, grid, or no stops).',
    ));
  }
  if (ctx.costStillProfitableModerate === false) {
    reasons.push(L(
      'La ventaja desaparece con costes moderados.',
      'The edge disappears under moderate costs.',
    ));
  }
  if (Number.isFinite(ctx.pbo) && ctx.pbo >= 0.5) {
    reasons.push(L(
      `PBO elevado (${(100 * ctx.pbo).toFixed(0)} %).`,
      `High PBO (${(100 * ctx.pbo).toFixed(0)}%).`,
    ));
  }
  if (ctx.reservedOk === false) {
    reasons.push(L(
      'El periodo reservado queda fuera de lo esperado.',
      'The reserved period falls outside expectations.',
    ));
  }
  if (Number.isFinite(ctx.dsr) && ctx.dsr < 0.05) {
    reasons.push(L(
      'Deflated Sharpe muy bajo tras corregir por selección.',
      'Very low Deflated Sharpe after selection correction.',
    ));
  }

  const hardDiscard = Boolean(
    ctx.riskVeto
    || ctx.costStillProfitableModerate === false
    || (Number.isFinite(ctx.pbo) && ctx.pbo >= 0.6)
    || ctx.reservedOk === false,
  );

  let level;
  if (hardDiscard) {
    level = VERDICT.DISCARD;
  } else if (ctx.sampleInsufficient || ctx.plateauOk === false || reasons.length > 0) {
    level = VERDICT.INVESTIGATE;
    if (ctx.sampleInsufficient) {
      reasons.push(L(
        'La muestra no alcanza para distinguir la ventaja de cero.',
        'Sample size cannot distinguish the edge from zero.',
      ));
    }
  } else {
    level = VERDICT.INCUBATE;
  }

  addCard('plateau', ctx.plateauOk ? 'green' : 'yellow',
    ctx.plateauOk
      ? L('Hay región estable en parámetros.', 'Stable parameter region found.')
      : L('Meseta débil o ausente.', 'Weak or missing plateau.'));
  addCard('oos', Number.isFinite(ctx.pbo) && ctx.pbo < 0.45 ? 'green' : 'yellow',
    Number.isFinite(ctx.pbo)
      ? L(`PBO (CSCV) = ${(100 * ctx.pbo).toFixed(0)} %.`, `PBO (CSCV) = ${(100 * ctx.pbo).toFixed(0)}%.`)
      : L('PBO no calculable sin matriz.', 'PBO not computable without matrix.'));
  addCard('costs', ctx.costStillProfitableModerate !== false ? 'green' : 'red',
    ctx.costStillProfitableModerate === false
      ? L('Falla stress de costes moderado.', 'Fails moderate cost stress.')
      : L('Aguanta costes moderados (aprox.).', 'Survives moderate costs (approx.).'));
  addCard('risk', ctx.riskVeto ? 'red' : 'green',
    ctx.riskVeto
      ? L('Veto de estructura de riesgo.', 'Risk-structure veto.')
      : L('Sin veto de estructura.', 'No structure veto.'));
  addCard('sample', ctx.sampleInsufficient ? 'yellow' : 'green',
    ctx.sampleInsufficient
      ? L('Evidencia de muestra insuficiente.', 'Insufficient sample evidence.')
      : L('Muestra suficiente para el listón.', 'Sample adequate for the bar.'));
  addCard('reserved', ctx.reservedOk === false ? 'red' : (ctx.reservedOk ? 'green' : 'yellow'),
    ctx.reservedOk === false
      ? L('Periodo reservado anómalo.', 'Reserved period anomalous.')
      : ctx.reservedOk
        ? L('Periodo reservado dentro de banda.', 'Reserved period within band.')
        : L('Periodo reservado aún no evaluado.', 'Reserved period not yet evaluated.'));

  const headlines = {
    [VERDICT.DISCARD]: L('Descartar', 'Discard'),
    [VERDICT.INVESTIGATE]: L('Investigar más / evidencia insuficiente', 'Investigate further / insufficient evidence'),
    [VERDICT.INCUBATE]: L('Apto para incubación', 'Fit for incubation'),
  };

  return {
    level,
    headline: headlines[level],
    neverLive: true,
    neverLiveNote: L(
      'Nunca se emite «apto para real». La incubación es la siguiente prueba.',
      'Never emits “fit for live”. Incubation is the next test.',
    ),
    reasons,
    cards,
    searchCounter: ctx.searchCounter || null,
    thresholdFragile: Boolean(ctx.thresholdPerturbationChanged),
    preregistrationHash: ctx.preregistrationHash || null,
    preregistrationModifiedAfterResults: Boolean(ctx.preregistrationModifiedAfterResults),
  };
}

/** Perfiles de listón (pre-registro). */
export const PROFILES = {
  prudent: {
    id: 'prudent',
    minProfitFactor: 1.3,
    maxDrawdownPct: 15,
    minTrades: 200,
    maxPbo: 0.4,
    minDsr: 0.1,
    painDd: null,
  },
  standard: {
    id: 'standard',
    minProfitFactor: 1.2,
    maxDrawdownPct: 20,
    minTrades: 100,
    maxPbo: 0.5,
    minDsr: 0.05,
    painDd: null,
  },
  exploratory: {
    id: 'exploratory',
    minProfitFactor: 1.1,
    maxDrawdownPct: 30,
    minTrades: 50,
    maxPbo: 0.55,
    minDsr: 0.02,
    painDd: null,
  },
};

export function hashPreregistration(obj) {
  // FNV-1a 32-bit sobre JSON estable
  const s = JSON.stringify(obj);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
