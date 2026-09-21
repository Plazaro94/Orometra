// Idioma de la interfaz. Inglés por defecto (mercado MT5 global); español opcional.
//
// En el navegador el idioma vive en <html lang> (lo pone theme-init.js antes de pintar).
// En Node (tests) se fuerza español para no romper las aserciones del motor.

const KEY = 'orometra.lang';

export function getLocale() {
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
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', next);
    document.documentElement.setAttribute('data-lang', next);
  }
  try { localStorage.setItem(KEY, next); } catch { /* privado */ }
  applyStaticI18n();
  syncDocumentMeta();
  return next;
}

export function applyStaticI18n() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    const attr = el.getAttribute('data-i18n-attr');
    const value = t(key);
    if (attr) el.setAttribute(attr, value);
    else el.textContent = value;
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html');
    if (key) el.innerHTML = t(key);
  });
}

function syncDocumentMeta() {
  if (typeof document === 'undefined') return;
  const title = t('meta.title');
  const desc = t('meta.description');
  document.title = title;
  const md = document.querySelector('meta[name="description"]');
  if (md) md.setAttribute('content', desc);
  const ogt = document.querySelector('meta[property="og:title"]');
  if (ogt) ogt.setAttribute('content', title);
  const ogd = document.querySelector('meta[property="og:description"]');
  if (ogd) ogd.setAttribute('content', desc);
  const ogl = document.querySelector('meta[property="og:locale"]');
  if (ogl) ogl.setAttribute('content', getLocale() === 'es' ? 'es_ES' : 'en_US');
}

const STRINGS = {
  en: {
    'meta.title': 'Orometra — MT5 Optimization Robustness Analyzer',
    'meta.description': 'Find stable parameter plateaus in your MetaTrader 5 optimizations — not isolated peaks. Top 3 configurations with reasons. Analysis runs entirely in your browser.',

    'skip': 'Skip to content',
    'brand.sub': 'MT5 optimization audit',
    'brand.home': 'Back to home',
    'nav.label': 'Analysis',
    'nav.verdict': 'Verdict',
    'nav.plateaus': 'Plateaus',
    'nav.rejected': 'Rejected',
    'nav.params': 'Parameters',
    'nav.diagnostics': 'Diagnostics',
    'nav.unseen': 'Unseen period',
    'nav.method': 'Methodology',
    'theme.label': 'Color theme',
    'theme.dark': 'Dark',
    'theme.light': 'Light',
    'theme.cream': 'Cream',
    'lang.label': 'Language',
    'legal.link': 'Legal notice & privacy',
    'version': 'v2 · absolute plateau engine',

    'top.eyebrow': 'Quantitative robustness analysis',
    'top.h1': 'Find <em>plateaus</em>, not peaks.',
    'btn.demo': 'See a full analysis',
    'btn.policy': 'Minimum gates',
    'btn.export': 'Export',

    'hero.h1': 'Is your EA good,<br>or just lucky?',
    'hero.lead': 'You optimize thousands of configurations. MT5 sorts a table. <strong>Orometra tells you which ones hold.</strong>',
    'hero.p1.title': 'Plateaus, not maxima',
    'hero.p1.body': 'It walks the configurations you tested and finds regions where <em>neighboring parameters also work</em>. If moving one value one step collapses the result, that is not a configuration — it is a coincidence.',
    'hero.p2.title': 'Top 3, with reasons',
    'hero.p2.body': 'Three concrete configurations with all parameters, and the measured case for why they are there: how many neighbors support them, what they retain out of sample, and where the risks sit.',
    'hero.p3.title': 'How strong the evidence is',
    'hero.p3.body': 'It does not decide for you — it measures. If a region is weakly supported, it says so and explains exactly what is missing. Trading decisions stay yours.',
    'hero.back': '← Back to your analysis',
    'hero.reset': 'Start over',

    'intake.label': 'File upload',
    'drop.is.title': 'In-Sample',
    'drop.is.req': 'required',
    'drop.is.status': 'Drop both files anywhere on the page',
    'drop.oos.title': 'Forward',
    'drop.oos.opt': 'recommended',
    'drop.oos.status': 'Detected by content, not by which box you use',
    'drop.choose': 'Choose',
    'analyze.label': 'Audit',
    'analyze.sub': 'Load at least the in-sample file',
    'analyze.busy': 'Auditing…',
    'analyze.ready': 'Ready to audit',
    'analyze.needIs': 'Load at least the in-sample file',

    'policy.h2': 'Minimums a configuration must meet',
    'policy.p': 'Required in <strong>both periods</strong>. Anything that fails is out, no matter how high it ranks in your MT5 table. The forward trade-count minimum is rescaled by estimated duration.',
    'policy.pf': 'Minimum profit factor',
    'policy.dd': 'Maximum drawdown (%)',
    'policy.trades': 'Minimum trades (in-sample)',
    'policy.profit': 'Require positive profit',
    'policy.previewNote': 'configurations would pass these gates',
    'policy.rerun': 'Recalculate with these gates',

    'progress': 'Analyzing…',
    'error.title': 'Analysis failed',
    'drop.overlay.title': 'Drop files here',
    'drop.overlay.body': 'Anywhere on the page. The app detects which file is in-sample and which is forward.',

    'empty.h2': 'Upload your optimization results',
    'empty.p': 'The app identifies parameters and metrics by structure, not by column names or terminal language. Then it rebuilds the result surface, measures local stability, and reports.',
    'empty.s1': 'In MT5, Optimization tab: right-click → <em>XML Report</em>. If you used Forward, export that tab too.',
    'empty.s2': 'Upload in-sample and, if you have it, forward. Both files must be from the <em>same</em> optimization.',
    'empty.s3': 'Read the verdict, not the ranking. The top of your table is almost never the right choice.',
    'empty.method': 'See how a plateau is defined →',

    'verdict.insufficient': 'INSUFFICIENT EVIDENCE',
    'verdict.weak': 'WEAK EVIDENCE',
    'verdict.moderate': 'MODERATE EVIDENCE',
    'verdict.strong': 'STRONG EVIDENCE',
    'verdict.next': 'What you can do:',

    'export.json': 'Full report (JSON)',
    'export.csv': 'All configurations (CSV)',
    'export.set': 'Proposed configuration (.set)',
    'export.refine': 'Refinement range (.set)',

    'demo.loaded': 'Synthetic example loaded',

    'lp.eyebrow': 'MT5 optimization robustness',
    'lp.h1': 'Find <em>plateaus</em>, not peaks.',
    'lp.lead': 'You optimize thousands of configurations. MT5 sorts a table. <strong>Orometra tells you which ones hold</strong> — and when the evidence is too weak to trust.',
    'lp.cta': 'Open app',
    'lp.demo': 'See a full analysis',
    'lp.privacy': 'Your files never leave your browser. No accounts. No upload to a server.',
    'lp.compare.title': 'From MT5 chaos to inspectable evidence',
    'lp.compare.before.kicker': 'Before · MT5',
    'lp.compare.before.title': 'Optimization results',
    'lp.compare.before.meta': '12,482 passes · sorted by Result',
    'lp.compare.col.pass': 'Pass',
    'lp.compare.col.result': 'Result',
    'lp.compare.col.pf': 'PF',
    'lp.compare.before.note': 'The #1 row looks irresistible. Neighbors and out-of-sample behaviour are invisible.',
    'lp.compare.before.spark': 'Isolated peak',
    'lp.compare.after.kicker': 'After · Orometra',
    'lp.compare.after.title': 'Robustness audit',
    'lp.compare.after.stamp': 'MODERATE EVIDENCE',
    'lp.compare.after.rejected': 'Rejected #1',
    'lp.compare.after.rejected.val': 'Pass 1842 · isolated peak · 3/36 neighbors',
    'lp.compare.after.selected': 'Selected instead',
    'lp.compare.after.selected.val': 'Pass 4283 · plateau center · 31/36 neighbors',
    'lp.compare.after.oos': 'OOS retention',
    'lp.compare.after.warn': 'Main warning',
    'lp.compare.after.warn.val': 'Near the edge of the tested range',
    'lp.compare.after.spark': 'Stable plateau',
    'lp.compare.caption': 'Illustrative example. Your audit explains why a configuration was selected or rejected — not just a score.',
    'lp.what.title': 'What you get',
    'lp.what.1.title': 'Stable regions, not luck',
    'lp.what.1.body': 'Finds connected neighborhoods where neighboring parameters also work. An isolated spike is rejected, even if it topped your MT5 table.',
    'lp.what.2.title': 'Top 3 with reasons',
    'lp.what.2.body': 'Three concrete configurations, neighbor support, out-of-sample behaviour, and the risks that still apply.',
    'lp.what.3.title': 'Evidence strength',
    'lp.what.3.body': 'Strong, moderate, weak, or insufficient. Orometra measures what your data can support — it does not promise future profits.',
    'lp.how.title': 'How it works',
    'lp.how.1': '<strong>Export</strong> your MT5 Optimization report (XML). Add Forward if you used it.',
    'lp.how.2': '<strong>Drop</strong> the files in the app. In-sample and forward are detected by content.',
    'lp.how.3': '<strong>Read</strong> the verdict, plateaus, and rejected peaks — then export a .set to refine in MT5.',
    'lp.not.title': 'What Orometra does not do',
    'lp.not.1': 'It does not predict the market or guarantee returns.',
    'lp.not.2': 'It does not pick the highest-profit pass by default.',
    'lp.not.3': 'It does not turn a weak EA into a strong one.',
    'lp.final.title': 'Ready to audit an optimization?',
    'lp.final.body': 'Open the app, load your MT5 results, and see whether the best rows deserve trust.',
  },
  es: {
    'meta.title': 'Orometra — Analizador de robustez de optimizaciones MT5',
    'meta.description': 'Encuentra las zonas estables de tu EA de MetaTrader 5: mesetas en vez de picos, Top 3 con su porqué. Todo el análisis se ejecuta en tu navegador.',

    'skip': 'Saltar al contenido',
    'brand.sub': 'Auditoría de optimizaciones MT5',
    'brand.home': 'Ir a la portada',
    'nav.label': 'Análisis',
    'nav.verdict': 'Veredicto',
    'nav.plateaus': 'Mesetas',
    'nav.rejected': 'Descartes',
    'nav.params': 'Parámetros',
    'nav.diagnostics': 'Diagnóstico',
    'nav.unseen': 'Periodo no visto',
    'nav.method': 'Metodología',
    'theme.label': 'Tema de color',
    'theme.dark': 'Oscuro',
    'theme.light': 'Claro',
    'theme.cream': 'Crema',
    'lang.label': 'Idioma',
    'legal.link': 'Aviso legal y privacidad',
    'version': 'v2 · motor de mesetas absoluto',

    'top.eyebrow': 'Análisis cuantitativo de robustez',
    'top.h1': 'Busca <em>mesetas</em>, no cimas.',
    'btn.demo': 'Ver un análisis completo',
    'btn.policy': 'Mínimos exigidos',
    'btn.export': 'Exportar',

    'hero.h1': '¿Tu EA es bueno,<br>o solo tuvo suerte?',
    'hero.lead': 'Optimizas miles de configuraciones. MT5 te ordena una tabla. <strong>Orometra te dice cuál aguanta.</strong>',
    'hero.p1.title': 'Busca mesetas, no máximos',
    'hero.p1.body': 'Recorre las miles de configuraciones que probaste y localiza las regiones donde <em>los parámetros vecinos también funcionan</em>. Si mover un valor un paso hunde el resultado, eso no es una configuración: es una coincidencia.',
    'hero.p2.title': 'Te da el Top 3, y el porqué',
    'hero.p2.body': 'Tres configuraciones concretas con todos sus parámetros, y el argumento medido de por qué están ahí: cuántas vecinas las sostienen, qué aguantan fuera de muestra y dónde están sus riesgos.',
    'hero.p3.title': 'Y te dice cuánto pesa la evidencia',
    'hero.p3.body': 'No decide por ti: mide. Si lo que sostiene a una zona es poco, te lo dice y te explica exactamente qué falta. Decidir qué operar sigue siendo tuyo.',
    'hero.back': '← Volver a tu análisis',
    'hero.reset': 'Empezar de cero',

    'intake.label': 'Carga de archivos',
    'drop.is.title': 'In-Sample',
    'drop.is.req': 'obligatorio',
    'drop.is.status': 'Suelta los dos archivos en cualquier parte',
    'drop.oos.title': 'Forward',
    'drop.oos.opt': 'recomendado',
    'drop.oos.status': 'Se detecta por su contenido, no por donde lo sueltes',
    'drop.choose': 'Elegir',
    'analyze.label': 'Auditar',
    'analyze.sub': 'Carga al menos el archivo in-sample',
    'analyze.busy': 'Auditando…',
    'analyze.ready': 'Listo para auditar',
    'analyze.needIs': 'Carga al menos el archivo in-sample',

    'policy.h2': 'Mínimos que debe cumplir una configuración',
    'policy.p': 'Se exigen en <strong>los dos periodos</strong>. Quien no los cumple queda fuera, por muy arriba que salga en tu tabla de MT5. El mínimo de operaciones del forward se reescala según su duración estimada.',
    'policy.pf': 'Factor de beneficio mínimo',
    'policy.dd': 'Drawdown máximo (%)',
    'policy.trades': 'Operaciones mínimas (in-sample)',
    'policy.profit': 'Exigir beneficio positivo',
    'policy.previewNote': 'configuraciones superarían estos mínimos',
    'policy.rerun': 'Recalcular con estos mínimos',

    'progress': 'Analizando…',
    'error.title': 'No se ha podido analizar',
    'drop.overlay.title': 'Suelta aquí los archivos',
    'drop.overlay.body': 'Da igual en qué parte de la página. La app reconoce cuál es el in-sample y cuál el forward.',

    'empty.h2': 'Sube los resultados de tu optimización',
    'empty.p': 'La aplicación identifica por sí sola cuáles de tus columnas son parámetros y cuáles son métricas, sin depender de su nombre ni del idioma del terminal. Después reconstruye la superficie de resultados, mide la estabilidad alrededor de cada configuración y decide.',
    'empty.s1': 'En MT5, pestaña de optimización: botón derecho → <em>Informe XML</em>. Si usaste forward, exporta también esa pestaña.',
    'empty.s2': 'Sube el in-sample y, si lo tienes, el forward. Son los dos archivos de la <em>misma</em> optimización.',
    'empty.s3': 'Revisa el veredicto, no el ranking. La cima de tu tabla casi nunca es la elección correcta.',
    'empty.method': 'Ver cómo se define una meseta →',

    'verdict.insufficient': 'EVIDENCIA INSUFICIENTE',
    'verdict.weak': 'EVIDENCIA DÉBIL',
    'verdict.moderate': 'EVIDENCIA MODERADA',
    'verdict.strong': 'EVIDENCIA SÓLIDA',
    'verdict.next': 'Qué puedes hacer:',

    'export.json': 'Informe completo (JSON)',
    'export.csv': 'Todas las configuraciones (CSV)',
    'export.set': 'Configuración propuesta (.set)',
    'export.refine': 'Rango de refinamiento (.set)',

    'demo.loaded': 'Ejemplo sintético cargado',

    'lp.eyebrow': 'Robustez de optimizaciones MT5',
    'lp.h1': 'Busca <em>mesetas</em>, no cimas.',
    'lp.lead': 'Optimizas miles de configuraciones. MT5 te ordena una tabla. <strong>Orometra te dice cuál aguanta</strong> — y cuándo la evidencia es demasiado débil.',
    'lp.cta': 'Abrir la app',
    'lp.demo': 'Ver un análisis completo',
    'lp.privacy': 'Tus archivos no salen del navegador. Sin cuentas. Sin subida a un servidor.',
    'lp.compare.title': 'Del caos de MT5 a evidencia que se puede inspeccionar',
    'lp.compare.before.kicker': 'Antes · MT5',
    'lp.compare.before.title': 'Resultados de optimización',
    'lp.compare.before.meta': '12.482 pasadas · ordenadas por Result',
    'lp.compare.col.pass': 'Pass',
    'lp.compare.col.result': 'Result',
    'lp.compare.col.pf': 'PF',
    'lp.compare.before.note': 'La fila #1 parece irresistible. Los vecinos y el fuera de muestra no se ven.',
    'lp.compare.before.spark': 'Pico aislado',
    'lp.compare.after.kicker': 'Después · Orometra',
    'lp.compare.after.title': 'Auditoría de robustez',
    'lp.compare.after.stamp': 'EVIDENCIA MODERADA',
    'lp.compare.after.rejected': 'Descartado el #1',
    'lp.compare.after.rejected.val': 'Pass 1842 · pico aislado · 3/36 vecinas',
    'lp.compare.after.selected': 'Elegido en su lugar',
    'lp.compare.after.selected.val': 'Pass 4283 · centro de meseta · 31/36 vecinas',
    'lp.compare.after.oos': 'Retención OOS',
    'lp.compare.after.warn': 'Aviso principal',
    'lp.compare.after.warn.val': 'Pegado al borde del rango probado',
    'lp.compare.after.spark': 'Meseta estable',
    'lp.compare.caption': 'Ejemplo ilustrativo. Tu auditoría explica por qué se eligió o se descartó una configuración — no solo una nota.',
    'lp.what.title': 'Qué obtienes',
    'lp.what.1.title': 'Regiones estables, no suerte',
    'lp.what.1.body': 'Encuentra barrios de parámetros donde los vecinos también funcionan. Un pico aislado se descarta, aunque encabece tu tabla de MT5.',
    'lp.what.2.title': 'Top 3 con porqués',
    'lp.what.2.body': 'Tres configuraciones concretas, soporte de vecinas, comportamiento fuera de muestra y los riesgos que siguen aplicando.',
    'lp.what.3.title': 'Fuerza de la evidencia',
    'lp.what.3.body': 'Sólida, moderada, débil o insuficiente. Orometra mide lo que tus datos pueden sostener — no promete beneficios futuros.',
    'lp.how.title': 'Cómo funciona',
    'lp.how.1': '<strong>Exporta</strong> el informe de Optimización de MT5 (XML). Si usaste Forward, exporta también esa pestaña.',
    'lp.how.2': '<strong>Suelta</strong> los archivos en la app. El in-sample y el forward se detectan por contenido.',
    'lp.how.3': '<strong>Lee</strong> el veredicto, las mesetas y los descartes — luego exporta un .set para refinar en MT5.',
    'lp.not.title': 'Lo que Orometra no hace',
    'lp.not.1': 'No predice el mercado ni garantiza rentabilidad.',
    'lp.not.2': 'No elige por defecto el pass de mayor beneficio.',
    'lp.not.3': 'No convierte un EA débil en uno fuerte.',
    'lp.final.title': '¿Listo para auditar una optimización?',
    'lp.final.body': 'Abre la app, carga tus resultados de MT5 y comprueba si las mejores filas merecen confianza.',
  },
};
