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
