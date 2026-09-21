// Exportacion: ficheros .set para MT5, rango de refinamiento e informe JSON.

function fmt(value) {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) return '0';
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(8)));
}

/**
 * Fichero .set de despliegue: solo valores, que es lo que carga el probador al
 * pulsar "Cargar" en la pestana de parámetros de entrada.
 */
export function buildSetFile(analysis, plateau) {
  const { paramNames } = analysis.meta;
  const lines = [
    '; ================================================================',
    '; Orometra - configuración representativa',
    `; Meseta ${plateau.rank} de ${analysis.plateaus.length} | Pass original ${plateau.record.id}`,
    `; Robustez ${plateau.robust.toFixed(1)}/100 | ${plateau.size} configuraciones en la región`,
    `; Elegida por criterio maximin: es la configuración cuyo PEOR vecino es el mejor.`,
    `; Generado ${new Date().toISOString()}`,
    '; ================================================================',
  ];
  paramNames.forEach((name, j) => {
    lines.push(`${name}=${fmt(plateau.record.params[j])}`);
  });
  lines.push('');
  return lines.join('\r\n') + '\r\n';
}

/**
 * Fichero .set con rangos para la SEGUNDA optimizacion, en rejilla completa y
 * acotada a la meseta. Formato de MT5: nombre=valor||inicio||paso||fin||Y
 */
export function buildRefinementSetFile(analysis, plateau) {
  const lines = [
    '; ================================================================',
    '; Orometra - rango de refinamiento',
    ';',
    '; Cargalo en el probador y lanza una optimizacion "Todos los parámetros"',
    '; (rejilla completa) sobre este rango reducido. Con la rejilla completa la',
    '; geometría de mesetas se mide de verdad, sin los huecos que deja el genetico.',
    '; Después vuelve a subir los dos archivos a la aplicacion.',
    ';',
    `; Combinaciones del rango: ${plateau.refinement.reduce((a, p) => a * (p.constant ? 1 : p.levels), 1).toLocaleString('es-ES')}`,
    `; Generado ${new Date().toISOString()}`,
    '; ================================================================',
  ];
  const categorical = plateau.refinement.filter((p) => p.categorical);
  if (categorical.length) {
    lines.push(';');
    lines.push('; Parámetros booleanos o de enumeracion: se dejan fijos en el valor');
    lines.push('; recomendado. Si quieres barrerlos, activalos a mano en el probador.');
    lines.push(`; ${categorical.map((p) => p.name).join(', ')}`);
  }
  lines.push('; ================================================================');
  plateau.refinement.forEach((p) => {
    if (p.constant) {
      lines.push(`${p.name}=${fmt(p.value)}||${fmt(p.value)}||0||${fmt(p.value)}||N`);
    } else if (p.fixed) {
      // Categorico, o sin margen en el presupuesto: se deja en el valor recomendado.
      lines.push(`${p.name}=${fmt(p.center)}||${fmt(p.center)}||0||${fmt(p.center)}||N`);
    } else {
      lines.push(`${p.name}=${fmt(p.center)}||${fmt(p.start)}||${fmt(p.step)}||${fmt(p.stop)}||Y`);
    }
  });
  return lines.join('\r\n') + '\r\n';
}

/** Informe completo en JSON, sin los arrays pesados por configuracion. */
export function buildReport(analysis) {
  return {
    generatedAt: new Date().toISOString(),
    tool: 'Orometra v2',
    verdict: analysis.verdict,
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

export function buildCsv(analysis) {
  const { paramNames } = analysis.meta;
  const head = ['pass', ...paramNames, 'calidad_is', 'calidad_oos', 'calidad_combinada', 'robustez', 'vecinos', 'suelo_vecindad_q25', 'frac_vecinos_ok', 'acantilado', 'pico_z', 'pasa_puertas', 'meseta'];
  const rows = analysis.records.map((r, i) => {
    const st = analysis.stability[i];
    return [
      r.id, ...r.params,
      num(r.qualityIs), num(r.qualityOos), num(analysis.scores[i]), num(analysis.robust[i]),
      st.support, num(st.q25), num(st.fracPass), num(st.cliff), num(st.peakZ),
      r.passes ? 1 : 0, analysis.inPlateau[i] >= 0 ? analysis.inPlateau[i] + 1 : '',
    ].join(';');
  });
  return [head.join(';'), ...rows].join('\r\n');
}

function num(v) {
  return Number.isFinite(v) ? String(Number(v.toFixed(6))).replace('.', ',') : '';
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
