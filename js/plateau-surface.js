// Superficie isométrica de una meseta real: mismo lenguaje visual que el relieve
// de la portada (js/hero-surface.js: luz, paleta y banderín), pero con datos de
// verdad en vez de una fórmula. Los datos son discretos (niveles probados de dos parámetros), así
// que se dibuja como barras isométricas —un histograma 3D—, no como una malla
// continua: interpolar entre niveles reales inventaría valores que nadie
// probó.
//
// Entrada: la rejilla de core/surface.js#buildAxisPairGrid. Una celda `null`
// (sin pasada real ahí, con el resto de parámetros fijos) no se dibuja: es un
// hueco visible en la superficie, no una barra a cero.

function cssColor(el, name, fallback) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

/**
 * Monta la superficie en `canvas`. `grid` es el objeto de buildAxisPairGrid.
 * `onHover(cell|null, a, b)` se llama al pasar el ratón sobre una celda (o al
 * salir, con null), para que la interfaz pueda mostrar el detalle a un lado.
 * Devuelve `{ destroy(), setGrid(nuevaRejilla) }`.
 */
export function mountPlateauSurface(canvas, grid, { onHover, label } = {}) {
  if (!canvas || !canvas.getContext) return { destroy() {}, setGrid() {} };
  const ctx = canvas.getContext('2d', { alpha: false });
  const root = document.documentElement;
  const quiet = matchMedia('(prefers-reduced-motion: reduce)');

  let data = grid;
  let repLabel = label || '';
  let angle = -0.72;
  let raf = 0;
  let dragging = false;
  let dragX = 0;
  let hoverCell = null; // {a,b}
  let inView = true;

  const size = () => {
    const dpr = Math.min(2.25, devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width) || 480);
    const cssH = Math.max(1, Math.round(rect.height) || 320);
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return { dpr, cssW, cssH };
  };

  const parse = (str, fb) => {
    const t = String(str || '').trim();
    let m = /^#([0-9a-f]{6})/i.exec(t);
    if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
    m = /^#([0-9a-f]{3})$/i.exec(t);
    if (m) return [...m[1]].map((c) => parseInt(c + c, 16));
    m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(t);
    return m ? [+m[1], +m[2], +m[3]] : fb;
  };
  const mix = (a, b, t) => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t);
  const rgb = (c) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
  const WHITE = [255, 255, 255];
  const BLACK = [0, 0, 0];
  const SANS = '"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif';

  // La misma paleta que el relieve de la portada: el turquesa es solo de la meseta y
  // se intensifica con la calidad; el resto es neutro.
  function theme() {
    const isLight = root.dataset.theme === 'light';
    const bg = parse(cssColor(root, '--surface', isLight ? '#ffffff' : '#1b212f'), isLight ? [255, 255, 255] : [27, 33, 47]);
    const ok = parse(cssColor(root, '--ok', isLight ? '#1f58ad' : '#74a6f1'), isLight ? [31, 88, 173] : [116, 166, 241]);
    const muted = parse(cssColor(root, '--muted-3', isLight ? '#51565d' : '#96a2b4'), [150, 162, 180]);
    const text = parse(cssColor(root, '--text', isLight ? '#14181d' : '#eaf1f9'), [234, 241, 249]);
    return {
      isLight, bg, ok, muted, text,
      bg2: parse(cssColor(root, '--surface-2', isLight ? '#eef1f5' : '#131c2f'), [19, 28, 47]),
      line: parse(cssColor(root, '--line', isLight ? '#d9dee5' : '#24314a'), [36, 49, 74]),
      // Tono de la cara superior según la calidad (t de 0 a 1).
      plateauTop: (t) => (isLight ? mix(mix(bg, ok, 0.35), ok, t) : mix(mix(bg, ok, 0.4), mix(ok, WHITE, 0.15), t)),
      groundTop: (t) => (isLight ? mix(mix(bg, muted, 0.16), mix(bg, muted, 0.42), t) : mix(mix(bg, [120, 138, 168], 0.22), mix(bg, [150, 168, 196], 0.5), t)),
    };
  }

  // Geometría compartida por el dibujo y la detección del ratón.
  function layout(cssW, cssH) {
    const cx = cssW * 0.5;
    const cy = cssH * 0.62;
    // La diagonal del suelo girado mide ~3 veces la escala: cabe a lo ancho con margen
    // para los nombres de los ejes.
    const scale = Math.max(40, Math.min((cssW - 48) / 3.1, cssH * 0.46));
    return { cx, cy, scale };
  }

  function project(cx, cy, scale, u, v, h) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = u * cos - v * sin;
    const y = u * sin + v * cos;
    return [cx + x * scale, cy + y * scale * 0.46 - h * scale * 0.72];
  }

  function draw() {
    if (!data) return;
    const { dpr, cssW, cssH } = size();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const th = theme();

    ctx.fillStyle = rgb(th.bg);
    ctx.fillRect(0, 0, cssW, cssH);
    const wash = ctx.createRadialGradient(cssW * 0.5, cssH * 0.45, cssH * 0.05, cssW * 0.5, cssH * 0.55, cssW * 0.7);
    wash.addColorStop(0, rgb(th.bg2));
    wash.addColorStop(1, rgb(th.bg));
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, cssW, cssH);

    const { grid: cells, levelsA, levelsB, repCell, names } = data;
    const nA = levelsA.length;
    const nB = levelsB.length;
    if (!nA || !nB) return;

    const { cx, cy, scale } = layout(cssW, cssH);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const stepU = 2 / nA;
    const stepV = 2 / nB;
    const u0 = (a) => -1 + a * stepU;
    const v0 = (b) => -1 + b * stepV;
    const P = (u, v, h) => project(cx, cy, scale, u, v, h);

    // Suelo: base, rejilla de celdas y una sombra suave bajo las barras.
    const plate = [[-1.06, -1.06], [1.06, -1.06], [1.06, 1.06], [-1.06, 1.06]].map(([u, v]) => P(u, v, 0));
    ctx.beginPath();
    plate.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = rgb(mix(th.bg, th.isLight ? th.muted : BLACK, th.isLight ? 0.06 : 0.25));
    ctx.fill();
    ctx.strokeStyle = rgb(mix(th.bg, th.line, 0.9));
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    for (let a = 1; a < nA; a++) { const p1 = P(u0(a), -1, 0); const p2 = P(u0(a), 1, 0); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); }
    for (let b = 1; b < nB; b++) { const p1 = P(-1, v0(b), 0); const p2 = P(1, v0(b), 0); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); }
    ctx.strokeStyle = rgb(mix(th.bg, th.line, 0.5));
    ctx.stroke();

    // Barras, de atrás adelante. Un pequeño hueco entre ellas para que se lean como
    // pasadas sueltas, no como un bloque.
    const gap = 0.08;
    const bars = [];
    let qMin = Infinity;
    let qMax = -Infinity;
    for (let b = 0; b < nB; b++) {
      for (let a = 0; a < nA; a++) {
        const cell = cells[b][a];
        if (!cell) continue; // hueco: no se dibuja nada, ni a altura 0
        if (cell.inPlateau) { qMin = Math.min(qMin, cell.quality); qMax = Math.max(qMax, cell.quality); }
        const uc = u0(a) + stepU / 2;
        const vc = v0(b) + stepV / 2;
        bars.push({ a, b, cell, uc, vc, depth: uc * sin + vc * cos });
      }
    }
    bars.sort((x, y) => x.depth - y.depth);
    const qSpan = qMax > qMin ? qMax - qMin : 0;
    let allMin = Infinity;
    let allMax = -Infinity;
    for (const bar of bars) { allMin = Math.min(allMin, bar.cell.quality); allMax = Math.max(allMax, bar.cell.quality); }
    const allSpan = allMax > allMin ? allMax - allMin : 1;

    // Luz fija en pantalla, arriba a la izquierda: las caras que miran a la izquierda
    // se ven más claras.
    const face = (pts, col) => {
      ctx.beginPath();
      pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = rgb(col);
      ctx.fill();
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    };
    let rep = null;
    for (const bar of bars) {
      const { a, b, cell, uc, vc } = bar;
      const h = Math.max(0.02, Math.min(1, cell.quality));
      const hu = (stepU * (1 - gap)) / 2;
      const hv = (stepV * (1 - gap)) / 2;
      const c = [[uc - hu, vc - hv], [uc + hu, vc - hv], [uc + hu, vc + hv], [uc - hu, vc + hv]];
      const base = c.map(([u, v]) => P(u, v, 0));
      const top = c.map(([u, v]) => P(u, v, h));
      const t = cell.inPlateau ? (qSpan ? (cell.quality - qMin) / qSpan : 1) : (cell.quality - allMin) / allSpan;
      const topCol = cell.inPlateau ? th.plateauTop(t) : th.groundTop(t);
      // Caras laterales visibles: la normal exterior apunta hacia quien mira.
      const sides = [
        { k: [1, 2], nx: cos, nz: sin }, // +u
        { k: [3, 0], nx: -cos, nz: -sin }, // -u
        { k: [2, 3], nx: -sin, nz: cos }, // +v
        { k: [0, 1], nx: sin, nz: -cos }, // -v
      ];
      for (const sd of sides) {
        if (sd.nz <= 0.001) continue;
        const lit = 0.5 + 0.5 * Math.max(-1, Math.min(1, -sd.nx));
        const col = th.isLight ? mix(topCol, BLACK, 0.28 - 0.16 * lit) : mix(topCol, BLACK, 0.55 - 0.25 * lit);
        const [i, j] = sd.k;
        face([top[i], top[j], base[j], base[i]], col);
      }
      face(top, th.isLight ? topCol : mix(topCol, WHITE, 0.06));
      const isRep = repCell[0] === a && repCell[1] === b;
      const isHover = hoverCell && hoverCell.a === a && hoverCell.b === b;
      if (isHover && !isRep) {
        ctx.beginPath();
        top.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.strokeStyle = rgb(th.text);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      if (isRep) rep = { top: P(uc, vc, h), outline: top };
    }

    // Nombres de los ejes, junto a los dos bordes del suelo más cercanos.
    ctx.font = `500 12px ${SANS}`;
    ctx.fillStyle = rgb(th.muted);
    ctx.textBaseline = 'middle';
    const edgeLabel = (u1, v1, u2, v2, text) => {
      const m = P((u1 + u2) / 2, (v1 + v2) / 2, 0);
      const toward = [(m[0] - cx), (m[1] - cy)];
      const len = Math.hypot(...toward) || 1;
      const tw = ctx.measureText(text).width;
      let x = m[0] + (toward[0] / len) * 16;
      const y = Math.min(cssH - 10, m[1] + (toward[1] / len) * 14);
      // Se coloca centrado en su borde y se mete dentro del lienzo si se sale.
      x = Math.max(8 + tw / 2, Math.min(cssW - 8 - tw / 2, x));
      ctx.textAlign = 'center';
      ctx.fillText(text, x, y);
    };
    // Los bordes cuyo centro queda más abajo en pantalla son los de delante.
    const edgesU = [[-1.06, -1.06, 1.06, -1.06], [-1.06, 1.06, 1.06, 1.06]];
    const edgesV = [[-1.06, -1.06, -1.06, 1.06], [1.06, -1.06, 1.06, 1.06]];
    const front = (e) => P((e[0] + e[2]) / 2, (e[1] + e[3]) / 2, 0)[1];
    const eu = edgesU.sort((x, y) => front(y) - front(x))[0];
    const ev = edgesV.sort((x, y) => front(y) - front(x))[0];
    if (names) {
      edgeLabel(...eu, names[0]);
      edgeLabel(...ev, names[1]);
    }

    // La pasada elegida: el banderín de la portada (palo fino y remate de 2 px).
    if (rep) {
      ctx.beginPath();
      rep.outline.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.strokeStyle = rgb(th.isLight ? th.ok : mix(th.ok, WHITE, 0.3));
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const [x, y] = rep.top;
      const stick = 34;
      ctx.strokeStyle = rgb(th.ok);
      ctx.lineWidth = 1.25;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - stick); ctx.stroke();
      ctx.fillStyle = rgb(th.ok);
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      if (repLabel) {
        ctx.font = `600 12px ${SANS}`;
        const tw = ctx.measureText(repLabel).width + 20;
        const bh = 24;
        const bx = Math.max(6, Math.min(cssW - tw - 6, x - 12));
        const by = Math.max(6, y - stick - bh);
        ctx.fillStyle = rgb(mix(th.bg, th.ok, th.isLight ? 0.1 : 0.16));
        ctx.strokeStyle = rgb(mix(th.bg, th.ok, 0.8));
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx + 0.5, by + 0.5, tw, bh, 7); else ctx.rect(bx + 0.5, by + 0.5, tw, bh);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = rgb(mix(th.ok, th.text, th.isLight ? 0.45 : 0.3));
        ctx.textAlign = 'left';
        ctx.fillText(repLabel, bx + 10, by + bh / 2 + 0.5);
      }
    }
  }

  function loop() {
    raf = 0;
    draw();
    if (dragging || !quiet.matches) {
      // Sin animación continua salvo mientras se arrastra: es un dato, no un
      // anuncio; no hace falta que gire solo.
    }
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(loop); }

  function cellAt(clientX, clientY) {
    if (!data) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const { grid: cells, levelsA, levelsB } = data;
    const nA = levelsA.length;
    const nB = levelsB.length;
    const { cx, cy, scale } = layout(rect.width, rect.height);
    const stepU = 2 / nA;
    const stepV = 2 / nB;
    let best = null;
    let bestD = Infinity;
    for (let b = 0; b < nB; b++) {
      for (let a = 0; a < nA; a++) {
        const cell = cells[b][a];
        if (!cell) continue;
        const u = -1 + (a + 0.5) * stepU;
        const v = -1 + (b + 0.5) * stepV;
        const h = Math.max(0.02, Math.min(1, cell.quality));
        const [px, py] = project(cx, cy, scale, u, v, h);
        const d = (px - x) ** 2 + (py - y) ** 2;
        if (d < bestD) { bestD = d; best = { a, b, cell }; }
      }
    }
    // Umbral: no marcar nada si el ratón está lejos de cualquier barra.
    return bestD < (scale * 0.5) ** 2 ? best : null;
  }

  function onMove(e) {
    if (dragging) {
      const dx = e.clientX - dragX;
      dragX = e.clientX;
      angle += dx * 0.008;
      schedule();
      return;
    }
    selectAt(e.clientX, e.clientY);
  }
  function selectAt(x, y) {
    const hit = cellAt(x, y);
    const changed = (hit ? `${hit.a},${hit.b}` : null) !== (hoverCell ? `${hoverCell.a},${hoverCell.b}` : null);
    hoverCell = hit ? { a: hit.a, b: hit.b } : null;
    if (changed) {
      schedule();
      if (onHover) onHover(hit ? hit.cell : null, hit ? hit.a : -1, hit ? hit.b : -1);
    }
  }
  let downX = 0;
  let downY = 0;
  function onDown(e) { dragging = true; dragX = e.clientX; downX = e.clientX; downY = e.clientY; canvas.style.cursor = 'grabbing'; }
  function onUp(e) {
    // En tactil no hay hover: un toque sin arrastre selecciona la barra.
    if (dragging && e && e.pointerType && e.pointerType !== 'mouse'
      && Math.abs(e.clientX - downX) < 8 && Math.abs(e.clientY - downY) < 8) {
      selectAt(e.clientX, e.clientY);
    }
    dragging = false;
    canvas.style.cursor = 'grab';
  }
  function onLeave(e) {
    // Un dedo "sale" del lienzo justo al levantarse: si se limpiara aqui, el toque que
    // acaba de seleccionar una barra la borraria al instante.
    if (hoverCell && (!e || e.pointerType === 'mouse')) { hoverCell = null; schedule(); if (onHover) onHover(null, -1, -1); }
    dragging = false;
  }

  canvas.style.cursor = 'grab';
  // pan-y: el arrastre horizontal rota y el vertical sigue desplazando la pagina. Con
  // 'none' el lienzo atrapaba el scroll en movil.
  canvas.style.touchAction = 'pan-y';
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', onLeave);

  const io = new IntersectionObserver((entries) => { inView = entries[0].isIntersecting; if (inView) schedule(); }, { threshold: 0.05 });
  io.observe(canvas);
  const ro = new ResizeObserver(() => schedule());
  ro.observe(canvas);
  const onThemeChange = () => schedule();
  const mo = new MutationObserver(onThemeChange);
  mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  schedule();

  return {
    destroy() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      io.disconnect();
      ro.disconnect();
      mo.disconnect();
    },
    setGrid(next, nextLabel) {
      data = next;
      if (nextLabel !== undefined) repLabel = nextLabel;
      hoverCell = null;
      schedule();
    },
  };
}
