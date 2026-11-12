/**
 * Small real files for upload tests: a decodable greyscale PNG of any size (with optional extra chunks), a JPEG
 * skeleton with the segments the cleaner reads, and a PDF.
 */
import { deflateSync } from "node:zlib";

const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const join = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const be32 = (n) => Uint8Array.of(n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
const be16 = (n) => Uint8Array.of(n >> 8, n & 255);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** One PNG chunk (length, type, data, CRC). */
export const pngChunk = (type, text = "") => {
  const data = ascii(text);
  return join(be32(data.length), ascii(type), data, be32(crc32(join(ascii(type), data))));
};

const rawChunk = (type, data) => join(be32(data.length), ascii(type), data, be32(crc32(join(ascii(type), data))));

export function png(width = 128, height = 128, extra = []) {
  const rows = new Uint8Array((width + 1) * height).fill(0x80);
  for (let y = 0; y < height; y++) rows[y * (width + 1)] = 0;
  return join(
    Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    rawChunk("IHDR", join(be32(width), be32(height), Uint8Array.of(8, 0, 0, 0, 0))),
    ...extra,
    rawChunk("IDAT", new Uint8Array(deflateSync(rows))),
    rawChunk("IEND", new Uint8Array())
  );
}

const segment = (marker, data) => join(Uint8Array.of(0xff, marker), be16(data.length + 2), data);

/** JPEG structure with an EXIF segment carrying `secret` (not a decodable picture). */
export function jpeg(width = 128, height = 128, secret = "") {
  return join(
    Uint8Array.of(0xff, 0xd8),
    segment(0xe0, join(ascii("JFIF\0"), Uint8Array.of(1, 1, 0, 0, 1, 0, 1, 0, 0))),
    ...(secret ? [segment(0xe1, ascii(`Exif\0\0${secret}`))] : []),
    segment(0xdb, new Uint8Array(65)),
    segment(0xc0, join(Uint8Array.of(8), be16(height), be16(width), Uint8Array.of(1, 1, 0x11, 0))),
    segment(0xda, Uint8Array.of(1, 1, 0, 0, 63, 0)),
    Uint8Array.of(0x12, 0x34, 0x56),
    Uint8Array.of(0xff, 0xd9)
  );
}

export const pdf = (text = "exemplo") => ascii(`%PDF-1.7\n1 0 obj\n<< /Title (${text}) >>\nendobj\n%%EOF\n`);

export const text = (bytes) => Buffer.from(bytes).toString("latin1");
