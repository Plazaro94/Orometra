/**
 * Instrumentación de EAs MQL5: copia + sonda Orometra (nunca toca el original).
 *
 * API pura (testeable sin MT5):
 *   transformSource(mq5Source) → { source, warnings }
 *
 * API con FS:
 *   instrumentEa({ eaPath, dataPath, probeMqhPath, experimentId? })
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const DEFAULT_PROBE = path.join(REPO_ROOT, 'mql5', 'OrometraProbe.mqh');

const INCLUDE_LINE = '#include <OrometraProbe.mqh>';

const HANDLERS = [
  {
    name: 'OnInit',
    // int OnInit() / int OnInit(void)
    sig: /(?:^|\n)(\s*)(int\s+OnInit\s*\([^)]*\)\s*\{)/m,
    call: 'OrometraOnInit();',
    placement: 'afterOpen', // justo después de {
    create: `int OnInit()\n{\n   OrometraOnInit();\n   return(INIT_SUCCEEDED);\n}\n`,
  },
  {
    name: 'OnTick',
    sig: /(?:^|\n)(\s*)(void\s+OnTick\s*\([^)]*\)\s*\{)/m,
    call: 'OrometraOnTick();',
    placement: 'afterOpen',
    create: `void OnTick()\n{\n   OrometraOnTick();\n}\n`,
  },
  {
    name: 'OnTester',
    sig: /(?:^|\n)(\s*)(double\s+OnTester\s*\([^)]*\)\s*\{)/m,
    call: null, // caso especial
    placement: 'onTester',
    create: `double OnTester()\n{\n   double _orometra_crit = TesterStatistics(STAT_PROFIT);\n   return OrometraOnTester(_orometra_crit);\n}\n`,
  },
  {
    name: 'OnTesterInit',
    sig: /(?:^|\n)(\s*)(void\s+OnTesterInit\s*\([^)]*\)\s*\{)/m,
    call: 'OrometraOnTesterInit();',
    placement: 'afterOpen',
    create: `void OnTesterInit()\n{\n   OrometraOnTesterInit();\n}\n`,
  },
  {
    name: 'OnTesterPass',
    sig: /(?:^|\n)(\s*)(void\s+OnTesterPass\s*\([^)]*\)\s*\{)/m,
    call: 'OrometraOnTesterPass();',
    placement: 'afterOpen',
    create: `void OnTesterPass()\n{\n   OrometraOnTesterPass();\n}\n`,
  },
  {
    name: 'OnTesterDeinit',
    sig: /(?:^|\n)(\s*)(void\s+OnTesterDeinit\s*\([^)]*\)\s*\{)/m,
    call: 'OrometraOnTesterDeinit();',
    placement: 'afterOpen',
    create: `void OnTesterDeinit()\n{\n   OrometraOnTesterDeinit();\n}\n`,
  },
];

/**
 * Transformación pura de fuente .mq5 → instrumentado.
 * @param {string} source
 * @returns {{ source: string, warnings: string[], created: string[], patched: string[] }}
 */
export function transformSource(source) {
  if (typeof source !== 'string') throw new TypeError('source must be string');
  const warnings = [];
  const created = [];
  const patched = [];
  let out = source.replace(/\r\n/g, '\n');

  // 1) include
  if (!/#include\s*<OrometraProbe\.mqh>/.test(out)) {
    out = insertInclude(out);
  }

  // 2) handlers
  for (const h of HANDLERS) {
    if (h.sig.test(out)) {
      if (h.placement === 'onTester') {
        const r = patchOnTester(out);
        out = r.source;
        if (r.patched) patched.push('OnTester');
        warnings.push(...r.warnings);
      } else if (out.includes(h.call)) {
        // already present
      } else {
        out = insertAfterBrace(out, h.sig, h.call);
        patched.push(h.name);
      }
    } else {
      out = out.replace(/\s*$/, '\n\n' + h.create);
      created.push(h.name);
    }
  }

  return { source: out, warnings, created, patched };
}

/** Alias puro: instrumenta fuente .mq5 en memoria (sin FS). */
export function instrumentMq5Source(src) {
  return transformSource(src);
}

function insertInclude(src) {
  // tras property / includes / comentarios de cabecera
  const m = src.match(/^(?:\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*|#property[^\n]*\n|#include[^\n]*\n)*)/m);
  if (m) {
    const head = m[0];
    const rest = src.slice(head.length);
    if (/#include\s*</.test(head) || /#property/.test(head) || head.length > 0) {
      return head.replace(/\s*$/, '\n' + INCLUDE_LINE + '\n') + rest;
    }
  }
  return INCLUDE_LINE + '\n\n' + src;
}

function insertAfterBrace(src, sig, call) {
  return src.replace(sig, (full, indent, header) => {
    const ind = indent || '';
    const bodyIndent = ind + '   ';
    return `${indent}${header}\n${bodyIndent}${call}`;
  });
}

/**
 * Si OnTester ya existe: envolver el return final o añadir return OrometraOnTester al final.
 * No cambia la lógica de trading; solo asegura que el criterio pase por la sonda.
 */
function patchOnTester(src) {
  const warnings = [];
  if (/OrometraOnTester\s*\(/.test(src)) {
    return { source: src, patched: false, warnings };
  }

  const re = /((?:^|\n))(\s*)(double\s+OnTester\s*\([^)]*\)\s*\{)/m;
  const m = src.match(re);
  if (!m) return { source: src, patched: false, warnings: ['OnTester no encontrado'] };

  const start = m.index + m[1].length;
  const braceOpen = src.indexOf('{', start);
  if (braceOpen < 0) return { source: src, patched: false, warnings: ['OnTester sin {'] };

  const end = findMatchingBrace(src, braceOpen);
  if (end < 0) {
    warnings.push('No se pudo cerrar OnTester; se deja sin parchear');
    return { source: src, patched: false, warnings };
  }

  let body = src.slice(braceOpen + 1, end);
  // Si hay return X; sustituir el último return por envoltorio
  const retRe = /\breturn\s+([^;]+);/g;
  let last = null;
  let mm;
  while ((mm = retRe.exec(body)) !== null) last = mm;
  if (last) {
    const before = body.slice(0, last.index);
    const after = body.slice(last.index + last[0].length);
    const expr = last[1].trim();
    body = `${before}return OrometraOnTester(${expr});${after}`;
  } else {
    body = body.replace(/\s*$/, '\n   double _orometra_crit = TesterStatistics(STAT_PROFIT);\n   return OrometraOnTester(_orometra_crit);\n');
    warnings.push('OnTester sin return: se usa STAT_PROFIT como criterio');
  }

  const out = src.slice(0, braceOpen + 1) + body + src.slice(end);
  return { source: out, patched: true, warnings };
}

function findMatchingBrace(s, openIdx) {
  let depth = 0;
  let inStr = false;
  let strCh = '';
  let inLine = false;
  let inBlock = false;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    const n = s[i + 1];
    if (inLine) {
      if (c === '\n') inLine = false;
      continue;
    }
    if (inBlock) {
      if (c === '*' && n === '/') { inBlock = false; i++; }
      continue;
    }
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === strCh) inStr = false;
      continue;
    }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === '"' || c === "'") { inStr = true; strCh = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Nombre de copia: Foo.mq5 → Foo_orometra.mq5
 */
export function instrumentedFileName(eaPath) {
  const base = path.basename(eaPath, path.extname(eaPath));
  return `${base}_orometra.mq5`;
}

/**
 * Instrumenta un EA: copia, transforma, escribe; copia .mqh al Include del data path.
 * @param {{ eaPath: string, dataPath: string, probeMqhPath?: string, outDir?: string }} opts
 * dataPath = carpeta de datos del terminal (…/Terminal/<id>/) o directamente MQL5.
 */
export function instrumentEa(opts) {
  const eaPath = opts.eaPath;
  if (!eaPath || !fs.existsSync(eaPath)) {
    throw new Error(`EA no encontrado: ${eaPath}`);
  }
  if (path.extname(eaPath).toLowerCase() !== '.mq5') {
    throw new Error('Solo se instrumentan fuentes .mq5 (modo caja negra .ex5 → Lite, sin sonda)');
  }

  const probePath = opts.probeMqhPath || DEFAULT_PROBE;
  if (!fs.existsSync(probePath)) {
    throw new Error(`OrometraProbe.mqh no encontrado: ${probePath}`);
  }

  const original = fs.readFileSync(eaPath, 'utf8');
  const { source, warnings, created, patched } = transformSource(original);

  const outDir = opts.outDir || path.dirname(eaPath);
  const outName = instrumentedFileName(eaPath);
  const outPath = path.join(outDir, outName);
  if (path.resolve(outPath) === path.resolve(eaPath)) {
    throw new Error('La ruta de salida coincidiría con el original; abortado');
  }
  fs.writeFileSync(outPath, source, 'utf8');

  const includeDir = resolveIncludeDir(opts.dataPath);
  fs.mkdirSync(includeDir, { recursive: true });
  const destMqh = path.join(includeDir, 'OrometraProbe.mqh');
  fs.copyFileSync(probePath, destMqh);

  return {
    originalPath: eaPath,
    instrumentedPath: outPath,
    probeInstalled: destMqh,
    warnings,
    created,
    patched,
  };
}

function resolveIncludeDir(dataPath) {
  if (!dataPath) throw new Error('dataPath (carpeta de datos MT5) es obligatorio');
  // aceptar …/MQL5, …/Include o carpeta de datos del terminal (…/Terminal/<id>)
  const norm = path.resolve(dataPath);
  const base = path.basename(norm).toLowerCase();
  if (base === 'include') return norm;
  if (base === 'mql5') return path.join(norm, 'Include');
  return path.join(norm, 'MQL5', 'Include');
}

export { INCLUDE_LINE, HANDLERS, DEFAULT_PROBE };
