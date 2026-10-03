// Imagen para redes (og-image.jpg y og-image-es.jpg, 1200×630): el titular de la portada
// junto al relieve de la portada tal y como se dibuja (WebGL), en el periodo nuevo: la meseta
// aguanta y el n.º 1 de MT5 se ha hundido (su silueta queda en discontinua).
//
//   node tools/og-image.mjs
//
// Necesita Playwright con Chromium (no es dependencia del proyecto: se usa el instalado en el
// sistema). Levanta su propio servidor de desarrollo.

import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3917;
const BASE = `http://localhost:${PORT}`;

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* sin instalar en el proyecto */ }
  const globalRoot = execSync('npm root -g').toString().trim();
  return createRequire(path.join(globalRoot, 'noop.js'))('playwright');
}

const COPY = {
  en: { url: '/', file: 'og-image.jpg', title: 'Separate the fragile <em>from the stable.</em>', lead: 'Orometra analyzes your MT5 optimization and tells you which configuration of your EA is stable and how much evidence backs it.' },
  es: { url: '/es/', file: 'og-image-es.jpg', title: 'Separa lo frágil <em>de lo estable.</em>', lead: 'Orometra analiza tu optimización de MT5 y te dice qué configuración de tu EA es estable y cuánta evidencia la respalda.' },
};

// Fuentes e icono incrustados: la tarjeta se monta en una página en blanco, y desde ahí el
// navegador no carga fuentes de otro origen.
const inline = (file, type) => `data:${type};base64,${fs.readFileSync(path.join(ROOT, file)).toString('base64')}`;
const font = (w) => `@font-face{font-family:Plex;font-weight:${w};src:url(${inline(`fonts/source-sans-3-${w}.woff2`, 'font/woff2')})}`;

const card = (c, img) => `<!doctype html><html><head><meta charset="utf-8"><style>
${font(400)}${font(600)}${font(700)}@font-face{font-family:Serif;font-style:italic;font-weight:600;src:url(${inline('fonts/source-serif-4-600-italic.woff2', 'font/woff2')})}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;background:#1b1c1f;font-family:Plex,sans-serif;color:#e8e4dd;
  display:grid;grid-template-columns:500px 1fr;align-items:center;padding:0 44px 0 64px;gap:30px}
.brand{display:flex;align-items:center;gap:14px;font-weight:600;font-size:28px;margin-bottom:34px}
.brand img{width:52px;height:52px;border-radius:12px;background:#2a2b30;padding:6px}
h1{font-weight:700;font-size:58px;line-height:1.04;letter-spacing:-.02em}
h1 em{display:block;font-family:Serif,serif;font-style:italic;font-weight:600}
p{margin-top:24px;font-size:24px;line-height:1.4;color:#aba7a0}
.url{margin-top:34px;font-weight:600;font-size:22px;color:#cfe06a}
.art{display:block;width:100%;border-radius:22px;box-shadow:0 0 0 1px rgba(255,255,255,.08)}
</style></head><body>
<div><div class="brand"><img src="${inline('favicon.svg', 'image/svg+xml')}" alt="">Orometra</div>
<h1>${c.title}</h1><p>${c.lead}</p><div class="url">orometra.com</div></div>
<img class="art" src="${img}" alt=""></body></html>`;

const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.js'), String(PORT)], { stdio: 'ignore' });
try {
  await new Promise((r) => setTimeout(r, 600));
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
    .catch(() => chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }));
  for (const [lang, c] of Object.entries(COPY)) {
    // Sin animación, el relieve se dibuja directamente en el periodo nuevo.
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce', locale: lang === 'es' ? 'es-ES' : 'en-US' });
    const page = await ctx.newPage();
    await page.goto(BASE + c.url);
    await page.waitForSelector('#heroSurfaceHost[data-surface-state]', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const canvas = await page.$('#heroSurface');
    // El relieve está bajo la foto de portada: se lleva a la vista antes de recortarlo.
    await canvas.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(1200);
    const box = await canvas.boundingBox();
    // Solo el relieve: fuera la leyenda y la pista de abajo, y algo de margen vacío a los lados.
    const shot = await page.screenshot({ type: 'png', clip: { x: box.x + box.width * 0.02, y: box.y + box.height * 0.02, width: box.width * 0.95, height: box.height * 0.74 } });
    const out = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await out.setContent(card(c, `data:image/png;base64,${shot.toString('base64')}`));
    await out.evaluate(() => document.fonts.ready);
    await out.waitForTimeout(300);
    await out.screenshot({ path: path.join(ROOT, c.file), type: 'jpeg', quality: 88 });
    console.log(`  ${c.file}`);
    await ctx.close();
  }
  await browser.close();
} finally {
  server.kill();
}
