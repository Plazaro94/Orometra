// Graficos en SVG generados como cadena. Sin dependencias ni canvas: se imprimen
// bien, se copian bien y heredan el tema por CSS.

import { median, quantile, extent } from '../core/stats.js';
import { L } from './i18n.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fx = (n) => (Number.isFinite(n) ? n.toFixed(1) : '0');

function legend(items) {
  return `<div class="chart-legend" role="list">${items.map((it) =>
    `<span class="chart-legend-item" role="listitem"><span class="chart-swatch ${it.cls}" aria-hidden="true"></span>${esc(it.label)}</span>`
  ).join('')}</div>`;
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

function frame(width, height, pad, body, { xLabel = '', yLabel = '', xTicks = [], yTicks = [], xScale, yScale } = {}) {
  const gx = xTicks.map((t) => `<line class="ch-grid" x1="${fx(xScale(t))}" y1="${pad.t}" x2="${fx(xScale(t))}" y2="${height - pad.b}"/><text class="ch-tick" x="${fx(xScale(t))}" y="${height - pad.b + 14}" text-anchor="middle">${esc(formatTick(t))}</text>`).join('');
  const gy = yTicks.map((t) => `<line class="ch-grid" x1="${pad.l}" y1="${fx(yScale(t))}" x2="${width - pad.r}" y2="${fx(yScale(t))}"/><text class="ch-tick" x="${pad.l - 8}" y="${fx(yScale(t) + 3)}" text-anchor="end">${esc(formatTick(t))}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" preserveAspectRatio="xMidYMid meet">
    ${gx}${gy}
    <line class="ch-axis" x1="${pad.l}" y1="${height - pad.b}" x2="${width - pad.r}" y2="${height - pad.b}"/>
    <line class="ch-axis" x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${height - pad.b}"/>
    ${body}
    ${xLabel ? `<text class="ch-axis-label" x="${(pad.l + width - pad.r) / 2}" y="${height - 4}" text-anchor="middle">${esc(xLabel)}</text>` : ''}
    ${yLabel ? `<text class="ch-axis-label" x="${12}" y="${(pad.t + height - pad.b) / 2}" text-anchor="middle" transform="rotate(-90 12 ${(pad.t + height - pad.b) / 2})">${esc(yLabel)}</text>` : ''}
  </svg>`;
}

function formatTick(v) {
  if (typeof v === 'boolean') return v ? 'si' : 'no';
  if (typeof v === 'string') return v.length > 12 ? v.slice(0, 11) + '…' : v;
  if (!Number.isFinite(v)) return '';
  if (Math.abs(v) >= 1000) return v.toLocaleString('es-ES');
  return String(Number(v.toFixed(3))).replace('.', ',');
}

/** Dispersión calidad IS frente a calidad OOS. La diagonal marca "no se degrada". */
export function scatterIsOos(analysis) {
  const W = 620; const H = 380; const pad = { l: 52, r: 16, t: 16, b: 44 };
  if (!analysis.meta.hasForward) return '<p class="muted">Sin periodo forward no hay comparacion IS/OOS.</p>';
  const xScale = (v) => pad.l + v * (W - pad.l - pad.r);
  const yScale = (v) => H - pad.b - v * (H - pad.t - pad.b);
  const pts = [];
  const step = Math.max(1, Math.floor(analysis.records.length / 4000));
  for (let i = 0; i < analysis.records.length; i += step) {
    const r = analysis.records[i];
    if (!Number.isFinite(r.qualityIs) || !Number.isFinite(r.qualityOos)) continue;
    const cls = analysis.inPlateau[i] >= 0 ? 'pt-plateau' : r.passes ? 'pt-pass' : 'pt-fail';
    pts.push(`<circle class="${cls}" cx="${fx(xScale(r.qualityIs))}" cy="${fx(yScale(r.qualityOos))}" r="2"/>`);
  }
  const reps = analysis.plateaus.slice(0, 5).map((p, i) => {
    const r = p.record;
    return `<circle class="pt-rep" cx="${fx(xScale(r.qualityIs))}" cy="${fx(yScale(r.qualityOos))}" r="6"/><text class="ch-point-label" x="${fx(xScale(r.qualityIs) + 10)}" y="${fx(yScale(r.qualityOos) - 8)}">M${i + 1}</text>`;
  }).join('');
  const diagonal = `<line class="ch-diagonal" x1="${xScale(0)}" y1="${yScale(0)}" x2="${xScale(1)}" y2="${yScale(1)}"/>`;
  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const svg = frame(W, H, pad, diagonal + pts.join('') + reps, {
    xLabel: L('Calidad en In-Sample', 'In-sample quality'),
    yLabel: L('Calidad en Out-of-Sample', 'Out-of-sample quality'),
    xTicks: ticks, yTicks: ticks, xScale, yScale,
  });
  return wrapChart(svg, legend([
    { cls: 'chart-swatch-fail', label: L('No pasan mínimos', 'Fail gates') },
    { cls: 'chart-swatch-pass', label: L('Pasan mínimos', 'Pass gates') },
    { cls: 'chart-swatch-plateau', label: L('En meseta', 'In a plateau') },
    { cls: 'chart-swatch-rep', label: L('Representante', 'Representative') },
  ]));
}

/** Perfil de un parámetro: mediana y recorrido intercuartilico por nivel. */
export function parameterProfile(analysis, paramIndex) {
  const W = 620; const H = 260; const pad = { l: 52, r: 16, t: 16, b: 48 };
  const sens = analysis.sensitivity[paramIndex];
  if (!sens || sens.constant) return '<p class="muted">Parámetro constante: no se optimizo.</p>';
  const levels = analysis.levels[paramIndex];
  const buckets = levels.map(() => []);
  analysis.records.forEach((r, i) => {
    if (!Number.isFinite(analysis.scores[i]) || !r.passes) return;
    const z = levels.indexOf(r.params[paramIndex]);
    if (z >= 0) buckets[z].push(analysis.scores[i]);
  });
  const xScale = (k) => pad.l + ((k + 0.5) / levels.length) * (W - pad.l - pad.r);
  const yScale = (v) => H - pad.b - v * (H - pad.t - pad.b);
  const bars = buckets.map((b, k) => {
    if (b.length < 2) return '';
    const q1 = quantile(b, 0.25); const q3 = quantile(b, 0.75); const m = median(b);
    const x = xScale(k);
    const w = Math.max(6, (W - pad.l - pad.r) / levels.length * 0.46);
    return `<rect class="ch-iqr" x="${fx(x - w / 2)}" y="${fx(yScale(q3))}" width="${fx(w)}" height="${fx(Math.max(1, yScale(q1) - yScale(q3)))}" rx="2"/>
            <line class="ch-median" x1="${fx(x - w / 2)}" y1="${fx(yScale(m))}" x2="${fx(x + w / 2)}" y2="${fx(yScale(m))}"/>`;
  }).join('');
  const labels = levels.map((v, k) => `<text class="ch-tick" x="${fx(xScale(k))}" y="${H - pad.b + 15}" text-anchor="middle">${esc(formatTick(v))}</text>`).join('');
  const counts = buckets.map((b, k) => `<text class="ch-count" x="${fx(xScale(k))}" y="${H - pad.b + 28}" text-anchor="middle">${b.length}</text>`).join('');
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const gy = yTicks.map((t) => `<line class="ch-grid" x1="${pad.l}" y1="${fx(yScale(t))}" x2="${W - pad.r}" y2="${fx(yScale(t))}"/><text class="ch-tick" x="${pad.l - 8}" y="${fx(yScale(t) + 3)}" text-anchor="end">${formatTick(t)}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" preserveAspectRatio="xMidYMid meet">
    ${gy}${bars}${labels}${counts}
    <line class="ch-axis" x1="${pad.l}" y1="${H - pad.b}" x2="${W - pad.r}" y2="${H - pad.b}"/>
    <line class="ch-axis" x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${H - pad.b}"/>
    <text class="ch-axis-label" x="${(pad.l + W - pad.r) / 2}" y="${H - 6}" text-anchor="middle">${esc(sens.name)} ${esc(L('— valor probado (abajo, nº de configuraciones)', '— tested value (below, number of configurations)'))}</text>
  </svg>`;
}

/** Degradacion de la mediana OOS por decil del criterio in-sample. */
export function degradationChart(analysis) {
  const rows = analysis.stats.degradation;
  if (!rows.length) return '<p class="muted">No hay suficientes datos para el análisis por deciles.</p>';
  const W = 620; const H = 280; const pad = { l: 52, r: 16, t: 16, b: 48 };
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
  const labels = rows.map((r, k) => `<text class="ch-tick" x="${fx(xScale(k))}" y="${H - pad.b + 15}" text-anchor="middle">D${r.decile}</text>`).join('');
  const yTicks = niceTicks(lo, hi, 5);
  const gy = yTicks.map((t) => `<line class="ch-grid" x1="${pad.l}" y1="${fx(yScale(t))}" x2="${W - pad.r}" y2="${fx(yScale(t))}"/><text class="ch-tick" x="${pad.l - 8}" y="${fx(yScale(t) + 3)}" text-anchor="end">${formatTick(t)}</text>`).join('');
  const svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" preserveAspectRatio="xMidYMid meet">
    ${gy}${bars}<path class="ch-line-q25" d="${q25line}"/>${labels}
    <line class="ch-axis" x1="${pad.l}" y1="${H - pad.b}" x2="${W - pad.r}" y2="${H - pad.b}"/>
    <text class="ch-axis-label" x="${(pad.l + W - pad.r) / 2}" y="${H - 6}" text-anchor="middle">${esc(L('Decil del criterio in-sample (D10 = tus mejores)', 'In-sample criterion decile (D10 = your best)'))}</text>
  </svg>`;
  return wrapChart(svg, legend([
    { cls: 'chart-swatch-bar', label: L('Mediana OOS', 'OOS median') },
    { cls: 'chart-swatch-bar-top', label: L('D10 (mejores IS)', 'D10 (best IS)') },
    { cls: 'chart-swatch-q25', label: L('Cuartil bajo OOS', 'OOS lower quartile') },
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
  const rowH = 26;
  const W = 620; const H = rows.length * rowH + 30; const labelW = 190;
  const [, maxS] = extent(rows.map(eff));
  const scale = (v) => (maxS > 0 ? (v / maxS) * (W - labelW - 60) : 0);
  const body = rows.map((r, k) => {
    const role = dimRole(analysis, r);
    const cls = role === 'distancia' ? 'ch-sens-active' : role === 'particion' ? 'ch-sens-block' : 'ch-sens-flat';
    const roleNote = role === 'distancia' ? '' : role;
    const value = eff(r);
    const marginal = r.sensitivity || 0;
    // Diferencia real, no solo redondeo: la combinada rescata a este parametro.
    const rescued = Number.isFinite(r.conditional) && value - marginal > 0.05;
    const y = 14 + k * rowH;
    const wEff = Math.max(2, scale(value));
    const wMarg = Math.max(0, scale(marginal));
    const marker = rescued
      ? `<line class="ch-sens-marginal" x1="${fx(labelW + wMarg)}" y1="${y}" x2="${fx(labelW + wMarg)}" y2="${y + 20}"/>`
      : '';
    const note = rescued ? ` (${value.toFixed(2)} · ${L('aislado', 'isolated')} ${marginal.toFixed(2)})` : `${value.toFixed(2)}${roleNote ? ' · ' + roleNote : ''}`;
    const label = rescued ? note.trim() : note;
    return `<text class="ch-row-label" x="${labelW - 8}" y="${y + 13}" text-anchor="end">${esc(r.name)}</text>
      <rect class="${cls}" x="${labelW}" y="${y + 3}" width="${fx(wEff)}" height="14" rx="3"/>
      ${marker}
      <text class="ch-count" x="${labelW + wEff + 8}" y="${y + 14}">${esc(label)}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}

/** Mapa 2D: calidad mediana por pareja de valores de los dos parámetros dados. */
export function plateauHeatmap(analysis, dimA, dimB) {
  const la = analysis.levels[dimA];
  const lb = analysis.levels[dimB];
  if (!la || !lb || la.length < 2 || lb.length < 2) return '<p class="muted">Se necesitan dos parámetros con varios valores.</p>';
  const cells = Array.from({ length: la.length }, () => Array.from({ length: lb.length }, () => []));
  analysis.records.forEach((r, i) => {
    const a = la.indexOf(r.params[dimA]);
    const b = lb.indexOf(r.params[dimB]);
    if (a >= 0 && b >= 0 && Number.isFinite(analysis.scores[i])) cells[a][b].push(analysis.scores[i]);
  });
  const cw = 46; const ch = 30; const pad = { l: 72, t: 34, r: 16, b: 34 };
  const W = pad.l + la.length * cw + pad.r;
  const H = pad.t + lb.length * ch + pad.b;
  let body = '';
  for (let a = 0; a < la.length; a++) {
    for (let b = 0; b < lb.length; b++) {
      const vals = cells[a][b];
      const x = pad.l + a * cw;
      const y = pad.t + (lb.length - 1 - b) * ch;
      if (!vals.length) {
        body += `<rect class="hm-empty" x="${x}" y="${y}" width="${cw - 2}" height="${ch - 2}" rx="2"/>`;
        continue;
      }
      const m = median(vals);
      const opacity = Math.max(0.06, Math.min(1, m));
      body += `<rect class="hm-cell" style="opacity:${opacity.toFixed(3)}" x="${x}" y="${y}" width="${cw - 2}" height="${ch - 2}" rx="2"><title>${esc(analysis.meta.paramNames[dimA])}=${esc(String(la[a]))}, ${esc(analysis.meta.paramNames[dimB])}=${esc(String(lb[b]))}\ncalidad mediana ${m.toFixed(3)} (${vals.length} configs)</title></rect>`;
      if (cw >= 40) body += `<text class="hm-text" x="${x + (cw - 2) / 2}" y="${y + ch / 2 + 3}" text-anchor="middle">${m.toFixed(2).replace('.', ',')}</text>`;
    }
  }
  const xl = la.map((v, a) => `<text class="ch-tick" x="${pad.l + a * cw + (cw - 2) / 2}" y="${H - pad.b + 14}" text-anchor="middle">${esc(formatTick(v))}</text>`).join('');
  const yl = lb.map((v, b) => `<text class="ch-tick" x="${pad.l - 8}" y="${pad.t + (lb.length - 1 - b) * ch + ch / 2 + 3}" text-anchor="end">${esc(formatTick(v))}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" preserveAspectRatio="xMidYMid meet">
    ${body}${xl}${yl}
    <text class="ch-axis-label" x="${pad.l + (la.length * cw) / 2}" y="${H - 6}" text-anchor="middle">${esc(analysis.meta.paramNames[dimA])}</text>
    <text class="ch-axis-label" x="14" y="${pad.t + (lb.length * ch) / 2}" text-anchor="middle" transform="rotate(-90 14 ${pad.t + (lb.length * ch) / 2})">${esc(analysis.meta.paramNames[dimB])}</text>
  </svg>`;
}
