// Historial local de análisis: lo puro (sin DOM ni almacenamiento). La interfaz que lo
// guarda en el navegador y lo pinta está en js/ui-history.js.
//
// Qué se guarda de cada análisis: un resumen de 1-2 KB (archivos, parámetros, mínimos,
// nivel, configuración recomendada y el rango de su meseta). Nunca los archivos ni las
// tablas: nada sale del equipo y no hay forma de rehacer el informe sin volver a soltarlos.
//
// Para qué sirve:
//   1. Comparar con el análisis anterior del MISMO EA: sobre todo, si la configuración que
//      se recomienda ahora cae dentro de la meseta que se encontró la otra vez.
//   2. Contar los intentos. Reoptimizar una y otra vez sobre los mismos datos hasta que el
//      nivel sube no es más evidencia: es probar más veces. El recuento lo hace visible.
//
// Qué NO se puede saber: el XML de MT5 no trae el nombre del EA, ni el símbolo, ni las
// fechas. «El mismo EA» se reconoce por sus parámetros (huella), y si dos análisis son del
// mismo periodo no consta: la interfaz lo dice así, sin suponerlo.

export const HISTORY_VERSION = 1;
/** Análisis que se conservan (los más antiguos salen primero). */
export const HISTORY_MAX = 50;
/** A partir de este intento sobre el mismo EA se avisa de que probar más veces no es evidencia. */
export const ATTEMPT_WARN = 3;
export const LEVEL_ORDER = ['insufficient', 'weak', 'moderate', 'good', 'strong'];

/** Hash FNV-1a de 32 bits en hexadecimal: corto y estable entre navegadores. */
function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Huella del EA: el conjunto de nombres de sus parámetros, sin importar el orden ni las
 * mayúsculas. Dos exportaciones del mismo EA dan la misma huella aunque cambien los rangos.
 */
export function fingerprint(paramNames) {
  const names = [...new Set((paramNames || []).map((n) => String(n).trim().toLowerCase()).filter(Boolean))].sort();
  return `p${fnv1a(names.join('|'))}`;
}

const round = (v, d) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);
const jsonSafe = (v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v);

/**
 * Resumen de un análisis para el historial.
 * @param {object} analysis  resultado de runAnalysis
 * @param {{id: string, at: string, level: string, files: {is: string, oos?: string|null}}} ctx
 *   `level` es el nivel MOSTRADO (displayVerdictLevel), no el del motor.
 */
export function summarize(analysis, ctx) {
  const meta = analysis.meta || {};
  const gates = (meta.policy && meta.policy.gates) || {};
  const best = (analysis.plateaus || [])[0] || null;
  const fb = analysis.fallback || null;
  return {
    v: HISTORY_VERSION,
    id: ctx.id,
    at: ctx.at,
    fp: fingerprint(meta.paramNames),
    params: [...(meta.paramNames || [])],
    files: { is: (ctx.files && ctx.files.is) || '', oos: (ctx.files && ctx.files.oos) || null },
    gates: {
      requireProfit: Boolean(gates.requireProfit),
      minProfitFactor: jsonSafe(gates.minProfitFactor ?? null),
      maxDrawdownPct: jsonSafe(gates.maxDrawdownPct ?? null),
      minTrades: jsonSafe(gates.minTrades ?? null),
    },
    hasForward: Boolean(meta.hasForward),
    total: Number.isFinite(meta.total) ? meta.total : null,
    level: ctx.level,
    pick: best ? {
      pass: best.record.id,
      values: best.record.params.map(jsonSafe),
      size: best.size,
      robust: round(best.robust, 1),
      qIs: round(best.record.qualityIs, 3),
      qOos: round(best.record.qualityOos, 3),
      span: (best.paramSpan || []).map((s) => (s ? { min: jsonSafe(s.min), max: jsonSafe(s.max) } : null)),
    } : null,
    fallback: !best && fb ? { pass: fb.record.id, values: fb.record.params.map(jsonSafe) } : null,
    unseen: null,
  };
}

/** Un almacén vacío: ajustes y la lista de análisis. */
export function emptyStore() {
  return { v: HISTORY_VERSION, off: false, seen: false, labels: {}, entries: [] };
}

/** Lee el almacén guardado; si está roto o es de otra versión, uno vacío (nunca lanza). */
export function parseStore(text) {
  if (!text) return emptyStore();
  try {
    const s = JSON.parse(text);
    if (!s || typeof s !== 'object' || s.v !== HISTORY_VERSION || !Array.isArray(s.entries)) return emptyStore();
    return {
      v: HISTORY_VERSION,
      off: Boolean(s.off),
      seen: Boolean(s.seen),
      labels: s.labels && typeof s.labels === 'object' ? s.labels : {},
      entries: s.entries.filter((e) => e && typeof e === 'object' && typeof e.id === 'string' && typeof e.fp === 'string'),
    };
  } catch {
    return emptyStore();
  }
}

const sameGates = (a, b) => ['requireProfit', 'minProfitFactor', 'maxDrawdownPct', 'minTrades'].every((k) => (a || {})[k] === (b || {})[k]);

/**
 * Añade un análisis. Si es literalmente el mismo que el último de ese EA (mismos archivos,
 * mismos mínimos, mismas filas y misma recomendación: recargar la página y volver a
 * analizar), lo sustituye en vez de contarlo como otro intento. Conserva los `max` más
 * recientes. No modifica `entries`.
 */
export function addEntry(entries, entry, max = HISTORY_MAX) {
  const list = [...entries];
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (e.fp !== entry.fp) continue;
    const same = e.files && entry.files && e.files.is === entry.files.is && e.files.oos === entry.files.oos
      && sameGates(e.gates, entry.gates) && e.total === entry.total
      && (e.pick ? e.pick.pass : null) === (entry.pick ? entry.pick.pass : null);
    if (same) {
      list.splice(i, 1);
      // Si al anterior ya se le había añadido el periodo no visto, no se pierde.
      if (e.unseen && !entry.unseen) entry = { ...entry, unseen: e.unseen };
    }
    break;
  }
  list.push(entry);
  return list.slice(-max);
}

/** Análisis de ese EA (huella), del más antiguo al más reciente. */
export function entriesFor(entries, fp) {
  return entries.filter((e) => e.fp === fp);
}

/** El análisis anterior del mismo EA (el más reciente antes de `entry`), o null. */
export function previousFor(entries, entry) {
  const same = entriesFor(entries, entry.fp);
  const i = same.findIndex((e) => e.id === entry.id);
  const before = i >= 0 ? same.slice(0, i) : same.filter((e) => e.id !== entry.id);
  return before.length ? before[before.length - 1] : null;
}

/** Cuántos análisis hay de ese EA, contando el actual si ya está guardado. */
export function attempts(entries, fp) {
  return entriesFor(entries, fp).length;
}

/** ¿Cae `value` dentro del tramo [min, max]? Números con tolerancia; el resto, igualdad. */
export function insideSpan(value, span) {
  if (!span) return false;
  const { min, max } = span;
  if (typeof value === 'number' && typeof min === 'number' && typeof max === 'number') {
    const tol = 1e-9 * Math.max(1, Math.abs(min), Math.abs(max));
    return value >= min - tol && value <= max + tol;
  }
  return value === min || value === max;
}

/**
 * Compara el análisis actual con el anterior del mismo EA.
 *
 * Lo central es `params`: para cada parámetro, el valor que se recomienda AHORA y si cae
 * dentro del tramo que ocupaba la meseta recomendada LA OTRA VEZ. Los números de pasada no
 * se comparan: cada optimización de MT5 numera las suyas desde cero.
 *
 * `levelsComparable` es falso si cambiaron los mínimos o la presencia de forward: con otras
 * reglas, un nivel distinto no dice nada del EA.
 */
export function compare(prev, cur) {
  const gatesSame = sameGates(prev.gates, cur.gates);
  const forwardSame = prev.hasForward === cur.hasForward;
  const reasons = [];
  if (!gatesSame) reasons.push('gates');
  if (!forwardSame) reasons.push('forward');
  const iPrev = LEVEL_ORDER.indexOf(prev.level);
  const iCur = LEVEL_ORDER.indexOf(cur.level);
  let params = [];
  if (prev.pick && cur.pick) {
    params = cur.params.map((name, j) => {
      const k = prev.params.indexOf(name);
      const span = k >= 0 && prev.pick.span ? prev.pick.span[k] : null;
      const now = cur.pick.values[j];
      return {
        name,
        now,
        before: k >= 0 ? prev.pick.values[k] : null,
        span,
        inside: span ? insideSpan(now, span) : false,
      };
    });
  }
  return {
    prevId: prev.id,
    prevAt: prev.at,
    gatesSame,
    forwardSame,
    sameFiles: Boolean(prev.files && cur.files && prev.files.is === cur.files.is && prev.files.oos === cur.files.oos),
    levelsComparable: reasons.length === 0,
    reasons,
    levelBefore: prev.level,
    levelNow: cur.level,
    levelDelta: iPrev >= 0 && iCur >= 0 ? iCur - iPrev : null,
    bothPicks: Boolean(prev.pick && cur.pick),
    params,
    insideCount: params.filter((p) => p.inside).length,
    sizeBefore: prev.pick ? prev.pick.size : null,
    sizeNow: cur.pick ? cur.pick.size : null,
    robustBefore: prev.pick ? prev.pick.robust : null,
    robustNow: cur.pick ? cur.pick.robust : null,
  };
}
