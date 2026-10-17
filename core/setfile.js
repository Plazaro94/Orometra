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
 * @returns {{complete:boolean, entries:Array<{name:string,text:string,source:'optimized'|'base'}>, optimized:number, fromSet:number, mismatch?:boolean}}
 */
export function mergeSetValues(names, texts, baseSet) {
  const chosen = new Map(names.map((n, j) => [n, texts[j]]));
  const base = baseSet && Array.isArray(baseSet.params) ? baseSet.params : [];
  const alone = { complete: false, entries: names.map((n, j) => ({ name: n, text: texts[j], source: 'optimized' })), optimized: names.length, fromSet: 0 };
  if (!base.length) return alone;
  // Un .set que no menciona ninguno de los parámetros optimizados es de otro EA: mezclarlo
  // daría un .set con los parámetros de los dos y una nota que lo llamaría completo.
  if (names.length && !names.some((n) => base.some((p) => p.name === n))) return { ...alone, mismatch: true };
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
 * ¿Es este .set el de la optimización? Cruza los parámetros del export con los del .set,
 * por nombre. 'none': ninguno está en el .set (otro EA); 'partial': faltan algunos (otra
 * versión, o un parámetro renombrado); 'ok': están todos; null si no hay con qué cruzar.
 *
 * @param {string[]} paramNames  parámetros del export
 * @param {{params:Array}|null} setFile
 * @returns {{status:'ok'|'partial'|'none', total:number, missing:string[]}|null}
 */
export function setMatch(paramNames, setFile) {
  const names = Array.isArray(paramNames) ? paramNames : [];
  if (!names.length || !setFile || !Array.isArray(setFile.params) || !setFile.params.length) return null;
  const inSet = new Set(setFile.params.map((p) => p.name));
  const missing = names.filter((n) => !inSet.has(n));
  const status = missing.length === 0 ? 'ok' : missing.length === names.length ? 'none' : 'partial';
  return { status, total: names.length, missing };
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

/** Enum de MT5 cuyos valores entre inicio y fin se cuentan uno a uno (p. ej. de H1 a H4). */
const ENUM_SPAN_LIMIT = 64;

/**
 * Rango optimizado de un booleano o de una enumeración (paso 0), o null si no lo es.
 * @param {object} entry           línea del .set ya leída
 * @param {number} observedDistinct valores distintos vistos en el export
 * @returns {{kind:'bool'|'enum', levels:number, approximate:boolean, contains:(v:any)=>boolean}|null}
 */
export function discreteRange(entry, observedDistinct = 0) {
  const { start, stop, step } = entry;
  if (typeof start === 'boolean' && typeof stop === 'boolean') {
    return {
      kind: 'bool',
      levels: start === stop ? 1 : 2,
      approximate: false,
      contains: (v) => typeof v === 'boolean' && (start === stop ? v === start : true),
    };
  }
  if (Number.isFinite(start) && Number.isFinite(stop) && step === 0 && start !== stop) {
    const lo = Math.min(start, stop);
    const hi = Math.max(start, stop);
    const contains = (v) => Number.isFinite(v) && v >= lo - 1e-9 && v <= hi + 1e-9;
    if (Number.isInteger(lo) && Number.isInteger(hi) && hi - lo + 1 <= ENUM_SPAN_LIMIT) {
      return { kind: 'enum', levels: hi - lo + 1, approximate: false, contains };
    }
    return { kind: 'enum', levels: Math.max(2, observedDistinct), approximate: true, contains };
  }
  return null;
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
    } else if (entry.hasRange && entry.enabled && discreteRange(entry, observed.size)) {
      // Booleano o enumeración optimizados. MT5 los guarda así (visto en un .set real):
      //   InpUseFilter=false||false||0||true||Y      (booleano: de false a true)
      //   InpTrendTF=16385||16385||0||16388||Y       (enum: paso 0, de H1 a H4)
      // y prueba todos los valores entre inicio y fin. Antes se tomaban como fijos y la
      // cobertura salía hasta 32 veces más pequeña de lo real.
      const d = discreteRange(entry, observed.size);
      searchCartesian *= d.levels;
      optimisedInSet++;
      let outside = 0;
      for (const row of paramMatrix) if (!d.contains(row[j])) outside++;
      dims.push({
        name,
        role: 'optimised',
        kind: d.kind,
        start: entry.start,
        stop: entry.stop,
        searchLevels: d.levels,
        // Enumeración con valores muy separados (p. ej. de M1 a H4): no se sabe cuántos
        // miembros tiene el enum entre medias; se cuentan los vistos.
        approximate: d.approximate,
        observedDistinct: observed.size,
        outsideCount: outside,
        onGridCount: paramMatrix.length - outside,
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

