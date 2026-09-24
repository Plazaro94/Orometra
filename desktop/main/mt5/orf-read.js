/**
 * Lectura de .orf desde disco (Node). El formato puro está en core/orf.js.
 */

import fs from 'node:fs';
import {
  readOrfBuffer,
  writeOrfBuffer,
  estimateOrfBytes,
  verifyDailyPnLSums,
  encodePassPayload,
  decodePassPayload,
  ORF_FORMAT_VERSION,
  ORF_MAGIC,
} from '../../../core/orf.js';

export function readOrfFile(filePath) {
  const buf = fs.readFileSync(filePath);
  return readOrfBuffer(buf);
}

export function writeOrfFile(filePath, doc) {
  const ab = writeOrfBuffer(doc);
  fs.writeFileSync(filePath, Buffer.from(ab));
}

export {
  readOrfBuffer,
  writeOrfBuffer,
  estimateOrfBytes,
  verifyDailyPnLSums,
  encodePassPayload,
  decodePassPayload,
  ORF_FORMAT_VERSION,
  ORF_MAGIC,
};
