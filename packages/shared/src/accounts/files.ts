/**
 * Files of an NGO application (IMPL-0017): the logo and the supporting documents kept in R2. Rules and file
 * inspection shared by the API (the authority) and the browser apps (early feedback before an upload).
 *
 * PROPOSTA: the kinds, limits and accepted formats below. The list of documents an NGO must send is PENDENTE
 * (PEN-019), so nothing here names or requires a document: an application may carry up to five optional ones.
 *
 * Pure: bytes in, bytes out. No DOM, no Workers runtime.
 */

export const FILE_KINDS = ["logo", "document"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const FILE_TYPES = ["image/png", "image/jpeg", "application/pdf"] as const;
export type FileType = (typeof FILE_TYPES)[number];

export interface FileRule {
  /** Largest accepted upload, in bytes. */
  maxBytes: number;
  /** Files of this kind one application may hold. */
  maxCount: number;
  types: readonly FileType[];
  /** Accepted image side, in pixels (a tiny image is not a logo; a huge one is a decoding cost for every viewer). */
  minSide: number;
  maxSide: number;
}

export const FILE_RULES: Record<FileKind, FileRule> = {
  // Public once the NGO is published: small, raster only (no SVG: it can carry script).
  logo: { maxBytes: 512 * 1024, maxCount: 1, types: ["image/png", "image/jpeg"], minSide: 64, maxSide: 1024 },
  // Private: only the applicant and the admins ever read them.
  document: { maxBytes: 5 * 1024 * 1024, maxCount: 5, types: ["application/pdf", "image/png", "image/jpeg"], minSide: 1, maxSide: 8192 },
};

export const FILE_EXTENSION: Record<FileType, string> = { "image/png": "png", "image/jpeg": "jpg", "application/pdf": "pdf" };

/** File metadata as the API returns it. There is no file name: the original name may carry personal data. */
export interface ApplicationFile {
  id: string;
  kind: FileKind;
  contentType: FileType;
  size: number;
  createdAt: string;
}

/**
 * Statuses in which the applicant may add or remove files. While an admin is reviewing ("under_review") the files
 * are locked, so what gets decided is what was seen; a published application is frozen (DEC-037).
 */
export const FILES_EDITABLE_STATUSES = ["submitted", "changes_requested", "rejected"] as const;
export const filesEditable = (status: string): boolean => (FILES_EDITABLE_STATUSES as readonly string[]).includes(status);

/**
 * Statuses in which the applicant may remove their own files: the editable ones and, PROPOSTA (IMPL-0020, OQ-14),
 * "withdrawn". After the administration withdraws the NGO nothing can be added or replaced, but removing one's own
 * data stays possible. `status` is the effective status the API answers, not the stored one.
 */
export const filesRemovable = (status: string): boolean => filesEditable(status) || status === "withdrawn";

/** Download name built from what the API knows: "logo.png", "documento-2.pdf" (`position` counts from 1). */
export const fileDownloadName = (file: Pick<ApplicationFile, "kind" | "contentType">, position = 1): string =>
  `${file.kind === "logo" ? "logo" : `documento-${position}`}.${FILE_EXTENSION[file.contentType]}`;

export const isFileKind = (v: unknown): v is FileKind => typeof v === "string" && (FILE_KINDS as readonly string[]).includes(v);
export const isFileType = (v: unknown): v is FileType => typeof v === "string" && (FILE_TYPES as readonly string[]).includes(v);

const startsWith = (bytes: Uint8Array, signature: readonly number[], at = 0) =>
  bytes.length >= at + signature.length && signature.every((b, i) => bytes[at + i] === b);

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** The format the bytes really are (from their signature), whatever the browser or the file name said. */
export function sniffFileType(bytes: Uint8Array): FileType | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return "image/png";
  if (startsWith(bytes, JPEG_SIGNATURE)) return "image/jpeg";
  if (startsWith(bytes, PDF_SIGNATURE)) return "application/pdf";
  return null;
}

export interface CleanImage {
  width: number;
  height: number;
  /**
   * The same picture without the metadata this module knows (EXIF with GPS and device, XMP, IPTC, comments, text
   * chunks, thumbnails, anything after the end marker). A JPEG keeps one thing from its EXIF: the orientation.
   * Only re-encoding the pixels removes everything; an ICC profile and the pixel data are kept as sent.
   */
  bytes: Uint8Array;
}

const u16 = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];
const u32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/**
 * Separate byte ranges one cleaned image may be made of. Real files need a handful; a hostile file built from
 * hundreds of thousands of tiny pieces is refused instead of costing an object per piece.
 */
const MAX_PARTS = 10_000;

/** The byte ranges of the source to keep, in order. Neighbouring ranges become one, so many small chunks cost nothing. */
class Kept {
  readonly parts: Uint8Array[] = [];
  private readonly bytes: Uint8Array;
  private from = -1;
  private to = -1;
  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }
  /** Keeps `bytes[start, end)`. */
  range(start: number, end: number): void {
    if (start === this.to) this.parts[this.parts.length - 1] = this.bytes.subarray(this.from, (this.to = end));
    else this.parts.push(this.bytes.subarray((this.from = start), (this.to = end)));
  }
  /** Adds bytes that are not in the source. */
  add(part: Uint8Array): void {
    this.parts.push(part);
    this.to = -1;
  }
  get tooMany(): boolean {
    return this.parts.length > MAX_PARTS;
  }
}

/**
 * Ancillary PNG chunks that change how the picture looks, with the largest payload each may have. One of each,
 * and only before the pixel data; a bigger or repeated one is dropped (it would be a place to hide data).
 * Everything else (tEXt, iTXt, zTXt, eXIf, tIME, APNG…) is always dropped.
 */
const PNG_ANCILLARY: Record<string, number> = { tRNS: 256, gAMA: 4, cHRM: 32, sRGB: 1, sBIT: 4, bKGD: 6, pHYs: 9, iCCP: 1024 * 1024 };

function cleanPng(bytes: Uint8Array): CleanImage | null {
  if (!startsWith(bytes, PNG_SIGNATURE)) return null;
  const kept = new Kept(bytes);
  kept.range(0, 8);
  const seen = new Set<string>();
  let at = 8;
  let width = 0;
  let height = 0;
  let hasData = false;
  for (let index = 0; ; index++) {
    if (at + 12 > bytes.length) return null;
    const length = u32(bytes, at);
    const end = at + 12 + length;
    if (end > bytes.length) return null;
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    if (index === 0) {
      if (type !== "IHDR" || length !== 13) return null;
      width = u32(bytes, at + 8);
      height = u32(bytes, at + 12);
      kept.range(at, end);
    } else if (type === "IHDR") return null;
    else if (type === "PLTE") {
      // The palette is part of the picture: one, before the pixel data, at most 256 colours.
      if (seen.has(type) || hasData || length > 768 || length % 3 !== 0) return null;
      kept.range(at, end);
    } else if (type === "IDAT") {
      hasData = true;
      kept.range(at, end);
    } else if (type === "IEND") {
      if (length !== 0) return null;
      kept.range(at, end);
    } else if (Object.hasOwn(PNG_ANCILLARY, type) && !seen.has(type) && !hasData && length <= PNG_ANCILLARY[type]) kept.range(at, end);
    seen.add(type);
    if (kept.tooMany) return null;
    at = end;
    if (type === "IEND") break;
  }
  if (!hasData || !width || !height) return null;
  return { width, height, bytes: concat(kept.parts) };
}

const ICC_PROFILE = [0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45, 0x00]; // "ICC_PROFILE\0"

const JFIF = [0x4a, 0x46, 0x49, 0x46, 0x00]; // "JFIF\0"
const ADOBE = [0x41, 0x64, 0x6f, 0x62, 0x65]; // "Adobe"

/** Start of frame: the segment that carries the picture size (every SOFn; C4, C8 and CC are other things). */
const isFrame = (marker: number) => marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

/**
 * JPEG segments kept: what the decoder needs (frame, tables, restart interval, scans) plus three that change the
 * colours: a plain JFIF header (APP0 without a thumbnail), an ICC profile (APP2) and the Adobe colour transform
 * (APP14). Every other segment is dropped: EXIF, XMP, IPTC, MPF, JFXX thumbnails, comments, reserved markers.
 */
function keepJpegSegment(bytes: Uint8Array, marker: number, at: number, length: number): boolean {
  if (isFrame(marker) || marker === 0xc4 || marker === 0xcc || marker === 0xda || marker === 0xdb || marker === 0xdc || marker === 0xdd) return true;
  if (marker === 0xe0) return length === 16 && startsWith(bytes, JFIF, at + 4);
  if (marker === 0xe2) return startsWith(bytes, ICC_PROFILE, at + 4);
  if (marker === 0xee) return length === 14 && startsWith(bytes, ADOBE, at + 4);
  return false;
}

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"

/** The EXIF orientation (1–8) of a TIFF block starting at `tiff`, or 0 when there is none or the block is malformed. */
function exifOrientation(b: Uint8Array, tiff: number, end: number): number {
  if (tiff + 8 > end) return 0;
  const little = b[tiff] === 0x49 && b[tiff + 1] === 0x49;
  if (!little && !(b[tiff] === 0x4d && b[tiff + 1] === 0x4d)) return 0;
  const r16 = (at: number) => (little ? b[at] | (b[at + 1] << 8) : u16(b, at));
  const r32 = (at: number) => (little ? (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0 : u32(b, at));
  if (r16(tiff + 2) !== 42) return 0;
  const ifd = tiff + r32(tiff + 4);
  if (ifd + 2 > end) return 0;
  const entries = r16(ifd);
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return 0;
    if (r16(entry) === 0x0112) return r16(entry + 2) === 3 ? r16(entry + 8) : 0;
  }
  return 0;
}

/** A minimal EXIF segment that says only how to rotate the picture (phone photos rely on it to show upright). */
const orientationSegment = (orientation: number) =>
  Uint8Array.of(
    ...[0xff, 0xe1, 0x00, 0x22],
    ...EXIF_HEADER,
    ...[0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08], // big-endian TIFF, first IFD at offset 8
    ...[0x00, 0x01], // one entry
    ...[0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00], // Orientation, SHORT, count 1
    ...[0x00, 0x00, 0x00, 0x00] // no next IFD
  );

function cleanJpeg(bytes: Uint8Array): CleanImage | null {
  if (!startsWith(bytes, JPEG_SIGNATURE)) return null;
  const kept = new Kept(bytes);
  kept.range(0, 2);
  let at = 2;
  let width = 0;
  let height = 0;
  let hasFrame = false;
  let hasScan = false;
  let sawExif = false;
  for (;;) {
    if (at + 2 > bytes.length || bytes[at] !== 0xff) return null;
    // Fill bytes before a marker.
    while (bytes[at + 1] === 0xff) if (++at + 2 > bytes.length) return null;
    const marker = bytes[at + 1];
    if (marker === 0xd9) {
      kept.range(at, at + 2);
      break;
    }
    if (marker === 0x00 || marker === 0xd8) return null;
    // Markers without a payload have no business between segments (restarts live inside a scan): dropped.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    if (at + 4 > bytes.length) return null;
    const length = u16(bytes, at + 2);
    const end = at + 2 + length;
    if (length < 2 || end > bytes.length) return null;
    if (isFrame(marker)) {
      // One frame, before the first scan: decoders take the size from it. A second one (or one after the pixel
      // data, which decoders never read) would let the size checked here differ from the size decoded.
      if (hasFrame || hasScan || length < 8) return null;
      hasFrame = true;
      height = u16(bytes, at + 5);
      width = u16(bytes, at + 7);
    }
    if (keepJpegSegment(bytes, marker, at, length)) kept.range(at, end);
    else if (marker === 0xe1 && !sawExif && startsWith(bytes, EXIF_HEADER, at + 4)) {
      // EXIF goes away (GPS, device, thumbnail), except the rotation: without it a phone photo shows sideways.
      // Only the first EXIF segment counts, as for the browsers that read it.
      sawExif = true;
      const orientation = exifOrientation(bytes, at + 10, end);
      if (orientation >= 2 && orientation <= 8) kept.add(orientationSegment(orientation));
    }
    at = end;
    if (marker === 0xda) {
      if (!hasFrame) return null;
      // Entropy-coded data runs until the next real marker (0xFF00 is a stuffed byte, 0xFFD0–D7 are restarts).
      const start = at;
      while (at < bytes.length) {
        if (bytes[at] !== 0xff) at++;
        else if (at + 1 >= bytes.length) return null;
        else if (bytes[at + 1] === 0x00 || (bytes[at + 1] >= 0xd0 && bytes[at + 1] <= 0xd7)) at += 2;
        else if (bytes[at + 1] === 0xff) at++;
        else break;
      }
      kept.range(start, at);
      hasScan = true;
    }
    if (kept.tooMany) return null;
  }
  if (!hasScan || !width || !height) return null;
  return { width, height, bytes: concat(kept.parts) };
}

/** Reads the size of a PNG or JPEG and returns it without metadata; null when the file is not a well-formed image. */
export function cleanImage(bytes: Uint8Array, type: FileType): CleanImage | null {
  if (type === "image/png") return cleanPng(bytes);
  if (type === "image/jpeg") return cleanJpeg(bytes);
  return null;
}

export const FILE_ERRORS = ["file_type", "file_empty", "file_too_large", "file_mismatch", "file_invalid", "image_too_small", "image_too_large"] as const;
export type FileError = (typeof FILE_ERRORS)[number];

const megabytes = (n: number) => (n >= 1024 * 1024 ? `${n / (1024 * 1024)} MB` : `${n / 1024} KB`);

/** pt-BR sentence for a refused file (UI copy; also sent by the API as the `file` field message). */
export function fileErrorText(code: FileError, kind: FileKind): string {
  const rule = FILE_RULES[kind];
  switch (code) {
    case "file_type":
      return kind === "logo" ? "Envie o logo em PNG ou JPEG." : "Envie o documento em PDF, PNG ou JPEG.";
    case "file_empty":
      return "O arquivo está vazio.";
    case "file_too_large":
      return `O arquivo passa do limite de ${megabytes(rule.maxBytes)}.`;
    case "file_mismatch":
      return "O conteúdo do arquivo não corresponde ao formato informado.";
    case "file_invalid":
      return "Não foi possível ler a imagem. Exporte o arquivo de novo e tente outra vez.";
    case "image_too_small":
      return `A imagem precisa ter pelo menos ${rule.minSide} × ${rule.minSide} pixels.`;
    case "image_too_large":
      return `A imagem pode ter no máximo ${rule.maxSide} × ${rule.maxSide} pixels.`;
  }
}

export type FileCheck = { ok: true; type: FileType; bytes: Uint8Array } | { ok: false; error: FileError };

/**
 * Checks a file against the rule of its kind: declared type accepted, size, real format equal to the declared
 * one, image well-formed and within the pixel limits. Returns the bytes to store: images come back without
 * metadata (a phone photo carries GPS and device data; a logo becomes public). A PDF is stored as sent.
 */
export function checkFile(kind: FileKind, declaredType: string, bytes: Uint8Array): FileCheck {
  const rule = FILE_RULES[kind];
  if (!isFileType(declaredType) || !rule.types.includes(declaredType)) return { ok: false, error: "file_type" };
  if (bytes.length === 0) return { ok: false, error: "file_empty" };
  if (bytes.length > rule.maxBytes) return { ok: false, error: "file_too_large" };
  if (sniffFileType(bytes) !== declaredType) return { ok: false, error: "file_mismatch" };
  if (declaredType === "application/pdf") return { ok: true, type: declaredType, bytes };
  const image = cleanImage(bytes, declaredType);
  if (!image) return { ok: false, error: "file_invalid" };
  if (image.width < rule.minSide || image.height < rule.minSide) return { ok: false, error: "image_too_small" };
  if (image.width > rule.maxSide || image.height > rule.maxSide) return { ok: false, error: "image_too_large" };
  return { ok: true, type: declaredType, bytes: image.bytes };
}
