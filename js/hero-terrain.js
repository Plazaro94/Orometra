// Relieve de la portada: un solo modelo para el sombreador WebGL, el dibujo 2D de reserva y los
// tests. El GLSL se genera a partir de estas mismas constantes, así que no pueden desalinearse.
//
// Coordenadas (u, v) en [-1, 1]. m = 0: periodo optimizado. m = 1: periodo nuevo.

export const MESA_C = [-0.18, -0.10];
export const PEAK_A = [0.58, 0.40];

// Meseta: cima amplia y plana (exp(-q⁴)) que baja por una ladera suave; algo alargada y girada
// para que parezca terreno y no un disco. La cima queda entre dos curvas de nivel (0.63 y 0.70):
// sin anillos encima, que la harían parecer una cúpula.
const MESA_R2 = 0.17;
const MESA_STRETCH = 1.15;
const MESA_TURN = -0.26;
const MESA_TOP = 0.49;
const MESA_SKIRT = 0.14;
const SKIRT_Q = 2.2;
const BASE = 0.05;
// El contorno que marca la meseta en el dibujo: una curva de q (solo depende de la meseta), así
// que no la deforma nada de lo que pasa alrededor. Va en el borde de la cima, visible desde
// cualquier lado.
export const RIM_Q = 0.62;

// Picos «de suerte» [u, v, altura, anchura]. El primero es la n.º 1 de MT5 y es el más alto.
const PEAKS = [
  [PEAK_A[0], PEAK_A[1], 1.32, 0.085],
  [0.16, -0.64, 0.80, 0.075],
  [-0.62, 0.40, 0.52, 0.07],
];
// Montículos del periodo nuevo: lejos de la meseta, bajos y anchos.
const BUMPS = [
  [0.72, -0.30, 0.34, 0.10],
  [-0.14, 0.70, 0.30, 0.10],
];

const MC = Math.cos(MESA_TURN);
const MS = Math.sin(MESA_TURN);

export const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const gauss = (du, dv, w) => Math.exp(-(du * du + dv * dv) / (2 * w * w));

export function mesaQ(u, v) {
  const du = u - MESA_C[0];
  const dv = v - MESA_C[1];
  const a = (du * MC + dv * MS) / MESA_STRETCH;
  const b = -du * MS + dv * MC;
  return (a * a + b * b) / MESA_R2;
}

// Ondulación suave del resto del terreno (cambia algo con el periodo; en la meseta, nada).
function waves(u, v, m) {
  return 0.03 * Math.sin(3.3 * u + 1.1 + 0.9 * m) * Math.sin(2.9 * v - 0.6 - 0.5 * m)
    + 0.018 * Math.sin(4.7 * u - 3.1 * v + 2.3 - 1.3 * m);
}

// Al caer, los picos pierden altura y se ensanchan: se desmoronan en vez de desvanecerse.
const peakTerm = (p, u, v, m) => p[2] * (1 - m) * (1 - m) * gauss(u - p[0], v - p[1], p[3] * (1 + 0.8 * m));

// Pico de la n.º 1 de MT5 por separado (para dibujar su silueta fantasma en el periodo nuevo).
export const peakA = (u, v, m) => peakTerm(PEAKS[0], u, v, m);

// Partes del relieve: h (altura final), pk (lo que ponen los picos), bp (los montículos nuevos),
// q (distancia normalizada al centro de la meseta).
export function terrain(u, v, m) {
  const r = Math.sqrt(u * u + v * v);
  const win = 1 - smooth(0.74, 1.0, r);
  const q = mesaQ(u, v);
  const qs = q / SKIRT_Q;
  const base = MESA_TOP * Math.exp(-q * q * q * q) + MESA_SKIRT * Math.exp(-qs * qs)
    + BASE + (1 - Math.exp(-q * q)) * waves(u, v, m);
  let pk = 0;
  for (const p of PEAKS) pk += peakTerm(p, u, v, m);
  let bp = 0;
  for (const b of BUMPS) bp += b[2] * m * m * gauss(u - b[0], v - b[1], b[3]);
  return { h: win * (base * (1 - 0.055 * m) + pk + bp), pk: win * pk, bp: win * bp, q };
}

export const height = (u, v, m) => terrain(u, v, m).h;

// Lo mismo en GLSL ES 1.0. terrain() devuelve vec4(h, pk, bp, q).
const f = (x) => Number(x).toFixed(6);
const glPeaks = PEAKS.map((p) => `pk += ${f(p[2])} * k2 * gs(p - vec2(${f(p[0])}, ${f(p[1])}), ${f(p[3])} * grow);`).join('\n  ');
const glBumps = BUMPS.map((b) => `bp += ${f(b[2])} * m2 * gs(p - vec2(${f(b[0])}, ${f(b[1])}), ${f(b[3])});`).join('\n  ');

export const TERRAIN_GLSL = `
float sm(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float gs(vec2 d, float w) { return exp(-dot(d, d) / (2.0 * w * w)); }
float mesaQ(vec2 p) {
  vec2 d = p - vec2(${f(MESA_C[0])}, ${f(MESA_C[1])});
  float a = (d.x * ${f(MC)} + d.y * ${f(MS)}) / ${f(MESA_STRETCH)};
  float b = -d.x * ${f(MS)} + d.y * ${f(MC)};
  return (a * a + b * b) / ${f(MESA_R2)};
}
vec4 terrain(vec2 p, float m) {
  float win = 1.0 - sm(0.74, 1.0, length(p));
  float q = mesaQ(p);
  float qs = q / ${f(SKIRT_Q)};
  float wv = 0.03 * sin(3.3 * p.x + 1.1 + 0.9 * m) * sin(2.9 * p.y - 0.6 - 0.5 * m)
    + 0.018 * sin(4.7 * p.x - 3.1 * p.y + 2.3 - 1.3 * m);
  float base = ${f(MESA_TOP)} * exp(-q * q * q * q) + ${f(MESA_SKIRT)} * exp(-qs * qs)
    + ${f(BASE)} + (1.0 - exp(-q * q)) * wv;
  float k2 = (1.0 - m) * (1.0 - m);
  float grow = 1.0 + 0.8 * m;
  float m2 = m * m;
  float pk = 0.0;
  ${glPeaks}
  float bp = 0.0;
  ${glBumps}
  return vec4(win * (base * (1.0 - 0.055 * m) + pk + bp), win * pk, win * bp, q);
}
`;
