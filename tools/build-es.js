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
];
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
  html = html.replace(/<html\b[^>]*>/, `<html lang="es" data-lang-fixed="es" data-alt-href="${enPath}">`);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escText(title)}</title>`);
  html = setMeta(html, /<meta name="description"[^>]*>/, desc);
  html = setMeta(html, /<meta property="og:title"[^>]*>/, title);
  html = setMeta(html, /<meta property="og:description"[^>]*>/, desc);
  html = setMeta(html, /<meta name="twitter:title"[^>]*>/, title);
  html = setMeta(html, /<meta name="twitter:description"[^>]*>/, desc);
  html = setMeta(html, /<meta property="og:locale"[^>]*>/, 'es_ES');
  html = setMeta(html, /<meta property="og:image"[^>]*>/, `${ORIGIN}/og-image-es.jpg`);
  html = setMeta(html, /<meta name="twitter:image"[^>]*>/, `${ORIGIN}/og-image-es.jpg`);
  html = html.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${ORIGIN}${esPath}">`);
  html = html.replace(/^<!doctype html>\n/i,
    `<!doctype html>\n<!-- GENERADO por tools/build-es.js a partir de ${file}. No editar a mano: cambia la pagina inglesa o js/i18n.js y vuelve a ejecutarlo. -->\n`);
  return { out: path.join(ROOT, path.relative('/', esPath), 'index.html'), html };
}

const check = process.argv.includes('--check');
let stale = 0;
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
