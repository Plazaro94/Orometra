// Generador de .xlsx para los tests: un ZIP mínimo con un libro de una hoja. Sin
// dependencias, para que las pruebas no dependan de ningún binario suelto.

import zlib from 'node:zlib';

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
export function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTabla[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Escribe un ZIP minimo. `comprimir` permite probar los dos metodos que se admiten. */
export function zip(entradas, comprimir = true, utf16 = false) {
  const locales = [];
  const central = [];
  let offset = 0;
  for (const [nombre, texto] of entradas) {
    // `utf16`: MT5 escribe sus .xlsx en UTF-16LE con BOM, no en UTF-8 como Excel.
    const datos = utf16 ? Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(texto, 'utf16le')]) : Buffer.from(texto, 'utf8');
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

export function libro({ filas, compartidas }) {
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
