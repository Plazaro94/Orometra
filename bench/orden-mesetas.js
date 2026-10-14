// Aplica los criterios prerregistrados para el orden entre mesetas (bench/PREREGISTRO.md,
// enmiendas del 2026-10-14 (b) y (c)) a tres tandas del banco con R0, R1 y R2.
//
//   node bench/orden-mesetas.js calib-S1_S2_S3_S4_S5_S6_S7_S8_S9_S10-orden
//
// Lee <prefijo>-current.jsonl, <prefijo>-expected.jsonl y <prefijo>-lower.jsonl.
// Escribe REPORT-orden-mesetas-<split>.md. Criterio (d): se pasa bench/report.js a cada
// tanda restringida a S1-S8 (sus criterios del §6 miden esos escenarios).

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const prefix = process.argv[2];
const split = prefix.split('-')[0];
const RULES = [['R0', 'current'], ['R1', 'expected'], ['R2', 'lower']];
const OLD = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'];
const FP_SCEN = ['S1', 'S2', 'S5', 'S10'];
const ALL = [...OLD, 'S9', 'S10'];

const load = (rule) => fs.readFileSync(path.join(HERE, 'results', `${prefix}-${rule}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const median = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const reg = (r) => (r.orometra && Number.isFinite(r.orometra.regret) ? r.orometra.regret : 1);
const isPos = (l) => l === 'moderate' || l === 'good' || l === 'strong';
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '—');
const pct = (x) => `${(100 * x).toFixed(1)} %`;

const data = Object.fromEntries(RULES.map(([name, rule]) => [name, load(rule)]));
const medS = (name, s) => median(data[name].filter((r) => r.scenario === s).map(reg));
const fp = (name, s) => { const g = data[name].filter((r) => r.scenario === s); return g.filter((r) => isPos(r.level)).length / g.length; };

// §6 sobre S1-S8: se escribe la tanda filtrada y se pasa por report.js.
function criteria6(name, rule) {
  const tag = `${prefix}-${rule}-s1s8`;
  const file = path.join(HERE, 'results', `${tag}.jsonl`);
  fs.writeFileSync(file, data[name].filter((r) => OLD.includes(r.scenario)).map((r) => JSON.stringify(r)).join('\n') + '\n');
  const res = spawnSync(process.execPath, [path.join(HERE, 'report.js'), tag, `orden-${split}-${name}-s1s8`], { encoding: 'utf8' });
  fs.unlinkSync(file);
  const map = new Map();
  for (const line of res.stdout.split('\n')) {
    const m = line.match(/^\| (.+?) \| (APROBADO|\*\*SUSPENDIDO\*\*) \| (.*) \|$/);
    if (m) map.set(m[1], { ok: m[2] === 'APROBADO', value: m[3] });
  }
  return map;
}

const out = [];
out.push(`# Orden entre mesetas: R0, R1 y R2 (${split})`);
out.push('');
out.push('Criterios prerregistrados en `bench/PREREGISTRO.md` (2026-10-14 (b) y (c)). Arrepentimiento');
out.push('normalizado del §5 (1 si no propone meseta). Mediana por escenario.');
out.push('');
out.push(`| Regla | ${ALL.join(' | ')} |`);
out.push(`|---|${ALL.map(() => '---').join('|')}|`);
for (const [name] of RULES) out.push(`| ${name} | ${ALL.map((s) => f3(medS(name, s))).join(' | ')} |`);
out.push('');
out.push(`| «Moderada o más» | ${FP_SCEN.join(' | ')} |`);
out.push(`|---|${FP_SCEN.map(() => '---').join('|')}|`);
for (const [name] of RULES) out.push(`| ${name} | ${FP_SCEN.map((s) => pct(fp(name, s))).join(' | ')} |`);
out.push('');

// Cuántos casos cambian de elección, y en qué dirección (verdad del no visto).
for (const [name] of RULES.slice(1)) {
  for (const s of ['S9', 'S10']) {
    const a = data.R0.filter((r) => r.scenario === s);
    const b = new Map(data[name].filter((r) => r.scenario === s).map((r) => [r.seed, r]));
    let changed = 0;
    let better = 0;
    let worse = 0;
    for (const r of a) {
      const q = b.get(r.seed);
      if (!q || !r.orometra || !q.orometra) continue;
      if (r.orometra.edge !== q.orometra.edge) {
        changed++;
        if (q.orometra.edge > r.orometra.edge) better++; else worse++;
      }
    }
    out.push(`- ${name} en ${s}: cambia la elegida en ${changed} de ${a.length} casos (mejor en el no visto ${better}, peor ${worse}).`);
  }
}
out.push('');

const c6 = Object.fromEntries(RULES.map(([name, rule]) => [name, criteria6(name, rule)]));
out.push('## Criterios');
out.push('');
const verdicts = {};
for (const [name] of RULES.slice(1)) {
  const a = medS(name, 'S9') <= medS('R0', 'S9') - 0.02;
  const worstOld = OLD.map((s) => ({ s, d: medS(name, s) - medS('R0', s) })).sort((x, y) => y.d - x.d)[0];
  const b = OLD.every((s) => medS(name, s) <= medS('R0', s) + 0.01);
  const c = FP_SCEN.every((s) => fp(name, s) <= 0.05 && fp(name, s) <= fp('R0', s) + 0.01);
  const lost = [...c6.R0].filter(([k, v]) => v.ok && !(c6[name].get(k) || {}).ok).map(([k]) => k);
  const d = lost.length === 0;
  verdicts[name] = a && b && c && d;
  out.push(`### ${name}`);
  out.push('');
  out.push(`- (a) S9: ${f3(medS(name, 'S9'))} frente a ${f3(medS('R0', 'S9'))} de R0 (hace falta ≤ ${f3(medS('R0', 'S9') - 0.02)}): **${a ? 'cumple' : 'no cumple'}**`);
  out.push(`- (b) S1-S8, la peor diferencia con R0: ${worstOld.s} ${worstOld.d >= 0 ? '+' : ''}${f3(worstOld.d)} (máximo +0,010): **${b ? 'cumple' : 'no cumple'}**`);
  out.push(`- (c) falsos positivos: ${FP_SCEN.map((s) => `${s} ${pct(fp(name, s))}`).join(', ')}: **${c ? 'cumple' : 'no cumple'}**`);
  out.push(`- (d) criterios del §6 que R0 aprueba y ${name} no: ${lost.length ? lost.join('; ') : 'ninguno'}: **${d ? 'cumple' : 'no cumple'}**`);
  out.push('');
}
const winners = Object.entries(verdicts).filter(([, ok]) => ok).map(([n]) => n);
const chosen = winners.length ? winners.sort((x, y) => medS(x, 'S9') - medS(y, 'S9'))[0] : 'R0';
out.push(`**Resultado:** ${winners.length ? `cumple${winners.length > 1 ? 'n' : ''} ${winners.join(' y ')}; se elige **${chosen}**.` : 'ninguna regla cumple los cuatro criterios; se queda **R0**.'}`);
const md = out.join('\n') + '\n';
fs.writeFileSync(path.join(HERE, 'results', `REPORT-orden-mesetas-${split}.md`), md);
console.log(md);
