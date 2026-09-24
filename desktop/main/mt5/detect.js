// Detección de instalaciones MetaTrader 5 y EAs.
//
// Asocia data path (%APPDATA%\MetaQuotes\Terminal\<id>) con install path
// leyendo origin.txt (ruta del terminal que creó esa carpeta de datos).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const TERMINAL_EXE = 'terminal64.exe';
const METAEDITOR_EXE = 'metaeditor64.exe';

/** Lee la primera línea no vacía de origin.txt → ruta de instalación. */
export function parseOriginTxt(content) {
  const lines = String(content || '').split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (t) return t;
  }
  return null;
}

/** Rutas candidatas típicas de terminal64.exe en Windows. */
export function defaultSearchRoots(env = process.env) {
  const roots = [];
  const pf = env['ProgramFiles'] || 'C:\\Program Files';
  const pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = env['LOCALAPPDATA'] || path.join(os.homedir(), 'AppData', 'Local');
  for (const base of [pf, pf86, local]) {
    roots.push(
      path.join(base, 'MetaTrader 5'),
      path.join(base, 'MetaTrader 5 IC Markets'),
      path.join(base, 'MetaTrader 5 Pepperstone'),
      path.join(base, 'Admiral Markets MetaTrader 5'),
      path.join(base, 'FTMO MetaTrader 5'),
    );
  }
  return roots;
}

function metaQuotesTerminalRoot(env = process.env) {
  const appData = env['APPDATA'] || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'MetaQuotes', 'Terminal');
}

/**
 * Escanea Terminal\*\origin.txt y devuelve { dataPath, installPath, id }.
 * Puro respecto a FS: recibe `readdirSync` / `readFileSync` opcionales.
 * Alias: associateDataPaths.
 */
export function associateDataPaths(terminalRoot, io = {}) {
  return scanOriginAssociations(terminalRoot, io);
}

export function scanOriginAssociations(terminalRoot, io = {}) {
  const { readdirSync = fs.readdirSync, readFileSync = fs.readFileSync, existsSync = fs.existsSync } = io;
  if (!existsSync(terminalRoot)) return [];
  const out = [];
  let entries = [];
  try {
    entries = readdirSync(terminalRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name === 'Common' || ent.name === 'Community') continue;
    const dataPath = path.join(terminalRoot, ent.name);
    const originFile = path.join(dataPath, 'origin.txt');
    if (!existsSync(originFile)) continue;
    let installPath = null;
    try {
      installPath = parseOriginTxt(readFileSync(originFile, 'utf8'));
    } catch {
      continue;
    }
    if (!installPath) continue;
    out.push({
      id: ent.name,
      dataPath,
      installPath: path.normalize(installPath),
    });
  }
  return out;
}

function findTerminalExe(dir, existsSync = fs.existsSync) {
  if (!dir) return null;
  const candidate = path.join(dir, TERMINAL_EXE);
  if (existsSync(candidate)) return candidate;
  // origin.txt a veces apunta a la carpeta padre o a un subdir
  const nested = path.join(dir, 'terminal64', TERMINAL_EXE);
  if (existsSync(nested)) return nested;
  return null;
}

function isPortableLayout(terminalPath, dataPath) {
  if (!terminalPath || !dataPath) return false;
  const termDir = path.dirname(terminalPath);
  const norm = (p) => path.normalize(p).toLowerCase();
  return norm(dataPath).startsWith(norm(termDir));
}

/** Lista EAs relativos bajo MQL5/Experts (*.ex5, *.mq5). */
export function listExperts(dataPath, io = {}) {
  const { readdirSync = fs.readdirSync, existsSync = fs.existsSync, statSync = fs.statSync } = io;
  const expertsRoot = path.join(dataPath, 'MQL5', 'Experts');
  if (!existsSync(expertsRoot)) return [];
  const out = [];
  function walk(dir, relBase) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const rel = relBase ? `${relBase}\\${ent.name}` : ent.name;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full, rel);
      } else if (/\.(ex5|mq5)$/i.test(ent.name)) {
        try {
          if (statSync(full).isFile()) out.push(rel.replace(/\//g, '\\'));
        } catch { /* skip */ }
      }
    }
  }
  walk(expertsRoot, '');
  return out.sort((a, b) => a.localeCompare(b));
}

/** metaeditor64.exe junto al terminal. */
export function findMetaEditor(terminalDir, existsSync = fs.existsSync) {
  if (!terminalDir) return null;
  const candidate = path.join(terminalDir, METAEDITOR_EXE);
  return existsSync(candidate) ? candidate : null;
}

/**
 * ¿Hay un proceso terminal64.exe en ejecución?
 * En Windows usa tasklist; fuera de Windows, false (MT5 solo Windows).
 */
export function isTerminalRunning(terminalPath, io = {}) {
  const { platform = process.platform, execFile = execFileSync } = io;
  if (platform !== 'win32') return false;
  try {
    const out = execFile('tasklist', ['/FI', `IMAGENAME eq ${TERMINAL_EXE}`, '/FO', 'CSV', '/NH'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 8000,
    });
    const text = String(out || '');
    if (!/terminal64\.exe/i.test(text)) return false;
    // Si nos pasan ruta, no filtramos por ruta exacta (tasklist no la da fiable);
    // basta con que el proceso exista. El caller avisa al usuario.
    void terminalPath;
    return true;
  } catch {
    return false;
  }
}

function makeId(terminalPath, dataPath) {
  const h = createHash('sha1').update(`${terminalPath}|${dataPath}`).digest('hex').slice(0, 12);
  return h;
}

/**
 * Lista instalaciones detectadas.
 * @returns {Array<{ id, terminalPath, dataPath, portable?, experts: string[] }>}
 */
export function listInstallations(opts = {}) {
  const env = opts.env || process.env;
  const io = {
    existsSync: opts.existsSync || fs.existsSync,
    readdirSync: opts.readdirSync || fs.readdirSync,
    readFileSync: opts.readFileSync || fs.readFileSync,
    statSync: opts.statSync || fs.statSync,
  };
  const extraPaths = opts.extraTerminalPaths || [];
  const seen = new Map(); // key → installation

  function add(terminalPath, dataPath, idHint) {
    if (!terminalPath || !io.existsSync(terminalPath)) return;
    const termDir = path.dirname(terminalPath);
    const dp = dataPath && io.existsSync(dataPath) ? dataPath : null;
    const key = path.normalize(terminalPath).toLowerCase();
    const existing = seen.get(key);
    if (existing) {
      if (dp && !existing.dataPath) existing.dataPath = dp;
      if (dp && existing.experts.length === 0) existing.experts = listExperts(dp, io);
      return;
    }
    const experts = dp ? listExperts(dp, io) : [];
    const portable = isPortableLayout(terminalPath, dp);
    seen.set(key, {
      id: idHint || makeId(terminalPath, dp || termDir),
      terminalPath: path.normalize(terminalPath),
      dataPath: dp,
      portable: portable || false,
      experts,
      metaEditor: findMetaEditor(termDir, io.existsSync),
    });
  }

  // 1) Asociaciones origin.txt
  const mqRoot = opts.terminalRoot || metaQuotesTerminalRoot(env);
  const associations = scanOriginAssociations(mqRoot, io);
  for (const a of associations) {
    const exe = findTerminalExe(a.installPath, io.existsSync);
    if (exe) add(exe, a.dataPath, a.id);
  }

  // 2) Búsqueda en rutas comunes
  for (const root of [...defaultSearchRoots(env), ...extraPaths]) {
    const exe = findTerminalExe(root, io.existsSync)
      || (io.existsSync(path.join(root, TERMINAL_EXE)) ? path.join(root, TERMINAL_EXE) : null);
    if (!exe && io.existsSync(root) && path.basename(root).toLowerCase() === TERMINAL_EXE.toLowerCase()) {
      add(root, null, null);
      continue;
    }
    if (exe) {
      // Intentar emparejar data path por origin ya escaneado
      const match = associations.find((a) => {
        const t = findTerminalExe(a.installPath, io.existsSync);
        return t && path.normalize(t).toLowerCase() === path.normalize(exe).toLowerCase();
      });
      add(exe, match?.dataPath || null, match?.id || null);
    }
  }

  // 3) Rutas extra explícitas (fichero .exe)
  for (const p of extraPaths) {
    if (/\.exe$/i.test(p) && io.existsSync(p)) add(p, null, null);
  }

  return [...seen.values()].sort((a, b) => a.terminalPath.localeCompare(b.terminalPath));
}

export { TERMINAL_EXE, METAEDITOR_EXE, metaQuotesTerminalRoot };
