// Interfaz. Toda la lógica de cálculo vive en los módulos del motor; aquí solo se
// orquesta la carga de archivos, el worker y el pintado.

import { state, api, $, $$ } from './ui-state.js';

import {
  refreshAnalyzeButton,
  renderPreflight,
  bindDropzone,
  hideDropOverlay,
  bindGlobalDrop,
  loadDemo,
  updateDropStatus,
} from './ui-files.js';

import {
  clearError,
  showError,
  showProgress,
  setBusy,
  inspectXlsx,
  runAudit,
  cancelAudit,
  runInWorker,
  preflightFile,
} from './ui-audit.js';

import {
  initChrome,
  changeLanguage,
  loadPrefs,
  savePrefs,
  updatePolicyPreview,
  updatePolicySummary,
  togglePolicy,
  policyInputProblem,
  readPolicy,
  setTab,
  render,
  HASH_TAB,
} from './ui-chrome.js';

import { setReport, runUnseenCheck, readUnseenForm, renderUnseen } from './ui-unseen.js';
import { renderVerdict } from './ui-verdict.js';
import {
  renderPlateaus,
  renderRejected,
  renderParams,
  renderDiagnostics,
  mostSensitiveIndex,
  mountPlateauSurfaceView,
  disposePlateauSurface,
} from './ui-plateaus.js';
import { copyParams, doExport, toggleExportMenu } from './ui-export.js';

// Reexports mínimos para tests / depuración.
export {
  clearError,
  showError,
  runAudit,
  changeLanguage,
  refreshAnalyzeButton,
  state,
};

Object.assign(api, {
  clearError,
  showError,
  showProgress,
  setBusy,
  inspectXlsx,
  runAudit,
  runInWorker,
  preflightFile,
  readPolicy,
  refreshAnalyzeButton,
  renderPreflight,
  updateDropStatus,
  hideDropOverlay,
  setTab,
  render,
  updatePolicyPreview,
  policyInputProblem,
  savePrefs,
  runUnseenCheck,
  readUnseenForm,
  setReport,
  copyParams,
  doExport,
  mostSensitiveIndex,
  renderVerdict,
  renderPlateaus,
  renderRejected,
  renderParams,
  renderDiagnostics,
  renderUnseen,
  mountPlateauSurfaceView,
  disposePlateauSurface,
});

initChrome();
loadPrefs();
updatePolicySummary();
$('#policyToggle').addEventListener('click', () => togglePolicy());
bindDropzone('#mainDrop', '#mainFile', null);
bindGlobalDrop();
$('#analyzeBtn').addEventListener('click', runAudit);
$('#cancelBtn').addEventListener('click', cancelAudit);
$('#demoBtn').addEventListener('click', loadDemo);
$('#exportBtn').addEventListener('click', toggleExportMenu);
$('#intakeExpandBtn').addEventListener('click', () => {
  document.body.classList.remove('intake-collapsed');
});
['#gPf', '#gDd', '#gTrades', '#gProfit'].forEach((sel) => {
  $(sel).addEventListener('input', () => {
    savePrefs();
    updatePolicySummary();
    updatePolicyPreview();
  });
});
$('#policyRerun').addEventListener('click', () => {
  if (!state.busy) runAudit();
});

// Ancla inicial y botón de atrás del navegador.
window.addEventListener('hashchange', () => {
  const tab = HASH_TAB[location.hash.replace('#', '')];
  const noAnalysisNeeded = tab === 'method' || tab === 'legal' || tab === 'verdict';
  if (tab && tab !== state.tab && (state.analysis || noAnalysisNeeded)) setTab(tab, true);
});
{
  const initial = HASH_TAB[location.hash.replace('#', '')];
  if (initial === 'method' || initial === 'legal') setTab(initial, true);
}
$$('.nav-item').forEach((b) => b.addEventListener('click', () => {
  if (!b.disabled) setTab(b.dataset.tab);
}));
// El enlace legal del pie no es una pestaña numerada, pero navega igual.
$$('.legal-links [data-tab], .lp-menu [data-tab]').forEach((b) => b.addEventListener('click', () => {
  setTab(b.dataset.tab);
}));

render();

// Enlace desde la landing: /app/?demo=1
if (new URLSearchParams(location.search).get('demo') === '1') {
  loadDemo();
}
