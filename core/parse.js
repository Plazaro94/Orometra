// Lectura de exportaciones del Probador de Estrategias.
//
// MetaTrader 5 guarda los resultados de optimizacion con extension .xls, pero el
// contenido NO es un libro binario de Excel: es "XML Spreadsheet 2003". Por eso se
// parsea de forma nativa y SheetJS solo se usa como respaldo para .xlsx reales.

const XML_SIGNATURE = /<\?mso-application\s+progid="Excel\.Sheet"\?>|<Workbook[\s>]/i;

/** Detecta la codificacion por BOM. MT5 exporta UTF-8, pero hay builds que usan UTF-16. */
function decodeBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer);
  }
  return new TextDecoder('utf-8').decode(buffer);
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };

function unescapeXml(s) {
  if (s.indexOf('&') === -1) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (m, code) => {
    if (ENTITIES[code] !== undefined) return ENTITIES[code];
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return m;
  });
}

/**
 * Parsea XML Spreadsheet 2003. Devuelve la primera hoja con datos.
 * Respeta ss:Index (celdas saltadas) y ss:Type para no convertir texto a numero.
 */
export function parseXmlSpreadsheet(text) {
  const sheetRe = /<Worksheet\b([^>]*)>([\s\S]*?)<\/Worksheet>/g;
  const sheets = [];
  let ws;
  while ((ws = sheetRe.exec(text))) {
    const nameMatch = ws[1].match(/ss:Name="([^"]*)"/);
    sheets.push({ name: nameMatch ? unescapeXml(nameMatch[1]) : 'Sheet', body: ws[2] });
  }
  if (!sheets.length) throw new Error('Este XML no tiene hojas de cálculo. Comprueba que sea el informe que exporta el probador de MT5 y no otro fichero.');

  const rowRe = /<Row\b([^>]*)(?:\/>|>([\s\S]*?)<\/Row>)/g;
  const cellRe = /<Cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Cell>)/g;
  const dataRe = /<Data\b([^>]*)>([\s\S]*?)<\/Data>/;

  for (const sheet of sheets) {
    const rows = [];
    let rowMatch;
    rowRe.lastIndex = 0;
    while ((rowMatch = rowRe.exec(sheet.body))) {
      const inner = rowMatch[2] || '';
      const cells = [];
      let col = 0;
      let cellMatch;
      cellRe.lastIndex = 0;
      while ((cellMatch = cellRe.exec(inner))) {
        const attrs = cellMatch[1] || '';
        const indexMatch = attrs.match(/ss:Index="(\d+)"/);
        if (indexMatch) col = parseInt(indexMatch[1], 10) - 1;
        const body = cellMatch[2] || '';
        const d = body.match(dataRe);
        if (d) {
          const type = (d[1].match(/ss:Type="([^"]*)"/) || [, ''])[1];
          const raw = unescapeXml(d[2].replace(/<[^>]+>/g, ''));
          cells[col] = type === 'Number' ? Number(raw) : raw;
        } else {
          cells[col] = null;
        }
        col++;
      }
      rows.push(cells);
    }
    if (rows.length > 1) return { sheet: sheet.name, rows, format: 'xml-spreadsheet' };
  }
  throw new Error('El archivo tiene hojas pero ninguna con datos. Vuelve a exportar desde MT5 con la tabla de resultados visible.');
}

/** Divide una linea de CSV/TSV respetando comillas dobles. */
function splitDelimited(line, delimiter) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseDelimited(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) throw new Error('Esto no parece una exportación de MT5: no se encuentran filas de datos. En el probador, clic derecho sobre la tabla de resultados y exporta el informe (formato XML).');
  const header = lines[0];
  const tabs = (header.match(/\t/g) || []).length;
  const semis = (header.match(/;/g) || []).length;
  const commas = (header.match(/,/g) || []).length;
  const delimiter = tabs >= semis && tabs >= commas ? '\t' : semis >= commas ? ';' : ',';
  const rows = lines.map((l) => splitDelimited(l, delimiter).map((c) => c.trim()));
  return { sheet: 'csv', rows, format: `delimitado (${delimiter === '\t' ? 'TAB' : delimiter})` };
}

/**
 * Convierte el contenido de un fichero en una tabla { headers, rows, sheet, format }.
 * Elimina filas totalmente vacias y columnas sin cabecera.
 */
export function parseTable(buffer, fileName = '') {
  const head = new Uint8Array(buffer.slice(0, 4));
  if (head[0] === 0x50 && head[1] === 0x4b) {
    // Un .xlsx es un ZIP y descomprimirlo es asincrono, asi que no cabe aqui: la
    // interfaz lo detecta antes y usa `parseXlsx` de `xlsx.js`. Ver `prepareTable`.
    throw new Error('Este archivo es un .xlsx. Se lee por otra vía; si ves este mensaje, recarga la página e inténtalo de nuevo.');
  }
  if (head[0] === 0xd0 && head[1] === 0xcf) {
    throw new Error('Este archivo es un Excel binario antiguo (.xls de verdad), un formato que MT5 no genera. Vuelve a exportar desde el probador en XML, o ábrelo en Excel y guárdalo como CSV.');
  }
  const text = decodeBuffer(buffer);
  const parsed = XML_SIGNATURE.test(text.slice(0, 4096))
    ? parseXmlSpreadsheet(text)
    : parseDelimited(text);

  return finishTable(parsed, fileName);
}

/**
 * Tratamiento comun a todos los lectores: localiza la cabecera, descarta columnas sin
 * nombre y filas vacias. Se exporta porque el lector de .xlsx entra por aqui despues de
 * descomprimir, y debe recibir exactamente el mismo trato que los demas.
 */
export function finishTable(parsed, fileName = '') {
  const raw = parsed.rows;
  let headerRowIndex = 0;
  // MT5 puede anteponer filas de titulo: la cabecera es la primera fila con >=3 textos.
  for (let i = 0; i < Math.min(raw.length, 12); i++) {
    const filled = (raw[i] || []).filter((c) => c !== null && c !== undefined && String(c).trim() !== '');
    if (filled.length >= 3 && filled.every((c) => typeof c !== 'number' || Number.isInteger(c))) {
      headerRowIndex = i;
      break;
    }
  }

  const headerRow = raw[headerRowIndex] || [];
  const headers = [];
  const keptCols = [];
  for (let c = 0; c < headerRow.length; c++) {
    const name = headerRow[c] === null || headerRow[c] === undefined ? '' : String(headerRow[c]).trim();
    if (name === '') continue;
    headers.push(name);
    keptCols.push(c);
  }
  if (headers.length < 2) throw new Error('No se reconoce la fila de cabeceras. Se esperaba una línea con los nombres de las columnas (Pass, Result, Profit... y tus parámetros).');

  const rows = [];
  for (let r = headerRowIndex + 1; r < raw.length; r++) {
    const src = raw[r] || [];
    const row = keptCols.map((c) => (src[c] === undefined ? null : src[c]));
    if (row.some((v) => v !== null && v !== '')) rows.push(row);
  }
  if (!rows.length) throw new Error('Se ha encontrado la cabecera pero no hay ninguna fila debajo. El archivo está vacío de resultados.');

  return { name: fileName, sheet: parsed.sheet, format: parsed.format, headers, rows };
}

/**
 * Conversion numerica tolerante a formatos regionales.
 * Acepta "1234.56", "1,234.56", "1.234,56", "1 234,56", "12%" y espacios finos.
 */
export function toNumber(value) {
  if (value === null || value === undefined || value === '') return NaN;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  let s = String(value).trim();
  if (s === '' || s === '-' || /^n\/?a$/i.test(s)) return NaN;
  s = s.replace(/[\s   ']/g, '').replace(/%$/, '');
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    // El separador decimal es el que aparece más a la derecha.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    const parts = s.split(',');
    // "1,234" con exactamente 3 decimales es ambiguo; se trata como millar solo si hay varios grupos.
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && /^\d+$/.test(parts[1]) && parts[0].length <= 3 && s.length > 4 && !/^0/.test(s))) {
      s = parts.join('');
    } else {
      s = parts.join('.');
    }
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const BOOL_TOKEN = /^(true|false|verdadero|falso)$/i;
const TRUE_TOKEN = /^(true|verdadero)$/i;

/**
 * Normaliza el valor de un parámetro a un primitivo comparable.
 *
 * Los EA no usan solo numeros: los inputs `bool` salen como "true"/"false" y los
 * `enum` pueden salir como texto. Convertirlo todo con toNumber dejaria NaN y
 * tiraria la fila entera, que es justo lo que no debe pasar.
 */
export function canonicalValue(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim();
  if (s === '') return null;
  if (BOOL_TOKEN.test(s)) return TRUE_TOKEN.test(s);
  const n = toNumber(s);
  return Number.isFinite(n) ? n : s;
}
