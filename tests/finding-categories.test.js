// Clasificador de hallazgos (js/ui-state.js#categorizeFinding): decide a que panel de
// Diagnostico/Parametros se engancha cada hallazgo del motor, o si se queda suelto en
// Verdict. Clasifica por texto, no por un campo del motor, así que si alguien cambia la
// redacción de un hallazgo en core/verdict.js sin tocar este archivo, este test debe
// fallar en vez de dejar el hallazgo huérfano o mal enganchado en silencio.
//
//   node tests/finding-categories.test.js

import { categorizeFinding } from '../js/ui-state.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`);
  }
}
function section(t) {
  console.log(`\n${'='.repeat(70)}\n${t}\n${'='.repeat(70)}`);
}

// Un titulo real (ES y su par EN) por cada rama de core/verdict.js que genera un
// hallazgo, con la categoria que le corresponde. null = sin tabla que lo explique en
// otro sitio: se queda como hallazgo suelto en Verdict.
const CASES = [
  ['Ninguna configuración pasa los mínimos', null],
  ['No configuration passes the minimum gates', null],
  ['Solo un resquicio del espacio sobrevive', null],
  ['Only a sliver of the space survives', null],
  ['Poca evidencia: ~10 operaciones por parámetro', null],
  ['Thin evidence: ~10 trades per parameter', null],
  ['Evidencia limitada: ~30 operaciones por parámetro', null],
  ['Limited evidence: ~30 trades per parameter', null],
  ['~115 operaciones por parámetro ajustado', null],
  ['~115 trades per fitted parameter', null],
  ['El conjunto es demasiado pequeño para pronunciarse', null],
  ['The set is too small to pronounce on', null],
  ['No se ha encontrado ninguna meseta', null],
  ['No plateau was found', null],
  ['Mesetas descubiertas in-sample y validadas en forward', null],
  ['Plateaus discovered in-sample and validated on forward', null],
  ['La meseta recomendada solo aguanta el 40% en forward', null],
  ['The recommended plateau only holds 40% on forward', null],
  ['Modo joint: el forward participa en la selección', null],
  ['Joint mode: forward takes part in selection', null],
  ['Sin periodo forward no hay validacion posible', null],
  ['Without a forward period there is no possible validation', null],
  ['Las cifras del forward ya se han usado para elegir', null],
  ['Forward figures have already been used for selection', null],
  ['La vecindad se ha medido de forma aproximada', null],
  ['Neighborhood was measured approximately', null],
  ['La estrategia aguanta en casi todo el espacio de parámetros', null],
  ['The strategy holds across nearly the whole parameter space', null],
  ['Hay una parte amplia del espacio que supera los mínimos', null],
  ['A broad part of the space clears the minima', null],
  ['El periodo forward fue más benigno que el in-sample', null],
  ['The forward period was more benign than the in-sample', null],
  ['Las dos primeras mesetas estan empatadas', null],
  ['The first two plateaus are tied', null],

  ['Tu ranking MT5 (Result) esta invertido: falla el 60%', 'stats'],
  ['Your MT5 ranking (Result) is inverted: fails 60%', 'stats'],
  ['La regla "primera de Result" falla el 70% de las veces', 'stats'],
  ['The "top Result row" rule fails 70% of the time', 'stats'],
  ['Fragilidad del ranking Result: 40%', 'stats'],
  ['Result-ranking fragility: 40%', 'stats'],
  ['Los dos periodos no son intercambiables', 'stats'],
  ['The two periods are not interchangeable', 'stats'],
  ['El mejor Sharpe no supera el umbral del azar (Lo)', 'stats'],
  ['Best Sharpe does not beat the chance threshold (Lo)', 'stats'],
  ['El mejor Sharpe supera el umbral del azar (Lo)', 'stats'],
  ['Best Sharpe beats the chance threshold (Lo)', 'stats'],
  ['El Sharpe aprueba con nuestro criterio, no con el más estricto', 'stats'],
  ['Sharpe passes our criterion, not the stricter one', 'stats'],
  ['El ranking no transfiere de un periodo al otro (rho = 0.05)', 'stats'],
  ['The ranking does not transfer from one period to the other (rho = 0.05)', 'stats'],
  ['Correlación IS -> OOS prácticamente nula (rho = 0.05)', 'stats'],
  ['IS -> OOS correlation practically null (rho = 0.05)', 'stats'],
  ['Correlación IS -> OOS debil (rho = 0.2)', 'stats'],
  ['Weak IS -> OOS correlation (rho = 0.2)', 'stats'],
  ['Correlación IS -> OOS de 0.74', 'stats'],
  ['IS -> OOS correlation of 0.74', 'stats'],

  ['La recomendación aguanta el 82 % de las variaciones de umbral', 'stability'],
  ['The recommendation holds through 82% of threshold variations', 'stability'],
  ['La recomendación solo aguanta el 40 % de las variaciones de umbral', 'stability'],
  ['The recommendation only holds through 40% of threshold variations', 'stability'],
  ['La recomendación no sobrevive a sus propios umbrales (20 %)', 'stability'],
  ['The recommendation does not survive its own thresholds (20%)', 'stability'],
  ['La recomendación aguanta el 100 % de las variaciones de TUS mínimos', 'stability'],
  ['The recommendation holds through 100% of YOUR minima variations', 'stability'],
  ['Tus mínimos mueven la recomendación (aguanta el 40 %)', 'stability'],
  ['Your minima move the recommendation (it holds 40%)', 'stability'],
  ['La recomendación depende de los mínimos que elijas (20 %)', 'stability'],
  ['The recommendation depends on the minima you choose (20%)', 'stability'],
  ['No se ha podido auditar el efecto de tus mínimos', 'stability'],
  ['The effect of your minima could not be audited', 'stability'],

  ['Uno de tus mínimos no está filtrando nada', 'gates'],
  ['One of your minima is not filtering anything', 'gates'],
  ['2 de tus mínimos no están filtrando nada', 'gates'],
  ['2 of your minima are not filtering anything', 'gates'],

  ['Muestreo disperso (sobre niveles vistos): 0.0004%', 'coverage'],
  ['Sparse sampling (on seen levels): 0.0004%', 'coverage'],
  ['Solo 1.50% del rango del .set', 'coverage'],
  ['Only 1.50% of the .set search range', 'coverage'],
  ['La cobertura observada engaña frente al .set', 'coverage'],
  ['Observed coverage misleads vs the .set', 'coverage'],
  ['Cobertura del .set: 96.0%', 'coverage'],
  ['.set coverage: 96.0%', 'coverage'],
  ['Cobertura del .set: 40.00%', 'coverage'],
  ['.set coverage: 40.00%', 'coverage'],
  ['Hay pasadas fuera del rango del .set', 'coverage'],
  ['Some passes fall outside the .set range', 'coverage'],
  ['2 parámetro(s) del archivo no están en el .set', 'coverage'],
  ['2 file parameter(s) missing from the .set', 'coverage'],
  ['Sin .set de optimización: cobertura solo sobre niveles vistos', 'coverage'],
  ['No optimization .set: coverage is on seen levels only', 'coverage'],
  ['Soporte local insuficiente (mediana de 3 vecinos)', 'coverage'],
  ['Insufficient local support (median of 3 neighbors)', 'coverage'],
  ['El periodo OOS es muy corto (aprox. 10% del IS)', 'coverage'],
  ['The OOS period is very short (approx. 10% of IS)', 'coverage'],
  ['El periodo OOS es más largo que el IS (aprox. 130%)', 'coverage'],
  ['The OOS period is longer than IS (approx. 130%)', 'coverage'],

  ['2 parámetro(s) se han conservado por su efecto combinado', 'sensitivity'],
  ['2 parameter(s) were kept for their combined effect', 'sensitivity'],
  ['La rejilla de 1 parámetro(s) tiene saltos desiguales', 'sensitivity'],
  ['The grid of 1 parameter(s) has uneven steps', 'sensitivity'],

  ['En 2 parametro(s), el valor que gana en el in-sample es de los que pierden en el forward', 'parameters'],
  ['In 2 parameter(s), the value that wins in-sample is among those that lose on the forward', 'parameters'],

  ['Los dos archivos no parecen de la misma optimizacion', 'integrity'],
  ['The two files do not appear to be from the same optimization', 'integrity'],
  ['El forward parece un subconjunto del in-sample (posible sesgo de selección)', 'integrity'],
  ['Forward looks like a subset of in-sample (possible selection bias)', 'integrity'],
  ['3 identificadores duplicados', 'integrity'],
  ['3 duplicate identifiers', 'integrity'],
  ['5 pasadas sin pareja', 'integrity'],
  ['5 unpaired passes', 'integrity'],

  ['La configuración propuesta se apoya en un valor que el forward castiga', 'plateau'],
  ['The proposed configuration leans on a value the forward punishes', 'plateau'],
  ['La configuración recomendada esta pegada al borde del rango probado', 'plateau'],
  ['The recommended configuration sits on the edge of the tested range', 'plateau'],
];

section('1. Cada titulo real de core/verdict.js clasifica donde debe');
for (const [title, expected] of CASES) {
  const got = categorizeFinding({ title, detail: '' });
  check(`${expected ?? 'null'} <- "${title.slice(0, 60)}"`, got === expected, `obtenido: ${got}`);
}

// ---------------------------------------------------------------- resumen
console.log(`\n${'='.repeat(70)}`);
console.log(`RESULTADO: ${checks - failures}/${checks} comprobaciones correctas`);
console.log(`${'='.repeat(70)}`);
if (failures) process.exit(1);
