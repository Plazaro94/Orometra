// Exportacion: ficheros .set para MT5, rango de refinamiento e informe JSON.

import { getLocale, L } from './i18n.js';
import { mergeSetValues } from '../core/setfile.js';

/** Formato MT5 (.set / pegar en Inputs): punto decimal, sin locale. */
export function formatSetValue(value) {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) return '0';
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(8)));
}

function fmt(value) {
  return formatSetValue(value);
}

/**
 * Fichero .set de despliegue: solo valores, que es lo que carga el probador al
 * pulsar "Cargar" en la pestana de parámetros de entrada.
 */
export function buildSetFile(analysis, plateau, baseSet = null) {
  const { paramNames } = analysis.meta;
  const merged = mergeSetValues(paramNames, paramNames.map((_, j) => fmt(plateau.record.params[j])), baseSet);
  const lines = [
    '; ================================================================',
    L('; Orometra - configuración representativa', '; Orometra - representative configuration'),
    L(`; Meseta ${plateau.rank} de ${analysis.plateaus.length} | Pass original ${plateau.record.id}`, `; Plateau ${plateau.rank} of ${analysis.plateaus.length} | Original pass ${plateau.record.id}`),
    L(`; Robustez ${plateau.robust.toFixed(1)}/100 | ${plateau.size} configuraciones en la región`, `; Robustness ${plateau.robust.toFixed(1)}/100 | ${plateau.size} configurations in the region`),
    L('; Elegida por puesto conjunto in-sample + forward, promediado con sus vecinas.', '; Chosen by combined in-sample + forward rank, averaged with its neighbors.'),
    L(`; Generado ${new Date().toISOString()}`, `; Generated ${new Date().toISOString()}`),
    ...setCompletenessComment(merged),
    '; ================================================================',
  ];
  merged.entries.forEach((e) => {
    lines.push(`${e.name}=${e.text}`);
  });
  lines.push('');
  return lines.join('\r\n') + '\r\n';
}

/** Comentario del .set sobre qué parámetros lleva (ver mergeSetValues). */
function setCompletenessComment(merged) {
  if (merged.complete) {
    return [L(
      `; Parámetros: ${merged.entries.length} (${merged.optimized} con la configuración elegida y ${merged.fromSet} con los valores de tu .set de la optimización).`,
      `; Parameters: ${merged.entries.length} (${merged.optimized} with the chosen configuration and ${merged.fromSet} with the values from your optimization .set).`,
    )];
  }
  return L(
    [
      `; OJO: este archivo solo lleva los ${merged.optimized} parámetros que optimizaste. Al cargarlo en MT5,`,
      '; el resto se queda como lo tengas en ese momento en el probador. Suelta en Orometra el .set',
      '; de tu optimización para obtener uno completo.',
    ],
    [
      `; NOTE: this file only carries the ${merged.optimized} parameters you optimized. When loaded in MT5,`,
      '; the rest stay as you have them in the tester at that moment. Drop your optimization .set',
      '; in Orometra to get a complete one.',
    ],
  );
}

/**
 * Texto para la interfaz junto al botón de descarga: qué lleva el .set y qué le falta.
 */
export function setCoverageNote(analysis, plateau, baseSet = null) {
  const names = analysis.meta.paramNames;
  const merged = mergeSetValues(names, names.map((_, j) => fmt(plateau.record.params[j])), baseSet);
  if (merged.complete) {
    return L(
      `El .set lleva los ${merged.entries.length} parámetros: ${merged.optimized} con la meseta elegida y ${merged.fromSet} con los valores de tu .set de la optimización.`,
      `The .set carries all ${merged.entries.length} parameters: ${merged.optimized} from the chosen plateau and ${merged.fromSet} with the values from your optimization .set.`,
    );
  }
  return L(
    `El .set solo lleva los ${merged.optimized} parámetros que optimizaste: MT5 no cambiará el resto y quedarán como los tengas en el probador. Suelta el .set de tu optimización para completarlo.`,
    `The .set only carries the ${merged.optimized} parameters you optimized: MT5 will not change the rest and they will stay as you have them in the tester. Drop your optimization .set to complete it.`,
  );
}

/**
 * Fichero .set con rangos para la SEGUNDA optimizacion, en rejilla completa y
 * acotada a la meseta. Formato de MT5: nombre=valor||inicio||paso||fin||Y
 */
export function buildRefinementSetFile(analysis, plateau, baseSet = null) {
  const merged = mergeSetValues(plateau.refinement.map((p) => p.name), plateau.refinement.map((p) => fmt(p.center !== undefined ? p.center : p.value)), baseSet);
  const lines = [
    '; ================================================================',
    L('; Orometra - rango de refinamiento', '; Orometra - refinement range'),
    ';',
    ...L(
      [
        '; Cárgalo en el probador y lanza una optimización con el algoritmo lento',
        '; (búsqueda completa) sobre este rango reducido. Con la búsqueda completa la',
        '; geometría de mesetas se mide de verdad, sin los huecos que deja el genético.',
        '; Después vuelve a subir los dos archivos a la aplicación.',
      ],
      [
        '; Load it in the tester and run an optimization with the slow complete',
        '; algorithm over this reduced range. With the complete search the plateau',
        '; geometry is measured for real, without the gaps the genetic algorithm leaves.',
        '; Then upload the two files to the application again.',
      ],
    ),
    ';',
    // Sin separador de miles ni formato regional: es un archivo para una máquina.
    L(`; Combinaciones del rango: ${plateau.refinement.reduce((a, p) => a * (p.constant ? 1 : p.levels), 1)}`, `; Combinations in the range: ${plateau.refinement.reduce((a, p) => a * (p.constant ? 1 : p.levels), 1)}`),
    L(`; Generado ${new Date().toISOString()}`, `; Generated ${new Date().toISOString()}`),
    '; ================================================================',
  ];
  const categorical = plateau.refinement.filter((p) => p.categorical);
  if (categorical.length) {
    lines.push(';');
    lines.push(L('; Parámetros booleanos o de enumeración: se dejan fijos en el valor', '; Boolean or enumeration parameters: kept fixed at the'));
    lines.push(L('; recomendado. Si quieres barrerlos, actívalos a mano en el probador.', '; recommended value. If you want to sweep them, enable them by hand in the tester.'));
    lines.push(`; ${categorical.map((p) => p.name).join(', ')}`);
  }
  lines.push(...setCompletenessComment(merged));
  lines.push('; ================================================================');
  const byName = new Map();
  plateau.refinement.forEach((p) => {
    if (p.constant) {
      byName.set(p.name, `${p.name}=${fmt(p.value)}||${fmt(p.value)}||0||${fmt(p.value)}||N`);
    } else if (p.fixed) {
      // Categorico, o sin margen en el presupuesto: se deja en el valor recomendado.
      byName.set(p.name, `${p.name}=${fmt(p.center)}||${fmt(p.center)}||0||${fmt(p.center)}||N`);
    } else {
      byName.set(p.name, `${p.name}=${fmt(p.center)}||${fmt(p.start)}||${fmt(p.step)}||${fmt(p.stop)}||Y`);
    }
  });
  // Los parámetros que no se optimizaron van fijos (N) con el valor de tu .set.
  merged.entries.forEach((e) => {
    lines.push(e.source === 'base' ? `${e.name}=${e.text}||${e.text}||0||${e.text}||N` : byName.get(e.name));
  });
  return lines.join('\r\n') + '\r\n';
}

/** Fingerprint estable del resultado (reproducibilidad entre runs). */
export function fingerprintAnalysis(analysis) {
  const payload = JSON.stringify({
    selectionMode: analysis.meta && analysis.meta.selectionMode,
    total: analysis.meta && analysis.meta.total,
    coverage: analysis.meta && Number((analysis.meta.coverage || 0).toFixed(8)),
    sampling: analysis.meta && analysis.meta.sampling,
    params: analysis.meta && analysis.meta.paramNames,
    gates: analysis.meta && analysis.meta.policy && analysis.meta.policy.gates,
    plateaus: (analysis.plateaus || []).map((p) => ({
      id: String(p.record.id),
      size: p.size,
      robust: Number(p.robust.toFixed(4)),
      oosFrac: p.oosValidation ? Number(p.oosValidation.passFrac.toFixed(4)) : null,
    })),
    level: analysis.verdict && analysis.verdict.level,
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (`00000000${(h >>> 0).toString(16)}`).slice(-8);
}

/** Informe completo en JSON, sin los arrays pesados por configuracion. */
export function buildReport(analysis, extra = {}) {
  return {
    generatedAt: new Date().toISOString(),
    tool: 'Orometra v2',
    fingerprint: fingerprintAnalysis(analysis),
    source: extra.source || null,
    // El nivel que el usuario vio en pantalla, no el crudo del motor: exportar "strong"
    // mientras la interfaz dice "moderada" hacia que el informe compartido contradijera
    // a la app. El del motor se conserva aparte, para trazabilidad.
    verdict: extra.shownVerdict
      ? { ...analysis.verdict, level: extra.shownVerdict.level, headline: extra.shownVerdict.headline, summary: extra.shownVerdict.summary, engineLevel: analysis.verdict.level }
      : analysis.verdict,
    meta: analysis.meta,
    integrity: analysis.integrity,
    statistics: analysis.stats,
    sensitivity: analysis.sensitivity.map((s) => ({
      name: s.name, sensitivity: s.sensitivity, levels: s.levels, constant: s.constant, values: s.values,
    })),
    plateaus: analysis.plateaus.map((p) => ({
      rank: p.rank,
      size: p.size,
      coreSize: p.coreSize,
      robustness: p.robust,
      coherence: p.coherence,
      medianScore: p.medianScore,
      q10Score: p.q10Score,
      worstScore: p.worstScore,
      medianQualityIs: p.medianIs,
      medianQualityOos: p.medianOos,
      oosValidation: p.oosValidation || null,
      representative: {
        pass: p.record.id,
        params: Object.fromEntries(analysis.meta.paramNames.map((n, j) => [n, p.record.params[j]])),
        qualityIs: p.record.qualityIs,
        qualityOos: p.record.qualityOos,
        metricsIs: p.record.is,
        metricsOos: p.record.oos,
        support: p.stability.support,
        neighbourFloorQ25: p.stability.q25,
      },
      boundaryAtRepresentative: p.boundary,
      refinement: p.refinement,
    })),
    rejectedPeaks: analysis.peaks.map((p) => ({
      pass: p.record.id,
      criterionRank: p.criterionRank,
      criterionValue: p.key,
      quality: p.score,
      support: p.st.support,
      reasons: p.reasons,
    })),
  };
}

/**
 * CSV de todas las configuraciones.
 *
 * Un solo formato numerico por archivo, el que abre bien la hoja de calculo del idioma
 * activo: ES = ';' y coma decimal; EN = ',' y punto. Antes los parametros salian con
 * punto y las metricas con coma en el mismo archivo, y las cabeceras siempre en español.
 * Los textos (enums) van entre comillas y sin '=' inicial, para que no se lean como formula.
 */
export function buildCsv(analysis) {
  const es = getLocale() === 'es';
  const sep = es ? ';' : ',';
  const n = (v) => (Number.isFinite(v) ? (es ? String(Number(v.toFixed(6))).replace('.', ',') : String(Number(v.toFixed(6)))) : '');
  const cell = (v) => {
    if (typeof v === 'number') return n(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/^[=+\-@]/, "'$&");
    return /["\n\r;,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const { paramNames } = analysis.meta;
  const hasF = analysis.meta.hasForward;
  const head = es
    ? ['pass', ...paramNames, 'calidad_is', 'calidad_forward', 'puntuacion', 'robustez', 'vecinos', 'suelo_vecindad_q25', 'frac_vecinos_ok', 'acantilado', 'pico_z', 'cumple_minimos_is', 'cumple_minimos_forward', 'meseta']
    : ['pass', ...paramNames, 'quality_is', 'quality_forward', 'score', 'robustness', 'neighbors', 'neighborhood_floor_q25', 'neighbors_ok_share', 'cliff', 'peak_z', 'meets_minima_is', 'meets_minima_forward', 'plateau'];
  const rows = analysis.records.map((r, i) => {
    const st = analysis.stability[i];
    const okIs = r.failsIs ? !r.failsIs.length : r.passes;
    const okOos = hasF && r.failsOos ? (r.failsOos.length ? 0 : 1) : '';
    return [
      cell(r.id), ...r.params.map(cell),
      n(r.qualityIs), n(r.qualityOos), n(analysis.scores[i]), n(analysis.robust[i]),
      st.support, n(st.q25), n(st.fracPass), n(st.cliff), n(st.peakZ),
      okIs ? 1 : 0, okOos, analysis.inPlateau[i] >= 0 ? analysis.inPlateau[i] + 1 : '',
    ].join(sep);
  });
  return [head.map(cell).join(sep), ...rows].join('\r\n');
}

export function downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
