// La superficie de la portada: sus cifras son las de la tabla de la portada.
//
//   node tests/hero-surface.test.js

import fs from 'node:fs';
import { height, MT5_RESULT, PICK_RESULT } from '../js/hero-surface.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const peak = /<tr class="is-peak"><td>\d+<\/td><td>\d+<\/td><td>([\d.]+)<\/td>/.exec(html);
const pick = /<tr class="is-pick"><td>\d+<\/td><td>\d+<\/td><td>([\d.]+)<\/td>/.exec(html);
check('el marcador rojo es la fila 1 de la tabla', peak && Number(peak[1]) === MT5_RESULT, peak && peak[1]);
check('el marcador verde es la fila elegida de la tabla', pick && Number(pick[1]) === PICK_RESULT, pick && pick[1]);

const top0 = height(0.58, 0.40, 0);
const top1 = height(0.58, 0.40, 1);
check('el pico cae en el periodo nuevo', top0 > 1.2 && top1 < 0.3, `${top0.toFixed(2)} -> ${top1.toFixed(2)}`);
const mesa0 = height(-0.18, -0.10, 0);
const mesa1 = height(-0.18, -0.10, 1);
check('la meseta apenas cambia', Math.abs(mesa0 - mesa1) < 0.06 * mesa0 + 1e-9, `${mesa0.toFixed(3)} -> ${mesa1.toFixed(3)}`);
let finite = true;
for (let i = 0; i < 50; i++) for (let j = 0; j < 50; j++) if (!Number.isFinite(height(i / 25 - 1, j / 25 - 1, 0.5))) finite = false;
check('la altura es finita en toda la rejilla', finite);

console.log(`\nRESULTADO: ${checks - failures}/${checks} comprobaciones correctas`);
if (failures) process.exit(1);
