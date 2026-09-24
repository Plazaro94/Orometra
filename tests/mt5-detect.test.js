// Pruebas de detección MT5 (fixtures temp; sin instalar MT5).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseOriginTxt,
  associateDataPaths,
  scanOriginAssociations,
  listExperts,
  defaultSearchRoots,
} from '../desktop/main/mt5/detect.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`);
  }
}

console.log('\n=== mt5-detect: parseOriginTxt ===');
{
  check('primera línea no vacía', parseOriginTxt('\n\nC:\\MT5\\Broker\nfoo') === 'C:\\MT5\\Broker');
  check('vacío → null', parseOriginTxt('   \n  ') == null);
  check('trim espacios', parseOriginTxt('  D:\\Terminals\\MT5  ') === 'D:\\Terminals\\MT5');
}

console.log('\n=== mt5-detect: associateDataPaths (fixture) ===');
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orometra-mt5-'));
  const id = 'ABC123HASH';
  const dataPath = path.join(root, id);
  fs.mkdirSync(dataPath, { recursive: true });
  const install = path.join(root, 'Install', 'MetaTrader 5');
  fs.mkdirSync(install, { recursive: true });
  fs.writeFileSync(path.join(dataPath, 'origin.txt'), `${install}\r\n`, 'utf8');

  // carpeta Common ignorada
  fs.mkdirSync(path.join(root, 'Common'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Common', 'origin.txt'), 'ignore\n', 'utf8');

  const assoc = associateDataPaths(root);
  check('encuentra 1 asociación', assoc.length === 1);
  check('id correcto', assoc[0]?.id === id);
  check('dataPath', assoc[0]?.dataPath === dataPath);
  check('installPath normalizado', path.normalize(assoc[0]?.installPath) === path.normalize(install));

  const same = scanOriginAssociations(root);
  check('associateDataPaths === scanOriginAssociations', JSON.stringify(assoc) === JSON.stringify(same));

  // experts bajo data path
  const expertsDir = path.join(dataPath, 'MQL5', 'Experts', 'My');
  fs.mkdirSync(expertsDir, { recursive: true });
  fs.writeFileSync(path.join(expertsDir, 'Foo.mq5'), '// ea\n');
  fs.writeFileSync(path.join(expertsDir, 'Bar.ex5'), '');
  const experts = listExperts(dataPath);
  check('lista .mq5 y .ex5', experts.includes('My\\Foo.mq5') && experts.includes('My\\Bar.ex5'));

  fs.rmSync(root, { recursive: true, force: true });
}

console.log('\n=== mt5-detect: defaultSearchRoots ===');
{
  const roots = defaultSearchRoots({
    ProgramFiles: 'C:\\PF',
    'ProgramFiles(x86)': 'C:\\PF86',
    LOCALAPPDATA: 'C:\\Local',
  });
  check('incluye Program Files', roots.some((r) => r.startsWith('C:\\PF\\')));
  check('varias raíces', roots.length >= 6);
}

console.log(`\nmt5-detect.test.js: ${checks - failures}/${checks} ok`);
if (failures) process.exit(1);
