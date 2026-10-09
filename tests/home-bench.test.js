// Las cifras del banco de pruebas que cita la portada (home.bench.*) salen del segundo
// examen, ciego (bench/results/REPORT-exam5.md). Si el banco cambia, esta prueba falla
// hasta que se actualice el texto en los dos idiomas.
//
//   node tests/home-bench.test.js

import fs from 'node:fs';
import { setLocale, t } from '../js/i18n.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}

const md = fs.readFileSync(new URL('../bench/results/REPORT-exam5.md', import.meta.url), 'utf8');
const num = (re) => { const m = md.match(re); if (!m) throw new Error(`No encuentro ${re} en REPORT-exam5.md`); return Number(m[1]); };
const row = (name) => {
  const line = md.split('\n').find((l) => l.startsWith(`| ${name} |`));
  if (!line) throw new Error(`No encuentro la fila ${name}`);
  return line.split('|').slice(2, -1).map((c) => Number(c.replace(/\*/g, '').trim()));
};

const cases = num(/Casos: (\d+) ·/);
const noEdgeCases = num(/\| \*\*Total\*\* \| (\d+) \|/);
const fpPct = num(/\| \*\*Total\*\* \| \d+ \| \*\*([\d.]+) %\*\*/);
const powerCases = num(/Potencia[^\n]*\n\nCasos: (\d+)/);
const powerPct = num(/detectados como moderada o más: \*\*([\d.]+) %\*\*/);
const strongPct = num(/\| \*\*Total\*\* \| \d+ \| \*\*[\d.]+ %\*\* \| \*\*[\d.]+ %\*\* \| \*\*([\d.]+) %\*\*/);
const s5Line = md.split('\n').find((l) => l.startsWith('| S5 | 100 |'));
const s5Pos = s5Line ? Number(s5Line.split('|')[3].replace('%', '').trim()) : NaN;
const [oS3, oS4, oS6, oS7, oS8, oAll] = row('Orometra');
const [b1S3, b1S4, b1S6, b1S7, b1S8, b1All] = row('B1 primera fila MT5');
const b4All = row('B4 media con vecinas')[5];
const fb = md.match(/Con sugerencia orientativa[^\n]*S7 ([\d.]+) · S8 ([\d.]+) · \*\*Todos ([\d.]+)\*\*/);
const passed = (md.match(/\| APROBADO \|/g) || []).length;
const failed = (md.match(/\| \*\*SUSPENDIDO\*\* \|/g) || []).length;

const fp = (lang, x, d) => (lang === 'es' ? `${x.toFixed(d).replace('.', ',')}\u00A0%` : `${x.toFixed(d)}%`);
const dec = (lang, x) => (lang === 'es' ? x.toFixed(2).replace('.', ',') : x.toFixed(2));
const falseAlarms = Math.round((fpPct / 100) * noEdgeCases);
const detected = Math.round((powerPct / 100) * powerCases);
const withEdge = cases - noEdgeCases;

for (const lang of ['en', 'es']) {
  setLocale(lang);
  console.log(`\n${lang.toUpperCase()}`);
  check('número de casos', t('home.bench.sub').includes(String(cases)), t('home.bench.sub'));
  check('falsas alarmas: porcentaje', t('home.bench.1.n') === fp(lang, fpPct, 1), `${t('home.bench.1.n')} frente a ${fpPct}`);
  check('falsas alarmas: n de N', t('home.bench.1.body').includes(String(noEdgeCases)) && t('home.bench.1.body').includes(` ${falseAlarms} `), t('home.bench.1.body'));
  check('potencia: porcentaje', t('home.bench.2.n') === fp(lang, powerPct, 0), `${t('home.bench.2.n')} frente a ${powerPct}`);
  const of = lang === 'es' ? `${detected} de ${powerCases}` : `${detected} of ${powerCases}`;
  check('potencia: n de N', t('home.bench.2.body').includes(of), t('home.bench.2.body'));
  check('elección: Orometra', t('home.bench.3.n') === dec(lang, oAll), `${t('home.bench.3.n')} frente a ${oAll}`);
  check('elección: n.º 1 de MT5', t('home.bench.3.vs').includes(dec(lang, b1All)));
  check('elección: casos con ventaja', t('home.bench.3.body').includes(String(withEdge)));
  check('dónde no gana: media con vecinas', t('home.bench.note').includes(`(${dec(lang, b4All)})`), t('home.bench.note'));
  const crit = lang === 'es' ? `${passed} de los ${passed + failed}` : `${passed} of the ${passed + failed}`;
  check('criterios aprobados', t('home.bench.note').includes(crit), crit);
  check('ninguna «sólida» sin ventaja', strongPct === 0 && /(none|ninguna) [«“](strong|sólida)[»”]/.test(t('home.bench.1.body')), `${strongPct}`);
  const s5 = lang === 'es' ? `${Math.round(s5Pos)} de 100` : `${Math.round(s5Pos)} of 100`;
  check('S5: moderada o más', s5Pos > 5 && t('home.bench.note').includes(s5), `${s5Pos}`);
  // Metodología cita las mismas cifras («Cómo sabemos que funciona»).
  const m1 = t('doc.method.bench.1');
  check('metodología: falsas alarmas', m1.includes(` ${falseAlarms} `) && m1.includes(String(noEdgeCases)), m1);
  check('metodología: ventajas detectadas', t('doc.method.bench.2').includes(of), t('doc.method.bench.2'));
  check('metodología: elección', t('doc.method.bench.3').includes(dec(lang, oAll)) && t('doc.method.bench.3').includes(dec(lang, b1All)));
  const m2 = t('doc.method.bench.p2');
  check('metodología: criterios, S5 y media con vecinas', m2.includes(crit) && m2.includes(s5) && m2.includes(dec(lang, b4All)), m2);
  check('metodología: enlaza al mismo examen', m2.includes('REPORT-exam5.md'));
}
setLocale('en');

console.log('\nLo que la nota da por cierto');
check('Orometra gana a la n.º 1 de MT5 en el total', oAll < b1All);
check('la media con vecinas queda por delante en el total', b4All < oAll);
check('la n.º 1 de MT5 gana en genética (S7) y en la rejilla real (S8)', b1S7 < oS7 && b1S8 < oS8);
check('y en el resto, no', oS3 <= b1S3 && oS4 <= b1S4 && oS6 <= b1S6);
check('metodología: en la rejilla real (S8) la n.º 1 de MT5 le gana por más de 0,10', oS8 - b1S8 > 0.10, `${oS8} frente a ${b1S8}`);
check('«por eso»: con la sugerencia orientativa, gana en S7, S8 y a la media con vecinas',
  fb && Number(fb[1]) < b1S7 && Number(fb[2]) < b1S8 && Number(fb[3]) < b4All, fb ? fb.slice(1).join(' ') : 'sin línea');

console.log(`\n${'='.repeat(70)}\nRESULTADO: ${checks - failures}/${checks} comprobaciones correctas\n${'='.repeat(70)}`);
if (failures) process.exit(1);
