// Pruebas de instrumentación (transformación pura de strings .mq5, sin MT5).

import { transformSource, instrumentMq5Source, INCLUDE_LINE } from '../desktop/main/mt5/instrument.js';

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

const FIXTURE_MINIMAL = `
#property copyright "Test"
#property version   "1.00"

input int Fast = 10;

int OnInit()
{
   return INIT_SUCCEEDED;
}

void OnTick()
{
   // trading
}
`;

const FIXTURE_WITH_TESTER = `
#property strict
#include <Trade/Trade.mqh>

double OnTester()
{
   double profit = TesterStatistics(STAT_PROFIT);
   return profit;
}
`;

console.log('\n=== instrument: instrumentMq5Source alias ===');
{
  const a = instrumentMq5Source(FIXTURE_MINIMAL);
  const b = transformSource(FIXTURE_MINIMAL);
  check('alias === transformSource', a.source === b.source);
  check('incluye OrometraProbe.mqh', a.source.includes(INCLUDE_LINE));
  check('OnTester hooks presentes', /OrometraOnTester\s*\(/.test(a.source));
}

console.log('\n=== instrument: minimal EA ===');
{
  const { source, created, patched } = transformSource(FIXTURE_MINIMAL);
  check('incluye OrometraProbe.mqh', source.includes(INCLUDE_LINE));
  check('OrometraOnInit en OnInit', /OnInit\s*\([^)]*\)\s*\{[\s\S]*?OrometraOnInit\s*\(\s*\)/.test(source));
  check('OrometraOnTick en OnTick', /OnTick\s*\([^)]*\)\s*\{[\s\S]*?OrometraOnTick\s*\(\s*\)/.test(source));
  check('crea OnTester', created.includes('OnTester') || /double\s+OnTester/.test(source));
  check('crea OnTesterInit', created.includes('OnTesterInit') || /void\s+OnTesterInit/.test(source));
  check('crea OnTesterPass', created.includes('OnTesterPass') || /void\s+OnTesterPass/.test(source));
  check('crea OnTesterDeinit', created.includes('OnTesterDeinit') || /void\s+OnTesterDeinit/.test(source));
  check('OnTester llama OrometraOnTester', /OrometraOnTester\s*\(/.test(source));
  check('no duplica include', (source.match(/#include\s*<OrometraProbe\.mqh>/g) || []).length === 1);
  check('patched OnInit o created handlers', patched.includes('OnInit') || created.length >= 1);
}

console.log('\n=== instrument: OnTester existente envuelto ===');
{
  const { source, patched } = transformSource(FIXTURE_WITH_TESTER);
  check('include presente', source.includes(INCLUDE_LINE));
  check('envuelve return', /return\s+OrometraOnTester\s*\(\s*profit\s*\)\s*;/.test(source));
  check('patched OnTester', patched.includes('OnTester'));
  // idempotente: segunda pasada no rompe
  const again = transformSource(source);
  check('segunda pasada estable', again.source.includes('OrometraOnTester'));
  check('un solo include tras 2 pasadas', (again.source.match(/#include\s*<OrometraProbe\.mqh>/g) || []).length === 1);
}

console.log('\n=== instrument: EA vacío crea todos los handlers ===');
{
  const { source, created } = transformSource('// empty\n');
  check('include', source.includes(INCLUDE_LINE));
  for (const name of ['OnInit', 'OnTick', 'OnTester', 'OnTesterInit', 'OnTesterPass', 'OnTesterDeinit']) {
    check(`crea ${name}`, created.includes(name));
  }
}

console.log(`\ninstrument.test.js: ${checks - failures}/${checks} ok`);
if (failures) process.exit(1);
