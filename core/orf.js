/**
 * Lector del formato .orf (Orometra Return Frames) — versión 1.
 *
 * Formato en disco (little-endian):
 *   magic[4]     = "ORF1"
 *   u32 version  = 1
 *   u32 nPasses
 *   u32 reserved = 0
 *   por cada pasada:
 *     u32 passId
 *     u32 nFloats
 *     f32[nFloats]  (misma disposición que el double[] de FrameAdd)
 *
 * Payload float (índices):
 *   0  format_version
 *   1  start_date YYYYMMDD
 *   2  n_active_days
 *   3  max_concurrent_positions
 *   4  min_lot
 *   5  max_lot
 *   6  lot_varies (0/1)
 *   7  trades_without_sl
 *   8  avg_duration_seconds
 *   9  weekend_cross_count
 *   10 criterion
 *   11 total_net_pnl
 *   12 total_closed_trades
 *   luego n_active_days × 6:
 *     day_index, pnl, volume, n_trades, swap, commission
 *
 * Puro ES: usable desde Node (Buffer) o entornos con ArrayBuffer.
 */

export const ORF_MAGIC = 'ORF1';
export const ORF_FORMAT_VERSION = 1;
export const ORF_HEADER_LEN = 13;
export const ORF_DAY_STRIDE = 6;
/** Bytes de cabecera de fichero */
export const ORF_FILE_HEADER_BYTES = 16;
/** Por pasada: passId + nFloats */
export const ORF_PASS_HEADER_BYTES = 8;

/**
 * Estima tamaño en disco (float32) de un .orf.
 * @param {number} passes
 * @param {number} activeDays  media de días con actividad por pasada
 * @returns {{ bytes: number, mib: number, warn2GiB: boolean }}
 */
export function estimateOrfBytes(passes, activeDays) {
  const p = Math.max(0, Number(passes) || 0);
  const d = Math.max(0, Number(activeDays) || 0);
  const floatsPerPass = ORF_HEADER_LEN + d * ORF_DAY_STRIDE;
  const bytes = ORF_FILE_HEADER_BYTES + p * (ORF_PASS_HEADER_BYTES + floatsPerPass * 4);
  const mib = bytes / (1024 * 1024);
  return { bytes, mib, warn2GiB: bytes > 2 * 1024 * 1024 * 1024 };
}

/**
 * Codifica un payload de pasada (objeto) → Float32Array.
 */
export function encodePassPayload(pass) {
  const days = pass.days || [];
  const n = days.length;
  const arr = new Float32Array(ORF_HEADER_LEN + n * ORF_DAY_STRIDE);
  arr[0] = pass.formatVersion ?? ORF_FORMAT_VERSION;
  arr[1] = pass.startDateYmd ?? 0;
  arr[2] = n;
  arr[3] = pass.maxConcurrent ?? 0;
  arr[4] = pass.minLot ?? 0;
  arr[5] = pass.maxLot ?? 0;
  arr[6] = pass.lotVaries ? 1 : 0;
  arr[7] = pass.tradesWithoutSl ?? 0;
  arr[8] = pass.avgDurationSec ?? 0;
  arr[9] = pass.weekendCross ?? 0;
  arr[10] = pass.criterion ?? 0;
  arr[11] = pass.totalNetPnl ?? sumDayPnl(days);
  arr[12] = pass.totalClosedTrades ?? sumDayTrades(days);
  for (let i = 0; i < n; i++) {
    const base = ORF_HEADER_LEN + i * ORF_DAY_STRIDE;
    const d = days[i];
    arr[base] = d.dayIndex;
    arr[base + 1] = d.pnl;
    arr[base + 2] = d.volume ?? 0;
    arr[base + 3] = d.nTrades ?? 0;
    arr[base + 4] = d.swap ?? 0;
    arr[base + 5] = d.commission ?? 0;
  }
  return arr;
}

function sumDayPnl(days) {
  let s = 0;
  for (const d of days) s += Number(d.pnl) || 0;
  return s;
}

function sumDayTrades(days) {
  let s = 0;
  for (const d of days) s += Number(d.nTrades) || 0;
  return s;
}

/**
 * Decodifica Float32Array → objeto pasada.
 */
export function decodePassPayload(floats) {
  const f = floats instanceof Float32Array ? floats : new Float32Array(floats);
  if (f.length < ORF_HEADER_LEN) {
    throw new Error(`Payload ORF demasiado corto (${f.length} < ${ORF_HEADER_LEN})`);
  }
  const nActive = Math.round(f[2]);
  const need = ORF_HEADER_LEN + nActive * ORF_DAY_STRIDE;
  if (f.length < need) {
    throw new Error(`Payload ORF incompleto: hay ${f.length}, se esperaban ${need}`);
  }
  const days = [];
  for (let i = 0; i < nActive; i++) {
    const base = ORF_HEADER_LEN + i * ORF_DAY_STRIDE;
    days.push({
      dayIndex: Math.round(f[base]),
      pnl: f[base + 1],
      volume: f[base + 2],
      nTrades: f[base + 3],
      swap: f[base + 4],
      commission: f[base + 5],
    });
  }
  return {
    formatVersion: f[0],
    startDateYmd: Math.round(f[1]),
    nActiveDays: nActive,
    maxConcurrent: Math.round(f[3]),
    minLot: f[4],
    maxLot: f[5],
    lotVaries: f[6] >= 0.5,
    tradesWithoutSl: Math.round(f[7]),
    avgDurationSec: f[8],
    weekendCross: Math.round(f[9]),
    criterion: f[10],
    totalNetPnl: f[11],
    totalClosedTrades: Math.round(f[12]),
    days,
  };
}

/**
 * Escribe un .orf completo (ArrayBuffer).
 * @param {{ passes: { passId: number, floats: Float32Array }[] }} doc
 */
export function writeOrfBuffer(doc) {
  const passes = doc.passes || [];
  let size = ORF_FILE_HEADER_BYTES;
  for (const p of passes) {
    size += ORF_PASS_HEADER_BYTES + p.floats.length * 4;
  }
  const buf = new ArrayBuffer(size);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);
  u8[0] = 0x4f; // O
  u8[1] = 0x52; // R
  u8[2] = 0x46; // F
  u8[3] = 0x31; // 1
  view.setUint32(4, ORF_FORMAT_VERSION, true);
  view.setUint32(8, passes.length, true);
  view.setUint32(12, 0, true);
  let off = 16;
  for (const p of passes) {
    view.setUint32(off, p.passId >>> 0, true);
    off += 4;
    view.setUint32(off, p.floats.length, true);
    off += 4;
    const f32 = new Float32Array(buf, off, p.floats.length);
    f32.set(p.floats);
    off += p.floats.length * 4;
  }
  return buf;
}

/**
 * Lee un .orf desde ArrayBuffer / Uint8Array / Buffer.
 */
export function readOrfBuffer(input) {
  const u8 = input instanceof ArrayBuffer
    ? new Uint8Array(input)
    : new Uint8Array(input.buffer ?? input, input.byteOffset ?? 0, input.byteLength ?? input.length);
  if (u8.length < ORF_FILE_HEADER_BYTES) {
    throw new Error('Archivo .orf demasiado corto');
  }
  const magic = String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);
  if (magic !== ORF_MAGIC) {
    throw new Error(`Magic ORF inválido: ${JSON.stringify(magic)} (se esperaba ORF1)`);
  }
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const version = view.getUint32(4, true);
  if (version !== ORF_FORMAT_VERSION) {
    throw new Error(`Versión ORF no soportada: ${version}`);
  }
  const nPasses = view.getUint32(8, true);
  const reserved = view.getUint32(12, true);
  const passes = [];
  let off = 16;
  for (let i = 0; i < nPasses; i++) {
    if (off + 8 > u8.length) throw new Error(`Truncado al leer pasada ${i}`);
    const passId = view.getUint32(off, true);
    off += 4;
    const nFloats = view.getUint32(off, true);
    off += 4;
    if (off + nFloats * 4 > u8.length) {
      throw new Error(`Truncado en floats de pasada ${i} (passId=${passId})`);
    }
    const floats = new Float32Array(nFloats);
    for (let j = 0; j < nFloats; j++) {
      floats[j] = view.getFloat32(off + j * 4, true);
    }
    off += nFloats * 4;
    const decoded = decodePassPayload(floats);
    passes.push({ passId, floats, ...decoded });
  }
  return { version, nPasses, reserved, passes };
}

/**
 * Suma de P&L diarios vs beneficio XML (tolerancia en céntimos).
 * @param {{ days: { pnl: number }[], totalNetPnl?: number }} passSeries
 * @param {number} xmlProfit
 * @param {number} [centTolerance=1]  tolerancia en céntimos (0.01 moneda × N)
 * @returns {{ ok: boolean, sumDays: number, headerTotal: number|null, xmlProfit: number, deltaXml: number, deltaHeader: number|null }}
 */
export function verifyDailyPnLSums(passSeries, xmlProfit, centTolerance = 1) {
  const tol = (Number(centTolerance) || 1) * 0.01;
  const days = passSeries?.days || [];
  let sumDays = 0;
  for (const d of days) sumDays += Number(d.pnl) || 0;
  const headerTotal = passSeries?.totalNetPnl != null ? Number(passSeries.totalNetPnl) : null;
  const xml = Number(xmlProfit);
  const deltaXml = sumDays - xml;
  const deltaHeader = headerTotal != null ? sumDays - headerTotal : null;
  const okXml = Number.isFinite(xml) && Math.abs(deltaXml) <= tol;
  const okHeader = headerTotal == null || Math.abs(deltaHeader) <= tol;
  return {
    ok: okXml && okHeader,
    sumDays,
    headerTotal,
    xmlProfit: xml,
    deltaXml,
    deltaHeader,
    tolerance: tol,
  };
}
