// Graficos en SVG generados como cadena. Sin dependencias ni canvas: se imprimen
// bien, se copian bien y heredan el tema por CSS.

import { median, quantile, extent } from '../core/stats.js';
import { L, localeTag } from './i18n.js';

const fmt2 = (v) => new Intl.NumberFormat(localeTag(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fx = (n) => (Number.isFinite(n) ? n.toFixed(1) : '0');

function legend(items) {
  return `<div class="chart-legend" role="list">${items.map((it) =>
    `<span class="chart-legend-item" role="listitem"><span class="chart-swatch ${it.cls}" aria-hidden="true"></span>${esc(it.label)}</span>`
  ).join('')}</div>`;
}

/**
 * Apertura del <svg> con alternativa textual: la conclusion del grafico, no su
 * descripcion. Sin ella un lector de pantalla no obtenia nada de estos graficos.
 */
function svgOpen(W, H, label, minW = W) {
  // El SVG escala su texto con el ancho: en un móvil (caja de ~310 px para 620 unidades)
  // las etiquetas salían a 5 px y en un escritorio ancho a 18. --w deja que el CSS
  // limite cuánto crece y, en el móvil, le dé su ancho natural y se deslice de lado.
  // minW: lo mínimo que puede medir en el móvil (los compactos encogen algo más, hasta 240 px).
  return `<div class="chart-scroll" style="--w:${Math.round(minW)}px"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet"><title>${esc(label)}</title>`;
}

function wrapChart(svg, legendHtml) {
  return `<div class="chart-block">${legendHtml || ''}${svg}</div>`;
}

function niceTicks(lo, hi, count = 5) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) return [lo];
  const span = hi - lo;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

function frame(width, height, pad, body, { xLabel = '', yLabel = '', xTicks = [], yTicks = [], xScale, yScale, label = '', minW = width } = {}) {
  const gx = xTicks.map((t) => `<line class="ch-grid" x1="${fx(xScale(t))}" y1="${pad.t}" x2="${fx(xScale(t))}" y2="${height - pad.b}"/><text class="ch-tick" x="${fx(xScale(t))}" y="${height - pad.b + 14}" text-anchor="middle">${esc(formatTick(t))}</text>`).join('');
  const gy = yTicks.map((t) => `<line class="ch-grid" x1="${pad.l}" y1="${fx(yScale(t))}" x2="${width - pad.r}" y2="${fx(yScale(t))}"/><text class="ch-tick" x="${pad.l - 8}" y="${fx(yScale(t) + 3)}" text-anchor="end">${esc(formatTick(t))}</text>`).join('');
  return `${svgOpen(width, height, label || xLabel, minW)}
    ${gx}${gy}
    <line class="ch-axis" x1="${pad.l}" y1="${height - pad.b}" x2="${width - pad.r}" y2="${height - pad.b}"/>
    <line class="ch-axis" x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${height - pad.b}"/>
    ${body}
    ${xLabel ? `<text class="ch-axis-label" x="${(pad.l + width - pad.r) / 2}" y="${height - 4}" text-anchor="middle">${esc(xLabel)}</text>` : ''}
    ${yLabel ? `<text class="ch-axis-label" x="${12}" y="${(pad.t + height - pad.b) / 2}" text-anchor="middle" transform="rotate(-90 12 ${(pad.t + height - pad.b) / 2})">${esc(yLabel)}</text>` : ''}
  </svg></div>`;
}

/**
 * Pantalla estrecha (móvil): los gráficos que siguen siendo SVG (la nube de puntos y los
 * deciles) se dibujan con un ancho de diseño de 280 unidades en vez de 620, para que quepan
 * sin deslizar de lado y su texto no encoja. Si cambia (al girar el móvil), la interfaz los
 * vuelve a dibujar (refreshCompactCharts en ui-verdict.js).
 */
export const COMPACT_QUERY = '(max-width:480px)';
export function isCompact() {
  return typeof matchMedia === 'function' && matchMedia(COMPACT_QUERY).matches;
}

function formatTick(v) {
  if (typeof v === 'boolean') return v ? L('sí', 'yes') : 'no';
  if (typeof v === 'string') return v.length > 12 ? v.slice(0, 11) + '…' : v;
  if (!Number.isFinite(v)) return '';
  return new Intl.NumberFormat(localeTag(), { maximumFractionDigits: 3 }).format(Number(v.toFixed(3)));
}

/** Dispersión calidad IS frente a calidad OOS. La diagonal marca "no se degrada". */
export function scatterIsOos(analysis, compact = isCompact()) {
  const W = compact ? 280 : 620; const H = compact ? 280 : 320;
  const pad = compact ? { l: 52, r: 10, t: 12, b: 40 } : { l: 52, r: 16, t: 16, b: 44 };
  if (!analysis.meta.hasForward) return `<p class="muted">${L('Sin periodo forward no hay comparación entre la optimización y la validación.', 'Without a forward period there is no comparison between optimization and validation.')}</p>`;
  const xScale = (v) => pad.l + v * (W - pad.l - pad.r);
  const yScale = (v) => H - pad.b - v * (H - pad.t - pad.b);
  const pts = [];
  const step = Math.max(1, Math.floor(analysis.records.length / 4000));
  for (let i = 0; i < analysis.records.length; i += step) {
    const r = analysis.records[i];
    if (!Number.isFinite(r.qualityIs) || !Number.isFinite(r.qualityOos)) continue;
    const cls = analysis.inPlateau[i] >= 0 ? 'pt-plateau' : r.passes ? 'pt-pass' : 'pt-fail';
    pts.push(`<circle class="${cls}" cx="${fx(xScale(r.qualityIs))}" cy="${fx(yScale(r.qualityOos))}" r="${compact ? 1.6 : 2}"/>`);
  }
  const reps = analysis.plateaus.slice(0, 5).map((p, i) => {
    const r = p.record;
    // La etiqueta, a la izquierda del punto si a la derecha no cabe (en el móvil, la elegida
    // suele estar arriba a la derecha, junto al borde).
    const px = xScale(r.qualityIs); const left = px > W - pad.r - 60;
    return `<circle class="pt-rep" cx="${fx(px)}" cy="${fx(yScale(r.qualityOos))}" r="${compact ? 5 : 6}"/><text class="ch-point-label" x="${fx(left ? px - 10 : px + 10)}" y="${fx(yScale(r.qualityOos) - 8)}"${left ? ' text-anchor="end"' : ''}>${i === 0 ? esc(L('Elegida', 'Selected')) : i + 1}</text>`;
  }).join('');
  const diagonal = `<line class="ch-diagonal" x1="${xScale(0)}" y1="${yScale(0)}" x2="${xScale(1)}" y2="${yScale(1)}"/>`;
  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const both = analysis.records.filter((r) => Number.isFinite(r.qualityIs) && Number.isFinite(r.qualityOos));
  const worse = both.length ? Math.round((100 * both.filter((r) => r.qualityOos < r.qualityIs).length) / both.length) : 0;
  const svg = frame(W, H, pad, diagonal + pts.join('') + reps, {
    label: L(`Calidad en el periodo optimizado frente al forward: el ${worse} % de las configuraciones pierde calidad en el forward.`,
      `Optimized-period versus forward quality: ${worse}% of configurations lose quality on the forward.`),
    xLabel: compact ? L('Calidad optimizando', 'Quality when optimizing') : L('Calidad en el periodo optimizado', 'Quality on the optimized period'),
    yLabel: L('Calidad en el forward', 'Quality on the forward'),
    xTicks: compact ? [0, 0.25, 0.5, 0.75, 1] : ticks, yTicks: compact ? [0, 0.25, 0.5, 0.75, 1] : ticks, xScale, yScale,
    minW: compact ? 240 : W,
  });
  return wrapChart(svg, legend([
    { cls: 'chart-swatch-fail', label: L('No pasan mínimos', 'Fail the minimums') },
    { cls: 'chart-swatch-pass', label: L('Pasan mínimos', 'Pass the minimums') },
    { cls: 'chart-swatch-plateau', label: L('En meseta', 'In a plateau') },
    { cls: 'chart-swatch-rep', label: L('Configuración elegida de cada meseta', 'Chosen configuration of each plateau') },
  ]));
}

/** Perfil de un parámetro: mediana y recorrido intercuartilico por nivel. */
export function parameterProfile(analysis, paramIndex) {
  const sens = analysis.sensitivity[paramIndex];
  if (!sens || sens.constant) return `<p class="muted">${L('Parámetro constante: no se optimizó.', 'Constant parameter: it was not optimized.')}</p>`;
  const levels = analysis.levels[paramIndex];
  const buckets = levels.map(() => []);
  analysis.records.forEach((r, i) => {
    if (!Number.isFinite(analysis.scores[i]) || !r.passes) return;
    const z = levels.indexOf(r.params[paramIndex]);
    if (z >= 0) buckets[z].push(analysis.scores[i]);
  });
  // En HTML (rejilla CSS) y no en SVG: cada valor probado es una columna que se reparte el
  // ancho que haya. El SVG de 620 unidades obligaba a deslizar de lado en el móvil y dejaba
  // fuera de vista la mitad de los valores. Solo con muchos valores, más de los que caben,
  // se vuelve a deslizar (min-width de cada columna).
  const p100 = (v) => fx(Math.min(1, Math.max(0, v)) * 100);
  const cols = buckets.map((b) => {
    if (b.length < 2) return '<div class="bx-col"></div>';
    const q1 = quantile(b, 0.25); const q3 = quantile(b, 0.75); const m = median(b);
    return `<div class="bx-col"><span class="bx-box" style="bottom:${p100(q1)}%;height:${p100(q3 - q1)}%"></span><span class="bx-med" style="bottom:${p100(m)}%"></span></div>`;
  }).join('');
  const xLabels = levels.map((v, k) => `<span><b>${esc(formatTick(v))}</b>${buckets[k].length}</span>`).join('');
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const grid = yTicks.map((t) => `<i style="bottom:${p100(t)}%"></i>`).join('');
  const yLabels = yTicks.map((t) => `<span style="bottom:${p100(t)}%">${formatTick(t)}</span>`).join('');
  const medians = buckets.map((b) => (b.length >= 2 ? median(b) : -Infinity));
  const bestK = medians.indexOf(Math.max(...medians));
  const profileLabel = bestK >= 0 && Number.isFinite(medians[bestK])
    ? L(`Calidad por valor de ${sens.name}: la mediana más alta está en ${formatTick(levels[bestK])}.`, `Quality by value of ${sens.name}: the highest median is at ${formatTick(levels[bestK])}.`)
    : L(`Calidad por valor de ${sens.name}.`, `Quality by value of ${sens.name}.`);
  return `<div class="chart-scroll"><div class="bx-chart" role="img" aria-label="${esc(profileLabel)}" style="--n:${levels.length}">
    <div class="bx-y" aria-hidden="true">${yLabels}</div>
    <div class="bx-plot" aria-hidden="true">${grid}${cols}</div>
    <div class="bx-x" aria-hidden="true">${xLabels}</div>
    <div class="bx-title" aria-hidden="true">${esc(sens.name)} ${esc(L('— valor probado (abajo, nº de configuraciones)', '— tested value (below, number of configurations)'))}</div>
  </div></div>`;
}

/** Degradacion de la mediana OOS por decil del criterio in-sample. */
export function degradationChart(analysis, compact = isCompact()) {
  const rows = analysis.stats.degradation;
  if (!rows.length) return `<p class="muted">${L('No hay suficientes datos para el análisis por deciles.', 'Not enough data for the decile analysis.')}</p>`;
  const W = compact ? 280 : 620; const H = compact ? 250 : 320;
  const pad = compact ? { l: 42, r: 8, t: 12, b: 46 } : { l: 52, r: 16, t: 16, b: 48 };
  const allVals = rows.flatMap((r) => [r.oosMedian, r.oosQ25]).filter(Number.isFinite);
  let [lo, hi] = extent(allVals);
  const span = hi - lo || 1;
  lo -= span * 0.1; hi += span * 0.1;
  const xScale = (k) => pad.l + ((k + 0.5) / rows.length) * (W - pad.l - pad.r);
  const yScale = (v) => H - pad.b - ((v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const w = (W - pad.l - pad.r) / rows.length * 0.6;
  const bars = rows.map((r, k) => {
    const base = yScale(lo);
    const y = yScale(r.oosMedian);
    const cls = k === rows.length - 1 ? 'ch-bar-top' : 'ch-bar';
    return `<rect class="${cls}" x="${fx(xScale(k) - w / 2)}" y="${fx(y)}" width="${fx(w)}" height="${fx(Math.max(1, base - y))}" rx="2"/>`;
  }).join('');
  const q25line = rows.map((r, k) => `${k ? 'L' : 'M'}${fx(xScale(k))},${fx(yScale(r.oosQ25))}`).join(' ');
  // En el móvil, «D1…D10» no cabe bajo diez barras de 23 unidades: solo el número.
  const labels = rows.map((r, k) => `<text class="ch-tick" x="${fx(xScale(k))}" y="${H - pad.b + 15}" text-anchor="middle">${compact ? r.decile : `D${r.decile}`}</text>`).join('');
  const yTicks = niceTicks(lo, hi, 5);
  const gy = yTicks.map((t) => `<line class="ch-grid" x1="${pad.l}" y1="${fx(yScale(t))}" x2="${W - pad.r}" y2="${fx(yScale(t))}"/><text class="ch-tick" x="${pad.l - 8}" y="${fx(yScale(t) + 3)}" text-anchor="end">${formatTick(t)}</text>`).join('');
  const top = rows[rows.length - 1];
  const restMedian = median(rows.slice(0, -1).map((r) => r.oosMedian).filter(Number.isFinite));
  const degLabel = L(
    `Criterio forward por decil del criterio en el periodo optimizado: tus mejores (D10) tienen mediana ${formatTick(top.oosMedian)} frente a ${formatTick(restMedian)} del resto.`,
    `Forward criterion by optimized-period criterion decile: your best (D10) have median ${formatTick(top.oosMedian)} versus ${formatTick(restMedian)} for the rest.`,
  );
  const yMid = (pad.t + H - pad.b) / 2;
  const svg = `${svgOpen(W, H, degLabel, compact ? 240 : W)}
    ${gy}${bars}<path class="ch-line-q25" d="${q25line}"/>${labels}
    <text class="ch-axis-label" x="12" y="${yMid}" text-anchor="middle" transform="rotate(-90 12 ${yMid})">${esc(compact ? L('Forward (mediana)', 'Forward (median)') : L('Resultado en el forward (mediana)', 'Result on the forward (median)'))}</text>
    <line class="ch-axis" x1="${pad.l}" y1="${H - pad.b}" x2="${W - pad.r}" y2="${H - pad.b}"/>
    <text class="ch-axis-label" x="${(pad.l + W - pad.r) / 2}" y="${H - 6}" text-anchor="middle">${esc(compact ? L('Decil de puesto (10 = tu 10 % mejor)', 'Rank decile (10 = your best 10%)') : L('Grupos según su puesto en la optimización (D10 = tu 10 % mejor)', 'Groups by optimization rank (D10 = your best 10%)'))}</text>
  </svg></div>`;
  return wrapChart(svg, legend([
    { cls: 'chart-swatch-bar', label: L('Mediana en el forward', 'Forward median') },
    { cls: 'chart-swatch-bar-top', label: L('D10: tus mejores', 'D10: your best') },
    { cls: 'chart-swatch-q25', label: L('El 25 % peor en el forward', 'Worst 25% on the forward') },
  ]));
}

/**
 * Papel de cada parámetro en el motor. Un categorico que particiona no es lo mismo
 * que un parámetro plano: confundirlos en la interfaz haría pensar que un booleano
 * decisivo se esta ignorando.
 */
export function dimRole(analysis, sens) {
  if (sens.constant) return 'no optimizado';
  const m = analysis.meta;
  if (m.activeDims.includes(sens.index)) return 'distancia';
  if (m.blockDims && m.blockDims.includes(sens.index)) return 'particion';
  if (m.releasedBlockNames && m.releasedBlockNames.includes(sens.name)) return 'liberado';
  return 'plano';
}

/**
 * Sensibilidad relativa de cada parametro. La barra representa el EFECTIVO (el mayor
 * entre aislado y combinado, igual criterio que usa el propio motor para decidir que
 * ejes son "distancia") y no solo el aislado: un parametro cuyo efecto se invierte
 * segun otro sale plano aislado y no combinado, y mostrar solo el aislado aqui
 * escondería justo el caso que la metodologia avisa que hay que vigilar.
 */
export function sensitivityBars(analysis) {
  const eff = (r) => (Number.isFinite(r.effective) ? r.effective : r.sensitivity);
  const rows = [...analysis.sensitivity].sort((a, b) => eff(b) - eff(a));
  const [, maxS] = extent(rows.map(eff));
  const pct = (v) => (maxS > 0 ? Math.min(100, Math.max(0, (v / maxS) * 100)) : 0);
  // En HTML y no en SVG: es una lista de filas, y así se adapta al ancho. En el móvil, el
  // SVG de 620 px se deslizaba de lado y las cifras quedaban fuera de vista.
  const body = rows.map((r) => {
    const role = dimRole(analysis, r);
    const cls = role === 'distancia' ? 'is-active' : role === 'particion' ? 'is-block' : 'is-flat';
    const roleNote = role === 'distancia' ? '' : ({ particion: L('partición', 'partition'), plano: L('plano', 'flat'), liberado: L('liberado', 'released'), 'no optimizado': L('no optimizado', 'not optimized') }[role] || role);
    const value = eff(r);
    const marginal = r.sensitivity || 0;
    // Diferencia real, no solo redondeo: la combinada rescata a este parametro.
    const rescued = Number.isFinite(r.conditional) && value - marginal > 0.05;
    const marker = rescued ? `<span class="sens-mark" style="left:${fx(pct(marginal))}%"></span>` : '';
    const label = rescued
      ? `(${fmt2(value)} · ${L('por sí solo', 'on its own')} ${fmt2(marginal)})`
      : `${fmt2(value)}${roleNote ? ' · ' + roleNote : ''}`;
    return `<li class="sens-row"><span class="sens-name">${esc(r.name)}</span><span class="sens-val">${esc(label)}</span><span class="sens-track" aria-hidden="true"><span class="sens-fill ${cls}" style="width:${fx(Math.max(1, pct(value)))}%"></span>${marker}</span></li>`;
  }).join('');
  const topName = rows.length ? rows[0].name : '';
  return `<ol class="sens-chart" aria-label="${esc(L(`Influencia relativa de cada parámetro; el más influyente es ${topName}.`, `Relative influence of each parameter; the most influential is ${topName}.`))}">${body}</ol>`;
}

/** Mapa 2D: calidad mediana por pareja de valores de los dos parámetros dados. */
export function plateauHeatmap(analysis, dimA, dimB) {
  const la = analysis.levels[dimA];
  const lb = analysis.levels[dimB];
  if (!la || !lb || la.length < 2 || lb.length < 2) return `<p class="muted">${esc(L('Se necesitan dos parámetros con varios valores.', 'Two parameters with several values are needed.'))}</p>`;
  const cells = Array.from({ length: la.length }, () => Array.from({ length: lb.length }, () => []));
  analysis.records.forEach((r, i) => {
    const a = la.indexOf(r.params[dimA]);
    const b = lb.indexOf(r.params[dimB]);
    if (a >= 0 && b >= 0 && Number.isFinite(analysis.scores[i])) cells[a][b].push(analysis.scores[i]);
  });
  // Color por tramos del rango observado (no por opacidad del valor bruto): con calidades
  // de 0,23 a 0,62 todo salía del mismo gris y las cifras no se leían. Seis tonos reales,
  // y la cifra en claro u oscuro según el tono de su celda.
  const meds = cells.flat().filter((v) => v.length).map((v) => median(v));
  const lo = meds.length ? Math.min(...meds) : 0;
  const hi = meds.length ? Math.max(...meds) : 1;
  const step = (m) => (hi > lo ? Math.min(5, Math.floor(((m - lo) / (hi - lo)) * 6)) : 5);
  const nameA = analysis.meta.paramNames[dimA];
  const nameB = analysis.meta.paramNames[dimB];
  // En HTML (rejilla CSS) y no en SVG: las celdas se reparten el ancho que haya (entre 32
  // y 54 px), así que en el móvil caben enteras sin deslizar de lado. Con muchos valores,
  // más de los que caben, se vuelve a deslizar.
  let rows = '';
  for (let b = lb.length - 1; b >= 0; b--) {
    rows += `<span class="hm-ytick">${esc(formatTick(lb[b]))}</span>`;
    for (let a = 0; a < la.length; a++) {
      const vals = cells[a][b];
      if (!vals.length) { rows += '<span class="hm-cell hm-empty"></span>'; continue; }
      const m = median(vals);
      const k = step(m);
      const tip = `${nameA}=${la[a]}, ${nameB}=${lb[b]} · ${L('calidad mediana', 'median quality')} ${m.toFixed(3)} (${vals.length} configs)`;
      rows += `<span class="hm-cell hm-c${k}${k >= 4 ? ' hm-on' : ''}" title="${esc(tip)}">${fmt2(m)}</span>`;
    }
  }
  const xl = la.map((v) => `<span class="hm-xtick">${esc(formatTick(v))}</span>`).join('');
  const scale = `<div class="hm-legend" aria-hidden="true"><span>${esc(L('Calidad mediana', 'Median quality'))}</span><span>${fmt2(lo)}</span><span class="hm-ramp">${[0, 1, 2, 3, 4, 5].map((i) => `<i class="hm-c${i}"></i>`).join('')}</span><span>${fmt2(hi)}</span></div>`;
  const label = L(`Calidad mediana de cada par de valores de ${nameA} y ${nameB}.`, `Median quality of each pair of values of ${nameA} and ${nameB}.`);
  return `${scale}<div class="chart-scroll"><div class="hm-grid" role="img" aria-label="${esc(label)}" style="--n:${la.length};--m:${lb.length}">
    <span class="hm-ytitle" aria-hidden="true">${esc(nameB)}</span>
    ${rows}
    <span class="hm-corner"></span>${xl}
    <span class="hm-xtitle" aria-hidden="true">${esc(nameA)}</span>
  </div></div>`;
}
