import { L } from './i18n.js';
import { esc } from './ui-state.js';

// Definiciones cortas para los terminos mas densos de la app. Se muestran en
// un tooltip al pasar el raton / enfocar con teclado, nunca cambian el texto
// visible ni tocan las cadenas evaluadas por tests (core/verdict.js).
const DEFS = {
  sharpe: {
    es: 'Rentabilidad media de las operaciones dividida entre su volatilidad. MT5 calcula esta cifra de forma distinta segun el build del terminal — ver el aviso en el contraste de abajo.',
    en: "Average return of the trades divided by their volatility. MT5 computes this figure differently depending on the terminal build — see the note on the contrast below.",
  },
  profitFactor: {
    es: 'Beneficio bruto entre perdida bruta. Por encima de 1 gana mas de lo que pierde; por debajo de 1, pierde mas de lo que gana.',
    en: 'Gross profit divided by gross loss. Above 1 it wins more than it loses; below 1, it loses more than it wins.',
  },
  drawdown: {
    es: 'La mayor caida del capital desde un maximo previo hasta el minimo posterior, en el periodo analizado.',
    en: 'The largest drop in equity from a prior peak to the following low, within the analyzed period.',
  },
  maximin: {
    es: 'Criterio de seleccion que elige el punto cuyo peor vecino es el mejor posible — en vez del punto con el valor mas alto (el pico).',
    en: 'A selection rule that picks the point whose worst neighbor is the best possible one — instead of the single highest-value point (the peak).',
  },
  q10: {
    es: 'Percentil 10: el valor por debajo del cual cae el 10% peor de las configuraciones vecinas. Se usa como "suelo" conservador de la meseta.',
    en: 'The 10th percentile: the value below which the worst 10% of neighboring configurations fall. Used as a conservative "floor" for the plateau.',
  },
  q25: {
    es: 'Percentil 25 (primer cuartil): el valor por debajo del cual cae el 25% peor de las configuraciones del entorno.',
    en: 'The 25th percentile (first quartile): the value below which the worst 25% of neighborhood configurations fall.',
  },
  fragility: {
    es: 'Cuanto cambia la configuracion elegida si en vez de elegir por in-sample validas por forward, o al reves. Alta fragilidad = la eleccion depende de que mitad de datos mires.',
    en: 'How much the chosen configuration changes if, instead of picking by in-sample, you validate by forward, or vice versa. High fragility = the choice depends on which half of the data you look at.',
  },
  effectiveTrials: {
    es: 'Numero de regiones distintas del espacio de parametros probadas, contando vecinos cercanos como una sola prueba en vez de varias independientes.',
    en: 'Number of distinct regions of the parameter space tested, counting nearby neighbors as a single trial instead of several independent ones.',
  },
  sampling: {
    es: 'Como cubrio la optimizacion el espacio de parametros: rejilla completa (prueba todas las combinaciones), parcial, o dispersa (algoritmo genetico, que concentra las pruebas donde ya iba bien).',
    en: 'How the optimization covered the parameter space: full grid (every combination tested), partial, or sparse (genetic algorithm, which concentrates trials where things already looked good).',
  },
  coherence: {
    es: 'Dispersion de calidad dentro de la meseta: cuanto varian entre si las configuraciones vecinas que la forman.',
    en: 'Quality dispersion within the plateau: how much the neighboring configurations that form it vary among themselves.',
  },
  robustness: {
    es: 'Puntuacion compuesta que resume el suelo, el tamano y la coherencia de la meseta en un solo numero para ordenar candidatas.',
    en: 'A composite score summarizing the plateau\'s floor, size and coherence into a single number to rank candidates.',
  },
};

export function gloss(key, labelHtml, opts) {
  const def = DEFS[key];
  if (!def) return labelHtml;
  const text = L(def.es, def.en);
  const cls = opts && opts.align === 'right' ? 'gloss gloss-right' : 'gloss';
  return `<span class="${cls}" tabindex="0">${labelHtml}<span class="gloss-card" role="tooltip">${esc(text)}</span></span>`;
}
