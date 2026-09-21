// Comprobaciones sobre el propio codigo fuente.
//
//   node tests/source.test.js
//
// Existe por una razon concreta: al restituir las tildes del texto visible, tres de
// ellas cayeron dentro de identificadores (`indices:` paso a ser `índices:`) y rompieron
// la aplicacion de forma silenciosa, porque la propiedad se definia con un nombre y se
// leia con otro. Esa clase de error no la detecta ningun test funcional hasta que algo
// revienta lejos del origen.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
let checks = 0;

function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}

const sources = [
  ...fs.readdirSync(path.join(ROOT, 'js')).map((f) => 'js/' + f),
  'index.html', 'app/index.html', 'styles.css', 'tools/audit.js',
];

const ACC = 'áéíóúÁÉÍÓÚñÑ';
const ACCENTED = new RegExp(`[${ACC}]`);

/**
 * Sustituye por espacios todo lo que NO es codigo: comentarios, cadenas, literales de
 * expresion regular y la parte literal de las plantillas. Lo que hay dentro de `${...}`
 * si es codigo y se sigue analizando.
 *
 * Es una maquina de estados y no un monton de expresiones regulares porque las plantillas
 * anidan cadenas dentro de `${...}`, y sin recursion se colaban falsos positivos.
 */
function stripNonCode(src) {
  const out = src.split('');
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  // Tras uno de estos caracteres, una barra abre una expresion regular y no una division.
  const REGEX_ALLOWED_BEFORE = '(,=:[!&|?{};+-*%~^\n';

  let i = 0;
  let lastSignificant = '\n';
  const templateDepth = []; // profundidad de llaves por cada `${` abierto

  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];

    if (c === '/' && d === '/') {
      let j = src.indexOf('\n', i);
      if (j < 0) j = src.length;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === '/' && d === '*') {
      let j = src.indexOf('*/', i + 2);
      j = j < 0 ? src.length : j + 2;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === '/' && REGEX_ALLOWED_BEFORE.includes(lastSignificant)) {
      let j = i + 1;
      let inClass = false;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) break;
        else if (src[j] === '\n') break;
        j++;
      }
      blank(i + 1, j);
      i = j + 1;
      lastSignificant = '/';
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') j++;
        j++;
      }
      blank(i + 1, j);
      i = j + 1;
      lastSignificant = c;
      continue;
    }
    if (c === '`') {
      // Entra en plantilla: se vacia el texto literal hasta el proximo `${` o el cierre.
      let j = i + 1;
      let literalStart = j;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '`') break;
        if (src[j] === '$' && src[j + 1] === '{') {
          blank(literalStart, j);
          templateDepth.push(0);
          i = j + 2;
          lastSignificant = '{';
          break;
        }
        j++;
      }
      if (templateDepth.length && i === j + 2) continue;
      blank(literalStart, j);
      i = j + 1;
      lastSignificant = '`';
      continue;
    }
    if (templateDepth.length) {
      // Dentro de `${...}`: hay que saber cuando se cierra para volver al texto literal.
      if (c === '{') templateDepth[templateDepth.length - 1]++;
      else if (c === '}') {
        if (templateDepth[templateDepth.length - 1] === 0) {
          templateDepth.pop();
          // Vuelve el texto de la plantilla: se vacia hasta el proximo ${ o el cierre.
          let j = i + 1;
          let literalStart = j;
          while (j < src.length) {
            if (src[j] === '\\') { j += 2; continue; }
            if (src[j] === '`') break;
            if (src[j] === '$' && src[j + 1] === '{') {
              blank(literalStart, j);
              templateDepth.push(0);
              i = j + 2;
              lastSignificant = '{';
              break;
            }
            j++;
          }
          if (templateDepth.length && i === j + 2) continue;
          blank(literalStart, j);
          i = j + 1;
          lastSignificant = '`';
          continue;
        }
        templateDepth[templateDepth.length - 1]--;
      }
    }
    if (!/\s/.test(c)) lastSignificant = c;
    else if (c === '\n') lastSignificant = '\n';
    i++;
  }
  return out.join('');
}

console.log('\n1. Ninguna tilde dentro del codigo (identificadores, propiedades, clases)');
const offenders = [];
for (const rel of sources) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const raw = fs.readFileSync(file, 'utf8');
  if (rel.endsWith('.js')) {
    const code = stripNonCode(raw);
    code.split('\n').forEach((line, n) => {
      if (ACCENTED.test(line)) offenders.push(`${rel}:${n + 1} ${line.trim().slice(0, 60)}`);
    });
  } else if (rel.endsWith('.html')) {
    // En el HTML solo importan los atributos que el codigo consulta.
    for (const m of raw.matchAll(/(class|id|data-[a-z-]+)="([^"]*)"/g)) {
      if (ACCENTED.test(m[2])) offenders.push(`${rel}: ${m[0]}`);
    }
    // Y los NOMBRES de los atributos, que es donde `multiple` acabo siendo `multiple`
    // con tilde: el navegador ignora en silencio un atributo que no conoce, asi que el
    // fallo no se ve hasta que alguien intenta elegir dos archivos a la vez.
    for (const tag of raw.matchAll(/<[a-zA-Z][^>]*>/g)) {
      const sinValores = tag[0].replace(/"[^"]*"|'[^']*'/g, '""');
      if (ACCENTED.test(sinValores)) offenders.push(`${rel}: atributo con tilde en ${sinValores.slice(0, 70)}`);
    }
  } else if (rel.endsWith('.css')) {
    for (const m of raw.matchAll(/\.[A-Za-z0-9_-]*[áéíóúÁÉÍÓÚñÑ][A-Za-z0-9_-]*/g)) {
      offenders.push(`${rel}: ${m[0]}`);
    }
  }
}
check('sin tildes en el codigo', offenders.length === 0, offenders.slice(0, 6).join(' | '));

console.log('\n2. Las clases CSS que usa la interfaz estan definidas');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const used = new Set();
for (const rel of ['index.html', 'app/index.html', 'js/ui.js', 'js/charts.js', 'js/landing.js']) {
  const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const m of s.matchAll(/class="([^"$]*)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c) used.add(c);
  }
}
const undefinedClasses = [...used].filter((c) => !css.includes('.' + c));
check('todas las clases tienen estilo', undefinedClasses.length === 0, undefinedClasses.join(', '));

console.log('\n3. Los ids que busca la interfaz existen en el HTML o los crea ella misma');
const html = fs.readFileSync(path.join(ROOT, 'app/index.html'), 'utf8');
const ui = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');
const wanted = new Set([...ui.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]));
const createdInUi = new Set([...ui.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]));
createdInUi.add('exportMenu');
const missingIds = [...wanted].filter((id) => !html.includes(`id="${id}"`) && !createdInUi.has(id));
check('sin ids huerfanos', missingIds.length === 0, missingIds.join(', '));

console.log('\n4. Nada de restos de depuracion');
const debugLeftovers = [];
for (const rel of sources.filter((f) => f.endsWith('.js'))) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const s = fs.readFileSync(file, 'utf8');
  if (rel === 'tools/audit.js') continue; // su salida ES por consola
  if (/\bdebugger\b/.test(s)) debugLeftovers.push(rel + ': debugger');
  if (/console\.(log|warn|error)\(/.test(s) && rel !== 'js/worker.js') debugLeftovers.push(rel + ': console');
}
check('sin debugger ni console sueltos', debugLeftovers.length === 0, debugLeftovers.join(', '));

console.log(`\n${failures ? `RESULTADO: ${checks - failures}/${checks} — ${failures} FALLO(S)` : `RESULTADO: ${checks}/${checks} correctas`}`);
process.exit(failures ? 1 : 0);
