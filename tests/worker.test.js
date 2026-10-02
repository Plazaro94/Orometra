// El worker guarda las tablas que ya ha leído para no volver a leer (ni recibir) un XML de
// 80 MB en cada paso. Si la página le pide algo que ya no tiene, debe decirlo (CACHE_MISS)
// en vez de fallar o analizar sin datos; y un .xlsx se lee aquí, no en la página.
//
//   node tests/worker.test.js

import { zip, libro } from './helpers/xlsx-build.js';
import { buildDemoTables } from '../js/demo.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}

// El worker se ejecuta tal cual, con un `self` mínimo que recoge lo que responde.
const replies = [];
globalThis.self = { postMessage: (msg) => replies.push(msg) };
await import('../js/worker.js');
let nextId = 0;
async function ask(data) {
  const id = ++nextId;
  await self.onmessage({ data: { id, locale: 'es', ...data } });
  return replies.filter((m) => m.id === id && m.type !== 'progress').pop();
}

const demo = buildDemoTables();
const enc = (s) => { const b = Buffer.from(s); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const csv = (t) => enc([t.headers, ...t.rows].map((r) => r.join(';')).join('\n'));
const xlsx = (t) => zip(libro({ filas: [t.headers, ...t.rows.slice(0, 4000)], compartidas: t.headers }));

console.log('\n1. Lo que el worker no tiene, lo pide');
{
  const r = await ask({ kind: 'preflight', key: 'is|1|1', name: 'is.csv' });
  check('sin contenido ni tabla guardada: CACHE_MISS', r.type === 'error' && r.code === 'CACHE_MISS', JSON.stringify(r));
}

console.log('\n2. Lo que ya leyó, lo reutiliza');
{
  const r1 = await ask({ kind: 'preflight', key: 'is|1|1', name: 'is.csv', buffer: csv(demo.isTable) });
  check('la comprobación previa lee el archivo', r1.type === 'done' && r1.summary && r1.summary.metrics > 0, JSON.stringify(r1).slice(0, 200));
  const r2 = await ask({ kind: 'preflight', key: 'oos|1|1', name: 'oos.csv', buffer: csv(demo.oosTable) });
  check('y el del forward', r2.type === 'done');
  const r3 = await ask({ isKey: 'is|1|1', oosKey: 'oos|1|1', isName: 'is.csv', oosName: 'oos.csv' });
  check('el análisis funciona sin volver a mandar los archivos', r3.type === 'done' && r3.analysis && r3.analysis.verdict, r3.type === 'error' ? r3.message : '');
}

console.log('\n3. Un .xlsx se lee en el worker');
{
  const r = await ask({ kind: 'inspect', key: 'x|1|1', name: 'is.xlsx', buffer: xlsx(demo.isTable) });
  check('reconoce que es la tabla de la optimización', r.type === 'done' && r.summary.role === 'is', JSON.stringify(r).slice(0, 200));
  const p = await ask({ kind: 'preflight', key: 'x|1|1', name: 'is.xlsx' });
  check('y la comprobación previa la reutiliza sin volver a recibirla', p.type === 'done' && p.summary.metrics > 0, JSON.stringify(p).slice(0, 200));
  const bad = await ask({ kind: 'inspect', key: 'y|1|1', name: 'roto.xlsx', buffer: enc('PK no es un zip') });
  check('un .xlsx roto es un error de archivo', bad.type === 'error' && bad.code === 'FILE_ERROR', JSON.stringify(bad));
}

console.log(`\nRESULTADO: ${checks - failures}/${checks} comprobaciones correctas`);
if (failures) process.exit(1);
