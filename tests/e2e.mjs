// Pruebas de la interfaz en un navegador de verdad (Chromium con Playwright): lo que los
// tests del motor no ven. Cargar archivos, el informe, cambiar de idioma, descargar el
// .set, un archivo que no sirve, cancelar, y la navegación en el móvil.
//
//   npm run test:e2e
//
// Playwright no es dependencia del proyecto: se usa el instalado (en CI lo instala el
// workflow). Levanta su propio servidor de desarrollo.

import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemoTables } from '../js/demo.js';
import { zip, libro } from './helpers/xlsx-build.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3918;
const BASE = `http://localhost:${PORT}`;

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}
const section = (t) => console.log(`\n${t}`);

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* sin instalar en el proyecto */ }
  const globalRoot = execSync('npm root -g').toString().trim();
  return createRequire(path.join(globalRoot, 'noop.js'))('playwright');
}

// Las tablas del ejemplo, escritas como las exporta MT5 (XML Spreadsheet 2003).
function toMt5Xml(table) {
  const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const cell = (v) => `<Cell><Data ss:Type="${typeof v === 'number' ? 'Number' : 'String'}">${esc(v)}</Data></Cell>`;
  const rows = [table.headers, ...table.rows].map((r) => `<Row>${r.map(cell).join('')}</Row>`).join('\n');
  return `<?xml version="1.0"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n<Worksheet ss:Name="Tester Optimizator Results"><Table>\n${rows}\n</Table></Worksheet></Workbook>\n`;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orometra-e2e-'));
const demo = buildDemoTables();
const isXml = path.join(tmp, 'ReportOptimizer.xml');
const oosXml = path.join(tmp, 'ReportOptimizer.forward.xml');
const junk = path.join(tmp, 'notas.xml');
fs.writeFileSync(isXml, toMt5Xml(demo.isTable));
fs.writeFileSync(oosXml, toMt5Xml(demo.oosTable));
fs.writeFileSync(junk, 'esto no es una exportación de MT5');
// Lo mismo como libros de Excel (.xlsx), por si el usuario los guardó desde Excel.
const toXlsx = (table) => Buffer.from(zip(libro({ filas: [table.headers, ...table.rows], compartidas: table.headers })));
const isXlsx = path.join(tmp, 'ReportOptimizer.xlsx');
const oosXlsx = path.join(tmp, 'ReportOptimizer.forward.xlsx');
fs.writeFileSync(isXlsx, toXlsx(demo.isTable));
fs.writeFileSync(oosXlsx, toXlsx(demo.oosTable));

const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.js'), String(PORT)], { stdio: 'ignore' });
let browser;
try {
  await new Promise((r) => setTimeout(r, 600));
  const { chromium, devices } = await loadPlaywright();
  browser = await chromium.launch();
  const pageErrors = [];
  const watch = (page) => page.on('pageerror', (e) => pageErrors.push(e.message));
  const appPage = async (lang = 'en', opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, ...opts });
    await ctx.addInitScript((l) => { try { localStorage.setItem('orometra.lang', l); } catch { /* */ } }, lang);
    const page = await ctx.newPage();
    watch(page);
    return page;
  };

  section('1. Portada');
  {
    const page = await appPage('es');
    await page.goto(`${BASE}/es/`);
    check('el titular está en español', (await page.textContent('h1')).includes('suerte'));
    const og = await page.getAttribute('meta[property="og:image"]', 'content');
    check('la imagen para redes es la de la versión en español', /og-image-es\.jpg/.test(og), og);
    await page.context().close();
  }
  {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'es-ES' });
    const page = await ctx.newPage();
    watch(page);
    await page.goto(`${BASE}/es/methodology/`);
    await page.click('.lp-menu-btn');
    const links = await page.$$eval('#lpMenu a', (as) => as.map((a) => a.getAttribute('href')));
    check('móvil: el menú lleva a la app, la metodología, las guías y la privacidad',
      ['/app/', '/es/methodology/', '/es/guias/', '/es/privacy/'].every((h) => links.includes(h)), links.join(' '));
    await page.keyboard.press('Escape');
    check('móvil: Esc cierra el menú', await page.$eval('#lpMenu', (e) => e.hidden));
    await ctx.close();
  }

  section('2. Un archivo que no es de MT5');
  {
    const page = await appPage('es');
    await page.goto(`${BASE}/app/`);
    await page.setInputFiles('#mainFile', junk);
    await page.waitForFunction(() => document.querySelector('#mainDrop').classList.contains('error'), null, { timeout: 15000 }).catch(() => {});
    check('se marca como error', await page.$eval('#mainDrop', (e) => e.classList.contains('error')));
    check('y no se puede analizar', await page.$eval('#analyzeBtn', (b) => b.disabled));
    await page.context().close();
  }

  section('3. Tus archivos de MT5, de principio a fin');
  {
    const page = await appPage('en');
    await page.goto(`${BASE}/app/`);
    await page.setInputFiles('#mainFile', [isXml, oosXml]);
    await page.waitForFunction(() => !document.querySelector('#analyzeBtn').disabled, null, { timeout: 60000 });
    await page.click('#analyzeBtn');
    await page.waitForSelector('.vx', { timeout: 120000 });
    check('el informe se muestra', Boolean(await page.$('.vx')));
    check('sin aviso de error', await page.$eval('#errorBox', (e) => e.hidden));
    const summary = await page.textContent('#intakeSummaryText');
    check('dice qué archivos se analizaron', summary.includes('ReportOptimizer.xml') && summary.includes('forward'), summary);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      page.click('.vx [data-export="set"]'),
    ]);
    const setText = fs.readFileSync(await download.path(), 'utf8').replace(/\u0000/g, '');
    check('el .set se descarga', /\.set$/.test(download.suggestedFilename()), download.suggestedFilename());
    check('y trae los parámetros del EA', ['InpFastMA', 'InpSlowMA', 'InpATR_SL'].every((n) => new RegExp(`^${n}=`, 'm').test(setText)), setText.slice(0, 200));

    // Cambiar de idioma con el informe en pantalla: se traduce sin volver a analizar.
    await page.click('.sidebar-bottom [data-lang-set="es"], .header-controls [data-lang-set="es"] >> visible=true');
    await page.waitForFunction(() => document.documentElement.lang === 'es');
    check('cambia a español', (await page.textContent('.nav-item[data-tab="verdict"]')).includes('Veredicto'));
    check('y el informe sigue ahí', Boolean(await page.$('.vx')));

    await page.click('.tab-next-btn');
    check('«Siguiente» lleva a las mesetas', await page.$eval('.nav-item[data-tab="plateaus"]', (b) => b.classList.contains('active')));
    await page.context().close();
  }

  section('3b. Los mismos archivos como .xlsx');
  {
    const page = await appPage('en');
    await page.goto(`${BASE}/app/`);
    await page.setInputFiles('#mainFile', [isXlsx, oosXlsx]);
    await page.waitForFunction(() => !document.querySelector('#analyzeBtn').disabled, null, { timeout: 60000 });
    const roles = await page.textContent('#intakeSummaryText').catch(() => '');
    await page.click('#analyzeBtn');
    await page.waitForSelector('.vx', { timeout: 120000 });
    check('el informe se muestra con .xlsx', Boolean(await page.$('.vx')));
    check('reconoce cuál es la optimización y cuál el forward', await page.$eval('#errorBox', (e) => e.hidden), roles);
    // El .xlsx se descomprime en el worker: la página ni siquiera descarga el lector.
    const loadedHere = await page.evaluate(() => performance.getEntriesByType('resource').some((e) => /\/js\/xlsx\.js/.test(e.name)));
    check('la página no lee el .xlsx (lo hace el worker)', !loadedHere);
    await page.context().close();
  }

  section('4. Cancelar');
  {
    const page = await appPage('en');
    await page.goto(`${BASE}/app/`);
    await page.click('#demoBtn');
    await page.waitForSelector('#cancelBtn:not([hidden])', { timeout: 20000 });
    await page.click('#cancelBtn');
    await page.waitForFunction(() => document.querySelector('#statusBar').hidden, null, { timeout: 5000 }).catch(() => {});
    check('cancelar no muestra un error', await page.$eval('#errorBox', (e) => e.hidden));
    check('y se puede volver a empezar', await page.$eval('#demoBtn', (b) => !b.disabled));
    await page.click('#demoBtn');
    await page.waitForSelector('.vx', { timeout: 120000 });
    check('el siguiente análisis termina', Boolean(await page.$('.vx')));
    await page.context().close();
  }

  section('5. El informe en el móvil');
  {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'es-ES', reducedMotion: 'reduce' });
    await ctx.addInitScript(() => { try { localStorage.setItem('orometra.lang', 'es'); } catch { /* */ } });
    const page = await ctx.newPage();
    watch(page);
    await page.goto(`${BASE}/app/?demo=1`);
    await page.waitForSelector('.vx', { timeout: 120000 });
    await page.click('.nav-item[data-tab="rejected"]');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.click('.nav-item[data-tab="plateaus"]');
    await page.waitForTimeout(300);
    const at = await page.evaluate(() => ({
      view: document.querySelector('#view').getBoundingClientRect().top,
      tabs: document.querySelector('.sidebar-scroll').getBoundingClientRect().bottom,
    }));
    check('cambiar de pestaña desde abajo lleva al principio de la nueva', at.view >= at.tabs - 1 && at.view < 200, JSON.stringify(at));
    check('al bajar, solo las pestañas quedan fijas', at.tabs < 70, String(at.tabs));
    check('sin scroll horizontal', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await ctx.close();
  }

  section('6. Sin errores de JavaScript');
  check('ninguna página ha lanzado un error', pageErrors.length === 0, pageErrors.join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\nRESULTADO: ${checks - failures}/${checks} comprobaciones correctas`);
if (failures) process.exit(1);
