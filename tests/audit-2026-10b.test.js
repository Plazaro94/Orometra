// Lo que encontró la auditoría de uso del 2026-10-11 (con un export real de MT5 de 5517
// pasadas, su forward y su .set). Cada sección falla con el código anterior.
//
//   E1  El CSV numeraba las mesetas por el orden en que se encontraron, no por su puesto:
//       las configuraciones de la «Meseta 1» salían con meseta=2.
//   E2  Con el .set, un enum (paso 0) que el XML trae como número se barría en el .set de
//       refinamiento, cuya cabecera dice que los enums se dejan fijos.
//   E3  Nube de puntos: «Pasan mínimos» y «En meseta» con el mismo color; deciles: la
//       leyenda no tenía el color de las barras.
//   E4  Deciles: las barras salían del mínimo del eje, no del cero (una mediana negativa
//       se dibujaba hacia arriba).
//   E5  Un aviso crítico citaba un factor de beneficio de «1,25 en vez de 1,15» fuera cual
//       fuera el mínimo del usuario.
//   M1  Qué parte de cada meseta cumple los mínimos en el forward, a la vista.
//
//   node tests/audit-2026-10b.test.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setLocale } from '../js/i18n.js';
import { buildDemoTables } from '../js/demo.js';
import { runAnalysis } from '../core/analysis.js';
import { refinementRange } from '../core/engine.js';
import { parseSetText } from '../core/setfile.js';
import { screenHiddenLosers } from '../core/schema.js';
import { rebuildLocalizedCopy } from '../core/verdict.js';
import { buildCsv } from '../js/export.js';
import { degradationChart } from '../js/charts.js';
import { forwardHoldHtml } from '../js/ui-state.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}
function section(t) { console.log(`\n${'='.repeat(70)}\n${t}\n${'='.repeat(70)}`); }

setLocale('es');
const demo = buildDemoTables();

// Dos mesetas: el ejemplo duplicado con un booleano, con la mitad peor PRIMERO en la tabla.
// Así la peor se encuentra antes (id 0) pero queda segunda en el puesto.
function twoPlateaus({ isTable, oosTable }) {
  const n = isTable.rows.length;
  const worse = (t, r) => {
    const pf = t.headers.indexOf('Profit Factor');
    const pr = t.headers.indexOf('Profit');
    const c = r.slice();
    c[pf] = Number((1 + (c[pf] - 1) * 0.85).toFixed(2));
    c[pr] = Number((c[pr] * 0.85).toFixed(2));
    return c;
  };
  const dup = (t) => ({
    ...t,
    headers: [...t.headers, 'InpUseFilter'],
    rows: [...t.rows.map((r) => [r[0] + n, ...worse(t, r).slice(1), 'false']), ...t.rows.map((r) => [...r, 'true'])],
  });
  return { isTable: dup(isTable), oosTable: dup(oosTable) };
}

section('E1: la columna «meseta» del CSV es el puesto que se ve en pantalla');
{
  const a = runAnalysis(twoPlateaus(demo));
  check('hay dos mesetas y la que se encontró primero no es la primera del puesto',
    a.plateaus.length === 2 && a.plateaus[0].id !== 0, a.plateaus.map((p) => `rank${p.rank}:id${p.id}`).join(' '));
  const csv = buildCsv(a).split('\r\n');
  const head = csv[0].split(';');
  const col = head.indexOf('meseta');
  const passCol = head.indexOf('pass');
  const byPass = new Map(csv.slice(1).map((l) => { const c = l.split(';'); return [c[passCol], c[col]]; }));
  for (const p of a.plateaus) {
    check(`la configuración elegida de la Meseta ${p.rank} sale con meseta=${p.rank}`,
      byPass.get(String(p.record.id)) === String(p.rank), `pasada ${p.record.id}: ${byPass.get(String(p.record.id))}`);
    const n = csv.slice(1).filter((l) => l.split(';')[col] === String(p.rank)).length;
    check(`meseta=${p.rank} tiene ${p.size} filas, el tamaño de la Meseta ${p.rank}`, n === p.size, String(n));
  }
  // M6: las cifras con las que se busca cada configuración en MT5, al final de la fila.
  check('M6: el CSV termina con beneficio, operaciones y Result del periodo optimizado',
    head.slice(-3).join(',') === 'beneficio_is,operaciones_is,result_is', head.slice(-4).join(','));
  const rec = a.plateaus[0].record;
  const row = csv.slice(1).map((l) => l.split(';')).find((c) => c[passCol] === String(rec.id));
  const es = (v) => String(Number(v.toFixed(6))).replace('.', ',');
  check('M6: las de la recomendada son las de su fila del export',
    row && row.at(-3) === es(rec.is.profit) && row.at(-2) === es(rec.is.trades) && row.at(-1) === es(rec.criterionIs),
    row && row.slice(-3).join(' | '));
}

section('E2: los enums del .set se dejan fijos en el refinamiento');
{
  // Unidad: el parámetro 0 vale 0/1 (un enum que el XML trae como número).
  const levels = [[0, 1], [10, 20, 30, 40, 50]];
  const coords = [[0, 2]];
  const sens = [{ sensitivity: 1 }, { sensitivity: 0.5 }];
  const without = refinementRange(0, coords, levels, ['InpModo', 'InpPeriodo'], sens, ['number', 'number']);
  const withSet = refinementRange(0, coords, levels, ['InpModo', 'InpPeriodo'], sens, ['number', 'number'], undefined, [], [0]);
  check('sin saber que es un enum, se barre (como antes)', !without[0].fixed && without[0].levels === 2, JSON.stringify(without[0]));
  check('sabiendo que es un enum, se deja fijo y marcado como categórico', withSet[0].fixed && withSet[0].categorical, JSON.stringify(withSet[0]));
  check('el numérico se sigue barriendo', !withSet[1].fixed && withSet[1].levels > 1, JSON.stringify(withSet[1]));

  // Con el análisis entero: el .set dice que InpMinBodyPct es un enum (paso 0).
  const set = parseSetText('InpFastMA=14||8||2||18||Y\nInpSlowMA=70||40||10||100||Y\nInpATR_SL=2||1||0.5||3.5||Y\nInpATR_TP=4||1||1||6||Y\nInpTrailStart=1.5||0.5||0.5||2.5||Y\nInpMinBodyPct=20||10||0||40||Y\n');
  const plain = runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable });
  const withEnum = runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable, searchSet: set });
  const refOf = (a) => a.plateaus[0].refinement.find((r) => r.name === 'InpMinBodyPct');
  check('sin .set, InpMinBodyPct se trata como número', !refOf(plain).categorical, JSON.stringify(refOf(plain)));
  check('con el .set, InpMinBodyPct queda fijo en el refinamiento', refOf(withEnum).categorical && refOf(withEnum).fixed, JSON.stringify(refOf(withEnum)));
  check('y el análisis no cambia: misma meseta y misma recomendada',
    plain.plateaus.length === withEnum.plateaus.length && plain.plateaus[0].record.id === withEnum.plateaus[0].record.id
      && plain.plateaus[0].size === withEnum.plateaus[0].size,
    `${plain.plateaus[0].record.id}/${plain.plateaus[0].size} frente a ${withEnum.plateaus[0].record.id}/${withEnum.plateaus[0].size}`);
}

section('E3: cada color de la leyenda es el de su marca, y las tres capas de la nube se distinguen');
{
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const prop = (sel, p) => {
    const m = css.match(new RegExp(`(?:^|\\n)${sel.replace(/\./g, '\\.')}\\{([^}]*)\\}`));
    const d = m && m[1].match(new RegExp(`${p}:([^;}]+)`));
    return d ? d[1].trim() : null;
  };
  for (const k of ['fail', 'pass', 'plateau']) {
    check(`«${k}»: el punto y la muestra de la leyenda usan el mismo color`,
      prop(`.pt-${k}`, 'fill') && prop(`.pt-${k}`, 'fill') === prop(`.chart-swatch-sc-${k}`, 'background'),
      `${prop(`.pt-${k}`, 'fill')} / ${prop(`.chart-swatch-sc-${k}`, 'background')}`);
  }
  check('deciles: la muestra de D1–D9 es el color de sus barras', prop('.ch-bar', 'fill') === prop('.chart-swatch-bar', 'background'),
    `${prop('.ch-bar', 'fill')} / ${prop('.chart-swatch-bar', 'background')}`);
  check('deciles: la muestra de D10 es el color de su barra', prop('.ch-bar-top', 'fill') === prop('.chart-swatch-bar-top', 'background'),
    `${prop('.ch-bar-top', 'fill')} / ${prop('.chart-swatch-bar-top', 'background')}`);
  // Los tres tonos, distintos en cada tema (oscuro, claro y papel).
  const blocks = [...css.matchAll(/--ch-fail:(#[0-9a-f]{6});\s*--ch-pass:(#[0-9a-f]{6});\s*--ch-plateau:(#[0-9a-f]{6});/gi)];
  check('hay tonos para el tema oscuro, el claro y la impresión', blocks.length === 3, String(blocks.length));
  // Luminosidad relativa (WCAG): cada paso se separa del siguiente.
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const [, f, p, m] of blocks) {
    check(`${f} → ${p} → ${m}: cada paso se distingue del siguiente (contraste ≥ 1,4:1)`,
      ratio(f, p) >= 1.4 && ratio(p, m) >= 1.4, `${ratio(f, p).toFixed(2)} y ${ratio(p, m).toFixed(2)}`);
  }
}

section('E4: las barras de los deciles salen del cero');
{
  const rows = [-0.84, -0.53, -0.31, -0.11, 0.065, 0.045, 0.25, 0.255, 0.27, 0.37]
    .map((m, k) => ({ decile: k + 1, oosMedian: m, oosQ25: m - 0.2, count: 50 }));
  const svg = degradationChart({ stats: { degradation: rows } }, false);
  const rects = [...svg.matchAll(/<rect class="ch-bar(?:-top)?" x="[^"]+" y="([^"]+)" width="[^"]+" height="([^"]+)"/g)].map((m) => ({ y: +m[1], h: +m[2] }));
  const zero = svg.match(/<line class="ch-zero"[^>]*y1="([^"]+)"/);
  check('con medianas negativas hay línea del cero', Boolean(zero));
  const y0 = zero ? +zero[1] : NaN;
  check('una mediana negativa cuelga del cero hacia abajo', Math.abs(rects[0].y - y0) < 0.2, `${rects[0].y} frente a ${y0}`);
  check('una positiva sube desde el cero', Math.abs(rects[9].y + rects[9].h - y0) < 0.2, `${rects[9].y + rects[9].h} frente a ${y0}`);
  // Todo positivo: la altura es proporcional a la cifra (D10 / D1 = 49,82 / 16,38 ≈ 3,04).
  const pos = [16.38, 20.05, 22.94, 25.42, 27.79, 30.05, 32.78, 36.75, 41.13, 49.82].map((m, k) => ({ decile: k + 1, oosMedian: m, oosQ25: m * 0.7, count: 50 }));
  const hs = [...degradationChart({ stats: { degradation: pos } }, false).matchAll(/<rect class="ch-bar(?:-top)?"[^>]*height="([^"]+)"/g)].map((m) => +m[1]);
  check('sin negativos, la altura es proporcional a la cifra', Math.abs(hs[9] / hs[0] - 49.82 / 16.38) < 0.03, (hs[9] / hs[0]).toFixed(3));
  check('y sin negativos no se dibuja línea del cero aparte', !/ch-zero/.test(degradationChart({ stats: { degradation: pos } }, false)));
}

section('E5: el ejemplo del aviso de los mínimos sale de los mínimos del usuario');
{
  const src = fs.readFileSync(path.join(ROOT, 'core/verdict.js'), 'utf8');
  check('ya no hay un «1,25 en vez de 1,15» fijo', !/1,25 en vez de 1,15|1\.25 instead of 1\.15/.test(src));
  const a = runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable, policy: { gates: { requireProfit: true, minProfitFactor: 1.1, maxDrawdownPct: 20, minTrades: 100 } } });
  const g = a.stats.stabilityCheck.gates;
  check('se guarda el tramo de factor de beneficio probado (1,08 a 1,12 con un mínimo de 1,10)',
    g && Math.abs(g.profitFactorRange[0] - 1.08) < 1e-9 && Math.abs(g.profitFactorRange[1] - 1.12) < 1e-9, JSON.stringify(g && g.profitFactorRange));
  // Se fuerza el caso crítico (la meseta ganadora cambia más de la mitad de las veces).
  const forced = { ...a, stats: { ...a.stats, stabilityCheck: { ...a.stats.stabilityCheck, gates: { ...g, regionRate: 0.3 } } } };
  for (const lang of ['es', 'en']) {
    setLocale(lang);
    const f = rebuildLocalizedCopy(forced).verdict.findings.find((x) => /mínimos que elijas|minimums you choose/.test(x.title));
    const want = lang === 'es' ? 'entre 1,08 y 1,12' : 'between 1.08 and 1.12';
    check(`${lang}: el aviso cita el tramo de verdad (${want})`, f && f.detail.includes(want), f && f.detail);
  }
  setLocale('es');
}

section('M2, M3, M4 y M7: textos que se contradecían o no decían de qué es la cifra');
{
  const a = runAnalysis({ isTable: demo.isTable, oosTable: demo.oosTable });
  const vsrc = fs.readFileSync(path.join(ROOT, 'core/verdict.js'), 'utf8');
  // M3: «propiedad de tus datos» (umbrales internos) salía junto a «no tus datos» (tus mínimos).
  check('M3: ya no dice «es una propiedad de tus datos» junto al aviso de tus mínimos', !/propiedad de tus datos|property of your data/.test(vsrc));
  // M3: «no hay región amplia» con mesetas a la vista. Se fuerza: el orden de MT5 falla el 60 %
  // y solo el 9,4 % de las configuraciones cumple en los dos periodos.
  const forced = (extra) => rebuildLocalizedCopy({
    ...a,
    meta: { ...a.meta, gatePassCount: Math.round(a.meta.forwardCount * 0.094), ...extra.meta },
    stats: { ...a.stats, fragility: 0.6 },
    plateaus: extra.plateaus || a.plateaus,
  }).verdict.findings.find((f) => /primera de Result|top Result row/.test(f.title));
  const withPlateau = forced({});
  check('M3: con mesetas, dice cuántas cumplen en los dos periodos (9,4 %), no que no haya región',
    withPlateau && /solo el 9,4 % de las configuraciones cumple tus mínimos en los dos periodos/.test(withPlateau.detail) && !/no hay región amplia/.test(withPlateau.detail),
    withPlateau && withPlateau.detail);
  // Mide el orden de la tabla, no la meseta: se enseña, pero no baja el nivel (en el banco nunca
  // fue el único crítico: bench/results/REPORT-calib-orden-tabla.md).
  check('es un aviso de la tabla, no un crítico', withPlateau && withPlateau.severity === 'warn' && withPlateau.scope === 'table',
    withPlateau && `${withPlateau.severity}/${withPlateau.scope}`);
  const levelForced = rebuildLocalizedCopy({
    ...a, meta: { ...a.meta, gatePassCount: Math.round(a.meta.forwardCount * 0.094) }, stats: { ...a.stats, fragility: 0.6 },
  }).verdict.level;
  check(`con él, el ejemplo se queda en su nivel (${a.verdict.level}), no baja a débil`, levelForced === a.verdict.level, levelForced);
  const noPlateau = forced({ plateaus: [] });
  check('M3: sin mesetas, dice que no hay ninguna', noPlateau && /no hay ninguna meseta donde refugiarse/.test(noPlateau.detail), noPlateau && noPlateau.detail);
  // M7: el máximo es el de las pasadas con más de 30 operaciones, no el de toda la tabla.
  check('M7: el contraste guarda el mínimo de operaciones que usa', a.stats.sharpeTest.minTrades === 30, String(a.stats.sharpeTest.minTrades));
  const sh = a.verdict.findings.find((f) => /Sharpe/.test(f.title));
  check('M7: el texto del Sharpe lo dice', sh && /entre las pasadas con más de 30 operaciones/.test(sh.detail), sh && sh.detail);
  const psrc = fs.readFileSync(path.join(ROOT, 'js/ui-plateaus.js'), 'utf8');
  check('M4: la nota del mapa dice que cuenta todas las configuraciones',
    /Cuenta todas las configuraciones probadas, también las que no cumplen tus mínimos/.test(psrc) && /It counts every tested configuration/.test(psrc));
  const usrc = fs.readFileSync(path.join(ROOT, 'js/ui-verdict.js'), 'utf8');
  // Desde la tanda A (2026-10-15) la tarjeta ya no enseña «Se mantiene al validar», sino qué parte
  // de la meseta cumple en el forward: tiene que seguir diciendo de qué es la cifra y sobre cuántas.
  check('M2: la cifra del forward de la tarjeta dice que es de la meseta y sobre cuántas',
    /de la meseta sigue cumpliendo tus mínimos en el forward \(\$\{int\(passed\)\} de \$\{int\(val\.withForward\)\}\)/.test(usrc));
}

section('FWD-4: pasadas que MT5 ocultó en la optimización no son un forward dañado');
{
  // Como el export real del 12-10: la optimización sin ninguna pasada con pérdidas (opción de
  // omitir los resultados inútiles) y el forward con todas, las perdedoras sin número de pasada.
  // Un export «completo» con perdedoras de verdad: 1 de cada 3 configuraciones pierde dinero en
  // el periodo optimizado (como en el export real: 1839 de 5423). Y el mismo como lo exporta
  // MT5 con las perdedoras ocultas: fuera de la optimización y sin pasada en el forward.
  const t0 = demo.isTable;
  const pc = t0.headers.indexOf('Pass');
  const prof = t0.headers.indexOf('Profit');
  const res = t0.headers.indexOf('Result');
  const o0 = demo.oosTable;
  const opc = o0.headers.indexOf('Pass');
  const back = o0.headers.indexOf('Back Result');
  const losers = new Set(t0.rows.filter((r, i) => r[prof] <= 0 || i % 3 === 0).map((r) => r[pc]));
  const lose = (v) => -Math.abs(v) - 1;
  const t = { ...t0, rows: t0.rows.map((r) => (losers.has(r[pc]) ? r.map((v, j) => (j === prof || j === res ? lose(v) : v)) : r)) };
  const o = { ...o0, rows: o0.rows.map((r) => (losers.has(r[opc]) ? r.map((v, j) => (j === back ? lose(t0.rows.find((x) => x[pc] === r[opc])[res]) : v)) : r)) };
  const isT = { ...t, rows: t.rows.filter((r) => !losers.has(r[pc])) };
  const oosT = { ...o, rows: o.rows.map((r) => (losers.has(r[opc]) ? ['', ...r.slice(1)] : r)) };
  const hidden = oosT.rows.filter((r) => r[opc] === '').length;
  check('el caso de prueba: más del 1 % del forward sin pasada', hidden / oosT.rows.length > 0.01, `${hidden} de ${oosT.rows.length}`);
  check('se reconoce la firma', screenHiddenLosers(isT, oosT).hidden === hidden);
  let a = null;
  let err = null;
  try { a = runAnalysis({ isTable: isT, oosTable: oosT }); } catch (e) { err = e.message; }
  check('el análisis sigue (antes: «El export del forward está dañado»)', a && !err, err);
  const full = runAnalysis({ isTable: t, oosTable: o });
  // Respuesta conocida: recuperadas como «probadas que perdieron», el análisis es el del export completo.
  check('se recuperan todas: mismas configuraciones que el export completo', a && a.meta.total === full.meta.total, a && `${a.meta.total} frente a ${full.meta.total}`);
  const lost = a ? a.records.filter((r) => r.lostInIs) : [];
  check('las recuperadas cuentan como probadas que no cumplen tus mínimos y puntúan 0',
    lost.length === hidden && lost.every((r) => r.qualityIs === 0 && r.failsIs.length && r.oosKnown), String(lost.length));
  const same = (x, y) => x.plateaus.length && y.plateaus.length && x.plateaus[0].record.id === y.plateaus[0].record.id && x.plateaus[0].size === y.plateaus[0].size;
  check('misma recomendada y misma meseta que con el export completo', a && same(a, full),
    a && `${a.plateaus[0]?.record.id}/${a.plateaus[0]?.size} frente a ${full.plateaus[0]?.record.id}/${full.plateaus[0]?.size}`);
  check('y el mismo nivel', a && a.verdict.level === full.verdict.level, a && `${a.verdict.level} frente a ${full.verdict.level}`);
  const f = a && a.verdict.findings.find((x) => /dejó fuera del export de la optimización las pasadas que perdieron dinero/.test(x.title));
  check('lo dice, con cuántas, y que no es un archivo dañado', f && f.title.includes(`(${hidden.toLocaleString('es-ES')})`) && /No es un archivo dañado/.test(f.detail), f && f.title);
  check('solo informa: no pide tocar MT5 ni cuenta para el nivel', f && f.severity === 'info' && !/desactiva|vuelve a exportar/i.test(f.detail), f && f.severity);
  check('nada se cuenta como dañado', a && a.integrity.damagedDropped.oos === 0 && a.integrity.hiddenLosers === hidden, a && JSON.stringify(a.integrity.damagedDropped));
  setLocale('en');
  const fen = rebuildLocalizedCopy(a).verdict.findings.find((x) => /left the passes that lost money out of the optimization export/.test(x.title));
  check('en inglés también', Boolean(fen), '');
  setLocale('es');

  // Si la firma no se cumple entera, sigue siendo un export dañado.
  const withLoserInIs = { ...isT, rows: [...isT.rows, (() => { const r = t0.rows[0].slice(); r[pc] = 999999; r[prof] = -5; r[res] = -5; return r; })()] };
  check('si la optimización trae alguna pasada con pérdidas, no se reconoce', screenHiddenLosers(withLoserInIs, oosT).hidden === 0);
  const withImpossible = { ...oosT, rows: oosT.rows.map((r, i) => (r[opc] === '' && i === oosT.rows.findIndex((x) => x[opc] === '') ? [...r.slice(0, -1), 9.88e-324] : r)) };
  check('si una fila sin pasada trae un valor imposible, no se reconoce', screenHiddenLosers(isT, withImpossible).hidden === 0);
  const inIsAlready = { ...oosT, rows: oosT.rows.map((r) => (r === oosT.rows.find((x) => x[opc] !== '') ? ['', ...r.slice(1)] : r)) };
  check('si una fila sin pasada es una configuración que sí está en la optimización, no se reconoce', screenHiddenLosers(isT, inIsAlready).hidden === 0);
  let err2 = null;
  try { runAnalysis({ isTable: withLoserInIs, oosTable: oosT }); } catch (e) { err2 = e.message; }
  check('y entonces el análisis para como antes, con el aviso de export dañado', /está dañado/.test(err2 || ''), err2);
}

section('E6 y E7: textos de Mesetas y Descartes');
{
  const src = fs.readFileSync(path.join(ROOT, 'js/ui-plateaus.js'), 'utf8');
  check('«Vecinas flojas», no «flojos»', !/Vecinas flojos/.test(src));
  // El orden lo deciden las más flojas, el tamaño y el forward (core/analysis.js#rankKey):
  // decir solo «por las más flojas» no explicaba por qué una meseta con 0,86 va antes que
  // otra con 0,92.
  check('la frase del orden nombra también el tamaño y el forward',
    /más flojas<\/strong> \(no las mejores\), por su tamaño y por cuántas cumplen tus mínimos en el forward/.test(src)
      && /by their size and by how many clear your minimums on the forward/.test(src));
}

section('M1: qué parte de cada meseta cumple en el forward');
{
  const p = { oosValidation: { passFrac: 24 / 38, withForward: 38, size: 38 } };
  const html = forwardHoldHtml(p, 0.65);
  check('63 % y 24 de 38, con la marca de aviso por debajo del 65 %', /badge warn">63 %<\/span>/.test(html) && /24 de 38/.test(html), html);
  const all = forwardHoldHtml({ oosValidation: { passFrac: 1, withForward: 8, size: 8 } }, 0.65);
  check('100 % sin marca de aviso', /^100 % /.test(all) && !/badge/.test(all), all);
  const partial = forwardHoldHtml({ oosValidation: { passFrac: 0.5, withForward: 6, size: 10 } }, 0.65);
  check('si MT5 no pasó todas al forward, lo dice', /3 de 6 con forward/.test(partial), partial);
  setLocale('en');
  check('en inglés', /24 of 38/.test(forwardHoldHtml(p, 0.65)), forwardHoldHtml(p, 0.65));
  setLocale('es');
  check('sin forward, un guion', forwardHoldHtml({ oosValidation: null }) === '—');
}

console.log(`\n${'='.repeat(70)}\nRESULTADO: ${checks - failures}/${checks} correctas\n${'='.repeat(70)}`);
if (failures) process.exit(1);
