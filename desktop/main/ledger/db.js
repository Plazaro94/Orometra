// Apertura y esquema del ledger SQLite (better-sqlite3).
// Solo Node / proceso principal de Electron — sin DOM.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

export const SCHEMA_VERSION = 1;

const DDL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS strategy (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  hypothesis TEXT NOT NULL DEFAULT '',
  prior_search_note TEXT NOT NULL,
  prior_search_approx INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ea_version (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL REFERENCES strategy(id) ON DELETE CASCADE,
  path TEXT,
  source_hash TEXT,
  binary_hash TEXT,
  note TEXT NOT NULL DEFAULT '',
  parent_version_id TEXT REFERENCES ea_version(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dataset (
  id TEXT PRIMARY KEY,
  broker TEXT,
  server TEXT,
  symbol TEXT,
  timeframe TEXT,
  date_from TEXT,
  date_to TEXT,
  tick_model TEXT,
  data_fingerprint TEXT,
  mt5_build TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS preregistration (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL REFERENCES strategy(id) ON DELETE CASCADE,
  thresholds_json TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experiment (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL REFERENCES strategy(id) ON DELETE CASCADE,
  ea_version_id TEXT REFERENCES ea_version(id),
  dataset_id TEXT REFERENCES dataset(id),
  type TEXT NOT NULL,
  config_json TEXT NOT NULL,
  n_passes INTEGER,
  seed INTEGER,
  status TEXT NOT NULL,
  preregistration_id TEXT REFERENCES preregistration(id),
  created_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS result (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES experiment(id) ON DELETE CASCADE,
  paths_json TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ea_strategy ON ea_version(strategy_id);
CREATE INDEX IF NOT EXISTS idx_exp_strategy ON experiment(strategy_id);
CREATE INDEX IF NOT EXISTS idx_result_exp ON result(experiment_id);
`;

export function newId(prefix = '') {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

export function nowIso() {
  return new Date().toISOString();
}

/** Ruta por defecto del ledger del usuario. */
export function defaultLedgerPath(appDataPath) {
  return path.join(appDataPath, 'Orometra', 'ledger.sqlite');
}

export function openLedger(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(DDL);
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version');
  if (!row) {
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION));
  }
  return db;
}

export function closeLedger(db) {
  if (db) db.close();
}
