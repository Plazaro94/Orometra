// Host del ledger en proceso Node (ABI de Node, no el de Electron).
// Electron habla por stdin/stdout con líneas JSON { id, method, args }.

import { openLedger, closeLedger, defaultLedgerPath } from './db.js';
import * as api from './api.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';

let db = null;

function resolveDbPath(requested) {
  if (requested) return requested;
  return defaultLedgerPath(path.join(os.homedir(), 'AppData', 'Roaming'));
}

const methods = {
  ping: () => ({ ok: true }),
  open: ({ dbPath } = {}) => {
    if (db) closeLedger(db);
    const p = resolveDbPath(dbPath);
    db = openLedger(p);
    return { dbPath: p };
  },
  listStrategies: () => api.listStrategies(db),
  getStrategy: ({ id }) => api.getStrategy(db, id),
  createStrategy: (args) => api.createStrategy(db, args),
  listExperiments: ({ strategyId }) => api.listExperiments(db, strategyId),
  getExperiment: ({ id }) => api.getExperiment(db, id),
  getSearchCounter: ({ strategyId }) => api.getSearchCounter(db, strategyId),
  importOptimization: (args) => api.importOptimization(db, args),
  createEaVersion: (args) => api.createEaVersion(db, args),
  createDataset: (args) => api.createDataset(db, args),
  createPreregistration: (args) => api.createPreregistration(db, args),
  exportLedger: () => api.exportLedger(db),
  writeLedgerBackup: ({ filePath }) => api.writeLedgerBackup(db, filePath),
  importLedger: ({ payload, mode }) => api.importLedger(db, payload, { mode }),
  importLedgerFile: ({ filePath, mode }) => {
    const raw = fs.readFileSync(filePath, 'utf8');
    return api.importLedger(db, raw, { mode });
  },
};

async function handle(msg) {
  const { id, method, args } = msg;
  try {
    if (!methods[method]) throw new Error(`Método desconocido: ${method}`);
    if (method !== 'open' && method !== 'ping' && !db) {
      throw new Error('Ledger no abierto. Llama a open primero.');
    }
    const result = await methods[method](args || {});
    return { id, ok: true, result };
  } catch (err) {
    return { id, ok: false, error: err?.message || String(err) };
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try { msg = JSON.parse(trimmed); }
  catch {
    process.stdout.write(`${JSON.stringify({ id: null, ok: false, error: 'JSON inválido' })}\n`);
    return;
  }
  const res = await handle(msg);
  process.stdout.write(`${JSON.stringify(res)}\n`);
});

process.stdout.write(`${JSON.stringify({ id: null, ok: true, result: { ready: true } })}\n`);

function shutdown() {
  try { if (db) closeLedger(db); } catch { /* */ }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('disconnect', shutdown);
