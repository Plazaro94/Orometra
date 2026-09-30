// Relieve de la portada: un solo modelo para el sombreador WebGL, el dibujo 2D de reserva y los
// tests. El GLSL se genera a partir de estas mismas constantes, así que no pueden desalinearse.
//
// Coordenadas (u, v) en [-1, 1]. m = 0: periodo optimizado. m = 1: periodo nuevo.
// La altura es proporcional al resultado (RESULT_H por unidad): el dibujo no exagera ninguna
// cifra, tampoco la caída del pico.

// Las cifras son las de la tabla de ejemplo de la portada (tests/hero-surface.test.js).
export const MT5_RESULT = 4.71;
export const PICK_RESULT = 2.18;
export const MT5_AFTER = 1.30;
export const PICK_AFTER = 2.05;

// Rejilla de pasadas: una combinación probada cada STEP en cada parámetro. La n.º 1 de MT5 y la
// que elige Orometra caen en nodos de la rejilla, así que sus vecinos son los nodos de al lado.
export const STEP = 0.1;
export const PEAK_A = [0.58, 0.40];
export const MESA_C = [-0.22, -0.10];

// Meseta: cima amplia y plana (exp(-q⁴)) que baja por una ladera suave; algo alargada y girada
// para que parezca terreno y no un disco.
const MESA_R2 = 0.17;
const MESA_STRETCH = 1.15;
const MESA_TURN = -0.26;
const MESA_TOP = 0.49;
const MESA_SKIRT = 0.14;
const SKIRT_Q = 2.2;
const BASE = 0.05;
// El contorno que marca la meseta en el dibujo: una curva de q (solo depende de la meseta), así
// que no la deforma nada de lo que pasa alrededor. Va en el borde de la cima.
export const RIM_Q = 0.62;

// Altura del dibujo por unidad de resultado: el centro de la meseta mide exactamente 2,18.
export const RESULT_H = (MESA_TOP + MESA_SKIRT + BASE) / PICK_RESULT;
// Lo que baja todo el terreno en el periodo nuevo (la meseta pasa de 2,18 a 2,05).
const DROP = 1 - PICK_AFTER / PICK_RESULT;

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

// El terreno sin picos ni montículos.
function ground(u, v, m) {
  const q = mesaQ(u, v);
  const qs = q / SKIRT_Q;
  return MESA_TOP * Math.exp(-q * q * q * q) + MESA_SKIRT * Math.exp(-qs * qs)
    + BASE + (1 - Math.exp(-q * q)) * waves(u, v, m);
}

// Picos «de suerte» [u, v, altura, anchura, altura en el periodo nuevo]. El primero es la n.º 1
// de MT5: su altura se calcula para que el dibujo marque justo 4,71 y, al caer, 1,30.
const PEAKS = [
  [PEAK_A[0], PEAK_A[1],
    MT5_RESULT * RESULT_H - ground(PEAK_A[0], PEAK_A[1], 0), 0.085,
    MT5_AFTER * RESULT_H - ground(PEAK_A[0], PEAK_A[1], 1) * (1 - DROP)],
  [0.16, -0.64, 0.80, 0.075, 0],
  [-0.62, 0.40, 0.52, 0.07, 0],
];
// Montículos del periodo nuevo: lejos de la meseta, bajos y anchos.
const BUMPS = [
  [0.72, -0.30, 0.34, 0.10],
  [-0.14, 0.70, 0.30, 0.10],
];

// Al caer, los picos bajan hasta lo que les queda y se ensanchan: se desmoronan en vez de
// desvanecerse.
const peakTerm = (p, u, v, m) => (p[4] + (p[2] - p[4]) * (1 - m) * (1 - m)) * gauss(u - p[0], v - p[1], p[3] * (1 + 0.8 * m));

// Pico de la n.º 1 de MT5 por separado (para dibujar su silueta fantasma en el periodo nuevo).
export const peakA = (u, v, m) => peakTerm(PEAKS[0], u, v, m);

// Partes del relieve: h (altura final), pk (lo que ponen los picos), bp (los montículos nuevos),
// q (distancia normalizada al centro de la meseta).
export function terrain(u, v, m) {
  const r = Math.sqrt(u * u + v * v);
  const win = 1 - smooth(0.74, 1.0, r);
  let pk = 0;
  for (const p of PEAKS) pk += peakTerm(p, u, v, m);
  let bp = 0;
  for (const b of BUMPS) bp += b[2] * m * m * gauss(u - b[0], v - b[1], b[3]);
  return { h: win * (ground(u, v, m) * (1 - DROP * m) + pk + bp), pk: win * pk, bp: win * bp, q: mesaQ(u, v) };
}

export const height = (u, v, m) => terrain(u, v, m).h;

// Los 8 vecinos de un nodo de la rejilla (un paso en cada parámetro) y cuánto pierden de media
// respecto a él: la prueba que hace el motor, dibujada.
export function neighbors(at, m) {
  const out = [];
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      if (i || j) {
        const u = at[0] + i * STEP;
        const v = at[1] + j * STEP;
        out.push([u, v, height(u, v, m)]);
      }
    }
  }
  return out;
}

export function neighborDrop(at, m) {
  const n = neighbors(at, m);
  const mean = n.reduce((s, p) => s + p[2], 0) / n.length;
  return 1 - mean / height(at[0], at[1], m);
}

// Lo mismo en GLSL ES 1.0. terrain() devuelve vec4(h, pk, bp, q).
const f = (x) => Number(x).toFixed(6);
const glPeaks = PEAKS.map((p) => `pk += (${f(p[4])} + ${f(p[2] - p[4])} * k2) * gs(p - vec2(${f(p[0])}, ${f(p[1])}), ${f(p[3])} * grow);`).join('\n  ');
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
  return vec4(win * (base * (1.0 - ${f(DROP)} * m) + pk + bp), win * pk, win * bp, q);
}
`;
