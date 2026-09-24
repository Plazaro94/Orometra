const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orometraDesktop', {
  listStrategies: () => ipcRenderer.invoke('ledger:listStrategies'),
  getStrategy: (id) => ipcRenderer.invoke('ledger:getStrategy', { id }),
  createStrategy: (args) => ipcRenderer.invoke('ledger:createStrategy', args),
  listExperiments: (strategyId) => ipcRenderer.invoke('ledger:listExperiments', { strategyId }),
  getExperiment: (id) => ipcRenderer.invoke('ledger:getExperiment', { id }),
  getSearchCounter: (strategyId) => ipcRenderer.invoke('ledger:getSearchCounter', { strategyId }),
  exportLedger: () => ipcRenderer.invoke('ledger:exportLedger'),
  writeBackup: () => ipcRenderer.invoke('ledger:writeBackup'),
  importBackup: (mode) => ipcRenderer.invoke('ledger:importBackup', { mode }),
  openAnalysis: (query) => ipcRenderer.invoke('desktop:openAnalysis', query),
  pickFiles: (opts) => ipcRenderer.invoke('desktop:pickFiles', opts),
  importOptimization: (args) => ipcRenderer.invoke('desktop:importOptimization', args),
  getPaths: () => ipcRenderer.invoke('desktop:getPaths'),
  savePreregistration: (args) => ipcRenderer.invoke('ledger:savePreregistration', args),

  // MT5 runner (Fase 2)
  mt5ListInstallations: () => ipcRenderer.invoke('mt5:listInstallations'),
  mt5ListExperts: (dataPath) => ipcRenderer.invoke('mt5:listExperts', { dataPath }),
  mt5IsTerminalRunning: (terminalPath) => ipcRenderer.invoke('mt5:isTerminalRunning', { terminalPath }),
  mt5PickTerminal: () => ipcRenderer.invoke('mt5:pickTerminal'),
  mt5PickDataPath: () => ipcRenderer.invoke('mt5:pickDataPath'),
  mt5PortableInfo: (opts) => ipcRenderer.invoke('mt5:portableInfo', opts || {}),
  mt5ShallowCheck: (dir) => ipcRenderer.invoke('mt5:shallowCheck', { dir }),
  mt5BuildIniPreview: (opts) => ipcRenderer.invoke('mt5:buildIniPreview', opts),
  mt5EstimateCost: (args) => ipcRenderer.invoke('mt5:estimateCost', args),
  mt5EnqueueJob: (job) => ipcRenderer.invoke('mt5:enqueueJob', job),
  mt5QueueStatus: () => ipcRenderer.invoke('mt5:queueStatus'),
  mt5CancelJob: (id) => ipcRenderer.invoke('mt5:cancelJob', { id }),
  mt5CollectReports: (reportBasePath) => ipcRenderer.invoke('mt5:collectReports', { reportBasePath }),
  mt5CollectAndImport: (args) => ipcRenderer.invoke('mt5:collectAndImport', args),
  mt5InstrumentEa: (opts) => ipcRenderer.invoke('mt5:instrumentEa', opts),
  mt5CompileMq5: (opts) => ipcRenderer.invoke('mt5:compileMq5', opts),
  mt5ReadOrf: (filePath) => ipcRenderer.invoke('mt5:readOrf', { filePath }),
  mt5FindOrf: (experimentId) => ipcRenderer.invoke('mt5:findOrf', { experimentId }),
  mt5AnalyzeOrf: (args) => ipcRenderer.invoke('mt5:analyzeOrf', args),
  mt5IntegratedVerdict: (ctx) => ipcRenderer.invoke('mt5:integratedVerdict', ctx),
  mt5PrepareValidate: (args) => ipcRenderer.invoke('mt5:prepareValidate', args),
  mt5FindMetaEditor: (terminalDir) => ipcRenderer.invoke('mt5:findMetaEditor', { terminalDir }),
  onMt5JobProgress: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('mt5:jobProgress', handler);
    return () => ipcRenderer.removeListener('mt5:jobProgress', handler);
  },

  isDesktop: true,
});
