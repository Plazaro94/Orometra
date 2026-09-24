// Clasificación de columnas y emparejado IS/OOS.
//
// Principio de diseño: NO se identifican los parámetros por su nombre. Los nombres
// dependen del EA y del idioma del terminal. Se identifican por ESTRUCTURA: para un
// mismo Pass, un parámetro vale lo mismo en el archivo IS y en el OOS, mientras que
// una métrica cambia porque se ha medido sobre otro periodo.

import { toNumber } from './parse.js';

/** Roles canonicos. Cada patron cubre terminal en ingles y en espanol. */
const METRIC_PATTERNS = [
  ['forwardResult', /^(forward\s*result|resultado\s*(del\s*)?forward|resultado\s*adelante)$/i],
  ['backResult', /^(back\s*result|resultado\s*(del\s*)?back(test)?|resultado\s*atras)$/i],
  ['result', /^(result|resultado)$/i],
  ['profit', /^(net\s*)?(profit|beneficio|ganancia|benefici[oa]\s*neto)$/i],
  ['expectedPayoff', /^(expected\s*payoff|beneficio\s*esperado|esperanza\s*matem)/i],
  ['profitFactor', /^(profit\s*factor|factor\s*de\s*(beneficio|ganancia|rentabilidad|lucro))$/i],
  ['recoveryFactor', /^(recovery\s*factor|factor\s*de\s*recuperaci)/i],
  ['sharpe', /sharpe/i],
  ['custom', /^(custom|personalizado|criterio\s*personalizado)$/i],
  ['drawdown', /(equity|balance)?\s*(dd\s*%?|drawdown|draw\s*down)|ca[ií]da\s*(de\s*)?(capital|balance)|reducci[oó]n/i],
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
    throw new Error('No se encuentra la columna "Pass" (el número de pasada) en alguno de los archivos. Sin ella no se pueden emparejar el in-sample y el forward. ¿Seguro que ambos son exportaciones del probador de estrategias?');
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
  for (const row of isTable.rows) {
    const key = String(row[isId]).trim();
    const other = oosIdx.map.get(key);
    if (other) matched.push({ id: key, isRow: row, oosRow: other });
    else unmatchedIs.push(key);
  }
  if (!matched.length) {
    throw new Error('Ninguna pasada coincide entre los dos archivos: parecen de optimizaciones distintas. Deben ser el in-sample y el forward de la MISMA ejecucion.');
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
    throw new Error('No se ha identificado ningún parámetro comun. Comprueba que ambos archivos pertenecen a la misma optimizacion.');
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
