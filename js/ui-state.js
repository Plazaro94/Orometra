// Estado compartido de sesión y helpers de formato. Sin imports de otros ui-*.

import { L, localeTag } from './i18n.js';

export const roleBadge = (role) => {
  const ROLE_COPY = {
    distancia: ['ok', L('cuenta para buscar vecinos', 'counts when finding neighbors')],
    particion: ['', L('solo vecinos si coincide', 'neighbors only if equal')],
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
  // informe cargado (core/trades/from-deals.js), independiente del contraste numérico.
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
 * A que panel de Diagnostico/Parametros pertenece un hallazgo del motor: lo declara
 * core/verdict.js en cada hallazgo (`category`). `null` = no tiene una tabla que lo
 * explique en otro sitio y se queda suelto en Verdict; 'plateau' = ya lo explican los
 * badges de Top 3 y la ficha de la meseta.
 *
 * Antes se adivinaba con expresiones regulares sobre el texto en ES/EN, y cambiar la
 * redaccion de un hallazgo lo movia o lo perdia en silencio.
 */
export function categorizeFinding(f) {
  return f && f.category !== undefined ? f.category : null;
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

/**
 * Valor de un PARÁMETRO tal como se escribe en MT5: exacto, con punto decimal y sin
 * separador de millares, igual que en el .set (js/export.js#formatSetValue). No se
 * formatea con el idioma: es una cifra que el usuario va a teclear en el probador, y
 * redondearla a 4 decimales o escribirla con coma («0,0002» por 0.00015, «1,5») le hacía
 * copiar en MT5 un valor distinto del recomendado.
 */
export const paramValue = (v) => {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return v;
  if (!Number.isFinite(v)) return '—';
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(8)));
};

/**
 * `paramValue` listo para HTML. Los valores de texto (enums) vienen tal cual del
 * archivo del usuario: sin escapar, un export manipulado podia inyectar HTML y
 * ejecutar script. Toda interpolacion en plantillas usa esta, nunca `paramValue`.
 */
export const paramHtml = (v) => esc(paramValue(v));

/** MT5 guarda el informe en UTF-16; las optimizaciones, en UTF-8. */
export function decodeHead(buffer) {
  const b = new Uint8Array(buffer);
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(buffer);
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(buffer);
  return new TextDecoder('utf-8').decode(buffer);
}
