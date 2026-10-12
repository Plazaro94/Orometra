// Estado compartido de sesión y helpers de formato. Sin imports de otros ui-*.

import { L, localeTag, pctSign } from './i18n.js';

export const roleBadge = (role) => {
  const ROLE_COPY = {
    distancia: ['ok', L('cuenta para buscar vecinas', 'counts when finding neighbors')],
    particion: ['', L('solo vecinas si coincide', 'neighbors only if equal')],
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
  // Archivos del análisis en pantalla (ui-audit.js) y lo soltado mientras se analizaba.
  analyzedFrom: null,
  pendingDrop: null,
  // Archivos que el motor rechazó por sus datos (no encajan, muy pocas filas…).
  analysisRejected: null,
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
export const pct = (v, d = 1) => (Number.isFinite(v) ? `${nf(d).format(v * 100)}${pctSign()}` : '—');
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Escape HTML but keep the inline tags the verdict engine embeds in finding details. */
export const rich = (s) => esc(s).replace(/&lt;(\/?(?:strong|em))&gt;/gi, '<$1>');
/**
 * Qué parte de una meseta cumple tus mínimos en el forward: «63 % · 24 de 38». Es lo que
 * la baja de puesto y lo que decide el aviso de «no se sostiene en el forward»; sin
 * enseñarlo, no se veía que una alternativa lo aguantaba entero. Por debajo del corte
 * crítico (65 %) va con la marca de aviso.
 */
export function forwardHoldHtml(p, critical = 0.65) {
  const v = p && p.oosValidation;
  if (!v || !v.withForward) return '—';
  const ok = Math.round(v.passFrac * v.withForward);
  const of = v.withForward < v.size
    ? L(`${int(ok)} de ${int(v.withForward)} con forward`, `${int(ok)} of ${int(v.withForward)} with a forward`)
    : L(`${int(ok)} de ${int(v.size)}`, `${int(ok)} of ${int(v.size)}`);
  const share = pct(v.passFrac, 0);
  return `${v.passFrac < critical ? `<span class="badge warn">${share}</span>` : share} <small class="muted">${of}</small>`;
}
/**
 * ¿Ninguna configuración de la meseta llegó al forward? Pasa cuando MT5 lleva al forward
 * solo las mejores del periodo optimizado (FWD-1 en docs/MT5_ASSUMPTIONS.md): la meseta
 * existe, pero solo se midió en el periodo optimizado, como si no hubiera archivo forward.
 */
export const forwardUntested = (a, p) => Boolean(a && a.meta.hasForward && p && p.oosValidation && p.oosValidation.withForward === 0);

/**
 * ¿Se ofrece el .set de despliegue de esta meseta? Hace falta forward y que alguna de sus
 * configuraciones llegara a él. Si no, solo el rango de refinamiento, igual que sin forward.
 */
export const deployableSet = (a, p) => Boolean(a && a.meta.hasForward && p && !forwardUntested(a, p));

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

/** Cifra de la tabla de resultados de MT5 tal como la enseña: punto decimal, dos decimales. */
export const mt5Figure = (v) => {
  if (!Number.isFinite(v)) return '—';
  const cents = Math.round(v * 100);
  return Math.abs(v * 100 - cents) < 1e-6 ? (cents / 100).toFixed(2) : String(v);
};

/**
 * Cifras con las que se encuentra una configuración en la tabla de MT5. El número de pasada
 * no sirve: el probador no lo guarda al cerrarse y el del XML puede no coincidir con el de
 * su tabla (PASS-2 en docs/MT5_ASSUMPTIONS.md). El beneficio, las operaciones y el Result
 * del periodo optimizado sí son los mismos en el archivo y en MT5. HTML.
 */
export function mt5Figures(rec) {
  const r = (rec && rec.is) || {};
  if (!Number.isFinite(r.profit) || !Number.isFinite(r.trades)) return '';
  const result = Number.isFinite(rec.criterionIs) ? ` · ${L('Resultado', 'Result')} <b>${mt5Figure(rec.criterionIs)}</b>` : '';
  return `${L('beneficio', 'profit')} <b>${mt5Figure(r.profit)}</b> · <b>${Math.round(r.trades)}</b> ${L('operaciones', 'trades')}${result}`;
}

/** Párrafo «búscala en MT5 por sus cifras», con el aviso de cifras repetidas. HTML. */
export function findInMt5Html(rec, hasForward, cls = 'vx-pass-note') {
  const figures = mt5Figures(rec);
  if (!figures) return '';
  const where = hasForward
    ? L('Búscala en los resultados de la optimización de MT5 (no en los del forward) por sus cifras', 'Find it in MT5’s optimization results (not the forward ones) by its figures')
    : L('Búscala en los resultados de la optimización de MT5 por sus cifras', 'Find it in MT5’s optimization results by its figures');
  const n = rec.twins || 0;
  const twins = n === 1
    ? L(' Hay otra configuración con esas mismas cifras: para cargar exactamente esta, usa sus parámetros.', ' Another configuration has the same figures: to load exactly this one, use its parameters.')
    : n > 1
      ? L(` Hay ${n} configuraciones más con esas mismas cifras: para cargar exactamente esta, usa sus parámetros.`, ` ${n} more configurations have the same figures: to load exactly this one, use its parameters.`)
      : '';
  return `<p class="${cls}">${where}: ${figures}. ${L('El número de pasada es el de tu archivo exportado: MT5 no lo guarda al cerrarse y puede enseñar otro.', 'The pass number is the one in your exported file: MT5 does not keep it after closing and may show a different one.')}${twins}</p>`;
}

/** Lo mismo en texto plano, para el resumen y el .set. */
export function findInMt5Text(rec) {
  const html = mt5Figures(rec);
  return html ? html.replace(/<\/?b>/g, '') : '';
}

/** MT5 guarda el informe en UTF-16; las optimizaciones, en UTF-8. */
export function decodeHead(buffer) {
  const b = new Uint8Array(buffer);
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(buffer);
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(buffer);
  return new TextDecoder('utf-8').decode(buffer);
}
