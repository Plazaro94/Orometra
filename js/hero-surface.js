// Superficie hero: la tesis de Orometra a escala de producto.
// Relieve con luz, sombras y curvas de nivel. Al pasar el ratón (o solo, en táctil) se ve el MISMO
// resultado en un periodo de mercado nuevo: el pico que MT5 pone primero se desmorona (queda su
// silueta fantasma) y la meseta que recomienda Orometra aguanta. Arrastrar gira la superficie.
//
// El relieve se dibuja en WebGL (hero-surface-gl.js) en un lienzo por debajo; sin WebGL, con un
// dibujo 2D más sencillo del mismo modelo (hero-terrain.js). Las etiquetas van siempre en el
// lienzo 2D de encima, con la tipografía de la web.
//
// Las dos cifras de los marcadores (4.71 y 2.18) son las de la tabla de ejemplo de la portada
// (sección del problema); tests/hero-surface.test.js comprueba que coinciden.

import { MESA_C, PEAK_A, RIM_Q, height, peakA, terrain, smooth } from './hero-terrain.js';
import { createTerrainGL } from './hero-surface-gl.js';

export { height };
export const MT5_RESULT = 4.71;
export const PICK_RESULT = 2.18;
const MT5_AFTER = 1.30;
const PICK_AFTER = 2.05;

const SPIN = 0.00022;
const YS = 0.5; // unidades de mundo por unidad de altura
const PITCH = 0.47; // inclinación de la cámara (rad)
const CAM_D = 3.8; // distancia de la cámara: perspectiva suave
// Luz fija respecto a la cámara (arriba a la izquierda, algo por delante): la sombra no gira con
// la superficie.
const LIGHT_VIEW = (() => {
  const l = [-0.62, 0.45, 0.64];
  const k = Math.hypot(...l);
  return l.map((x) => x / k);
})();
// Calidad del WebGL: si los fotogramas van lentos se baja un escalón (resolución y sombras).
const TIERS = [{ dpr: 1.25, steps: 0 }, { dpr: 1.6, steps: 10 }, { dpr: 2, steps: 16 }];

const SANS = '"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif';
const MONO = '"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace';

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
const rgba = (c, a) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];

function readPalette(root, light) {
  const bg = parseColor(cssColor(root, '--surface', light ? '#ffffff' : '#0d1322'), light ? [255, 255, 255] : [13, 19, 34]);
  const ok = parseColor(cssColor(root, '--ok', light ? '#0b6a73' : '#3ed7d0'), light ? [11, 106, 115] : [62, 215, 208]);
  const peak = parseColor(cssColor(root, '--peak', light ? '#9b2f52' : '#f07fa8'), light ? [155, 47, 82] : [240, 127, 168]);
  const text = parseColor(cssColor(root, '--text', light ? '#14181d' : '#eaf1f9'), light ? [20, 24, 29] : [234, 241, 249]);
  const muted = parseColor(cssColor(root, '--muted-3', light ? '#51565d' : '#96a2b4'), light ? [81, 86, 93] : [150, 162, 180]);
  if (light) {
    return {
      light, bg, ok, peak, text, muted,
      low: mix(bg, ok, 0.16),
      high: mix(bg, ok, 0.46),
      peakFill: mix(bg, peak, 0.62),
      bump: mix(bg, muted, 0.3),
      ink: text,
      rim: ok,
      spec: mix(BLACK, WHITE, 0.3),
      look: [0.5, 0.28, 0.42, 0.1],
    };
  }
  return {
    light, bg, ok, peak, text, muted,
    low: mix(bg, ok, 0.12),
    high: mix(bg, ok, 0.62),
    peakFill: mix(bg, peak, 0.82),
    bump: mix(bg, muted, 0.42),
    ink: text,
    rim: mix(ok, WHITE, 0.12),
    spec: mix(BLACK, mix(ok, WHITE, 0.5), 0.35),
    look: [0.18, 0.3, 0.85, 0.5],
  };
}

// Cámara que orbita el centro. Devuelve la proyección a píxeles CSS y lo que necesita el WebGL.
// El encuadre se ajusta con dos anillos (el suelo con sus etiquetas y la altura de los picos),
// que no cambian al girar: el tamaño no «respira» con la rotación.
function makeView(cssW, cssH, capH, yaw, pitch, rise) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const raw = (u, v, y) => {
    const xr = u * c - v * s;
    const zr = u * s + v * c;
    const yv = y * cp - zr * sp;
    const zv = y * sp + zr * cp;
    const k = CAM_D / (CAM_D - zv);
    return [xr * k, -yv * k, CAM_D - zv];
  };
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  for (const [R, y] of [[1.26, 0], [0.74, 1.42 * YS]]) {
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const p = raw(R * Math.cos(a), R * Math.sin(a), y);
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
      y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
    }
  }
  const small = cssW < 520;
  const top = small ? 50 : 58;
  const bottom = cssH - capH - 4;
  const left = 12;
  const right = cssW - 12;
  const S = Math.max(1, Math.min((right - left) / (x1 - x0), (bottom - top) / (y1 - y0)));
  const ox = left + (right - left - S * (x1 - x0)) / 2 - S * x0;
  const oy = top + (bottom - top - S * (y1 - y0)) / 2 - S * y0;
  const project = (u, v, h) => {
    const p = raw(u, v, h * YS * rise);
    return [ox + S * p[0], oy + S * p[1], p[2]];
  };
  // De la vista al mundo (para la luz y la posición de la cámara).
  const toWorld = (xv, yv, zv) => {
    const y = yv * cp + zv * sp;
    const zr = -yv * sp + zv * cp;
    return [xv * c + zr * s, y, -xv * s + zr * c];
  };
  return {
    c, s, cp, sp, S, ox, oy, D: CAM_D, YS, cssW, cssH, capH, small, project,
    cam: toWorld(0, 0, CAM_D),
    light: toWorld(...LIGHT_VIEW),
  };
}

export function mountHeroSurface(canvas, opts = {}) {
  if (!canvas || !canvas.getContext) return () => {};
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const quiet = matchMedia('(prefers-reduced-motion: reduce)');
  const fineHover = matchMedia('(hover: hover) and (pointer: fine)');
  const host = canvas.closest('.lp-surface') || canvas.parentElement || canvas;
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
  // Inclinación que sigue al ratón (unos grados): profundidad sin tener que arrastrar.
  let aimX = 0; let aimY = 0; let tiltX = 0; let tiltY = 0;
  let palette = null;
  let tier = 2;
  let slow = 0;

  // El relieve en WebGL, en un lienzo por debajo del de las etiquetas.
  let glCanvas = document.createElement('canvas');
  glCanvas.className = 'lp-surface-gl';
  glCanvas.setAttribute('aria-hidden', 'true');
  canvas.parentNode.insertBefore(glCanvas, canvas);
  const narrow = () => canvas.getBoundingClientRect().width < 520;
  let gl = createTerrainGL(glCanvas, {
    detail: narrow() ? 168 : 224,
    onLost: () => {
      gl = null;
      if (glCanvas) glCanvas.remove();
      glCanvas = null;
      draw();
    },
  });
  if (!gl) {
    glCanvas.remove();
    glCanvas = null;
  }

  const size = () => {
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width) || 560);
    const cssH = Math.max(1, Math.round(rect.height) || 420);
    const dpr = Math.min(cssW < 520 ? 2 : 2.25, devicePixelRatio || 1);
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

  // Sin WebGL: el mismo relieve con cuadros ordenados de atrás adelante.
  function paint2D(v, pal, m, show, still) {
    const N = v.small ? (still ? 60 : 44) : (still ? 96 : 64);
    const step = 2 / (N - 1);
    const H = new Float32Array(N * N);
    const Q = new Float32Array(N * N);
    const PK = new Float32Array(N * N);
    const BP = new Float32Array(N * N);
    const X = new Float32Array(N * N);
    const Y = new Float32Array(N * N);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const u = -1 + i * step;
        const w = -1 + j * step;
        const t = terrain(u, w, m);
        const k = i * N + j;
        const p = v.project(u, w, t.h);
        H[k] = t.h * v.rise; Q[k] = t.q; PK[k] = t.pk * v.rise; BP[k] = t.bp * v.rise;
        X[k] = p[0]; Y[k] = p[1];
      }
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(pal.ink, (pal.light ? 0.3 : 0.22) * show);
    ctx.beginPath();
    for (let a = 0; a <= 96; a++) {
      const p = v.project(Math.cos((a / 96) * Math.PI * 2) * 1.04, Math.sin((a / 96) * Math.PI * 2) * 1.04, 0);
      if (a === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();

    const order = [];
    for (let i = 0; i < N - 1; i++) {
      for (let j = 0; j < N - 1; j++) {
        const u = -1 + (i + 0.5) * step;
        const w = -1 + (j + 0.5) * step;
        if (u * u + w * w > 1) continue;
        order.push([i, j, u * v.s + w * v.c]);
      }
    }
    order.sort((a, b) => a[2] - b[2]);

    // Un tramo de la curva F = lvl dentro del triángulo (a, b, c), añadido al trazo actual.
    const tri = (F, a, b, c, lvl) => {
      const ia = F[a] < lvl; const ib = F[b] < lvl; const ic = F[c] < lvl;
      if (ia === ib && ib === ic) return;
      let n = 0; let x0 = 0; let y0 = 0;
      const edge = (p, q) => {
        const t = (lvl - F[p]) / (F[q] - F[p]);
        const x = X[p] + (X[q] - X[p]) * t;
        const y = Y[p] + (Y[q] - Y[p]) * t;
        if (n === 0) { x0 = x; y0 = y; n = 1; } else { ctx.moveTo(x0, y0); ctx.lineTo(x, y); n = 2; }
      };
      if (ia !== ib) edge(a, b);
      if (ib !== ic) edge(b, c);
      if (ic !== ia && n < 2) edge(c, a);
    };

    const lx = -0.62; const ly = -0.78;
    ctx.lineCap = 'round';
    for (const [i, j] of order) {
      const a = i * N + j; const b = (i + 1) * N + j; const c = (i + 1) * N + j + 1; const d = i * N + j + 1;
      const h = (H[a] + H[b] + H[c] + H[d]) / 4;
      if (h < 0.004) continue;
      const gu = (H[b] + H[c] - H[a] - H[d]) / (2 * step);
      const gv = (H[c] + H[d] - H[a] - H[b]) / (2 * step);
      const gx = gu * v.c - gv * v.s;
      const gy = gu * v.s + gv * v.c;
      const shade = Math.max(-1, Math.min(1, -(gx * lx + gy * ly) * 0.5));
      const pink = smooth(0.04, 0.3, (PK[a] + PK[c]) / 2);
      const bump = smooth(0.03, 0.16, (BP[a] + BP[c]) / 2);
      let col = mix(pal.low, pal.high, smooth(0, 0.75, h));
      col = mix(col, pal.bump, bump);
      col = mix(col, pal.peakFill, pink);
      col = mix(pal.bg, pal.light ? mix(col, BLACK, Math.max(0, -shade) * 0.25) : mix(col, WHITE, Math.max(0, shade) * 0.18), smooth(0.004, 0.045, h) * (0.75 + 0.25 * shade));
      ctx.fillStyle = rgb(col);
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(X[a], Y[a]); ctx.lineTo(X[b], Y[b]); ctx.lineTo(X[c], Y[c]); ctx.lineTo(X[d], Y[d]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const lo = Math.min(H[a], H[b], H[c], H[d]);
      const hi = Math.max(H[a], H[b], H[c], H[d]);
      // En la cima de la meseta no hay curvas: la única línea es su contorno.
      const onTop = Math.min(Q[a], Q[c]) < RIM_Q + 0.12;
      for (let lvl = 0.07; lvl < hi && !onTop; lvl += 0.07) {
        if (lvl < lo) continue;
        ctx.beginPath();
        tri(H, a, b, c, lvl);
        tri(H, a, c, d, lvl);
        ctx.strokeStyle = rgb(mix(col, pink > 0.5 ? pal.peak : pal.ink, 0.22 + 0.3 * pink));
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    // Contorno de la meseta, en una pasada limpia por encima.
    ctx.strokeStyle = rgba(pal.rim, (0.82 + 0.18 * m) * show);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (const [i, j] of order) {
      const a = i * N + j; const b = (i + 1) * N + j; const c = (i + 1) * N + j + 1; const d = i * N + j + 1;
      tri(Q, a, b, c, RIM_Q);
      tri(Q, a, c, d, RIM_Q);
    }
    ctx.stroke();
  }

  // Etiquetas: silueta fantasma del pico caído, marcadores, ejes y el periodo.
  function annotate(v, pal, m, show) {
    const labels = getLabels();
    const small = v.small;
    const { project } = v;
    const textC = pal.text;
    const obstacles = [];
    ctx.textBaseline = 'middle';

    // Periodo (arriba a la izquierda) y eje vertical.
    const pill = m > 0.5 ? (labels.periodB || 'New period') : (labels.periodA || 'Optimised period');
    const pillC = m > 0.5 ? pal.ok : pal.peak;
    ctx.font = `600 ${small ? 11.5 : 12.5}px ${SANS}`;
    const pw = ctx.measureText(pill).width + 24;
    const ph = small ? 24 : 27;
    ctx.globalAlpha = show;
    ctx.fillStyle = rgb(mix(pal.bg, pillC, pal.light ? 0.1 : 0.16));
    ctx.strokeStyle = rgb(mix(pal.bg, pillC, 0.75));
    ctx.lineWidth = 1;
    ctx.beginPath(); roundBox(14.5, 12.5, pw, ph, ph / 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = rgb(mix(pillC, textC, pal.light ? 0.45 : 0.3));
    ctx.textAlign = 'left';
    ctx.fillText(pill, 26.5, 12.5 + ph / 2 + 0.5);
    obstacles.push([14, 12, pw + 1, ph + 1]);
    ctx.font = `500 ${small ? 11 : 12}px ${SANS}`;
    ctx.fillStyle = rgb(pal.muted);
    const z = `↑ ${labels.axisZ || 'Result'}`;
    ctx.fillText(z, 16, 12 + ph + 14);
    obstacles.push([14, 12 + ph + 5, ctx.measureText(z).width + 6, 18]);

    const ease = m * m * (3 - 2 * m);

    // Donde estaba el pico: su silueta a trazos, que aparece mientras cae.
    const ghost = smooth(0.15, 0.7, m) * show;
    if (ghost > 0.01) {
      const tu = v.c; const tv = -v.s; // horizontal en pantalla
      ctx.beginPath();
      for (let k = -30; k <= 30; k++) {
        const sd = (k / 30) * 0.3;
        const u = PEAK_A[0] + tu * sd;
        const w = PEAK_A[1] + tv * sd;
        const p = project(u, w, height(u, w, m) - peakA(u, w, m) + peakA(u, w, 0));
        if (k === -30) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
      }
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = rgba(pal.peak, 0.8 * ghost);
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const markers = [
      { at: MESA_C, val: lerp(PICK_RESULT, PICK_AFTER, ease), color: pal.ok, tag: labels.pick || 'Orometra', side: -1 },
      { at: PEAK_A, val: lerp(MT5_RESULT, MT5_AFTER, ease), color: pal.peak, tag: labels.mt5 || 'MT5 #1', side: 1 },
    ];
    // Cuánto tapa el relieve un punto: se recorre el rayo hacia la cámara y se mide lo que más
    // se mete bajo el terreno (suave, para que no parpadee al girar).
    const [camX, camY, camZ] = v.cam;
    const cover = (u, w, h) => {
      const y0 = h * YS * v.rise;
      let pen = 0;
      for (let k = 1; k <= 48; k++) {
        const t = (k / 48) * 0.6;
        const x = u + (camX - u) * t;
        const z = w + (camZ - w) * t;
        if (x * x + z * z > 1.1) break;
        pen = Math.max(pen, height(x, z, m) * YS * v.rise - (y0 + (camY - y0) * t));
      }
      return smooth(0, 0.03, pen);
    };
    for (const mk of markers) {
      const h = height(mk.at[0], mk.at[1], m);
      mk.p = project(mk.at[0], mk.at[1], h);
      mk.f = project(mk.at[0], mk.at[1], 0);
      mk.vis = 1 - 0.7 * cover(mk.at[0], mk.at[1], h);
    }

    // Tallos y puntos (tenues si quedan detrás del relieve).
    for (const mk of markers) {
      ctx.globalAlpha = show * mk.vis;
      ctx.strokeStyle = rgba(mk.color, 0.75);
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(mk.f[0], mk.f[1]); ctx.lineTo(mk.p[0], mk.p[1]); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = rgba(mk.color, pal.light ? 0.16 : 0.22);
      ctx.beginPath(); ctx.arc(mk.p[0], mk.p[1], 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgb(mk.color);
      ctx.strokeStyle = rgb(pal.bg);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mk.p[0], mk.p[1], 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    // Cajas con la cifra, unidas al punto por una línea; se colocan donde no tapen nada.
    const fs = small ? 11.5 : 12.5;
    const th = small ? 23 : 26;
    const hits = (r, o) => r[0] < o[0] + o[2] && r[0] + r[2] > o[0] && r[1] < o[1] + o[3] && r[1] + r[3] > o[1];
    for (const mk of markers) {
      mk.value = fmt(mk.val);
      ctx.font = `600 ${fs}px ${SANS}`;
      mk.lw = ctx.measureText(mk.tag).width;
      ctx.font = `600 ${fs}px ${MONO}`;
      const tw = Math.round(mk.lw + ctx.measureText(mk.value).width + 26);
      const [px, py] = mk.p;
      const spots = [];
      for (const up of [true, false]) {
        for (const side of [mk.side, -mk.side]) {
          const bx = side > 0 ? px + 12 : px - 12 - tw;
          const by = up ? py - th - 14 : py + 14;
          spots.push([Math.max(8, Math.min(v.cssW - tw - 8, bx)), Math.max(8, Math.min(v.cssH - v.capH - th - 4, by)), tw, th, up]);
        }
      }
      mk.box = spots.find((r) => !obstacles.some((o) => hits(r, o))) || spots[0];
      obstacles.push(mk.box);
    }

    // Ejes de parámetros: giran con el suelo. Por detrás del relieve se apagan (quedarían encima
    // de los picos), y ceden el sitio a las cajas de cifras.
    ctx.font = `500 ${small ? 11 : 12}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = rgb(pal.muted);
    for (const [u, w, text] of [[1.2, 0, labels.axisA || 'Parameter A'], [0, 1.2, labels.axisB || 'Parameter B']]) {
      const a = show * smooth(-0.3, 0.15, (u * v.s + w * v.c) / 1.2);
      if (a < 0.02) continue;
      const p = project(u, w, 0);
      const tw = ctx.measureText(text).width;
      const x = Math.max(tw / 2 + 8, Math.min(v.cssW - tw / 2 - 8, p[0]));
      const y = Math.min(p[1] + 3, v.cssH - v.capH - 8);
      if (markers.some((mk) => hits([x - tw / 2 - 4, y - 9, tw + 8, 18], mk.box))) continue;
      ctx.globalAlpha = 0.9 * a;
      ctx.fillText(text, x, y);
    }

    ctx.globalAlpha = show;
    for (const mk of markers) {
      const [bx, by, tw, , up] = mk.box;
      const [px, py] = mk.p;
      ctx.strokeStyle = rgba(mk.color, 0.7);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, py + (up ? -6 : 6));
      ctx.lineTo(Math.max(bx + 10, Math.min(bx + tw - 10, px)), up ? by + th : by);
      ctx.stroke();
      ctx.fillStyle = rgb(mix(pal.bg, mk.color, pal.light ? 0.1 : 0.16));
      ctx.strokeStyle = rgb(mix(pal.bg, mk.color, 0.8));
      ctx.beginPath(); roundBox(bx + 0.5, by + 0.5, tw, th, 7); ctx.fill(); ctx.stroke();
      ctx.textAlign = 'left';
      ctx.font = `600 ${fs}px ${SANS}`;
      ctx.fillStyle = rgb(mix(mk.color, textC, pal.light ? 0.45 : 0.3));
      ctx.fillText(mk.tag, bx + 11, by + th / 2 + 1);
      ctx.font = `600 ${fs}px ${MONO}`;
      ctx.fillStyle = rgb(pal.light ? mix(mk.color, textC, 0.7) : mix(mk.color, WHITE, 0.6));
      ctx.fillText(mk.value, bx + 15 + mk.lw, by + th / 2 + 1);
    }
    ctx.globalAlpha = 1;
  }

  function draw(still = true) {
    const { dpr, cssW, cssH } = size();
    const light = (root.dataset.theme || 'dark') === 'light';
    if (!palette || palette.light !== light) palette = readPalette(root, light);
    const m = collapse;
    const rise = quiet.matches ? 1 : 1 - (1 - intro) ** 3;
    const show = quiet.matches ? 1 : smooth(0.35, 1, intro);
    // El pie (textos de abajo) se superpone al lienzo y su alto cambia con el ancho y el idioma.
    const cap = host.querySelector('.lp-surface-caption');
    const capH = cap ? cap.offsetHeight + 4 : 74;
    const v = makeView(cssW, cssH, capH, angle + tiltX, PITCH + tiltY, rise);
    v.rise = rise;

    if (gl && glCanvas) {
      const q = TIERS[tier];
      const gdpr = Math.min(q.dpr, devicePixelRatio || 1);
      gl.draw({
        width: Math.round(cssW * gdpr), height: Math.round(cssH * gdpr),
        view: v, m, rise, show, steps: q.steps, palette: { ...palette, peak: palette.peakFill },
      });
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    if (!gl) paint2D(v, palette, m, show, still);
    annotate(v, palette, m, show);

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
    // Si el WebGL no llega a ~35 fps de forma sostenida, se baja un escalón de calidad.
    if (last && gl) {
      slow = t - last > 28 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 40 && tier > 0) { tier--; slow = 0; }
    }
    last = t;
    intro = quiet.matches ? 1 : Math.min(1, intro + dt / 1400);
    if (cycling()) autoT += dt;

    const want = targetCollapse();
    collapse += (want - collapse) * Math.min(1, dt / 300);
    const k = Math.min(1, dt / 260);
    tiltX += (aimX - tiltX) * k;
    tiltY += (aimY - tiltY) * k;
    if (!dragging && !quiet.matches && (hover || intro < 1 || cycling())) angle += dt * SPIN;
    const tilting = Math.abs(aimX - tiltX) > 1e-4 || Math.abs(aimY - tiltY) > 1e-4;
    const moving = Math.abs(want - collapse) > 0.002 || intro < 1 || hover || cycling() || dragging || tilting;
    draw(!moving);
    raf = moving ? requestAnimationFrame(frame) : 0;
  }

  const wake = () => {
    if (raf || document.hidden) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  };

  const onPointerEnter = (e) => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') { hover = true; wake(); } };
  const onPointerLeave = (e) => {
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      hover = false;
      aimX = 0; aimY = 0;
      wake();
    }
  };
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
    if (!dragging) {
      if (e.pointerType !== 'mouse' || quiet.matches) return;
      const r = canvas.getBoundingClientRect();
      aimX = ((e.clientX - r.left) / r.width - 0.5) * 0.24;
      aimY = ((e.clientY - r.top) / r.height - 0.5) * -0.08;
      wake();
      return;
    }
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

  const onTheme = () => { palette = null; repaint(); };
  const mo = new MutationObserver(onTheme);
  mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  // Las etiquetas usan IBM Plex: al terminar de cargar, se vuelven a dibujar con ella.
  if (document.fonts && document.fonts.load) {
    Promise.all([`600 12px "IBM Plex Sans"`, `500 12px "IBM Plex Sans"`, `600 12px "IBM Plex Mono"`].map((f) => document.fonts.load(f)))
      .then(() => { if (!raf) draw(); })
      .catch(() => { /* se queda la tipografía del sistema */ });
  }

  wake();
  repaint.dispose = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    clearTimeout(tapTimer);
    mo.disconnect();
    if (io) io.disconnect();
    if (gl) gl.dispose();
    if (glCanvas) glCanvas.remove();
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
