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
  // Monument Valley de noche: mesetas de cima plana bajo un cielo del mismo azul noche
  // que la web. El título va arriba, sobre el cielo (ver .photo-head.ph-top).
  metodologia: { src: 'metodologia.jpg', desk: [0, 120, 2576, 1180], mob: [1080, 320, 1380, 1130], calidad: 56 },
  404: { src: '404.jpg', desk: [0, 820, 1717, 900], mob: [0, 0, 1717, 2576] },
  // Foto de contenido de la portada («Nadie vuela solo»): una tarjeta de ~5:4 al lado del texto,
  // no una franja a todo el ancho. Un solo recorte y tres anchos (la tarjeta mide unos 600 px;
  // 1200 cubre el móvil a 3x y el escritorio a 2x). El original ya es de un azul verdoso frío:
  // solo se orienta hacia el índigo de la paleta (más oscuro en el tema oscuro, más claro y
  // lavanda en el claro).
  'bandada-noche': { src: 'bandada.jpg', desk: [100, 0, 1786, 1429], anchos: { desk: [800, 1200, 1600] }, grado: 'noche', calidad: 52 },
  'bandada-dia': { src: 'bandada.jpg', desk: [100, 0, 1786, 1429], anchos: { desk: [800, 1200, 1600] }, grado: 'dia', calidad: 52 },
};

// Etalonado de la bandada. Se orienta el tono hacia el índigo, se baja la saturación y se
// añade una capa suave (luz suave, no multiplicar: no oscurece). Los negros no se tocan: las
// siluetas son lo que se mira, y si el cielo se oscurece demasiado se pierden.
const GRADOS = {
  noche: { hue: 12, saturation: 0.7, brightness: 0.9, tono: { r: 96, g: 122, b: 176, alpha: 0.32 } },
  dia: { hue: 10, saturation: 0.6, brightness: 1.14, tono: { r: 190, g: 202, b: 228, alpha: 0.34 } },
};
async function etalonar(img, grado, width, height) {
  if (!grado) return img;
  const { hue, saturation, brightness, tono } = GRADOS[grado];
  const capa = await sharp({ create: { width, height, channels: 4, background: tono } }).png().toBuffer();
  return sharp(await img.modulate({ hue, saturation, brightness }).composite([{ input: capa, blend: 'soft-light' }]).toBuffer());
}
// SOLO=nombre regenera solo las fotos cuyo nombre empieza así (la exportación entera tarda).
const SOLO = process.env.SOLO || '';
// Móvil a 1200: una pantalla de 390 px a 3x pide unos 1170 px reales; con menos, se ve borrosa.
const ANCHOS = { desk: [1400, 2200], mob: [1200] };

const sharp = loadSharp();
fs.mkdirSync(OUT, { recursive: true });
let total = 0;
for (const [name, f] of Object.entries(FOTOS)) {
  if (!name.startsWith(SOLO)) continue;
  for (const kind of ['desk', 'mob']) {
    if (!f[kind]) continue;
    const [left, top, width, height] = f[kind];
    for (const w of (f.anchos || ANCHOS)[kind]) {
      const target = Math.min(w, width);
      const h = Math.round((height * target) / width);
      const base = await etalonar(sharp(path.join(SRC, f.src)).extract({ left, top, width, height }).resize({ width: target }).withMetadata({ orientation: undefined }), f.grado, target, h);
      const stem = path.join(OUT, `${name}-${kind === 'desk' ? 'esc' : 'mov'}-${target}`);
      await base.clone().avif({ quality: f.calidad || 62, effort: 6 }).toFile(`${stem}.avif`);
      await base.clone().webp({ quality: (f.calidad || 62) + 20 }).toFile(`${stem}.webp`);
      const kb = ['avif', 'webp'].map((e) => Math.round(fs.statSync(`${stem}.${e}`).size / 1024));
      total += kb[0];
      console.log(`${path.basename(stem)}  avif ${kb[0]} KB · webp ${kb[1]} KB`);
    }
  }
}
console.log(`AVIF en total: ${total} KB`);
