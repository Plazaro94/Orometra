// API del ledger: estrategias, experimentos, contador de búsqueda, backup.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { newId, nowIso } from './db.js';

function parseJson(s, fallback = null) {
  try { return JSON.parse(s); } catch { return fallback; }
}

/** Contador de búsqueda honesto por estrategia (effectiveTrials = n/d hasta Fase 4). */
export function getSearchCounter(db, strategyId) {
  const experiments = db.prepare(
    'SELECT COUNT(*) AS n FROM experiment WHERE strategy_id = ?',
  ).get(strategyId).n;
  const eaVersions = db.prepare(
    'SELECT COUNT(*) AS n FROM ea_version WHERE strategy_id = ?',
  ).get(strategyId).n;
  const passes = db.prepare(
    'SELECT COALESCE(SUM(n_passes), 0) AS n FROM experiment WHERE strategy_id = ? AND n_passes IS NOT NULL',
  ).get(strategyId).n;
  const strategy = db.prepare('SELECT * FROM strategy WHERE id = ?').get(strategyId);
  const priorApprox = strategy?.prior_search_approx;
  const priorNote = strategy?.prior_search_note ?? '';
  return {
    strategyId,
    experiments,
    eaVersions,
    totalPasses: passes,
    // Fase 4 calculará el nº efectivo de pruebas; hasta entonces no se inventa.
    effectiveTrials: null,
    effectiveTrialsNote: 'pending_phase_4',
    declaredPriorSearch: {
      note: priorNote,
      approx: priorApprox == null ? null : priorApprox,
    },
    // Suma declarada + pasadas en Orometra (honesto: lo declarado es aparte).
    displayTotal: {
      inOrometraPasses: passes,
      declaredOutside: priorApprox,
    },
  };
}

export function listStrategies(db) {
  const rows = db.prepare('SELECT * FROM strategy ORDER BY created_at DESC').all();
  return rows.map((s) => ({
    ...s,
    counter: getSearchCounter(db, s.id),
  }));
}

export function getStrategy(db, id) {
  const s = db.prepare('SELECT * FROM strategy WHERE id = ?').get(id);
  if (!s) return null;
  return { ...s, counter: getSearchCounter(db, id) };
}

/**
 * priorSearchNote obligatorio (p. ej. "0", "no lo sé", "unos 200 backtests").
 * priorSearchApprox: número o null si no se sabe.
 */
export function createStrategy(db, {
  name,
  hypothesis = '',
  priorSearchNote,
  priorSearchApprox = null,
}) {
  if (!name || !String(name).trim()) throw new Error('El nombre de la estrategia es obligatorio.');
  if (priorSearchNote == null || !String(priorSearchNote).trim()) {
    throw new Error('Debes declarar la búsqueda previa fuera de Orometra (puede ser «0» o «no lo sé»).');
  }
  const note = String(priorSearchNote).trim();
  let approx = priorSearchApprox;
  if (approx === '' || approx === undefined) approx = null;
  if (approx != null) {
    approx = Number(approx);
    if (!Number.isFinite(approx) || approx < 0) throw new Error('El nº aproximado de pruebas previas no es válido.');
  }
  // Si escribió solo un número en la nota y no pasó approx, úsalo.
  if (approx == null && /^\d+$/.test(note)) approx = Number(note);

  const id = newId('str');
  const createdAt = nowIso();
  db.prepare(`
    INSERT INTO strategy (id, name, hypothesis, prior_search_note, prior_search_approx, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, String(name).trim(), String(hypothesis || ''), note, approx, createdAt);
  return getStrategy(db, id);
}

export function listExperiments(db, strategyId) {
  return db.prepare(`
    SELECT e.*,
      (SELECT summary_json FROM result r WHERE r.experiment_id = e.id ORDER BY r.created_at DESC LIMIT 1) AS latest_summary_json
    FROM experiment e
    WHERE e.strategy_id = ?
    ORDER BY e.created_at DESC
  `).all(strategyId).map((e) => ({
    ...e,
    config: parseJson(e.config_json, {}),
    latestSummary: parseJson(e.latest_summary_json, null),
    latest_summary_json: undefined,
    config_json: undefined,
  }));
}

export function createEaVersion(db, {
  strategyId,
  path: eaPath = null,
  sourceHash = null,
  binaryHash = null,
  note = '',
  parentVersionId = null,
}) {
  const id = newId('ea');
  const createdAt = nowIso();
  db.prepare(`
    INSERT INTO ea_version (id, strategy_id, path, source_hash, binary_hash, note, parent_version_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, strategyId, eaPath, sourceHash, binaryHash, note, parentVersionId, createdAt);
  return db.prepare('SELECT * FROM ea_version WHERE id = ?').get(id);
}

/**
 * Pre-registro de umbrales (Fase 5): congela listón antes de ver resultados.
 * @param {object} db
 * @param {{ strategyId: string, thresholdsJson?: string|object, thresholds?: object, hash: string }} opts
 */
export function createPreregistration(db, {
  strategyId,
  thresholdsJson = null,
  thresholds = null,
  hash,
}) {
  if (!strategyId) throw new Error('Indica la estrategia del pre-registro.');
  if (!getStrategy(db, strategyId)) throw new Error('Estrategia no encontrada.');
  if (!hash || !String(hash).trim()) throw new Error('Falta el hash del pre-registro.');

  let jsonStr;
  if (thresholdsJson != null) {
    jsonStr = typeof thresholdsJson === 'string' ? thresholdsJson : JSON.stringify(thresholdsJson);
  } else if (thresholds != null) {
    jsonStr = typeof thresholds === 'string' ? thresholds : JSON.stringify(thresholds);
  } else {
    throw new Error('Faltan umbrales (thresholds o thresholdsJson).');
  }
  try {
    JSON.parse(jsonStr);
  } catch {
    throw new Error('thresholdsJson no es JSON válido.');
  }

  const id = newId('pre');
  const createdAt = nowIso();
  db.prepare(`
    INSERT INTO preregistration (id, strategy_id, thresholds_json, hash, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, strategyId, jsonStr, String(hash).trim(), createdAt);
  return db.prepare('SELECT * FROM preregistration WHERE id = ?').get(id);
}

export function createDataset(db, fields = {}) {
  const id = newId('ds');
  const createdAt = nowIso();
  db.prepare(`
    INSERT INTO dataset (id, broker, server, symbol, timeframe, date_from, date_to, tick_model, data_fingerprint, mt5_build, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    fields.broker ?? null,
    fields.server ?? null,
    fields.symbol ?? null,
    fields.timeframe ?? null,
    fields.dateFrom ?? fields.date_from ?? null,
    fields.dateTo ?? fields.date_to ?? null,
    fields.tickModel ?? fields.tick_model ?? null,
    fields.dataFingerprint ?? fields.data_fingerprint ?? null,
    fields.mt5Build ?? fields.mt5_build ?? null,
    createdAt,
  );
  return db.prepare('SELECT * FROM dataset WHERE id = ?').get(id);
}

/**
 * Importación de una optimización XML ya existente → experimento + result.
 */
export function importOptimization(db, {
  strategyId,
  isPath,
  oosPath = null,
  type = 'optimization',
  nPasses = null,
  seed = null,
  config = {},
  summary = {},
  status = 'completed',
}) {
  if (!strategyId) throw new Error('Indica a qué estrategia pertenece esta importación.');
  if (!getStrategy(db, strategyId)) throw new Error('Estrategia no encontrada.');
  if (!isPath) throw new Error('Falta la ruta del archivo in-sample.');

  const expId = newId('exp');
  const resId = newId('res');
  const createdAt = nowIso();
  const configJson = JSON.stringify({
    source: 'xml_import',
    ...config,
  });
  const pathsJson = JSON.stringify({
    is: isPath,
    oos: oosPath,
  });
  const summaryJson = JSON.stringify(summary);

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO experiment (id, strategy_id, ea_version_id, dataset_id, type, config_json, n_passes, seed, status, preregistration_id, created_at, finished_at)
      VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, NULL, ?, ?)
    `).run(expId, strategyId, type, configJson, nPasses, seed, status, createdAt, createdAt);
    db.prepare(`
      INSERT INTO result (id, experiment_id, paths_json, summary_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(resId, expId, pathsJson, summaryJson, createdAt);
  });
  tx();

  return {
    experiment: db.prepare('SELECT * FROM experiment WHERE id = ?').get(expId),
    result: db.prepare('SELECT * FROM result WHERE id = ?').get(resId),
    counter: getSearchCounter(db, strategyId),
  };
}

export function getExperiment(db, experimentId) {
  const e = db.prepare('SELECT * FROM experiment WHERE id = ?').get(experimentId);
  if (!e) return null;
  const results = db.prepare('SELECT * FROM result WHERE experiment_id = ? ORDER BY created_at DESC').all(experimentId);
  return {
    ...e,
    config: parseJson(e.config_json, {}),
    results: results.map((r) => ({
      ...r,
      paths: parseJson(r.paths_json, {}),
      summary: parseJson(r.summary_json, {}),
    })),
  };
}

/** Exporta el ledger completo a un objeto JSON (copia de seguridad). */
export function exportLedger(db) {
  const tables = ['strategy', 'ea_version', 'dataset', 'preregistration', 'experiment', 'result', 'meta'];
  const data = { format: 'orometra-ledger', version: 1, exportedAt: nowIso(), tables: {} };
  for (const t of tables) {
    data.tables[t] = db.prepare(`SELECT * FROM ${t}`).all();
  }
  return data;
}

export function writeLedgerBackup(db, filePath) {
  const data = exportLedger(db);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  return filePath;
}

/**
 * Importa un backup JSON. mode: 'replace' vacía tablas de datos; 'merge' inserta por id (salta duplicados).
 */
export function importLedger(db, payload, { mode = 'merge' } = {}) {
  const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
  if (!data || data.format !== 'orometra-ledger' || !data.tables) {
    throw new Error('El archivo no es una copia de seguridad de Orometra válida.');
  }
  const order = ['strategy', 'ea_version', 'dataset', 'preregistration', 'experiment', 'result'];
  const tx = db.transaction(() => {
    if (mode === 'replace') {
      for (const t of [...order].reverse()) db.prepare(`DELETE FROM ${t}`).run();
    }
    for (const t of order) {
      const rows = data.tables[t] || [];
      if (!rows.length) continue;
      const cols = Object.keys(rows[0]);
      const placeholders = cols.map(() => '?').join(',');
      const sql = mode === 'replace'
        ? `INSERT INTO ${t} (${cols.join(',')}) VALUES (${placeholders})`
        : `INSERT OR IGNORE INTO ${t} (${cols.join(',')}) VALUES (${placeholders})`;
      const stmt = db.prepare(sql);
      for (const row of rows) stmt.run(...cols.map((c) => row[c]));
    }
    if (data.tables.meta) {
      const upsert = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      for (const row of data.tables.meta) upsert.run(row.key, row.value);
    }
  });
  tx();
  return { strategies: listStrategies(db).length };
}

export function fileSha256(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}
