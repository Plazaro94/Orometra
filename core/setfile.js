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
        hasRange: false,
        enabled: false,
      });
    }
  }
  return { params };
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
