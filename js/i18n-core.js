// Idioma de la interfaz. Inglés por defecto (mercado MT5 global); español opcional.
//
// Este módulo no trae textos: cada página registra los que usa con addStrings(). La app
// carga todos (js/i18n.js); las páginas públicas, que ya vienen escritas en su idioma,
// solo los pocos que pinta JavaScript (js/i18n-site.js, generado).
//
// En el navegador el idioma vive en <html lang> (lo pone theme-init.js antes de pintar).
// En Node (tests) se fuerza español para no romper las aserciones del motor.
// En el Web Worker no hay `document`: el hilo principal debe llamar setLocale()
// con el idioma activo antes de construir el veredicto, o L() caería siempre en ES.

const KEY = 'orometra.lang';
let activeLocale = null;
const STRINGS = { en: {}, es: {} };

/** Añade textos ({ en: {...}, es: {...} }) a los ya registrados. */
export function addStrings(packs) {
  for (const lang of ['en', 'es']) Object.assign(STRINGS[lang], packs[lang] || {});
}

export function getLocale() {
  if (activeLocale === 'es' || activeLocale === 'en') return activeLocale;
  if (typeof document !== 'undefined') {
    const lang = document.documentElement.getAttribute('lang');
    return lang === 'es' ? 'es' : 'en';
  }
  return 'es';
}

export function localeTag() {
  return getLocale() === 'es' ? 'es-ES' : 'en-US';
}

/** Texto bilingüe inline: L('español', 'English'). */
export function L(es, en) {
  return getLocale() === 'es' ? es : en;
}

/** Signo de porcentaje tras una cifra: «20 %» en español (con espacio) y «20%» en inglés. */
export function pctSign() {
  return L(' %', '%');
}

export function t(key, vars) {
  const pack = STRINGS[getLocale()] || STRINGS.en;
  let s = pack[key] ?? STRINGS.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

export function setLocale(lang) {
  const next = lang === 'es' ? 'es' : 'en';
  activeLocale = next;
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', next);
    document.documentElement.setAttribute('data-lang', next);
    try { localStorage.setItem(KEY, next); } catch { /* privado */ }
  }
  applyStaticI18n();
  return next;
}

export function applyStaticI18n() {
  if (typeof document === 'undefined') return;
  // Si una clave no existe (p. ej. el navegador tiene en caché un i18n.js anterior a la
  // página, que ya trae los textos nuevos), se deja el texto que trae el HTML: escribir
  // el nombre de la clave («home.take.title») es peor que no traducir.
  const has = (key) => Boolean(key) && (key in (STRINGS[getLocale()] || {}) || key in STRINGS.en);
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!has(key)) return;
    const attr = el.getAttribute('data-i18n-attr');
    const value = t(key);
    if (attr) el.setAttribute(attr, value);
    else el.textContent = value;
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html');
    if (has(key)) el.innerHTML = t(key);
  });
  syncDocumentMeta();
  // Se muestra en el siguiente fotograma: da tiempo a que la app termine su primer
  // pintado, que corre en la misma tarea (ver theme-init.js).
  if (document.documentElement.classList.contains('i18n-pending')) {
    requestAnimationFrame(() => document.documentElement.classList.remove('i18n-pending'));
  }
}

/** Pagina actual, para usar su propio titulo y descripcion (no los de la portada). */
function currentPage() {
  if (typeof document !== 'undefined' && document.documentElement.getAttribute('data-page')) {
    return document.documentElement.getAttribute('data-page');
  }
  if (typeof location === 'undefined') return 'landing';
  const path = location.pathname;
  if (/\/app\//.test(path)) return 'app';
  if (/\/methodology\//.test(path)) return 'methodology';
  if (/\/privacy\//.test(path)) return 'privacy';
  return 'landing';
}

function syncDocumentMeta() {
  if (typeof document === 'undefined') return;
  const page = currentPage();
  const title = t(`meta.title.${page}`);
  const desc = t(`meta.description.${page}`);
  // En la app, tras un analisis el titulo lleva el archivo ("✓ archivo · Orometra"): no pisarlo.
  if (!(page === 'app' && document.body && document.body.classList.contains('has-analysis'))) document.title = title;
  const md = document.querySelector('meta[name="description"]');
  if (md) md.setAttribute('content', desc);
  const ogt = document.querySelector('meta[property="og:title"]');
  if (ogt) ogt.setAttribute('content', title);
  const ogd = document.querySelector('meta[property="og:description"]');
  if (ogd) ogd.setAttribute('content', desc);
  const ogl = document.querySelector('meta[property="og:locale"]');
  if (ogl) ogl.setAttribute('content', getLocale() === 'es' ? 'es_ES' : 'en_US');
}
