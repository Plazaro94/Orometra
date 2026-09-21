// Pruebas del lector propio de .xlsx.
//
//   node tests/xlsx.test.js
//
// Importa porque `js/xlsx.js` parsea un ZIP a mano —directorio central, cabeceras
// locales, desplazamientos— y ahi un error de un byte no da un fallo limpio: da datos
// silenciosamente equivocados. El fichero de prueba se construye aqui mismo, sin
// dependencias, para que el banco no dependa de ningun binario suelto.

import zlib from 'node:zlib';
import { parseXlsx } from '../js/xlsx.js';
import { finishTable } from '../js/parse.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}
function section(t) { console.log(`\n${'='.repeat(70)}\n${t}\n${'='.repeat(70)}`); }

// --------------------------------------------------------------- generador de ZIP
const crcTabla = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTabla[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Escribe un ZIP minimo. `comprimir` permite probar los dos metodos que se admiten. */
function zip(entradas, comprimir = true) {
  const locales = [];
  const central = [];
  let offset = 0;
  for (const [nombre, texto] of entradas) {
    const datos = Buffer.from(texto, 'utf8');
    const cuerpo = comprimir ? zlib.deflateRawSync(datos) : datos;
    const metodo = comprimir ? 8 : 0;
    const nom = Buffer.from(nombre, 'utf8');
    const crc = crc32(datos);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(metodo, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(cuerpo.length, 18);
    lh.writeUInt32LE(datos.length, 22); lh.writeUInt16LE(nom.length, 26);
    locales.push(lh, nom, cuerpo);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(metodo, 10); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(cuerpo.length, 20); ch.writeUInt32LE(datos.length, 24);
    ch.writeUInt16LE(nom.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, nom);
    offset += 30 + nom.length + cuerpo.length;
  }
  const cuerpoCentral = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(cuerpoCentral.length, 12); fin.writeUInt32LE(offset, 16);
  const todo = Buffer.concat([...locales, cuerpoCentral, fin]);
  return todo.buffer.slice(todo.byteOffset, todo.byteOffset + todo.byteLength);
}

function libro({ filas, compartidas }) {
  const col = (n) => { let r = ''; n += 1; while (n) { const m = (n - 1) % 26; r = String.fromCharCode(65 + m) + r; n = Math.floor((n - 1) / 26); } return r; };
  const idx = new Map(compartidas.map((t, i) => [t, i]));
  const rows = filas.map((f, ri) => {
    const cs = f.map((v, ci) => {
      const ref = `${col(ci)}${ri + 1}`;
      if (v === null) return '';
      return typeof v === 'string'
        ? `<c r="${ref}" t="s"><v>${idx.get(v)}</v></c>`
        : `<c r="${ref}"><v>${v}</v></c>`;
    }).join('');
    return `<row r="${ri + 1}">${cs}</row>`;
  }).join('');
  return [
    ['[Content_Types].xml', '<?xml version="1.0"?><Types/>'],
    ['xl/workbook.xml', '<?xml version="1.0"?><workbook><sheets><sheet name="Tester Optimizator Results" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/sharedStrings.xml', `<?xml version="1.0"?><sst>${compartidas.map((t) => `<si><t>${t}</t></si>`).join('')}</sst>`],
    ['xl/worksheets/sheet1.xml', `<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`],
  ];
}

const CAB = ['Pass', 'Result', 'Profit', 'Profit Factor', 'Equity DD %', 'Trades', 'InpA', 'InpB'];
const filas = [CAB];
for (let i = 1; i <= 40; i++) filas.push([i, 50 + i * 0.5, 1000 + i * 37, 1.1 + i * 0.004, 8 + i * 0.1, 300 + i * 3, 10 + (i % 5), 2 + (i % 3) * 0.5]);

section('1. Libro comprimido (deflate), que es lo que genera Excel');
{
  const buf = zip(libro({ filas, compartidas: CAB }), true);
  const crudo = await parseXlsx(buf);
  check('lee el nombre de la hoja', crudo.sheet === 'Tester Optimizator Results', String(crudo.sheet));
  check('recupera todas las filas', crudo.rows.length === 41, String(crudo.rows.length));
  check('resuelve las cadenas compartidas', crudo.rows[0][0] === 'Pass' && crudo.rows[0][6] === 'InpA', crudo.rows[0].join(','));
  check('conserva los numeros', Number(crudo.rows[1][2]) === 1037, String(crudo.rows[1][2]));

  const t = finishTable(crudo, 'x.xlsx');
  check('el tratamiento comun localiza la cabecera', t.headers.length === 8, t.headers.join(','));
  check('y deja 40 filas de datos', t.rows.length === 40, String(t.rows.length));
  check('se marca el formato', t.format === 'xlsx', t.format);
}

section('2. Libro sin comprimir (metodo 0), que tambien es ZIP valido');
{
  const crudo = await parseXlsx(zip(libro({ filas, compartidas: CAB }), false));
  check('tambien se lee', crudo.rows.length === 41, String(crudo.rows.length));
  check('con el mismo contenido', crudo.rows[0][0] === 'Pass');
}

section('3. Celdas ausentes: una fila con huecos no debe descolocar las columnas');
{
  const conHuecos = [CAB, [1, null, 500, null, 9.5, 320, 12, 2.5]];
  const crudo = await parseXlsx(zip(libro({ filas: conHuecos, compartidas: CAB }), true));
  const f = crudo.rows[1];
  check('el valor sigue en su columna pese al hueco', Number(f[4]) === 9.5 && Number(f[5]) === 320, f.join(','));
}

section('4. Archivos que no son libros');
{
  let msg = '';
  try { await parseXlsx(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer); } catch (e) { msg = e.message; }
  check('rechaza lo que no es un ZIP', /ZIP/i.test(msg), msg);

  msg = '';
  try { await parseXlsx(zip([['algo.txt', 'hola']], true)); } catch (e) { msg = e.message; }
  check('rechaza un ZIP que no contiene hojas', /hoja/i.test(msg), msg);
}

section(failures ? `RESULTADO: ${checks - failures}/${checks} — ${failures} FALLO(S)` : `RESULTADO: ${checks}/${checks} correctas`);
process.exit(failures ? 1 : 0);
