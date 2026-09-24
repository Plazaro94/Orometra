// core/matrix: análisis del historial de operaciones del periodo no visto.
//
// Hubo aquí también CSCV/PBO real, DSR publicado y walk-forward multiventana: los tres
// necesitaban una curva de equity por cada configuración de la rejilla, y la única
// fuente de eso era la sonda MQL5 (retirada junto con Desktop). Sin ella habría que
// fingir con las métricas agregadas del export de optimización, y eso es exactamente
// lo que este proyecto se niega a hacer. Ver docs/CHANGELOG.md.
export { applyCostStress, costScenarios, breakEvenExtraCostPerTrade } from './costs.js';
export { stationaryBootstrap } from './bootstrap.js';
export { sampleAudit, powerAgainstZero, minBtl, meanConfidenceInterval } from './sample.js';
export { dataWarnings } from './risk.js';
export { dailySeriesFromDeals, auditUnseenTrades } from './from-deals.js';
export * from './util.js';
