// Lo que se teclea en los formularios (campos de texto): coma o punto decimal, y con los
// dos separadores, el último es el decimal. Un <input type=number> convertía «1,5» en 15.
//
//   node tests/number-input.test.js

import { looseNumber } from '../js/ui-unseen.js';

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' -> ' + detail : ''}`); }
}

const cases = [
  ['1,5', 1.5], ['1.5', 1.5], ['1.234,56', 1234.56], ['1,234.56', 1234.56],
  ['-120,5', -120.5], [' 42 ', 42], ['1 200,5', 1200.5], [3.25, 3.25],
];
for (const [input, want] of cases) check(`«${input}» → ${want}`, looseNumber(input) === want, String(looseNumber(input)));
for (const input of ['', 'abc', '1,2,3x', undefined, null]) check(`«${input}» no es un número`, Number.isNaN(looseNumber(input)));

console.log(`\n${'='.repeat(70)}\nRESULTADO: ${checks - failures}/${checks} comprobaciones correctas\n${'='.repeat(70)}`);
if (failures) process.exit(1);
