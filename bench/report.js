// Calcula las métricas de bench/PREREGISTRO.md a partir de bench/results/<split>.jsonl.
//
//   node bench/report.js calib
//   node bench/report.js test

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const split = process.argv[2] || 'calib';
const file = path.join(HERE, 'results', `${split}.jsonl`);
const REPORT_NAME = process.argv[3] || split;
const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

const NO_EDGE = new Set(['S1', 'S2', 'S5']);
const WITH_EDGE = ['S3', 'S4', 'S6', 'S7', 'S8'];
const METHODS = ['orometra', 'B1', 'B2', 'B3', 'B4', 'B5'];
const NAMES = { orometra: 'Orometra', B1: 'B1 primera fila MT5', B2: 'B2 mejor en forward', B3: 'B3 puesto IS+forward', B4: 'B4 media con vecinas', B5: 'B5 al azar entre las que pasan' };
const median = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const mean = (v) => { const s = v.filter(Number.isFinite); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : NaN; };
const pct = (x) => (Number.isFinite(x) ? `${(100 * x).toFixed(1)} %` : '—');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '—');
const good = rows.filter((r) => !r.fatal);
const fatal = rows.filter((r) => r.fatal);
const errors = good.filter((r) => r.error);
// «buena» la da el motor desde la enmienda del 2026-10-09; antes solo existía en pantalla.
const isPos = (l) => l === 'moderate' || l === 'good' || l === 'strong';
const isHigh = (l) => l === 'good' || l === 'strong';

const out = [];
const verdicts = [];
const verdict = (name, ok, detail) => { verdicts.push({ name, ok, detail }); };
out.push(`# Resultados del banco de pruebas: ${split.startsWith('exam3') ? 'tercer examen (ciego)' : split.startsWith('exam2') ? 'segundo examen (ciego)' : split.startsWith('test') ? 'primer examen' : 'calibración'} (${split})`);
out.push('');
out.push(`Casos: ${rows.length} · errores del motor: ${errors.length} · fallos del banco: ${fatal.length}`);
out.push('');

// ---- 1. Falsos positivos
const noEdge = good.filter((r) => NO_EDGE.has(r.scenario));
const fp = noEdge.filter((r) => isPos(r.level)).length / noEdge.length;
const fpStrong = noEdge.filter((r) => r.level === 'strong').length / noEdge.length;
out.push('## 1. Falsos positivos (grupo sin ventaja: S1, S2, S5)');
out.push('');
out.push('| Escenario | Casos | Moderada o más | Buena o sólida | Sólida | Niveles |');
out.push('|---|---|---|---|---|---|');
for (const s of ['S1', 'S2', 'S5']) {
  const g = noEdge.filter((r) => r.scenario === s);
  const lv = {};
  g.forEach((r) => { lv[r.level || 'error'] = (lv[r.level || 'error'] || 0) + 1; });
  out.push(`| ${s} | ${g.length} | ${pct(g.filter((r) => isPos(r.level)).length / g.length)} | ${pct(g.filter((r) => isHigh(r.level)).length / g.length)} | ${pct(g.filter((r) => r.level === 'strong').length / g.length)} | ${Object.entries(lv).map(([k, v]) => `${k} ${v}`).join(', ')} |`);
}
out.push(`| **Total** | ${noEdge.length} | **${pct(fp)}** | **${pct(noEdge.filter((r) => isHigh(r.level)).length / noEdge.length)}** | **${pct(fpStrong)}** | |`);
out.push('');
verdict('Falsos positivos ≤ 5 % (moderada o más)', fp <= 0.05, pct(fp));
// Añadido en la enmienda del 2026-09-29 (auditoría 2), antes del segundo examen: el total
// puede esconder un escenario malo detrás de otro que da 0 % por construcción.
const fpBy = ['S1', 'S2', 'S5'].map((s) => { const g = noEdge.filter((r) => r.scenario === s); return { s, v: g.filter((r) => isPos(r.level)).length / g.length }; });
verdict('Falsos positivos ≤ 5 % en cada escenario sin ventaja', fpBy.every((x) => x.v <= 0.05), fpBy.map((x) => `${x.s} ${pct(x.v)}`).join(', '));
verdict('Falsos positivos ≤ 1 % (sólida)', fpStrong <= 0.01, pct(fpStrong));
// Añadidos en la enmienda del 2026-10-09, antes del tercer examen: «sólida» ya no exige el
// periodo no visto, así que los dos niveles altos se vigilan escenario a escenario.
const byScen = (f) => ['S1', 'S2', 'S5'].map((s) => { const g = noEdge.filter((r) => r.scenario === s); return { s, v: g.filter((r) => f(r.level)).length / g.length }; });
const strongBy = byScen((l) => l === 'strong');
const highBy = byScen(isHigh);
verdict('Sólida ≤ 1 % en cada escenario sin ventaja', strongBy.every((x) => x.v <= 0.01), strongBy.map((x) => `${x.s} ${pct(x.v)}`).join(', '));
verdict('Buena o sólida ≤ 2 % en cada escenario sin ventaja', highBy.every((x) => x.v <= 0.02), highBy.map((x) => `${x.s} ${pct(x.v)}`).join(', '));

// ---- 2. Potencia
const powerSet = good.filter((r) => r.scenario === 'S3' && r.meta.A >= 0.25 && r.meta.tradesIs >= 150);
const power = powerSet.filter((r) => isPos(r.level)).length / powerSet.length;
out.push('## 2. Potencia (S3 con ventaja clara: Sharpe por operación ≥ 0,25 y ≥ 150 operaciones)');
out.push('');
out.push(`Casos: ${powerSet.length} · detectados como moderada o más: **${pct(power)}** · buena o sólida: ${pct(powerSet.filter((r) => isHigh(r.level)).length / powerSet.length)} · sólida: ${pct(powerSet.filter((r) => r.level === 'strong').length / powerSet.length)}`);
out.push('');
verdict('Potencia ≥ 80 %', power >= 0.8, `${pct(power)} de ${powerSet.length}`);

// ---- 3. Elección
const withEdge = good.filter((r) => WITH_EDGE.includes(r.scenario));
const reg = (r, m) => {
  if (m === 'orometra') return r.orometra && Number.isFinite(r.orometra.regret) ? r.orometra.regret : (Number.isFinite(r.B1 && r.B1.regret) ? 1 : NaN);
  return r[m] && Number.isFinite(r[m].regret) ? r[m].regret : NaN;
};
out.push('## 3. Elección: arrepentimiento normalizado (0 = perfecto, 1 = como elegir la mediana)');
out.push('');
out.push('Orometra cuenta con 1 cuando no propone meseta (lo más exigente).');
out.push('');
out.push(`| Método | ${WITH_EDGE.join(' | ')} | **Todos** |`);
out.push(`|---|${WITH_EDGE.map(() => '---').join('|')}|---|`);
const medBy = {};
for (const m of METHODS) {
  const cells = WITH_EDGE.map((s) => median(withEdge.filter((r) => r.scenario === s).map((r) => reg(r, m))));
  medBy[m] = { perScenario: Object.fromEntries(WITH_EDGE.map((s, i) => [s, cells[i]])), all: median(withEdge.map((r) => reg(r, m))) };
  out.push(`| ${NAMES[m]} | ${cells.map(f2).join(' | ')} | **${f2(medBy[m].all)}** |`);
}
out.push('');
const abst = WITH_EDGE.map((s) => { const g = withEdge.filter((r) => r.scenario === s); return `${s} ${pct(g.filter((r) => !r.orometra).length / g.length)}`; });
out.push(`Abstención de Orometra (no propone meseta): ${abst.join(' · ')}`);
const cond = WITH_EDGE.map((s) => `${s} ${f2(median(withEdge.filter((r) => r.scenario === s && r.orometra).map((r) => r.orometra.regret)))}`);
out.push('');
out.push(`Arrepentimiento de Orometra solo cuando propone: ${cond.join(' · ')}`);
out.push('');
const withFb = (r) => (r.orometra && Number.isFinite(r.orometra.regret) ? r.orometra.regret
  : r.orometraFallback && Number.isFinite(r.orometraFallback.regret) ? r.orometraFallback.regret : reg(r, 'orometra'));
if (withEdge.some((r) => r.orometraFallback)) {
  const fbCells = WITH_EDGE.map((s) => f2(median(withEdge.filter((r) => r.scenario === s).map(withFb))));
  out.push(`Con sugerencia orientativa cuando no hay meseta (informativo, fuera de los criterios): ${WITH_EDGE.map((s, i) => `${s} ${fbCells[i]}`).join(' · ')} · **Todos ${f2(median(withEdge.map(withFb)))}**`);
  out.push('');
}
for (const m of METHODS.filter((x) => x !== 'orometra')) {
  verdict(`Elección: mediana de Orometra ≤ ${NAMES[m]}`, medBy.orometra.all <= medBy[m].all + 1e-12, `${f2(medBy.orometra.all)} frente a ${f2(medBy[m].all)}`);
}
const worst = WITH_EDGE.map((s) => ({ s, d: medBy.orometra.perScenario[s] - medBy.B1.perScenario[s] }));
verdict('Elección: en ningún escenario más de 0,10 peor que B1', worst.every((w) => !(w.d > 0.10)), worst.map((w) => `${w.s} ${w.d >= 0 ? '+' : ''}${f2(w.d)}`).join(', '));

// ---- 4. Coherencia de niveles
out.push('## 4. Coherencia: ventaja real media de la configuración elegida, por nivel');
out.push('');
out.push('| Nivel | Casos con elección | Ventaja real media (σ por operación) |');
out.push('|---|---|---|');
const byLevel = {};
for (const l of ['insufficient', 'weak', 'moderate', 'good', 'strong']) {
  const g = good.filter((r) => r.level === l && r.orometra);
  byLevel[l] = mean(g.map((r) => r.orometra.edge));
  out.push(`| ${l} | ${g.length} | ${f2(byLevel[l])} |`);
}
out.push('');
const low = Math.max(...['insufficient', 'weak'].map((l) => byLevel[l]).filter(Number.isFinite));
const coherent = (!Number.isFinite(low) || !Number.isFinite(byLevel.moderate) || low < byLevel.moderate)
  && (!Number.isFinite(byLevel.strong) || !Number.isFinite(byLevel.moderate) || byLevel.moderate <= byLevel.strong)
  && (!Number.isFinite(byLevel.good) || !Number.isFinite(byLevel.moderate) || byLevel.moderate <= byLevel.good)
  && (!Number.isFinite(byLevel.good) || !Number.isFinite(byLevel.strong) || byLevel.good <= byLevel.strong);
verdict('Coherencia: insuficiente/débil < moderada ≤ buena ≤ sólida', coherent, ['insufficient', 'weak', 'moderate', 'good', 'strong'].map((l) => `${l} ${f2(byLevel[l])}`).join(', '));
out.push('Reparto de niveles en el grupo con ventaja:');
out.push('');
out.push('| Escenario | Débil o menos | Moderada | Buena | Sólida |');
out.push('|---|---|---|---|---|');
for (const s of WITH_EDGE) {
  const g = good.filter((r) => r.scenario === s);
  const c = (f) => pct(g.filter((r) => f(r.level)).length / g.length);
  out.push(`| ${s} | ${c((l) => l === 'weak' || l === 'insufficient')} | ${c((l) => l === 'moderate')} | ${c((l) => l === 'good')} | ${c((l) => l === 'strong')} |`);
}
out.push('');

// ---- 5. Tiempos
out.push(`Tiempo del motor: mediana ${median(good.map((r) => r.ms))} ms, máximo ${Math.max(...good.map((r) => r.ms))} ms.`);
out.push('');

// ---- Veredicto
out.push('## Criterios del prerregistro');
out.push('');
out.push('| Criterio | Resultado | Valor |');
out.push('|---|---|---|');
for (const v of verdicts) out.push(`| ${v.name} | ${v.ok ? 'APROBADO' : '**SUSPENDIDO**'} | ${v.detail} |`);
out.push('');
if (errors.length) { out.push('## Errores del motor'); errors.slice(0, 20).forEach((r) => out.push(`- ${r.scenario} #${r.seed}: ${r.error}`)); }
if (fatal.length) { out.push('## Fallos del banco'); fatal.slice(0, 20).forEach((r) => out.push(`- ${r.scenario} #${r.seed}: ${r.fatal}`)); }

const md = out.join('\n');
fs.writeFileSync(path.join(HERE, 'results', `REPORT-${REPORT_NAME}.md`), md);
console.log(md);
