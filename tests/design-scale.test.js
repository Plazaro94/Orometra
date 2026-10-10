// Escala de tamaños de letra y espaciados de styles.css (auditoría de diseño, 2026-10-10).
//
// Antes había 32 tamaños de letra distintos escritos a mano, con medios píxeles (12,5 / 13,5 /
// 14,5…), y 39 valores de espaciado. Las diferencias de medio píxel no se leen como jerarquía:
// solo hacen que la web se sienta menos de una pieza y que cada cambio invente su propio valor.
// Esta prueba falla si vuelve a aparecer un valor fuera de la escala (ver el comentario de
// --fs-sm en styles.css).
//
//   node tests/design-scale.test.js

import fs from 'node:fs';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}

const raw = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
const lineOf = (i) => css.slice(0, i).split('\n').length;

// Reglas sueltas «selector { declaraciones }», también dentro de @media y @container.
const rules = [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2], at: m.index }));
// El texto de los diagramas SVG va en unidades del dibujo, no en píxeles de pantalla.
const isSvg = (r) => /svg|(^|[\s,>])text\b|\.ch-|\.hm-text/.test(r.sel) || /(^|;)\s*fill\s*:/.test(r.body);

console.log('\nTamaños de letra');
const TEXT = new Set([9, 11, 12, 13, 14, 15, 16, 17, 18, 20]); // 9: la etiqueta del icono de archivo
const badFs = [];
for (const r of rules) {
  if (isSvg(r)) continue;
  for (const m of r.body.matchAll(/(?<![-\w])font-size\s*:\s*([^;]+)/g)) {
    for (const n of m[1].matchAll(/(\d+(?:\.\d+)?)px/g)) {
      const v = Number(n[1]);
      if (!Number.isInteger(v) || (v < 21 && !TEXT.has(v))) badFs.push(`${v}px (línea ${lineOf(r.at)}: ${r.sel.slice(-40)})`);
    }
  }
}
check('sin medios píxeles ni tamaños de texto fuera de la escala', badFs.length === 0, badFs.join('; '));
check('--fs-xs ya no existe (valía lo mismo que --fs-sm)', !/--fs-xs/.test(css));
const tokens = Object.fromEntries([...css.matchAll(/--fs-(sm|md|base|lg|xl):(\d+(?:\.\d+)?)px/g)].map((m) => [m[1], Number(m[2])]));
check('tokens: 13, 14, 15, 17 y 20 px', JSON.stringify(tokens) === JSON.stringify({ sm: 13, md: 14, base: 15, lg: 17, xl: 20 }), JSON.stringify(tokens));
const literal = [];
for (const r of rules) {
  if (isSvg(r)) continue;
  for (const m of r.body.matchAll(/(?<![-\w])font-size\s*:\s*(13|14|15|17|20)px/g)) literal.push(`${m[1]}px (línea ${lineOf(r.at)})`);
}
check('13, 14, 15, 17 y 20 px van con su token', literal.length === 0, literal.join('; '));

console.log('\nEspaciado');
const SPACE = new Set([0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 64, 72, 88, 104, 112]);
const PROPS = /(?<![-\w])(?:margin|padding|gap|row-gap|column-gap|(?:margin|padding)-(?:top|bottom|left|right|block|inline)(?:-(?:start|end))?)\s*:\s*([^;]+)/g;
const badSp = [];
for (const r of rules) {
  for (const m of r.body.matchAll(PROPS)) {
    for (const n of m[1].matchAll(/(-?\d+(?:\.\d+)?)px/g)) {
      const v = Math.abs(Number(n[1]));
      if (!SPACE.has(v)) badSp.push(`${n[1]}px (línea ${lineOf(r.at)}: ${r.sel.slice(-40)})`);
    }
  }
}
check('margin, padding y gap dentro de la escala', badSp.length === 0, badSp.join('; '));

console.log(`\n${checks - failures}/${checks} comprobaciones correctas`);
if (failures) process.exit(1);
