#!/usr/bin/env node
// Genera las paginas publicas en espanol (/es/, /es/methodology/, /es/privacy/) a partir
// de las inglesas y de las traducciones de js/i18n.js.
//
// Por que existen: el HTML estatico esta en ingles y el espanol se aplicaba con
// JavaScript al abrir la pagina. Google lee el HTML en ingles, asi que la web no aparecia
// en busquedas en espanol. Con una direccion propia por idioma (y hreflang) Google indexa
// las dos.
//
// Por que se generan: si se editaran a mano, las dos versiones acabarian siendo distintas.
// Cualquier cambio se hace en la pagina inglesa o en js/i18n.js y se vuelve a ejecutar:
//
//   node tools/build-es.js           (escribe es/)
//   node tools/build-es.js --check   (falla si es/ no esta al dia; lo usa `npm test`)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { t, setLocale } from '../js/i18n.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://orometra.com';

// pagina inglesa -> [ruta publica inglesa, ruta publica espanola, clave de meta.*]
const PAGES = [
  ['index.html', '/', '/es/', 'landing'],
  ['methodology/index.html', '/methodology/', '/es/methodology/', 'methodology'],
  ['privacy/index.html', '/privacy/', '/es/privacy/', 'privacy'],
  ['guides/index.html', '/guides/', '/es/guias/', 'guides'],
  ['guides/export-mt5-optimization-xml/index.html', '/guides/export-mt5-optimization-xml/', '/es/guias/exportar-optimizacion-mt5-xml/', 'guide-export'],
  ['guides/mt5-overfitting/index.html', '/guides/mt5-overfitting/', '/es/guias/sobreoptimizacion-mt5/', 'guide-overfit'],
  ['guides/mt5-forward-testing/index.html', '/guides/mt5-forward-testing/', '/es/guias/forward-testing-mt5/', 'guide-forward'],
  ['guides/mt5-strategy-tester-report/index.html', '/guides/mt5-strategy-tester-report/', '/es/guias/informe-probador-estrategias-mt5/', 'guide-report'],
  ['guides/mt5-genetic-vs-complete-optimization/index.html', '/guides/mt5-genetic-vs-complete-optimization/', '/es/guias/optimizacion-genetica-o-completa-mt5/', 'guide-genetic'],
  ['guides/mt5-optimization-criterion/index.html', '/guides/mt5-optimization-criterion/', '/es/guias/criterio-optimizacion-mt5/', 'guide-criterion'],
];
// Fecha de publicacion de cada guia (datos estructurados).
// Guias: fecha de publicacion y prefijo de sus claves i18n.
const PUBLISHED = { 'guide-export': '2026-09-28', 'guide-overfit': '2026-09-28', 'guide-forward': '2026-09-28', 'guide-report': '2026-09-28', 'guide-genetic': '2026-09-28', 'guide-criterion': '2026-09-28' };
const GUIDE_KEYS = { 'guide-export': 'guide.export', 'guide-overfit': 'guide.overfit', 'guide-forward': 'guide.forward', 'guide-report': 'guide.report', 'guide-genetic': 'guide.genetic', 'guide-criterion': 'guide.criterion' };
const LOCALIZED = new Map(PAGES.map(([, en, es]) => [en, es]));

const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => escText(s).replace(/"/g, '&quot;');

function attrOf(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
}
function setAttr(tag, name, value) {
  const re = new RegExp(`(\\s${name}=")[^"]*(")`);
  if (re.test(tag)) return tag.replace(re, (_, a, b) => a + escAttr(value) + b);
  return tag.replace(/\s*(\/?)>$/, ` ${name}="${escAttr(value)}"$1>`);
}

/** Posicion del cierre que corresponde a la etiqueta abierta en `from`. */
function closeIndex(html, tagName, from) {
  const re = new RegExp(`<(/?)${tagName}\\b[^>]*>`, 'gi');
  re.lastIndex = from;
  let depth = 1;
  let m;
  while ((m = re.exec(html))) {
    if (m[0].endsWith('/>')) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return m.index;
  }
  throw new Error(`Sin cierre para <${tagName}> en la posicion ${from}`);
}

/** Aplica las traducciones igual que applyStaticI18n() en el navegador. */
function translate(html) {
  const re = /<([a-zA-Z][\w-]*)\b[^>]*\sdata-i18n(?:-html)?="[^"]+"[^>]*>/g;
  const found = [];
  let m;
  while ((m = re.exec(html))) found.push({ start: m.index, end: m.index + m[0].length, tag: m[0], name: m[1] });
  // De atras hacia delante: asi las posiciones de lo que falta no cambian.
  for (const f of found.reverse()) {
    let tag = f.tag;
    const key = attrOf(tag, 'data-i18n');
    const htmlKey = attrOf(tag, 'data-i18n-html');
    const attr = attrOf(tag, 'data-i18n-attr');
    if (key && attr) {
      tag = setAttr(tag, attr, t(key));
      html = html.slice(0, f.start) + tag + html.slice(f.end);
      continue;
    }
    const inner = key ? escText(t(key)) : t(htmlKey);
    const close = closeIndex(html, f.name, f.end);
    html = html.slice(0, f.end) + inner + html.slice(close);
  }
  return html;
}

/** Enlaces relativos -> absolutos desde la raiz, y las paginas publicas -> su version /es/. */
function rewriteUrls(html, enPath) {
  return html.replace(/(\s(?:href|src)=")([^"]*)(")/g, (all, a, url, b) => {
    if (!url || /^(?:[a-z]+:|\/\/|#)/i.test(url)) return all;
    const abs = new URL(url, ORIGIN + enPath);
    let p = abs.pathname;
    if (LOCALIZED.has(p)) p = LOCALIZED.get(p);
    return a + p + abs.search + abs.hash + b;
  });
}

/**
 * Datos estructurados (JSON-LD) de cada pagina, en su idioma. Van en un
 * <script type="application/ld+json" data-ld="..."> que este script rellena tanto en la
 * pagina inglesa como en la espanola, para que no se desincronicen de los textos.
 */
function jsonLd(page, locale, pagePath) {
  const url = ORIGIN + pagePath;
  const lang = locale === 'es' ? 'es' : 'en';
  const org = { '@type': 'Organization', '@id': `${ORIGIN}/#org`, name: 'Orometra', url: `${ORIGIN}/`, logo: `${ORIGIN}/icon-512.png`, email: 'hello@orometra.com' };
  const strip = (s) => String(s).replace(/<[^>]+>/g, '');
  const home = locale === 'es' ? `${ORIGIN}/es/` : `${ORIGIN}/`;
  if (page === 'landing') {
    return { '@context': 'https://schema.org', '@graph': [
      org,
      { '@type': 'WebSite', '@id': `${home}#website`, url: home, name: 'Orometra', inLanguage: lang, publisher: { '@id': `${ORIGIN}/#org` } },
      { '@type': 'SoftwareApplication', name: 'Orometra', url: `${ORIGIN}/app/`, applicationCategory: 'FinanceApplication', operatingSystem: 'Web browser',
        description: strip(t('meta.description.landing')), inLanguage: lang, publisher: { '@id': `${ORIGIN}/#org` } },
    ] };
  }
  if (page === 'guides') {
    return { '@context': 'https://schema.org', '@type': 'CollectionPage', url, name: strip(t('guides.h1')), description: strip(t('meta.description.guides')), inLanguage: lang, publisher: org };
  }
  if (GUIDE_KEYS[page]) {
    const k = GUIDE_KEYS[page];
    const guidesUrl = locale === 'es' ? `${ORIGIN}/es/guias/` : `${ORIGIN}/guides/`;
    return { '@context': 'https://schema.org', '@graph': [
      { '@type': 'Article', headline: strip(t(`${k}.h1`)), description: strip(t(`meta.description.${page}`)), inLanguage: lang,
        mainEntityOfPage: url, url, datePublished: PUBLISHED[page], dateModified: PUBLISHED[page],
        image: `${ORIGIN}/${locale === 'es' ? 'og-image-es.jpg?v=7' : 'og-image.jpg?v=7'}`, author: org, publisher: org },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Orometra', item: home },
        { '@type': 'ListItem', position: 2, name: strip(t('nav.guides')), item: guidesUrl },
        { '@type': 'ListItem', position: 3, name: strip(t(`${k}.h1`)), item: url },
      ] },
    ] };
  }
  return null;
}
function fillJsonLd(html, page, locale, pagePath) {
  const data = jsonLd(page, locale, pagePath);
  if (!data) return html;
  return html.replace(/<script type="application\/ld\+json" data-ld="[^"]*">[\s\S]*?<\/script>/,
    `<script type="application/ld+json" data-ld="${page}">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`);
}

function setMeta(html, selectorRe, value) {
  return html.replace(selectorRe, (tag) => setAttr(tag, 'content', value));
}

function build(file, enPath, esPath, page) {
  let html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  setLocale('es');
  html = translate(html);
  html = rewriteUrls(html, enPath);
  const title = t(`meta.title.${page}`);
  const desc = t(`meta.description.${page}`);
  const dataPage = attrOf(html.match(/<html\b[^>]*>/)[0], 'data-page');
  html = html.replace(/<html\b[^>]*>/, `<html lang="es"${dataPage ? ` data-page="${dataPage}"` : ''} data-lang-fixed="es" data-alt-href="${enPath}">`);
  html = fillJsonLd(html, page, 'es', esPath);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escText(title)}</title>`);
  html = setMeta(html, /<meta name="description"[^>]*>/, desc);
  html = setMeta(html, /<meta property="og:title"[^>]*>/, title);
  html = setMeta(html, /<meta property="og:description"[^>]*>/, desc);
  html = setMeta(html, /<meta name="twitter:title"[^>]*>/, title);
  html = setMeta(html, /<meta name="twitter:description"[^>]*>/, desc);
  html = setMeta(html, /<meta property="og:locale"[^>]*>/, 'es_ES');
  html = setMeta(html, /<meta property="og:image"[^>]*>/, `${ORIGIN}/og-image-es.jpg?v=7`);
  html = setMeta(html, /<meta name="twitter:image"[^>]*>/, `${ORIGIN}/og-image-es.jpg?v=7`);
  html = html.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${ORIGIN}${esPath}">`);
  html = html.replace(/^<!doctype html>\n/i,
    `<!doctype html>\n<!-- GENERADO por tools/build-es.js a partir de ${file}. No editar a mano: cambia la pagina inglesa o js/i18n.js y vuelve a ejecutarlo. -->\n`);
  return { out: path.join(ROOT, path.relative('/', esPath), 'index.html'), html };
}

/**
 * La pagina inglesa, con los textos de js/i18n.js. Las paginas publicas ya no cargan las
 * traducciones (ver js/i18n-site.js): lo que se ve es el HTML tal cual, asi que tiene que
 * coincidir con i18n.js, que sigue siendo la fuente de los dos idiomas.
 */
function syncEnglish(html, page) {
  html = translate(html);
  const title = t(`meta.title.${page}`);
  const desc = t(`meta.description.${page}`);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escText(title)}</title>`);
  html = setMeta(html, /<meta name="description"[^>]*>/, desc);
  // og:/twitter: no se tocan: los leen los rastreadores de redes, que no ejecutan
  // JavaScript, y en ingles llevan un texto propio mas corto.
  return html;
}

/**
 * js/i18n-site.js: los únicos textos que necesitan las páginas públicas. Ya vienen
 * escritas en su idioma, así que solo hacen falta los que pinta js/landing.js (menú del
 * móvil, índice de las guías, relieve de la portada) y los de la 404, que es una sola
 * página para los dos idiomas. Antes cargaban js/i18n.js entero: 1.270 textos, 39 KB
 * comprimidos, para usar una veintena.
 */
function siteStrings() {
  const landing = fs.readFileSync(path.join(ROOT, 'js/landing.js'), 'utf8');
  const notFound = fs.readFileSync(path.join(ROOT, '404.html'), 'utf8');
  const keys = new Set(['meta.title.notfound', 'meta.description.notfound']);
  for (const m of landing.matchAll(/(?<![\w$.])t\('([a-z][\w-]*(?:\.[\w-]+)+)'/g)) keys.add(m[1]);
  for (const m of notFound.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) keys.add(m[1]);
  const pack = {};
  for (const lang of ['en', 'es']) {
    setLocale(lang);
    pack[lang] = Object.fromEntries([...keys].sort().map((k) => {
      const v = t(k);
      if (v === k) throw new Error(`js/i18n.js no tiene la clave ${k} (${lang})`);
      return [k, v];
    }));
  }
  return `// GENERADO por tools/build-es.js a partir de js/i18n.js. No editar a mano.\n`
    + `// Textos que pinta JavaScript en las páginas públicas (el resto ya va en su HTML).\n`
    + `import { addStrings } from './i18n-core.js';\n\naddStrings(${JSON.stringify(pack, null, 2)});\n`;
}

const check = process.argv.includes('--check');
let stale = 0;
{
  const out = path.join(ROOT, 'js/i18n-site.js');
  const next = siteStrings();
  const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
  if (current !== next) {
    if (check) { stale++; console.log('  FAIL js/i18n-site.js no esta al dia (node tools/build-es.js)'); }
    else { fs.writeFileSync(out, next); console.log('escrito js/i18n-site.js'); }
  } else if (check) console.log('  ok   js/i18n-site.js');
}
// Primero, los datos estructurados de la pagina inglesa (fuente) al dia.
for (const [file, en, , page] of PAGES) {
  const src = path.join(ROOT, file);
  const current = fs.readFileSync(src, 'utf8');
  setLocale('en');
  const next = syncEnglish(fillJsonLd(current, page, 'en', en), page);
  if (next !== current) {
    if (check) { stale++; console.log(`  FAIL ${file}: textos o datos estructurados desactualizados respecto a js/i18n.js (node tools/build-es.js)`); }
    else { fs.writeFileSync(src, next); console.log(`actualizado ${file}`); }
  }
}
for (const [file, en, es, page] of PAGES) {
  const { out, html } = build(file, en, es, page);
  const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
  if (check) {
    if (current !== html) { stale++; console.log(`  FAIL ${path.relative(ROOT, out)} no esta al dia (node tools/build-es.js)`); }
    else console.log(`  ok   ${path.relative(ROOT, out)}`);
  } else if (current !== html) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, html);
    console.log(`escrito ${path.relative(ROOT, out)}`);
  }
}
if (check && stale) process.exit(1);
