// Pruebas de los arreglos metodologicos.
//
//   node tests/method.test.js
//
// Cada bloque corresponde a un fallo concreto que se encontro auditando el motor. Los
// casos estan construidos para que el fallo se manifieste si alguien revierte el arreglo:
// no comprueban que el codigo "funcione", comprueban que NO vuelva a equivocarse.

import {
  buildCoordinates, classifyParams, parameterSensitivity, conditionalSensitivity,
  selectDims, buildNeighborhood, gridRegularity, componentExtent, ENGINE_DEFAULTS,
} from '../js/engine.js';
import { selectionFragility } from '../js/stats.js';
import { periodQuality, resolvePolicy, DEFAULT_POLICY } from '../js/metrics.js';
import { runAnalysis } from '../js/analysis.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}
function section(t) { console.log(`\n${'='.repeat(70)}\n${t}\n${'='.repeat(70)}`); }

function rng(seed = 7) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ============================================================================
section('1. El punto ciego de la sensibilidad marginal');
// Un parametro cuyo efecto se INVIERTE segun otro tiene perfil marginal exactamente
// plano. Si el motor decidiera solo con esa medida lo descartaria del espacio, y
// configuraciones que difieren en el pasarian a contar como vecinas.
{
  const STOP = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const TP = [1, 2, 3, 4, 5];
  const params = [[], [], []];
  const scores = [];
  for (const filtro of [false, true]) {
    for (let si = 0; si < STOP.length; si++) {
      for (let ti = 0; ti < TP.length; ti++) {
        params[0].push(filtro);
        params[1].push(STOP[si]);
        params[2].push(TP[ti]);
        scores.push(0.55 + (filtro ? 1 : -1) * 0.04 * (si - 4.5) - 0.02 * Math.abs(ti - 2));
      }
    }
  }
  const types = classifyParams(params);
  const { coords, levels } = buildCoordinates(params, types);

  const marginal = parameterSensitivity(coords, levels, scores, null, null);
  const stopMarginal = marginal.find((x) => x.index === 1).sensitivity;
  check('el efecto aislado de un parametro de interaccion sale plano',
    stopMarginal < ENGINE_DEFAULTS.sensitivityFloor, `marginal=${stopMarginal.toFixed(4)}`);

  const cond = conditionalSensitivity(coords, levels, scores, null, null);
  const stopCond = cond.find((x) => x.index === 1);
  check('el efecto combinado SI lo detecta',
    stopCond.usable && stopCond.conditional >= ENGINE_DEFAULTS.sensitivityFloor,
    `condicional=${stopCond.conditional}`);

  const sinCondicional = selectDims(parameterSensitivity(coords, levels, scores, null, null), types);
  check('sin la medida combinada, el parametro se descartaria',
    sinCondicional.flatDims.includes(1), `ignorados=[${sinCondicional.flatDims}]`);

  const conCondicional = selectDims(marginal, types, ENGINE_DEFAULTS, cond);
  check('con la medida combinada, el parametro se conserva',
    conCondicional.distanceDims.includes(1), `distancia=[${conCondicional.distanceDims}]`);

  // Y la consecuencia practica de haberlo descartado: la vecindad se infla.
  const bien = buildNeighborhood(coords, [1, 2], { dense: true, blockDims: [0] });
  const mal = buildNeighborhood(coords, [2], { dense: true, blockDims: [0] });
  check('descartarlo multiplicaria el soporte (mesetas falsas)',
    mal.medianSupport > bien.medianSupport * 3, `${bien.medianSupport} -> ${mal.medianSupport}`);
}

// ============================================================================
section('2. Contraste de seleccion en los dos sentidos');
{
  const n = 400;
  const r = rng(3);
  // Caso simetrico: los dos periodos miden lo mismo con ruido. La fragilidad debe ser
  // baja en ambos sentidos y la asimetria pequena.
  const base = Array.from({ length: n }, () => r());
  const isS = base.map((v) => v + (r() - 0.5) * 0.05);
  const oosS = base.map((v) => v + (r() - 0.5) * 0.05);
  const sim = selectionFragility(isS, oosS);
  check('senal real: fragilidad baja', sim.fragility < 0.15, String(sim.fragility));
  check('senal real: los dos sentidos coinciden', sim.asymmetry < 0.15, String(sim.asymmetry));

  // Caso asimetrico: un cambio de regimen castiga justo a las que ganaban en el IS, pero
  // deja intacto al resto. Elegir por IS lleva siempre al grupo destruido; elegir por
  // forward cae en el grueso sano, que tambien iba bien en el IS. La regla falla en un
  // sentido y no en el otro, que es la firma de dos periodos no intercambiables.
  const isA = Array.from({ length: n }, () => r());
  const corte = [...isA].sort((x, y) => y - x)[Math.floor(n * 0.15)];
  const oosA = isA.map((v) => (v >= corte ? v - 1.5 : v));
  const asim = selectionFragility(isA, oosA);
  check('periodos no intercambiables: se detecta asimetria',
    asim.asymmetry >= 0.25, `asimetria=${asim.asymmetry.toFixed(3)} (${(100 * asim.folds.isToOos.value).toFixed(0)}% vs ${(100 * asim.folds.oosToIs.value).toFixed(0)}%)`);
  check('se informa cual es el sentido malo',
    asim.worstDirection === 'is->oos' || asim.worstDirection === 'oos->is', asim.worstDirection);
  check('se reporta el PEOR de los dos sentidos, no el comodo',
    Math.abs(asim.fragility - Math.max(asim.folds.isToOos.value, asim.folds.oosToIs.value)) < 1e-9);

  // Ranking perfectamente transferible: la regla "quedate con la primera" nunca falla.
  const perfecto = selectionFragility(base, base.map((v) => v * 2 + 1));
  check('ranking identico: fragilidad nula', perfecto.fragility === 0, String(perfecto.fragility));
}

// ============================================================================
section('3. Vecindad como bola, no como cruz');
// Con cuatro ejes y radio 3, una configuracion que difiere UN paso en tres de ellos esta
// a distancia 3 y debe contar como vecina. La version anterior solo generaba
// desplazamientos de uno o dos ejes y se la dejaba fuera.
{
  const L = 4;
  const params = [[], [], [], []];
  for (let a = 0; a < L; a++) for (let b = 0; b < L; b++) for (let c = 0; c < L; c++) for (let d = 0; d < L; d++) {
    params[0].push(a); params[1].push(b); params[2].push(c); params[3].push(d);
  }
  const types = classifyParams(params);
  const { coords } = buildCoordinates(params, types);
  const at = (a, b, c, d) => coords.findIndex((z) => z[0] === a && z[1] === b && z[2] === c && z[3] === d);

  // Se fuerza radio 3 construyendo la vecindad con el objetivo alto y sin tope de
  // localidad, para aislar la pregunta geometrica.
  const opts = { ...ENGINE_DEFAULTS, targetSupport: 999, maxLocalShare: 1, maxRadius: 3 };
  const nb = buildNeighborhood(coords, [0, 1, 2, 3], { dense: true, blockDims: [], opts });
  check('el radio llega a 3', nb.radius === 3, String(nb.radius));
  check('se genero el conjunto completo de desplazamientos', nb.offsetsComplete === true);

  const origen = at(1, 1, 1, 1);
  const diagonal = at(2, 2, 2, 1); // tres ejes movidos un paso: distancia 3
  const recto = at(1, 1, 1, 0); // un solo eje movido un paso: distancia 1
  check('la diagonal de tres ejes es vecina (era el fallo)',
    nb.neighbors[origen].includes(diagonal), `vecinos=${nb.neighbors[origen].length}`);
  check('el movimiento de un solo eje sigue siendo vecino',
    nb.neighbors[origen].includes(recto));
  const lejos = at(1, 1, 1, 1) === -1 ? -1 : coords.findIndex((z) => z[0] === 3 && z[1] === 3 && z[2] === 3 && z[3] === 3);
  check('lo que esta fuera del radio no es vecino', !nb.neighbors[origen].includes(lejos));

  // Y el respaldo: si el presupuesto no da, se degrada avisando, no en silencio.
  const apretado = buildNeighborhood(coords, [0, 1, 2, 3], {
    dense: true, blockDims: [], opts: { ...opts, neighborWorkBudget: 1 },
  });
  check('con presupuesto insuficiente se avisa de la aproximacion',
    apretado.offsetsComplete === false, String(apretado.offsetsComplete));
}

// ============================================================================
section('4. Rejillas con saltos desiguales');
{
  const levels = [[10, 20, 30, 100, 500], [1, 2, 3, 4, 5], [0.5, 1.0, 1.5]];
  const irregular = gridRegularity(levels, ['number', 'number', 'number'], ['Stop', 'TP', 'Riesgo']);
  check('detecta la rejilla con saltos desproporcionados',
    irregular.length === 1 && irregular[0].name === 'Stop', JSON.stringify(irregular.map((x) => x.name)));
  check('mide cuanto de desproporcionado es', irregular[0].ratio === 40, String(irregular[0].ratio));
  check('localiza donde estan los saltos',
    irregular[0].jumps.length === 2 && irregular[0].jumps[0].from === 30 && irregular[0].jumps[0].to === 100,
    JSON.stringify(irregular[0].jumps));
  check('no senala rejillas uniformes', !irregular.some((x) => x.name === 'TP' || x.name === 'Riesgo'));
  // Un parametro categorico no tiene "distancia real" que distorsionar.
  const cat = gridRegularity([[1, 2, 3, 100]], ['text'], ['Modo']);
  check('ignora los parametros no numericos', cat.length === 0, String(cat.length));
}

// ============================================================================
section('5. Extension de una meseta frente a densidad de muestreo');
// El algoritmo genetico concentra pruebas donde el in-sample iba bien, asi que contar
// miembros premia donde miro el optimizador. La evidencia se topa por el volumen real.
{
  const coords = [];
  const push = (a, b) => coords.push(Int32Array.from([a, b]));
  // Region A: 3x3 completa, 9 configuraciones, volumen 9.
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) push(a, b);
  const A = coords.map((_, i) => i);
  const extA = componentExtent(A, coords, [0, 1], [[0, 1, 2], [0, 1, 2]]);
  check('en rejilla completa, evidencia = numero de miembros',
    extA.effectiveSize === 9 && extA.boundingVolume === 9, JSON.stringify(extA));
  check('la ocupacion es 1 cuando la region esta llena', Math.abs(extA.occupancy - 1) < 1e-9);

  // Region B: el GA machaca una caja 2x2 con 40 pasadas. Volumen 4.
  const coordsB = [];
  for (let k = 0; k < 40; k++) coordsB.push(Int32Array.from([k % 2, Math.floor(k / 20) % 2]));
  const B = coordsB.map((_, i) => i);
  const extB = componentExtent(B, coordsB, [0, 1], [[0, 1], [0, 1]]);
  check('el sobremuestreo no compra evidencia',
    extB.effectiveSize === 4 && B.length === 40, `miembros=${B.length} efectiva=${extB.effectiveSize}`);
  check('la ocupacion delata el sobremuestreo', extB.occupancy === 10, String(extB.occupancy));
  check('una region ancha vale mas que una estrecha muy muestreada',
    extA.effectiveSize > extB.effectiveSize, `${extA.effectiveSize} vs ${extB.effectiveSize}`);
  check('se informa de la anchura tipica en niveles',
    Math.abs(extA.typicalWidth - 3) < 1e-9, String(extA.typicalWidth));
}

// ============================================================================
section('6. Correccion por duracion: lo que se corrige y lo que no');
{
  // El factor de recuperacion se deja lejos del ancla superior (3) a proposito: saturado
  // en 1 no se podria ver el efecto de la correccion.
  const m = { profitFactor: 1.4, recoveryFactor: 1.2, drawdown: 10, sharpe: 1.5, trades: 200, profit: 5000, expectedPayoff: 25 };
  const plena = periodQuality(m, DEFAULT_POLICY, null);
  const corta = periodQuality(m, DEFAULT_POLICY, null, 0.25);
  check('el ancla de operaciones se ajusta por duracion (aritmetica)',
    corta.parts.trades > plena.parts.trades,
    `${plena.parts.trades.toFixed(3)} -> ${corta.parts.trades.toFixed(3)}`);
  check('el drawdown NO se toca en la puntuacion principal',
    Math.abs(corta.parts.drawdown - plena.parts.drawdown) < 1e-12,
    `${plena.parts.drawdown} vs ${corta.parts.drawdown}`);

  const riesgo = periodQuality(m, DEFAULT_POLICY, null, 0.25, { adjustRisk: true });
  check('bajo peticion expresa el drawdown en la longitud de referencia',
    riesgo.parts.drawdown < plena.parts.drawdown,
    `${plena.parts.drawdown.toFixed(3)} -> ${riesgo.parts.drawdown.toFixed(3)}`);
  check('y el factor de recuperacion en la misma direccion',
    riesgo.parts.recoveryFactor > plena.parts.recoveryFactor);
}

// ============================================================================
section('7. Estabilidad del veredicto frente a sus propias constantes');
{
  const POLICY = { ...DEFAULT_POLICY, gates: { ...DEFAULT_POLICY.gates, minProfitFactor: 1.05, maxDrawdownPct: 35, minTrades: 100 } };
  const metrics = (g, noise, base) => ({
    profit: 200000 * Math.max(0, g) - 20000 + noise * 8000,
    profitFactor: 1.0 + 0.32 * Math.max(0, g) + noise * 0.02,
    recoveryFactor: 4.2 * Math.max(0, g) + noise * 0.2,
    sharpe: 3.2 * Math.max(0, g) + noise * 0.2,
    drawdown: 6 + 55 * (1 - Math.max(0, g)) + noise * 2,
    trades: Math.round(base * (0.7 + 0.6 * Math.max(0, g))),
  });
  const tables = (points, names) => {
    const isH = ['Pass', 'Result', 'Profit', 'Expected Payoff', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Equity DD %', 'Trades', ...names];
    const oosH = ['Pass', 'Forward Result', 'Back Result', 'Profit', 'Expected Payoff', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Equity DD %', 'Trades', ...names];
    const isR = [];
    const oosR = [];
    points.forEach((p, i) => {
      isR.push([i, p.isResult, p.is.profit, p.is.profit / 800, p.is.profitFactor, p.is.recoveryFactor, p.is.sharpe, p.is.drawdown, p.is.trades, ...p.x]);
      oosR.push([i, p.oosResult, p.isResult, p.oos.profit, p.oos.profit / 800, p.oos.profitFactor, p.oos.recoveryFactor, p.oos.sharpe, p.oos.drawdown, p.oos.trades, ...p.x]);
    });
    return [
      { name: 'IS', sheet: 'Tester Optimizator Results', format: 'sintetico', headers: isH, rows: isR },
      { name: 'OOS', sheet: 'Tester Optimizator Results', format: 'sintetico', headers: oosH, rows: oosR },
    ];
  };

  // Meseta ancha y limpia: la recomendacion no debe depender de donde pongamos los cortes.
  const r = rng(29);
  const L = 7;
  const center = [3, 3, 3];
  const pts = [];
  for (let a = 0; a < L; a++) for (let b = 0; b < L; b++) for (let c = 0; c < L; c++) {
    const z = [a, b, c];
    const dist = z.reduce((sacc, v, j) => sacc + ((v - center[j]) / 2.2) ** 2, 0);
    const g = Math.exp(-dist / 2);
    const nz = (r() - 0.5) * 0.08;
    pts.push({
      x: z.map((v) => 10 + v * 5),
      is: metrics(g + nz * 0.2, nz, 1600),
      oos: metrics(g * 0.9 + nz * 0.2, nz, 900),
      isResult: 40 + 45 * g + nz,
      oosResult: 35 + 45 * g + nz,
    });
  }
  const [isT, oosT] = tables(pts, ['p1', 'p2', 'p3']);
  const a = runAnalysis({ isTable: isT, oosTable: oosT, policy: POLICY });
  const st = a.stats.stabilityCheck;
  check('se ejecuta la auditoria de umbrales', st && st.draws >= 30, String(st && st.draws));
  console.log(`  meseta ancha: la misma region gana en el ${(100 * st.regionRate).toFixed(0)} % de ${st.draws} variaciones`);
  check('una meseta ancha sobrevive a mover los umbrales un +-20 %',
    st.regionRate >= 0.8, `${(100 * st.regionRate).toFixed(0)} %`);
  check('la tasa de la configuracion exacta no supera la de la region',
    st.representativeRate <= st.regionRate + 1e-9,
    `${st.representativeRate} vs ${st.regionRate}`);
  check('el veredicto recoge la auditoria',
    a.verdict.findings.some((f) => /variaciones de umbral|sus propios umbrales/i.test(f.title)),
    a.verdict.findings.map((f) => f.title).join(' | ').slice(0, 120));

  // Y el diagnostico que evita malentendidos sobre el forward.
  check('se avisa de que el forward ya se uso para elegir',
    a.verdict.findings.some((f) => /ya se han usado para elegir/i.test(f.title)));
}

// ============================================================================
section('8. La puntuacion esta ajustada por riesgo de verdad');
// A IGUAL ventaja, asumir mas drawdown tiene que bajar la nota. Antes la subia: las seis
// metricas de MT5 correlacionan entre si de 0,85 a 0,99 y cuatro de ellas median retorno,
// asi que sumaban 0,74 de peso frente al 0,18 del drawdown. Cuatro contra uno.
{
  // Con `drawdown` incluido: sin el, el eje de riesgo no puede medirse y se omite, que
  // es el comportamiento correcto del motor pero no lo que se quiere comprobar aqui.
  const base = { profitFactor: 1.30, recoveryFactor: 3, sharpe: 2, trades: 400, profit: 50000, expectedPayoff: 125, drawdown: 10 };
  const P = resolvePolicy(DEFAULT_POLICY);
  const segura = periodQuality({ ...base, drawdown: 6 }, P, null);
  const arriesgada = periodQuality({ ...base, drawdown: 18 }, P, null);
  check('a igual ventaja, mas drawdown puntua MENOS',
    arriesgada.score < segura.score, `${segura.score.toFixed(3)} vs ${arriesgada.score.toFixed(3)}`);
  const caida = 1 - arriesgada.score / segura.score;
  console.log(`  triplicar el drawdown (6 % -> 18 %) cuesta el ${(100 * caida).toFixed(1)} % de la nota`);
  check('y el castigo es apreciable, no simbolico', caida > 0.15, `${(100 * caida).toFixed(1)} %`);

  // El eje de riesgo no se compra con retorno: una configuracion pegada al limite de
  // drawdown no alcanza a una prudente por mucha ventaja que tenga.
  const arriesgadaYRentable = periodQuality({ ...base, profitFactor: 1.45, drawdown: 26 }, P, null);
  check('mucho mas retorno no compensa un drawdown cerca del limite',
    arriesgadaYRentable.score < segura.score,
    `${arriesgadaYRentable.score.toFixed(3)} vs ${segura.score.toFixed(3)}`);

  // El beneficio por operacion NO debe ordenar: a igual ventaja mide tamano de apuesta.
  const payoffAlto = periodQuality({ ...base, expectedPayoff: 500 }, P, { zero: 0, full: 200 });
  const payoffBajo = periodQuality({ ...base, expectedPayoff: 20 }, P, { zero: 0, full: 200 });
  check('el beneficio por operacion ya no cambia el orden',
    Math.abs(payoffAlto.score - payoffBajo.score) < 1e-12,
    `${payoffAlto.score.toFixed(4)} vs ${payoffBajo.score.toFixed(4)}`);
  check('los ejes se reportan por separado',
    payoffAlto.axes && ['retorno', 'riesgo', 'eficiencia', 'evidencia'].every((k) => Number.isFinite(payoffAlto.axes[k])),
    JSON.stringify(payoffAlto.axes));
}

// ============================================================================
section('9. Las anclas se adaptan a los minimos que pide el usuario');
{
  const porDefecto = resolvePolicy(DEFAULT_POLICY);
  check('con los valores por defecto reproduce la escala elegida a mano',
    porDefecto.anchors.drawdown.zero === 30 && porDefecto.anchors.drawdown.full === 5,
    JSON.stringify(porDefecto.anchors.drawdown));

  // Quien tolera un 35 % no debe ver su espacio anulado por nuestra suposicion del 20 %.
  const tolerante = resolvePolicy({ ...DEFAULT_POLICY, gates: { ...DEFAULT_POLICY.gates, maxDrawdownPct: 35 } });
  check('una tolerancia mayor estira la escala del riesgo',
    tolerante.anchors.drawdown.zero > porDefecto.anchors.drawdown.zero,
    JSON.stringify(tolerante.anchors.drawdown));
  const m = { profitFactor: 1.3, recoveryFactor: 3, sharpe: 2, trades: 400, profit: 5000, drawdown: 22 };
  check('un drawdown del 22 % es malo para quien exige 20 y aceptable para quien acepta 35',
    periodQuality(m, porDefecto, null).score < periodQuality(m, tolerante, null).score,
    `${periodQuality(m, porDefecto, null).score.toFixed(3)} vs ${periodQuality(m, tolerante, null).score.toFixed(3)}`);
  check('el cero del factor de beneficio sigue siendo el equilibrio (1,0)',
    tolerante.anchors.profitFactor.zero === 1, String(tolerante.anchors.profitFactor.zero));
}

// ============================================================================
section('10. Grados de libertad, puertas inertes y estabilidad de las puertas');
{
  const POLICY = { ...DEFAULT_POLICY, gates: { ...DEFAULT_POLICY.gates, minProfitFactor: 1.20, maxDrawdownPct: 90, minTrades: 50 } };
  const r = rng(101);
  const met = (g, n, base) => ({
    profit: 200000 * Math.max(0, g) - 20000 + n * 8000,
    profitFactor: 1.0 + 0.5 * Math.max(0, g) + n * 0.02,
    recoveryFactor: 4.2 * Math.max(0, g) + n * 0.2,
    sharpe: 3.2 * Math.max(0, g) + n * 0.2,
    // Drawdown siempre comodo: con la puerta en el 90 % no puede descartar a nadie.
    drawdown: 5 + 8 * (1 - Math.max(0, g)) + n,
    trades: Math.round(base * (0.7 + 0.6 * Math.max(0, g))),
  });
  const pts = [];
  const L = 6;
  for (let a = 0; a < L; a++) for (let b = 0; b < L; b++) for (let c = 0; c < L; c++) {
    const g = Math.exp(-(((a - 3) / 2.5) ** 2 + ((b - 3) / 2.5) ** 2 + ((c - 3) / 2.5) ** 2) / 2);
    const nz = (r() - 0.5) * 0.1;
    pts.push({ x: [a + 1, b + 1, c + 1], is: met(g, nz, 900), oos: met(g * 0.9, nz, 450), isResult: 40 + 40 * g, oosResult: 38 + 38 * g });
  }
  const names = ['p1', 'p2', 'p3'];
  const ih = ['Pass', 'Result', 'Profit', 'Expected Payoff', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Equity DD %', 'Trades', ...names];
  const oh = ['Pass', 'Forward Result', 'Back Result', 'Profit', 'Expected Payoff', 'Profit Factor', 'Recovery Factor', 'Sharpe Ratio', 'Equity DD %', 'Trades', ...names];
  const ir = [];
  const orows = [];
  pts.forEach((p, i) => {
    ir.push([i, p.isResult, p.is.profit, p.is.profit / 800, p.is.profitFactor, p.is.recoveryFactor, p.is.sharpe, p.is.drawdown, p.is.trades, ...p.x]);
    orows.push([i, p.oosResult, p.isResult, p.oos.profit, p.oos.profit / 800, p.oos.profitFactor, p.oos.recoveryFactor, p.oos.sharpe, p.oos.drawdown, p.oos.trades, ...p.x]);
  });
  const a = runAnalysis({
    isTable: { name: 'IS', sheet: 's', format: 'x', headers: ih, rows: ir },
    oosTable: { name: 'OOS', sheet: 's', format: 'x', headers: oh, rows: orows },
    policy: POLICY,
  });

  const d = a.meta.degreesOfFreedom;
  check('cuenta las operaciones por parametro ajustado',
    d && d.params === 3 && Number.isFinite(d.perParam), JSON.stringify(d));
  check('se apoya en el periodo de VALIDACION, no en el in-sample',
    d.basedOn === 'forward' && Math.abs(d.perParam - d.perParamOos) < 1e-9, d.basedOn);
  check('cuenta cuantas configuraciones se han probado por operacion disponible',
    Number.isFinite(d.trialsPerTrade) && d.trialsPerTrade > 0, String(d.trialsPerTrade));

  const gi = a.meta.gateInfluence;
  const dd = gi.find((g) => g.name === 'drawdown');
  const pf = gi.find((g) => g.name === 'profitFactor');
  check('detecta que una puerta holgada no filtra nada', dd.inert && dd.sole === 0, JSON.stringify(dd));
  check('y que la que si aprieta no es inerte', !pf.inert && pf.sole > 0, JSON.stringify(pf));
  check('el veredicto avisa del minimo que no hace nada',
    a.verdict.findings.some((f) => /filtrando nada/i.test(f.title)),
    a.verdict.findings.map((f) => f.title).join(' | ').slice(0, 140));

  const st = a.stats.stabilityCheck;
  check('la estabilidad se audita por separado para nuestros umbrales y para los tuyos',
    st && st.internal && st.internal.draws > 0 && st.gates && st.gates.draws > 0,
    JSON.stringify({ internal: st && st.internal && st.internal.draws, gates: st && st.gates && st.gates.draws }));
  console.log(`  estabilidad: nuestros umbrales ${(100 * st.internal.regionRate).toFixed(0)} % - tus minimos ${(100 * st.gates.regionRate).toFixed(0)} %`);
  check('mover las puertas de un EA claro no cambia la region ganadora',
    st.gates.regionRate >= 0.8, `${(100 * st.gates.regionRate).toFixed(0)} %`);
}

section(failures ? `RESULTADO: ${checks - failures}/${checks} — ${failures} FALLO(S)` : `RESULTADO: ${checks}/${checks} correctas`);
process.exit(failures ? 1 : 0);
