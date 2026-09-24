// IPC del runner MT5 (Fase 2).

import { ipcMain, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { listInstallations, listExperts, isTerminalRunning, findMetaEditor } from './mt5/detect.js';
import { buildTesterIni, estimateCombinations } from './mt5/ini.js';
import { estimateJobCost } from './mt5/cost.js';
import { collectOptimizationReports } from './mt5/collect.js';
import { JobQueue } from './mt5/queue.js';
import {
  explainPortableCopy,
  suggestPortablePath,
  copyPortableHint,
  shallowCheckMt5Dir,
} from './mt5/portable.js';
import { runAnalysis } from '../../core/analysis.js';
import { DEFAULT_POLICY } from '../../core/metrics.js';
import { setLocale } from '../../js/i18n.js';

function compactSummary(analysis) {
  if (!analysis) return {};
  return {
    verdictLevel: analysis.verdict?.level ?? null,
    nPlateaus: analysis.plateaus?.length ?? 0,
    total: analysis.meta?.total ?? null,
    sampling: analysis.meta?.sampling ?? null,
    coverage: analysis.meta?.coverage ?? null,
    fragility: analysis.stats?.fragility ?? null,
    selectionMode: analysis.meta?.selectionMode ?? null,
    fingerprint: analysis.meta?.fingerprint ?? null,
  };
}

function workDir(userData) {
  const dir = path.join(userData, 'mt5-runner');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function registerMt5Ipc(ctx) {
  const { ledger, dialog, getMainWindow } = ctx;
  const queue = new JobQueue();
  const userData = app.getPath('userData');

  function sendProgress(payload) {
    const win = getMainWindow?.();
    if (win && !win.isDestroyed()) {
      win.webContents.send('mt5:jobProgress', payload);
    }
  }

  ipcMain.handle('mt5:listInstallations', async () => listInstallations());

  ipcMain.handle('mt5:listExperts', async (_e, { dataPath } = {}) => {
    if (!dataPath) return [];
    return listExperts(dataPath);
  });

  ipcMain.handle('mt5:isTerminalRunning', async (_e, { terminalPath } = {}) => ({
    running: isTerminalRunning(terminalPath),
  }));

  ipcMain.handle('mt5:findMetaEditor', async (_e, { terminalDir } = {}) => ({
    path: findMetaEditor(terminalDir),
  }));

  ipcMain.handle('mt5:pickTerminal', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Elegir terminal64.exe',
      properties: ['openFile'],
      filters: [{ name: 'MT5 Terminal', extensions: ['exe'] }],
    });
    if (canceled || !filePaths?.[0]) return { canceled: true };
    const terminalPath = filePaths[0];
    const terminalDir = path.dirname(terminalPath);
    return {
      canceled: false,
      installation: {
        id: 'manual',
        terminalPath,
        dataPath: null,
        portable: false,
        experts: [],
        metaEditor: findMetaEditor(terminalDir),
      },
    };
  });

  ipcMain.handle('mt5:pickDataPath', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Carpeta de datos MT5 (con MQL5\\Experts)',
      properties: ['openDirectory'],
    });
    if (canceled || !filePaths?.[0]) return { canceled: true };
    const dataPath = filePaths[0];
    return { canceled: false, dataPath, experts: listExperts(dataPath) };
  });

  ipcMain.handle('mt5:portableInfo', async (_e, { locale = 'es', sourceDir = null } = {}) => ({
    explain: explainPortableCopy(locale),
    suggestPath: suggestPortablePath(),
    hint: copyPortableHint({ sourceDir, locale }),
  }));

  ipcMain.handle('mt5:shallowCheck', async (_e, { dir } = {}) => shallowCheckMt5Dir(dir));

  ipcMain.handle('mt5:buildIniPreview', async (_e, opts = {}) => {
    const ini = buildTesterIni(opts);
    const combinations = estimateCombinations(opts.inputs || []);
    const cost = estimateJobCost({
      inputs: opts.inputs || [],
      secondsPerPassEstimate: opts.secondsPerPassEstimate ?? null,
      maxCombinationsWarn: opts.maxCombinationsWarn,
    });
    return { ini, combinations, cost };
  });

  ipcMain.handle('mt5:estimateCost', async (_e, args = {}) => estimateJobCost(args));

  ipcMain.handle('mt5:enqueueJob', async (_e, job = {}) => {
    const {
      terminalPath,
      portable = false,
      testerOpts,
      timeoutMs,
      label,
      force = false,
    } = job;

    if (!terminalPath || !fs.existsSync(terminalPath)) {
      throw new Error('Ruta de terminal64.exe no válida.');
    }
    if (isTerminalRunning(terminalPath) && !portable && !force) {
      return {
        ok: false,
        needConfirm: true,
        message: 'Ese terminal parece estar abierto. Ciérralo o usa una copia /portable.',
      };
    }

    const dir = workDir(userData);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportName = `orometra_${stamp}`;
    const reportPath = path.join(dir, reportName);
    const iniPath = path.join(dir, `${reportName}.ini`);

    const opts = { ...testerOpts, report: reportPath };
    const ini = buildTesterIni(opts);
    fs.writeFileSync(iniPath, ini, 'utf8');

    let jobId = null;
    jobId = queue.enqueue({
      terminalPath,
      iniPath,
      portable: Boolean(portable),
      reportPath,
      timeoutMs,
      label: label || opts.expert || reportName,
      onProgress: (p) => sendProgress({ jobId, ...p }),
    });
    queue.start();
    return {
      ok: true,
      id: jobId,
      iniPath,
      reportPath,
      cost: estimateJobCost({ inputs: opts.inputs || [] }),
    };
  });

  ipcMain.handle('mt5:queueStatus', async () => queue.status());
  ipcMain.handle('mt5:cancelJob', async (_e, { id } = {}) => queue.cancel(id));

  ipcMain.handle('mt5:collectReports', async (_e, { reportBasePath } = {}) => {
    if (!reportBasePath) throw new Error('Falta reportBasePath');
    return collectOptimizationReports(reportBasePath);
  });

  ipcMain.handle('mt5:collectAndImport', async (_e, {
    reportBasePath,
    strategyId,
    oosReportBasePath = null,
    locale = 'es',
    policy = null,
  } = {}) => {
    if (!strategyId) throw new Error('Elige una estrategia.');
    const collected = collectOptimizationReports(reportBasePath);
    let { isTable, oosTable, backtest, paths } = collected;

    if (oosReportBasePath) {
      const oosCol = collectOptimizationReports(oosReportBasePath);
      if (oosCol.isTable) oosTable = oosCol.isTable;
      else if (oosCol.oosTable) oosTable = oosCol.oosTable;
    }

    if (!isTable) {
      return {
        ok: false,
        message: 'No se encontró tabla de optimización (XML/XLS).',
        collected,
        backtest: backtest || null,
      };
    }
    if (!oosTable) {
      return {
        ok: false,
        message: 'Hace falta también el informe Forward (OOS) para importar como en Lite.',
        collected,
        needForward: true,
      };
    }

    setLocale(locale === 'en' ? 'en' : 'es');
    const analysis = runAnalysis({
      isTable,
      oosTable,
      policy: policy || DEFAULT_POLICY,
    });
    const summary = compactSummary(analysis);
    const isFile = paths.xml[0] || reportBasePath;
    const oosFile = paths.xml.find((p) => /forward|oos/i.test(path.basename(p))) || paths.xml[1] || isFile;
    const saved = await ledger.call('importOptimization', {
      strategyId,
      isPath: isFile,
      oosPath: oosFile,
      type: 'optimization',
      nPasses: analysis.meta?.total ?? null,
      seed: null,
      config: {
        source: 'mt5-runner',
        reportBasePath,
        files: paths,
        policy: analysis.meta?.policy || policy || DEFAULT_POLICY,
      },
      summary,
      status: 'completed',
    });

    return {
      ok: true,
      ...saved,
      summary,
      verdict: analysis.verdict,
      collected,
    };
  });

  return { queue };
}
