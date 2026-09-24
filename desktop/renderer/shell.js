// UI del shell Desktop: estrategias, importación, contador, backup.

const api = window.orometraDesktop;
if (!api?.isDesktop) {
  document.body.innerHTML = '<p style="padding:2rem">Abre esta página desde Electron (<code>npm run desktop</code>).</p>';
  throw new Error('No desktop bridge');
}

const $ = (s) => document.querySelector(s);
let selectedId = null;
let strategies = [];

function showView(name) {
  $('#viewStrategies').hidden = name !== 'strategies';
  $('#viewImport').hidden = name !== 'import';
  const mt5 = $('#viewMt5') || $('#viewRunner');
  if (mt5) mt5.hidden = name !== 'mt5' && name !== 'runner';
  document.querySelectorAll('.desk-nav .nav-item[data-view]').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === name);
  });
  if (name === 'mt5' || name === 'runner') {
    fillRunnerStrategy();
    loadPortableInfo();
    refreshQueue();
  }
}

function fmtCounter(c) {
  if (!c) return '';
  const prior = c.declaredPriorSearch?.approx != null
    ? String(c.declaredPriorSearch.approx)
    : (c.declaredPriorSearch?.note || '—');
  const effective = c.effectiveTrials == null
    ? 'n/d (fase 4)'
    : String(c.effectiveTrials);
  return `
    <div class="cell"><strong>${c.experiments}</strong><span>Experimentos</span></div>
    <div class="cell"><strong>${c.eaVersions}</strong><span>Versiones EA</span></div>
    <div class="cell"><strong>${c.totalPasses}</strong><span>Pasadas en Orometra</span></div>
    <div class="cell"><strong>${effective}</strong><span>Pruebas efectivas</span></div>
    <div class="cell"><strong>${prior}</strong><span>Declarado fuera</span></div>
  `;
}

function renderList() {
  const box = $('#strategyList');
  if (!strategies.length) {
    box.innerHTML = '<p class="muted">Aún no hay estrategias. Crea una para empezar el registro.</p>';
    return;
  }
  box.innerHTML = strategies.map((s) => `
    <article class="strategy-card ${s.id === selectedId ? 'active' : ''}" data-id="${s.id}">
      <h3>${escapeHtml(s.name)}</h3>
      <div class="meta">${s.counter.experiments} exp. · ${s.counter.totalPasses} pasadas · creado ${s.created_at.slice(0, 10)}</div>
    </article>
  `).join('');
  box.querySelectorAll('.strategy-card').forEach((el) => {
    el.addEventListener('click', () => selectStrategy(el.dataset.id));
  });
}

async function selectStrategy(id) {
  selectedId = id;
  renderList();
  const s = await api.getStrategy(id);
  const exps = await api.listExperiments(id);
  $('#strategyDetail').hidden = false;
  $('#detailName').textContent = s.name;
  $('#detailHypothesis').textContent = s.hypothesis || 'Sin hipótesis escrita.';
  $('#detailCounter').innerHTML = fmtCounter(s.counter);
  const list = $('#experimentList');
  if (!exps.length) {
    list.innerHTML = '<p class="muted">Sin experimentos. Importa un XML de optimización.</p>';
  } else {
    list.innerHTML = exps.map((e) => {
      const sum = e.latestSummary || {};
      return `<div class="exp-row">
        <strong>${escapeHtml(e.type)}</strong> · ${e.status}
        · ${e.n_passes ?? '?'} pasadas
        · veredicto ${sum.verdictLevel || '—'}
        · ${e.created_at?.slice(0, 19)?.replace('T', ' ') || ''}
      </div>`;
    }).join('');
  }
  fillImportSelect();
}

function fillImportSelect() {
  const sel = $('#importStrategy');
  sel.innerHTML = strategies.map((s) =>
    `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`,
  ).join('');
  fillRunnerStrategy();
}

function fillRunnerStrategy() {
  const sel = $('#runnerStrategy');
  if (!sel) return;
  sel.innerHTML = strategies.map((s) =>
    `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`,
  ).join('');
}

async function loadPortableInfo() {
  const pe = $('#portableExplain');
  if (!pe || !api.mt5PortableInfo) return;
  try {
    const info = await api.mt5PortableInfo({ locale: 'es' });
    if (info?.explain) {
      pe.textContent = `${info.explain.title}\n\n${info.explain.body}\n\nRuta sugerida: ${info.suggestPath || ''}`;
    }
  } catch {
    /* ignore */
  }
}

async function refresh() {
  strategies = await api.listStrategies();
  renderList();
  fillImportSelect();
  if (selectedId && strategies.some((s) => s.id === selectedId)) await selectStrategy(selectedId);
  else {
    $('#strategyDetail').hidden = true;
    selectedId = null;
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ---- wiring
document.querySelectorAll('.desk-nav .nav-item[data-view]').forEach((b) => {
  b.addEventListener('click', () => showView(b.dataset.view));
});
$('#btnOpenAudit').addEventListener('click', () => api.openAnalysis(''));
$('#btnWizard')?.addEventListener('click', () => {
  window.location.href = './wizard.html';
});

$('#btnNewStrategy').addEventListener('click', () => {
  $('#dlgError').hidden = true;
  $('#formStrategy').reset();
  $('#dlgStrategy').showModal();
});
$('#dlgCancel').addEventListener('click', () => $('#dlgStrategy').close());

$('#formStrategy').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const approxRaw = fd.get('priorSearchApprox');
  try {
    const created = await api.createStrategy({
      name: fd.get('name'),
      hypothesis: fd.get('hypothesis') || '',
      priorSearchNote: fd.get('priorSearchNote'),
      priorSearchApprox: approxRaw === '' || approxRaw == null ? null : Number(approxRaw),
    });
    $('#dlgStrategy').close();
    selectedId = created.id;
    await refresh();
    showView('strategies');
  } catch (err) {
    const el = $('#dlgError');
    el.hidden = false;
    el.textContent = err.message || String(err);
  }
});

$('#pickIs').addEventListener('click', async () => {
  const files = await api.pickFiles({ title: 'In-sample (optimización)' });
  if (files[0]) $('#importIs').value = files[0];
});
$('#pickOos').addEventListener('click', async () => {
  const files = await api.pickFiles({ title: 'Forward' });
  if (files[0]) $('#importOos').value = files[0];
});

$('#importForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const log = $('#importLog');
  log.hidden = false;
  log.textContent = 'Analizando…';
  try {
    const result = await api.importOptimization({
      strategyId: $('#importStrategy').value,
      isPath: $('#importIs').value,
      oosPath: $('#importOos').value,
      locale: 'es',
    });
    log.textContent = JSON.stringify({
      experimentId: result.experiment?.id,
      counter: result.counter,
      summary: result.summary,
      verdict: result.verdict?.level,
      headline: result.verdict?.headline,
    }, null, 2);
    selectedId = $('#importStrategy').value;
    await refresh();
    showView('strategies');
  } catch (err) {
    log.textContent = `Error: ${err.message || err}`;
  }
});

$('#btnBackup').addEventListener('click', async () => {
  const r = await api.writeBackup();
  if (!r.canceled) alert(`Copia guardada en:\n${r.filePath}`);
});
$('#btnRestore').addEventListener('click', async () => {
  const r = await api.importBackup('merge');
  if (!r.canceled) {
    await refresh();
    alert(`Ledger importado. Estrategias visibles: ${r.strategies ?? '—'}`);
  }
});

// ---- MT5 Runner
let installations = [];
let manualInstall = null;

function defaultDates() {
  const to = new Date();
  const from = new Date();
  from.setFullYear(from.getFullYear() - 2);
  const iso = (d) => d.toISOString().slice(0, 10);
  if ($('#mt5From') && !$('#mt5From').value) $('#mt5From').value = iso(from);
  if ($('#mt5To') && !$('#mt5To').value) $('#mt5To').value = iso(to);
}

function currentInstall() {
  if (manualInstall) return manualInstall;
  const id = $('#mt5Install')?.value;
  return installations.find((x) => x.id === id) || installations[0] || null;
}

function fillInstallSelect() {
  const sel = $('#mt5Install');
  if (!sel) return;
  const list = manualInstall ? [manualInstall, ...installations] : installations;
  if (!list.length) {
    sel.innerHTML = '<option value="">— No detectado —</option>';
    return;
  }
  sel.innerHTML = list.map((inst) => {
    const label = `${inst.terminalPath}${inst.portable ? ' (portable)' : ''}`;
    return `<option value="${escapeHtml(inst.id)}">${escapeHtml(label)}</option>`;
  }).join('');
  fillExpertSelect();
  checkRunning();
}

function fillExpertSelect() {
  const sel = $('#mt5Expert');
  if (!sel) return;
  const inst = currentInstall();
  const experts = inst?.experts || [];
  if (!experts.length) {
    sel.innerHTML = '<option value="">— Sin EAs (elige data path) —</option>';
    return;
  }
  sel.innerHTML = experts.map((e) =>
    `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`,
  ).join('');
}

async function checkRunning() {
  const warn = $('#mt5RunningWarn');
  if (!warn) return;
  const inst = currentInstall();
  if (!inst?.terminalPath) {
    warn.hidden = true;
    return;
  }
  try {
    const r = await api.mt5IsTerminalRunning(inst.terminalPath);
    warn.hidden = !r.running || $('#mt5Portable')?.checked;
  } catch {
    warn.hidden = true;
  }
}

function parseInputsJson() {
  const raw = ($('#mt5Inputs')?.value || '').trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Inputs debe ser un array JSON');
  return parsed;
}

function testerOptsFromForm() {
  const expert = $('#mt5Expert')?.value;
  if (!expert) throw new Error('Elige un Expert Advisor');
  return {
    expert: expert.replace(/\.(ex5|mq5)$/i, ''),
    symbol: $('#mt5Symbol').value.trim(),
    period: $('#mt5Period').value,
    model: Number($('#mt5Model').value),
    optimization: Number($('#mt5Opt').value),
    fromDate: $('#mt5From').value,
    toDate: $('#mt5To').value,
    deposit: Number($('#mt5Deposit').value) || 10000,
    currency: 'USD',
    leverage: '1:100',
    executionMode: 0,
    inputs: parseInputsJson(),
  };
}

function showCost(cost) {
  const box = $('#costBox');
  if (!box || !cost) return;
  box.classList.toggle('warn', Boolean(cost.warn) && !cost.tooLarge);
  box.classList.toggle('bad', Boolean(cost.tooLarge));
  const tips = (cost.suggestions || []).map((s) => `· ${s}`).join('\n');
  box.textContent = `${cost.message}${tips ? `\n${tips}` : ''}`;
}

async function detectMt5() {
  installations = await api.mt5ListInstallations();
  manualInstall = null;
  fillInstallSelect();
  const info = await api.mt5PortableInfo({ locale: 'es' });
  const pe = $('#portableExplain');
  if (pe && info?.explain) {
    pe.textContent = `${info.explain.title}\n\n${info.explain.body}\n\nRuta sugerida: ${info.suggestPath}`;
  }
  const log = $('#runnerLog');
  if (log) {
    log.hidden = false;
    log.textContent = installations.length
      ? `Detectadas ${installations.length} instalación(es).`
      : 'No se encontró MT5. Usa «Elegir terminal64.exe».';
  }
}

async function refreshQueue() {
  const box = $('#queueBox');
  if (!box || !api.mt5QueueStatus) return;
  const st = await api.mt5QueueStatus();
  const rows = [];
  if (st.current) {
    rows.push(`<div class="queue-row"><span>▶ ${escapeHtml(st.current.label)}</span><span>${escapeHtml(st.current.status)}</span>
      <button type="button" class="btn" data-cancel="${escapeHtml(st.current.id)}">Cancelar</button></div>`);
  }
  for (const p of st.pending || []) {
    rows.push(`<div class="queue-row"><span>${escapeHtml(p.label)}</span><span>en cola</span>
      <button type="button" class="btn" data-cancel="${escapeHtml(p.id)}">Quitar</button></div>`);
  }
  for (const r of (st.recent || []).slice().reverse()) {
    rows.push(`<div class="queue-row"><span>${escapeHtml(r.label)}</span><span>${escapeHtml(r.status)} · ${escapeHtml(r.message || '')}</span></div>`);
  }
  box.innerHTML = rows.length ? rows.join('') : '<p class="muted">Cola vacía.</p>';
  box.querySelectorAll('[data-cancel]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api.mt5CancelJob(btn.dataset.cancel);
      await refreshQueue();
    });
  });
}

$('#btnDetectMt5')?.addEventListener('click', () => detectMt5());
$('#mt5Install')?.addEventListener('change', () => {
  manualInstall = null;
  fillExpertSelect();
  checkRunning();
});
$('#mt5Portable')?.addEventListener('change', () => checkRunning());

$('#btnPickTerminal')?.addEventListener('click', async () => {
  const r = await api.mt5PickTerminal();
  if (r.canceled) return;
  manualInstall = r.installation;
  fillInstallSelect();
});

$('#btnPickData')?.addEventListener('click', async () => {
  const r = await api.mt5PickDataPath();
  if (r.canceled) return;
  const inst = currentInstall();
  if (!inst) {
    alert('Elige primero un terminal.');
    return;
  }
  inst.dataPath = r.dataPath;
  inst.experts = r.experts || [];
  if (manualInstall) manualInstall = inst;
  fillExpertSelect();
});

$('#btnPreviewIni')?.addEventListener('click', async () => {
  try {
    const opts = testerOptsFromForm();
    opts.report = 'C:\\\\Orometra\\\\preview_report';
    opts.secondsPerPassEstimate = Number($('#mt5SecPerPass').value) || null;
    const r = await api.mt5BuildIniPreview(opts);
    showCost(r.cost);
    const pre = $('#iniPreview');
    pre.hidden = false;
    pre.textContent = r.ini;
  } catch (err) {
    alert(err.message || err);
  }
});

$('#btnEstimateCost')?.addEventListener('click', async () => {
  try {
    const inputs = parseInputsJson();
    const cost = await api.mt5EstimateCost({
      inputs,
      secondsPerPassEstimate: Number($('#mt5SecPerPass').value) || null,
    });
    showCost(cost);
  } catch (err) {
    alert(err.message || err);
  }
});

$('#runnerForm')?.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const log = $('#runnerLog');
  log.hidden = false;
  try {
    const inst = currentInstall();
    if (!inst?.terminalPath) throw new Error('Elige una instalación de MT5');
    const testerOpts = testerOptsFromForm();
    let force = false;
    let result = await api.mt5EnqueueJob({
      terminalPath: inst.terminalPath,
      portable: $('#mt5Portable').checked || Boolean(inst.portable),
      testerOpts,
      label: `${testerOpts.expert} ${testerOpts.symbol}`,
      force,
    });
    if (result.needConfirm) {
      if (!confirm(`${result.message}\n\n¿Encolar de todas formas?`)) return;
      result = await api.mt5EnqueueJob({
        terminalPath: inst.terminalPath,
        portable: $('#mt5Portable').checked || Boolean(inst.portable),
        testerOpts,
        label: `${testerOpts.expert} ${testerOpts.symbol}`,
        force: true,
      });
    }
    if (!result.ok) throw new Error(result.message || 'No se pudo encolar');
    log.textContent = `Encolado ${result.id}\nINI: ${result.iniPath}\nInforme: ${result.reportPath}`;
    if (result.reportPath) $('#collectReportPath').value = result.reportPath;
    showCost(result.cost);
    await refreshQueue();
  } catch (err) {
    log.textContent = `Error: ${err.message || err}`;
  }
});

$('#btnRefreshQueue')?.addEventListener('click', () => refreshQueue());
$('#btnCancelAll')?.addEventListener('click', async () => {
  await api.mt5CancelJob(undefined);
  await refreshQueue();
});

$('#btnCollectImport')?.addEventListener('click', async () => {
  const log = $('#runnerLog');
  log.hidden = false;
  try {
    const reportBasePath = $('#collectReportPath').value.trim();
    const strategyId = $('#runnerStrategy').value;
    if (!reportBasePath) throw new Error('Indica la ruta del informe');
    if (!strategyId) throw new Error('Elige una estrategia');
    const r = await api.mt5CollectAndImport({ reportBasePath, strategyId, locale: 'es' });
    log.textContent = JSON.stringify(r, null, 2);
    if (r.ok) {
      await refresh();
      showView('strategies');
    }
  } catch (err) {
    log.textContent = `Error: ${err.message || err}`;
  }
});

api.onMt5JobProgress?.((p) => {
  const el = $('#jobProgress');
  if (!el) return;
  const min = Math.floor((p.elapsedMs || 0) / 60000);
  el.textContent = p.retry
    ? 'Reintentando job…'
    : `Progreso: ${min} min · informe ${p.reportPath ? 'detectado' : 'pendiente'}${p.reportSize != null ? ` (${p.reportSize} B)` : ''}`;
  refreshQueue();
});

defaultDates();
detectMt5().catch(() => {});

await refresh();
