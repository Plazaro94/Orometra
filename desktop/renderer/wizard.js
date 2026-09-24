import { PROFILES, hashPreregistration } from '../../core/verdict-integrated.js';

const api = window.orometraDesktop;
let step = 1;
const state = {
  prereg: null,
  preregHash: null,
  strategyId: null,
  experimentId: null,
  lastJobId: null,
  unsubProgress: null,
};

const $ = (s) => document.querySelector(s);

function log(line) {
  const el = $('#wizLog');
  el.hidden = false;
  el.textContent += `${line}\n`;
  el.scrollTop = el.scrollHeight;
}

function showStep(n) {
  step = n;
  document.querySelectorAll('.wiz-panel').forEach((p) => {
    p.hidden = Number(p.dataset.panel) !== n;
  });
  document.querySelectorAll('#stepNav li').forEach((li) => {
    li.classList.toggle('active', Number(li.dataset.step) === n);
  });
  $('#btnPrev').hidden = n === 1;
  $('#btnNext').hidden = n === 4;
  $('#btnValidate').hidden = n !== 4;
  if (n === 2) refreshInstalls();
  if (n === 3) renderProfile();
  if (n === 4) freezePrereg();
}

function renderProfile() {
  const id = document.querySelector('input[name="profile"]:checked')?.value || 'standard';
  const p = PROFILES[id];
  $('#profilePreview').textContent = JSON.stringify(p, null, 2);
}

function freezePrereg() {
  const id = document.querySelector('input[name="profile"]:checked')?.value || 'standard';
  const profile = {
    ...PROFILES[id],
    frozenAt: new Date().toISOString(),
    mode: document.querySelector('input[name="mode"]:checked')?.value || 'fixed',
    holdout: Number($('#wHoldout').value) || 0.2,
    symbol: $('#wSymbol').value.trim() || null,
    timeframe: $('#wTf').value || null,
    from: $('#wFrom').value || null,
    to: $('#wTo').value || null,
    ea: $('#wEa').value || null,
  };
  state.prereg = profile;
  state.preregHash = hashPreregistration(profile);
  $('#preregBox').innerHTML = `
    <div class="cell"><strong>${state.preregHash}</strong><span>Hash del listón</span></div>
    <div class="cell"><strong>${profile.id}</strong><span>Perfil</span></div>
    <div class="cell"><strong>${profile.holdout}</strong><span>Holdout</span></div>
  `;
}

function renderVerdict(v) {
  const box = $('#wizResult');
  if (!box || !v) return;
  box.hidden = false;
  const cards = (v.cards || [])
    .map((c) => `<div class="wiz-card ${c.traffic || ''}"><strong>${c.id}</strong><span>${c.line}</span></div>`)
    .join('');
  const reasons = (v.reasons || []).map((r) => `<li>${r}</li>`).join('');
  box.innerHTML = `
    <h2>${v.headline || v.level}</h2>
    <p class="muted">${v.neverLiveNote || 'Nunca «apto para real».'}</p>
    <div class="wiz-cards">${cards}</div>
    ${reasons ? `<ul class="wiz-reasons">${reasons}</ul>` : ''}
  `;
}

async function refreshInstalls() {
  const sel = $('#wInstall');
  if (!sel || !api?.mt5ListInstallations) return;
  const list = await api.mt5ListInstallations();
  sel.innerHTML = '';
  if (!list.length) {
    sel.innerHTML = '<option value="">— Sin MT5 detectado —</option>';
    return;
  }
  for (const inst of list) {
    const opt = document.createElement('option');
    opt.value = JSON.stringify({
      terminalPath: inst.terminalPath,
      dataPath: inst.dataPath,
      portable: Boolean(inst.portable),
    });
    opt.textContent = `${inst.dataPath || inst.terminalPath}${inst.portable ? ' (portable)' : ''}`;
    sel.appendChild(opt);
  }
}

function selectedInstall() {
  const raw = $('#wInstall')?.value;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function waitForJob(jobId, timeoutMs = 2 * 60 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    if (state.unsubProgress) state.unsubProgress();
    state.unsubProgress = api.onMt5JobProgress((p) => {
      if (p.jobId && p.jobId !== jobId) return;
      if (p.message) log(`  · ${p.status || ''} ${p.message}`);
      if (p.status === 'done' || p.status === 'error' || p.status === 'cancelled') {
        if (state.unsubProgress) state.unsubProgress();
        state.unsubProgress = null;
        if (p.status === 'done') resolve(p);
        else reject(new Error(p.message || p.status));
      }
    });
    const poll = async () => {
      if (Date.now() - t0 > timeoutMs) {
        if (state.unsubProgress) state.unsubProgress();
        reject(new Error('Tiempo de espera del job agotado'));
        return;
      }
      try {
        const st = await api.mt5QueueStatus();
        const recent = (st.recent || []).find((j) => j.id === jobId);
        if (recent && (recent.status === 'done' || recent.status === 'error' || recent.status === 'cancelled')) {
          if (state.unsubProgress) state.unsubProgress();
          state.unsubProgress = null;
          if (recent.status === 'done') resolve(recent);
          else reject(new Error(recent.message || recent.status));
          return;
        }
      } catch { /* ignore */ }
      setTimeout(poll, 2000);
    };
    setTimeout(poll, 1500);
  });
}

$('#btnNext').addEventListener('click', () => {
  if (step === 1) {
    if (!$('#wName').value.trim() || !$('#wPrior').value.trim()) {
      alert('Nombre y búsqueda previa son obligatorios.');
      return;
    }
  }
  showStep(Math.min(4, step + 1));
});
$('#btnPrev').addEventListener('click', () => showStep(Math.max(1, step - 1)));
document.querySelectorAll('input[name="profile"]').forEach((r) => {
  r.addEventListener('change', renderProfile);
});

$('#pickEa')?.addEventListener('click', async () => {
  if (!api?.pickFiles) return;
  const files = await api.pickFiles({
    title: 'EA',
    filters: [{ name: 'EA', extensions: ['mq5', 'ex5'] }],
  });
  if (files[0]) {
    $('#wEa').value = files[0];
    $('#blackBoxNote').hidden = !files[0].toLowerCase().endsWith('.ex5');
  }
});

$('#btnPickInstall')?.addEventListener('click', async () => {
  if (!api?.mt5PickTerminal) return;
  const r = await api.mt5PickTerminal();
  if (r.canceled) return;
  const sel = $('#wInstall');
  const opt = document.createElement('option');
  const data = {
    terminalPath: r.installation.terminalPath,
    dataPath: r.installation.dataPath,
    portable: Boolean(r.installation.portable),
  };
  opt.value = JSON.stringify(data);
  opt.textContent = `${data.terminalPath} (manual)`;
  sel.appendChild(opt);
  sel.value = opt.value;
  if (!data.dataPath && api.mt5PickDataPath) {
    const d = await api.mt5PickDataPath();
    if (!d.canceled) {
      data.dataPath = d.dataPath;
      opt.value = JSON.stringify(data);
      sel.value = opt.value;
    }
  }
});

$('#btnAnalyzeOrf')?.addEventListener('click', async () => {
  if (!api?.pickFiles || !api.mt5AnalyzeOrf) return;
  freezePrereg();
  const files = await api.pickFiles({
    title: 'Archivo .orf',
    filters: [{ name: 'ORF', extensions: ['orf'] }],
  });
  if (!files[0]) return;
  $('#wizLog').hidden = false;
  $('#wizLog').textContent = `Analizando ${files[0]}…\n`;
  try {
    const r = await api.mt5AnalyzeOrf({
      filePath: files[0],
      profile: state.prereg,
      preregistrationHash: state.preregHash,
    });
    log(`ORF T=${r.T} N=${r.N} usable=${r.usable}`);
    if (r.pbo?.usable) log(`PBO=${(100 * r.pbo.pbo).toFixed(1)} %`);
    if (r.dsr?.usable) log(`DSR=${r.dsr.dsr.toFixed(3)}`);
    if (r.effectiveTrials) log(`Pruebas efectivas ≈ ${r.effectiveTrials.nEffective} / ${r.effectiveTrials.nRaw}`);
    renderVerdict(r.verdict);
  } catch (err) {
    log(`Error: ${err.message || err}`);
  }
});

$('#btnValidate').addEventListener('click', async () => {
  freezePrereg();
  const logEl = $('#wizLog');
  logEl.hidden = false;
  logEl.textContent = 'Preparando Validar…\n';
  $('#wizResult').hidden = true;

  if (!api?.isDesktop) {
    log('Abre el asistente desde Electron (npm run desktop).');
    log(`Pre-registro hash=${state.preregHash}`);
    return;
  }

  const eaPath = $('#wEa').value.trim();
  if (!eaPath) {
    log('Elige un EA (.mq5 o .ex5) en el paso 1.');
    return;
  }

  try {
    const strategy = await api.createStrategy({
      name: $('#wName').value.trim(),
      hypothesis: $('#wHyp').value.trim(),
      priorSearchNote: $('#wPrior').value.trim(),
    });
    state.strategyId = strategy.id;
    log(`Estrategia ${strategy.id}`);

    if (api.savePreregistration) {
      await api.savePreregistration({
        strategyId: strategy.id,
        thresholds: state.prereg,
        hash: state.preregHash,
      });
      log(`Pre-registro ${state.preregHash} congelado.`);
    }

    state.experimentId = `wiz_${strategy.id}_${Date.now().toString(36)}`;
    const install = selectedInstall();
    const isEx5 = eaPath.toLowerCase().endsWith('.ex5');

    // —— Caja negra .ex5 ——
    if (isEx5) {
      log('Modo caja negra (.ex5): sin sonda. Elige XML IS + Forward…');
      const files = await api.pickFiles({
        title: 'Informes IS y Forward',
        filters: [{ name: 'MT5', extensions: ['xml', 'xls', 'xlsx'] }],
      });
      if (files.length < 2) {
        log('Se necesitan dos archivos (IS y Forward). También puedes importarlos desde el Registro.');
        const v = await api.mt5IntegratedVerdict({
          riskVeto: false,
          pbo: NaN,
          dsr: NaN,
          sampleInsufficient: true,
          plateauOk: false,
          reservedOk: null,
          preregistrationHash: state.preregHash,
        });
        renderVerdict(v.verdict);
        return;
      }
      const imported = await api.importOptimization({
        strategyId: strategy.id,
        isPath: files[0],
        oosPath: files[1],
      });
      log(`Importado experimento ${imported.experimentId || imported.id || ''}`);
      const plateauOk = (imported.summary?.nPlateaus || 0) > 0;
      const v = await api.mt5IntegratedVerdict({
        riskVeto: false,
        costStillProfitableModerate: null,
        pbo: NaN,
        dsr: NaN,
        sampleInsufficient: false,
        plateauOk,
        reservedOk: null,
        preregistrationHash: state.preregHash,
        searchCounter: null,
      });
      log('Veredicto sin PBO/DSR (hace falta .orf / fuente).');
      renderVerdict(v.verdict);
      return;
    }

    // —— .mq5: instrumentar + compilar ——
    if (!install?.terminalPath || !install?.dataPath) {
      log('Elige una instalación MT5 con carpeta de datos (paso 2), o «Elegir terminal…».');
      return;
    }

    log(`Instrumentando → dataPath=${install.dataPath}`);
    const prep = await api.mt5PrepareValidate({
      eaPath,
      dataPath: install.dataPath,
      terminalPath: install.terminalPath,
      experimentId: state.experimentId,
    });
    log(prep.message || prep.mode);
    if (prep.instrument?.warnings?.length) {
      for (const w of prep.instrument.warnings) log(`  aviso: ${w}`);
    }
    if (!prep.ok) {
      log(prep.compile?.plainSummary || 'Compilación fallida.');
      for (const e of prep.compile?.errors || []) log(`  error: ${e.plain || e.message}`);
      return;
    }
    log(`Expert relativo: ${prep.expertRel}`);

    const from = $('#wFrom').value;
    const to = $('#wTo').value;
    if (!from || !to) {
      log('Indica fechas Desde/Hasta en el paso 2.');
      return;
    }

    const testerOpts = {
      expert: prep.expertRel,
      symbol: $('#wSymbol').value.trim() || 'XAUUSD',
      period: $('#wTf').value || 'H1',
      model: 1,
      // Sin rejilla en el wizard: 1 pasada (backtest). Para malla, usa el runner MT5.
      optimization: 0,
      fromDate: from,
      toDate: to,
      deposit: 10000,
      currency: 'USD',
      leverage: '1:100',
      executionMode: 0,
      forwardMode: 0,
      inputs: prep.suggestedInputs || [],
    };

    log('Encolando backtest instrumentado (Optimization=0). Para optimización completa usa la vista MT5 del Registro.');
    let enq = await api.mt5EnqueueJob({
      terminalPath: install.terminalPath,
      portable: Boolean(install.portable),
      testerOpts,
      label: `Validar ${prep.expertRel}`,
    });
    if (enq.needConfirm) {
      if (!confirm(enq.message + '\n¿Forzar igual?')) {
        log('Cancelado: cierra el terminal o usa /portable.');
        return;
      }
      enq = await api.mt5EnqueueJob({
        terminalPath: install.terminalPath,
        portable: Boolean(install.portable),
        testerOpts,
        label: `Validar ${prep.expertRel}`,
        force: true,
      });
    }
    if (!enq.ok) {
      log(enq.message || 'No se pudo encolar.');
      return;
    }
    state.lastJobId = enq.id;
    log(`Job ${enq.id} en cola. Informe → ${enq.reportPath}`);
    log('Esperando a que termine MT5…');

    await waitForJob(enq.id);
    log('Tester terminado. Buscando .orf e informes…');

    const found = await api.mt5FindOrf(state.experimentId);
    let orfPath = found.candidates?.[0] || null;
    if (!orfPath) {
      log('No apareció .orf automáticamente. Puedes usar «Analizar .orf…» cuando lo tengas.');
    } else {
      log(`ORF: ${orfPath}`);
      const analyzed = await api.mt5AnalyzeOrf({
        filePath: orfPath,
        profile: state.prereg,
        preregistrationHash: state.preregHash,
        plateauOk: null,
        reservedOk: null,
      });
      log(`Matriz T=${analyzed.T} N=${analyzed.N} usable=${analyzed.usable}`);
      if (analyzed.pbo?.usable) log(`PBO=${(100 * analyzed.pbo.pbo).toFixed(1)} %`);
      if (analyzed.dsr?.usable) log(`DSR=${analyzed.dsr.dsr.toFixed(3)}`);
      if (analyzed.effectiveTrials) {
        log(`Pruebas efectivas ≈ ${analyzed.effectiveTrials.nEffective}/${analyzed.effectiveTrials.nRaw}`);
      }
      renderVerdict(analyzed.verdict);
    }

    // Intentar import Lite si hay XML IS+FW (a menudo Optimization=0 no genera forward)
    try {
      const collected = await api.mt5CollectReports(enq.reportPath);
      log(`Informes: xml=${(collected.paths?.xml || []).length} htm=${(collected.paths?.htm || []).length}`);
    } catch (e) {
      log(`Collect: ${e.message || e}`);
    }

    log('Validar (pipeline) listo. Si N<2 en el ORF, lanza una optimización con malla desde la vista MT5.');
  } catch (err) {
    log(`Error: ${err.message || err}`);
  }
});

showStep(1);
renderProfile();
if (api?.isDesktop) refreshInstalls();
