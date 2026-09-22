// Se ejecuta ANTES de pintar nada.
//
// Tema e idioma: si se aplicaran desde ui.js (modulo diferido), habria un fogonazo
// del valor por defecto al recargar. Van en un script clasico en el <head>.
//
// Idioma por defecto: ingles (mercado MT5). Español solo si el usuario lo eligio
// o si el navegador es espanol y aun no hay preferencia guardada.
(function () {
  function syncThemeColor() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    var theme = document.documentElement.getAttribute('data-theme') || 'dark';
    var map = { dark: '#070b14', light: '#f6f7f9', cream: '#f6f2e9' };
    meta.setAttribute('content', map[theme] || map.dark);
  }

  try {
    var t = localStorage.getItem('orometra.theme');
    if (t === 'light' || t === 'cream' || t === 'dark') document.documentElement.dataset.theme = t;
  } catch (e) { /* modo privado */ }
  syncThemeColor();

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

  // Export minimo para landing/app (script clasico, no modulo).
  window.__orometraSyncThemeColor = syncThemeColor;
})();
