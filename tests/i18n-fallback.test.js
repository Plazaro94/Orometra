// Si el navegador tiene en caché un i18n.js anterior a la página, la página trae claves
// que ese archivo no conoce. Antes se escribía el nombre de la clave («home.take.title»)
// encima del texto bueno que ya traía el HTML; ahora se deja el texto.
//
//   node tests/i18n-fallback.test.js

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}

// Un DOM mínimo: solo lo que usa applyStaticI18n.
function el(attrs, text) {
  return {
    attrs: { ...attrs },
    textContent: text,
    innerHTML: text,
    getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; },
    setAttribute(n, v) { this.attrs[n] = v; },
  };
}
const known = el({ 'data-i18n': 'home.trust' }, 'texto viejo');
const unknown = el({ 'data-i18n': 'home.no.existe' }, 'Lo que te llevas');
const unknownAttr = el({ 'data-i18n': 'home.no.existe.attr', 'data-i18n-attr': 'aria-label', 'aria-label': 'Etiqueta buena' }, '');
const unknownHtml = el({ 'data-i18n-html': 'home.no.existe.html' }, '<b>HTML bueno</b>');
globalThis.document = {
  documentElement: { getAttribute: (n) => (n === 'lang' ? 'es' : null), classList: { contains: () => false }, lang: 'es' },
  body: null,
  title: '',
  querySelector: () => null,
  querySelectorAll: (sel) => (sel === '[data-i18n]' ? [known, unknown, unknownAttr] : sel === '[data-i18n-html]' ? [unknownHtml] : []),
};
globalThis.location = { pathname: '/es/' };

const { applyStaticI18n, t } = await import('../js/i18n.js');
try { applyStaticI18n(); } catch (e) { check('applyStaticI18n no lanza con un DOM mínimo', false, e.message); }

check('una clave conocida se traduce', known.textContent === t('home.trust'), known.textContent);
check('una clave desconocida deja el texto del HTML', unknown.textContent === 'Lo que te llevas', unknown.textContent);
check('...también en atributos', unknownAttr.attrs['aria-label'] === 'Etiqueta buena', unknownAttr.attrs['aria-label']);
check('...y en HTML', unknownHtml.innerHTML === '<b>HTML bueno</b>', unknownHtml.innerHTML);

console.log(`\nRESULTADO: ${checks - failures}/${checks} comprobaciones correctas`);
if (failures) process.exit(1);
