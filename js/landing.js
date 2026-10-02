// Portada de marketing. Comparte tema e idioma con la app.
import { mountBrandMark } from './brandmark.js';
import { enhanceRadioGroups } from './radiogroup.js';
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
  let next = name === 'cream' ? 'light' : name;
  next = TEMAS.includes(next) ? next : 'dark';
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
  // Paginas con version propia en cada idioma (/ y /es/): cambiar de idioma es ir a la
  // otra direccion, recordando la eleccion para las proximas visitas.
  const root = document.documentElement;
  const fixed = root.getAttribute('data-lang-fixed');
  const alt = root.getAttribute('data-alt-href');
  if (fixed && alt && b.dataset.langSet !== fixed) {
    try { localStorage.setItem('orometra.lang', b.dataset.langSet); } catch { /* privado */ }
    location.href = alt + location.hash;
    return;
  }
  if (fixed) {
    try { localStorage.setItem('orometra.lang', fixed); } catch { /* privado */ }
    return;
  }
  setLocale(b.dataset.langSet);
  syncLang();
  syncSurfaceHint();
  syncNotFoundLinks();
}));
// La 404 es una sola página para los dos idiomas: en español, sus enlaces llevan a la
// versión en español de cada página (las que la tienen).
const ES_HREF = { '/': '/es/', '/methodology/': '/es/methodology/', '/privacy/': '/es/privacy/' };
function syncNotFoundLinks() {
  if (document.documentElement.getAttribute('data-page') !== 'notfound') return;
  const es = getLocale() === 'es';
  $$('a[href]').forEach((a) => {
    if (!a.dataset.hrefEn) {
      if (!(a.getAttribute('href') in ES_HREF)) return;
      a.dataset.hrefEn = a.getAttribute('href');
    }
    a.setAttribute('href', es ? ES_HREF[a.dataset.hrefEn] : a.dataset.hrefEn);
  });
}

syncLang();
applyStaticI18n();
syncNotFoundLinks();
enhanceRadioGroups();

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
if (hero) {
  mountHeroSurface(hero, {
    locale: () => getLocale(),
    labels: () => ({
      mt5: t('lp.surface.mt5'),
      pick: t('lp.surface.pick'),
      periodA: t('lp.surface.period.a'),
      periodB: t('lp.surface.period.b'),
      axisA: t('lp.surface.axis.a'),
      axisB: t('lp.surface.axis.b'),
      axisZ: t('lp.surface.axis.z'),
      neighbors: t('lp.surface.neighbors'),
    }),
  });
}

const live = $('#surfaceLive');
const host = $('#heroSurfaceHost');
if (host && live) {
  host.addEventListener('orometra-surface', (ev) => {
    const state = ev.detail && ev.detail.state;
    live.textContent = state === 'plateau' ? t('lp.surface.state.plateau') : t('lp.surface.state.peaks');
  });
}
