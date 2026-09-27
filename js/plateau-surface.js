// Superficie isométrica de una meseta real: mismo lenguaje visual que el hero
// de la portada (js/hero-surface.js), pero con datos de verdad en vez de una
// fórmula. Los datos son discretos (niveles probados de dos parámetros), así
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
export function mountPlateauSurface(canvas, grid, { onHover } = {}) {
  if (!canvas || !canvas.getContext) return { destroy() {}, setGrid() {} };
  const ctx = canvas.getContext('2d', { alpha: false });
  const root = document.documentElement;
  const quiet = matchMedia('(prefers-reduced-motion: reduce)');

  let data = grid;
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

  function theme() {
    const isLight = root.dataset.theme === 'light';
    return {
      isLight,
      ok: cssColor(root, '--ok', '#3ed7d0'),
      okBg: cssColor(root, '--ok-bg', '#052220'),
      text: cssColor(root, '--muted', '#8fa3bd'),
      faint: cssColor(root, '--muted-3', '#5a6b7d'),
      surface: cssColor(root, '--surface', '#0c1220'),
      surface2: cssColor(root, '--surface-2', '#101828'),
      line: cssColor(root, '--line', '#2a3853'),
    };
  }

  // Mezcla simple hex/rgb -> con alpha, vía globalAlpha (no hace falta parsear).
  function withAlpha(ctxRef, color, alpha, fn) {
    ctxRef.save();
    ctxRef.globalAlpha = alpha;
    ctxRef.fillStyle = color;
    fn();
    ctxRef.restore();
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

    ctx.fillStyle = th.surface;
    ctx.fillRect(0, 0, cssW, cssH);

    const { grid: cells, levelsA, levelsB, repCell } = data;
    const nA = levelsA.length;
    const nB = levelsB.length;
    if (!nA || !nB) return;

    const cx = cssW * 0.5;
    const cy = cssH * 0.6;
    const scale = Math.min(cssW, cssH) * 0.42;
    const stepU = 2 / nA;
    const stepV = 2 / nB;
    const u0 = (a) => -1 + a * stepU;
    const v0 = (b) => -1 + b * stepV;

    // Base a altura 0, para el "suelo" de referencia.
    ctx.save();
    ctx.strokeStyle = th.line;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const floorCorners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => project(cx, cy, scale, u, v, 0));
    ctx.moveTo(floorCorners[0][0], floorCorners[0][1]);
    for (let k = 1; k < 4; k++) ctx.lineTo(floorCorners[k][0], floorCorners[k][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // Prepara cada barra con su profundidad de pintado (pintor: atrás -> adelante).
    const bars = [];
    for (let b = 0; b < nB; b++) {
      for (let a = 0; a < nA; a++) {
        const cell = cells[b][a];
        if (!cell) continue; // hueco: no se dibuja nada, ni a altura 0
        const h = Math.max(0.02, Math.min(1, cell.quality));
        const corners = [
          [u0(a), v0(b)], [u0(a) + stepU, v0(b)],
          [u0(a) + stepU, v0(b) + stepV], [u0(a), v0(b) + stepV],
        ];
        const base = corners.map(([u, v]) => project(cx, cy, scale, u, v, 0));
        const top = corners.map(([u, v]) => project(cx, cy, scale, u, v, h));
        const depth = base.reduce((s, p) => s + p[1], 0) / 4;
        bars.push({
          a, b, cell, h, base, top, depth,
          isRep: repCell[0] === a && repCell[1] === b,
          isHover: hoverCell && hoverCell.a === a && hoverCell.b === b,
        });
      }
    }
    bars.sort((x, y) => x.depth - y.depth);

    // Dentro de la meseta, la calidad ya varia de una celda a otra (es lo que
    // decide la altura de la barra); el color no lo reflejaba, asi que una
    // celda pegada al suelo minimo (borde real de la meseta) se veia igual de
    // "buena" que el nucleo. Se normaliza dentro del rango de calidad que
    // realmente tienen las celdas de esta meseta, para que el contraste se
    // note aunque el rango absoluto sea estrecho.
    let qMin = Infinity;
    let qMax = -Infinity;
    for (const bar of bars) {
      if (!bar.cell.inPlateau) continue;
      if (bar.cell.quality < qMin) qMin = bar.cell.quality;
      if (bar.cell.quality > qMax) qMax = bar.cell.quality;
    }
    const qSpan = qMax > qMin ? qMax - qMin : 0;

    for (const bar of bars) {
      const { base, top, cell, isRep, isHover } = bar;
      const inPlateau = cell.inPlateau;
      const depthT = inPlateau && qSpan ? (cell.quality - qMin) / qSpan : 1;
      const edgeFactor = inPlateau ? 0.5 + 0.5 * depthT : 1;
      const baseColor = inPlateau ? th.ok : th.text;
      const topAlpha = (inPlateau ? (th.isLight ? 0.85 : 0.6) : (th.isLight ? 0.4 : 0.24)) * edgeFactor;
      const sideAlpha = topAlpha * 0.55;
      const frontAlpha = topAlpha * 0.38;

      // Cara lateral derecha (corners 1-2, base y techo).
      ctx.beginPath();
      ctx.moveTo(top[1][0], top[1][1]);
      ctx.lineTo(top[2][0], top[2][1]);
      ctx.lineTo(base[2][0], base[2][1]);
      ctx.lineTo(base[1][0], base[1][1]);
      ctx.closePath();
      withAlpha(ctx, baseColor, sideAlpha, () => ctx.fill());

      // Cara frontal (corners 2-3).
      ctx.beginPath();
      ctx.moveTo(top[2][0], top[2][1]);
      ctx.lineTo(top[3][0], top[3][1]);
      ctx.lineTo(base[3][0], base[3][1]);
      ctx.lineTo(base[2][0], base[2][1]);
      ctx.closePath();
      withAlpha(ctx, baseColor, frontAlpha, () => ctx.fill());

      // Cara superior.
      ctx.beginPath();
      ctx.moveTo(top[0][0], top[0][1]);
      for (let k = 1; k < 4; k++) ctx.lineTo(top[k][0], top[k][1]);
      ctx.closePath();
      withAlpha(ctx, baseColor, topAlpha, () => ctx.fill());

      if (isRep || isHover) {
        ctx.save();
        ctx.strokeStyle = isRep ? th.ok : th.faint;
        ctx.lineWidth = isRep ? 2 : 1.25;
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.moveTo(top[0][0], top[0][1]);
        for (let k = 1; k < 4; k++) ctx.lineTo(top[k][0], top[k][1]);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
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
    const cx = rect.width * 0.5;
    const cy = rect.height * 0.6;
    const scale = Math.min(rect.width, rect.height) * 0.42;
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
    setGrid(next) {
      data = next;
      hoverCell = null;
      schedule();
    },
  };
}
