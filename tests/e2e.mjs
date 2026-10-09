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
const setFile = path.join(tmp, 'DemoEA.set');
fs.writeFileSync(setFile, 'InpFastMA=16||4||2||30||Y\nInpSlowMA=70||20||10||120||Y\n');
// Lo mismo como libros de Excel (.xlsx), por si el usuario los guardó desde Excel.
const toXlsx = (table) => Buffer.from(zip(libro({ filas: [table.headers, ...table.rows], compartidas: table.headers })));
const isXlsx = path.join(tmp, 'ReportOptimizer.xlsx');
const oosXlsx = path.join(tmp, 'ReportOptimizer.forward.xlsx');
fs.writeFileSync(isXlsx, toXlsx(demo.isTable));
fs.writeFileSync(oosXlsx, toXlsx(demo.oosTable));

// Dos mesetas: la demo duplicada con un booleano (`InpUseFilter`). Un booleano parte el
// espacio, así que cada mitad es su propia meseta; la mitad «false» rinde algo menos y queda
// segunda. Sirve para comprobar que «Exportar» baja la PROPUESTA (M1) aunque se haya mirado
// otra meseta antes.
function twoPlateauTables({ isTable, oosTable }) {
  const n = isTable.rows.length;
  const worse = (table, row) => {
    const pf = table.headers.indexOf('Profit Factor');
    const pr = table.headers.indexOf('Profit');
    const c = row.slice();
    c[pf] = Number((1 + (c[pf] - 1) * 0.85).toFixed(2));
    c[pr] = Number((c[pr] * 0.85).toFixed(2));
    return c;
  };
  const dup = (table) => ({
    ...table,
    headers: [...table.headers, 'InpUseFilter'],
    rows: [
      ...table.rows.map((r) => [...r, 'true']),
      ...table.rows.map((r) => [r[0] + n, ...worse(table, r).slice(1), 'false']),
    ],
  });
  return { isTable: dup(isTable), oosTable: dup(oosTable) };
}
const two = twoPlateauTables(demo);
const twoIsXml = path.join(tmp, 'Dos.xml');
const twoOosXml = path.join(tmp, 'Dos.forward.xml');
fs.writeFileSync(twoIsXml, toMt5Xml(two.isTable));
fs.writeFileSync(twoOosXml, toMt5Xml(two.oosTable));

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
    check('el titular está en español', (await page.textContent('h1')).includes('frágil'));
    const og = await page.getAttribute('meta[property="og:image"]', 'content');
    check('la imagen para redes es la de la versión en español', /og-image-es\.jpg/.test(og), og);
    // Las páginas públicas ya vienen en su idioma: no descargan los textos de la app.
    await page.waitForLoadState('load');
    const loaded = (re) => page.evaluate((src) => performance.getEntriesByType('resource').some((e) => new RegExp(src).test(e.name)), re.source);
    check('la portada no descarga i18n.js', !(await loaded(/\/js\/i18n\.js/)));
    check('ni código de gráficos 3D', !(await loaded(/hero-surface|hero-terrain|plateau-surface/)));
    await page.goto(`${BASE}/es/guias/sobreoptimizacion-mt5/`);
    await page.waitForSelector('.guide-rail, .lp-menu-btn', { timeout: 10000 }).catch(() => {});
    check('una guía no descarga i18n.js', !(await loaded(/\/js\/i18n\.js/)));
    await page.context().close();
  }
  {
    // La 404 es una sola página para los dos idiomas: se traduce con el paquete pequeño.
    const page = await appPage('es');
    await page.goto(`${BASE}/404.html`);
    await page.waitForFunction(() => document.documentElement.lang === 'es', null, { timeout: 10000 }).catch(() => {});
    const h1 = await page.textContent('h1');
    check('la 404 sale en el idioma del visitante', /no existe/.test(h1), h1);
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

  section('2b. Del ejemplo a tus archivos, y lo que se suelta mientras se analiza');
  {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => { try { localStorage.setItem('orometra.lang', 'es'); } catch { /* */ } });
    const page = await ctx.newPage();
    watch(page);
    const stored = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('orometra.history')); } catch { return null; } });
    const ready = () => page.waitForFunction(() => !document.querySelector('#analyzeBtn').disabled, null, { timeout: 60000 });
    const analyzed = () => page.waitForFunction(() => !document.querySelector('#analyzeBtn').classList.contains('busy') && document.querySelector('.vx'), null, { timeout: 120000 });
    // Tras el ejemplo, un solo archivo propio no se mezcla con la otra mitad del ejemplo.
    await page.goto(`${BASE}/app/?demo=1`);
    await page.waitForSelector('.vx', { timeout: 120000 });
    await page.setInputFiles('#mainFile', [isXml]);
    await ready();
    const drop = await page.textContent('#mainDropStatus');
    check('tras el ejemplo, un archivo propio no se junta con el forward del ejemplo', drop.includes('ReportOptimizer.xml') && !/DEMO/i.test(drop), drop);
    await page.click('#analyzeBtn');
    await analyzed();
    check('y se analiza sin error', await page.$eval('#errorBox', (e) => e.hidden), await page.textContent('#errorBox'));
    check('solo con la optimización', !(await page.textContent('#intakeSummaryText')).includes('forward'), await page.textContent('#intakeSummaryText'));
    // Los tres archivos de golpe (optimización, forward y .set) con un análisis en pantalla:
    // el .set no lanza el análisis por su cuenta con los archivos a medio cargar.
    await page.evaluate(() => localStorage.removeItem('orometra.history'));
    await page.goto(`${BASE}/app/?demo=1`);
    await page.waitForSelector('.vx', { timeout: 120000 });
    await page.setInputFiles('#mainFile', [setFile, isXml, oosXml]);
    await ready();
    await page.waitForTimeout(500);
    check('el .set de la tanda no analiza solo', await page.$eval('#statusBar', (e) => e.hidden) && !(await stored()));
    check('el .set queda cargado', (await page.textContent('#setStatus')).includes('DemoEA.set'));
    // Durante un análisis, lo soltado espera y no se cuela en el informe.
    await page.goto(`${BASE}/app/`);
    await page.setInputFiles('#mainFile', [isXml]);
    await ready();
    await page.click('#analyzeBtn');
    await page.waitForSelector('#analyzeBtn.busy');
    await page.setInputFiles('#mainFile', [oosXml]);
    const label = await page.textContent('#progressLabel');
    check('lo soltado durante el análisis espera, y se dice', /al terminar/.test(label), label);
    await analyzed();
    await page.waitForFunction(() => /forward\.xml/.test(document.querySelector('#mainDropStatus').textContent), null, { timeout: 30000 });
    const s2 = await stored();
    check('el informe y el historial dicen lo que se analizó (sin el forward soltado después)',
      !(await page.textContent('#intakeSummaryText')).includes('forward') && s2 && s2.entries.length === 1 && !s2.entries[0].files.oos,
      JSON.stringify(s2 && s2.entries.map((e) => e.files)));
    check('y al terminar el forward queda cargado para el siguiente análisis', (await page.textContent('#mainDropStatus')).includes('ReportOptimizer.forward.xml'));
    await ctx.close();
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
    const setBytes = fs.readFileSync(await download.path());
    const setText = setBytes.toString('utf16le').replace(/^\uFEFF/, '');
    check('el .set se descarga', /\.set$/.test(download.suggestedFilename()), download.suggestedFilename());
    check('en UTF-16 con BOM, como los de MT5', setBytes[0] === 0xFF && setBytes[1] === 0xFE, String(setBytes.slice(0, 4).toString('hex')));
    check('y trae los parámetros del EA', ['InpFastMA', 'InpSlowMA', 'InpATR_SL'].every((n) => new RegExp(`^${n}=`, 'm').test(setText)), setText.slice(0, 200));

    // Cambiar de idioma con el informe en pantalla: se traduce sin volver a analizar.
    await page.click('.sidebar-bottom [data-lang-set="es"], .header-controls [data-lang-set="es"] >> visible=true');
    await page.waitForFunction(() => document.documentElement.lang === 'es');
    check('cambia a español', (await page.textContent('.nav-item[data-tab="verdict"]')).includes('Veredicto'));
    check('y el informe sigue ahí', Boolean(await page.$('.vx')));

    await page.click('.tab-next-btn');
    check('«Siguiente» lleva a las mesetas', await page.$eval('.nav-item[data-tab="plateaus"]', (b) => b.classList.contains('active')));

    // La pestaña «Método» enseña los mismos límites que la página pública.
    await page.click('.nav-item[data-tab="method"]');
    const appLimits = await page.$$eval('.limits li', (l) => l.length);
    const pub = await page.context().newPage();
    await pub.goto(`${BASE}/es/methodology/`);
    const pubLimits = await pub.$$eval('#limites li', (l) => l.length);
    check('«Método» enseña todos los límites de la página pública', appLimits === pubLimits && appLimits >= 8, `${appLimits} frente a ${pubLimits}`);
    await page.context().close();
  }

  section('3c. Dos mesetas: «Exportar» baja siempre la propuesta');
  {
    const page = await appPage('es');
    await page.goto(`${BASE}/app/`);
    await page.setInputFiles('#mainFile', [twoIsXml, twoOosXml]);
    await page.waitForFunction(() => !document.querySelector('#analyzeBtn').disabled, null, { timeout: 60000 });
    await page.click('#analyzeBtn');
    await page.waitForSelector('.vx', { timeout: 180000 });
    const m1 = (await page.textContent('.vx-pass b')).trim();
    const alt = page.locator('.t3-alt').first();
    check('hay una segunda meseta (alternativa)', await alt.count() === 1);
    const m2 = (await alt.locator('.t3-pass').textContent()).replace(/\D+/g, '');
    check('la alternativa es otra pasada', Boolean(m2) && m2 !== m1, `${m1} / ${m2}`);

    const save = async (click) => {
      const [d] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), click()]);
      return d.suggestedFilename();
    };
    // Abrir la alternativa deja M2 seleccionada en la pestaña de mesetas.
    await alt.locator('[data-plateau]').click();
    await page.waitForSelector('.rep-card');
    check('la ficha muestra la meseta 2', (await page.textContent('.rep-card .rep-pass')).includes(m2));
    const fichaSet = await save(() => page.click('.rep-card [data-export="set"]'));
    check('el .set de la ficha es el de la meseta 2', fichaSet.includes(`M2-pass${m2}`), fichaSet);
    await page.click('.rep-card [data-scroll="plateauSurfacePanel"]');
    check('«Ver la meseta completa» no cambia de meseta', (await page.textContent('.rep-card .rep-pass')).includes(m2));

    // El menú «Exportar» ofrece la configuración PROPUESTA: M1, no la que se miró.
    await page.click('#exportBtn');
    const menuSet = await save(() => page.click('.export-menu [data-export="set"]'));
    check('«Exportar → Configuración propuesta» baja M1', menuSet.includes(`M1-pass${m1}`), menuSet);
    await page.click('#exportBtn');
    const menuRefine = await save(() => page.click('.export-menu [data-export="refine"]'));
    check('«Exportar → Rango de refinamiento» es el de M1', menuRefine.includes('M1-'), menuRefine);
    await page.context().close();
  }

  section('3d. Sin forward no hay botones .set que solo darían error');
  {
    const page = await appPage('es');
    await page.goto(`${BASE}/app/`);
    await page.setInputFiles('#mainFile', [isXml]);
    await page.waitForFunction(() => !document.querySelector('#analyzeBtn').disabled, null, { timeout: 60000 });
    await page.click('#analyzeBtn');
    await page.waitForSelector('.vx', { timeout: 120000 });
    const visibleSet = async () => page.$$eval('#view [data-export="set"]', (bs) => bs.filter((b) => b.offsetParent !== null).length);
    check('veredicto: ningún botón «Descargar .set»', await visibleSet() === 0);
    await page.click('.nav-item[data-tab="plateaus"]');
    await page.waitForSelector('.rep-card');
    check('mesetas: ningún botón «Descargar .set»', await visibleSet() === 0);
    check('pero sí el rango de refinamiento', await page.$$eval('.rep-card [data-export="refine"]', (bs) => bs.length) === 1);
    check('y ningún error en pantalla', await page.$eval('#errorBox', (e) => e.hidden));
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
    // El texto de los gráficos (SVG) se escalaba con el ancho: en el móvil salía a 5 px.
    await page.click('.nav-item[data-tab="params"]');
    await page.waitForTimeout(300);
    const minText = await page.evaluate(() => Math.min(...[...document.querySelectorAll('#view svg.chart text')].map((t) => {
      const svg = t.ownerSVGElement;
      return parseFloat(getComputedStyle(t).fontSize) * svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    })));
    check('el texto de los gráficos se lee en el móvil (≥ 10 px)', minText >= 10, `${minText.toFixed(1)} px`);
    // El diagrama de cajas, el mapa de calor y la influencia son HTML: se adaptan al ancho en
    // vez de deslizarse de lado, y su texto tampoco baja de 10 px.
    const htmlCharts = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('#view .bx-chart, #view .hm-grid, #view .sens-chart')];
      const sizes = nodes.flatMap((c) => [...c.querySelectorAll('span, b, li')].filter((e) => e.textContent.trim()).map((e) => parseFloat(getComputedStyle(e).fontSize)));
      const scrolls = nodes.filter((c) => { const w = c.closest('.chart-scroll'); return w && w.scrollWidth > w.clientWidth + 1; }).length;
      return { n: nodes.length, min: Math.min(...sizes), scrolls };
    });
    check('los gráficos de Parámetros caben en el móvil sin deslizar', htmlCharts.n === 3 && htmlCharts.scrolls === 0, JSON.stringify(htmlCharts));
    check('y su texto se lee (≥ 10 px)', htmlCharts.min >= 10, JSON.stringify(htmlCharts));
    await ctx.close();
  }

  section('5b. Tema: el del sistema hasta que el usuario elige');
  for (const [scheme, saved, want] of [['light', null, 'light'], ['dark', null, 'dark'], ['light', 'dark', 'dark'], ['dark', 'light', 'light']]) {
    const ctx = await browser.newContext({ colorScheme: scheme });
    if (saved) await ctx.addInitScript((t) => { try { localStorage.setItem('orometra.theme', t); } catch { /* */ } }, saved);
    const page = await ctx.newPage();
    watch(page);
    for (const path of ['/', '/app/']) {
      await page.goto(`${BASE}${path}`);
      const got = await page.evaluate(() => document.documentElement.dataset.theme);
      check(`${path}: sistema ${scheme}${saved ? `, eligió ${saved}` : ''} → ${want}`, got === want, got);
    }
    await ctx.close();
  }

  section('5c. Historial local');
  {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => { try { localStorage.setItem('orometra.lang', 'en'); } catch { /* */ } });
    const page = await ctx.newPage();
    watch(page);
    const stored = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('orometra.history')); } catch { return null; } });
    // El ejemplo no se guarda.
    await page.goto(`${BASE}/app/?demo=1`);
    await page.waitForSelector('.vx', { timeout: 120000 });
    check('el ejemplo no se guarda en el historial', !(await stored()));
    // Primer análisis propio: se guarda y se avisa una vez.
    await page.goto(`${BASE}/app/`);
    await page.setInputFiles('#mainFile', [isXml, oosXml]);
    await page.waitForSelector('#analyzeBtn:not([disabled])');
    await page.click('#analyzeBtn');
    await page.waitForSelector('.vx', { timeout: 120000 });
    const s1 = await stored();
    check('un análisis propio se guarda (un resumen, sin las tablas)', s1 && s1.entries.length === 1 && JSON.stringify(s1).length < 4000, s1 ? `${JSON.stringify(s1).length} bytes` : 'nada');
    check('la primera vez se avisa', Boolean(await page.$('.hist-notice')));
    await page.click('[data-hist="ack"]');
    check('«Entendido» quita el aviso', !(await page.$('.hist-notice')));
    // Segundo análisis del mismo EA con otros mínimos: compara y avisa de que no son comparables.
    await page.click('#intakeExpandBtn').catch(() => {});
    await page.fill('#gPf', '1.10');
    await page.dispatchEvent('#gPf', 'input');
    await page.click('#analyzeBtn');
    await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('orometra.history')).entries.length === 2; } catch { return false; } }, null, { timeout: 120000 });
    await page.waitForSelector('.hist-panel', { timeout: 30000 });
    check('el segundo análisis del mismo EA se compara con el anterior', Boolean(await page.$('.hist-panel')));
    check('y dice que con otros mínimos el nivel no es comparable', Boolean(await page.$('.hist-panel .hist-caveat')));
    check('la meseta cae en el mismo sitio (mismos datos)', /all 6 parameters/.test(await page.$eval('.hist-lead', (e) => e.textContent)));
    // Pestaña Historial: se ve, se borra uno y se apaga.
    await page.click('.nav-item[data-tab="history"]');
    check('la pestaña Historial lista los análisis', (await page.$$('.hist-table tbody tr')).length === 2);
    await page.click('[data-hist="delete"]');
    check('se puede borrar uno', (await stored()).entries.length === 1);
    await page.uncheck('[data-hist="toggle"]');
    check('el interruptor lo desactiva', (await stored()).off === true);
    await page.click('.nav-item[data-tab="verdict"]');
    await page.click('#analyzeBtn');
    await page.waitForSelector('.vx', { timeout: 120000 });
    await page.waitForTimeout(300);
    check('desactivado, no guarda nada más', (await stored()).entries.length === 1);
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
