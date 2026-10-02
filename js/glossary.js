import { L } from './i18n.js';
import { esc } from './ui-state.js';

// Definiciones cortas para los terminos mas densos de la app. Se muestran en
// un tooltip al pasar el raton / enfocar con teclado, nunca cambian el texto
// visible ni tocan las cadenas evaluadas por tests (core/verdict.js).
const DEFS = {
  sharpe: {
    es: 'Rentabilidad media de las operaciones dividida entre su volatilidad. MT5 calcula esta cifra de forma distinta según el build del terminal — ver el aviso en el contraste de abajo.',
    en: "Average return of the trades divided by their volatility. MT5 computes this figure differently depending on the terminal build — see the note on the contrast below.",
  },
  profitFactor: {
    es: 'Beneficio bruto entre pérdida bruta. Por encima de 1 gana más de lo que pierde; por debajo de 1, pierde más de lo que gana.',
    en: 'Gross profit divided by gross loss. Above 1 it wins more than it loses; below 1, it loses more than it wins.',
  },
  drawdown: {
    es: 'La mayor caída del capital desde un máximo previo hasta el mínimo posterior, en el periodo analizado.',
    en: 'The largest drop in equity from a prior peak to the following low, within the analyzed period.',
  },
  jointpick: {
    es: 'Regla de elección dentro de la meseta: el puesto de cada configuración en el periodo optimizado más su puesto en el forward, ambos promediados con sus vecinas. Usa los dos periodos sin que uno solo decida, y el promedio con las vecinas quita la suerte de un punto concreto. Una configuración que MT5 no pasó al forward cuenta como el último puesto del forward: no hay ninguna prueba fuera del periodo optimizado a su favor.',
    en: 'Selection rule inside the plateau: each configuration\'s rank on the optimized period plus its forward rank, both averaged with its neighbors. It uses both periods without letting one decide alone, and averaging with neighbors removes single-point luck. A configuration MT5 did not pass to the forward counts as last on the forward: there is no evidence outside the optimized period in its favor.',
  },
  maximin: {
    es: 'Criterio de selección que elige el punto cuyo peor vecino es el mejor posible — en vez del punto con el valor más alto (el pico).',
    en: 'A selection rule that picks the point whose worst neighbor is the best possible one — instead of the single highest-value point (the peak).',
  },
  q10: {
    es: 'La calidad de las configuraciones más flojas de la meseta: solo un 10 % de ellas queda por debajo. Es una medida prudente de lo peor que puede pasar dentro de la zona.',
    en: 'The quality of the plateau\'s weakest configurations: only 10% of them fall below it. A cautious measure of the worst that can happen inside the zone.',
  },
  q25: {
    es: 'La calidad de los vecinos más flojos: solo una cuarta parte de los vecinos queda por debajo. Si es baja, a su alrededor hay mucha configuración que no funciona.',
    en: 'The quality of the weakest neighbors: only a quarter of the neighbors fall below it. If it is low, there is a lot around it that does not work.',
  },
  fragility: {
    es: 'Cuántas veces la mejor fila de un periodo cae a la mitad de abajo en el otro. Si es alta, el orden de la tabla de MT5 depende de qué periodo mires y no sirve para elegir.',
    en: 'How often the best row of one period falls to the bottom half in the other. If it is high, the MT5 table order depends on which period you look at and is no use for choosing.',
  },
  effectiveTrials: {
    es: 'Número de regiones distintas del espacio de parámetros probadas, contando vecinos cercanos como una sola prueba en vez de varias independientes.',
    en: 'Number of distinct regions of the parameter space tested, counting nearby neighbors as a single trial instead of several independent ones.',
  },
  sampling: {
    es: 'Cómo cubrió la optimización el espacio de parámetros: rejilla completa (prueba todas las combinaciones), parcial, o dispersa (algoritmo genético, que concentra las pruebas donde ya iba bien).',
    en: 'How the optimization covered the parameter space: full grid (every combination tested), partial, or sparse (genetic algorithm, which concentrates trials where things already looked good).',
  },
  coherence: {
    es: 'Cuánto varía la calidad entre las configuraciones que forman la meseta. Poca variación = zona pareja.',
    en: 'Quality dispersion within the plateau: how much the neighboring configurations that form it vary among themselves.',
  },
  quality: {
    es: 'Nota de 0 a 1 que da Orometra a cada configuración con varias métricas a la vez (factor de beneficio, recuperación, caída máxima, Sharpe, operaciones), no con la columna Result que optimizaste.',
    en: 'A 0-to-1 score Orometra gives each configuration from several metrics at once (profit factor, recovery, maximum drawdown, Sharpe, trades), not from the Result column you optimized.',
  },
  retention: {
    es: 'Calidad en el periodo de validación (forward) dividida entre la calidad en el periodo optimizado, en la mediana de la meseta. 100 % es que no pierde nada al salir de los datos con los que se optimizó.',
    en: 'Quality on the validation period (forward) divided by quality on the optimized period, at the plateau median. 100% means it loses nothing once outside the data it was optimized on.',
  },
  robustness: {
    es: 'Nota que resume en un solo número cómo rinden las configuraciones más flojas de la meseta, su tamaño y lo pareja que es, para ordenar las candidatas.',
    en: 'A score that sums up in one number how the plateau\'s weakest configurations perform, its size and how even it is, to rank candidates.',
  },
};

export function gloss(key, labelHtml, opts) {
  const def = DEFS[key];
  if (!def) return labelHtml;
  const text = L(def.es, def.en);
  const cls = opts && opts.align === 'right' ? 'gloss gloss-right' : 'gloss';
  return `<span class="${cls}" tabindex="0">${labelHtml}<span class="gloss-card" role="tooltip">${esc(text)}</span></span>`;
}
