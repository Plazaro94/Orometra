// Defensas en la frontera entre los archivos del usuario y el veredicto.
//
//   node tests/input-guards.test.js
//
// Cada seccion reproduce un fallo encontrado en la auditoria de 2026-09 (audit/):
//   AUD-01  dos exports forward / el mismo periodo dos veces daban un veredicto limpio
//   AUD-02  "1,101" (coma decimal) se leia como 1101 y cambiaba la recomendacion
//   AUD-03  valores de parametro de texto se pintaban sin escapar (XSS)
//   AUD-07  GitHub Pages no envia cabeceras: la CSP tiene que ir en <meta>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemoTables } from '../js/demo.js';
import { runAnalysis } from '../core/analysis.js';
import { parseTable, columnDecimalSeparator } from '../core/parse.js';
import { CODE } from '../core/errors.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}
function section(t) { console.log(`\n${'='.repeat(70)}\n${t}\n${'='.repeat(70)}`); }
const buf = (text) => { const b = Buffer.from(text, 'utf8'); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
const throwsCode = (fn) => { try { fn(); return null; } catch (e) { return e.code || e.message; } };

const demo = buildDemoTables();

// ------------------------------------------------------------------ AUD-01
section('AUD-01: el mismo periodo no puede validarse contra si mismo');
{
  const twoForward = throwsCode(() => runAnalysis({ isTable: demo.oosTable, oosTable: demo.oosTable }));
  check('forward cargado como in-sample -> SCHEMA_ERROR', twoForward === CODE.SCHEMA_ERROR, String(twoForward));

  // In-sample sin columnas forward pero con las mismas cifras que el forward.
  const copyIs = {
    ...demo.isTable,
    rows: demo.oosTable.rows.map((r) => [r[0], r[2], ...r.slice(3)]),
  };
  const samePeriod = throwsCode(() => runAnalysis({ isTable: copyIs, oosTable: demo.oosTable }));
  check('mismas cifras en los dos periodos -> SCHEMA_ERROR', samePeriod === CODE.SCHEMA_ERROR, String(samePeriod));

  const ok = runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable });
  check('la demo legitima sigue analizandose', ok.plateaus.length >= 1);
}

// ------------------------------------------------------------------ AUD-02
section('AUD-02: separador decimal decidido por columna');
{
  check('columna con "1,5" -> coma', columnDecimalSeparator(['1,101', '1,5', '2,25']) === ',');
  check('columna con "1.5" -> punto', columnDecimalSeparator(['1.101', '1.5']) === '.');
  check('millares con coma -> punto', columnDecimalSeparator(['1,234,567', '12']) === '.');
  check('solo ambiguos sin pista -> null', columnDecimalSeparator(['1,101', '2,202']) === null);
  check('solo ambiguos con pista ";" -> coma', columnDecimalSeparator(['1,101', '2,202'], ',') === ',');

  const csv = 'Pass;Result;Profit Factor;InpA\n1;10,5;1,101;0,5\n2;11,25;1,396;1\n3;9;1,2;1,5\n';
  const t = parseTable(buf(csv), 'x.csv');
  const pf = t.rows.map((r) => r[t.headers.indexOf('Profit Factor')]);
  check('"1,101" en CSV ";" -> 1.101', Math.abs(pf[0] - 1.101) < 1e-12, String(pf[0]));
  check('"1,396" en CSV ";" -> 1.396', Math.abs(pf[1] - 1.396) < 1e-12, String(pf[1]));

  const csvDot = 'Pass,Result,Profit Factor\n1,10.5,1.101\n2,11.25,1.396\n';
  const t2 = parseTable(buf(csvDot), 'y.csv');
  check('"1.101" en CSV "," -> 1.101', Math.abs(t2.rows[0][2] - 1.101) < 1e-12, String(t2.rows[0][2]));

  // Mismo dataset en XML tipado y en CSV con coma decimal: mismo veredicto.
  const toCsv = (table) => [table.headers.join(';'), ...table.rows.map((r) => r.map((v) => (typeof v === 'number' ? String(v).replace('.', ',') : v)).join(';'))].join('\n');
  const isCsv = parseTable(buf(toCsv(demo.isTable)), 'is.csv');
  const oosCsv = parseTable(buf(toCsv(demo.oosTable)), 'oos.csv');
  const a = runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable });
  const b = runAnalysis({ isTable: isCsv, oosTable: oosCsv });
  check('CSV coma decimal = mismo nivel', a.verdict.level === b.verdict.level, `${a.verdict.level} vs ${b.verdict.level}`);
  check('CSV coma decimal = mismo Pass recomendado', String(a.plateaus[0].record.id) === String(b.plateaus[0].record.id),
    `${a.plateaus[0].record.id} vs ${b.plateaus[0].record.id}`);
  check('CSV coma decimal = mismos que pasan', a.meta.gatePassCount === b.meta.gatePassCount, `${a.meta.gatePassCount} vs ${b.meta.gatePassCount}`);
}

// ------------------------------------------------------------------ AUD-03
section('AUD-03: nada del archivo llega al HTML sin escapar');
{
  const views = ['ui-verdict.js', 'ui-plateaus.js', 'ui-unseen.js', 'ui-chrome.js'];
  for (const f of views) {
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    check(`${f} no usa paramValue en plantillas`, !/\bparamValue\b/.test(src));
  }
  // paramHtml escapa: se prueba con el formateador real (necesita Intl, no DOM).
  const { paramHtml } = await import('../js/ui-state.js');
  const out = paramHtml('<img src=x onerror=alert(1)>');
  check('paramHtml escapa < y >', !out.includes('<') && out.includes('&lt;img'), out);
}

// ------------------------------------------------------------------ AUD-07
section('AUD-07: CSP en <meta> en todas las paginas, igual que en vercel.json');
{
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const header = vercel.headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
  const expected = header.replace(" frame-ancestors 'none';", '');
  for (const page of ['index.html', 'app/index.html', 'methodology/index.html', 'privacy/index.html']) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
    check(`${page} lleva CSP en meta`, Boolean(m));
    if (m) check(`${page} CSP = vercel.json (sin frame-ancestors)`, m[1] === expected, m[1]);
    const cspPos = html.indexOf('http-equiv="Content-Security-Policy"');
    const firstScript = html.indexOf('<script');
    check(`${page} CSP antes del primer script`, cspPos > 0 && cspPos < firstScript);
  }
  const headersFile = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8');
  check('_headers = vercel.json', headersFile.includes(header));
}

// ------------------------------------------------------------------ AUD-08
section('AUD-08: el texto legal nombra todo lo que se guarda en el navegador');
{
  const keys = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, 'js'))) {
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    for (const m of src.matchAll(/'(orometra\.[a-z]+)'/g)) keys.add(m[1]);
  }
  const legal = fs.readFileSync(path.join(ROOT, 'js/ui-chrome.js'), 'utf8');
  const words = { 'orometra.theme': /tema de color/, 'orometra.lang': /idioma/, 'orometra.gates': /mínimos que configures/ };
  check('solo se usan claves conocidas', [...keys].every((k) => k in words), [...keys].join(', '));
  check('el aviso legal dice "tres cosas"', /Se guardan tres cosas/.test(legal) && keys.size === 3, String(keys.size));
  for (const k of keys) check(`el aviso legal menciona ${k}`, words[k] && words[k].test(legal));
}

console.log(`\n${'='.repeat(70)}\nRESULTADO: ${checks - failures}/${checks} comprobaciones correctas\n${'='.repeat(70)}`);
if (failures) process.exit(1);
