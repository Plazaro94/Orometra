// Pruebas del formato .orf (roundtrip + verificación de sumas).

import {
  encodePassPayload,
  decodePassPayload,
  writeOrfBuffer,
  readOrfBuffer,
  verifyDailyPnLSums,
  estimateOrfBytes,
  ORF_FORMAT_VERSION,
  ORF_HEADER_LEN,
  ORF_DAY_STRIDE,
} from '../core/orf.js';

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

console.log('\n=== orf: encode/decode payload ===');
{
  const days = [
    { dayIndex: 0, pnl: 12.5, volume: 0.2, nTrades: 1, swap: -0.1, commission: -0.2 },
    { dayIndex: 3, pnl: -4.0, volume: 0.1, nTrades: 1, swap: 0, commission: -0.1 },
    { dayIndex: 10, pnl: 8.25, volume: 0.3, nTrades: 2, swap: -0.05, commission: -0.3 },
  ];
  const total = days.reduce((s, d) => s + d.pnl, 0);
  const floats = encodePassPayload({
    formatVersion: ORF_FORMAT_VERSION,
    startDateYmd: 20240102,
    days,
    maxConcurrent: 2,
    minLot: 0.1,
    maxLot: 0.3,
    lotVaries: true,
    tradesWithoutSl: 1,
    avgDurationSec: 3600,
    weekendCross: 0,
    criterion: total,
    totalNetPnl: total,
    totalClosedTrades: 4,
  });
  check('longitud payload', floats.length === ORF_HEADER_LEN + 3 * ORF_DAY_STRIDE);
  const dec = decodePassPayload(floats);
  check('nActiveDays', dec.nActiveDays === 3);
  check('startDate', dec.startDateYmd === 20240102);
  check('day0 pnl', Math.abs(dec.days[0].pnl - 12.5) < 1e-5);
  check('day sparse index', dec.days[1].dayIndex === 3);
  check('lotVaries', dec.lotVaries === true);
  check('header total', Math.abs(dec.totalNetPnl - total) < 1e-5);
}

console.log('\n=== orf: roundtrip fichero ===');
{
  const p1 = encodePassPayload({
    startDateYmd: 20230101,
    days: [
      { dayIndex: 0, pnl: 100 },
      { dayIndex: 5, pnl: -20.5 },
    ],
    criterion: 79.5,
    totalNetPnl: 79.5,
    totalClosedTrades: 2,
  });
  const p2 = encodePassPayload({
    startDateYmd: 20230101,
    days: [{ dayIndex: 1, pnl: 3.33 }],
    criterion: 3.33,
    totalNetPnl: 3.33,
    totalClosedTrades: 1,
  });
  const buf = writeOrfBuffer({
    passes: [
      { passId: 1, floats: p1 },
      { passId: 42, floats: p2 },
    ],
  });
  const doc = readOrfBuffer(buf);
  check('nPasses', doc.nPasses === 2);
  check('passId 42', doc.passes[1].passId === 42);
  check('pass1 sum days', Math.abs(doc.passes[0].days.reduce((s, d) => s + d.pnl, 0) - 79.5) < 1e-4);
  check('pass2 day', Math.abs(doc.passes[1].days[0].pnl - 3.33) < 1e-4);
}

console.log('\n=== orf: verifyDailyPnLSums ===');
{
  const series = {
    days: [{ pnl: 10.01 }, { pnl: -0.02 }, { pnl: 5 }],
    totalNetPnl: 14.99,
  };
  const v = verifyDailyPnLSums(series, 14.99, 1);
  check('ok dentro de 1 céntimo', v.ok, `delta=${v.deltaXml}`);
  const bad = verifyDailyPnLSums(series, 20, 1);
  check('falla si XML discrepa', !bad.ok);
}

console.log('\n=== orf: estimateOrfBytes ===');
{
  const e = estimateOrfBytes(2000, 50);
  const expectedFloats = 2000 * (ORF_HEADER_LEN + 50 * ORF_DAY_STRIDE);
  const expected = 16 + 2000 * 8 + expectedFloats * 4;
  check('bytes estimados', e.bytes === expected, `${e.bytes} vs ${expected}`);
  check('no avisa 2GiB en caso típico', e.warn2GiB === false);
  const huge = estimateOrfBytes(1_000_000, 400);
  check('avisa 2GiB en caso enorme', huge.warn2GiB === true);
}

console.log(`\norf.test.js: ${checks - failures}/${checks} ok`);
if (failures) process.exit(1);
