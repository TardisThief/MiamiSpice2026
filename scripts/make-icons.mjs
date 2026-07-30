/**
 * Generate the PWA icons as PNGs with no image-library dependency.
 *
 * Writing a minimal PNG encoder by hand (raw deflate via zlib, which ships with
 * Node) keeps the install free of a native image toolchain for what is ultimately
 * three flat-color graphics.
 *
 * The mark: a marine-blue rounded square with a location pin cut out of it — the
 * app is a wayfinding instrument, and the pin is the one glyph that says so at
 * 48 physical pixels on a home screen.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = path.resolve(import.meta.dirname, '..', 'public', 'icons');

/** Brand primary, oklch(0.50 0.10 212) converted to sRGB. */
const BRAND = [26, 90, 116];
const WHITE = [255, 255, 255];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Encode RGBA pixel rows into a PNG buffer. */
function encodePng(width, height, pixels) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Each scanline is prefixed with a filter byte (0 = none).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Signed distance to a rounded rectangle, for antialiased edges. */
function roundedRectSdf(px, py, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(px - cx) - (halfW - r);
  const qy = Math.abs(py - cy) - (halfH - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * Map-pin SDF: a circle fused with a downward triangle, which reads as a pin at
 * any size without needing path rendering.
 */
function pinSdf(px, py, cx, cy, radius) {
  const circle = Math.hypot(px - cx, py - cy) - radius;

  // Tail: narrows from the circle's lower half down to a point.
  const tipY = cy + radius * 2.45;
  const t = (py - cy) / (tipY - cy);
  if (t >= 0 && t <= 1) {
    const halfWidth = radius * 0.92 * (1 - t);
    const tail = Math.abs(px - cx) - halfWidth;
    return Math.min(circle, tail);
  }
  return circle;
}

function blend(dst, offset, color, alpha) {
  if (alpha <= 0) return;
  const a = Math.min(1, alpha);
  for (let i = 0; i < 3; i++) {
    dst[offset + i] = Math.round(dst[offset + i] * (1 - a) + color[i] * a);
  }
  dst[offset + 3] = Math.max(dst[offset + 3], Math.round(255 * a));
}

/**
 * @param {number} size
 * @param {boolean} maskable  Maskable icons need the mark inside the safe zone
 *                            (80% of the canvas) and a full-bleed background.
 */
function drawIcon(size, maskable) {
  const px = Buffer.alloc(size * size * 4, 0);
  const c = size / 2;

  // Background: full-bleed for maskable, rounded square otherwise.
  const bgHalf = size / 2;
  const bgRadius = maskable ? 0 : size * 0.22;

  // The pin is scaled down for maskable icons so it survives a circular mask.
  const pinRadius = size * (maskable ? 0.15 : 0.185);
  const pinCy = c - size * (maskable ? 0.035 : 0.045);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      const sx = x + 0.5;
      const sy = y + 0.5;

      if (maskable) {
        blend(px, o, BRAND, 1);
      } else {
        const d = roundedRectSdf(sx, sy, c, c, bgHalf, bgHalf, bgRadius);
        blend(px, o, BRAND, Math.min(1, 0.5 - d));
      }

      // Pin knocked out in white.
      const pd = pinSdf(sx, sy, c, pinCy, pinRadius);
      blend(px, o, WHITE, Math.min(1, 0.5 - pd));

      // Hole in the pin head, punched back to the brand color.
      const hd = Math.hypot(sx - c, sy - pinCy) - pinRadius * 0.38;
      blend(px, o, BRAND, Math.min(1, 0.5 - hd));
    }
  }

  return encodePng(size, size, px);
}

fs.mkdirSync(OUT, { recursive: true });

const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['maskable-512.png', 512, true],
  ['favicon-64.png', 64, false],
];

for (const [name, size, maskable] of targets) {
  const buf = drawIcon(size, maskable);
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log(`wrote public/icons/${name} (${size}x${size}, ${(buf.length / 1024).toFixed(1)} KB)`);
}
