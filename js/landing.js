// Portada de marketing. Comparte tema e idioma con la app.
import { mountBrandMark } from './brandmark.js';
import { mountHeroSurface } from './hero-surface.js';
import { setLocale, getLocale, applyStaticI18n, t } from './i18n.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const THEME_KEY = 'orometra.theme';
const TEMAS = ['dark', 'light'];

function syncThemeColor() {
  if (typeof window.__orometraSyncThemeColor === 'function') window.__orometraSyncThemeColor();
}

function setTheme(name, persist = true) {
  const raw = name === 'cream' ? 'light' : name;
  const next = TEMAS.includes(raw) ? raw : 'dark';
  document.documentElement.dataset.theme = next;
  $$('[data-theme-set]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeSet === next)));
  syncThemeColor();
  if (persist) {
    try { localStorage.setItem(THEME_KEY, next); } catch { /* privado */ }
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
  syncSurfaceHint();
}));
syncLang();
applyStaticI18n();

const fineHover = matchMedia('(hover: hover) and (pointer: fine)');
function syncSurfaceHint() {
  const el = document.querySelector('.lp-surface-hint');
  if (!el) return;
  el.textContent = fineHover.matches ? t('lp.surface.hint') : t('lp.surface.hint.touch');
}
syncSurfaceHint();
fineHover.addEventListener('change', syncSurfaceHint);

const mark = $('#brandMark');
if (mark) mountBrandMark(mark);
const hero = $('#heroSurface');
if (hero) mountHeroSurface(hero);

const live = $('#surfaceLive');
const host = $('#heroSurfaceHost');
if (host && live) {
  host.addEventListener('orometra-surface', (ev) => {
    const state = ev.detail && ev.detail.state;
    live.textContent = state === 'plateau' ? t('lp.surface.state.plateau') : t('lp.surface.state.peaks');
  });
}
