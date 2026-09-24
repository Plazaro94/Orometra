/**
 * Compilación de .mq5 vía MetaEditor (/compile + /log).
 * Traduce el log a mensajes en lenguaje claro.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const METAEDITOR_NAMES = ['metaeditor64.exe', 'metaeditor.exe'];

/**
 * Busca metaeditor64.exe cerca de terminal64 o en Program Files.
 * @param {{ terminalPath?: string, extraRoots?: string[] }} [opts]
 * @returns {string|null}
 */
export function findMetaEditor(opts = {}) {
  const candidates = [];

  if (opts.terminalPath) {
    const dir = fs.statSync(opts.terminalPath).isDirectory()
      ? opts.terminalPath
      : path.dirname(opts.terminalPath);
    for (const name of METAEDITOR_NAMES) {
      candidates.push(path.join(dir, name));
    }
  }

  const roots = [
    ...(opts.extraRoots || []),
    process.env['ProgramFiles'] || 'C:\\Program Files',
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
  ];

  for (const root of roots) {
    if (!root || !fs.existsSync(root)) continue;
    // MetaTrader 5 / MetaTrader 5 * /
    try {
      for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        if (!/metatrader\s*5/i.test(ent.name) && !/^MT5/i.test(ent.name)) continue;
        const base = path.join(root, ent.name);
        for (const name of METAEDITOR_NAMES) {
          candidates.push(path.join(base, name));
        }
      }
    } catch {
      /* ignore */
    }
  }

  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * Compila un .mq5.
 * @param {{ mq5Path: string, metaEditorPath?: string, terminalPath?: string, timeoutMs?: number }} opts
 * @returns {{ ok: boolean, logPath: string|null, logText: string, errors: { line?: number, code?: string, message: string, plain: string }[], warnings: similar[], plainSummary: string }}
 */
export function compileMq5(opts) {
  const mq5Path = path.resolve(opts.mq5Path);
  if (!fs.existsSync(mq5Path)) {
    return {
      ok: false,
      logPath: null,
      logText: '',
      errors: [{ message: `Archivo no encontrado: ${mq5Path}`, plain: 'No se encuentra el fuente .mq5 a compilar.' }],
      warnings: [],
      plainSummary: 'No se encuentra el archivo a compilar.',
    };
  }

  let editor = opts.metaEditorPath || findMetaEditor({ terminalPath: opts.terminalPath });
  if (!editor) {
    return {
      ok: false,
      logPath: null,
      logText: '',
      errors: [{
        message: 'metaeditor64.exe no encontrado',
        plain: 'No se encontró MetaEditor. Indica la carpeta de instalación de MT5 o la ruta a metaeditor64.exe.',
      }],
      warnings: [],
      plainSummary: 'MetaEditor no está instalado o no se detectó.',
    };
  }

  // MetaEditor escribe <file>.log junto al .mq5
  const logPath = mq5Path.replace(/\.mq5$/i, '.log');
  try { if (fs.existsSync(logPath)) fs.unlinkSync(logPath); } catch { /* ignore */ }

  const args = [`/compile:${mq5Path}`, '/log'];
  const timeout = opts.timeoutMs ?? 120_000;
  const run = spawnSync(editor, args, {
    encoding: 'utf8',
    timeout,
    windowsHide: true,
  });

  let logText = '';
  if (fs.existsSync(logPath)) {
    // MetaEditor a menudo escribe UTF-16 LE
    logText = readMetaEditorLog(logPath);
  } else if (run.stdout) {
    logText = String(run.stdout);
  } else if (run.stderr) {
    logText = String(run.stderr);
  }

  const parsed = parseCompileLog(logText);
  const ok = parsed.errors.length === 0 && run.error == null && (run.status === 0 || parsed.resultOk);

  let plainSummary;
  if (run.error) {
    plainSummary = `No se pudo lanzar MetaEditor: ${run.error.message}`;
  } else if (ok) {
    plainSummary = parsed.warnings.length
      ? `Compilación correcta, con ${parsed.warnings.length} aviso(s).`
      : 'Compilación correcta.';
  } else if (parsed.errors.length) {
    plainSummary = `Compilación fallida: ${parsed.errors.length} error(es). ` +
      parsed.errors.slice(0, 3).map((e) => e.plain).join(' ');
  } else {
    plainSummary = 'Compilación fallida (código de salida distinto de cero y sin detalle en el log).';
  }

  return {
    ok,
    logPath: fs.existsSync(logPath) ? logPath : null,
    logText,
    errors: parsed.errors,
    warnings: parsed.warnings,
    plainSummary,
    metaEditorPath: editor,
    status: run.status,
  };
}

export function readMetaEditorLog(logPath) {
  const buf = fs.readFileSync(logPath);
  // UTF-16 LE BOM
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString('utf16le');
  }
  // UTF-16 without BOM heuristic: many NULs
  if (buf.length >= 4 && buf[1] === 0 && buf[3] === 0) {
    return buf.toString('utf16le');
  }
  return buf.toString('utf8');
}

/**
 * Parsea el log de MetaEditor a errores/avisos en lenguaje claro.
 * @param {string} logText
 */
export function parseCompileLog(logText) {
  const errors = [];
  const warnings = [];
  const text = String(logText || '');
  const lines = text.split(/\r?\n/);

  // típico: file.mq5(12,3) : error 123: message
  // o: file.mqh : information: ...
  const lineRe = /^(.+?)\((\d+)\s*,\s*(\d+)\)\s*:\s*(error|warning|information)\s+(\d+)\s*:\s*(.+)$/i;
  const lineRe2 = /^(.+?)\s*:\s*(error|warning|information)\s+(\d+)\s*:\s*(.+)$/i;

  let resultOk = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/Result:\s*0\s+errors/i.test(line)) resultOk = true;
    if (/0\s+errors?\s*,\s*\d+\s+warnings?/i.test(line)) resultOk = true;

    let m = line.match(lineRe);
    if (m) {
      const entry = {
        file: m[1],
        line: Number(m[2]),
        column: Number(m[3]),
        severity: m[4].toLowerCase(),
        code: m[5],
        message: m[6].trim(),
        plain: plainCompileMessage(m[4], m[5], m[6], m[1], Number(m[2])),
      };
      if (entry.severity === 'error') errors.push(entry);
      else if (entry.severity === 'warning') warnings.push(entry);
      continue;
    }
    m = line.match(lineRe2);
    if (m) {
      const entry = {
        file: m[1],
        severity: m[2].toLowerCase(),
        code: m[3],
        message: m[4].trim(),
        plain: plainCompileMessage(m[2], m[3], m[4], m[1], null),
      };
      if (entry.severity === 'error') errors.push(entry);
      else if (entry.severity === 'warning') warnings.push(entry);
    }
  }

  return { errors, warnings, resultOk };
}

function plainCompileMessage(severity, code, message, file, line) {
  const where = line != null
    ? `En ${path.basename(file)}, línea ${line}`
    : `En ${path.basename(file)}`;
  const msg = String(message).trim();
  const codeN = Number(code);

  // mensajes frecuentes MQL5 → claro
  if (/undeclared identifier/i.test(msg)) {
    return `${where}: se usa un nombre que no existe (${msg}). ¿Falta el #include de la sonda o un input?`;
  }
  if (/unexpected token/i.test(msg) || codeN === 149) {
    return `${where}: sintaxis incorrecta cerca de «${msg}». Revisa llaves y punto y coma.`;
  }
  if (/cannot convert/i.test(msg)) {
    return `${where}: tipos incompatibles (${msg}).`;
  }
  if (/file already exists/i.test(msg)) {
    return `${where}: conflicto de archivo (${msg}).`;
  }
  if (/wrong parameters count/i.test(msg)) {
    return `${where}: número incorrecto de argumentos en una llamada (${msg}).`;
  }
  if (String(severity).toLowerCase() === 'warning') {
    return `${where} (aviso): ${msg}`;
  }
  return `${where}: ${msg} (código ${code}).`;
}

export { METAEDITOR_NAMES };
