// Relieve de la portada en WebGL: malla fina, luz con sombras suaves y curvas de nivel calculadas
// por píxel (siempre del mismo grosor, sin cortes entre teselas). La altura sale del mismo modelo
// que usa el resto (hero-terrain.js), convertido a GLSL.
//
// Devuelve null si el navegador no puede (sin WebGL, sin derivadas o si el sombreador no compila):
// entonces se usa el dibujo 2D de hero-surface.js.

import { TERRAIN_GLSL, RIM_Q } from './hero-terrain.js';

const VERT = `
precision highp float;
attribute vec2 aP;
uniform float uM;
uniform float uRise;
uniform float uYS;
uniform vec4 uRot;  // cos y sin del giro, cos y sin de la inclinación
uniform vec4 uProj; // distancia de la cámara, escala x e y (NDC)
uniform vec4 uCtr;  // centro x e y (NDC), A y B de la profundidad
varying vec2 vP;
varying float vDepth;
${TERRAIN_GLSL}
void main() {
  float y = terrain(aP, uM).x * uRise * uYS;
  float xr = aP.x * uRot.x - aP.y * uRot.y;
  float zr = aP.x * uRot.y + aP.y * uRot.x;
  float yv = y * uRot.z - zr * uRot.w;
  float zv = y * uRot.w + zr * uRot.z;
  float d = uProj.x - zv;
  gl_Position = vec4(uCtr.x * d + uProj.y * xr * uProj.x, uCtr.y * d + uProj.z * yv * uProj.x, uCtr.z * d + uCtr.w, d);
  vP = aP;
  vDepth = d;
}`;

const FRAG = `
#extension GL_OES_standard_derivatives : enable
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float uM;
uniform float uRise;
uniform float uYS;
uniform float uShow;
uniform float uSteps;
uniform float uPx; // píxeles del lienzo por píxel CSS
uniform vec3 uCam;
uniform vec3 uLight;
uniform vec2 uFog;
uniform vec3 uBg;
uniform vec3 uLow;
uniform vec3 uHigh;
uniform vec3 uPeak;
uniform vec3 uBump;
uniform vec3 uInk;
uniform vec3 uRim;
uniform vec3 uSpec;
uniform vec4 uLook; // ambiente, cielo, luz directa, sombra del borde
varying vec2 vP;
varying float vDepth;
${TERRAIN_GLSL}
float H(vec2 p) { return terrain(p, uM).x * uRise * uYS; }
// Línea antialias de ~w px; d es la distancia a la curva en píxeles.
float lpx(float d, float w) { return 1.0 - sm(w * 0.5 - 0.5, w * 0.5 + 0.6, d); }
// Lo mismo sobre la curva x = 0 (x en sus unidades; fwidth las pasa a píxeles).
float aline(float x, float w) { return lpx(abs(x) / max(fwidth(x), 1e-5), w); }
void main() {
  float r = length(vP);
  if (r > 1.2) discard;
  vec4 t = terrain(vP, uM);
  float h = t.x * uRise;
  vec3 pos = vec3(vP.x, h * uYS, vP.y);

  float e = 0.0035;
  float hx = H(vP + vec2(e, 0.0)) - H(vP - vec2(e, 0.0));
  float hz = H(vP + vec2(0.0, e)) - H(vP - vec2(0.0, e));
  vec3 n = normalize(vec3(-hx, 2.0 * e, -hz));
  vec3 V = normalize(uCam - pos);
  vec3 L = uLight;

  // Sombra suave: se avanza hacia la luz midiendo cuánto roza el relieve.
  float sh = 1.0;
  float tt = 0.02;
  for (int i = 0; i < 16; i++) {
    if (float(i) >= uSteps) break;
    vec3 q = pos + L * tt;
    sh = min(sh, 10.0 * (q.y - H(q.xz)) / tt);
    if (sh < 0.0) break;
    tt += 0.025 + tt * 0.12;
  }
  sh = clamp(sh, 0.0, 1.0);
  sh = sh * sh * (3.0 - 2.0 * sh);

  float pink = sm(0.04, 0.3, t.y * uRise);
  float bump = sm(0.03, 0.16, t.z * uRise);
  vec3 alb = mix(uLow, uHigh, sm(0.0, 0.75, h));
  alb = mix(alb, uBump, bump);
  alb = mix(alb, uPeak, pink);

  float wrap = clamp((dot(n, L) + 0.35) / 1.35, 0.0, 1.0);
  float sky = 0.5 + 0.5 * n.y;
  float ao = mix(0.62, 1.0, sm(0.0, 0.32, h));
  vec3 col = alb * (uLook.x + uLook.y * sky + uLook.z * wrap * sh) * ao;
  col += uSpec * pow(max(dot(n, normalize(L + V)), 0.0), 42.0) * sh;
  col += mix(uRim, uPeak, pink) * pow(1.0 - max(dot(n, V), 0.0), 4.0) * 0.3;

  // Curvas de nivel; una de cada cuatro, algo más marcada. Se apagan donde se amontonan.
  float lv = h / 0.07;
  float fw = fwidth(lv);
  float major = step(mod(floor(lv + 0.5), 4.0), 0.5);
  // (la distancia se mide con fwidth(lv): fract salta entre curvas y daría una línea falsa)
  float iso = lpx(abs(fract(lv + 0.5) - 0.5) / max(fw, 1e-5), 1.0 + 0.4 * major) * (1.0 - sm(0.3, 0.7, fw)) * sm(0.02, 0.06, h);
  // En la cima de la meseta no hay curvas: la única línea es su contorno.
  iso *= sm(${(RIM_Q + 0.04).toFixed(4)}, ${(RIM_Q + 0.2).toFixed(4)}, t.w);
  col = mix(col, mix(uInk, uPeak, pink * 0.6), iso * (0.16 + 0.1 * major + 0.3 * pink));

  // Retícula de puntos: cada punto, una combinación probada. Se apaga donde se amontona.
  vec2 g = vP / 0.1;
  vec2 gw = max(fwidth(g), vec2(1e-5));
  vec2 gd = (fract(g) - 0.5) / gw / uPx;
  float gs2 = max(gw.x, gw.y) * uPx;
  float dots = (1.0 - sm(0.6, 1.4, length(gd))) * (1.0 - sm(0.07, 0.14, gs2)) * sm(0.01, 0.05, h) * (1.0 - pink);
  col = mix(col, uInk, dots * 0.2);

  // El contorno de la meseta: una curva de la propia meseta, con un halo suave.
  float dq = abs(t.w - ${RIM_Q.toFixed(4)}) / max(fwidth(t.w), 1e-5);
  float rimA = (0.82 + 0.18 * uM) * uShow;
  col = mix(col, uRim, exp(-dq * 0.3) * 0.2 * rimA);
  col = mix(col, uRim, (1.0 - sm(0.6, 1.6, dq)) * rimA);

  col = clamp(mix(col, uBg, sm(uFog.x, uFog.y, vDepth) * 0.3), 0.0, 1.0);

  // Suelo alrededor: anillo, marcas cada 10° y los dos ejes, sobre una sombra suave del relieve.
  float cov = sm(0.004, 0.045, h);
  float ring = aline(r - 1.04, 1.0);
  float a1 = atan(vP.y, vP.x) * 5.7295780;
  float a2 = atan(-vP.y, -vP.x) * 5.7295780;
  float fa = max(min(fwidth(a1), fwidth(a2)), 1e-5);
  float tick = (1.0 - sm(0.2, 1.0, abs(fract(a1 + 0.5) - 0.5) / fa)) * sm(1.05, 1.056, r) * (1.0 - sm(1.084, 1.09, r));
  float band = sm(1.05, 1.056, r) * (1.0 - sm(1.14, 1.146, r));
  float axes = max(aline(vP.y, 1.4) * step(0.0, vP.x), aline(vP.x, 1.4) * step(0.0, vP.y)) * band;
  float la = max(max(ring * 0.42, tick * 0.34), axes * 0.85) * uShow;
  float sa = uLook.w * (1.0 - sm(0.9, 1.12, r)) * (1.0 - cov);
  vec3 floorP = uInk * la;
  float floorA = la + sa * (1.0 - la);

  float fade = 1.0 - sm(1.16, 1.2, r);
  gl_FragColor = vec4(col * cov + floorP * (1.0 - cov), cov + floorA * (1.0 - cov)) * fade;
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

// Rejilla que cubre el disco de radio 1.2 (los cuadros de las esquinas no hacen falta).
function buildMesh(n) {
  const R = 1.2;
  const step = (2 * R) / (n - 1);
  const pos = new Float32Array(n * n * 2);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const k = (i * n + j) * 2;
      pos[k] = -R + i * step;
      pos[k + 1] = -R + j * step;
    }
  }
  const idx = [];
  const lim = (R + step * 1.5) ** 2;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const u = -R + (i + 0.5) * step;
      const v = -R + (j + 0.5) * step;
      if (u * u + v * v > lim) continue;
      const a = i * n + j;
      const b = (i + 1) * n + j;
      const c = (i + 1) * n + j + 1;
      const d = i * n + j + 1;
      idx.push(a, b, c, a, c, d);
    }
  }
  return { pos, idx: new Uint16Array(idx) };
}

const UNIFORMS = ['uM', 'uRise', 'uYS', 'uRot', 'uProj', 'uCtr', 'uShow', 'uSteps', 'uPx', 'uCam', 'uLight', 'uFog',
  'uBg', 'uLow', 'uHigh', 'uPeak', 'uBump', 'uInk', 'uRim', 'uSpec', 'uLook'];

export function createTerrainGL(canvas, { detail = 224, onLost } = {}) {
  let gl = null;
  try {
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, depth: true, powerPreference: 'low-power' });
  } catch { gl = null; }
  if (!gl || !gl.getExtension('OES_standard_derivatives')) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  // n² vértices tienen que caber en índices de 16 bits.
  const mesh = buildMesh(Math.min(255, detail));
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.STATIC_DRAW);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);
  const aP = gl.getAttribLocation(prog, 'aP');
  gl.enableVertexAttribArray(aP);
  gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const name of UNIFORMS) U[name] = gl.getUniformLocation(prog, name);

  let lost = false;
  const onContextLost = (e) => {
    e.preventDefault();
    lost = true;
    if (onLost) onLost();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  const c3 = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];

  function draw(s) {
    if (lost) return;
    if (canvas.width !== s.width || canvas.height !== s.height) {
      canvas.width = s.width;
      canvas.height = s.height;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const v = s.view;
    const near = v.D - 1.7;
    const far = v.D + 1.7;
    gl.uniform1f(U.uM, s.m);
    gl.uniform1f(U.uRise, s.rise);
    gl.uniform1f(U.uYS, v.YS);
    gl.uniform1f(U.uShow, s.show);
    gl.uniform1f(U.uSteps, s.steps);
    gl.uniform1f(U.uPx, s.width / v.cssW);
    gl.uniform4f(U.uRot, v.c, v.s, v.cp, v.sp);
    gl.uniform4f(U.uProj, v.D, (2 * v.S) / v.cssW, (2 * v.S) / v.cssH, 0);
    gl.uniform4f(U.uCtr, (2 * v.ox) / v.cssW - 1, 1 - (2 * v.oy) / v.cssH, (far + near) / (far - near), (-2 * far * near) / (far - near));
    gl.uniform3fv(U.uCam, v.cam);
    gl.uniform3fv(U.uLight, v.light);
    gl.uniform2f(U.uFog, v.D - 0.6, v.D + 1.2);
    const p = s.palette;
    gl.uniform3fv(U.uBg, c3(p.bg));
    gl.uniform3fv(U.uLow, c3(p.low));
    gl.uniform3fv(U.uHigh, c3(p.high));
    gl.uniform3fv(U.uPeak, c3(p.peak));
    gl.uniform3fv(U.uBump, c3(p.bump));
    gl.uniform3fv(U.uInk, c3(p.ink));
    gl.uniform3fv(U.uRim, c3(p.rim));
    gl.uniform3fv(U.uSpec, c3(p.spec));
    gl.uniform4fv(U.uLook, p.look);
    gl.drawElements(gl.TRIANGLES, mesh.idx.length, gl.UNSIGNED_SHORT, 0);
  }

  function dispose() {
    canvas.removeEventListener('webglcontextlost', onContextLost);
    if (lost) return;
    gl.deleteBuffer(vbo);
    gl.deleteBuffer(ibo);
    gl.deleteProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  }

  return { draw, dispose };
}
