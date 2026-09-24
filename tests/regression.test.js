// Regresión del motor: la demo debe producir el mismo JSON canónico tras refactors.
//
//   node tests/regression.test.js
//
// El fixture se generó con el motor previo al saneamiento Fase 0 (misma semilla demo).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemoTables } from '../js/demo.js';
import { runAnalysis } from '../core/analysis.js';
import { DEFAULT_POLICY } from '../core/metrics.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(ROOT, 'tests/fixtures/demo-regression.json');

function round(x) {
  return typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1e9) / 1e9 : x;
}

function snapshot(a) {
  const p = (a.plateaus || [])[0];
  const rec = p?.record || null;
  const repIdx = typeof p?.representative === 'number' ? p.representative : null;
  return {
    nPlateaus: (a.plateaus || []).length,
    nPeaks: (a.peaks || []).length,
    plateau0: p ? {
      size: p.size,
      coreSize: p.coreSize,
      medianScore: round(p.medianScore),
      worstScore: round(p.worstScore),
      medianRetention: round(p.medianRetention),
      pass: rec?.id ?? (repIdx != null ? a.records?.[repIdx]?.id : null) ?? null,
    } : null,
    fragility: round(a.stats?.fragility),
    fragilityQuality: round(a.stats?.fragilityQuality),
    sharpeObservedMax: round(a.stats?.sharpeTest?.observedMax),
    sharpeChanceMax: round(a.stats?.sharpeTest?.chanceMax),
    sharpeDeflated: round(a.stats?.sharpeTest?.deflated),
    verdictLevel: a.verdict?.level ?? null,
    sampling: a.meta?.sampling ?? null,
    coverage: round(a.meta?.coverage),
    total: a.meta?.total,
    selectionMode: a.meta?.selectionMode,
    medianSupport: round(a.meta?.medianSupport),
    dofPerParam: round(a.meta?.degreesOfFreedom?.perParam),
    dofPerParamOos: round(a.meta?.degreesOfFreedom?.perParamOos),
  };
}

function deepEqual(a, b, trail = '') {
  if (Object.is(a, b)) return null;
  if (typeof a !== typeof b) return `${trail}: tipo ${typeof a} vs ${typeof b}`;
  if (a === null || b === null) return `${trail}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
  if (typeof a !== 'object') return `${trail}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const err = deepEqual(a[k], b[k], trail ? `${trail}.${k}` : k);
    if (err) return err;
  }
  return null;
}

const demo = buildDemoTables();
const analysis = runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable, policy: DEFAULT_POLICY });
const actual = snapshot(analysis);

if (process.argv.includes('--write')) {
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  fs.writeFileSync(FIXTURE, `${JSON.stringify(actual, null, 2)}\n`);
  console.log(`wrote ${FIXTURE}`);
  process.exit(0);
}

if (!fs.existsSync(FIXTURE)) {
  console.error(`Falta fixture ${FIXTURE}. Genera con: node tests/regression.test.js --write`);
  process.exit(1);
}

const expected = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const err = deepEqual(actual, expected);
if (err) {
  console.error('FAIL regresión demo:', err);
  console.error('esperado:', JSON.stringify(expected, null, 2));
  console.error('actual:  ', JSON.stringify(actual, null, 2));
  process.exit(1);
}
console.log('ok   regresión demo (JSON canónico idéntico)');
