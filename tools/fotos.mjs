// Fotos de paisaje de la web: recorte por hueco y por dispositivo, y exportación en AVIF
// y WebP a varios anchos. Los originales no se suben al repositorio (pesan mucho):
// van en fotos-originales/, que está en .gitignore.
//
//   npm i --no-save sharp   (o SHARP_FROM=/ruta/a/un/node_modules/padre)
//   node tools/fotos.mjs
//
// Cada recorte se da en píxeles del original: [x, y, ancho, alto].

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'fotos-originales');
const OUT = path.join(ROOT, 'img', 'fotos');

function loadSharp() {
  const tries = [createRequire(import.meta.url)];
  if (process.env.SHARP_FROM) tries.push(createRequire(path.join(process.env.SHARP_FROM, 'x.js')));
  for (const req of tries) { try { return req('sharp'); } catch { /* siguiente */ } }
  throw new Error('Falta sharp: npm i --no-save sharp (o SHARP_FROM=...)');
}

// hueco -> original, y los recortes de escritorio (horizontal) y móvil (vertical)
const FOTOS = {
  'portada-oscuro': { src: 'portada-oscuro.jpg', desk: [0, 200, 2576, 1472], mob: [605, 0, 1370, 1827] },
  'portada-claro': { src: 'portada-claro.jpg', desk: [0, 520, 1932, 1104], mob: [0, 0, 1932, 2576] },
  cierre: { src: 'cierre.jpg', desk: [0, 110, 2576, 1220], mob: [795, 0, 915, 1511] },
  guias: { src: 'guias.jpg', desk: [0, 330, 2576, 890], mob: [380, 250, 1700, 1100] },
  404: { src: '404.jpg', desk: [0, 820, 1717, 900], mob: [0, 0, 1717, 2576] },
};
// Móvil a 1200: una pantalla de 390 px a 3x pide unos 1170 px reales; con menos, se ve borrosa.
const ANCHOS = { desk: [1400, 2200], mob: [1200] };

const sharp = loadSharp();
fs.mkdirSync(OUT, { recursive: true });
let total = 0;
for (const [name, f] of Object.entries(FOTOS)) {
  for (const kind of ['desk', 'mob']) {
    const [left, top, width, height] = f[kind];
    for (const w of ANCHOS[kind]) {
      const target = Math.min(w, width);
      const base = sharp(path.join(SRC, f.src)).extract({ left, top, width, height }).resize({ width: target }).withMetadata({ orientation: undefined });
      const stem = path.join(OUT, `${name}-${kind === 'desk' ? 'esc' : 'mov'}-${target}`);
      await base.clone().avif({ quality: 62, effort: 6 }).toFile(`${stem}.avif`);
      await base.clone().webp({ quality: 82 }).toFile(`${stem}.webp`);
      const kb = ['avif', 'webp'].map((e) => Math.round(fs.statSync(`${stem}.${e}`).size / 1024));
      total += kb[0];
      console.log(`${path.basename(stem)}  avif ${kb[0]} KB · webp ${kb[1]} KB`);
    }
  }
}
console.log(`AVIF en total: ${total} KB`);
