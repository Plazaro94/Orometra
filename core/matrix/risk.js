/**
 * Auditoría de estructura de riesgo (vetos duros).
 */

/**
 * @param passRisk { maxConcurrent, minLot, maxLot, lotVaries, noStopTrades, totalTrades, weekendCross }
 */
export function auditRiskStructure(passRisk, opts = {}) {
  const findings = [];
  const hardVetos = [];

  const maxC = passRisk.maxConcurrent ?? 0;
  const minLot = passRisk.minLot ?? NaN;
  const maxLot = passRisk.maxLot ?? NaN;
  const lotVaries = Boolean(passRisk.lotVaries);
  const noStop = passRisk.noStopTrades ?? 0;
  const total = passRisk.totalTrades ?? 0;
  const weekend = passRisk.weekendCross ?? 0;

  if (lotVaries && Number.isFinite(minLot) && Number.isFinite(maxLot) && minLot > 0 && maxLot / minLot >= (opts.martingaleRatio ?? 2)) {
    const f = {
      code: 'MARTINGALE_LIKE',
      severity: 'veto',
      title: 'Posible martingala / interés compuesto en el lote',
      detail: `El lote varía de ${minLot} a ${maxLot}. Las curvas pueden verse bien hasta que quiebran.`,
    };
    findings.push(f);
    hardVetos.push(f);
  }

  if (maxC >= (opts.gridConcurrent ?? 5)) {
    const f = {
      code: 'GRID_AVERAGING',
      severity: 'veto',
      title: 'Muchas posiciones simultáneas (grid / promediado)',
      detail: `Máximo de posiciones abiertas a la vez: ${maxC}.`,
    };
    findings.push(f);
    hardVetos.push(f);
  }

  if (total > 0 && noStop / total >= (opts.noStopFrac ?? 0.5)) {
    const f = {
      code: 'NO_STOPLOSS',
      severity: 'veto',
      title: 'Gran parte de las operaciones sin stop loss',
      detail: `${noStop} de ${total} sin SL detectado en historial.`,
    };
    findings.push(f);
    hardVetos.push(f);
  }

  if (weekend > 0 && weekend >= (opts.weekendWarn ?? 1)) {
    findings.push({
      code: 'WEEKEND_HOLD',
      severity: 'warn',
      title: 'Operaciones que cruzan el fin de semana',
      detail: `${weekend} operaciones cruzan el fin de semana (riesgo de gaps).`,
    });
  }

  if (passRisk.exposureNote) {
    findings.push({
      code: 'EXPOSURE',
      severity: 'info',
      title: 'Exposición',
      detail: String(passRisk.exposureNote),
    });
  }

  return {
    findings,
    hardVetos,
    veto: hardVetos.length > 0,
  };
}

/** Avisos de datos: swaps, ticks, huella. */
export function dataWarnings({
  swapPctOfPnl = 0,
  avgTradeDays = 0,
  mixedTickQuality = false,
  fingerprintMismatch = false,
}) {
  const w = [];
  if (swapPctOfPnl > 0.15 || (avgTradeDays >= 1 && swapPctOfPnl > 0.05)) {
    w.push({
      code: 'SWAP_DOMINANCE',
      severity: 'warn',
      detail: 'El tester aplica swaps actuales a todo el histórico; el swap pesa en el resultado.',
    });
  }
  if (mixedTickQuality) {
    w.push({
      code: 'MIXED_TICKS',
      severity: 'warn',
      detail: 'Heurística: el periodo podría mezclar tramos con ticks reales y generados.',
    });
  }
  if (fingerprintMismatch) {
    w.push({
      code: 'DATA_FINGERPRINT',
      severity: 'warn',
      detail: 'La huella de datos difiere entre experimentos de la misma estrategia.',
    });
  }
  return w;
}
