import { PROFILES, hashPreregistration } from '../../core/verdict-integrated.js';

const api = window.orometraDesktop;
let step = 1;
const state = {
  prereg: null,
  preregHash: null,
};

const $ = (s) => document.querySelector(s);

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
  const profile = { ...PROFILES[id], frozenAt: new Date().toISOString() };
  state.prereg = profile;
  state.preregHash = hashPreregistration(profile);
  $('#preregBox').innerHTML = `
    <div class="cell"><strong>${state.preregHash}</strong><span>Hash del listón</span></div>
    <div class="cell"><strong>${profile.id}</strong><span>Perfil</span></div>
    <div class="cell"><strong>${$('#wHoldout').value}</strong><span>Holdout</span></div>
  `;
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

$('#btnValidate').addEventListener('click', async () => {
  freezePrereg();
  const log = $('#wizLog');
  log.hidden = false;
  log.textContent = 'Preparando…\n';

  if (!api?.isDesktop) {
    log.textContent += 'Abre el asistente desde Electron (npm run desktop).\n';
    log.textContent += `Pre-registro hash=${state.preregHash}\n`;
    return;
  }

  try {
    const strategy = await api.createStrategy({
      name: $('#wName').value.trim(),
      hypothesis: $('#wHyp').value.trim(),
      priorSearchNote: $('#wPrior').value.trim(),
    });
    log.textContent += `Estrategia ${strategy.id}\n`;
    log.textContent += `Pre-registro ${state.preregHash} congelado.\n`;
    log.textContent += `Modo: ${document.querySelector('input[name="mode"]:checked')?.value}\n`;
    log.textContent += `Holdout: ${$('#wHoldout').value}\n`;
    log.textContent += 'Siguiente: instrumentar / lanzar MT5 (Fase 2–3) o importar XML si es caja negra.\n';
    // Persist prereg via ledger if API exists
    if (api.savePreregistration) {
      await api.savePreregistration({
        strategyId: strategy.id,
        thresholds: state.prereg,
        hash: state.preregHash,
      });
    }
  } catch (err) {
    log.textContent += `Error: ${err.message || err}\n`;
  }
});

showStep(1);
renderProfile();
