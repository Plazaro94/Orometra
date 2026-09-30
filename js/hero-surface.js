// Superficie hero: la tesis de Orometra a escala de producto.
// Relieve sombreado con curvas de nivel reales. Al pasar el ratón (o solo, en táctil) se ve
// el MISMO resultado en un periodo de mercado nuevo: el pico que MT5 pone primero cae y la
// meseta que recomienda Orometra aguanta. Arrastrar gira la superficie.
//
// Las dos cifras de los marcadores (4.71 y 2.18) son las de la tabla «La primera fila» de la
// portada; tests/hero-surface.test.js comprueba que coinciden.

export const MT5_RESULT = 4.71;
export const PICK_RESULT = 2.18;
const MT5_AFTER = 1.30;
const PICK_AFTER = 2.05;

const SPIN = 0.00022;
const MESA_CAP = 0.68;
const PEAK_A = { u: 0.58, v: 0.40 };
const MESA_C = { u: -0.18, v: -0.10 };

// Niveles de las curvas: [altura, clase]. 0 = suelo de la meseta, 1 = borde de la meseta, 2 = pico.
const LEVELS = [
  [0.08, 0], [0.16, 0], [0.24, 0], [0.32, 0], [0.40, 0], [0.48, 0], [0.56, 0], [0.655, 1],
  [0.78, 2], [0.95, 2], [1.12, 2],
];

const gauss = (du, dv, w) => Math.exp(-(du * du + dv * dv) / (2 * w * w));

function mesaHeight(u, v) {
  return Math.min(MESA_CAP, gauss(u - MESA_C.u, v - MESA_C.v, 0.52) * 0.96);
}

// m = 0: periodo optimizado (picos altos). m = 1: periodo nuevo (los picos caen y aparecen
// otros pequeños en otros sitios; la meseta se mantiene, casi igual).
export function height(u, v, m) {
  const k = 1 - m;
  const a = gauss(u - PEAK_A.u, v - PEAK_A.v, 0.09) * 1.18 + gauss(u - 0.12, v + 0.62, 0.08) * 0.95;
  const b = gauss(u + 0.62, v - 0.42, 0.09) * 0.42 + gauss(u - 0.36, v + 0.52, 0.08) * 0.34;
  return mesaHeight(u, v) * (1 - 0.06 * m) + a * k * k + b * m * m;
}

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

function cssColor(el, name, fallback) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function parseColor(str, fallback) {
  const s = String(str || '').trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16));
  m = /^#([0-9a-f]{6})/i.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(s);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return fallback;
}

const rgb = (c) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function mountHeroSurface(canvas, opts = {}) {
  if (!canvas || !canvas.getContext) return () => {};
  const ctx = canvas.getContext('2d', { alpha: false });
  const quiet = matchMedia('(prefers-reduced-motion: reduce)');
  const fineHover = matchMedia('(hover: hover) and (pointer: fine)');
  const host = canvas.closest('.lp-surface') || canvas;
  const root = document.documentElement;
  const getLabels = typeof opts.labels === 'function' ? opts.labels : () => opts.labels || {};
  const getLocale = typeof opts.locale === 'function' ? opts.locale : () => opts.locale || 'en';

  let hover = false;
  let collapse = 0;
  let angle = -0.78;
  let raf = 0;
  let last = 0;
  let intro = 0;
  let inView = true;
  let autoT = 0;
  let dragging = false;
  let dragMoved = 0;
  let dragX = 0;
  let tapTimer = 0;

  const size = () => {
    const dpr = Math.min(2.25, devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width) || 560);
    const cssH = Math.max(1, Math.round(rect.height) || 420);
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { dpr, cssW, cssH };
  };

  // roundRect no existe en navegadores algo antiguos (Safari < 16): mismo trazo a mano.
  const roundBox = (x, y, w, h, r) => {
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const fmt = (x) => x.toLocaleString(getLocale() === 'es' ? 'es-ES' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function draw() {
    const { dpr, cssW, cssH } = size();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const light = (root.dataset.theme || 'dark') === 'light';
    const N = cssW < 520 ? 40 : 56;
    const m = collapse;
    const show = Math.min(1, 0.25 + intro * 0.75);

    const okC = parseColor(cssColor(root, '--ok', '#3ed7d0'), [62, 215, 208]);
    const peakC = parseColor(cssColor(root, '--peak', '#e85a7a'), [232, 90, 122]);
    const surfC = parseColor(cssColor(root, '--surface', '#0c1220'), [12, 18, 32]);
    const surf2C = parseColor(cssColor(root, '--surface-2', '#101828'), [16, 24, 40]);
    const textC = parseColor(cssColor(root, '--text', light ? '#1a2333' : '#dbe4ee'), light ? [26, 35, 51] : [219, 228, 238]);
    const mutedC = parseColor(cssColor(root, '--muted-3', '#5a6b7d'), [90, 107, 125]);
    const labels = getLabels();

    ctx.fillStyle = rgb(surfC);
    ctx.fillRect(0, 0, cssW, cssH);
    const wash = ctx.createRadialGradient(cssW * 0.55, cssH * 0.42, cssH * 0.05, cssW * 0.5, cssH * 0.55, cssW * 0.75);
    wash.addColorStop(0, rgb(surf2C));
    wash.addColorStop(1, rgb(surfC));
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, cssW, cssH);

    const cx = cssW * 0.5;
    const HK = 0.46; // escala vertical de la altura
    const avail = cssH - 50 - 74; // hueco para la etiqueta de periodo y el pie
    const rise = 1.45 * HK + 0.33; // lo que sube el pico más alto sobre el centro (con el fondo del suelo)
    const scale = Math.min(cssW * 0.4, avail / (rise + 0.44));
    const cy = 50 + (avail - (rise + 0.44) * scale) / 2 + rise * scale;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const project = (u, v, h) => {
      const x = u * cos - v * sin;
      const y = u * sin + v * cos;
      return [cx + x * scale, cy + y * scale * 0.44 - h * scale * HK];
    };

    // Suelo: anillo y rejilla tenue.
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgb(mutedC);
    ctx.globalAlpha = (light ? 0.5 : 0.32) * show;
    ctx.beginPath();
    for (let a = 0; a <= 72; a++) {
      const p = project(Math.cos((a / 72) * Math.PI * 2) * 1.02, Math.sin((a / 72) * Math.PI * 2) * 1.02, 0);
      if (a === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
    ctx.globalAlpha = (light ? 0.22 : 0.13) * show;
    ctx.beginPath();
    for (const g of [-0.66, -0.33, 0, 0.33, 0.66]) {
      const e = Math.sqrt(1.02 * 1.02 - g * g);
      let p = project(g, -e, 0); ctx.moveTo(p[0], p[1]);
      p = project(g, e, 0); ctx.lineTo(p[0], p[1]);
      p = project(-e, g, 0); ctx.moveTo(p[0], p[1]);
      p = project(e, g, 0); ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Rejilla de alturas y proyección.
    const step = 2 / (N - 1);
    const H = new Float32Array(N * N);
    const X = new Float32Array(N * N);
    const Y = new Float32Array(N * N);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const u = -1 + i * step;
        const v = -1 + j * step;
        const h = height(u, v, m);
        const p = project(u, v, h);
        const k = i * N + j;
        H[k] = h; X[k] = p[0]; Y[k] = p[1];
      }
    }

    const order = [];
    for (let i = 0; i < N - 1; i++) {
      for (let j = 0; j < N - 1; j++) {
        const u = -1 + (i + 0.5) * step;
        const v = -1 + (j + 0.5) * step;
        if (u * u + v * v > 1.08) continue;
        order.push([i, j, u * sin + v * cos]);
      }
    }
    order.sort((a, b) => a[2] - b[2]);

    // Luz fija en pantalla (arriba-izquierda): la sombra no gira con la superficie.
    const lx = -0.62;
    const ly = -0.78;
    const fillMul = light ? 1.7 : 1;
    const lineBase = light ? 1.5 : 1;
    const tri = (a, b, c, lvl, out) => {
      const hs = [H[a], H[b], H[c]];
      const idx = [a, b, c];
      const pts = [];
      for (let e = 0; e < 3; e++) {
        const p = idx[e];
        const q = idx[(e + 1) % 3];
        const hp = hs[e];
        const hq = hs[(e + 1) % 3];
        if ((hp < lvl) !== (hq < lvl)) {
          const t = (lvl - hp) / (hq - hp);
          pts.push(lerp(X[p], X[q], t), lerp(Y[p], Y[q], t));
        }
      }
      if (pts.length === 4) out.push(pts);
    };

    for (const [i, j] of order) {
      const a = i * N + j;
      const b = (i + 1) * N + j;
      const c = (i + 1) * N + j + 1;
      const d = i * N + j + 1;
      const h = (H[a] + H[b] + H[c] + H[d]) / 4;
      const u = -1 + (i + 0.5) * step;
      const v = -1 + (j + 0.5) * step;
      const r = Math.sqrt(u * u + v * v);
      const edge = 1 - smooth(0.66, 0.97, r);
      const gu = (H[b] + H[c] - H[a] - H[d]) / (2 * step);
      const gv = (H[d] + H[c] - H[a] - H[b]) / (2 * step);
      const gx = gu * cos - gv * sin;
      const gy = gu * sin + gv * cos;
      const shade = Math.max(-1, Math.min(1, -(gx * lx + gy * ly) * 0.55));
      const ex = h - mesaHeight(u, v) * (1 - 0.06 * m);
      // El rosa marca lo que sobresale de la meseta en el periodo optimizado.
      const pink = (1 - m) * smooth(0.06, 0.4, ex);
      const hn = Math.min(1, h / 0.7);
      const al = Math.max(0, Math.min(0.9, (0.07 + 0.3 * hn + 0.32 * pink) * (1 + 0.55 * shade) * fillMul)) * edge * show * smooth(0.02, 0.14, h);
      if (al > 0.03) {
        const col = mix(surfC, mix(okC, peakC, pink), al);
        ctx.fillStyle = rgb(col);
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(X[a], Y[a]); ctx.lineTo(X[b], Y[b]); ctx.lineTo(X[c], Y[c]); ctx.lineTo(X[d], Y[d]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      const lo = Math.min(H[a], H[b], H[c], H[d]);
      const hi = Math.max(H[a], H[b], H[c], H[d]);
      for (const [lvl, cls] of LEVELS) {
        if (lvl < lo || lvl >= hi) continue;
        const segs = [];
        tri(a, b, c, lvl, segs);
        tri(a, c, d, lvl, segs);
        if (!segs.length) continue;
        ctx.beginPath();
        for (const s of segs) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); }
        if (cls === 1) {
          ctx.strokeStyle = rgb(okC); ctx.lineWidth = 1.7 * lineBase; ctx.globalAlpha = (0.55 + 0.4 * m) * edge * show;
        } else if (cls === 2) {
          ctx.strokeStyle = rgb(peakC); ctx.lineWidth = 1.2 * lineBase; ctx.globalAlpha = 0.85 * edge * show;
        } else {
          ctx.strokeStyle = rgb(mix(textC, surfC, 0.35)); ctx.lineWidth = 0.8 * lineBase; ctx.globalAlpha = (light ? 0.38 : 0.26) * edge * show;
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Marcadores: la cifra que da MT5 y la que da la meseta, en periodo optimizado / nuevo.
    const ease = m * m * (3 - 2 * m);
    const redVal = lerp(MT5_RESULT, MT5_AFTER, ease);
    const greenVal = lerp(PICK_RESULT, PICK_AFTER, ease);
    const font = (px, w = 600) => `${w} ${px}px system-ui,-apple-system,"Segoe UI",sans-serif`;
    const small = cssW < 520;
    const marker = (u, v, val, color, tag, side) => {
      const h = height(u, v, m);
      const p = project(u, v, h);
      const f = project(u, v, 0);
      ctx.globalAlpha = show;
      ctx.strokeStyle = rgb(color);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(f[0], f[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = rgb(color);
      ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgb(surfC); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, Math.PI * 2); ctx.stroke();
      const text = `${tag} · ${fmt(val)}`;
      ctx.font = font(small ? 11 : 12.5, 700);
      const tw = ctx.measureText(text).width + 16;
      const th = small ? 20 : 24;
      let bx = side > 0 ? p[0] + 12 : p[0] - 12 - tw;
      bx = Math.max(6, Math.min(cssW - tw - 6, bx));
      const by = Math.max(6, p[1] - th - 6);
      ctx.fillStyle = rgb(mix(surfC, color, light ? 0.14 : 0.2));
      ctx.strokeStyle = rgb(color);
      ctx.lineWidth = 1;
      ctx.beginPath();
      roundBox(bx, by, tw, th, 6);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = rgb(light ? mix(color, textC, 0.5) : mix(color, textC, 0.35));
      ctx.textBaseline = 'middle';
      ctx.fillText(text, bx + 8, by + th / 2 + 0.5);
      ctx.globalAlpha = 1;
    };
    marker(MESA_C.u, MESA_C.v, greenVal, okC, labels.pick || 'Orometra', -1);
    marker(PEAK_A.u, PEAK_A.v, redVal, peakC, labels.mt5 || 'MT5 #1', 1);

    // Etiquetas de ejes y del periodo.
    ctx.globalAlpha = show * 0.9;
    ctx.fillStyle = rgb(mutedC);
    ctx.font = font(small ? 10.5 : 11.5, 500);
    ctx.textBaseline = 'middle';
    const axis = (u, v, text, align) => {
      const p = project(u, v, 0);
      ctx.textAlign = align;
      const half = ctx.measureText(text).width / 2;
      ctx.fillText(text, Math.max(half + 8, Math.min(cssW - half - 8, p[0])), p[1] + 12);
    };
    axis(0, 1.08, `${labels.axisA || 'Parameter A'} × ${labels.axisB || 'Parameter B'}`, 'center');
    ctx.textAlign = 'left';
    ctx.fillText(`↑ ${labels.axisZ || 'Result'}`, 14, small ? 44 : 50);

    const pill = m > 0.5 ? (labels.periodB || 'New period') : (labels.periodA || 'Optimised period');
    ctx.font = font(small ? 11 : 12.5, 700);
    const pw = ctx.measureText(pill).width + 22;
    const px = 14;
    const py = 12;
    ctx.globalAlpha = show;
    ctx.fillStyle = rgb(mix(surfC, m > 0.5 ? okC : peakC, light ? 0.16 : 0.22));
    ctx.strokeStyle = rgb(m > 0.5 ? okC : peakC);
    ctx.beginPath(); roundBox(px, py, pw, small ? 22 : 26, 13); ctx.fill(); ctx.stroke();
    ctx.fillStyle = rgb(mix(m > 0.5 ? okC : peakC, textC, light ? 0.5 : 0.3));
    ctx.textAlign = 'left';
    ctx.fillText(pill, px + 11, py + (small ? 11.5 : 13.5));
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';

    const state = m > 0.55 ? 'plateau' : 'peaks';
    if (host.dataset.surfaceState !== state) {
      host.dataset.surfaceState = state;
      host.dispatchEvent(new CustomEvent('orometra-surface', { detail: { state }, bubbles: true }));
    }
  }

  const cycling = () => !fineHover.matches && inView && !quiet.matches && !hover;

  function targetCollapse() {
    if (quiet.matches) return 0.92;
    if (hover) return 1;
    if (!fineHover.matches && inView) {
      const wave = (Math.sin((autoT / 6400) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
      return 0.04 + Math.min(1, wave * 1.25) * 0.94;
    }
    return 0;
  }

  function frame(t) {
    const dt = last ? Math.min(64, t - last) : 16;
    last = t;
    intro = quiet.matches ? 1 : Math.min(1, intro + dt / 700);
    if (cycling()) autoT += dt;

    const want = targetCollapse();
    collapse += (want - collapse) * Math.min(1, dt / 260);
    if (!dragging && !quiet.matches && (hover || intro < 1 || cycling())) angle += dt * SPIN;
    draw();
    const moving = Math.abs(want - collapse) > 0.002 || intro < 1 || hover || cycling();
    raf = moving ? requestAnimationFrame(frame) : 0;
  }

  const wake = () => {
    if (raf || document.hidden) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  };

  const onPointerEnter = (e) => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') { hover = true; wake(); } };
  const onPointerLeave = (e) => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') { hover = false; wake(); } };
  // Solo el foco de teclado: un toque o un clic también enfocan y dejarían el «periodo nuevo» fijo.
  const onFocusIn = () => {
    let visible = true;
    try { visible = host.matches(':focus-visible'); } catch { /* selector no soportado */ }
    if (visible) { hover = true; wake(); }
  };
  const onFocusOut = () => { hover = false; wake(); };
  const onVisibility = () => { if (!document.hidden) wake(); };

  const onPointerDown = (e) => {
    dragging = true;
    dragMoved = 0;
    dragX = e.clientX;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
  };
  const onPointerMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragX;
    dragX = e.clientX;
    dragMoved += Math.abs(dx);
    angle += dx * 0.009;
    if (quiet.matches || !raf) draw();
  };
  const onPointerUp = (e) => {
    if (!dragging) return;
    dragging = false;
    if (e.type === 'pointercancel') { wake(); return; }
    // Un toque sin arrastre (táctil) lleva un momento al periodo nuevo.
    if (!fineHover.matches && dragMoved < 6) {
      hover = true;
      wake();
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => { hover = false; wake(); }, 2600);
    } else {
      wake();
    }
  };
  const onKey = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    angle += e.key === 'ArrowLeft' ? -0.12 : 0.12;
    e.preventDefault();
    if (quiet.matches || !raf) draw();
  };

  host.addEventListener('pointerenter', onPointerEnter);
  host.addEventListener('pointerleave', onPointerLeave);
  host.addEventListener('focusin', onFocusIn);
  host.addEventListener('focusout', onFocusOut);
  host.addEventListener('keydown', onKey);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  const io = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver((entries) => {
      inView = entries.some((e) => e.isIntersecting);
      if (inView) wake();
    }, { threshold: 0.35 })
    : null;
  if (io) io.observe(host);

  const repaint = () => { draw(); wake(); };
  quiet.addEventListener('change', repaint);
  fineHover.addEventListener('change', repaint);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', repaint);

  const mo = new MutationObserver(repaint);
  mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  wake();
  repaint.dispose = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    clearTimeout(tapTimer);
    mo.disconnect();
    if (io) io.disconnect();
    quiet.removeEventListener('change', repaint);
    fineHover.removeEventListener('change', repaint);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', repaint);
    host.removeEventListener('pointerenter', onPointerEnter);
    host.removeEventListener('pointerleave', onPointerLeave);
    host.removeEventListener('focusin', onFocusIn);
    host.removeEventListener('focusout', onFocusOut);
    host.removeEventListener('keydown', onKey);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
  };
  return repaint;
}
