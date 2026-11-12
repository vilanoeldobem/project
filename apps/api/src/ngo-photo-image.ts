/** PROPOSTA: bounded raster headers, not a decoder or metadata sanitizer. Keep activation gated. */
import { HttpError } from "./http";

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const invalid = (): never => { throw new HttpError(400, "invalid_photo"); };

export function photoBytes(data: unknown, contentType: unknown): Uint8Array {
  if (typeof data !== "string" || !data.length || data.length > 4 * Math.ceil(MAX_PHOTO_BYTES / 3))
    throw new HttpError(413, "photo_too_large");
  if (data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) invalid();
  let decoded: string;
  try { decoded = atob(data); } catch { return invalid(); }
  if (btoa(decoded) !== data) invalid();
  const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
  if (bytes.length > MAX_PHOTO_BYTES) throw new HttpError(413, "photo_too_large");
  const view = new DataView(bytes.buffer);
  const text = (at: number, size: number) => String.fromCharCode(...bytes.subarray(at, at + size));
  let width = 0, height = 0;
  if (contentType === "image/png") {
    if (bytes.length < 45 || text(0, 8) !== "\x89PNG\r\n\x1a\n") invalid();
    let at = 8, imageData = false, ended = false;
    while (at + 12 <= bytes.length) {
      const size = view.getUint32(at), kind = text(at + 4, 4);
      if (size > bytes.length - at - 12) invalid();
      if (["acTL", "fcTL", "fdAT"].includes(kind)) invalid();
      if (at === 8) {
        if (kind !== "IHDR" || size !== 13) invalid();
        width = view.getUint32(at + 8); height = view.getUint32(at + 12);
      } else if (kind === "IHDR") invalid();
      if (kind === "IDAT" && size > 0) imageData = true;
      at += size + 12;
      if (kind === "IEND") { if (size !== 0 || at !== bytes.length) invalid(); ended = true; break; }
    }
    if (!ended || !imageData) invalid();
  } else if (contentType === "image/jpeg") {
    if (bytes.length < 12 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) invalid();
    let at = 2, scan = false;
    while (at < bytes.length - 2) {
      if (bytes[at++] !== 255) invalid();
      while (bytes[at] === 255) at++;
      const marker = bytes[at++];
      if (at + 2 > bytes.length) invalid();
      const size = view.getUint16(at);
      if (size < 2 || at + size > bytes.length - 2) invalid();
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (size < 8 || width || height || size !== 8 + 3 * bytes[at + 7]) invalid();
        height = view.getUint16(at + 3); width = view.getUint16(at + 5);
      }
      if (marker === 0xda) { scan = at + size < bytes.length - 2; break; }
      at += size;
    }
    if (!scan) invalid();
  } else if (contentType === "image/webp") {
    if (bytes.length < 26 || text(0, 4) !== "RIFF" || text(8, 4) !== "WEBP" || view.getUint32(4, true) !== bytes.length - 8) invalid();
    let at = 12, imageData = false, canvasWidth = 0, canvasHeight = 0;
    while (at + 8 <= bytes.length) {
      const kind = text(at, 4), size = view.getUint32(at + 4, true), start = at + 8;
      if (size > bytes.length - start) invalid();
      if (kind === "VP8X") {
        if (at !== 12 || size !== 10 || (bytes[start] & 2)) invalid();
        canvasWidth = 1 + bytes[start + 4] + (bytes[start + 5] << 8) + (bytes[start + 6] << 16);
        canvasHeight = 1 + bytes[start + 7] + (bytes[start + 8] << 8) + (bytes[start + 9] << 16);
      } else if (kind === "VP8 " && size >= 10) {
        if (imageData) invalid();
        if (text(start + 3, 3) !== "\x9d\x01\x2a" || (bytes[start] & 1)) invalid();
        width = view.getUint16(start + 6, true) & 0x3fff; height = view.getUint16(start + 8, true) & 0x3fff; imageData = true;
      } else if (kind === "VP8L" && size >= 5) {
        if (imageData) invalid();
        if (bytes[start] !== 0x2f) invalid();
        const bits = view.getUint32(start + 1, true);
        width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1; imageData = true;
      } else if (kind === "ANIM" || kind === "ANMF") invalid();
      at = start + size + (size % 2);
    }
    if (at !== bytes.length || !imageData || (canvasWidth && (canvasWidth !== width || canvasHeight !== height))) invalid();
  } else invalid();
  if (!width || !height || width > 4096 || height > 4096 || width * height > 16_000_000) invalid();
  return bytes;
}
