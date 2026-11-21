// 依存ライブラリなしで PNG を読み書きする小さな道具（8bit・インターレースなしのみ対応）
const fs = require('fs');
const zlib = require('zlib');

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

// RGBA の配列として読む
function readPng(file) {
  const b = fs.readFileSync(file);
  let pos = 8;
  let width, height, depth, type, interlace;
  let palette = null;
  let trns = null;
  const idat = [];
  while (pos < b.length) {
    const len = b.readUInt32BE(pos);
    const name = b.toString('ascii', pos + 4, pos + 8);
    const data = b.subarray(pos + 8, pos + 8 + len);
    if (name === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (name === 'PLTE') palette = data;
    else if (name === 'tRNS') trns = data;
    else if (name === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  if (depth !== 8 || interlace !== 0) throw new Error(`未対応の PNG: depth=${depth} interlace=${interlace}`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[i - channels] : 0;
      const up = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += up;
      else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) {
        const p = a + up - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      }
      out[i] = v & 0xff;
    }
    prev = out;
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    let r, g, bl, al;
    if (type === 6) [r, g, bl, al] = px.subarray(i * 4, i * 4 + 4);
    else if (type === 2) [r, g, bl, al] = [...px.subarray(i * 3, i * 3 + 3), 255];
    else if (type === 3) {
      const k = px[i];
      [r, g, bl] = palette.subarray(k * 3, k * 3 + 3);
      al = trns && k < trns.length ? trns[k] : 255;
    } else if (type === 4) [r, g, bl, al] = [px[i * 2], px[i * 2], px[i * 2], px[i * 2 + 1]];
    else [r, g, bl, al] = [px[i], px[i], px[i], 255];
    rgba.set([r, g, bl, al], i * 4);
  }
  return { width, height, data: rgba };
}

// RGBA で書く
function writePng(file, { width, height, data }) {
  const chunk = (name, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const nb = Buffer.concat([Buffer.from(name, 'ascii'), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(nb));
    return Buffer.concat([len, nb, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0))
    ])
  );
}

module.exports = { readPng, writePng };
