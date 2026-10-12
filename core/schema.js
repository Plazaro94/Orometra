// Clasificación de columnas y emparejado IS/OOS.
//
// Principio de diseño: NO se identifican los parámetros por su nombre. Los nombres
// dependen del EA y del idioma del terminal. Se identifican por ESTRUCTURA: para un
// mismo Pass, un parámetro vale lo mismo en el archivo IS y en el OOS, mientras que
// una métrica cambia porque se ha medido sobre otro periodo.

import { L, localeTag } from '../js/i18n.js';
import { AnalysisError, CODE } from './errors.js';
import { toNumber } from './parse.js';

/**
 * Roles canonicos. Cada patron cubre terminal en ingles y en espanol.
 *
 * Todos van anclados al PRINCIPIO del nombre: un nombre de columna reconocido como
 * métrica nunca se trata como parámetro, así que un patrón suelto se come parámetros
 * legítimos ("AddLots", "HiddenSL" o "InpMaxDD" contienen "dd"; "UseSharpeFilter"
 * contiene "sharpe"). Las cabeceras de MT5 empiezan siempre por el nombre de la métrica.
 */
const METRIC_PATTERNS = [
  ['forwardResult', /^(forward\s*result|resultado\s*(del\s*)?forward|resultado\s*adelante)$/i],
  ['backResult', /^(back\s*result|resultado\s*(del\s*)?back(test)?|resultado\s*atras)$/i],
  ['result', /^(result|resultado)$/i],
  ['profit', /^(net\s*)?(profit|beneficio|ganancia|benefici[oa]\s*neto)$/i],
  ['expectedPayoff', /^(expected\s*payoff|beneficio\s*esperado|esperanza\s*matem[aá]tica)$/i],
  ['profitFactor', /^(profit\s*factor|factor\s*de\s*(beneficio|ganancia|rentabilidad|lucro))$/i],
  ['recoveryFactor', /^(recovery\s*factor|factor\s*de\s*recuperaci[oó]n)$/i],
  ['sharpe', /^(sharpe(\s*ratio)?|(ratio|coeficiente|[ií]ndice)\s*de\s*sharpe)$/i],
  ['custom', /^(custom|personalizado|criterio\s*personalizado)$/i],
  // "Equity DD %", "Balance DD %", "Drawdown %", "Max Drawdown", "Reducción de la equidad %"…
  // Tras la palabra clave solo se admite espacio, "%" o fin: "DD_Limit" o "Drawdowns" no.
  ['drawdown', /^(max(imal|imum)?\s+)?((equity|balance)\s+)?(dd|drawdown|draw\s*down)(\s|%|$)|^(reducci[oó]n|ca[ií]da)(\s|%|$)/i],
  ['trades', /^(total\s*)?(trades|deals|operaciones|transacciones|negociaciones|# ?deals)$/i],
];

const ID_PATTERN = /^(pass|pasada|prueba|#|id)$/i;

export function metricRole(header) {
  const h = String(header).trim();
  for (const [role, re] of METRIC_PATTERNS) if (re.test(h)) return role;
  return null;
}

function columnValues(table, colIndex) {
  const out = new Array(table.rows.length);
  for (let i = 0; i < table.rows.length; i++) out[i] = table.rows[i][colIndex];
  return out;
}

function findIdColumn(table) {
  for (let i = 0; i < table.headers.length; i++) if (ID_PATTERN.test(table.headers[i])) return i;
  // Sin cabecera reconocible: la primera columna de enteros sin repeticiones.
  for (let i = 0; i < table.headers.length; i++) {
    const vals = columnValues(table, i).map(toNumber);
    if (vals.every((v) => Number.isInteger(v)) && new Set(vals).size === vals.length) return i;
  }
  return -1;
}

/**
 * Números de pasada de un solo archivo, tal como los escribe MT5 en su columna «Pass».
 *
 * MT5 no exporta las pasadas en orden (sobre todo en el genético): la posición de la fila
 * NO es la pasada. Antes, sin forward, se numeraba por posición y el informe recomendaba
 * una «pasada» que en MT5 era otra configuración, o no existía. Si el archivo no trae esa
 * columna, o le faltan valores, o se repiten, se numera por fila (1, 2, 3…) y se dice.
 *
 * @returns {{ ids: string[], source: 'pass'|'row'|'pass-incomplete'|'pass-duplicated' }}
 */
export function passIds(table) {
  const byRow = () => table.rows.map((_, i) => String(i + 1));
  const col = table.headers.findIndex((h) => ID_PATTERN.test(String(h).trim()));
  if (col < 0) return { ids: byRow(), source: 'row' };
  const ids = table.rows.map((r) => String(r[col] ?? '').trim());
  if (ids.some((x) => x === '')) return { ids: byRow(), source: 'pass-incomplete' };
  if (new Set(ids).size !== ids.length) return { ids: byRow(), source: 'pass-duplicated' };
  return { ids, source: 'pass' };
}

/**
 * Un número que una pasada normal de MT5 no produce: subnormales (|x| < 1e-300) o enteros
 * de más de 15 cifras. Son los bits de un entero leídos como decimal, o al revés: se vio en
 * un forward real dañado (2026-10-11), con «4616189618054758400» (= 4.0) o «9.88e-324» (= 2).
 */
export function isImpossibleNumber(v) {
  return typeof v === 'number' && v !== 0 && Number.isFinite(v)
    && (Math.abs(v) < 1e-300 || (Number.isInteger(v) && Math.abs(v) > 1e15));
}

/**
 * Filas dañadas de un export: sin número de pasada o con algún valor imposible.
 * @returns {{ rows:number, damaged:number, example:number|null }}
 */
function isDamagedRow(table, row, idCol = table.headers.findIndex((h) => ID_PATTERN.test(String(h).trim()))) {
  const noId = idCol >= 0 && (row[idCol] === null || row[idCol] === undefined || String(row[idCol]).trim() === '');
  return noId || row.some(isImpossibleNumber);
}

export function damageReport(table) {
  const idCol = table.headers.findIndex((h) => ID_PATTERN.test(String(h).trim()));
  let damaged = 0;
  let example = null;
  for (const row of table.rows) {
    if (isDamagedRow(table, row, idCol)) {
      damaged++;
      const bad = row.find(isImpossibleNumber);
      if (example === null && bad !== undefined) example = bad;
    }
  }
  return { rows: table.rows.length, damaged, example };
}

/**
 * Filtro de filas dañadas. Si son el 1 % o más, el export entero es sospechoso y el análisis
 * para (antes, un forward dañado salía como «los archivos no encajan», que no era verdad, o
 * se analizaba en silencio con las pocas filas sanas). Si son menos, se quitan esas filas y se
 * cuenta: con un beneficio de 4,6·10^18 dentro, una fila suelta podía encabezar el ranking.
 * @param {'is'|'oos'} which
 * @returns {{ table: object, dropped: number }}
 */
/**
 * Pasadas que MT5 ocultó en la tabla de la optimización (FWD-4 en docs/MT5_ASSUMPTIONS.md).
 *
 * Con la opción del probador que omite los resultados inútiles, el export de la optimización
 * no trae ninguna pasada con pérdidas, y el del forward sí las trae, pero con la celda de la
 * pasada vacía. No es un export dañado: esas filas están completas y sanas. Se reconocen por
 * su firma, y solo si se cumple entera (si no, siguen siendo «dañadas»):
 *   - en el forward, las filas sin pasada no tienen ningún valor imposible;
 *   - ninguna de sus configuraciones está en el export de la optimización;
 *   - el export de la optimización no trae ninguna pasada con beneficio ≤ 0.
 * Se apartan (no se pueden emparejar) y se cuentan, para avisar de que sin ellas las
 * vecinas que perdieron dinero salen como «no probadas».
 *
 * @returns {{ table: object, hidden: number }}
 */
export function screenHiddenLosers(isTable, oosTable) {
  const none = { table: oosTable, hidden: 0 };
  if (!isTable || !oosTable) return none;
  const idOf = (t) => t.headers.findIndex((h) => ID_PATTERN.test(String(h).trim()));
  const idOos = idOf(oosTable);
  if (idOos < 0) return none;
  const empty = (v) => v === null || v === undefined || String(v).trim() === '';
  const unnumbered = oosTable.rows.filter((r) => empty(r[idOos]));
  if (!unnumbered.length || unnumbered.some((r) => r.some(isImpossibleNumber))) return none;
  const profitIs = isTable.headers.findIndex((h) => metricRole(h) === 'profit');
  if (profitIs < 0) return none;
  const isProfits = isTable.rows.map((r) => toNumber(r[profitIs]));
  if (!isProfits.length || isProfits.some((p) => !Number.isFinite(p) || p <= 0)) return none;
  // Parámetros: columnas que están en los dos archivos y no son métricas ni la pasada.
  const shared = isTable.headers
    .map((h, i) => ({ h: String(h).trim(), i }))
    .filter(({ h }) => !ID_PATTERN.test(h) && !metricRole(h))
    .map(({ h, i }) => ({ is: i, oos: oosTable.headers.findIndex((x) => String(x).trim() === h) }))
    .filter((c) => c.oos >= 0);
  if (!shared.length) return none;
  const key = (r, side) => shared.map((c) => String(r[c[side]] ?? '').trim()).join('\u0000');
  const inIs = new Set(isTable.rows.map((r) => key(r, 'is')));
  if (unnumbered.some((r) => inIs.has(key(r, 'oos')))) return none;
  return { table: { ...oosTable, rows: oosTable.rows.filter((r) => !empty(r[idOos])) }, hidden: unnumbered.length };
}

export function screenDamaged(table, which) {
  const r = damageReport(table);
  if (!r.rows || r.damaged === 0) return { table, dropped: 0 };
  if (r.damaged / r.rows >= 0.01) {
    const n = r.damaged.toLocaleString(localeTag());
    const m = r.rows.toLocaleString(localeTag());
    const ex = r.example !== null ? r.example.toExponential(2) : null;
    throw new AnalysisError(CODE.FILE_ERROR, L(
      `El export ${which === 'oos' ? 'del forward' : 'de la optimización'} está dañado: en ${n} de ${m} filas falta el número de pasada o hay valores que MT5 no genera en una pasada normal${ex ? ` (por ejemplo, ${ex.replace('.', ',')})` : ''}. Así no se puede analizar. Vuelve a exportar esa tabla desde MT5; si sale igual, repite la optimización y expórtala de nuevo.`,
      `The ${which === 'oos' ? 'forward' : 'optimization'} export is damaged: in ${n} of ${m} rows the pass number is missing or there are values MT5 does not produce in a normal pass${ex ? ` (for example, ${ex})` : ''}. It cannot be analyzed like this. Export that table from MT5 again; if it comes out the same, run the optimization again and re-export it.`,
    ), { reason: 'damagedExport', which, damaged: r.damaged, rows: r.rows, noHint: true });
  }
  return { table: { ...table, rows: table.rows.filter((row) => !isDamagedRow(table, row)) }, dropped: r.damaged };
}

/** Indexa una tabla por su columna identificadora. */
function indexById(table, idCol) {
  const map = new Map();
  let duplicates = 0;
  for (const row of table.rows) {
    const key = String(row[idCol]).trim();
    if (map.has(key)) duplicates++;
    else map.set(key, row);
  }
  return { map, duplicates };
}

/**
 * Empareja los dos archivos y deduce que columnas son parametros.
 * Devuelve también el informe de integridad que la interfaz debe mostrar.
 */
export function pairTables(isTable, oosTable) {
  const isId = findIdColumn(isTable);
  const oosId = findIdColumn(oosTable);
  if (isId < 0 || oosId < 0) {
    throw new AnalysisError(CODE.SCHEMA_ERROR, L('No se encuentra la columna «Pass» (el número de pasada) en alguno de los archivos. Sin ella no se pueden emparejar la optimización y el forward. ¿Seguro que ambos son exportaciones del probador de estrategias?', 'The "Pass" column (the pass number) is missing in one of the files. Without it the optimization and forward cannot be matched. Are both files exports from the strategy tester?'));
  }

  const isIdx = indexById(isTable, isId);
  const oosIdx = indexById(oosTable, oosId);

  const commonHeaders = [];
  const vetoed = [];
  for (let i = 0; i < isTable.headers.length; i++) {
    const h = isTable.headers[i].trim();
    const j = oosTable.headers.findIndex((x) => x.trim().toLowerCase() === h.toLowerCase());
    if (j < 0 || i === isId) continue;
    // Una métrica reconocida nunca es un parámetro, aunque sea constante y por tanto
    // identica en ambos periodos (el caso típico es "Custom" a cero).
    const role = metricRole(h);
    if (role) {
      vetoed.push({ name: isTable.headers[i], role });
      continue;
    }
    commonHeaders.push({ name: isTable.headers[i], isCol: i, oosCol: j });
  }

  const matched = [];
  const unmatchedIs = [];
  const unmatchedRows = [];
  for (const row of isTable.rows) {
    const key = String(row[isId]).trim();
    const other = oosIdx.map.get(key);
    if (other) matched.push({ id: key, isRow: row, oosRow: other });
    else {
      unmatchedIs.push(key);
      unmatchedRows.push({ id: key, isRow: row });
    }
  }
  if (!matched.length) {
    throw new AnalysisError(CODE.SCHEMA_ERROR, L('Ninguna pasada coincide entre los dos archivos: parecen de optimizaciones distintas. Deben ser la optimización y el forward de la MISMA ejecución.', 'No pass matches between the two files: they look like different optimizations. They must be the optimization and forward of the SAME run.'));
  }

  // Prueba estructural: un parámetro no cambia entre periodos; una métrica si.
  const paramColumns = [];
  const metricLikeCommon = [];
  for (const col of commonHeaders) {
    let identical = 0;
    let comparable = 0;
    for (const m of matched) {
      const a = toNumber(m.isRow[col.isCol]);
      const b = toNumber(m.oosRow[col.oosCol]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        // Comparacion textual para parámetros no numericos (por ejemplo enumeraciones).
        const sa = String(m.isRow[col.isCol] ?? '').trim();
        const sb = String(m.oosRow[col.oosCol] ?? '').trim();
        if (sa !== '' || sb !== '') {
          comparable++;
          if (sa === sb) identical++;
        }
        continue;
      }
      comparable++;
      if (Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a))) identical++;
    }
    const ratio = comparable ? identical / comparable : 0;
    if (ratio > 0.999) paramColumns.push({ ...col, identityRatio: ratio });
    else metricLikeCommon.push({ ...col, identityRatio: ratio });
  }

  if (!paramColumns.length) {
    throw new AnalysisError(CODE.SCHEMA_ERROR, L('No se ha identificado ningún parámetro común. Comprueba que ambos archivos pertenecen a la misma optimización.', 'No common parameter was identified. Check that both files belong to the same optimization.'));
  }

  // Prueba de procedencia: el "Back Result" del forward debe reproducir el "Result" del IS.
  const isResultCol = isTable.headers.findIndex((h) => metricRole(h) === 'result');
  const backResultCol = oosTable.headers.findIndex((h) => metricRole(h) === 'backResult');
  let provenance = { checked: false, mismatches: 0, ratio: NaN, compared: 0 };
  if (isResultCol >= 0 && backResultCol >= 0) {
    let mism = 0;
    let comp = 0;
    for (const m of matched) {
      const a = toNumber(m.isRow[isResultCol]);
      const b = toNumber(m.oosRow[backResultCol]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      comp++;
      if (Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(a))) mism++;
    }
    provenance = { checked: true, mismatches: mism, ratio: comp ? 1 - mism / comp : NaN, compared: comp };
  }

  return {
    matched,
    unmatchedRows,
    paramColumns,
    metricLikeCommon,
    vetoed,
    integrity: {
      vetoed,
      isRows: isTable.rows.length,
      oosRows: oosTable.rows.length,
      matchedRows: matched.length,
      unmatchedIs: unmatchedIs.length,
      duplicateIds: isIdx.duplicates + oosIdx.duplicates,
      provenance,
    },
  };
}

/** Localiza las métricas por rol dentro de una tabla. */
export function metricColumns(table) {
  const roles = {};
  table.headers.forEach((h, i) => {
    const role = metricRole(h);
    if (role && roles[role] === undefined) roles[role] = { name: h, col: i };
  });
  return roles;
}

/** Métricas sin las cuales los mínimos no se pueden aplicar. */
export const KEY_METRICS = ['profit', 'profitFactor', 'drawdown', 'trades'];

/** Qué métricas clave no se han reconocido en las cabeceras de una tabla. */
export function missingKeyMetrics(table) {
  const roles = metricColumns(table);
  return KEY_METRICS.filter((k) => !roles[k]);
}

/** Resumen de una tabla para la comprobación previa (mismo cálculo en el hilo y en el worker). */
export function preflightSummary(table) {
  return {
    rows: table.rows.length,
    cols: table.headers.length,
    params: inferParamsSingle(table).params.length,
    metrics: Object.keys(metricColumns(table)).length,
    missing: missingKeyMetrics(table),
    format: table.format || 'table',
  };
}

/**
 * Rol del archivo por cabeceras: forward trae Forward Result / Back Result.
 * Usar DESPUES de parsear (también .xlsx); no basta con mirar bytes de un ZIP.
 */
export function roleFromTable(table) {
  if (!table || !table.headers) return 'is';
  for (const h of table.headers) {
    const role = metricRole(h);
    if (role === 'forwardResult' || role === 'backResult') return 'oos';
  }
  return 'is';
}

/**
 * Detección de parámetros con UN SOLO archivo (modo global, sin forward).
 * Heurística: no métrica, baja cardinalidad; acepta numéricos, bool y enums cortos.
 */
export function inferParamsSingle(table) {
  const n = table.rows.length;
  const limit = Math.max(2, Math.min(80, Math.floor(n / 3)));
  const params = [];
  const rejected = [];
  table.headers.forEach((h, i) => {
    if (ID_PATTERN.test(h)) return;
    if (metricRole(h)) {
      rejected.push({ name: h, reason: 'métrica reconocida' });
      return;
    }
    const raw = columnValues(table, i);
    const asNum = raw.map(toNumber);
    const finite = asNum.filter(Number.isFinite);
    if (finite.length >= n * 0.9) {
      const uniq = new Set(finite).size;
      if (uniq > limit) {
        rejected.push({ name: h, reason: `demasiados valores distintos (${uniq})` });
        return;
      }
      params.push({ name: h, isCol: i, oosCol: i, levels: uniq });
      return;
    }
    // Bool / enum: cardinalidad baja sobre valores canónicos no nulos.
    const cats = raw
      .map((v) => (v === null || v === undefined || v === '' ? null : String(v).trim()))
      .filter((v) => v != null);
    if (cats.length < n * 0.9) {
      rejected.push({ name: h, reason: 'no numerica' });
      return;
    }
    const uniqCat = new Set(cats.map((v) => v.toLowerCase())).size;
    if (uniqCat < 2 || uniqCat > Math.min(12, limit)) {
      rejected.push({ name: h, reason: `cardinalidad categorica inutil (${uniqCat})` });
      return;
    }
    params.push({ name: h, isCol: i, oosCol: i, levels: uniqCat });
  });
  return { params, rejected };
}

/**
 * Estima la duración relativa del OOS respecto al IS usando el número de operaciones.
 * Sin fechas en el archivo, es la única referencia disponible; sirve para escalar
 * los mínimos de operaciones y para avisar si el forward es demasiado corto.
 */
export function estimatePeriodRatio(records) {
  const pairs = records.filter((r) => Number.isFinite(r.is.trades) && Number.isFinite(r.oos.trades) && r.is.trades > 0);
  if (pairs.length < 10) return NaN;
  const ratios = pairs.map((r) => r.oos.trades / r.is.trades).sort((a, b) => a - b);
  return ratios[Math.floor(ratios.length / 2)];
}
