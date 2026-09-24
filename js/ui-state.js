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
