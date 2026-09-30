// La superficie de la portada: sus cifras son las de la tabla de la portada, y el dibujo no
// exagera ninguna (las alturas son proporcionales a las cifras).
//
//   node tests/hero-surface.test.js

import fs from 'node:fs';
import { height, MT5_RESULT, PICK_RESULT } from '../js/hero-surface.js';
import {
  RIM_Q, MESA_C, PEAK_A, STEP, RESULT_H, MT5_AFTER, PICK_AFTER, mesaQ, neighborDrop,
} from '../js/hero-terrain.js';
import { t, setLocale } from '../js/i18n.js';

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

// Lo que se dibuja, leído en la escala del resultado, es lo que dicen las etiquetas.
const value = (at, m) => height(at[0], at[1], m) / RESULT_H;
for (const [name, at, m, want] of [
  ['la n.º 1 de MT5 en el periodo optimizado', PEAK_A, 0, MT5_RESULT],
  ['la n.º 1 de MT5 en el periodo nuevo', PEAK_A, 1, MT5_AFTER],
  ['la meseta en el periodo optimizado', MESA_C, 0, PICK_RESULT],
  ['la meseta en el periodo nuevo', MESA_C, 1, PICK_AFTER],
]) {
  const got = value(at, m);
  check(`altura proporcional: ${name}`, Math.abs(got - want) < 0.01 * want, `${got.toFixed(3)} frente a ${want}`);
}

// Los dos marcadores caen en nodos de la rejilla de pasadas (sus vecinos son nodos de verdad).
const onGrid = (x) => Math.abs(x / STEP - Math.round(x / STEP)) < 1e-9;
check('la meseta está en un nodo de la rejilla', onGrid(MESA_C[0] - PEAK_A[0]) && onGrid(MESA_C[1] - PEAK_A[1]));

// La n.º 1 de MT5 tiene que verse como el pico más alto (si otro la supera, el dibujo engaña).
const top0 = height(PEAK_A[0], PEAK_A[1], 0);
let rival = 0;
for (let i = 0; i <= 80; i++) {
  for (let j = 0; j <= 80; j++) {
    const u = i / 40 - 1;
    const v = j / 40 - 1;
    if ((u - PEAK_A[0]) ** 2 + (v - PEAK_A[1]) ** 2 > 0.04) rival = Math.max(rival, height(u, v, 0));
  }
}
check('la n.º 1 de MT5 es el pico más alto', top0 > rival * 1.25, `${top0.toFixed(2)} frente a ${rival.toFixed(2)}`);

// El contorno de la meseta no se deforma en el periodo nuevo: a lo largo de él la altura baja lo
// mismo que la meseta (de 2,18 a 2,05) y nada más (los montículos nuevos quedan lejos).
const keep = PICK_AFTER / PICK_RESULT;
let rimDrift = 0;
for (let k = 0; k < 72; k++) {
  const a = (k / 72) * Math.PI * 2;
  // Se busca el radio en el que q = RIM_Q en esa dirección.
  let lo = 0; let hi = 1;
  for (let it = 0; it < 40; it++) {
    const mid = (lo + hi) / 2;
    if (mesaQ(MESA_C[0] + mid * Math.cos(a), MESA_C[1] + mid * Math.sin(a)) < RIM_Q) lo = mid; else hi = mid;
  }
  const u = MESA_C[0] + lo * Math.cos(a);
  const v = MESA_C[1] + lo * Math.sin(a);
  const h0 = height(u, v, 0);
  rimDrift = Math.max(rimDrift, Math.abs(height(u, v, 1) - h0 * keep) / h0);
}
check('el contorno de la meseta aguanta en el periodo nuevo', rimDrift < 0.04, `${(rimDrift * 100).toFixed(1)} %`);

// La prueba de los vecinos que se dibuja: los de la n.º 1 se hunden, los de la meseta no.
const dropA = neighborDrop(PEAK_A, 0);
check('los vecinos de la n.º 1 de MT5 se hunden', dropA > 0.5, `${(dropA * 100).toFixed(0)} %`);
for (const m of [0, 1]) {
  const d = neighborDrop(MESA_C, m);
  check(`los vecinos de la meseta aguantan (m = ${m})`, d < 0.03, `${(d * 100).toFixed(1)} %`);
}
// El texto para lectores de pantalla dice la misma pérdida que el dibujo.
const pct = String(Math.round(dropA * 100));
setLocale('en');
check('el texto accesible (EN) da la pérdida de los vecinos', t('lp.surface.state.peaks').includes(`${pct}%`), t('lp.surface.state.peaks'));
setLocale('es');
check('el texto accesible (ES) da la pérdida de los vecinos', t('lp.surface.state.peaks').includes(`${pct} %`), t('lp.surface.state.peaks'));

let finite = true;
for (let i = 0; i < 50; i++) for (let j = 0; j < 50; j++) if (!Number.isFinite(height(i / 25 - 1, j / 25 - 1, 0.5))) finite = false;
check('la altura es finita en toda la rejilla', finite);

console.log(`\nRESULTADO: ${checks - failures}/${checks} comprobaciones correctas`);
if (failures) process.exit(1);
