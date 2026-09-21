// Lector minimo de .xlsx, sin dependencias.
//
// Existe para no depender de un CDN. Antes se cargaba SheetJS (unos 900 KB) desde
// jsdelivr solo por si alguien abria el export de MT5 en Excel y lo volvia a guardar.
// Eso costaba tres cosas: rompia la promesa de que todo se ejecuta en tu navegador,
// obligaba a abrir la politica de seguridad a un origen externo, y pesaba mas del doble
// que la aplicacion entera para un caso poco frecuente.
//
// Un .xlsx es un ZIP con XML dentro, y el navegador ya sabe descomprimir mediante
// `DecompressionStream`. Con eso bastan unas ciento y pico lineas.
//
// NO se admite el .xls binario antiguo (formato BIFF, OLE): es mucho mas complejo y MT5
// no lo genera nunca. Ese caso recibe un mensaje que explica que hacer.

const td = new TextDecoder('utf-8');

/** Lee el directorio central del ZIP y devuelve un mapa nombre -> {offset, comprimido}. */
function leerZip(buffer) {
  const dv = new DataView(buffer);
  const u8 = new Uint8Array(buffer);
  // El registro de fin del directorio central esta al final, precedido de un comentario
  // de longitud variable, asi que se busca su firma hacia atras.
  let fin = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw new Error('El archivo no es un ZIP valido.');

  const total = dv.getUint16(fin + 10, true);
  let p = dv.getUint32(fin + 16, true);
  const entradas = new Map();
  for (let i = 0; i < total; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(p + 10, true);
    const tamComprimido = dv.getUint32(p + 20, true);
    const nomLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const comLen = dv.getUint16(p + 32, true);
    const offsetLocal = dv.getUint32(p + 42, true);
    const nombre = td.decode(u8.subarray(p + 46, p + 46 + nomLen));
    entradas.set(nombre, { metodo, tamComprimido, offsetLocal });
    p += 46 + nomLen + extraLen + comLen;
  }
  return { dv, u8, entradas };
}

async function extraer(zip, nombre) {
  const e = zip.entradas.get(nombre);
  if (!e) return null;
  // La cabecera local repite los tamanos, pero sus campos de nombre y extra pueden
  // diferir de los del directorio central: hay que releerlos aqui.
  const { dv, u8 } = zip;
  const base = e.offsetLocal;
  if (dv.getUint32(base, true) !== 0x04034b50) throw new Error('Entrada ZIP corrupta.');
  const nomLen = dv.getUint16(base + 26, true);
  const extraLen = dv.getUint16(base + 28, true);
  const inicio = base + 30 + nomLen + extraLen;
  const datos = u8.subarray(inicio, inicio + e.tamComprimido);

  if (e.metodo === 0) return td.decode(datos);          // guardado sin comprimir
  if (e.metodo !== 8) throw new Error(`Compresion ZIP no soportada (metodo ${e.metodo}).`);
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Tu navegador no puede descomprimir este archivo. Exporta desde MT5 en XML, o guardalo como CSV.');
  }
  const flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(flujo).text();
}

/** Columna en letras -> indice. "A"=0, "Z"=25, "AA"=26. */
function columna(ref) {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function desescapar(s) {
  if (s.indexOf('&') === -1) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (m, code) => {
    if (ENTIDADES[code] !== undefined) return ENTIDADES[code];
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return m;
  });
}

/** Cadenas compartidas: xlsx guarda el texto repetido una sola vez y lo referencia. */
function leerCadenas(xml) {
  if (!xml) return [];
  const out = [];
  for (const si of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    // Un <si> puede venir partido en varios <t> por trozos con formato distinto.
    let txt = '';
    for (const t of si[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) txt += desescapar(t[1]);
    out.push(txt);
  }
  return out;
}

function leerHoja(xml, cadenas) {
  const filas = [];
  for (const f of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const celdas = [];
    for (const c of f[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1] || '';
      const cuerpo = c[2] || '';
      const ref = (attrs.match(/r="([A-Z]+)/) || [])[1];
      const tipo = (attrs.match(/t="([^"]+)"/) || [])[1];
      let valor = null;
      if (tipo === 'inlineStr') {
        let txt = '';
        for (const t of cuerpo.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) txt += desescapar(t[1]);
        valor = txt;
      } else {
        const v = (cuerpo.match(/<v\b[^>]*>([\s\S]*?)<\/v>/) || [])[1];
        if (v !== undefined) {
          valor = tipo === 's' ? (cadenas[Number(v)] ?? '') : desescapar(v);
        }
      }
      const idx = ref ? columna(ref) : celdas.length;
      while (celdas.length < idx) celdas.push(null);
      celdas[idx] = valor;
    }
    if (celdas.some((x) => x !== null && x !== '')) filas.push(celdas);
  }
  return filas;
}

/**
 * Devuelve { sheet, rows, format } con la primera hoja que tenga datos, igual que el
 * resto de lectores de `parse.js`, para que el tratamiento posterior sea el mismo.
 */
export async function parseXlsx(buffer) {
  const zip = leerZip(buffer);
  const cadenas = leerCadenas(await extraer(zip, 'xl/sharedStrings.xml'));

  // El libro enumera las hojas y las relaciona con su fichero mediante los rels.
  const libro = await extraer(zip, 'xl/workbook.xml');
  const rels = await extraer(zip, 'xl/_rels/workbook.xml.rels');
  const destino = new Map();
  if (rels) {
    for (const m of rels.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
      destino.set(m[1], m[2].replace(/^\/?xl\//, '').replace(/^\//, ''));
    }
  }
  const hojas = [];
  if (libro) {
    for (const m of libro.matchAll(/<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)) {
      hojas.push({ nombre: desescapar(m[1]), ruta: 'xl/' + (destino.get(m[2]) || '') });
    }
  }
  // Si algo no cuadra, se prueban las rutas habituales antes de rendirse.
  if (!hojas.length) {
    for (const nombre of zip.entradas.keys()) {
      if (/^xl\/worksheets\/sheet\d+\.xml$/.test(nombre)) hojas.push({ nombre, ruta: nombre });
    }
  }

  for (const hoja of hojas) {
    const xml = await extraer(zip, hoja.ruta);
    if (!xml) continue;
    const rows = leerHoja(xml, cadenas);
    if (rows.length > 1) return { sheet: hoja.nombre, rows, format: 'xlsx' };
  }
  throw new Error('El libro no contiene ninguna hoja con datos.');
}
