// Lanzamiento de terminal64.exe con /config y vigilancia del proceso.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_TIMEOUT_MS = 6 * 60 * 60 * 1000; // 6 h
const HANG_MS = 15 * 60 * 1000; // sin progreso 15 min → hang sospechoso
const POLL_MS = 1500;

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('Cancelado'), { code: 'ABORT' }));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(Object.assign(new Error('Cancelado'), { code: 'ABORT' }));
    };
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

function resolveReportCandidates(reportPath) {
  if (!reportPath) return [];
  const base = reportPath.replace(/\.(htm|html|xml|xls|xlsx)$/i, '');
  const dirs = [path.dirname(reportPath)];
  const names = [
    reportPath,
    `${base}.htm`,
    `${base}.html`,
    `${base}.xml`,
    `${base}.xls`,
    `${base}.xlsx`,
  ];
  // MT5 a veces escribe bajo Tester\
  const baseName = path.basename(base);
  for (const d of dirs) {
    names.push(
      path.join(d, `${baseName}.htm`),
      path.join(d, `${baseName}.html`),
      path.join(d, `${baseName}.xml`),
      path.join(d, 'Tester', `${baseName}.htm`),
      path.join(d, 'Tester', `${baseName}.xml`),
    );
  }
  return [...new Set(names.map((p) => path.normalize(p)))];
}

function findExistingReport(reportPath, existsSync = fs.existsSync, statSync = fs.statSync) {
  let best = null;
  let bestMtime = 0;
  for (const p of resolveReportCandidates(reportPath)) {
    try {
      if (!existsSync(p)) continue;
      const st = statSync(p);
      if (!st.isFile() || st.size < 32) continue;
      if (st.mtimeMs >= bestMtime) {
        bestMtime = st.mtimeMs;
        best = p;
      }
    } catch { /* skip */ }
  }
  return best;
}

/**
 * Ejecuta un intento de lanzamiento (sin reintento).
 */
async function runOnce({
  terminalPath,
  iniPath,
  portable = false,
  reportPath = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  hangMs = HANG_MS,
  onProgress = null,
  signal = null,
  spawnFn = spawn,
  existsSync = fs.existsSync,
  statSync = fs.statSync,
  now = () => Date.now(),
}) {
  if (!terminalPath || !existsSync(terminalPath)) {
    return { ok: false, exitCode: null, reportPath: null, timedOut: false, killed: false, message: 'terminal64.exe no encontrado' };
  }
  if (!iniPath || !existsSync(iniPath)) {
    return { ok: false, exitCode: null, reportPath: null, timedOut: false, killed: false, message: 'Archivo .ini no encontrado' };
  }

  const args = [`/config:${iniPath}`];
  if (portable) args.push('/portable');

  const started = now();
  let lastProgressAt = started;
  let lastReportSize = -1;
  let child = null;
  let exitCode = null;
  let exited = false;
  let timedOut = false;
  let killed = false;
  let abortErr = null;

  try {
    child = spawnFn(terminalPath, args, {
      cwd: path.dirname(terminalPath),
      windowsHide: true,
      stdio: 'ignore',
    });
  } catch (err) {
    return {
      ok: false,
      exitCode: null,
      reportPath: null,
      timedOut: false,
      killed: false,
      message: `No se pudo lanzar MT5: ${err.message || err}`,
    };
  }

  const killChild = () => {
    if (!child || exited) return;
    killed = true;
    try { child.kill(); } catch { /* */ }
    try { child.kill('SIGKILL'); } catch { /* */ }
  };

  if (signal) {
    if (signal.aborted) {
      killChild();
      abortErr = Object.assign(new Error('Cancelado'), { code: 'ABORT' });
    } else {
      signal.addEventListener('abort', () => {
        abortErr = Object.assign(new Error('Cancelado'), { code: 'ABORT' });
        killChild();
      }, { once: true });
    }
  }

  child.on('exit', (code) => {
    exited = true;
    exitCode = code;
  });
  child.on('error', () => {
    exited = true;
    exitCode = exitCode ?? 1;
  });

  while (!exited) {
    if (abortErr) break;
    const elapsed = now() - started;
    if (elapsed > timeoutMs) {
      timedOut = true;
      killChild();
      break;
    }

    let reportFound = null;
    let reportSize = lastReportSize;
    if (reportPath) {
      reportFound = findExistingReport(reportPath, existsSync, statSync);
      if (reportFound) {
        try {
          reportSize = statSync(reportFound).size;
        } catch { reportSize = lastReportSize; }
        if (reportSize !== lastReportSize) {
          lastReportSize = reportSize;
          lastProgressAt = now();
        }
      }
    }

    // Sin informe: el propio proceso vivo cuenta como "progreso" al inicio;
    // si lleva mucho sin salir ni crecer el informe → hang.
    if (now() - lastProgressAt > hangMs && elapsed > hangMs) {
      killChild();
      return {
        ok: false,
        exitCode,
        reportPath: reportFound,
        timedOut: false,
        killed: true,
        hung: true,
        message: 'MT5 no muestra progreso (posible cuelgue). Proceso detenido.',
      };
    }

    if (typeof onProgress === 'function') {
      try {
        onProgress({
          elapsedMs: elapsed,
          reportPath: reportFound,
          reportSize,
          running: !exited,
        });
      } catch { /* ignore UI errors */ }
    }

    try {
      await sleep(POLL_MS, signal);
    } catch (e) {
      if (e.code === 'ABORT') {
        abortErr = e;
        killChild();
        break;
      }
      throw e;
    }
  }

  // Espera breve a que el informe aparezca tras exit
  let finalReport = reportPath ? findExistingReport(reportPath, existsSync, statSync) : null;
  if (!finalReport && reportPath && !abortErr) {
    for (let i = 0; i < 10; i++) {
      await sleep(400);
      finalReport = findExistingReport(reportPath, existsSync, statSync);
      if (finalReport) break;
    }
  }

  if (abortErr) {
    return {
      ok: false,
      exitCode,
      reportPath: finalReport,
      timedOut: false,
      killed: true,
      canceled: true,
      message: 'Trabajo cancelado por el usuario.',
    };
  }
  if (timedOut) {
    return {
      ok: false,
      exitCode,
      reportPath: finalReport,
      timedOut: true,
      killed: true,
      message: `Timeout (${Math.round(timeoutMs / 60000)} min). MT5 detenido.`,
    };
  }

  // Early exit sin informe
  if (!finalReport && reportPath) {
    return {
      ok: false,
      exitCode,
      reportPath: null,
      timedOut: false,
      killed,
      earlyExit: true,
      message: exitCode === 0
        ? 'MT5 terminó pero no apareció el informe. Revisa el .ini (Report) y permisos.'
        : `MT5 salió pronto (código ${exitCode}) sin generar informe.`,
    };
  }

  return {
    ok: true,
    exitCode: exitCode ?? 0,
    reportPath: finalReport,
    timedOut: false,
    killed: false,
    message: 'Optimización/backtest terminado.',
  };
}

/**
 * Lanza el job con un reintento automático si falla (no si cancelan).
 *
 * @returns {Promise<{ ok, exitCode, reportPath, timedOut, killed, message, attempts? }>}
 */
export async function launchJob(opts) {
  const first = await runOnce(opts);
  if (first.ok || first.canceled || opts.signal?.aborted) {
    return { ...first, attempts: 1 };
  }
  // Reintento una vez (fallo / hang / early exit / timeout opcional)
  if (typeof opts.onProgress === 'function') {
    try { opts.onProgress({ retry: true, previous: first }); } catch { /* */ }
  }
  const second = await runOnce(opts);
  return {
    ...second,
    attempts: 2,
    previousMessage: first.message,
    message: second.ok
      ? second.message
      : `${second.message} (reintento tras: ${first.message})`,
  };
}

export { resolveReportCandidates, findExistingReport, DEFAULT_TIMEOUT_MS };
