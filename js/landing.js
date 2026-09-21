// Portada de marketing. Comparte tema e idioma con la app.
import { mountBrandMark } from './brandmark.js';
import { setLocale, getLocale, applyStaticI18n } from './i18n.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const THEME_KEY = 'orometra.theme';
const TEMAS = ['dark', 'light', 'cream'];

function setTheme(name, persist = true) {
  const t = TEMAS.includes(name) ? name : 'dark';
  document.documentElement.dataset.theme = t;
  $$('[data-theme-set]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeSet === t)));
  if (persist) {
    try { localStorage.setItem(THEME_KEY, t); } catch { /* privado */ }
  }
}

function syncLang() {
  const lang = getLocale();
  $$('[data-lang-set]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.langSet === lang)));
}

try {
  const saved = localStorage.getItem(THEME_KEY);
  setTheme(saved || 'dark', false);
} catch {
  setTheme('dark', false);
}

$$('[data-theme-set]').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeSet)));
$$('[data-lang-set]').forEach((b) => b.addEventListener('click', () => {
  setLocale(b.dataset.langSet);
  syncLang();
}));
syncLang();
applyStaticI18n();

const mark = $('#brandMark');
if (mark) mountBrandMark(mark);
