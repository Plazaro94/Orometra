// Idioma de la interfaz. Inglés por defecto (mercado MT5 global); español opcional.
//
// En el navegador el idioma vive en <html lang> (lo pone theme-init.js antes de pintar).
// En Node (tests) se fuerza español para no romper las aserciones del motor.
// En el Web Worker no hay `document`: el hilo principal debe llamar setLocale()
// con el idioma activo antes de construir el veredicto, o L() caería siempre en ES.

const KEY = 'orometra.lang';
let activeLocale = null;

export function getLocale() {
  if (activeLocale === 'es' || activeLocale === 'en') return activeLocale;
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
  activeLocale = next;
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', next);
    document.documentElement.setAttribute('data-lang', next);
    try { localStorage.setItem(KEY, next); } catch { /* privado */ }
  }
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
    'nav.group.result': 'Result',
    'nav.group.evidence': 'Evidence',
    'nav.group.diagnostics': 'Diagnostics',
    'nav.group.validation': 'Validation',
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
    'lang.label': 'Language',
    'legal.link': 'Legal notice & privacy',
    'version': 'v2 · absolute plateau engine',

    'top.eyebrow': 'Quantitative robustness analysis',
    'top.h1': 'Find <em>plateaus</em>, not peaks.',
    'top.report.eyebrow': 'Audit report',
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
    'drop.is.status': 'Drop both files anywhere on the page',
    'drop.oos.title': 'Forward',
    'drop.oos.status': 'Detected by content, not by which box you use',
    'drop.set.hint': 'Optional: drop the optimization .set (start||step||stop||Y) anywhere to contrast coverage vs the search range you asked MT5 for.',
    'drop.choose': 'Choose',
    'intake.change': 'Change files',
    'analyze.label': 'Audit',
    'analyze.sub': 'Load in-sample and forward',
    'analyze.busy': 'Auditing…',
    'analyze.ready': 'Ready to audit',
    'analyze.needIs': 'Load the in-sample file',
    'analyze.needOos': 'Load the forward file too — without it there is no out-of-sample check',
    'preflight.kicker': 'Data check',
    'preflight.title': 'Ready to audit',
    'preflight.note.ok': 'Files look readable. Press Audit to run the robustness engine.',
    'preflight.note.warn': 'Something looks off in at least one file. Fix it before auditing, or the engine will stop with a clear error.',
    'preflight.rows': 'Rows',
    'preflight.params': 'Parameters',
    'preflight.metrics': 'Metrics',
    'preflight.reading': 'Reading…',
    'preflight.error': 'Could not inspect',
    'outcome.banner.success': 'Audit complete',
    'outcome.banner.no_qualifying': 'No qualifying configurations',
    'outcome.banner.insufficient': 'Insufficient data for a plateau',
    'outcome.banner.no_plateau': 'No stable plateau',

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
    'verdict.next': 'What you can do',
    'verdict.pick': 'Selected',
    'verdict.nopick': 'No configuration selected',

    'export.summary': 'Plain summary (.txt)',
    'export.json': 'Full report (JSON)',
    'export.csv': 'All configurations (CSV)',
    'export.set': 'Proposed configuration (.set)',
    'export.refine': 'Refinement range (.set)',

    'demo.loaded': 'Synthetic example loaded',

    'lp.eyebrow': 'MT5 optimization robustness',
    'lp.h1': 'Find <em>plateaus</em>, not peaks.',
    'lp.lead': 'You optimize thousands of configurations. MT5 sorts a table. <strong>Orometra tells you which ones hold</strong> — and when the evidence is too weak to trust.',
    'lp.cta': 'Open app',
    'lp.cta.footer': 'App',
    'lp.demo': 'See a full analysis',
    'lp.proof': 'Includes a synthetic demo with a planted plateau — open <strong>See a full analysis</strong> to inspect a complete audit without uploading files.',
    'lp.hero.region': 'Product',
    'lp.surface.aria': 'Parameter surface: isolated peaks collapse into a stable plateau',
    'lp.surface.state.peaks': 'Showing isolated peaks',
    'lp.surface.state.plateau': 'Showing stable plateau',
    'lp.surface.hint': 'Hover — peaks collapse into the plateau',
    'lp.surface.hint.touch': 'Watch — peaks fall and the plateau remains',
    'lp.privacy': 'Your files never leave your browser. No accounts. No upload to a server.',
    'lp.compare.title': 'From MT5 chaos to inspectable evidence',
    'lp.compare.before.kicker': 'Before · MT5',
    'lp.compare.before.title': 'Optimization results',
    'lp.compare.before.meta': '12,482 passes · sorted by Result',
    'lp.compare.col.rank': '#',
    'lp.compare.col.pass': 'Pass',
    'lp.compare.col.result': 'Result',
    'lp.compare.col.pf': 'PF',
    'lp.compare.tag.best': 'Best',
    'lp.compare.tag.rejected': '#1 rejected',
    'lp.compare.before.spark': 'Isolated peak',
    'lp.compare.after.kicker': 'After · Orometra',
    'lp.compare.after.title': 'Robustness audit',
    'lp.compare.after.stamp': 'MODERATE EVIDENCE',
    'lp.compare.after.selected': 'Selected instead',
    'lp.compare.after.selected.why': 'Plateau center · maximin · not the profit peak',
    'lp.compare.after.spark': 'Stable plateau',
    'lp.compare.caption': 'Illustrative example. Your audit explains why a configuration was selected or rejected — not just a score.',
    'lp.what.kicker': 'Product',
    'lp.what.title': 'What you get',
    'lp.what.1.title': 'Stable regions, not luck',
    'lp.what.1.body': 'Finds connected neighborhoods where neighboring parameters also work, shown as a real 3D surface — not this page\'s illustration. An isolated spike is rejected, even if it topped your MT5 table.',
    'lp.what.2.title': 'Top 3 with reasons',
    'lp.what.2.body': 'Three concrete configurations, neighbor support, out-of-sample behaviour, and the risks that still apply.',
    'lp.what.3.title': 'Evidence strength',
    'lp.what.3.body': 'Strong, moderate, weak, or insufficient. Orometra measures what your data can support — it does not promise future profits.',
    'lp.what.4.title': 'Robustness under real costs',
    'lp.what.4.body': 'Drop your backtest report on the unseen period and get a Monte Carlo over your actual trades, a sample-size check, and a cost-stress table — no install, straight from the trade list MT5 already gives you.',
    'lp.avoid.kicker': 'Risk',
    'lp.avoid.title': 'Three mistakes it prevents',
    'lp.avoid.1.title': 'Trusting the #1 row',
    'lp.avoid.1.body': 'The top of an MT5 table is often an isolated peak. Neighbors and out-of-sample behaviour stay invisible until you audit the surface.',
    'lp.avoid.2.title': 'Averaging away risk',
    'lp.avoid.2.body': 'Orometra scores by the worse period and by maximin neighborhoods — not by an average that hides a fragile edge.',
    'lp.avoid.3.title': 'Confusing evidence with a GO',
    'lp.avoid.3.body': 'A strong grade means the data can support a stable region. It is not permission to trade or a forecast of future profit.',
    'lp.how.kicker': 'Workflow',
    'lp.how.title': 'How it works',
    'lp.how.tagline': 'Optimize. Export. Audit.',
    'lp.how.1': '<strong>Optimize</strong> with Forward on. Split in-sample and out-of-sample in the Strategy Tester before you run the optimization, not after — it\'s the only way the forward period is genuinely one you never used to choose. Export both reports (XML).',
    'lp.how.2': '<strong>Drop</strong> the files in the app. In-sample and forward are detected by content.',
    'lp.how.3': '<strong>Read</strong> the verdict, plateaus, and rejected peaks. Export a .set to refine in MT5, or drop a single backtest report to see Monte Carlo and cost stress on your actual trades.',
    'lp.method.bridge': 'How the engine decides — gates, plateaus, maximin — is documented in the <a href="methodology/">methodology</a>.',
    'lp.not.kicker': 'Limits',
    'lp.not.title': 'What Orometra does not do',
    'lp.not.1': 'It does not predict the market or guarantee returns.',
    'lp.not.2': 'It does not pick the highest-profit pass by default.',
    'lp.not.3': 'It does not turn a weak EA into a strong one.',
    'lp.final.title': 'Ready to audit an optimization?',
    'lp.final.body': 'Open the app, load your MT5 results, and see whether the best rows deserve trust.',
    'lp.final.cta': 'Audit my optimization',
    'lp.foot.tagline': 'Plateaus over peaks. Analysis stays in your browser.',

    'doc.method.eyebrow': 'Methodology',
    'doc.method.h1': 'How the engine decides',
    'doc.method.lead': 'We do not re-rank your MT5 table. We look for stable zones — and tell you how strong the evidence is.',
    'doc.method.pipe.1.title': 'Gates',
    'doc.method.pipe.1.body': 'Your minima in both periods',
    'doc.method.pipe.2.title': 'Quality',
    'doc.method.pipe.2.body': 'Rebuilt without Result',
    'doc.method.pipe.3.title': 'Neighborhood',
    'doc.method.pipe.3.body': 'Do neighbors also hold?',
    'doc.method.pipe.4.title': 'Plateau',
    'doc.method.pipe.4.body': 'Connected good zones',
    'doc.method.pipe.5.title': 'Pick',
    'doc.method.pipe.5.body': 'Center of the plateau, not the peak',
    'doc.method.pipe.6.title': 'Unseen',
    'doc.method.pipe.6.body': 'Optional clean check',
    'doc.method.s1.title': '1. Minima before rankings',
    'doc.method.s1.body': 'A setup only enters if it clears your floors (PF, drawdown, trades, profit) in both periods. Rankings always invent a “top 5%” — even when everything loses.',
    'doc.method.s2.title': '2. Quality without Result',
    'doc.method.s2.body': 'MT5’s Result column is whatever you optimized for. We rebuild quality from objective exports (PF, recovery, Sharpe, drawdown, trades). Score = worse of in-sample and forward — not the average.',
    'doc.method.s3.title': '3. Plateaus, not peaks',
    'doc.method.s3.body': 'Isolated spikes are rejected. A plateau is a zone where neighbors also clear your minima. We pick the center (maximin), not the profit tip.',
    'doc.method.s4.title': '4. Evidence strength — not a trade signal',
    'doc.method.s4.body': 'The verdict is strong / moderate / weak / insufficient. It never means “go trade”. Too little data is not the same as “no plateau”.',
    'doc.method.s5.title': '5. Stress-tested on your actual trades',
    'doc.method.s5.body': 'The optimization grid only has aggregated per-pass metrics — never enough for a real Monte Carlo. But the backtest report of your chosen configuration on the unseen period does carry the trade-by-trade list, and that unlocks three checks the grid alone cannot give you: a stationary-bootstrap Monte Carlo over your real trades, a sample-size check (can this many days actually tell your edge from noise?), and a cost-stress table for what happens if your real live spread, slippage or commission are worse than what you optimized with. Drop the report — a real MT5 backtest, not an optimization export — anywhere on the “Unseen period” step.',
    'doc.method.s6.title': '6. What we do not claim',
    'doc.method.s6.1': 'A plateau is stability in your sample — not proof of future edge.',
    'doc.method.s6.2': 'We do not invent classic PBO / Reality Check / SPA: MT5 optimization files lack the equity curves those tests need.',
    'doc.method.s6.3': 'Forward already helps select, so it is slightly “contaminated”; the cleanest check is a true unseen period.',
    'doc.method.s6.4': 'We do not tell you to buy, sell, or fund an EA. Evidence ≠ permission to trade.',
    'doc.method.cta': 'Try it with my files',
    'doc.method.full': 'Full technical detail in the app →',

    'doc.privacy.nav': 'Privacy',
    'doc.privacy.eyebrow': 'Privacy',
    'doc.privacy.h1': 'Your files never leave your browser',
    'doc.privacy.lead': 'This is not a policy promise about servers we control carefully. There is no analysis backend: the audit runs as JavaScript on your machine.',
    'doc.privacy.claim1.kicker': 'Architecture',
    'doc.privacy.claim1.title': 'No backend',
    'doc.privacy.claim1.body': 'Analysis runs as JavaScript in your browser. There is no server that receives your optimization tables.',
    'doc.privacy.claim2.kicker': 'Files',
    'doc.privacy.claim2.title': 'No uploads',
    'doc.privacy.claim2.body': 'Reports are read in memory and discarded when you close the tab. Nothing is stored on our side.',
    'doc.privacy.claim3.kicker': 'Product',
    'doc.privacy.claim3.title': 'No analytics',
    'doc.privacy.claim3.body': 'No accounts, no tracking cookies, no product analytics on your EA, parameters or results.',
    'doc.privacy.s1.title': 'What we do not collect',
    'doc.privacy.s1.1': 'No file uploads. Your MT5 XML/CSV/HTML reports are read in memory and discarded when you close the tab.',
    'doc.privacy.s1.2': 'No accounts, registration, tracking cookies or product analytics.',
    'doc.privacy.s1.3': 'We do not see your EA parameters, optimization results or strategy logic.',
    'doc.privacy.s2.title': 'What stays only on your device',
    'doc.privacy.s2.body': 'The browser may store locally (never sent to us): your color theme, language preference, and the minimum gates you configure — so you do not have to re-enter them. You can clear them by wiping site data for this domain.',
    'doc.privacy.s3.title': 'What we cannot avoid',
    'doc.privacy.s3.body': 'Any host that serves the website (for example GitHub Pages) logs basic HTTP requests: IP address, time, browser. That is normal for every website and is unrelated to the contents of your optimization files.',
    'doc.privacy.s4.title': 'Disclaimer',
    'doc.privacy.s4.body': 'Orometra is a statistical analysis tool, not financial advice. A favorable evidence grade is not a recommendation to buy, sell or fund an EA. Past results do not guarantee future performance.',
    'doc.privacy.full': 'Full legal text in the app →',
  },
  es: {
    'meta.title': 'Orometra — Analizador de robustez de optimizaciones MT5',
    'meta.description': 'Encuentra las zonas estables de tu EA de MetaTrader 5: mesetas en vez de picos, Top 3 con su porqué. Todo el análisis se ejecuta en tu navegador.',

    'skip': 'Saltar al contenido',
    'brand.sub': 'Auditoría de optimizaciones MT5',
    'brand.home': 'Ir a la portada',
    'nav.label': 'Análisis',
    'nav.group.result': 'Resultado',
    'nav.group.evidence': 'Evidencia',
    'nav.group.diagnostics': 'Diagnóstico',
    'nav.group.validation': 'Validación',
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
    'lang.label': 'Idioma',
    'legal.link': 'Aviso legal y privacidad',
    'version': 'v2 · motor de mesetas absoluto',

    'top.eyebrow': 'Análisis cuantitativo de robustez',
    'top.h1': 'Busca <em>mesetas</em>, no picos.',
    'top.report.eyebrow': 'Informe de auditoría',
    'btn.demo': 'Ver un análisis completo',
    'btn.policy': 'Mínimos exigidos',
    'btn.export': 'Exportar',

    'hero.h1': '¿Tu EA es bueno,<br>o solo tuvo suerte?',
    'hero.lead': 'Optimizas miles de configuraciones. MT5 te ordena una tabla. <strong>Orometra te dice cuál aguanta.</strong>',
    'hero.p1.title': 'Busca mesetas, no picos',
    'hero.p1.body': 'Recorre las miles de configuraciones que probaste y localiza las zonas donde <em>los parámetros vecinos también funcionan</em>. Si mover un valor un paso hunde el resultado, eso no es una configuración: es una coincidencia.',
    'hero.p2.title': 'Te da el Top 3, y el porqué',
    'hero.p2.body': 'Tres configuraciones concretas con todos sus parámetros, y el argumento medido de por qué están ahí: cuántos vecinos las sostienen, qué aguantan fuera de muestra y dónde están sus riesgos.',
    'hero.p3.title': 'Y te dice cuánto pesa la evidencia',
    'hero.p3.body': 'No decide por ti: mide. Si lo que sostiene a una zona es poco, te lo dice y te explica exactamente qué falta. Decidir qué operar sigue siendo tuyo.',
    'hero.back': '← Volver a tu análisis',
    'hero.reset': 'Empezar de cero',

    'intake.label': 'Carga de archivos',
    'drop.is.title': 'In-Sample',
    'drop.is.status': 'Suelta los dos archivos en cualquier parte',
    'drop.oos.title': 'Forward',
    'drop.oos.status': 'Se detecta por su contenido, no por donde lo sueltes',
    'drop.set.hint': 'Opcional: suelta el .set de la optimización (inicio||paso||fin||Y) en cualquier sitio para contrastar la cobertura con el rango que pediste en MT5.',
    'drop.choose': 'Elegir',
    'intake.change': 'Cambiar archivos',
    'analyze.label': 'Auditar',
    'analyze.sub': 'Carga in-sample y forward',
    'analyze.busy': 'Auditando…',
    'analyze.ready': 'Listo para auditar',
    'analyze.needIs': 'Carga el archivo in-sample',
    'analyze.needOos': 'Carga también el forward — sin él no hay contraste fuera de muestra',
    'preflight.kicker': 'Comprobación de datos',
    'preflight.title': 'Listo para auditar',
    'preflight.note.ok': 'Los archivos se leen bien. Pulsa Auditar para lanzar el motor de robustez.',
    'preflight.note.warn': 'Algo no cuadra en al menos un archivo. Corrígelo antes de auditar, o el motor parará con un error claro.',
    'preflight.rows': 'Filas',
    'preflight.params': 'Parámetros',
    'preflight.metrics': 'Métricas',
    'preflight.reading': 'Leyendo…',
    'preflight.error': 'No se pudo inspeccionar',
    'outcome.banner.success': 'Auditoría completada',
    'outcome.banner.no_qualifying': 'Ninguna configuración pasa los mínimos',
    'outcome.banner.insufficient': 'Datos insuficientes para una meseta',
    'outcome.banner.no_plateau': 'Sin meseta estable',

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
    'verdict.next': 'Qué puedes hacer',
    'verdict.pick': 'Elegida',
    'verdict.nopick': 'Ninguna configuración elegida',

    'export.summary': 'Resumen breve (.txt)',
    'export.json': 'Informe completo (JSON)',
    'export.csv': 'Todas las configuraciones (CSV)',
    'export.set': 'Configuración propuesta (.set)',
    'export.refine': 'Rango de refinamiento (.set)',

    'demo.loaded': 'Ejemplo sintético cargado',

    'lp.eyebrow': 'Robustez de optimizaciones MT5',
    'lp.h1': 'Busca <em>mesetas</em>, no picos.',
    'lp.lead': 'Optimizas miles de configuraciones. MT5 te ordena una tabla. <strong>Orometra te dice cuál aguanta</strong> — y cuándo la evidencia es demasiado débil.',
    'lp.cta': 'Abrir la app',
    'lp.cta.footer': 'App',
    'lp.demo': 'Ver un análisis completo',
    'lp.proof': 'Incluye un demo sintético con una meseta plantada — abre <strong>Ver un análisis completo</strong> para inspeccionar una auditoría sin subir archivos.',
    'lp.hero.region': 'Producto',
    'lp.surface.aria': 'Superficie de parámetros: los picos aislados caen y queda la meseta estable',
    'lp.surface.state.peaks': 'Mostrando picos aislados',
    'lp.surface.state.plateau': 'Mostrando meseta estable',
    'lp.surface.hint': 'Pasa el ratón — los picos caen y queda la meseta',
    'lp.surface.hint.touch': 'Mira — los picos caen y queda la meseta',
    'lp.privacy': 'Tus archivos no salen del navegador. Sin cuentas. Sin subida a un servidor.',
    'lp.compare.title': 'Del caos de MT5 a evidencia que se puede inspeccionar',
    'lp.compare.before.kicker': 'Antes · MT5',
    'lp.compare.before.title': 'Resultados de optimización',
    'lp.compare.before.meta': '12.482 pasadas · ordenadas por Result',
    'lp.compare.col.rank': '#',
    'lp.compare.col.pass': 'Pass',
    'lp.compare.col.result': 'Result',
    'lp.compare.col.pf': 'PF',
    'lp.compare.tag.best': 'Mejor',
    'lp.compare.tag.rejected': '#1 descartado',
    'lp.compare.before.spark': 'Pico aislado',
    'lp.compare.after.kicker': 'Después · Orometra',
    'lp.compare.after.title': 'Auditoría de robustez',
    'lp.compare.after.stamp': 'EVIDENCIA MODERADA',
    'lp.compare.after.selected': 'Elegido en su lugar',
    'lp.compare.after.selected.why': 'Centro de meseta · maximin (el peor vecino, lo mejor posible) · no el pico de beneficio',
    'lp.compare.after.spark': 'Meseta estable',
    'lp.compare.caption': 'Ejemplo ilustrativo. Tu auditoría explica por qué se eligió o se descartó una configuración — no solo una nota.',
    'lp.what.kicker': 'Producto',
    'lp.what.title': 'Qué obtienes',
    'lp.what.1.title': 'Zonas estables, no suerte',
    'lp.what.1.body': 'Encuentra zonas de parámetros donde los vecinos también funcionan, y las muestra en una superficie 3D real — no la ilustración de esta página. Un pico aislado se descarta, aunque encabece tu tabla de MT5.',
    'lp.what.2.title': 'Top 3 con razones',
    'lp.what.2.body': 'Tres configuraciones concretas, soporte de vecinos, comportamiento fuera de muestra y los riesgos que siguen aplicando.',
    'lp.what.3.title': 'Fuerza de la evidencia',
    'lp.what.3.body': 'Sólida, moderada, débil o insuficiente. Orometra mide lo que tus datos pueden sostener — no promete beneficios futuros.',
    'lp.what.4.title': 'Robustez frente a costes reales',
    'lp.what.4.body': 'Suelta el informe de tu backtest en el periodo no visto y obtén un Monte Carlo sobre tus operaciones reales, un aviso de si tu muestra alcanza, y una tabla de stress de costes — sin instalar nada, a partir de la lista de operaciones que MT5 ya te da.',
    'lp.avoid.kicker': 'Riesgo',
    'lp.avoid.title': 'Tres errores que evita',
    'lp.avoid.1.title': 'Confiar en la fila #1',
    'lp.avoid.1.body': 'La cima de una tabla de MT5 suele ser un pico aislado. Los vecinos y el fuera de muestra no se ven hasta auditar la superficie.',
    'lp.avoid.2.title': 'Promediar el riesgo',
    'lp.avoid.2.body': 'Orometra puntúa por el peor periodo y por zonas maximin (el peor vecino, lo mejor posible) — no por una media que esconde un borde frágil.',
    'lp.avoid.3.title': 'Confundir evidencia con luz verde',
    'lp.avoid.3.body': 'Un grado sólido significa que los datos sostienen una zona estable. No es permiso para operar ni un pronóstico de beneficio futuro.',
    'lp.how.kicker': 'Flujo',
    'lp.how.title': 'Cómo funciona',
    'lp.how.tagline': 'Optimiza. Exporta. Audita.',
    'lp.how.1': '<strong>Optimiza con Forward activado.</strong> Separa in-sample y fuera de muestra en el Probador de Estrategias antes de lanzar la optimización, no después — es la única forma de que el forward sea de verdad un periodo que nunca usaste para elegir. Exporta los dos informes (XML).',
    'lp.how.2': '<strong>Suelta</strong> los archivos en la app. El in-sample y el forward se detectan por contenido.',
    'lp.how.3': '<strong>Lee</strong> el veredicto, las mesetas y los descartes. Exporta un .set para refinar en MT5, o suelta el informe de un solo backtest para ver Monte Carlo y stress de costes sobre tus operaciones reales.',
    'lp.method.bridge': 'Cómo decide el motor — mínimos, mesetas, maximin — está documentado en la <a href="methodology/">metodología</a>.',
    'lp.not.kicker': 'Límites',
    'lp.not.title': 'Lo que Orometra no hace',
    'lp.not.1': 'No predice el mercado ni garantiza rentabilidad.',
    'lp.not.2': 'No elige por defecto la pasada de mayor beneficio.',
    'lp.not.3': 'No convierte un EA débil en uno fuerte.',
    'lp.final.title': '¿Listo para auditar una optimización?',
    'lp.final.body': 'Abre la app, carga tus resultados de MT5 y comprueba si las mejores filas merecen confianza.',
    'lp.final.cta': 'Auditar mi optimización',
    'lp.foot.tagline': 'Mesetas antes que picos. El análisis se queda en tu navegador.',

    'doc.method.eyebrow': 'Metodología',
    'doc.method.h1': 'Cómo decide el motor',
    'doc.method.lead': 'No reordenamos tu tabla de MT5. Buscamos zonas estables — y te decimos cuánta evidencia hay.',
    'doc.method.pipe.1.title': 'Mínimos',
    'doc.method.pipe.1.body': 'Tus suelos en ambos periodos',
    'doc.method.pipe.2.title': 'Calidad',
    'doc.method.pipe.2.body': 'Reconstruida sin Result',
    'doc.method.pipe.3.title': 'Vecindad',
    'doc.method.pipe.3.body': '¿Los vecinos también aguantan?',
    'doc.method.pipe.4.title': 'Meseta',
    'doc.method.pipe.4.body': 'Zonas buenas conectadas',
    'doc.method.pipe.5.title': 'Elección',
    'doc.method.pipe.5.body': 'Centro de la meseta, no el pico',
    'doc.method.pipe.6.title': 'No visto',
    'doc.method.pipe.6.body': 'Comprobación limpia opcional',
    'doc.method.s1.title': '1. Mínimos antes que rankings',
    'doc.method.s1.body': 'Una config solo entra si supera tus suelos (PF, drawdown, operaciones, beneficio) en los dos periodos. Un ranking siempre inventa un «top 5 %» — aunque todo pierda dinero.',
    'doc.method.s2.title': '2. Calidad sin Result',
    'doc.method.s2.body': 'La columna Result es lo que optimizaste. Reconstruimos calidad con columnas objetivas (PF, recuperación, Sharpe, drawdown, operaciones). Puntuación = el peor entre in-sample y forward — no la media.',
    'doc.method.s3.title': '3. Mesetas, no picos',
    'doc.method.s3.body': 'Los picos aislados se descartan. Una meseta es una zona donde los vecinos también pasan tus mínimos. Elegimos el centro (maximin), no la punta de beneficio.',
    'doc.method.s4.title': '4. Fuerza de evidencia — no señal de trading',
    'doc.method.s4.body': 'El veredicto es sólida / moderada / débil / insuficiente. Nunca significa «opera». Pocos datos no es lo mismo que «no hay meseta».',
    'doc.method.s5.title': '5. Puesta a prueba con tus operaciones reales',
    'doc.method.s5.body': 'La rejilla de optimización solo trae métricas agregadas por pasada — nunca alcanza para un Monte Carlo de verdad. Pero el informe de backtest de tu configuración elegida sobre el periodo no visto sí trae la lista de operaciones una a una, y eso desbloquea tres comprobaciones que la rejilla sola no puede darte: un Monte Carlo por bootstrap estacionario sobre tus operaciones reales, un aviso de tamaño de muestra (¿estos días alcanzan para distinguir tu ventaja del ruido?), y una tabla de stress de costes para cuando tu spread, slippage o comisión reales en vivo sean peores que los que usaste al optimizar. Suelta el informe — un backtest real de MT5, no un export de optimización — en cualquier punto del paso «Periodo no visto».',
    'doc.method.s6.title': '6. Lo que no afirmamos',
    'doc.method.s6.1': 'Una meseta es estabilidad en tu muestra — no prueba de ventaja futura.',
    'doc.method.s6.2': 'No inventamos PBO / Reality Check / SPA clásicos: el export de MT5 no trae las curvas de equity que esos tests necesitan.',
    'doc.method.s6.3': 'El forward ya ayuda a seleccionar, así que está algo «contaminado»; lo más limpio es un periodo de verdad no visto.',
    'doc.method.s6.4': 'No te decimos que compres, vendas o financiés un EA. Evidencia ≠ permiso para operar.',
    'doc.method.cta': 'Probar con mis archivos',
    'doc.method.full': 'Detalle técnico completo en la app →',

    'doc.privacy.nav': 'Privacidad',
    'doc.privacy.eyebrow': 'Privacidad',
    'doc.privacy.h1': 'Tus archivos no salen del navegador',
    'doc.privacy.lead': 'No es una promesa sobre servidores que controlamos con cuidado. No hay backend de análisis: la auditoría corre como JavaScript en tu equipo.',
    'doc.privacy.claim1.kicker': 'Arquitectura',
    'doc.privacy.claim1.title': 'Sin backend',
    'doc.privacy.claim1.body': 'El análisis corre como JavaScript en tu navegador. No hay servidor que reciba tus tablas de optimización.',
    'doc.privacy.claim2.kicker': 'Archivos',
    'doc.privacy.claim2.title': 'Sin subidas',
    'doc.privacy.claim2.body': 'Los informes se leen en memoria y se descartan al cerrar la pestaña. En nuestro lado no se guarda nada.',
    'doc.privacy.claim3.kicker': 'Producto',
    'doc.privacy.claim3.title': 'Sin analítica',
    'doc.privacy.claim3.body': 'Sin cuentas, sin cookies de seguimiento, sin analítica de producto sobre tu EA, parámetros o resultados.',
    'doc.privacy.s1.title': 'Qué no recogemos',
    'doc.privacy.s1.1': 'No se suben archivos. Tus informes XML/CSV/HTML de MT5 se leen en memoria y se descartan al cerrar la pestaña.',
    'doc.privacy.s1.2': 'Sin cuentas, registro, cookies de seguimiento ni analítica de producto.',
    'doc.privacy.s1.3': 'No vemos los parámetros de tu EA, los resultados de optimización ni la lógica de la estrategia.',
    'doc.privacy.s2.title': 'Qué se queda solo en tu dispositivo',
    'doc.privacy.s2.body': 'El navegador puede guardar en local (nunca se nos envía): el tema de color, el idioma y los mínimos que configures — para no tener que repetirlos. Puedes borrarlos vaciando los datos del sitio para este dominio.',
    'doc.privacy.s3.title': 'Lo que no podemos evitar',
    'doc.privacy.s3.body': 'Cualquier proveedor que sirva la web (por ejemplo GitHub Pages) registra peticiones HTTP básicas: IP, hora, navegador. Es normal en cualquier sitio y no está relacionado con el contenido de tus archivos de optimización.',
    'doc.privacy.s4.title': 'Descargo',
    'doc.privacy.s4.body': 'Orometra es una herramienta de análisis estadístico, no asesoramiento financiero. Un grado de evidencia favorable no es una recomendación de compra, venta o financiar un EA. Los resultados pasados no garantizan el rendimiento futuro.',
    'doc.privacy.full': 'Texto legal completo en la app →',
  },
};
