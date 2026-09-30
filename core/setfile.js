// Parser del .set de MT5 (rangos de optimización) y contraste de cobertura.
//
// El export de optimización solo muestra lo que el algoritmo LLEGO A PROBAR.
// El .set con el que lanzaste la optimización declara el espacio que PEDISTE:
//   nombre=valor||inicio||paso||fin||Y
// Sin ese contraste, un genético denso en un rincón puede parecer "rejilla".

import { toNumber } from './parse.js';

/** Token de .set: bool, numero, o texto. */
export function parseSetToken(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^true$/i.test(s)) return true;
  if (/^false$/i.test(s)) return false;
  const n = toNumber(s);
  if (Number.isFinite(n) && /^-?\d/.test(s.replace(/\s/g, ''))) return n;
  return s;
}

/**
 * Lee un fichero .set (texto). Ignora comentarios `;`.
 * @returns {{ params: Array<{name,value,start?,step?,stop?,enabled?,hasRange:boolean}> }}
 */
export function parseSetText(text) {
  const params = [];
  const lines = String(text || '').split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith(';')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const name = t.slice(0, eq).trim();
    if (!name) continue;
    const rest = t.slice(eq + 1).trim();
    const parts = rest.split('||');
    if (parts.length >= 5) {
      const value = parseSetToken(parts[0]);
      const start = parseSetToken(parts[1]);
      const step = parseSetToken(parts[2]);
      const stop = parseSetToken(parts[3]);
      const enabled = /^Y/i.test(String(parts[4]).trim());
      params.push({
        name,
        value,
        raw: String(parts[0]).trim(),
        start,
        step,
        stop,
        enabled,
        hasRange: true,
      });
    } else {
      params.push({
        name,
        value: parseSetToken(parts[0]),
        raw: String(parts[0]).trim(),
        hasRange: false,
        enabled: false,
      });
    }
  }
  return { params };
}

/**
 * El export de optimización solo trae los parámetros que se OPTIMIZARON (en una
 * optimización real: 8 de 78), así que un .set hecho solo con él deja sin tocar el resto
 * al cargarlo en MT5. El .set con el que se lanzó la optimización sí los trae todos, con el
 * valor que tenían en cada pasada: con él se completa.
 *
 * @param {string[]} names   parámetros optimizados (los del export)
 * @param {string[]} texts   su valor elegido, ya en formato MT5
 * @param {{params:Array}|null} baseSet  el .set de la optimización, si se ha soltado
 * @returns {{complete:boolean, entries:Array<{name:string,text:string,source:'optimized'|'base'}>, optimized:number, fromSet:number}}
 */
export function mergeSetValues(names, texts, baseSet) {
  const chosen = new Map(names.map((n, j) => [n, texts[j]]));
  const base = baseSet && Array.isArray(baseSet.params) ? baseSet.params : [];
  if (!base.length) {
    return { complete: false, entries: names.map((n, j) => ({ name: n, text: texts[j], source: 'optimized' })), optimized: names.length, fromSet: 0 };
  }
  const entries = [];
  const used = new Set();
  for (const p of base) {
    if (used.has(p.name)) continue;
    used.add(p.name);
    if (chosen.has(p.name)) entries.push({ name: p.name, text: chosen.get(p.name), source: 'optimized' });
    else entries.push({ name: p.name, text: p.raw !== undefined && p.raw !== '' ? p.raw : String(p.value), source: 'base' });
  }
  // Un parámetro del export que el .set no menciona (p. ej. renombrado) se conserva.
  for (const n of names) if (!used.has(n)) entries.push({ name: n, text: chosen.get(n), source: 'optimized' });
  const fromSet = entries.filter((e) => e.source === 'base').length;
  return { complete: true, entries, optimized: entries.length - fromSet, fromSet };
}

/**
 * Parámetros que NO se optimizaron y en los que el backtest del periodo no visto difiere
 * del .set de la optimización: otra gestión del riesgo o del lote invalida la comparación
 * aunque los parámetros optimizados coincidan.
 */
export function compareOtherParams(reportParams, baseSet, optimizedNames) {
  const out = [];
  if (!baseSet || !Array.isArray(baseSet.params)) return out;
  const skip = new Set(optimizedNames || []);
  for (const p of baseSet.params) {
    if (skip.has(p.name) || !(p.name in reportParams)) continue;
    const a = String(reportParams[p.name]).trim().toLowerCase();
    const b = String(p.raw !== undefined && p.raw !== '' ? p.raw : p.value).trim().toLowerCase();
    const na = toNumber(a);
    const nb = toNumber(b);
    const equal = Number.isFinite(na) && Number.isFinite(nb) ? Math.abs(na - nb) <= 1e-9 * Math.max(1, Math.abs(na)) : a === b;
    if (!equal) out.push({ name: p.name, report: reportParams[p.name], set: p.raw !== undefined && p.raw !== '' ? p.raw : p.value });
  }
  return out;
}

/** Niveles numericos generados por inicio/paso/fin (como MT5 en rejilla). */
export function levelsFromRange(start, step, stop) {
  if (!Number.isFinite(start) || !Number.isFinite(stop)) return [];
  if (!Number.isFinite(step) || step === 0) return [start];
  const out = [];
  const eps = Math.max(1e-12, Math.abs(step) * 1e-9);
  if (step > 0) {
    for (let v = start; v <= stop + eps; v += step) {
      out.push(Number(v.toPrecision(12)));
      if (out.length > 50000) break;
    }
  } else {
    for (let v = start; v >= stop - eps; v += step) {
      out.push(Number(v.toPrecision(12)));
      if (out.length > 50000) break;
    }
  }
  if (!out.length) out.push(start);
  return out;
}

function sameValue(a, b) {
  if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b);
  if (typeof a === 'string' || typeof b === 'string') return String(a) === String(b);
  if (Number.isFinite(a) && Number.isFinite(b)) {
    const scale = Math.max(1, Math.abs(a), Math.abs(b));
    return Math.abs(a - b) <= 1e-9 * scale;
  }
  return a === b;
}

function inNumericRange(v, start, stop, step) {
  if (!Number.isFinite(v) || !Number.isFinite(start) || !Number.isFinite(stop)) return false;
  const lo = Math.min(start, stop);
  const hi = Math.max(start, stop);
  if (v < lo - 1e-9 || v > hi + 1e-9) return false;
  if (!Number.isFinite(step) || step === 0) return sameValue(v, start);
  const k = (v - start) / step;
  return Math.abs(k - Math.round(k)) < 1e-6;
}

/**
 * Contrasta las pasadas observadas con el espacio declarado en el .set.
 *
 * @param {string[]} paramNames
 * @param {any[][]} paramMatrix  records.map(r => r.params)
 * @param {{params: object[]}|null} setFile
 * @returns {object|null}
 */
export function coverageAgainstSet(paramNames, paramMatrix, setFile) {
  if (!setFile || !setFile.params || !setFile.params.length || !paramNames.length) return null;

  const byName = new Map(setFile.params.map((p) => [p.name, p]));
  const dims = [];
  let searchCartesian = 1;
  let matched = 0;
  let missingInSet = [];
  let optimisedInSet = 0;

  for (let j = 0; j < paramNames.length; j++) {
    const name = paramNames[j];
    const entry = byName.get(name);
    if (!entry) {
      missingInSet.push(name);
      dims.push({ name, role: 'missing', levels: 1 });
      continue;
    }
    matched++;
    const observed = new Set();
    for (const row of paramMatrix) {
      const v = row[j];
      observed.add(typeof v === 'number' && Number.isFinite(v) ? Number(v.toPrecision(12)) : String(v));
    }

    if (entry.hasRange && entry.enabled
      && Number.isFinite(entry.start) && Number.isFinite(entry.stop)
      && Number.isFinite(entry.step) && entry.step !== 0) {
      const levels = levelsFromRange(entry.start, entry.step, entry.stop);
      const nLevels = Math.max(1, levels.length);
      searchCartesian *= nLevels;
      optimisedInSet++;
      let outside = 0;
      let onGrid = 0;
      for (const row of paramMatrix) {
        const v = row[j];
        if (!inNumericRange(v, entry.start, entry.stop, entry.step)) outside++;
        else onGrid++;
      }
      dims.push({
        name,
        role: 'optimised',
        start: entry.start,
        step: entry.step,
        stop: entry.stop,
        searchLevels: nLevels,
        observedDistinct: observed.size,
        outsideCount: outside,
        onGridCount: onGrid,
      });
    } else {
      // Fijo o no optimizado en el .set: no multiplica el espacio de búsqueda.
      dims.push({
        name,
        role: entry.hasRange && !entry.enabled ? 'fixed' : 'value',
        value: entry.value,
        observedDistinct: observed.size,
        searchLevels: 1,
      });
    }
  }

  if (optimisedInSet === 0 || searchCartesian <= 1) {
    return {
      present: true,
      usable: false,
      reason: 'no_optimised_ranges',
      matched,
      missingInSet,
      dims,
      searchCartesian: NaN,
      coverageSearch: NaN,
      uniqueObserved: paramMatrix.length,
    };
  }

  // Celdas unicas observadas (tras colapsar duplicados de params).
  const uniq = new Set();
  for (const row of paramMatrix) {
    uniq.add(paramNames.map((_, j) => {
      const v = row[j];
      return typeof v === 'number' && Number.isFinite(v) ? Number(v.toPrecision(12)) : String(v);
    }).join('\u0001'));
  }
  const uniqueObserved = uniq.size;
  const coverageSearch = searchCartesian > 0 ? uniqueObserved / searchCartesian : NaN;
  const outsideAny = dims.some((d) => d.role === 'optimised' && d.outsideCount > 0);

  return {
    present: true,
    usable: true,
    matched,
    missingInSet,
    dims,
    optimisedDims: optimisedInSet,
    searchCartesian,
    uniqueObserved,
    coverageSearch,
    outsideAny,
    fileParams: setFile.params.length,
  };
}

/** Heurística rápida: ¿parece un .set de MT5? */
export function looksLikeSetFile(name, text) {
  if (/\.set$/i.test(name || '')) return true;
  const head = String(text || '').slice(0, 4000);
  if (!head) return false;
  // Al menos una linea name=...||...||...||...||Y/N
  return /^[A-Za-z_][\w]*\s*=\s*.+\|\|.+\|\|.+\|\|.+\|\|[YN]/im.test(head);
}

/**
 * Convierte params de parseSetText al formato [TesterInputs] de buildTesterIni.
 * Añade OrometraExperimentId fijo si se pasa experimentId.
 */
export function setParamsToTesterInputs(setFile, opts = {}) {
  const params = setFile?.params || [];
  const inputs = params.map((p) => {
    if (p.hasRange && p.enabled) {
      return {
        name: p.name,
        value: p.value ?? p.start,
        start: p.start,
        step: p.step,
        stop: p.stop,
        optimize: true,
      };
    }
    return {
      name: p.name,
      value: p.value,
      optimize: false,
    };
  });
  if (opts.experimentId) {
    inputs.push({
      name: 'OrometraExperimentId',
      value: String(opts.experimentId),
      optimize: false,
    });
  }
  return inputs;
}

