// Auditoria por linea de comandos, útil para revisar una optimizacion sin navegador
// y para comparar varios EA de una tacada.
//
//   node tools/audit.js <IS.xls> [OOS.xls] [--pf 1.05] [--dd 35] [--trades 100] [--json salida.json]

import fs from 'node:fs';
import path from 'node:path';
import { parseTable } from '../js/parse.js';
import { runAnalysis } from '../js/analysis.js';
import { DEFAULT_POLICY, qualityLabel } from '../js/metrics.js';
import { buildReport } from '../js/export.js';
import { dimRole } from '../js/charts.js';

const argv = process.argv.slice(2);
const files = argv.filter((a) => !a.startsWith('--'));
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

if (!files.length) {
  console.error('Uso: node tools/audit.js <IS.xls> [OOS.xls] [--pf 1.05] [--dd 35] [--trades 100] [--json salida.json]');
  process.exit(2);
}

const policy = {
  ...DEFAULT_POLICY,
  gates: {
    ...DEFAULT_POLICY.gates,
    minProfitFactor: Number(flag('pf', DEFAULT_POLICY.gates.minProfitFactor)),
    maxDrawdownPct: Number(flag('dd', DEFAULT_POLICY.gates.maxDrawdownPct)),
    minTrades: Number(flag('trades', DEFAULT_POLICY.gates.minTrades)),
  },
};

function read(file) {
  const buf = fs.readFileSync(file);
  return parseTable(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), path.basename(file));
}

const es = (v, d = 2) => (Number.isFinite(v) ? v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const esInt = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString('es-ES') : '—');
const rule = (ch = '─') => console.log(ch.repeat(74));
const MARK = { block: '✗', warn: '!', ok: '✓', info: '·' };

const isTable = read(files[0]);
const oosTable = files[1] ? read(files[1]) : null;
const a = runAnalysis({ isTable, oosTable, policy });

rule('═');
console.log(a.verdict.headline.toUpperCase());
rule('═');
// El resumen dice QUE se ha encontrado; el siguiente paso, que se puede hacer con ello.
// Nunca si operarlo: eso no lo mide esta herramienta.
if (a.verdict.summary) { console.log(a.verdict.summary); console.log(''); }
console.log('Qué puedes hacer: ' + a.verdict.nextStep);
console.log('');

console.log(`Archivos        : ${path.basename(files[0])}${files[1] ? ' + ' + path.basename(files[1]) : ' (sin forward)'}`);
console.log(`Configuraciones : ${esInt(a.meta.total)}  |  parámetros: ${a.meta.paramNames.length} (${a.meta.optimisedDims} optimizados)`);
console.log(`Muestreo        : ${a.meta.sampling}  |  cobertura ${es(a.meta.coverage * 100, 4)} % de ${esInt(a.meta.cartesian)}`);
console.log(`Vecindad        : radio ${a.meta.radius}, soporte mediano ${esInt(a.meta.medianSupport)}`);
console.log(`Pasan mínimos   : ${esInt(a.meta.gatePassCount)} (${es(a.meta.gatePassPct * 100, 1)} %)`);
if (a.meta.hasForward) console.log(`Forward estimado: ${es(a.meta.periodRatio * 100, 0)} % de la duración del in-sample`);
console.log('');

rule();
console.log('EVIDENCIA');
rule();
for (const f of a.verdict.findings) {
  console.log(` ${MARK[f.severity] || '·'} ${f.title}`);
  console.log(`   ${f.detail.replace(/(.{68}\s)/g, '$1\n   ')}`);
}
console.log('');

rule();
console.log('ESTADISTICA');
rule();
console.log(` Correlación IS -> OOS (criterio) : ${es(a.stats.spearmanCriterion, 3)}`);
console.log(` Correlación IS -> OOS (calidad)  : ${es(a.stats.spearmanQuality, 3)}`);
console.log(` Fragilidad de la selección       : ${Number.isFinite(a.stats.fragility) ? es(a.stats.fragility * 100, 0) + ' %' : '—'} (peor sentido)`);
if (a.stats.fragilityFolds) {
  const f = a.stats.fragilityFolds;
  console.log(`   · eligiendo por IS  -> forward : ${es(f.isToOos.value * 100, 0)} %`);
  console.log(`   · eligiendo por fwd -> IS      : ${es(f.oosToIs.value * 100, 0)} %`);
  console.log(`   · asimetria entre sentidos     : ${es(a.stats.fragilityAsymmetry * 100, 0)} puntos`);
}
if (a.stats.stabilityCheck) {
  const st = a.stats.stabilityCheck;
  const inter = st.internal || st;
  console.log(` Estabilidad ±20 % (n. umbrales)  : ${es(inter.regionRate * 100, 0)} % (misma región en ${esInt(inter.draws)} variaciones)`);
  console.log(` Estabilidad ±20 % (TUS mínimos)  : ${st.gates ? es(st.gates.regionRate * 100, 0) + ' % (' + esInt(st.gates.draws) + ' variaciones)' : '(omitida: conjunto demasiado grande)'}`);
}
if (a.meta.degreesOfFreedom) {
  const d = a.meta.degreesOfFreedom;
  console.log(` Operaciones por parámetro        : ${es(d.perParam, 0)} (${esInt(d.params)} parámetros, base ${d.basedOn})`);
  console.log(` Configuraciones por operación    : ${es(d.trialsPerTrade, 1)}`);
}
if (a.meta.gateInfluence) {
  const inertes = a.meta.gateInfluence.filter((g) => g.inert && g.name !== 'beneficio');
  if (inertes.length) console.log(` Mínimos que no filtran nada      : ${inertes.map((g) => g.name).join(', ')}`);
}
console.log(` Pruebas / pruebas efectivas      : ${esInt(a.meta.total)} / ${esInt(a.stats.effectiveTrials)}`);
if (a.stats.sharpeTest) {
  const s = a.stats.sharpeTest;
  console.log(` Sharpe máximo observado          : ${es(s.observedMax, 3)} (con ${esInt(s.observedTrades)} ops)`);
  console.log(` Umbral por azar (N / efectivo)   : ${es(s.chanceMax, 3)} / ${es(s.chanceMaxEffective, 3)}`);
  console.log(` Umbral del contraste publicado   : ${es(s.chanceMaxConservative, 3)} (más estricto; ver metodología)`);
}
if (a.meta.rescuedDims && a.meta.rescuedDims.length) {
  console.log(` Rescatados por efecto combinado  : ${a.meta.rescuedDims.map((d) => d.name).join(', ')}`);
}
if (a.meta.irregularGrids && a.meta.irregularGrids.length) {
  console.log(` Rejillas con saltos desiguales   : ${a.meta.irregularGrids.map((g) => `${g.name} (x${es(g.ratio, 0)})`).join(', ')}`);
}
console.log('');

if (a.plateaus.length) {
  rule();
  console.log(`MESETAS (${a.plateaus.length})`);
  rule();
  a.plateaus.slice(0, 5).forEach((p) => {
    console.log(` M${p.rank}: ${esInt(p.size)} configs (nucleo ${esInt(p.coreSize)}) | robustez ${es(p.robust, 1)} | suelo Q10 ${es(p.q10Score, 2)} | dispersión ${es(p.coherence, 2)}`);
  });
  const p = a.plateaus[0];
  const r = p.record;
  console.log('');
  console.log(` CONFIGURACION PROPUESTA — Pass ${r.id}`);
  a.meta.paramNames.forEach((n, j) => console.log(`   ${n.padEnd(26)} ${r.params[j]}`));
  console.log(`   ${'calidad IS'.padEnd(26)} ${es(r.qualityIs, 3)} (${qualityLabel(r.qualityIs)})`);
  if (a.meta.hasForward) console.log(`   ${'calidad forward'.padEnd(26)} ${es(r.qualityOos, 3)} (${qualityLabel(r.qualityOos)})`);
  console.log(`   ${'vecinas / suelo Q25'.padEnd(26)} ${esInt(p.stability.support)} / ${es(p.stability.q25, 2)}`);
  if (a.meta.hasForward) console.log(`   ${'forward PF / DD / ops'.padEnd(26)} ${es(r.oos.profitFactor, 3)} / ${es(r.oos.drawdown, 1)} % / ${esInt(r.oos.trades)}`);
  console.log(`   ${'in-sample PF / DD / ops'.padEnd(26)} ${es(r.is.profitFactor, 3)} / ${es(r.is.drawdown, 1)} % / ${esInt(r.is.trades)}`);
  if (p.boundary.length) console.log(`   BORDE DEL RANGO en: ${p.boundary.map((b) => `${b.name}=${b.atMin ? b.min : b.max}`).join(', ')}`);
  const combos = p.refinement.reduce((acc, x) => acc * (x.constant ? 1 : x.levels), 1);
  console.log(`   Refinamiento sugerido: ${esInt(combos)} combinaciones en rejilla completa`);
  console.log('');
}

if (a.inversions && a.inversions.length) {
  rule();
  console.log('EL OPTIMO DEL IN-SAMPLE NO SIRVE EN EL FORWARD');
  rule();
  a.inversions.forEach((x) => {
    console.log(` ${x.name.padEnd(26)} gana en IS=${String(x.bestIs).padEnd(7)} gana en forward=${String(x.bestOos).padEnd(7)} tiras el ${es(100 * x.regretShare, 0)} % del margen`);
    console.log(`   perfil: ${x.profile.map((p) => `${p.level}: ${es(p.is, 2)}/${es(p.oos, 2)}`).join('  ')}`);
  });
  console.log('');
}

if (a.peaks.length) {
  rule();
  console.log('DESCARTES — encabezan tu ranking y aún así no se recomiendan');
  rule();
  a.peaks.slice(0, 6).forEach((p) => {
    console.log(` #${String(p.criterionRank).padStart(3)} Pass ${String(p.record.id).padEnd(6)} criterio ${es(p.key, 2).padStart(7)} | calidad ${es(p.score, 2)} | vecinas ${String(p.st.support).padStart(3)}`);
    console.log(`      ${p.reasons.join('; ')}`);
  });
  console.log('');
}

rule();
console.log('SENSIBILIDAD DE PARAMETROS');
rule();
[...a.sensitivity].sort((x, y) => y.sensitivity - x.sensitivity).forEach((s) => {
  const bar = '█'.repeat(Math.round(s.sensitivity * 18));
  const role = dimRole(a, s);
  console.log(` ${s.name.padEnd(26)} ${es(s.sensitivity, 2).padStart(5)} ${bar} ${role === 'distancia' ? '' : '[' + role + ']'}`);
});
if (a.meta.blockNames.length) console.log(`\n Parten el espacio (bool/enum): ${a.meta.blockNames.join(', ')}`);
if (a.meta.releasedBlockNames.length) console.log(` Bloqueo liberado por falta de soporte: ${a.meta.releasedBlockNames.join(', ')}`);

const jsonOut = flag('json', null);
if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify(buildReport(a), null, 2), 'utf8');
  console.log(`\nInforme completo escrito en ${jsonOut}`);
}
