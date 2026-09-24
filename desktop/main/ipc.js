// Canales IPC del escritorio ↔ renderer.

import { ipcMain, app } from 'electron';
import { parseTable } from '../../core/parse.js';
import { runAnalysis } from '../../core/analysis.js';
import { DEFAULT_POLICY } from '../../core/metrics.js';
import { setLocale } from '../../js/i18n.js';
import { registerMt5Ipc } from './mt5-ipc.js';

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

export function registerIpc(ctx) {
  const { ledger, dialog, fs, path, ROOT, openAnalysisWindow } = ctx;

  const call = (method) => async (_e, args) => ledger.call(method, args || {});

  ipcMain.handle('ledger:listStrategies', call('listStrategies'));
  ipcMain.handle('ledger:getStrategy', call('getStrategy'));
  ipcMain.handle('ledger:createStrategy', call('createStrategy'));
  ipcMain.handle('ledger:listExperiments', call('listExperiments'));
  ipcMain.handle('ledger:getExperiment', call('getExperiment'));
  ipcMain.handle('ledger:getSearchCounter', call('getSearchCounter'));
  ipcMain.handle('ledger:createEaVersion', call('createEaVersion'));
  ipcMain.handle('ledger:exportLedger', call('exportLedger'));
  ipcMain.handle('ledger:savePreregistration', call('createPreregistration'));

  ipcMain.handle('ledger:writeBackup', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Exportar ledger',
      defaultPath: 'orometra-ledger-backup.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { canceled: true };
    await ledger.call('writeLedgerBackup', { filePath });
    return { canceled: false, filePath };
  });

  ipcMain.handle('ledger:importBackup', async (_e, { mode = 'merge' } = {}) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Importar ledger',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePaths?.[0]) return { canceled: true };
    const result = await ledger.call('importLedgerFile', { filePath: filePaths[0], mode });
    return { canceled: false, ...result };
  });

  ipcMain.handle('desktop:openAnalysis', async (_e, query) => {
    openAnalysisWindow(query || '');
    return { ok: true };
  });

  ipcMain.handle('desktop:pickFiles', async (_e, { title, filters } = {}) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: title || 'Elegir archivos',
      properties: ['openFile', 'multiSelections'],
      filters: filters || [
        { name: 'MT5 exports', extensions: ['xml', 'xls', 'xlsx', 'csv', 'tsv'] },
        { name: 'Todos', extensions: ['*'] },
      ],
    });
    if (canceled) return [];
    return filePaths;
  });

  ipcMain.handle('desktop:importOptimization', async (_e, {
    strategyId,
    isPath,
    oosPath = null,
    locale = 'es',
    policy = null,
  }) => {
    if (!strategyId) throw new Error('Elige una estrategia.');
    if (!isPath || !fs.existsSync(isPath)) throw new Error('Archivo in-sample no encontrado.');
    if (!oosPath || !fs.existsSync(oosPath)) {
      throw new Error('Hace falta también el archivo Forward (igual que en Lite).');
    }

    setLocale(locale === 'en' ? 'en' : 'es');
    const isTable = parseTable(fs.readFileSync(isPath), path.basename(isPath));
    const oosTable = parseTable(fs.readFileSync(oosPath), path.basename(oosPath));
    const analysis = runAnalysis({
      isTable,
      oosTable,
      policy: policy || DEFAULT_POLICY,
    });

    const summary = compactSummary(analysis);
    const saved = await ledger.call('importOptimization', {
      strategyId,
      isPath,
      oosPath,
      type: 'optimization',
      nPasses: analysis.meta?.total ?? null,
      seed: null,
      config: {
        files: { is: path.basename(isPath), oos: path.basename(oosPath) },
        policy: analysis.meta?.policy || policy || DEFAULT_POLICY,
      },
      summary,
      status: 'completed',
    });

    return {
      ...saved,
      summary,
      analysisMeta: {
        total: analysis.meta?.total,
        sampling: analysis.meta?.sampling,
        coverage: analysis.meta?.coverage,
        selectionMode: analysis.meta?.selectionMode,
      },
      verdict: analysis.verdict,
    };
  });

  ipcMain.handle('desktop:getPaths', async () => ({
    root: ROOT,
    userData: app.getPath('userData'),
  }));

  registerMt5Ipc(ctx);
}
