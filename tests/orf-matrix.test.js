// ORF → matriz + veredicto integrado (sin MT5).

import { encodePassPayload, writeOrfBuffer, readOrfBuffer } from '../core/orf.js';
import { orfDocToMatrix, analyzeOrfDoc, riskFlagsFromOrf } from '../desktop/main/mt5/orf-matrix.js';

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

function makePass(passId, dayPnls, extra = {}) {
  const days = dayPnls.map((pnl, i) => ({
    dayIndex: i,
    pnl,
    volume: 1,
    nTrades: 2,
    swap: 0,
    commission: 0,
  }));
  const floats = encodePassPayload({
    startDateYmd: 20240101,
    days,
    maxConcurrent: extra.maxConcurrent ?? 1,
    minLot: extra.minLot ?? 0.01,
    maxLot: extra.maxLot ?? 0.01,
    lotVaries: extra.lotVaries ?? false,
    tradesWithoutSl: extra.tradesWithoutSl ?? 0,
    totalNetPnl: dayPnls.reduce((a, b) => a + b, 0),
    totalClosedTrades: dayPnls.length * 2,
    criterion: dayPnls.reduce((a, b) => a + b, 0),
  });
  return { passId, floats };
}

console.log('\n=== orf-matrix: alineación ===');
{
  const passes = [
    makePass(1, [1, 0, 2, 0, 1, 1, 0, 2]),
    makePass(2, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
    makePass(3, [-1, 2, -1, 2, -1, 2, -1, 2]),
  ];
  const buf = writeOrfBuffer({ passes });
  const doc = readOrfBuffer(buf);
  const { matrix, T, N, passIds } = orfDocToMatrix(doc);
  check('T=8', T === 8);
  check('N=3', N === 3);
  check('passIds', passIds.join(',') === '1,2,3');
  check('celda [0][0]=1', matrix[0][0] === 1);
  check('celda [2][2]=-1', matrix[2][2] === -1);
}

console.log('\n=== orf-matrix: analyze usable ===');
{
  // Ventaja en col 0
  const T = 64;
  const passes = [];
  for (let j = 0; j < 12; j++) {
    const pnls = [];
    for (let t = 0; t < T; t++) {
      pnls.push(j === 0 ? 0.5 + (t % 3) * 0.01 : (Math.sin(t + j) * 0.05));
    }
    passes.push(makePass(100 + j, pnls));
  }
  const doc = readOrfBuffer(writeOrfBuffer({ passes }));
  const r = analyzeOrfDoc(doc, {
    profile: { id: 'standard', maxPbo: 0.55, minDsr: 0.01 },
    preregistrationHash: 'abcd1234',
  });
  check('usable', r.usable);
  check('N=12', r.N === 12);
  check('hay veredicto', Boolean(r.verdict?.level));
  check('nunca live', r.verdict.neverLive === true);
  check('PBO calculado', r.pbo?.usable && Number.isFinite(r.pbo.pbo));
  check('DSR calculado', r.dsr?.usable && Number.isFinite(r.dsr.dsr));
  check('hash en veredicto', r.verdict.preregistrationHash === 'abcd1234');
}

console.log('\n=== orf-matrix: riesgo martingala ===');
{
  const passes = [
    makePass(1, [1, 1, 1, 1], { lotVaries: true, minLot: 0.01, maxLot: 0.08, maxConcurrent: 8 }),
    makePass(2, [1, 1, 1, 1], { lotVaries: true, minLot: 0.01, maxLot: 0.08, maxConcurrent: 8 }),
  ];
  const doc = readOrfBuffer(writeOrfBuffer({ passes }));
  const risk = riskFlagsFromOrf(doc);
  check('veto riesgo', risk.riskVeto === true);
}

console.log(`\norf-matrix.test.js: ${checks - failures}/${checks} ok`);
if (failures) process.exit(1);
