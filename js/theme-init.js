// Se ejecuta ANTES de pintar nada.
//
// Tema e idioma: si se aplicaran desde ui.js (modulo diferido), habria un fogonazo
// del valor por defecto al recargar. Van en un script clasico en el <head>.
//
// Idioma por defecto: ingles (mercado MT5). Español solo si el usuario lo eligio
// o si el navegador es espanol y aun no hay preferencia guardada.
try {
  var t = localStorage.getItem('orometra.theme');
  if (t === 'light' || t === 'cream' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) { /* modo privado */ }

try {
  var lang = localStorage.getItem('orometra.lang');
  if (lang !== 'en' && lang !== 'es') {
    var nav = (navigator.language || '').toLowerCase();
    lang = nav.indexOf('es') === 0 ? 'es' : 'en';
  }
  document.documentElement.setAttribute('lang', lang);
  document.documentElement.setAttribute('data-lang', lang);
} catch (e2) {
  document.documentElement.setAttribute('lang', 'en');
  document.documentElement.setAttribute('data-lang', 'en');
}
