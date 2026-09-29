// Tercera auditoria (2026-09-29): lo que salio de verificarla contra el codigo.
//
//   node tests/audit-2026-09c.test.js
//
//   M1  la hoja de impresion no depende de tokens que se invierten entre temas
//   M2  columnas clave sin reconocer: aviso critico, nunca un veredicto limpio
//   M3  la comprobacion previa no bloquea por no reconocer parametros
//   B1  la etiqueta de calidad sigue el idioma
//   B4  el .set no mezcla idiomas ni formato regional
//   B5  un informe con una entidad fuera de rango no rompe la lectura
//   B11 sin claves repetidas en las traducciones
//   U   el periodo no visto no dice "normal" a secas

import fs from 'node:fs';
import { generateCase } from '../bench/sim.js';
import { runAnalysis } from '../core/analysis.js';
import { preflightSummary, missingKeyMetrics } from '../core/schema.js';
import { qualityLabel } from '../core/metrics.js';
import { parseBacktestReport } from '../core/report.js';
import { evaluateUnseen } from '../core/unseen.js';
import { buildSetFile, buildRefinementSetFile } from '../js/export.js';
import { setLocale } from '../js/i18n.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}
function section(t) { console.log(`\n${'='.repeat(70)}\n${t}\n${'='.repeat(70)}`); }
setLocale('es');

section('M1. Impresion: sin tokens que se inviertan entre temas');
{
  const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const i = css.indexOf('@media print{');
  const block = css.slice(i, css.indexOf('/* ---------------------------------------------------------------- landing */', i));
  check('la hoja de impresion fuerza la paleta clara en los dos temas', /:root,\[data-theme="dark"\],\[data-theme="light"\]\{/.test(block));
  check('el fondo del papel es blanco literal', /html,body\{background:#fff !important/.test(block));
  check('ninguna regla de impresion usa --text-hi como fondo', !/background:var\(--text-hi\)/.test(block));
  check('ninguna regla de impresion usa --surface como color de texto', !/[^-]color:var\(--surface\)/.test(block));
}

section('M2. Columnas clave sin reconocer');
{
  const c = generateCase('S3', 1);
  const de = { Result: 'Ergebnis', Profit: 'Gewinn', 'Expected Payoff': 'Erwartete Auszahlung', 'Profit Factor': 'Profitfaktor', 'Recovery Factor': 'Erholungsfaktor', 'Sharpe Ratio': 'Sharpe-Kennzahl', 'Equity DD %': 'Kapital-Abzug %', Trades: 'Geschaefte' };
  const fwd = { 'Forward Result': 'Forward-Ergebnis', 'Back Result': 'Back-Ergebnis' };
  const tr = (t) => ({ ...t, headers: t.headers.map((h) => de[h] || fwd[h] || h) });
  const isT = tr(c.isTable);
  const oosT = tr(c.oosTable);
  check('la comprobacion previa lista lo que falta', missingKeyMetrics(isT).length >= 3, missingKeyMetrics(isT).join(','));
  check('un archivo bien nombrado no tiene faltas', missingKeyMetrics(c.isTable).length === 0);
  const a = runAnalysis({ isTable: isT, oosTable: oosT });
  const crit = a.verdict.findings.filter((f) => f.severity === 'critical').map((f) => f.title);
  check('el analisis avisa como critico', crit.some((t) => /columnas clave/.test(t)), crit.join(' | '));
  check('y el nivel no pasa de debil', a.verdict.level === 'weak' || a.verdict.level === 'insufficient', a.verdict.level);
  check('el aviso nombra las columnas sin reconocer', a.verdict.findings.some((f) => /Gewinn|Profitfaktor/.test(f.detail)));
  const ok = runAnalysis({ isTable: c.isTable, oosTable: c.oosTable });
  check('con cabeceras normales no aparece el aviso', !ok.verdict.findings.some((f) => /columnas clave/.test(f.title)));
}

section('M3. La comprobacion previa no bloquea por no reconocer parametros');
{
  let s = 1;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const headers = ['Pass', 'Result', 'Profit', 'Profit Factor', 'Equity DD %', 'Trades', 'InpA', 'InpB'];
  const rows = Array.from({ length: 600 }, (_, i) => [i + 1, 50 + rnd(), 1000 + rnd() * 500, 1.3, 8, 300, Math.round(rnd() * 200), Math.round(rnd() * 200)]);
  const sum = preflightSummary({ name: 'x', sheet: 's', format: 'xml-spreadsheet', headers, rows });
  check('con parametros de muy alta cardinalidad se reconocen 0 en un solo archivo', sum.params === 0, String(sum.params));
  const src = fs.readFileSync(new URL('../js/ui-audit.js', import.meta.url), 'utf8');
  check('pero la comprobacion previa ya no lanza error por ello', !/No EA parameter is recognized/.test(src));
}

section('B1. La etiqueta de calidad sigue el idioma');
{
  setLocale('en');
  check('en ingles no sale «excelente»', qualityLabel(0.9) === 'excellent' && qualityLabel(0.3) === 'weak', `${qualityLabel(0.9)} ${qualityLabel(0.3)}`);
  setLocale('es');
  check('en español «débil» lleva tilde', qualityLabel(0.3) === 'débil', qualityLabel(0.3));
}

section('B4. El .set no mezcla idiomas ni formato regional');
{
  const c = generateCase('S3', 1);
  const a = runAnalysis({ isTable: c.isTable, oosTable: c.oosTable });
  const p = a.plateaus[0];
  setLocale('en');
  const en = buildSetFile(a, p) + buildRefinementSetFile(a, p);
  setLocale('es');
  const es = buildSetFile(a, p) + buildRefinementSetFile(a, p);
  check('en ingles, los comentarios estan en ingles', /Plateau|Load it in the tester/.test(en) && !/Meseta|Cárgalo/.test(en));
  check('en español, en español', /Meseta/.test(es) && !/Plateau/.test(es));
  check('no dice «Todos los parámetros» (no es un modo de MT5)', !/Todos los parámetros|All parameters/.test(en + es));
  check('las combinaciones salen sin separador de miles', /Combinaciones del rango: \d+\r?\n/.test(es), (es.match(/Combinaciones del rango: [^\r\n]*/) || [''])[0]);
}

section('B5. Una entidad HTML fuera de rango no rompe la lectura');
{
  let threw = false;
  try {
    parseBacktestReport('<html><body>Strategy Tester Report<table><tr><td>Expert:</td><td>&#99999999;</td></tr><tr><td>Symbol:</td><td>&#xD800;</td></tr></table></body></html>', 'x');
  } catch { threw = true; }
  check('no lanza', !threw);
}

section('B11. Sin claves repetidas en las traducciones');
{
  const lines = fs.readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8').split('\n');
  const start = lines.findIndex((l) => /^\s*es\s*:\s*\{/.test(l));
  let dup = 0;
  for (const [a, b] of [[0, start], [start, lines.length]]) {
    const seen = new Set();
    for (let i = a; i < b; i++) {
      const m = lines[i].match(/^\s*'([\w.-]+)':\s/);
      if (!m) continue;
      if (seen.has(m[1])) dup++;
      seen.add(m[1]);
    }
  }
  check('ninguna clave repetida dentro de un idioma', dup === 0, `${dup} repetidas`);
  const sm = fs.readFileSync(new URL('../sitemap.xml', import.meta.url), 'utf8');
  check('el sitemap lleva lastmod en cada pagina', (sm.match(/<lastmod>/g) || []).length === (sm.match(/<loc>/g) || []).length);
}

section('U. El periodo no visto no dice «normal» a secas');
{
  const c = generateCase('S3', 1);
  const a = runAnalysis({ isTable: c.isTable, oosTable: c.oosTable });
  const p = a.plateaus[0];
  const rep = p.record;
  const r = evaluateUnseen(a, p, {
    trades: Math.round(rep.oos.trades),
    profit: rep.oos.profit,
    profitFactor: rep.oos.profitFactor,
    drawdown: rep.oos.drawdown,
    recoveryFactor: rep.oos.recoveryFactor,
    sharpe: rep.oos.sharpe,
  });
  check('un tramo normal se titula «no contradice»', /no contradice/i.test(r.headline), r.headline);
  check('la lectura explica el alcance con cifras medidas', r.notes.some((n) => /Alcance de este contraste/.test(n) && /49 %/.test(n)));
}

console.log(`\nRESULTADO: ${checks - failures}/${checks} comprobaciones correctas`);
if (failures) process.exit(1);
