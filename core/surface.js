// Rejilla real 2D de calidad para dos parámetros, con el resto de dimensiones
// fijas en la configuración representativa elegida — la base de datos de la
// superficie isométrica que dibuja js/plateau-surface.js. Este módulo no
// dibuja nada: solo prepara los números, y es honesto con los huecos.
//
// Por qué solo dos ejes a la vez: una superficie 3D únicamente puede mostrar
// dos parámetros. Con más de dos optimizados (lo habitual), no hay forma de
// meter el resto sin fingir — así que se fijan en los valores de la
// configuración representativa, igual que ya hace el gráfico de influencia
// por parámetro en Diagnóstico.
//
// Por qué puede haber huecos: si la rejilla fue muestreo genético (no
// exhaustiva), puede que ninguna pasada real tenga esos dos parámetros en
// esos valores exactos CON el resto igual al representante. La celda queda
// `null` — no se interpola ni se inventa un valor. Con una rejilla completa
// (todos los parámetros optimizados a la vez) la cobertura de la rejilla 2D
// es siempre del 100 %, porque toda combinación se probó de verdad.

/**
 * Elige el par de dimensiones más influyentes y no constantes, usando la
 * sensibilidad que el motor ya calculó (`analysis.sensitivity`): la mayor
 * entre marginal y condicional (`effective`), igual criterio que el resto
 * de la aplicación usa para decidir qué parámetro "manda".
 *
 * @param {Array} sensitivity  analysis.sensitivity
 * @returns {[number, number] | null}  índices de dimensión, o null si hay
 *   menos de dos parámetros no constantes que comparar.
 */
export function topInfluentialPair(sensitivity) {
  const ranked = (sensitivity || [])
    .filter((s) => !s.constant)
    .slice()
    .sort((a, b) => (b.effective ?? b.sensitivity ?? 0) - (a.effective ?? a.sensitivity ?? 0));
  if (ranked.length < 2) return null;
  return [ranked[0].index, ranked[1].index];
}

/**
 * Construye la rejilla (dimA × dimB) de calidad in-sample, con el resto de
 * dimensiones fijas en la configuración representativa de `plateau`.
 *
 * No usa `analysis.coords`: el Worker lo borra antes de mandar el análisis a
 * la interfaz (es voluminoso y nada más lo dibuja — ver `stripHeavy` en
 * js/worker.js), así que la posición ordinal de cada parámetro se reconstruye
 * aquí mismo a partir de `records[i].params` y `levels[dim]`.
 *
 * @param {object} analysis  el análisis completo (levels, records, meta)
 * @param {object} plateau   una meseta de analysis.plateaus (usa .representative e .indices)
 * @param {number} dimA
 * @param {number} dimB
 * @returns {{
 *   dims:[number,number], names:[string,string],
 *   levelsA:Array, levelsB:Array,
 *   grid: (null|{quality:number, qualityOos:number, recordIndex:number, inPlateau:boolean})[][],
 *   repCell:[number,number], filled:number, total:number, coverage:number,
 * }}
 */
export function buildAxisPairGrid(analysis, plateau, dimA, dimB) {
  const { levels, records, meta } = analysis;
  const rep = plateau.representative;
  const repParams = records[rep].params;
  const dimCount = repParams.length;
  const otherDims = [];
  for (let d = 0; d < dimCount; d++) if (d !== dimA && d !== dimB) otherDims.push(d);

  const levelsA = levels[dimA];
  const levelsB = levels[dimB];
  const nA = levelsA.length;
  const nB = levelsB.length;
  const plateauSet = new Set(plateau.indices && plateau.indices.length ? plateau.indices : [rep]);
  const grid = Array.from({ length: nB }, () => new Array(nA).fill(null));

  for (let i = 0; i < records.length; i++) {
    const params = records[i].params;
    let matches = true;
    for (let k = 0; k < otherDims.length; k++) {
      if (params[otherDims[k]] !== repParams[otherDims[k]]) { matches = false; break; }
    }
    if (!matches) continue;
    const q = records[i].qualityIs;
    if (!Number.isFinite(q)) continue;
    const a = levelsA.indexOf(params[dimA]);
    const b = levelsB.indexOf(params[dimB]);
    if (a < 0 || b < 0) continue; // no debería pasar; defensivo por si el nivel no cuadra
    const existing = grid[b][a];
    // Con una rejilla cartesiana bien formada no debería haber más de una
    // pasada por celda; si la hay (GA con repetidos), se queda la mejor.
    if (!existing || q > existing.quality) {
      grid[b][a] = {
        quality: q,
        qualityOos: records[i].qualityOos,
        recordIndex: i,
        inPlateau: plateauSet.has(i),
      };
    }
  }

  const repCell = [levelsA.indexOf(repParams[dimA]), levelsB.indexOf(repParams[dimB])];

  let filled = 0;
  for (const row of grid) for (const cell of row) if (cell) filled++;
  const total = nA * nB;

  return {
    dims: [dimA, dimB],
    names: [meta.paramNames[dimA], meta.paramNames[dimB]],
    levelsA,
    levelsB,
    grid,
    repCell,
    filled,
    total,
    coverage: total ? filled / total : 0,
  };
}
