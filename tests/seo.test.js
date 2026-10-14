// Lo que leen los buscadores y las redes: cada página indexable está en el sitemap (y al
// revés), su dirección principal es la suya, og:url coincide, las versiones de cada idioma
// se enlazan entre sí, y la fecha del sitemap no es anterior a la que dice la propia guía.
//
//   node tests/seo.test.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://orometra.com';
const SKIP = new Set(['node_modules', '.git', 'bench', 'tests', 'tools', 'docs', 'fonts', 'img', 'js', 'core']);

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}

function htmlFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP.has(e.name)) out.push(...htmlFiles(path.join(dir, e.name))); }
    else if (e.name.endsWith('.html')) out.push(path.join(dir, e.name));
  }
  return out;
}

const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const lastmod = Object.fromEntries([...sitemap.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)].map((m) => [m[1], m[2]]));
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const pick = (h, re) => { const m = h.match(re); return m ? m[1] : null; };

const indexable = {};
for (const file of htmlFiles(ROOT)) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const h = fs.readFileSync(file, 'utf8');
  if (/<meta name="robots" content="[^"]*noindex/.test(h)) continue;
  const url = `${ORIGIN}/${rel.replace(/index\.html$/, '')}`;
  indexable[url] = h;
}

console.log('\nSitemap');
check('todas las páginas indexables están en el sitemap', Object.keys(indexable).every((u) => locs.includes(u)),
  Object.keys(indexable).filter((u) => !locs.includes(u)).join(' '));
check('el sitemap no apunta a páginas que no existen o no se indexan', locs.every((u) => u in indexable),
  locs.filter((u) => !(u in indexable)).join(' '));
check('cada dirección del sitemap lleva fecha', locs.every((u) => /^\d{4}-\d{2}-\d{2}$/.test(lastmod[u] || '')));

console.log('\nCada página');
for (const [url, h] of Object.entries(indexable)) {
  const short = url.replace(ORIGIN, '');
  const canon = pick(h, /<link rel="canonical" href="([^"]+)"/);
  const ogUrl = pick(h, /<meta property="og:url" content="([^"]+)"/);
  check(`${short}: canonical y og:url son su propia dirección`, canon === url && ogUrl === url, `${canon} · ${ogUrl}`);
  check(`${short}: og:type`, /<meta property="og:type" content="[^"]+"/.test(h));
  const alts = [...h.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)];
  const back = alts.filter(([, lang]) => lang !== 'x-default').every(([, , href]) => {
    const other = indexable[href];
    return other && new RegExp(`hreflang="[a-z]{2}" href="${url.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"`).test(other);
  });
  check(`${short}: las versiones de cada idioma se enlazan entre sí`, alts.length >= 3 && back);
  const modified = pick(h, /"dateModified":\s*"([^"]+)"/);
  if (modified) check(`${short}: la fecha del sitemap no es anterior a la de la guía`, (lastmod[url] || '') >= modified, `${lastmod[url]} < ${modified}`);
}

console.log(`\n${'='.repeat(70)}\nRESULTADO: ${checks - failures}/${checks} comprobaciones correctas\n${'='.repeat(70)}`);
if (failures) process.exit(1);
