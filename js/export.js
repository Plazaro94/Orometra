// Exportacion: ficheros .set para MT5, rango de refinamiento e informe JSON.

import { getLocale, L } from './i18n.js';
import { mergeSetValues } from '../core/setfile.js';
import { mt5Figure } from './ui-state.js';

/** Formato MT5 (.set / pegar en Inputs): punto decimal, sin locale. */
export function formatSetValue(value) {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) return '0';
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(8)));
}

const fmt = formatSetValue;

/**
 * Con qué cifras se encuentra la configuración en MT5: el número de pasada no se conserva al
 * cerrar el probador y el del XML puede no coincidir con el de su tabla (PASS-2).
 */
function mt5FiguresComment(rec) {
  const r = (rec && rec.is) || {};
  if (!Number.isFinite(r.profit) || !Number.isFinite(r.trades)) return [];
  const result = Number.isFinite(rec.criterionIs) ? ` · ${L('Resultado', 'Result')} ${mt5Figure(rec.criterionIs)}` : '';
  return [L(`; En MT5 (periodo optimizado): beneficio ${mt5Figure(r.profit)} · ${Math.round(r.trades)} operaciones${result}`,
    `; In MT5 (optimized period): profit ${mt5Figure(r.profit)} · ${Math.round(r.trades)} trades${result}`)];
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
    L('; Orometra (orometra.com) - configuración representativa', '; Orometra (orometra.com) - representative configuration'),
    L(`; Meseta ${plateau.rank} de ${analysis.plateaus.length} | Pasada ${plateau.record.id} del archivo exportado`, `; Plateau ${plateau.rank} of ${analysis.plateaus.length} | Pass ${plateau.record.id} in the exported file`),
    ...mt5FiguresComment(plateau.record),
    L(`; Robustez ${plateau.robust.toFixed(1)}/100 | ${plateau.size} configuraciones en la meseta`, `; Robustness ${plateau.robust.toFixed(1)}/100 | ${plateau.size} configurations in the plateau`),
    L('; Elegida por buen puesto en el periodo optimizado y en el forward, promediado con sus vecinas.', '; Chosen for ranking well on both the optimized period and the forward, averaged with its neighbors.'),
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
      `; OJO: este archivo solo lleva ${merged.optimized === 1 ? 'el parámetro' : `los ${merged.optimized} parámetros`} que optimizaste. Al cargarlo en MT5,`,
      '; el resto se queda como lo tengas en ese momento en el probador. Suelta en Orometra el .set',
      '; de tu optimización para obtener uno completo.',
    ],
    [
      `; NOTE: this file only carries ${merged.optimized === 1 ? 'the parameter' : `the ${merged.optimized} parameters`} you optimized. When loaded in MT5,`,
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
  if (merged.mismatch) {
    return L(
      `El .set solo lleva ${merged.optimized === 1 ? 'el parámetro' : `los ${merged.optimized} parámetros`} que optimizaste: el .set que has soltado no tiene ninguno de ellos (¿es de otro EA?) y no se ha usado para completarlo.`,
      `The .set only carries ${merged.optimized === 1 ? 'the parameter' : `the ${merged.optimized} parameters`} you optimized: the .set you dropped has none of them (is it from another EA?) and was not used to complete it.`,
    );
  }
  if (merged.complete) {
    return L(
      `El .set lleva los ${merged.entries.length} parámetros: ${merged.optimized} con la meseta elegida y ${merged.fromSet} con los valores de tu .set de la optimización.`,
      `The .set carries all ${merged.entries.length} parameters: ${merged.optimized} from the chosen plateau and ${merged.fromSet} with the values from your optimization .set.`,
    );
  }
  return L(
    `El .set solo lleva ${merged.optimized === 1 ? 'el parámetro' : `los ${merged.optimized} parámetros`} que optimizaste: MT5 no cambiará el resto y quedarán como los tengas en el probador. Suelta el .set de tu optimización para completarlo.`,
    `The .set only carries ${merged.optimized === 1 ? 'the parameter' : `the ${merged.optimized} parameters`} you optimized: MT5 will not change the rest and they will stay as you have them in the tester. Drop your optimization .set to complete it.`,
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
    ...(analysis.meta.sampling === 'grid'
      ? L(
        [
          '; Tu optimización ya probó la rejilla entera: este rango pone el paso a la',
          '; mitad alrededor de la configuración recomendada, para ver los valores',
          '; intermedios. Cárgalo en el probador y lanza una optimización con el',
          '; algoritmo lento (búsqueda completa). Después suelta el resultado en Orometra.',
        ],
        [
          '; Your optimization already tested the whole grid: this range halves the',
          '; step around the recommended configuration, to see the in-between values.',
          '; Load it in the tester and run an optimization with the slow complete',
          '; algorithm. Then drop the result into Orometra.',
        ],
      )
      : L(
        [
          '; Cárgalo en el probador y lanza una optimización con el algoritmo lento',
          '; (búsqueda completa) sobre este rango reducido. Con la búsqueda completa',
          '; no quedan huecos sin probar alrededor de la meseta. Después suelta el',
          '; resultado en Orometra.',
        ],
        [
          '; Load it in the tester and run an optimization with the slow complete',
          '; algorithm over this reduced range. With the complete search no gaps are',
          '; left untested around the plateau. Then drop the result into Orometra.',
        ],
      )),
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
    // Los textos de los hallazgos llevan algo de HTML para la pantalla (<strong>, <code>): en
    // el JSON van en texto plano.
    verdict: (() => {
      const v = extra.shownVerdict
        ? { ...analysis.verdict, level: extra.shownVerdict.level, headline: extra.shownVerdict.headline, summary: extra.shownVerdict.summary, engineLevel: analysis.verdict.level }
        : { ...analysis.verdict };
      const plain = (x) => (typeof x === 'string' ? x.replace(/<[^>]+>/g, '') : x);
      return { ...v, headline: plain(v.headline), summary: plain(v.summary), nextStep: plain(v.nextStep), findings: (v.findings || []).map((f) => ({ ...f, title: plain(f.title), detail: plain(f.detail) })) };
    })(),
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
        // Configuraciones distintas del archivo con el mismo beneficio y operaciones (al
        // buscarla en MT5 por sus cifras, cuántas más salen).
        sameFiguresCount: p.record.twins || 0,
        params: Object.fromEntries(analysis.meta.paramNames.map((n, j) => [n, p.record.params[j]])),
        qualityIs: p.record.qualityIs,
        qualityOos: p.record.qualityOos,
        metricsIs: p.record.is,
        metricsOos: p.record.oos,
        support: p.stability.support,
        neighborFloorQ25: p.stability.q25,
      },
      boundaryAtRepresentative: p.boundary,
      refinement: p.refinement,
    })),
    rejectedPeaks: analysis.peaks.map((p) => ({
      pass: p.record.id,
      profitIs: p.record.is ? p.record.is.profit : null,
      tradesIs: p.record.is ? p.record.is.trades : null,
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
  // inPlateau guarda el orden en que se encontró cada meseta, no su puesto: la columna lleva
  // el número que se ve en pantalla («Meseta 1» es la recomendada), como el JSON.
  const rankOf = new Map(analysis.plateaus.map((p) => [p.id, p.rank]));
  const head = es
    ? ['pass', ...paramNames, 'calidad_is', 'calidad_forward', 'puntuacion', 'robustez', 'vecinas', 'suelo_vecindad_q25', 'frac_vecinas_ok', 'acantilado', 'pico_z', 'cumple_minimos_is', 'cumple_minimos_forward', 'meseta', 'beneficio_is', 'operaciones_is', 'result_is']
    : ['pass', ...paramNames, 'quality_is', 'quality_forward', 'score', 'robustness', 'neighbors', 'neighborhood_floor_q25', 'neighbors_ok_share', 'cliff', 'peak_z', 'meets_minima_is', 'meets_minima_forward', 'plateau', 'profit_is', 'trades_is', 'result_is'];
  const rows = analysis.records.map((r, i) => {
    const st = analysis.stability[i];
    const okIs = r.failsIs ? !r.failsIs.length : r.passes;
    const okOos = hasF && r.failsOos ? (r.failsOos.length ? 0 : 1) : '';
    return [
      cell(r.id), ...r.params.map(cell),
      n(r.qualityIs), n(r.qualityOos), n(analysis.scores[i]), n(analysis.robust[i]),
      st.support, n(st.q25), n(st.fracPass), n(st.cliff), n(st.peakZ),
      okIs ? 1 : 0, okOos, analysis.inPlateau[i] >= 0 ? (rankOf.get(analysis.inPlateau[i]) ?? '') : '',
      // Las cifras con las que se busca la configuración en MT5 (el número de pasada no sirve:
      // PASS-2 en docs/MT5_ASSUMPTIONS.md). Al final, para no descolocar a quien lea por posición.
      n(r.is && r.is.profit), n(r.is && r.is.trades), n(r.criterionIs),
    ].join(sep);
  });
  return [head.map(cell).join(sep), ...rows].join('\r\n');
}

/**
 * Texto en UTF-16 little-endian con BOM, que es como guarda MT5 sus propios .set: así el
 * terminal lo lee igual que uno suyo, también los comentarios con tildes.
 */
export function encodeUtf16le(text) {
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes[0] = 0xFF;
  bytes[1] = 0xFE;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    bytes[2 + 2 * i] = c & 0xFF;
    bytes[3 + 2 * i] = c >> 8;
  }
  return bytes;
}

export function downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
  const utf16 = /charset=utf-16le/i.test(mime);
  const blob = new Blob([utf16 ? encodeUtf16le(text) : text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
