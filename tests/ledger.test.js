// Pruebas del ledger (sin Electron): estrategia, import, contador, backup.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openLedger, closeLedger } from '../desktop/main/ledger/db.js';
import {
  createStrategy,
  listStrategies,
  getSearchCounter,
  importOptimization,
  listExperiments,
  exportLedger,
  importLedger,
  writeLedgerBackup,
  createPreregistration,
} from '../desktop/main/ledger/api.js';
import { buildDemoTables } from '../js/demo.js';
import { runAnalysis } from '../core/analysis.js';
import { DEFAULT_POLICY } from '../core/metrics.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`);
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orometra-ledger-'));
const dbPath = path.join(dir, 'test.sqlite');
const db = openLedger(dbPath);

console.log('\n=== ledger: crear estrategia ===');
{
  let threw = false;
  try { createStrategy(db, { name: 'X', priorSearchNote: '' }); } catch { threw = true; }
  check('exige búsqueda previa', threw);

  const s = createStrategy(db, {
    name: 'Demo EA',
    hypothesis: 'Meseta en medias',
    priorSearchNote: '0',
    priorSearchApprox: 0,
  });
  check('crea estrategia', Boolean(s?.id));
  check('lista contiene 1', listStrategies(db).length === 1);
}

console.log('\n=== ledger: importar dos optimizaciones + contador ===');
{
  const s = listStrategies(db)[0];
  const demo = buildDemoTables();
  const a = runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable, policy: DEFAULT_POLICY });
  const summary = {
    verdictLevel: a.verdict?.level,
    nPlateaus: a.plateaus?.length,
    total: a.meta?.total,
  };

  const r1 = importOptimization(db, {
    strategyId: s.id,
    isPath: path.join(dir, 'IS-a.xml'),
    oosPath: path.join(dir, 'OOS-a.xml'),
    nPasses: a.meta.total,
    summary,
  });
  // tocar archivos dummy para paths
  fs.writeFileSync(r1.experiment ? path.join(dir, 'IS-a.xml') : path.join(dir, 'x'), '');
  fs.writeFileSync(path.join(dir, 'IS-a.xml'), '<xml/>');
  fs.writeFileSync(path.join(dir, 'OOS-a.xml'), '<xml/>');

  importOptimization(db, {
    strategyId: s.id,
    isPath: path.join(dir, 'IS-b.xml'),
    oosPath: path.join(dir, 'OOS-b.xml'),
    nPasses: 100,
    summary: { verdictLevel: 'weak', total: 100 },
  });
  fs.writeFileSync(path.join(dir, 'IS-b.xml'), '<xml/>');
  fs.writeFileSync(path.join(dir, 'OOS-b.xml'), '<xml/>');

  const counter = getSearchCounter(db, s.id);
  check('2 experimentos', counter.experiments === 2);
  check('pasadas sumadas', counter.totalPasses === (a.meta.total + 100));
  check('effectiveTrials null hasta fase 4', counter.effectiveTrials === null);
  check('lista experimentos 2', listExperiments(db, s.id).length === 2);
  check('mismo veredicto demo que motor', summary.verdictLevel === a.verdict.level);
}

console.log('\n=== ledger: export / import ===');
{
  const backupPath = path.join(dir, 'backup.json');
  writeLedgerBackup(db, backupPath);
  check('escribe backup', fs.existsSync(backupPath));

  const payload = exportLedger(db);
  check('format orometra-ledger', payload.format === 'orometra-ledger');

  const db2Path = path.join(dir, 'restored.sqlite');
  const db2 = openLedger(db2Path);
  importLedger(db2, payload, { mode: 'replace' });
  check('restaura estrategias', listStrategies(db2).length === 1);
  check('restaura experimentos', listExperiments(db2, listStrategies(db2)[0].id).length === 2);
  closeLedger(db2);
}

console.log('\n=== ledger: pre-registro ===');
{
  const s = listStrategies(db)[0];
  const thresholds = { profile: 'standard', minProfitFactor: 1.2, maxDd: 0.25 };
  const row = createPreregistration(db, {
    strategyId: s.id,
    thresholds,
    hash: 'abc123deadbeef',
  });
  check('crea preregistration', Boolean(row?.id) && row.hash === 'abc123deadbeef');
  check('thresholds_json', row.thresholds_json.includes('minProfitFactor'));

  const viaJson = createPreregistration(db, {
    strategyId: s.id,
    thresholdsJson: JSON.stringify({ profile: 'prudent' }),
    hash: 'hash2',
  });
  check('acepta thresholdsJson', viaJson.hash === 'hash2');
}

closeLedger(db);
fs.rmSync(dir, { recursive: true, force: true });

console.log(`\nRESULTADO: ${checks - failures}/${checks}`);
if (failures) process.exit(1);
