// IPC del runner MT5 (Fase 2) + sonda / ORF / Validar (Fases 3–5).

import { ipcMain, app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
import { instrumentEa } from './mt5/instrument.js';
import { compileMq5, findMetaEditor as findMetaEditorCompile } from './mt5/compile.js';
import { readOrfFile } from './mt5/orf-read.js';
import { analyzeOrfDoc, ensureDecodedOrf, orfDocToMatrix } from './mt5/orf-matrix.js';
import { incubationBands, compareIncubation } from '../../core/incubation.js';
import { parseSetText, setParamsToTesterInputs, looksLikeSetFile } from '../../core/setfile.js';
import { runAnalysis } from '../../core/analysis.js';
import { DEFAULT_POLICY } from '../../core/metrics.js';
import { setLocale } from '../../js/i18n.js';
import { integratedVerdict } from '../../core/verdict-integrated.js';

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
    for (const win of BrowserWindow.getAllWindows()) {
      if (win && !win.isDestroyed()) {
        try { win.webContents.send('mt5:jobProgress', payload); } catch { /* ignore */ }
      }
    }
    // compat: también la ventana principal si el listado estuviera vacío en tests
    const main = getMainWindow?.();
    if (main && !main.isDestroyed()) {
      try { main.webContents.send('mt5:jobProgress', payload); } catch { /* ignore */ }
    }
  }

  function findOrfCandidates(experimentId) {
    const id = String(experimentId || 'default').replace(/[^\w.-]+/g, '_');
    const roots = [];
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    roots.push(path.join(appData, 'MetaQuotes', 'Terminal', 'Common', 'Files', 'Orometra'));
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    roots.push(path.join(local, 'Temp'));
    const found = [];
    for (const root of roots) {
      if (!fs.existsSync(root)) continue;
      const direct = path.join(root, `${id}.orf`);
      if (fs.existsSync(direct)) found.push(direct);
      try {
        for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
          if (ent.isFile() && ent.name.toLowerCase().endsWith('.orf')) {
            const full = path.join(root, ent.name);
            if (!found.includes(full)) found.push(full);
          }
          if (ent.isDirectory()) {
            const nested = path.join(root, ent.name, `${id}.orf`);
            if (fs.existsSync(nested) && !found.includes(nested)) found.push(nested);
          }
        }
      } catch { /* ignore */ }
    }
    return found;
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
    allowIsOnly = false,
    extraSummary = null,
    eaVersionId = null,
    preregistrationId = null,
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
    if (!oosTable && !allowIsOnly) {
      return {
        ok: false,
        message: 'Hace falta también el informe Forward (OOS) para importar como en Lite.',
        collected,
        needForward: true,
      };
    }

    setLocale(locale === 'en' ? 'en' : 'es');
    const analysis = oosTable
      ? runAnalysis({
        isTable,
        oosTable,
        policy: policy || DEFAULT_POLICY,
      })
      : runAnalysis({
        isTable,
        oosTable: null,
        policy: policy || DEFAULT_POLICY,
      });
    const summary = {
      ...compactSummary(analysis),
      ...(extraSummary || {}),
    };
    const isFile = paths.xml[0] || reportBasePath;
    const oosFile = oosTable
      ? (paths.xml.find((p) => /forward|oos/i.test(path.basename(p))) || paths.xml[1] || null)
      : null;
    const saved = await ledger.call('importOptimization', {
      strategyId,
      isPath: isFile,
      oosPath: oosFile,
      type: 'optimization',
      nPasses: analysis.meta?.total ?? null,
      seed: null,
      eaVersionId,
      preregistrationId,
      config: {
        source: 'mt5-runner',
        reportBasePath,
        files: paths,
        policy: analysis.meta?.policy || policy || DEFAULT_POLICY,
        allowIsOnly: Boolean(allowIsOnly && !oosTable),
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
      hasForward: Boolean(oosTable),
    };
  });

  // --- Fase 3–5: instrumentar / compilar / ORF / veredicto integrado ---

  ipcMain.handle('mt5:instrumentEa', async (_e, opts = {}) => {
    const result = instrumentEa(opts);
    return { ok: true, ...result, expertRel: path.basename(result.instrumentedPath, '.mq5') };
  });

  ipcMain.handle('mt5:compileMq5', async (_e, opts = {}) => {
    let termDir = opts.terminalPath || null;
    if (termDir && fs.existsSync(termDir) && !fs.statSync(termDir).isDirectory()) {
      termDir = path.dirname(termDir);
    }
    const editor = opts.metaEditorPath
      || findMetaEditorCompile({ terminalPath: opts.terminalPath })
      || findMetaEditor(termDir);
    return compileMq5({ ...opts, metaEditorPath: editor || undefined });
  });

  ipcMain.handle('mt5:readOrf', async (_e, { filePath } = {}) => {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`Archivo .orf no encontrado: ${filePath}`);
    }
    const doc = ensureDecodedOrf(readOrfFile(filePath));
    return {
      ok: true,
      filePath,
      nPasses: doc.nPasses,
      version: doc.version,
      passIds: (doc.passes || []).map((p) => p.passId),
      passes: (doc.passes || []).map((p) => ({
        passId: p.passId,
        nActiveDays: p.nActiveDays,
        totalNetPnl: p.totalNetPnl,
        totalClosedTrades: p.totalClosedTrades,
        lotVaries: p.lotVaries,
        maxConcurrent: p.maxConcurrent,
        tradesWithoutSl: p.tradesWithoutSl,
      })),
    };
  });

  ipcMain.handle('mt5:findOrf', async (_e, { experimentId } = {}) => ({
    candidates: findOrfCandidates(experimentId),
  }));

  ipcMain.handle('mt5:analyzeOrf', async (_e, {
    filePath,
    profile = null,
    preregistrationHash = null,
    plateauOk = null,
    reservedOk = null,
    searchCounter = null,
  } = {}) => {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`Archivo .orf no encontrado: ${filePath}`);
    }
    const doc = ensureDecodedOrf(readOrfFile(filePath));
    const result = analyzeOrfDoc(doc, {
      profile: profile || undefined,
      preregistrationHash,
      plateauOk: plateauOk == null ? undefined : plateauOk,
      reservedOk,
      searchCounter,
    });
    return { ok: true, filePath, ...result };
  });

  ipcMain.handle('mt5:integratedVerdict', async (_e, ctx = {}) => ({
    ok: true,
    verdict: integratedVerdict(ctx),
  }));

  ipcMain.handle('mt5:parseSetFile', async (_e, { filePath } = {}) => {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`Archivo .set no encontrado: ${filePath}`);
    }
    const text = fs.readFileSync(filePath, 'utf8');
    if (!looksLikeSetFile(filePath, text)) {
      return { ok: false, message: 'No parece un .set de MT5.' };
    }
    const setFile = parseSetText(text);
    const optimised = setFile.params.filter((p) => p.hasRange && p.enabled).length;
    return {
      ok: true,
      filePath,
      setFile,
      optimised,
      totalParams: setFile.params.length,
    };
  });

  ipcMain.handle('mt5:setToInputs', async (_e, { setFile, experimentId } = {}) => ({
    ok: true,
    inputs: setParamsToTesterInputs(setFile, { experimentId }),
  }));

  /**
   * Tras un job: ORF → matrix/veredicto, XML → ledger, effectiveTrials en summary.
   */
  ipcMain.handle('mt5:finishValidate', async (_e, {
    strategyId,
    reportBasePath,
    experimentId = null,
    orfPath = null,
    profile = null,
    preregistrationHash = null,
    eaVersionId = null,
    preregistrationId = null,
    locale = 'es',
    allowIsOnly = true,
  } = {}) => {
    if (!strategyId) throw new Error('Falta strategyId');
    const out = {
      ok: true,
      orf: null,
      import: null,
      counter: null,
      incubationPreview: null,
    };

    let resolvedOrf = orfPath;
    if (!resolvedOrf && experimentId) {
      resolvedOrf = findOrfCandidates(experimentId)[0] || null;
    }

    let matrixSummary = {};
    if (resolvedOrf && fs.existsSync(resolvedOrf)) {
      const doc = ensureDecodedOrf(readOrfFile(resolvedOrf));
      const analyzed = analyzeOrfDoc(doc, {
        profile: profile || undefined,
        preregistrationHash,
      });
      out.orf = {
        filePath: resolvedOrf,
        usable: analyzed.usable,
        T: analyzed.T,
        N: analyzed.N,
        verdict: analyzed.verdict,
        pbo: analyzed.pbo?.usable ? analyzed.pbo.pbo : null,
        dsr: analyzed.dsr?.usable ? analyzed.dsr.dsr : null,
        effectiveTrials: analyzed.effectiveTrials || null,
        bestPassId: analyzed.bestPassId ?? null,
        riskVeto: analyzed.risk?.riskVeto ?? false,
      };
      matrixSummary = {
        effectiveTrialsN: analyzed.effectiveTrials?.nEffective ?? null,
        effectiveTrials: analyzed.effectiveTrials || null,
        pbo: out.orf.pbo,
        dsr: out.orf.dsr,
        integratedVerdict: analyzed.verdict?.level ?? null,
        orfPath: resolvedOrf,
        matrixTN: { T: analyzed.T, N: analyzed.N },
      };

      // Bandas de incubación a partir de la mejor columna (si hay matriz usable)
      if (analyzed.usable && analyzed.dsr?.returns) {
        /* dsr no expone returns; reconstruir desde doc */
      }
      try {
        const { matrix, T, N } = orfDocToMatrix(doc);
        if (T >= 10 && N >= 1) {
          let bestJ = 0;
          let bestMean = -Infinity;
          for (let j = 0; j < N; j++) {
            let s = 0;
            for (let t = 0; t < T; t++) s += matrix[t][j];
            const m = s / T;
            if (m > bestMean) { bestMean = m; bestJ = j; }
          }
          const series = matrix.map((row) => row[bestJ]);
          const bands = incubationBands(series, { painDd: profile?.painDd ?? null });
          out.incubationPreview = bands;
          matrixSummary.incubationBands = bands.usable ? {
            fixedAt: bands.fixedAt,
            painDd: bands.painDd,
            minTradesToJudge: bands.minTradesToJudge,
            horizons: bands.horizons,
          } : null;
        }
      } catch { /* ignore band errors */ }
    }

    // Import inline (reuse logic without nested invoke)
    if (reportBasePath) {
      const collected = collectOptimizationReports(reportBasePath);
      let { isTable, oosTable, paths } = collected;
      if (isTable) {
        setLocale(locale === 'en' ? 'en' : 'es');
        const analysis = runAnalysis({
          isTable,
          oosTable: oosTable || null,
          policy: DEFAULT_POLICY,
        });
        const summary = {
          ...compactSummary(analysis),
          ...matrixSummary,
          plateauOk: (analysis.plateaus?.length || 0) > 0,
        };
        const isFile = paths.xml[0] || reportBasePath;
        const oosFile = oosTable
          ? (paths.xml.find((p) => /forward|oos/i.test(path.basename(p))) || paths.xml[1] || null)
          : null;
        if (oosTable || allowIsOnly) {
          out.import = await ledger.call('importOptimization', {
            strategyId,
            isPath: isFile,
            oosPath: oosFile,
            type: 'optimization',
            nPasses: analysis.meta?.total ?? matrixSummary.matrixTN?.N ?? null,
            eaVersionId,
            preregistrationId,
            config: {
              source: 'mt5-validate',
              reportBasePath,
              experimentId,
              orfPath: resolvedOrf,
              hasForward: Boolean(oosTable),
            },
            summary,
            status: 'completed',
          });
          if (out.orf?.verdict) {
            out.import.integratedVerdict = out.orf.verdict;
            out.import.liteVerdict = analysis.verdict;
          }
        } else {
          out.import = {
            ok: false,
            needForward: true,
            message: 'Sin forward; ORF sí analizado si existía.',
            collected,
          };
        }
      } else if (!resolvedOrf) {
        out.import = {
          ok: false,
          message: 'Sin tabla XML ni ORF.',
          collected,
        };
      } else {
        // Solo ORF: guardar resultado mínimo en ledger
        out.import = await ledger.call('importOptimization', {
          strategyId,
          isPath: resolvedOrf,
          oosPath: null,
          type: 'orf_matrix',
          nPasses: matrixSummary.matrixTN?.N ?? null,
          eaVersionId,
          preregistrationId,
          config: {
            source: 'mt5-validate-orf',
            experimentId,
            orfPath: resolvedOrf,
          },
          summary: {
            ...matrixSummary,
            verdictLevel: out.orf?.verdict?.level ?? null,
          },
          status: 'completed',
        });
      }
    } else if (resolvedOrf && out.orf) {
      out.import = await ledger.call('importOptimization', {
        strategyId,
        isPath: resolvedOrf,
        oosPath: null,
        type: 'orf_matrix',
        nPasses: matrixSummary.matrixTN?.N ?? null,
        eaVersionId,
        preregistrationId,
        config: {
          source: 'mt5-validate-orf',
          experimentId,
          orfPath: resolvedOrf,
        },
        summary: {
          ...matrixSummary,
          verdictLevel: out.orf?.verdict?.level ?? null,
        },
        status: 'completed',
      });
    }

    out.counter = await ledger.call('getSearchCounter', { strategyId });
    out.ok = Boolean(out.orf || out.import?.experiment);
    return out;
  });

  ipcMain.handle('mt5:incubationBands', async (_e, { returns, opts } = {}) => ({
    ok: true,
    bands: incubationBands(returns || [], opts || {}),
  }));

  ipcMain.handle('mt5:compareIncubation', async (_e, { realized, bands, stopRules } = {}) => ({
    ok: true,
    comparison: compareIncubation(realized || {}, bands || {}, stopRules || {}),
  }));

  /**
   * Prepara Validar: instrumenta+compila .mq5 o marca caja negra .ex5.
   */
  ipcMain.handle('mt5:prepareValidate', async (_e, {
    eaPath,
    dataPath,
    terminalPath = null,
    experimentId = 'orometra',
    outDir = null,
    strategyId = null,
  } = {}) => {
    if (!eaPath) throw new Error('Falta la ruta del EA.');
    const ext = path.extname(eaPath).toLowerCase();

    if (ext === '.ex5') {
      return {
        ok: true,
        mode: 'blackbox',
        message: 'EA compilado (.ex5): modo caja negra. Importa XML IS+Forward (Lite) o usa el runner sin sonda.',
        eaPath,
        experimentId,
      };
    }
    if (ext !== '.mq5') {
      throw new Error('El EA debe ser .mq5 (sonda) o .ex5 (caja negra).');
    }
    if (!dataPath) throw new Error('Elige la carpeta de datos MT5 (dataPath) para instalar la sonda.');

    const expertsOut = outDir || path.join(dataPath, 'MQL5', 'Experts', 'Orometra');
    fs.mkdirSync(expertsOut, { recursive: true });

    const inst = instrumentEa({ eaPath, dataPath, outDir: expertsOut });
    const compile = compileMq5({
      mq5Path: inst.instrumentedPath,
      terminalPath: terminalPath || undefined,
    });

    const expertsRoot = path.join(dataPath, 'MQL5', 'Experts');
    let expertRel = path.relative(expertsRoot, inst.instrumentedPath).replace(/\\/g, '/').replace(/\.mq5$/i, '');
    if (expertRel.startsWith('..')) {
      expertRel = path.basename(inst.instrumentedPath, path.extname(inst.instrumentedPath));
    }

    let eaVersion = null;
    if (strategyId && ledger?.call) {
      try {
        eaVersion = await ledger.call('createEaVersion', {
          strategyId,
          path: inst.instrumentedPath,
          note: `instrumented ${experimentId}`,
        });
      } catch { /* optional */ }
    }

    return {
      ok: compile.ok,
      mode: 'instrumented',
      experimentId,
      instrument: inst,
      compile,
      expertRel,
      eaVersion,
      suggestedInputs: [
        { name: 'OrometraExperimentId', value: experimentId, optimize: false },
      ],
      message: compile.ok
        ? `Instrumentado y compilado: Experts/${expertRel}`
        : (compile.plainSummary || 'Falló la compilación.'),
    };
  });

  return { queue };
}
