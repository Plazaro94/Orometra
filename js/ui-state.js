// Estado compartido de sesión y helpers de formato. Sin imports de otros ui-*.

import { L, localeTag } from './i18n.js';

export const roleBadge = (role) => {
  const ROLE_COPY = {
    distancia: ['ok', L('mide la distancia', 'measures distance')],
    particion: ['', L('parte el espacio', 'partitions the space')],
    liberado: ['', L('bloqueo liberado', 'block released')],
    plano: ['', L('plano: se ignora', 'flat: ignored')],
    'no optimizado': ['', L('no optimizado', 'not optimized')],
  };
  const [cls, label] = ROLE_COPY[role] || ['', role];
  return `<span class="badge ${cls}">${label}</span>`;
};

export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => Array.from(document.querySelectorAll(sel));

export const state = {
  isFile: null,
  oosFile: null,
  isTable: null,
  oosTable: null,
  analysis: null,
  tab: 'verdict',
  selectedPlateau: 0,
  selectedParam: 0,
  // Ejes de la superficie 3D de la meseta elegida (02); null = aun sin decidir,
  // se calculan los dos parametros mas influyentes al entrar en la vista.
  surfaceDimA: null,
  surfaceDimB: null,
  isDemo: false,
  busy: false,
  // Periodo no visto: lo que el usuario teclea y el último resultado calculado.
  // `tradesAudit`: Monte Carlo / muestra / costes calculados sobre las operaciones del
  // informe cargado (core/matrix/from-deals.js), independiente del contraste numérico.
  unseen: {
    plateauIndex: 0, values: {}, result: null, error: null, tradesAudit: null,
  },
  report: null,
  preflight: { is: null, oos: null },
  searchSet: null,
  searchSetName: null,
};

/** Cableado tardío entre módulos UI para evitar imports circulares. */
export const api = {};

/**
 * A que panel de Diagnostico/Parametros pertenece un hallazgo del motor, cuando ese
 * panel ya muestra en crudo el mismo numero que el hallazgo narra en prosa. Clasificar
 * por texto (no por un campo del motor) evita tocar core/verdict.js: cada hallazgo se
 * genera ya en el idioma activo, así que las expresiones cubren ambos.
 *
 * `null` = no tiene una tabla que lo explique en otro sitio; se queda como hallazgo
 * suelto en Verdict. 'plateau' = ya lo explican los badges de Top 3 / la tarjeta de
 * Plateaus con más contexto (que config exacta y que parametro); no hace falta
 * repetirlo en ningun lado, se descarta sin más.
 */
const FINDING_CATEGORY_PATTERNS = [
  ['stats', /(?=.*\bresult\b)(?=.*(ranking|regla|rule|fragilidad|fragility))|no transfiere|does not transfer|periodos no son intercambiables|periods are not interchangeable|\bsharpe\b|correlaci[oó]n is|is -> oos correlation/i],
  ['stability', /variaciones de (umbral|tus m[ií]nimos)|(threshold|minima) variations|propios umbrales|own thresholds|mueven? la recomendaci[oó]n|move(s)? the recommendation|m[ií]nimos que elijas|minima you choose|efecto de tus m[ií]nimos|effect of your minima/i],
  ['coverage', /\.set|muestreo disperso|sparse sampling|soporte local insuficiente|insufficient local support|periodo oos es (muy corto|m[aá]s largo)|oos period is (very short|longer)/i],
  ['gates', /no est[aá]n? filtrando nada|not filtering anything/i],
  ['sensitivity', /efecto combinado|combined effect|saltos desiguales|uneven steps/i],
  ['parameters', /gana en el in-sample es de los que pierden|wins in-sample is among those that lose/i],
  ['integrity', /misma optimizacion|same optimization|subconjunto del in-sample|subset of in-sample|identificadores duplicados|duplicate identifiers|pasadas sin pareja|unpaired passes/i],
  ['plateau', /apoya en un valor que el forward castiga|leans on a value the forward punishes|pegada al borde del rango probado|sits on the edge of the tested range/i],
];

export function categorizeFinding(f) {
  const text = `${f.title} ${f.detail}`;
  for (const [cat, re] of FINDING_CATEGORY_PATTERNS) {
    if (re.test(text)) return cat;
  }
  return null;
}

export function findingsForCategory(findings, cat) {
  return (findings || []).filter((f) => categorizeFinding(f) === cat);
}

// ---------------------------------------------------------------- formato
export const nf = (d = 2) => new Intl.NumberFormat(localeTag(), { minimumFractionDigits: d, maximumFractionDigits: d });
export const num = (v, d = 2) => (Number.isFinite(v) ? nf(d).format(v) : '—');
export const int = (v) => (Number.isFinite(v) ? new Intl.NumberFormat(localeTag()).format(Math.round(v)) : '—');
export const pct = (v, d = 1) => (Number.isFinite(v) ? `${nf(d).format(v * 100)} %` : '—');
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Escape HTML but keep the inline tags the verdict engine embeds in finding details. */
export const rich = (s) => esc(s).replace(/&lt;(\/?(?:strong|em))&gt;/gi, '<$1>');
export const money = (v) => (Number.isFinite(v) ? new Intl.NumberFormat(localeTag(), { maximumFractionDigits: 0 }).format(v) : '—');
/** Valor tal como lo escribe MT5: punto decimal y sin separador de millares. */
export const rawValue = (v) => {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
};

export const paramValue = (v) => {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return v;
  if (!Number.isFinite(v)) return '—';
  return Number.isInteger(v) ? String(v) : nf(4).format(v).replace(/,?0+$/, '');
};

/** MT5 guarda el informe en UTF-16; las optimizaciones, en UTF-8. */
export function decodeHead(buffer) {
  const b = new Uint8Array(buffer);
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(buffer);
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(buffer);
  return new TextDecoder('utf-8').decode(buffer);
}
