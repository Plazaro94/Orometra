/**
 * Avisos de datos derivados del historial de operaciones.
 *
 * Existió también aquí una auditoría de estructura de riesgo (martingala, grid,
 * posiciones sin stop): se retiró porque necesitaba el lote y el stop loss de cada
 * posición abierta, algo que la sonda MQL5 (retirada) sí exponía pero que la tabla de
 * transacciones del informe HTML de MT5 no trae. No se reintroduce con datos a medias.
 */
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
