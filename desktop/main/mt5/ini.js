// Generación del .ini de Strategy Tester para MT5 (línea de comandos /config).
//
// Cada clave de [Tester] está documentada abajo y registrada en docs/MT5_ASSUMPTIONS.md
// (INI-*). Valores no verificados oficialmente: estado "pendiente".

import { levelsFromRange } from '../../../core/setfile.js';

/**
 * [Tester] keys (MT5 help: configuration file / Strategy Tester):
 *
 * Expert                 — ruta relativa del EA bajo MQL5\Experts (sin extensión o con .ex5)
 * Symbol                 — símbolo (p. ej. EURUSD)
 * Period                 — timeframe: M1,M5,M15,M30,H1,H4,D1,W1,MN1 (también numérico en algunos builds)
 * Model                  — 0=cada tick, 1=1-min OHLC, 2=open prices, 3=math, 4=every tick based on real ticks
 * Optimization           — 0=disabled, 1=complete (slow), 2=genetic (fast)
 * OptimizationCriterion  — 0=balance max, 1=profit factor, 2=expected payoff, … (ver INI-CRIT)
 * FromDate / ToDate      — YYYY.MM.DD
 * ForwardMode            — 0=no, 1=½, 2=⅓, 3=¼, 4=custom date (ForwardDate)
 * ForwardDate            — fecha inicio forward si ForwardMode=4
 * Deposit / Currency / Leverage
 * ExecutionMode          — retardo de ejecución en ms (0 = sin retardo)
 * Report                 — ruta relativa del informe (sin extensión o con; MT5 añade .htm/.xml)
 * ReplaceReport=1        — sobrescribir informe existente
 * ShutdownTerminal=1     — cerrar terminal al terminar el test
 * Visual=0               — sin modo visual
 */

const TESTER_KEYS = [
  'Expert',
  'Symbol',
  'Period',
  'Model',
  'Optimization',
  'OptimizationCriterion',
  'FromDate',
  'ToDate',
  'ForwardMode',
  'ForwardDate',
  'Deposit',
  'Currency',
  'Leverage',
  'ExecutionMode',
  'Report',
  'ReplaceReport',
  'ShutdownTerminal',
  'Visual',
];

function fmtDate(d) {
  if (!d) return '';
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(String(d))) return String(d);
  const s = String(d).trim();
  // ISO YYYY-MM-DD → YYYY.MM.DD
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}.${m[2]}.${m[3]}`;
  return s;
}

/**
 * Formato [TesterInputs]: name=value||start||step||stop||Y|N
 * @param {{ name, value, start?, step?, stop?, optimize?|enabled? }[]} inputs
 */
export function formatTesterInput(inp) {
  const name = String(inp.name || '').trim();
  if (!name) throw new Error('TesterInput sin nombre');
  const value = inp.value ?? inp.start ?? 0;
  const opt = inp.optimize ?? inp.enabled ?? false;
  if (!opt) {
    return `${name}=${value}||0||0||0||N`;
  }
  const start = inp.start ?? value;
  const step = inp.step ?? 1;
  const stop = inp.stop ?? start;
  return `${name}=${value}||${start}||${step}||${stop}||Y`;
}

/**
 * Construye el contenido INI completo.
 * @param {object} opts
 * @param {string} opts.expert
 * @param {string} opts.symbol
 * @param {string} [opts.period='H1']
 * @param {number} [opts.model=1]
 * @param {number} [opts.optimization=1]
 * @param {number} [opts.optimizationCriterion=0]
 * @param {string} opts.fromDate
 * @param {string} opts.toDate
 * @param {number} [opts.forwardMode=0]
 * @param {string} [opts.forwardDate]
 * @param {number} [opts.deposit=10000]
 * @param {string} [opts.currency='USD']
 * @param {string|number} [opts.leverage='1:100']
 * @param {number} [opts.executionMode=0]
 * @param {string} opts.report — ruta del informe (relativa al data path o absoluta según MT5)
 * @param {Array} [opts.inputs=[]]
 * @param {object} [opts.extraTester={}] — claves adicionales [Tester]
 */
export function buildTesterIni(opts = {}) {
  if (!opts.expert) throw new Error('buildTesterIni: falta Expert');
  if (!opts.symbol) throw new Error('buildTesterIni: falta Symbol');
  if (!opts.fromDate || !opts.toDate) throw new Error('buildTesterIni: faltan FromDate/ToDate');
  if (!opts.report) throw new Error('buildTesterIni: falta Report');

  const tester = {
    Expert: opts.expert,
    Symbol: opts.symbol,
    Period: opts.period ?? 'H1',
    Model: opts.model ?? 1,
    Optimization: opts.optimization ?? 1,
    OptimizationCriterion: opts.optimizationCriterion ?? 0,
    FromDate: fmtDate(opts.fromDate),
    ToDate: fmtDate(opts.toDate),
    ForwardMode: opts.forwardMode ?? 0,
    ForwardDate: opts.forwardDate ? fmtDate(opts.forwardDate) : undefined,
    Deposit: opts.deposit ?? 10000,
    Currency: opts.currency ?? 'USD',
    Leverage: opts.leverage ?? '1:100',
    ExecutionMode: opts.executionMode ?? 0,
    Report: opts.report,
    ReplaceReport: 1,
    ShutdownTerminal: 1,
    Visual: 0,
    ...(opts.extraTester || {}),
  };

  // Omitir ForwardDate si no aplica
  if (!tester.ForwardDate || Number(tester.ForwardMode) === 0) {
    delete tester.ForwardDate;
  }

  const lines = ['[Tester]'];
  for (const key of TESTER_KEYS) {
    if (tester[key] === undefined || tester[key] === null) continue;
    lines.push(`${key}=${tester[key]}`);
  }
  // extras no listados
  for (const [k, v] of Object.entries(tester)) {
    if (TESTER_KEYS.includes(k)) continue;
    if (v === undefined || v === null) continue;
    lines.push(`${k}=${v}`);
  }

  const inputs = opts.inputs || [];
  if (inputs.length) {
    lines.push('', '[TesterInputs]');
    for (const inp of inputs) {
      lines.push(formatTesterInput(inp));
    }
  }

  return lines.join('\r\n') + '\r\n';
}

/**
 * Nº de combinaciones de la rejilla para inputs con optimize/enabled = Y.
 * Producto de niveles (inicio/paso/fin). Inputs N no cuentan.
 */
export function estimateCombinations(inputs = []) {
  let total = 1;
  let optimized = 0;
  for (const inp of inputs) {
    const opt = inp.optimize ?? inp.enabled ?? false;
    if (!opt) continue;
    const start = Number(inp.start ?? inp.value);
    const step = Number(inp.step ?? 1);
    const stop = Number(inp.stop ?? start);
    const levels = levelsFromRange(start, step, stop);
    const n = Math.max(1, levels.length);
    optimized++;
    total *= n;
    if (total > 1e12) return { combinations: total, optimizedParams: optimized, capped: true };
  }
  if (optimized === 0) return { combinations: 1, optimizedParams: 0, capped: false };
  return { combinations: total, optimizedParams: optimized, capped: false };
}

export { TESTER_KEYS, fmtDate };
