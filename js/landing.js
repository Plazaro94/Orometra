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

// Menú del móvil. En una pantalla estrecha la cabecera solo tiene sitio para la marca y el
// idioma: Metodología, Guías, Privacidad y el botón de la app desaparecían, y solo se podía
// llegar a ellos bajando hasta el pie. El menú reutiliza los enlaces del pie (ya llevan la
// dirección de cada idioma) y se lleva el selector de tema, que no cabe en la fila.
const narrowHeader = matchMedia('(max-width:720px)');
function mountMobileMenu() {
  const top = $('.lp-top');
  const actions = $('.lp-top-actions');
  const foot = $('.lp-foot-nav');
  if (!top || !actions || !foot) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'lp-menu-btn';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'lpMenu');
  btn.innerHTML = '<span class="lp-menu-icon" aria-hidden="true"></span><span data-i18n="nav.menu"></span>';
  btn.lastChild.textContent = t('nav.menu');

  const panel = document.createElement('div');
  panel.id = 'lpMenu';
  panel.className = 'lp-menu';
  panel.hidden = true;
  const cta = $('.lp-cta-top');
  if (cta) {
    const a = cta.cloneNode(true);
    a.className = 'primary-btn lp-menu-cta';
    panel.append(a);
  }
  const nav = document.createElement('nav');
  nav.className = 'lp-menu-nav';
  nav.setAttribute('aria-label', t('nav.menu'));
  foot.querySelectorAll('a').forEach((a) => {
    // Fuera la marca (el logo ya lleva al inicio), la app (es el botón de arriba) y el correo.
    if (a.textContent.trim() === 'Orometra' || a.dataset.i18n === 'lp.cta.footer' || /^mailto:/.test(a.getAttribute('href'))) return;
    nav.append(a.cloneNode(true));
  });
  panel.append(nav);
  const themeSlot = document.createElement('div');
  themeSlot.className = 'lp-menu-theme';
  panel.append(themeSlot);
  actions.append(btn);
  top.append(panel);

  const theme = actions.querySelector('.theme-row');
  const placeTheme = () => {
    if (!theme) return;
    if (narrowHeader.matches) themeSlot.append(theme);
    else actions.insertBefore(theme, cta || btn);
    if (!narrowHeader.matches) close();
  };
  const open = () => {
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    const first = panel.querySelector('a');
    if (first) first.focus();
  };
  function close(focusBtn = false) {
    if (panel.hidden) return;
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (focusBtn) btn.focus();
  }
  btn.addEventListener('click', () => (panel.hidden ? open() : close()));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(true); });
  document.addEventListener('click', (e) => { if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) close(); });
  narrowHeader.addEventListener('change', placeTheme);
  placeTheme();
}

mountMobileMenu();
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
