// Builds public/ icons from the artwork at the repository root: `npm run icons`.
//
// The output is committed, so this runs by hand after the logo changes rather
// than in the build. It decodes and resamples in plain node — a one-off script
// is not worth a native image dependency in the install of everyone who only
// wants to run the site.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] ?? path.join(here, '..', '..', 'okmeme.png');
const OUT = process.argv[3] ?? path.join(here, '..', 'public');

// ---------- crc32 ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// ---------- decode ----------
function decode(file) {
  const b = fs.readFileSync(file);
  let o = 8;
  let ihdr = null;
  let plte = null;
  const idat = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o);
    const type = b.toString('ascii', o + 4, o + 8);
    const data = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'PLTE') plte = data;
    else if (type === 'IDAT') idat.push(data);
    o += 12 + len;
    if (type === 'IEND') break;
  }
  const w = ihdr.readUInt32BE(0);
  const h = ihdr.readUInt32BE(4);
  const depth = ihdr[8];
  const color = ihdr[9];
  if (depth !== 8 || color !== 3) throw new Error(`unsupported png: depth ${depth} color ${color}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 1; // indexed, 8-bit
  const stride = w * bpp;
  const px = Buffer.alloc(w * h);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const bb = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v += a;
      else if (ft === 2) v += bb;
      else if (ft === 3) v += (a + bb) >> 1;
      else if (ft === 4) {
        const p = a + bb - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - bb), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? bb : c;
      }
      cur[x] = v & 0xff;
    }
    cur.copy(px, y * stride);
    prev = cur;
  }
  // palette is a grey ramp; resolve through it rather than assuming index === grey
  const grey = new Float64Array(w * h);
  for (let i = 0; i < px.length; i++) {
    const p = px[i] * 3;
    grey[i] = (plte[p] * 0.299 + plte[p + 1] * 0.587 + plte[p + 2] * 0.114);
  }
  return { w, h, grey };
}

// ---------- ink bounds ----------
function inkBox(img, threshold = 200) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (img.grey[y * img.w + x] < threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { x0, y0, x1, y1 };
}

// ---------- resample ----------
// Area-average over the source rect, clamped to the canvas; anything outside is
// white, which is the background the artwork already sits on.
function render(img, rect, size) {
  const out = new Uint8Array(size * size);
  const sw = rect.w / size;
  const sh = rect.h / size;
  for (let oy = 0; oy < size; oy++) {
    for (let ox = 0; ox < size; ox++) {
      const fx0 = rect.x + ox * sw, fx1 = fx0 + sw;
      const fy0 = rect.y + oy * sh, fy1 = fy0 + sh;
      let sum = 0, area = 0;
      for (let y = Math.floor(fy0); y < Math.ceil(fy1); y++) {
        const cy = Math.min(fy1, y + 1) - Math.max(fy0, y);
        if (cy <= 0) continue;
        for (let x = Math.floor(fx0); x < Math.ceil(fx1); x++) {
          const cx = Math.min(fx1, x + 1) - Math.max(fx0, x);
          if (cx <= 0) continue;
          const inside = x >= 0 && y >= 0 && x < img.w && y < img.h;
          sum += (inside ? img.grey[y * img.w + x] : 255) * cx * cy;
          area += cx * cy;
        }
      }
      out[oy * size + ox] = Math.round(sum / area);
    }
  }
  return out;
}

// ---------- encode ----------
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(grey, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // depth
  ihdr[9] = 0; // greyscale
  const raw = Buffer.alloc((size + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) raw[y * (size + 1) + 1 + x] = grey[y * size + x];
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ICO with PNG payloads — understood by every browser still shipping, and far
// smaller than the BMP encoding for artwork this flat.
function encodeIco(entries) {
  const dir = Buffer.alloc(6 + entries.length * 16);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(entries.length, 4);
  let offset = dir.length;
  entries.forEach((e, i) => {
    const o = 6 + i * 16;
    dir[o] = e.size >= 256 ? 0 : e.size;
    dir[o + 1] = e.size >= 256 ? 0 : e.size;
    dir[o + 2] = 0; // palette
    dir[o + 3] = 0;
    dir.writeUInt16LE(1, o + 4); // planes
    dir.writeUInt16LE(32, o + 6); // bpp
    dir.writeUInt32LE(e.png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += e.png.length;
  });
  return Buffer.concat([dir, ...entries.map((e) => e.png)]);
}

// ---------- build ----------
const img = decode(SRC);
const box = inkBox(img);
const inkW = box.x1 - box.x0 + 1;
const inkH = box.y1 - box.y0 + 1;
const cx = (box.x0 + box.x1 + 1) / 2;
const cy = (box.y0 + box.y1 + 1) / 2;
console.log(`ink ${inkW}x${inkH} at ${box.x0},${box.y0} — ${((inkW / img.w) * 100).toFixed(0)}% of canvas`);

// One square crop per use. The favicon wants the glyphs as large as they go;
// the apple touch icon gets a wider margin because ios rounds the corners off.
function squareAround(marginRatio) {
  const side = Math.max(inkW, inkH) * (1 + marginRatio * 2);
  return { x: cx - side / 2, y: cy - side / 2, w: side, h: side };
}

const tight = squareAround(0.06);
const padded = squareAround(0.34);

fs.mkdirSync(OUT, { recursive: true });

const ico = encodeIco(
  [16, 32, 48].map((size) => ({ size, png: encodePng(render(img, tight, size), size) })),
);
fs.writeFileSync(path.join(OUT, 'favicon.ico'), ico);

fs.writeFileSync(path.join(OUT, 'icon.png'), encodePng(render(img, tight, 512), 512));
fs.writeFileSync(
  path.join(OUT, 'apple-touch-icon.png'),
  encodePng(render(img, padded, 180), 180),
);

for (const f of ['favicon.ico', 'icon.png', 'apple-touch-icon.png']) {
  console.log(`${f}\t${fs.statSync(path.join(OUT, f)).size} bytes`);
}
