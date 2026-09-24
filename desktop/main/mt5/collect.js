// Recogida de informes de optimización / backtest generados por MT5.

import fs from 'node:fs';
import path from 'node:path';
import { parseTable } from '../../../core/parse.js';
import { looksLikeReport, parseBacktestReport } from '../../../core/report.js';

function decodeMaybe(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer);
  }
  return new TextDecoder('utf-8').decode(buffer);
}

function siblingCandidates(reportBasePath) {
  const base = String(reportBasePath || '').replace(/\.(htm|html|xml|xls|xlsx)$/i, '');
  const dir = path.dirname(base);
  const name = path.basename(base);
  const exts = ['.xml', '.xls', '.xlsx', '.htm', '.html'];
  const out = [];
  for (const ext of exts) {
    out.push(path.join(dir, name + ext));
    out.push(path.join(dir, 'Tester', name + ext));
  }
  // Si la ruta ya tenía extensión, incluirla
  if (reportBasePath && path.extname(reportBasePath)) {
    out.unshift(reportBasePath);
  }
  return [...new Set(out.map((p) => path.normalize(p)))];
}

function looksLikeOptTable(table) {
  if (!table?.headers?.length || !table?.rows?.length) return false;
  const h = table.headers.map((x) => String(x).toLowerCase());
  const hasPass = h.some((x) => /pass|pasada|№|no\.?/i.test(x));
  const hasResult = h.some((x) => /result|resultado|profit|beneficio/i.test(x));
  return hasPass || hasResult || table.rows.length >= 3;
}

/**
 * Busca informes junto a reportBasePath (MT5 escribe .htm/.html y a veces xml/xls).
 * @returns {{ isTable?, oosTable?, backtest?, paths: object }}
 */
export function collectOptimizationReports(reportBasePath, io = {}) {
  const {
    existsSync = fs.existsSync,
    readFileSync = fs.readFileSync,
  } = io;

  const paths = {
    xml: [],
    html: [],
    other: [],
  };
  const found = [];

  for (const p of siblingCandidates(reportBasePath)) {
    if (!existsSync(p)) continue;
    found.push(p);
    const ext = path.extname(p).toLowerCase();
    if (ext === '.htm' || ext === '.html') paths.html.push(p);
    else if (ext === '.xml' || ext === '.xls' || ext === '.xlsx') paths.xml.push(p);
    else paths.other.push(p);
  }

  let isTable = null;
  let oosTable = null;
  let backtest = null;
  const errors = [];

  // Tablas de optimización (XML spreadsheet / delimited)
  for (const p of paths.xml) {
    try {
      const buf = readFileSync(p);
      const table = parseTable(buf, path.basename(p));
      if (!looksLikeOptTable(table)) continue;
      const lower = path.basename(p).toLowerCase();
      if (/forward|oos|fw\b/.test(lower) && !isTable) {
        oosTable = table;
      } else if (!isTable) {
        isTable = table;
      } else if (!oosTable) {
        oosTable = table;
      }
    } catch (err) {
      errors.push({ path: p, error: String(err.message || err) });
    }
  }

  // HTML: backtest individual o a veces wrapper
  for (const p of paths.html) {
    try {
      const text = decodeMaybe(readFileSync(p));
      if (looksLikeReport(text)) {
        backtest = parseBacktestReport(text, path.basename(p));
        break;
      }
    } catch (err) {
      errors.push({ path: p, error: String(err.message || err) });
    }
  }

  // Forward sibling naming: base-forward.xml etc.
  if (isTable && !oosTable) {
    for (const p of found) {
      const lower = path.basename(p).toLowerCase();
      if (!/forward|oos/.test(lower)) continue;
      if (paths.html.includes(p)) continue;
      try {
        oosTable = parseTable(readFileSync(p), path.basename(p));
        break;
      } catch { /* */ }
    }
  }

  return {
    isTable,
    oosTable,
    backtest,
    paths: {
      all: found,
      xml: paths.xml,
      html: paths.html,
      reportBase: reportBasePath,
    },
    errors,
    ok: Boolean(isTable || backtest),
  };
}
