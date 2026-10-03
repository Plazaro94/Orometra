// Imagen para redes (og-image.jpg y og-image-es.jpg, 1200×630): la tarjeta de la portada,
// con la misma foto de montaña, el mismo velo y el titular a la izquierda.
//
//   node tools/og-image.mjs
//
// Necesita Playwright con Chromium (no es dependencia del proyecto: se usa el instalado en el
// sistema). No hace falta servidor: la tarjeta se monta en una página en blanco con todo
// incrustado.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* sin instalar en el proyecto */ }
  const globalRoot = execSync('npm root -g').toString().trim();
  return createRequire(path.join(globalRoot, 'noop.js'))('playwright');
}

const COPY = {
  en: { file: 'og-image.jpg', title: 'Separate the fragile <em>from the stable.</em>', lead: 'Orometra analyzes your MT5 optimization and tells you which configuration of your EA is stable and how much evidence backs it.' },
  es: { file: 'og-image-es.jpg', title: 'Separa lo frágil <em>de lo estable.</em>', lead: 'Orometra analiza tu optimización de MT5 y te dice qué configuración de tu EA es estable y cuánta evidencia la respalda.' },
};

// Fuentes e icono incrustados: la tarjeta se monta en una página en blanco, y desde ahí el
// navegador no carga fuentes de otro origen.
const inline = (file, type) => `data:${type};base64,${fs.readFileSync(path.join(ROOT, file)).toString('base64')}`;
const font = (w) => `@font-face{font-family:Plex;font-weight:${w};src:url(${inline(`fonts/source-sans-3-${w}.woff2`, 'font/woff2')})}`;

const card = (c) => `<!doctype html><html><head><meta charset="utf-8"><style>
${font(400)}${font(600)}${font(700)}@font-face{font-family:Serif;font-style:italic;font-weight:600;src:url(${inline('fonts/source-serif-4-600-italic.woff2', 'font/woff2')})}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;font-family:Plex,sans-serif;color:#f4f1ea;
  display:flex;flex-direction:column;justify-content:center;padding:0 72px;
  background:linear-gradient(90deg,rgba(12,16,26,.92) 0%,rgba(12,16,26,.66) 42%,rgba(12,16,26,.08) 74%,rgba(12,16,26,0) 100%),
    url(${inline('img/fotos/portada-oscuro-esc-1400.webp', 'image/webp')}) center 40%/cover no-repeat,#0f1625}
.brand{display:flex;align-items:center;gap:14px;font-weight:600;font-size:28px;margin-bottom:38px}
.brand img{width:52px;height:52px;border-radius:12px;background:rgba(255,255,255,.08);padding:6px}
h1{font-weight:700;font-size:68px;line-height:1.02;letter-spacing:-.02em;max-width:620px}
h1 em{display:block;font-family:Serif,serif;font-style:italic;font-weight:600}
p{margin-top:26px;font-size:25px;line-height:1.4;color:#e6e2dc;max-width:560px}
.url{margin-top:36px;font-weight:700;font-size:22px;color:#8fe3f2;letter-spacing:.02em}
</style></head><body>
<div class="brand"><img src="${inline('favicon.svg', 'image/svg+xml')}" alt="">Orometra</div>
<h1>${c.title}</h1><p>${c.lead}</p><div class="url">orometra.com</div></body></html>`;

const { chromium } = await loadPlaywright();
const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }));
for (const c of Object.values(COPY)) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(card(c));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ROOT, c.file), type: 'jpeg', quality: 88 });
  console.log(`  ${c.file}`);
  await page.close();
}
await browser.close();
