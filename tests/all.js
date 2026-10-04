// Ejecuta todas las pruebas de tests/*.test.js, una tras otra, cada una en su propio
// proceso. Una prueba nueva entra sola: basta con que su nombre acabe en .test.js.
//
//   node tests/all.js
//
// Las pruebas de navegador (tests/e2e.mjs) van aparte: npm run test:e2e.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
// Primero las que revisan el propio código: si fallan, lo demás no aporta.
const FIRST = ['source.test.js', 'smoke.test.js'];
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.test.js'))
  .sort((a, b) => (FIRST.includes(b) - FIRST.includes(a)) || a.localeCompare(b));

for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(DIR, f)], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\nFALLA ${f}`);
    process.exit(r.status || 1);
  }
}
console.log(`\n${files.length} archivos de pruebas, todos correctos.`);
