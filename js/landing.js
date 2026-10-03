// Portada de marketing. Comparte tema e idioma con la app.
import { enhanceRadioGroups } from './radiogroup.js';
import { setLocale, getLocale, applyStaticI18n, t } from './i18n-core.js';
import './i18n-site.js';
import { track } from './track.js';

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
  syncNotFoundLinks();
}));
// La 404 es una sola página para los dos idiomas: en español, sus enlaces llevan a la
// versión en español de cada página (las que la tienen).
const ES_HREF = { '/': '/es/', '/methodology/': '/es/methodology/', '/guides/': '/es/guias/', '/privacy/': '/es/privacy/' };
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

// La sección en la que estás, marcada en la cabecera (Metodología o Guías).
function markCurrentSection() {
  const here = location.pathname;
  $$('.lp-top-actions .lp-nav-link').forEach((a) => {
    const target = new URL(a.getAttribute('href'), location.href).pathname;
    if (target !== '/' && here.startsWith(target)) a.setAttribute('aria-current', 'page');
  });
}

// Guías en escritorio: el texto a la izquierda y, en la mitad derecha, que antes quedaba
// vacía, el índice de la guía y el botón para analizar. Se monta a partir de los títulos de
// la propia guía, así que no hay que mantenerlo a mano en cada página. La fecha de la guía
// (la de sus datos estructurados) va debajo de la entradilla.
function mountGuideRail() {
  const main = $('main.guide');
  if (!main) return;
  const heads = $$('main.guide section.guide-step > h2');
  heads.forEach((h, i) => { if (!h.id) h.id = `seccion-${i + 1}`; });
  const lead = $('main.guide .lp-lead');
  let modified = null;
  try {
    const ld = JSON.parse(($('script[type="application/ld+json"]') || {}).textContent || '{}');
    const nodes = ld['@graph'] || [ld];
    const article = nodes.find((n) => n['@type'] === 'Article');
    modified = article && (article.dateModified || article.datePublished);
  } catch { /* sin datos estructurados */ }
  if (lead && modified) {
    const when = new Date(`${modified}T12:00:00`);
    const meta = document.createElement('p');
    meta.className = 'guide-meta';
    meta.textContent = t('guide.updated', { date: when.toLocaleDateString(getLocale() === 'es' ? 'es-ES' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' }) });
    lead.after(meta);
  }
  if (heads.length < 3) return;
  const rail = document.createElement('aside');
  rail.className = 'guide-rail';
  rail.setAttribute('aria-label', t('guide.toc'));
  const inner = document.createElement('div');
  inner.className = 'guide-rail-inner';
  const k = document.createElement('p');
  k.className = 'guide-rail-k';
  k.textContent = t('guide.toc');
  const list = document.createElement('ol');
  heads.forEach((h) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${h.id}`;
    a.textContent = h.textContent.trim();
    li.append(a);
    list.append(li);
  });
  const cta = document.createElement('div');
  cta.className = 'guide-rail-cta';
  const q = document.createElement('p');
  q.textContent = t('guide.rail.q');
  const go = document.createElement('a');
  go.className = 'primary-btn';
  go.href = '/app/';
  go.textContent = t('lp.cta');
  cta.append(q, go);
  inner.append(k, list, cta);
  rail.append(inner);
  main.prepend(rail);
  // La sección que estás leyendo, marcada en el índice.
  if (typeof IntersectionObserver === 'undefined') return;
  const links = new Map(heads.map((h, i) => [h, list.children[i].firstChild]));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((a) => a.removeAttribute('aria-current'));
      links.get(e.target).setAttribute('aria-current', 'true');
    });
  }, { rootMargin: '0px 0px -70% 0px' });
  heads.forEach((h) => io.observe(h));
}

// Metodología: la explicación larga de «¿Por qué no pedírselo a una IA?» va plegada (la
// portada ya da el resumen), y se abre sola cuando se llega desde su enlace (#ia).
function openAiDetails() {
  const d = $('#ia details');
  if (d && location.hash === '#ia') d.open = true;
}

// Portada: «Lo que hay detrás del resultado» en pestañas. Sin JS se ven los cuatro paneles
// seguidos; con JS, uno cada vez. Teclado como en el patrón de pestañas de la WAI: flechas,
// Inicio y Fin mueven y activan.
function mountTabs() {
  $$('[data-tabs]').forEach((root) => {
    const tabs = Array.from(root.querySelectorAll('[role="tab"]'));
    const panes = tabs.map((tb) => document.getElementById(tb.getAttribute('aria-controls')));
    function select(i, focus) {
      tabs.forEach((tb, j) => {
        const on = i === j;
        tb.setAttribute('aria-selected', String(on));
        tb.tabIndex = on ? 0 : -1;
        panes[j].hidden = !on;
      });
      if (focus) tabs[i].focus();
    }
    tabs.forEach((tb, i) => {
      tb.addEventListener('click', () => select(i, false));
      tb.addEventListener('keydown', (e) => {
        const last = tabs.length - 1;
        const to = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        select(to, true);
      });
    });
    select(Math.max(0, tabs.findIndex((tb) => tb.getAttribute('aria-selected') === 'true')), false);
    root.classList.add('is-ready');
  });
}

// Qué se pulsa en las páginas públicas (botones, enlaces y pestañas con data-track). Solo
// el nombre del evento, anónimo, como en la app: sirve para decidir el diseño con datos.
document.addEventListener('click', (e) => {
  const el = e.target.closest && e.target.closest('[data-track]');
  if (el) track(el.dataset.track);
});

// Portada: el botón de la cabecera solo aparece cuando el de la tarjeta principal ya no se ve,
// para que nunca haya dos «Analizar mis resultados» a la vez en pantalla.
function syncHeaderCta() {
  const top = $('.lp-cta-top');
  const hero = $('.hm-hero .hm-cta');
  if (!top || !hero || !('IntersectionObserver' in window)) { if (top) top.classList.add('is-shown'); return; }
  new IntersectionObserver(([e]) => {
    const show = !e.isIntersecting;
    top.classList.toggle('is-shown', show);
    if (show) top.removeAttribute('tabindex'); else top.setAttribute('tabindex', '-1');
  }).observe(hero);
}

mountMobileMenu();
markCurrentSection();
mountGuideRail();
mountTabs();
syncHeaderCta();
openAiDetails();
window.addEventListener('hashchange', openAiDetails);
syncLang();
// Las páginas con idioma fijo ya vienen escritas en él (tools/build-es.js comprueba que
// su HTML coincide con js/i18n.js): solo la 404, común a los dos idiomas, se traduce aquí.
if (!document.documentElement.hasAttribute('data-lang-fixed')) applyStaticI18n();
syncNotFoundLinks();
enhanceRadioGroups();

