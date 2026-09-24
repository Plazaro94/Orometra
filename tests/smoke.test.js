// Checklist de humo: lo que un usuario ve en 10 segundos.
//
//   node tests/smoke.test.js
//
// Existe porque auditorías de motor/SEO no pillan fallos de estado vacío:
// p. ej. display:flex anulando [hidden] y mostrando “Analyzing…” + “Analysis failed”
// al abrir /app/ sin haber analizado nada.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemoTables } from '../js/demo.js';
import { runAnalysis } from '../core/analysis.js';
import { DEFAULT_POLICY } from '../core/metrics.js';
import { CODE, AnalysisError, classifyError, errorCopy, outcomeFromAnalysis } from '../core/errors.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
function section(t) {
  console.log(`\n${'='.repeat(70)}\n${t}\n${'='.repeat(70)}`);
}

const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const appHtml = fs.readFileSync(path.join(ROOT, 'app/index.html'), 'utf8');
const uiSrc = fs.readdirSync(path.join(ROOT, 'js'))
  .filter((f) => /^ui.*\.js$/.test(f))
  .sort()
  .map((f) => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'))
  .join('\n');

// ---------------------------------------------------------------- 1. CSS [hidden]
section('1. [hidden] no puede ser anulado por display:flex/grid');
{
  // Regla global con !important: sin ella, cualquier .foo{display:flex} pisa el UA.
  const hasGlobal = /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/i.test(css);
  check('existe [hidden]{display:none!important}', hasGlobal);

  // Elementos del HTML que arrancan ocultos: si algún día se quita la regla global,
  // estas clases con display:flex/grid volverían a romper el idle.
  const displayBreakers = [];
  for (const m of appHtml.matchAll(/<([a-z0-9]+)([^>]*\bhidden\b[^>]*)>/gi)) {
    const classM = m[2].match(/\bclass="([^"]*)"/);
    if (!classM) continue;
    for (const cls of classM[1].split(/\s+/).filter(Boolean)) {
      const re = new RegExp(
        `\\.${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*display\\s*:\\s*(flex|grid|block|inline-flex)`,
        'i',
      );
      if (re.test(css)) displayBreakers.push(cls);
    }
  }
  check(
    'paneles idle con display explícito quedan cubiertos por [hidden]',
    hasGlobal || displayBreakers.length === 0,
    displayBreakers.join(', '),
  );

  for (const id of ['statusBar', 'errorBox', 'preflight', 'policyPanel', 'policyPreview', 'dropOverlay']) {
    const re = new RegExp(`id="${id}"[^>]*\\bhidden\\b|\\bhidden\\b[^>]*id="${id}"`);
    // Atributo hidden puede ir antes o después del id.
    const ok = new RegExp(`id="${id}"[^>]*>`).test(appHtml)
      && appHtml.match(new RegExp(`<[^>]*id="${id}"[^>]*>`))?.[0]?.includes('hidden');
    check(`#${id} arranca con atributo hidden`, Boolean(ok));
  }
}

// ---------------------------------------------------------------- 2. Contrato idle HTML
section('2. Arranque /app/: sin progreso ni error visibles en el marcado');
{
  const statusBlock = appHtml.match(/<div[^>]*id="statusBar"[^>]*>[\s\S]*?<\/div>/);
  const errorBlock = appHtml.match(/<div[^>]*id="errorBox"[^>]*>[\s\S]*?<\/div>/);
  check('statusBar presente', Boolean(statusBlock));
  check('errorBox presente', Boolean(errorBlock));
  check('statusBar tiene hidden en la etiqueta de apertura', /id="statusBar"[^>]*\bhidden\b|\bhidden\b[^>]*id="statusBar"/.test(statusBlock?.[0] || ''));
  check('errorBox tiene hidden en la etiqueta de apertura', /id="errorBox"[^>]*\bhidden\b|\bhidden\b[^>]*id="errorBox"/.test(errorBlock?.[0] || ''));

  // El texto por defecto del error no debe colarse como “ya falló” sin mensaje.
  const errorText = appHtml.match(/id="errorText"[^>]*>([^<]*)</);
  check('errorText vacío al cargar', errorText && errorText[1].trim() === '', errorText ? JSON.stringify(errorText[1]) : 'ausente');

  // showError debe ocultar la barra; showProgress no debe dejarla colgada tras error.
  check('showError oculta statusBar', /function showError[\s\S]*?#statusBar'\)\.hidden\s*=\s*true/.test(uiSrc)
    || /\$\('#statusBar'\)\.hidden\s*=\s*true/.test(uiSrc.split('function showError')[1]?.slice(0, 800) || ''));
  check('clearError existe', /function clearError\s*\(/.test(uiSrc));
  check('runAudit llama clearError al empezar', /async function runAudit[\s\S]{0,200}clearError\(/.test(uiSrc));
}

// ---------------------------------------------------------------- 3. Demo de humo
section('3. Demo: carga y encuentra meseta (botón / ?demo=1)');
{
  check('landing enlaza demo con ?demo=1', /href="app\/\?demo=1"/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')));
  check('ui arranca demo si ?demo=1', /get\('demo'\)\s*===\s*'1'[\s\S]{0,80}loadDemo\(/.test(uiSrc));

  const demo = buildDemoTables();
  check('demo genera IS y OOS', Boolean(demo.isTable && demo.oosTable && demo.isTable.rows.length > 100));
  const a = runAnalysis({
    isTable: demo.isTable,
    oosTable: demo.oosTable,
    policy: DEFAULT_POLICY,
  });
  const outcome = outcomeFromAnalysis(a);
  check('demo produce al menos una meseta', a.plateaus.length >= 1, String(a.plateaus.length));
  check('demo outcome = ANALYSIS_SUCCESS', outcome.code === CODE.ANALYSIS_SUCCESS, outcome.code);
  check('demo no es muestreo sparse extremo', a.meta.sampling === 'grid' || a.meta.coverage > 0.3, `${a.meta.sampling}/${a.meta.coverage}`);
}

// ---------------------------------------------------------------- 4. Errores tipados
section('4. Errores tipados: título + pista, no solo “Analysis failed”');
{
  const L = (es, en) => en;
  for (const code of [
    CODE.FILE_ERROR,
    CODE.SCHEMA_ERROR,
    CODE.DATA_ERROR,
    CODE.WORKER_ERROR,
    CODE.INSUFFICIENT_DATA,
    CODE.NO_QUALIFYING_CONFIGS,
    CODE.NO_PLATEAU,
  ]) {
    const copy = errorCopy(code, L);
    check(`${code} tiene título propio`, Boolean(copy.title) && copy.title !== 'Analysis failed');
    check(`${code} tiene pista`, Boolean(copy.hint) && copy.hint.length > 10);
  }

  const typed = new AnalysisError(CODE.FILE_ERROR, 'Bad XML Spreadsheet');
  const classified = classifyError(typed);
  check('AnalysisError conserva code', classified.code === CODE.FILE_ERROR);
  check('classifyError tipifica mensaje de worker', classifyError(new Error('Worker timeout')).code === CODE.WORKER_ERROR);

  check('ui importa errorCopy/classifyError', /errorCopy/.test(uiSrc) && /classifyError/.test(uiSrc));
  check('showError rellena errorHint', /function showError[\s\S]{0,600}errorHint/.test(uiSrc));
  check('holdout en sello del veredicto', /function holdoutFact/.test(uiSrc) && /run-holdout/.test(uiSrc));
  check('evidencia fuerte sin holdout se atenúa', /function displayVerdictLevel/.test(uiSrc));
}

// ---------------------------------------------------------------- resumen
console.log(`\n${'='.repeat(70)}`);
console.log(`RESULTADO: ${checks - failures}/${checks} comprobaciones correctas`);
console.log(`${'='.repeat(70)}`);
if (failures) process.exit(1);
