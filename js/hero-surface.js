// Superficie hero: misma tesis que el brandmark, a escala de producto.
// Curvas de nivel isométricas. Hover (desktop) o ciclo automático (touch / sin hover).

const N = 36;
const RINGS = 11;
const SPIN = 0.00022;

function height(u, v, collapse) {
  const gauss = (du, dv, w) => Math.exp(-(du * du + dv * dv) / (2 * w * w));
  const mesa = Math.min(0.68, gauss(u + 0.18, v + 0.10, 0.52) * 0.96);
  const spike1 = gauss(u - 0.58, v - 0.40, 0.09) * 1.18;
  const spike2 = gauss(u - 0.12, v + 0.62, 0.08) * 0.95;
  const k = 1 - collapse;
  return mesa + (spike1 + spike2) * k * k;
}

function cssColor(el, name, fallback) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

export function mountHeroSurface(canvas) {
  if (!canvas || !canvas.getContext) return () => {};
  const ctx = canvas.getContext('2d', { alpha: false });
  const quiet = matchMedia('(prefers-reduced-motion: reduce)');
  const fineHover = matchMedia('(hover: hover) and (pointer: fine)');
  const host = canvas.closest('.lp-surface') || canvas;
  const root = document.documentElement;

  let hover = false;
  let collapse = 0;
  let angle = -0.78;
  let raf = 0;
  let last = 0;
  let intro = 0;
  let inView = true;
  let autoPhase = 0; // 0..1 cycle for autoplay
  let autoT = 0;

  const size = () => {
    const dpr = Math.min(2.25, devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width) || 560);
    const cssH = Math.max(1, Math.round(rect.height) || 280);
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { dpr, cssW, cssH };
  };

  function themeBoost() {
    const theme = root.dataset.theme || 'dark';
    const lightish = theme === 'light' || theme === 'cream';
    return {
      lightish,
      fillMul: lightish ? 2.1 : 1,
      strokeMul: lightish ? 1.45 : 1,
      vig: lightish ? 0.05 : 0.22,
    };
  }

  function draw() {
    const { dpr, cssW, cssH } = size();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const boost = themeBoost();

    const ok = cssColor(root, '--ok', '#3ed7d0');
    const peak = cssColor(root, '--peak', '#e85a7a');
    const info = cssColor(root, '--info', '#72a8ff');
    const faint = cssColor(root, '--muted-3', '#5a6b7d');
    const surface = cssColor(root, '--surface', '#0c1220');
    const surface2 = cssColor(root, '--surface-2', '#101828');

    ctx.fillStyle = surface;
    ctx.fillRect(0, 0, cssW, cssH);
    const wash = ctx.createRadialGradient(
      cssW * 0.55, cssH * 0.38, cssH * 0.05,
      cssW * 0.5, cssH * 0.55, cssW * 0.7,
    );
    wash.addColorStop(0, surface2);
    wash.addColorStop(1, surface);
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, cssW, cssH);

    const cx = cssW * 0.50;
    const cy = cssH * 0.62;
    const scale = Math.min(cssW, cssH) * 0.46;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const show = Math.min(1, 0.25 + intro * 0.75);

    const project = (u, v, h) => {
      const x = u * cos - v * sin;
      const y = u * sin + v * cos;
      return [cx + x * scale, cy + y * scale * 0.44 - h * scale * 0.82];
    };

    const step = 2 / (N - 1);
    const cells = [];
    let minY = Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < N - 1; i++) {
      for (let j = 0; j < N - 1; j++) {
        const u0 = -1 + i * step;
        const v0 = -1 + j * step;
        const corners = [
          [u0, v0], [u0 + step, v0], [u0 + step, v0 + step], [u0, v0 + step],
        ].map(([u, v]) => {
          const h = height(u, v, collapse);
          const p = project(u, v, h);
          if (p[1] < minY) minY = p[1];
          if (p[1] > maxY) maxY = p[1];
          return { h, x: p[0], y: p[1] };
        });
        const hAvg = (corners[0].h + corners[1].h + corners[2].h + corners[3].h) / 4;
        const depth = corners.reduce((s, c) => s + c.y, 0) / 4;
        cells.push({ corners, hAvg, depth });
      }
    }

    const dy = Number.isFinite(minY) ? cssH * 0.48 - (minY + maxY) / 2 : 0;
    cells.sort((a, b) => a.depth - b.depth);

    for (const cell of cells) {
      const { corners, hAvg } = cell;
      if (hAvg < 0.06) continue;
      const spike = (1 - collapse) * Math.max(0, hAvg - 0.52);
      const mesa = Math.max(0, Math.min(1, (hAvg - 0.18) / 0.5));

      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y + dy);
      for (let k = 1; k < 4; k++) ctx.lineTo(corners[k].x, corners[k].y + dy);
      ctx.closePath();

      if (spike > 0.04) {
        ctx.fillStyle = peak;
        ctx.globalAlpha = Math.min(0.55, (0.12 + spike * 0.7) * boost.fillMul) * show;
      } else {
        ctx.fillStyle = ok;
        ctx.globalAlpha = Math.min(0.42, (0.04 + mesa * (0.12 + 0.24 * collapse) + hAvg * 0.1) * boost.fillMul) * show;
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (let r = 0; r < RINGS; r++) {
      const level = 0.09 + (r / (RINGS - 1)) * 0.64;
      const pts = [];
      const samples = N * 8;
      for (let a = 0; a < samples; a++) {
        const th = (a / samples) * Math.PI * 2;
        let lo = 0;
        let hi = 1.18;
        for (let it = 0; it < 16; it++) {
          const mid = (lo + hi) / 2;
          const h = height(Math.cos(th) * mid, Math.sin(th) * mid, collapse);
          if (h > level) lo = mid; else hi = mid;
        }
        if (lo > 0.012) {
          const p = project(Math.cos(th) * lo, Math.sin(th) * lo, level);
          pts.push([p[0], p[1] + dy]);
        }
      }
      if (pts.length < 10) continue;

      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();

      const top = r === RINGS - 1;
      const nearPeak = r >= RINGS - 3 && collapse < 0.45;

      if (top) {
        ctx.fillStyle = ok;
        ctx.globalAlpha = (0.10 + 0.30 * collapse) * boost.fillMul * show;
        ctx.fill();
        ctx.strokeStyle = ok;
        ctx.globalAlpha = Math.min(1, (0.55 + 0.40 * collapse) * boost.strokeMul) * show;
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = nearPeak ? peak : (r >= RINGS - 2 ? info : faint);
        ctx.globalAlpha = Math.min(1, (0.22 + 0.08 * (r / RINGS)) * boost.strokeMul) * show;
        ctx.lineWidth = nearPeak ? 1.25 : (0.75 + r * 0.05);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (boost.vig > 0.001) {
      const vig = ctx.createRadialGradient(
        cssW * 0.5, cssH * 0.45, cssH * 0.15,
        cssW * 0.5, cssH * 0.5, cssW * 0.72,
      );
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, `rgba(0,0,0,${boost.vig})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, cssW, cssH);
    }

    const state = collapse > 0.55 ? 'plateau' : 'peaks';
    if (host.dataset.surfaceState !== state) {
      host.dataset.surfaceState = state;
      host.dispatchEvent(new CustomEvent('orometra-surface', { detail: { state }, bubbles: true }));
    }
  }

  function targetCollapse() {
    if (quiet.matches) return 0.92;
    if (hover) return 1;
    if (!fineHover.matches && inView) {
      // Ciclo suave: picos → meseta → picos.
      const wave = (Math.sin(autoPhase * Math.PI * 2 - Math.PI / 2) + 1) / 2;
      return 0.08 + wave * 0.9;
    }
    return 0.08;
  }

  function frame(t) {
    const dt = last ? Math.min(64, t - last) : 16;
    last = t;
    if (!quiet.matches && intro < 1) intro = Math.min(1, intro + dt / 700);
    else intro = 1;

    if (!fineHover.matches && inView && !quiet.matches && !hover) {
      autoT += dt;
      autoPhase = (autoT / 5200) % 1;
    }

    const want = targetCollapse();
    collapse += (want - collapse) * Math.min(1, dt / 200);
    const shouldSpin = (hover || intro < 1 || (!fineHover.matches && inView)) && !quiet.matches;
    if (shouldSpin) angle += dt * SPIN;
    draw();
    const moving = Math.abs(want - collapse) > 0.002 || intro < 1 || hover
      || (!fineHover.matches && inView && !quiet.matches);
    raf = moving ? requestAnimationFrame(frame) : 0;
  }

  const wake = () => {
    if (raf || document.hidden) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  };

  const onPointerEnter = () => { hover = true; wake(); };
  const onPointerLeave = () => { hover = false; wake(); };
  const onFocusIn = () => { hover = true; wake(); };
  const onFocusOut = () => { hover = false; wake(); };
  const onVisibility = () => { if (!document.hidden) wake(); };
  const onPointerUp = () => {
    // Toque: un tap alterna hacia meseta un momento.
    if (fineHover.matches) return;
    hover = true;
    wake();
    setTimeout(() => { hover = false; wake(); }, 2200);
  };

  host.addEventListener('pointerenter', onPointerEnter);
  host.addEventListener('pointerleave', onPointerLeave);
  host.addEventListener('focusin', onFocusIn);
  host.addEventListener('focusout', onFocusOut);
  host.addEventListener('pointerup', onPointerUp);

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
    host.removeEventListener('pointerup', onPointerUp);
  };
  return repaint;
}
