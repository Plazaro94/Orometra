// Lectura del informe de un backtest individual de MT5.
//
// Es un documento distinto del export de optimizacion: describe UNA configuracion sobre
// UN periodo, y trae tres cosas que el otro no tiene.
//
//   1. Las fechas reales del periodo. El analisis de optimizacion tiene que estimar la
//      duracion contando operaciones porque no las conoce; aqui vienen dadas.
//   2. Todos los parametros de entrada como `nombre=valor`, lo que permite comprobar que
//      el backtest se lanzo de verdad con la configuracion recomendada y no con otra.
//   3. La lista de transacciones una a una, que es lo unico que permite un Monte Carlo
//      serio: reordenar operaciones reales en vez de simular una distribucion inventada.
//
// MT5 lo guarda en UTF-16 con BOM y con las etiquetas en el idioma del terminal, asi que
// cada campo se busca con patrones que cubren castellano e ingles.

import { toNumber } from './parse.js';

const REPORT_SIGNATURE = /Strategy\s*Tester\s*Report|Informe\s*del\s*Probador|Testbericht|Rapport\s*du\s*testeur/i;

/** ¿Este contenido es el informe de un backtest individual? */
export function looksLikeReport(text) {
  return REPORT_SIGNATURE.test(text.slice(0, 20000));
}

// Algunos builds escriben los acentos como entidades en vez de como caracteres. Si no
// se decodifican, "Per&iacute;odo:" no casa con ningun patron y el informe entero
// aparece vacio sin dar ningun error.
const NAMED_ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü',
  ordm: 'º', ordf: 'ª', deg: '°', euro: '€', pound: '£',
};

function decodeEntities(text) {
  if (text.indexOf('&') === -1) return text;
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return NAMED_ENTITIES[code] !== undefined ? NAMED_ENTITIES[code] : m;
  });
}

const stripTags = (html) => decodeEntities(html.replace(/<[^>]+>/g, '')).trim();

function tableRows(html) {
  const out = [];
  for (const r of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [];
    for (const c of r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)) cells.push(stripTags(c[1]));
    out.push(cells);
  }
  return out;
}

/**
 * Las metricas vienen en celdas por parejas "Etiqueta:" / "valor", varias por fila.
 * Se recorre todo aplanado para no depender de cuantas columnas use cada build.
 */
function labelledValues(rows) {
  const flat = [];
  for (const cells of rows) for (const c of cells) flat.push(c);
  const pairs = [];
  for (let i = 0; i < flat.length - 1; i++) {
    if (/:$/.test(flat[i])) pairs.push([flat[i].slice(0, -1).trim(), flat[i + 1]]);
  }
  return pairs;
}

function findValue(pairs, patterns) {
  for (const re of patterns) {
    for (const [label, value] of pairs) if (re.test(label)) return value;
  }
  return null;
}

/** "12 119.57 (11.89%)" -> 11.89 ; "11.89% (12 119.57)" -> 11.89 */
function percentInside(text) {
  if (!text) return NaN;
  const m = String(text).match(/(-?[\d\s.,]+)\s*%/);
  return m ? toNumber(m[1]) : NaN;
}

const P = {
  profit: [/beneficio\s*neto/i, /total\s*net\s*profit/i, /gesamtnettogewinn/i],
  grossProfit: [/beneficio\s*bruto/i, /gross\s*profit/i],
  grossLoss: [/p[eé]rdidas\s*brutas/i, /gross\s*loss/i],
  profitFactor: [/factor\s*de\s*beneficio/i, /profit\s*factor/i, /profitfaktor/i],
  recoveryFactor: [/factor\s*de\s*recuperaci/i, /recovery\s*factor/i],
  sharpe: [/ratio\s*de\s*sharpe/i, /sharpe\s*ratio/i],
  expectedPayoff: [/beneficio\s*esperado/i, /expected\s*payoff/i],
  trades: [/total\s*de\s*operaciones/i, /total\s*trades/i, /gesamtzahl\s*der\s*trades/i],
  deals: [/total\s*de\s*transacciones/i, /total\s*deals/i],
  ddRelEquity: [/reducci[oó]n\s*relativa\s*de\s*la\s*equidad/i, /equity\s*drawdown\s*relative/i],
  ddMaxEquity: [/reducci[oó]n\s*m[aá]xima\s*de\s*la\s*equidad/i, /equity\s*drawdown\s*maximal/i],
  ddRelBalance: [/reducci[oó]n\s*relativa\s*del\s*balance/i, /balance\s*drawdown\s*relative/i],
  expert: [/^experto$/i, /^expert$/i, /^asesor$/i],
  symbol: [/^s[ií]mbolo$/i, /^symbol$/i],
  period: [/^per[ií]odo$/i, /^period$/i],
  inputs: [/par[aá]metros\s*de\s*entrada/i, /^inputs$/i, /eingabeparameter/i],
};

/**
 * @param {string} text  el HTML del informe, ya decodificado
 * @returns {{meta:object, params:object, metrics:object, deals:Array}}
 */
export function parseBacktestReport(text, fileName = '') {
  if (!looksLikeReport(text)) {
    throw new Error('Esto no parece el informe de un backtest de MT5. En el probador: clic derecho sobre los resultados > Informe > HTML.');
  }
  const rows = tableRows(text);
  const pairs = labelledValues(rows);

  // ---- Cabecera: instrumento, marco temporal y FECHAS del periodo
  const periodText = findValue(pairs, P.period) || '';
  const range = periodText.match(/(\d{4}[.\-/]\d{2}[.\-/]\d{2})[^\d]+(\d{4}[.\-/]\d{2}[.\-/]\d{2})/);
  const toDate = (d) => (d ? new Date(d.replace(/\./g, '-')) : null);
  const from = range ? toDate(range[1]) : null;
  const to = range ? toDate(range[2]) : null;

  const meta = {
    file: fileName,
    expert: findValue(pairs, P.expert),
    symbol: findValue(pairs, P.symbol),
    timeframe: (periodText.match(/^\s*([A-Z]+\d*)/) || [, null])[1],
    period: periodText,
    from,
    to,
    days: from && to ? Math.round((to - from) / 86400000) : NaN,
  };

  // ---- Parametros de entrada
  //
  // MT5 los escribe UNO POR FILA: la primera lleva la etiqueta "Parametros de entrada:"
  // y las siguientes tienen la primera celda vacia. Se recorren hasta que aparece otra
  // fila etiquetada, que ya pertenece al bloque siguiente.
  const params = {};
  const inputsRow = rows.findIndex((c) => c.length && P.inputs.some((re) => re.test(c[0] || '')));
  if (inputsRow >= 0) {
    for (let i = inputsRow; i < rows.length; i++) {
      const c = rows[i];
      if (i > inputsRow && (c[0] || '').trim() !== '') break;
      const line = c.slice(1).find((x) => x && x.includes('=')) || '';
      // Las cabeceras de seccion del propio EA ("=== 1) General ====") no son parametros.
      if (/^\s*=+/.test(line)) continue;
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !(m[1] in params)) params[m[1]] = m[2].trim();
    }
  }

  // ---- Metricas
  const ddPct = percentInside(findValue(pairs, P.ddRelEquity))
    || percentInside(findValue(pairs, P.ddMaxEquity))
    || percentInside(findValue(pairs, P.ddRelBalance));

  const metrics = {
    profit: toNumber(findValue(pairs, P.profit)),
    profitFactor: toNumber(findValue(pairs, P.profitFactor)),
    recoveryFactor: toNumber(findValue(pairs, P.recoveryFactor)),
    sharpe: toNumber(findValue(pairs, P.sharpe)),
    expectedPayoff: toNumber(findValue(pairs, P.expectedPayoff)),
    drawdown: ddPct,
    // La columna "Trades" del export de optimizacion cuenta OPERACIONES (posiciones),
    // no transacciones. Mezclarlas doblaria la cifra y falsearia toda la comparacion.
    trades: toNumber(findValue(pairs, P.trades)),
    deals: toNumber(findValue(pairs, P.deals)),
  };

  return { meta, params, metrics, deals: parseDeals(rows) };
}

/**
 * Tabla de transacciones. Solo interesan las de cierre: son las que llevan el resultado
 * de la operacion. Las de apertura tienen beneficio cero y la primera fila es el
 * deposito inicial, no una operacion.
 */
function parseDeals(rows) {
  let headerAt = -1;
  let cols = null;
  for (let i = 0; i < rows.length; i++) {
    const c = rows[i];
    if (c.length < 8) continue;
    const lower = c.map((x) => x.toLowerCase());
    const has = (re) => lower.findIndex((x) => re.test(x));
    const iProfit = has(/^beneficio$|^profit$|^gewinn$/);
    const iDir = has(/^direcci|^direction$|^richtung$/);
    const iType = has(/^tipo$|^type$/);
    if (iProfit >= 0 && iType >= 0) {
      headerAt = i;
      cols = {
        time: has(/fecha|time|zeit/),
        type: iType,
        direction: iDir,
        volume: has(/^volumen$|^volume$/),
        commission: has(/^comisi|^commission$/),
        swap: has(/^swap$/),
        profit: iProfit,
        balance: has(/^balance$|^saldo$/),
      };
      break;
    }
  }
  if (headerAt < 0) return [];

  const deals = [];
  const commissionOf = (c) => {
    const com = cols.commission >= 0 ? toNumber(c[cols.commission]) : 0;
    return Number.isFinite(com) ? com : 0;
  };
  const swapOf = (c) => {
    const swp = cols.swap >= 0 ? toNumber(c[cols.swap]) : 0;
    return Number.isFinite(swp) ? swp : 0;
  };
  // La comision de una operacion se reparte entre su apertura y su cierre, y solo el
  // cierre lleva el beneficio. Se arrastran los costes de las aperturas hasta el cierre
  // siguiente: asi cada operacion queda con su coste completo y la suma cuadra. Comision
  // y swap se arrastran por separado porque el aviso de dominancia del swap (core/matrix/
  // risk.js) necesita distinguirlos: uno lo fija el bróker, el otro lo aplica el tester
  // con la tasa ACTUAL a todo el histórico.
  let carryCommission = 0;
  let carrySwap = 0;

  for (let i = headerAt + 1; i < rows.length; i++) {
    const c = rows[i];
    if (c.length <= cols.profit) continue;
    const type = (c[cols.type] || '').toLowerCase();
    if (/balance|credit|deposit/.test(type)) continue; // ingreso inicial, no es una operacion
    const dir = cols.direction >= 0 ? (c[cols.direction] || '').toLowerCase() : '';
    // Solo el cierre materializa el resultado. Si el informe no trae direccion, se
    // acepta cualquier fila con beneficio distinto de cero.
    if (cols.direction >= 0 && !/out/.test(dir)) {
      carryCommission += commissionOf(c);
      carrySwap += swapOf(c);
      continue;
    }
    const profit = toNumber(c[cols.profit]);
    if (!Number.isFinite(profit)) continue;
    const commission = commissionOf(c) + carryCommission;
    const swap = swapOf(c) + carrySwap;
    carryCommission = 0;
    carrySwap = 0;
    const cost = commission + swap;
    deals.push({
      time: c[cols.time] || '',
      // `profit` es el resultado bruto de la operacion; `net` le descuenta comision y
      // swap, que es lo que de verdad entra en la cuenta. La suma de los `net` reproduce
      // exactamente el beneficio neto del informe.
      profit,
      commission,
      swap,
      cost,
      net: profit + cost,
      volume: cols.volume >= 0 ? toNumber(c[cols.volume]) : NaN,
      balance: cols.balance >= 0 ? toNumber(c[cols.balance]) : NaN,
    });
  }
  return deals;
}

/**
 * Compara los parametros del informe con los de una configuracion propuesta.
 * Sirve para avisar de un error facil de cometer y dificil de ver: lanzar el backtest
 * del periodo no visto con una configuracion distinta de la que se estaba validando.
 */
export function compareParams(reportParams, names, values) {
  const same = [];
  const different = [];
  const missing = [];
  names.forEach((name, j) => {
    if (!(name in reportParams)) {
      missing.push(name);
      return;
    }
    const a = String(reportParams[name]).trim().toLowerCase();
    const b = String(values[j]).trim().toLowerCase();
    const na = toNumber(a);
    const nb = toNumber(b);
    const equal = Number.isFinite(na) && Number.isFinite(nb)
      ? Math.abs(na - nb) <= 1e-9 * Math.max(1, Math.abs(na))
      : a === b;
    (equal ? same : different).push({ name, report: reportParams[name], expected: values[j] });
  });
  return { same, different, missing, matches: different.length === 0 && missing.length < names.length };
}
