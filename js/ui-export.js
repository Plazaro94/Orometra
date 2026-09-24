// Exportación .set/json/csv y portapapeles.

import { buildSetFile, buildRefinementSetFile, buildReport, buildCsv, downloadText, formatSetValue } from './export.js';
import { t, L } from './i18n.js';
import { state, api, $, esc } from './ui-state.js';

export async function copyParams(index, button) {
  const a = state.analysis;
  if (!a || !a.plateaus.length) return;
  const p = a.plateaus[Math.min(index, a.plateaus.length - 1)];
  // Mismo formato que el .set de MT5 (punto decimal), no Intl local.
  const text = a.meta.paramNames
    .map((n, j) => `${n}=${formatSetValue(p.record.params[j])}`)
    .join('\n');
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = L('Copiado ✓', 'Copied ✓');
  } catch {
    button.textContent = L('No se ha podido copiar', 'Could not copy');
  }
  setTimeout(() => { button.textContent = original; }, 1800);
}

// ---------------------------------------------------------------- exportación
export function doExport(kind, plateauIndex) {
  const a = state.analysis;
  if (!a) return;
  const stamp = new Date().toISOString().slice(0, 10);
  const idx = Number.isFinite(plateauIndex) ? plateauIndex : state.selectedPlateau;
  const best = a.plateaus[Math.min(idx, Math.max(0, a.plateaus.length - 1))];
  if (kind === 'set') {
    if (!best) return api.showError(L('No hay ninguna meseta que exportar.', 'There is no plateau to export.'));
    if (!a.meta.hasForward) {
      return api.showError(L(
        'Sin forward no se exporta un .set de despliegue: la región solo se midió in-sample. Exporta el rango de refinamiento, o vuelve a auditar con el archivo forward.',
        'Without forward, a deployment .set is not exported: the region was only measured in-sample. Export the refinement range, or re-audit with the forward file.',
      ));
    }
    downloadText(`robustness-M${best.rank}-pass${best.record.id}.set`, buildSetFile(a, best));
  } else if (kind === 'refine') {
    if (!best) return api.showError(L('No hay ninguna meseta que refinar.', 'There is no plateau to refine.'));
    downloadText(`robustness-M${best.rank}-refinamiento.set`, buildRefinementSetFile(a, best));
  } else if (kind === 'json') {
    downloadText(`robustness-informe-${stamp}.json`, JSON.stringify(buildReport(a, {
      source: state.source ? { is: state.source.is, oos: state.source.oos || null, at: state.source.at } : null,
    }), null, 2), 'application/json');
  } else if (kind === 'csv') {
    downloadText(`robustness-configuraciones-${stamp}.csv`, buildCsv(a), 'text/csv;charset=utf-8');
  }
}

export let closeExportMenu = null;

export function toggleExportMenu() {
  if (closeExportMenu) {
    closeExportMenu();
    return;
  }
  let menu = $('#exportMenu');
  if (menu) menu.remove();
  menu = document.createElement('div');
  menu.id = 'exportMenu';
  menu.className = 'export-menu';
  menu.innerHTML = `
    <button data-export="json">${esc(t('export.json'))}</button>
    <button data-export="csv">${esc(t('export.csv'))}</button>
    <button data-export="set" ${state.analysis && !state.analysis.meta.hasForward ? 'disabled title="' + esc(L('Requiere forward', 'Requires forward')) + '"' : ''}>${esc(t('export.set'))}</button>
    <button data-export="refine">${esc(t('export.refine'))}</button>`;
  $('.top-actions').appendChild(menu);
  menu.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => {
    doExport(b.dataset.export);
    menu.remove();
  }));
  // Un único punto de cierre: así no se acumula un listener por cada apertura.
  const onDocClick = (e) => {
    if (!menu.contains(e.target) && e.target !== $('#exportBtn')) closeExportMenu();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      closeExportMenu();
      $('#exportBtn').focus();
    }
  };
  closeExportMenu = () => {
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onKey);
    menu.remove();
    closeExportMenu = null;
  };
  setTimeout(() => {
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
  }, 0);
}
