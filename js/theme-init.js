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
    var map = { dark: '#070b14', light: '#f6f7f9' };
    meta.setAttribute('content', map[theme] || map.dark);
  }

  try {
    var t = localStorage.getItem('orometra.theme');
    if (t === 'cream') {
      t = 'light';
      try { localStorage.setItem('orometra.theme', 'light'); } catch (eWrite) { /* privado */ }
    }
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
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
    // El HTML estatico esta en ingles. Si el visitante lo ve en español, pintarlo antes
    // de traducir hace que los textos cambien de longitud y todo salte (CLS 0,24 en la
    // app en movil). Se oculta hasta que i18n.js traduce; por seguridad, 1,5 s como mucho.
    if (lang !== 'en') {
      document.documentElement.classList.add('i18n-pending');
      setTimeout(function () { document.documentElement.classList.remove('i18n-pending'); }, 1500);
    }
  } catch (e2) {
    document.documentElement.setAttribute('lang', 'en');
    document.documentElement.setAttribute('data-lang', 'en');
  }

  // Export minimo para landing/app (script clasico, no modulo).
  window.__orometraSyncThemeColor = syncThemeColor;
})();
