// La figura de la marca: una meseta de curvas de nivel, en proyeccion isometrica.
//
// No es decoracion. Cuenta la tesis del producto sin una sola palabra: en reposo se ven
// dos picos aislados sobre un relieve; al pasar el raton los picos se desmoronan, la
// figura gira, y queda encendida la meseta ancha. Que es exactamente lo que hace el motor.
//
// Canvas 2D y nada mas: sin librerias, sin WebGL, unos pocos kilobytes.

const N = 13;            // resolucion de la malla
const RINGS = 5;         // curvas de nivel que se dibujan
const SPIN = 0.00060;    // radianes por milisegundo MIENTRAS el raton esta encima

/** Dos gaussianas estrechas (picos aislados) y una ancha y plana (la meseta). */
function height(u, v, collapse) {
  const gauss = (du, dv, w) => Math.exp(-(du * du + dv * dv) / (2 * w * w));
  // La meseta: ancha, y con la cima recortada para que sea PLANA, no una cupula.
  const mesa = Math.min(0.72, gauss(u + 0.28, v + 0.18, 0.46) * 0.95);
  // Los picos: estrechos y altos. `collapse` los hunde hasta desaparecer.
  const spike1 = gauss(u - 0.52, v - 0.46, 0.13) * 0.98;
  const spike2 = gauss(u - 0.30, v + 0.55, 0.11) * 0.86;
  const k = 1 - collapse;
  return mesa + (spike1 + spike2) * k * k;
}

export function mountBrandMark(canvas) {
  if (!canvas || !canvas.getContext) return () => {};
  const ctx = canvas.getContext('2d');
  const quiet = matchMedia('(prefers-reduced-motion: reduce)');

  let hover = false;
  let collapse = 0;        // 0 = picos intactos, 1 = derrumbados
  let angle = -0.6;
  let raf = 0;
  let last = 0;

  const size = () => {
    const dpr = Math.min(3, devicePixelRatio || 1);
    const css = canvas.getBoundingClientRect().width || 38;
    if (canvas.width !== Math.round(css * dpr)) {
      canvas.width = Math.round(css * dpr);
      canvas.height = Math.round(css * dpr);
    }
    return { dpr, css };
  };

  function draw() {
    const { dpr, css } = size();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, css, css);

    const cs = getComputedStyle(canvas);
    const ok = cs.getPropertyValue('--ok').trim() || '#7ef0bd';
    const info = cs.getPropertyValue('--info').trim() || '#72a8ff';
    const faint = cs.getPropertyValue('--muted-3').trim() || '#4f6171';

    const cx = css / 2;
    const scale = css * 0.46;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Proyeccion isometrica: se gira en el plano y se aplasta la vertical.
    // Ojo: la altura vertical se calcula respecto a CERO, no respecto al centro del
    // lienzo. El centrado se hace despues, midiendo.
    const project = (u, v, h) => {
      const x = u * cos - v * sin;
      const y = u * sin + v * cos;
      return [cx + x * scale, y * scale * 0.52 - h * scale * 0.62];
    };

    /*
     * Se construye primero TODA la geometria y solo despues se pinta, porque hay que
     * centrarla y para centrarla hay que saber cuanto ocupa.
     *
     * Antes la base se colocaba a ojo (`css/2 + css*0.06`) y la figura quedaba baja y
     * pequena dentro de su cuadro: solo ocupaba la mitad de la altura, asi que al
     * ponerla junto al texto se veia desplazada hacia abajo. Ahora se mide la tinta
     * real y se desplaza para que su centro coincida con el del lienzo. Se corrige
     * sola si algun dia cambia la forma o el angulo.
     */
    const anillos = [];
    let minY = Infinity;
    let maxY = -Infinity;
    for (let r = 0; r < RINGS; r++) {
      const level = 0.14 + (r / (RINGS - 1)) * 0.60;
      const pts = [];
      // Se recorre la malla y se queda el contorno donde la altura cruza el nivel.
      for (let a = 0; a < N * 4; a++) {
        const th = (a / (N * 4)) * Math.PI * 2;
        let lo = 0;
        let hi = 1.05;
        // Busqueda binaria del radio donde la superficie cruza este nivel.
        for (let it = 0; it < 12; it++) {
          const mid = (lo + hi) / 2;
          const h = height(Math.cos(th) * mid, Math.sin(th) * mid, collapse);
          if (h > level) lo = mid; else hi = mid;
        }
        if (lo > 0.02) pts.push(project(Math.cos(th) * lo, Math.sin(th) * lo, level));
      }
      for (const p of pts) {
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      }
      anillos.push({ pts, top: r === RINGS - 1, r });
    }
    // Desplazamiento que lleva el centro de la tinta al centro del lienzo.
    const dy = Number.isFinite(minY) ? css / 2 - (minY + maxY) / 2 : css / 2;

    for (const { pts, top, r } of anillos) {
      if (pts.length < 6) continue;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1] + dy);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1] + dy);
      ctx.closePath();
      if (top) {
        // La meseta se rellena y se enciende conforme los picos caen.
        ctx.fillStyle = ok;
        ctx.globalAlpha = 0.16 + 0.26 * collapse;
        ctx.fill();
        ctx.globalAlpha = 0.85 + 0.15 * collapse;
        ctx.strokeStyle = ok;
        ctx.lineWidth = 1.5;
      } else {
        ctx.globalAlpha = 0.30 + 0.12 * r;
        ctx.strokeStyle = r >= RINGS - 2 ? info : faint;
        ctx.lineWidth = 1;
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /*
   * En reposo la figura esta QUIETA. Un logo girando eternamente gasta bateria a cambio
   * de nada y acaba distrayendo; ademas obliga a mantener vivo un bucle de animacion
   * durante toda la sesion. El movimiento solo ocurre mientras el raton esta encima (o
   * mientras el boton tiene el foco), que es cuando alguien lo esta mirando.
   */
  function frame(t) {
    const dt = last ? Math.min(64, t - last) : 16;
    last = t;
    const target = hover ? 1 : 0;
    collapse += (target - collapse) * Math.min(1, dt / 190);
    if (hover && !quiet.matches) angle += dt * SPIN;
    draw();
    // Se sigue animando mientras el derrumbe no haya terminado, o mientras el raton siga
    // encima (para que gire). Cuando no pasa ninguna de las dos cosas, el bucle se para.
    const moving = Math.abs(target - collapse) > 0.002 || (hover && !quiet.matches);
    raf = moving ? requestAnimationFrame(frame) : 0;
  }

  const wake = () => {
    if (raf || document.hidden) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  };
  const host = canvas.closest('button') || canvas;
  host.addEventListener('pointerenter', () => { hover = true; wake(); });
  host.addEventListener('pointerleave', () => { hover = false; wake(); });
  host.addEventListener('focus', () => { hover = true; wake(); });
  host.addEventListener('blur', () => { hover = false; wake(); });
  // Al cambiar de tema cambian los colores, asi que hay que repintar.
  const repaint = () => { draw(); wake(); };
  quiet.addEventListener('change', repaint);
  // Al volver a la pestana hay que repintar: el canvas puede haberse quedado a medias.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) repaint(); });

  draw();
  return repaint;
}
