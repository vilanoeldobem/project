import { describe, expect, it } from "vitest";

import { checkFile, cleanImage, FILE_ERRORS, FILE_KINDS, FILE_RULES, fileDownloadName, fileErrorText, filesEditable, sniffFileType } from "./files";

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const be32 = (n: number) => Uint8Array.of(n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
const be16 = (n: number) => Uint8Array.of(n >> 8, n & 255);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: Uint8Array) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** zlib stream with one stored (uncompressed) block: enough for a decodable PNG without a compressor (data < 64 KiB). */
function deflateSync(data: Uint8Array) {
  let a = 1;
  let b = 0;
  for (const v of data) {
    a = (a + v) % 65521;
    b = (b + a) % 65521;
  }
  const length = Uint8Array.of(data.length & 255, data.length >> 8);
  return join(Uint8Array.of(0x78, 0x01, 0x01), length, Uint8Array.of(~length[0] & 255, ~length[1] & 255), data, be32(((b << 16) | a) >>> 0));
}

const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const chunk = (type: string, data: Uint8Array = new Uint8Array()) => join(be32(data.length), ascii(type), data, be32(crc32(join(ascii(type), data))));

/** A real, decodable greyscale PNG of the given size, with optional extra chunks before the pixel data. */
function png(width: number, height: number, extra: Uint8Array[] = [], trailing = new Uint8Array()) {
  const ihdr = join(be32(width), be32(height), Uint8Array.of(8, 0, 0, 0, 0));
  const rows = new Uint8Array((width + 1) * height).fill(0x80);
  for (let y = 0; y < height; y++) rows[y * (width + 1)] = 0;
  return join(PNG_SIGNATURE, chunk("IHDR", ihdr), ...extra, chunk("IDAT", deflateSync(rows)), chunk("IEND"), trailing);
}

const segment = (marker: number, data: Uint8Array) => join(Uint8Array.of(0xff, marker), be16(data.length + 2), data);

/** JPEG structure (not a decodable picture: the tests here are about segments, the browser check decodes real ones). */
function jpeg(width: number, height: number, extra: Uint8Array[] = [], trailing = new Uint8Array()) {
  const frame = join(Uint8Array.of(8), be16(height), be16(width), Uint8Array.of(1, 1, 0x11, 0));
  const scan = Uint8Array.of(0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56);
  return join(
    Uint8Array.of(0xff, 0xd8),
    segment(0xe0, join(ascii("JFIF\0"), Uint8Array.of(1, 1, 0, 0, 1, 0, 1, 0, 0))),
    ...extra,
    segment(0xdb, new Uint8Array(65)),
    segment(0xc0, frame),
    segment(0xda, Uint8Array.of(1, 1, 0, 0, 63, 0)),
    scan,
    Uint8Array.of(0xff, 0xd9),
    trailing
  );
}

const latin1 = (bytes: Uint8Array) => Array.from(bytes, (b) => String.fromCharCode(b)).join("");
const contains = (haystack: Uint8Array, needle: string) => latin1(haystack).includes(needle);
const PDF = ascii("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n");

describe("file type detection", () => {
  it("names the format from the signature, not from what the browser said", () => {
    expect(sniffFileType(png(64, 64))).toBe("image/png");
    expect(sniffFileType(jpeg(64, 64))).toBe("image/jpeg");
    expect(sniffFileType(PDF)).toBe("application/pdf");
    expect(sniffFileType(ascii("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"))).toBeNull();
    expect(sniffFileType(ascii("GIF89a"))).toBeNull();
    expect(sniffFileType(new Uint8Array())).toBeNull();
  });
});

describe("image cleaning", () => {
  it("reads the size of a PNG and drops text, EXIF, time and animation chunks, and anything after the end", () => {
    const dirty = png(
      80,
      64,
      [chunk("tEXt", ascii("Author\0Ana Lima")), chunk("eXIf", ascii("GPS-SECRET")), chunk("tIME", new Uint8Array(7)), chunk("acTL", new Uint8Array(8)), chunk("pHYs", new Uint8Array(9))],
      ascii("HIDDEN-TRAILER")
    );
    const clean = cleanImage(dirty, "image/png")!;
    expect([clean.width, clean.height]).toEqual([80, 64]);
    for (const secret of ["Ana Lima", "GPS-SECRET", "HIDDEN-TRAILER", "tEXt", "eXIf", "tIME", "acTL"]) expect(contains(clean.bytes, secret)).toBe(false);
    // What draws the picture stays, byte for byte.
    expect(contains(clean.bytes, "pHYs")).toBe(true);
    expect(clean.bytes).toEqual(join(PNG_SIGNATURE, ...["IHDR", "pHYs", "IDAT", "IEND"].map((t) => sliceChunk(dirty, t))));
    // A clean file comes back identical.
    expect(cleanImage(png(80, 64), "image/png")!.bytes).toEqual(png(80, 64));
  });

  it("refuses PNGs that are truncated, have no pixel data or do not start with IHDR", () => {
    const good = png(64, 64);
    expect(cleanImage(good.subarray(0, good.length - 5), "image/png")).toBeNull();
    expect(cleanImage(join(PNG_SIGNATURE, chunk("IHDR", join(be32(64), be32(64), Uint8Array.of(8, 0, 0, 0, 0))), chunk("IEND")), "image/png")).toBeNull();
    expect(cleanImage(join(PNG_SIGNATURE, chunk("tEXt", ascii("a\0b")), good.subarray(8)), "image/png")).toBeNull();
    expect(cleanImage(join(PNG_SIGNATURE, be32(0xffffffff), ascii("IHDR")), "image/png")).toBeNull();
    expect(cleanImage(PDF, "image/png")).toBeNull();
  });

  it("reads the size of a JPEG and drops EXIF, XMP, comments and trailing bytes, keeping JFIF, ICC and Adobe", () => {
    const icc = segment(0xe2, join(ascii("ICC_PROFILE\0"), Uint8Array.of(1, 1, 9, 9)));
    const adobe = segment(0xee, ascii("Adobe\0\0\0\0\0\0\0"));
    const dirty = jpeg(
      120,
      90,
      [segment(0xe1, ascii("Exif\0\0GPS-SECRET")), segment(0xe1, ascii("http://ns.adobe.com/xap/1.0/\0XMP-SECRET")), segment(0xe2, ascii("MPF\0OTHER-APP2")), icc, adobe, segment(0xed, ascii("Photoshop IPTC-SECRET")), segment(0xfe, ascii("COMMENT-SECRET"))],
      ascii("HIDDEN-TRAILER")
    );
    const clean = cleanImage(dirty, "image/jpeg")!;
    expect([clean.width, clean.height]).toEqual([120, 90]);
    for (const secret of ["GPS-SECRET", "XMP-SECRET", "OTHER-APP2", "IPTC-SECRET", "COMMENT-SECRET", "HIDDEN-TRAILER"]) expect(contains(clean.bytes, secret)).toBe(false);
    for (const kept of ["JFIF", "ICC_PROFILE", "Adobe"]) expect(contains(clean.bytes, kept)).toBe(true);
    // The scan (with its stuffed byte and restart marker) and the end marker are untouched.
    expect(Array.from(clean.bytes.subarray(-9))).toEqual([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0xff, 0xd9]);
    expect(cleanImage(jpeg(120, 90), "image/jpeg")!.bytes).toEqual(jpeg(120, 90));
  });

  it("keeps only the rotation from a JPEG's EXIF, in either byte order", () => {
    /** EXIF block with a Make tag, the orientation and a GPS pointer, as a phone writes it. */
    const exif = (little: boolean, orientation: number) => {
      const s = (n: number) => (little ? Uint8Array.of(n & 255, n >> 8) : be16(n));
      const l = (n: number) => (little ? Uint8Array.of(n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24) : be32(n));
      const entry = (tag: number, type: number, value: Uint8Array) => join(s(tag), s(type), l(1), value);
      return segment(
        0xe1,
        join(ascii("Exif\0\0"), ascii(little ? "II" : "MM"), s(42), l(8), s(3), entry(0x010f, 2, l(50)), entry(0x0112, 3, join(s(orientation), s(0))), entry(0x8825, 4, l(60)), l(0), ascii("PHONE-MAKE GPS-SECRET"))
      );
    };
    for (const little of [true, false]) {
      const clean = cleanImage(jpeg(120, 90, [exif(little, 6)]), "image/jpeg")!;
      expect(contains(clean.bytes, "GPS-SECRET")).toBe(false);
      expect(contains(clean.bytes, "PHONE-MAKE")).toBe(false);
      // Exactly the 36-byte segment that carries the orientation, right where the EXIF was.
      const at = latin1(clean.bytes).indexOf("Exif");
      expect(Array.from(clean.bytes.subarray(at - 4, at + 32))).toEqual([
        0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0,
      ]);
      // Cleaning again changes nothing (the minimal segment is read back as orientation 6).
      expect(cleanImage(clean.bytes, "image/jpeg")!.bytes).toEqual(clean.bytes);
    }
    // Upright (1), out-of-range or unreadable EXIF leaves no EXIF at all.
    for (const dirty of [exif(true, 1), exif(false, 9), segment(0xe1, ascii("Exif\0\0XX-GARBAGE")), segment(0xe1, join(ascii("Exif\0\0MM"), be16(42), be32(0xfffffff0)))])
      expect(contains(cleanImage(jpeg(120, 90, [dirty]), "image/jpeg")!.bytes, "Exif")).toBe(false);
  });

  it("refuses JPEGs without an end marker, without a scan or with a broken segment length", () => {
    const good = jpeg(64, 64);
    expect(cleanImage(good.subarray(0, good.length - 2), "image/jpeg")).toBeNull();
    expect(cleanImage(join(Uint8Array.of(0xff, 0xd8), segment(0xc0, join(Uint8Array.of(8), be16(64), be16(64), Uint8Array.of(1, 1, 0x11, 0))), Uint8Array.of(0xff, 0xd9)), "image/jpeg")).toBeNull();
    expect(cleanImage(Uint8Array.of(0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2, 3), "image/jpeg")).toBeNull();
    expect(cleanImage(Uint8Array.of(0xff, 0xd8, 0xff, 0xe1, 0x00, 0x01), "image/jpeg")).toBeNull();
    expect(cleanImage(Uint8Array.of(0xff, 0xd8, 0xff), "image/jpeg")).toBeNull();
  });
});

/** The whole chunk of the given type, as it sits in the file. */
function sliceChunk(file: Uint8Array, type: string): Uint8Array {
  for (let at = 8; at < file.length; ) {
    const length = new DataView(file.buffer, file.byteOffset + at).getUint32(0);
    const name = String.fromCharCode(...file.subarray(at + 4, at + 8));
    if (name === type) return file.subarray(at, at + 12 + length);
    at += 12 + length;
  }
  throw new Error(`no ${type} chunk`);
}

describe("file check", () => {
  it("accepts a logo and stores it without metadata", () => {
    const r = checkFile("logo", "image/png", png(128, 128, [chunk("tEXt", ascii("Comment\0secret"))]));
    expect(r.ok && r.type).toBe("image/png");
    expect(r.ok && contains(r.bytes, "secret")).toBe(false);
  });

  it("accepts a PDF document as sent, and refuses it as a logo", () => {
    const r = checkFile("document", "application/pdf", PDF);
    expect(r.ok && r.bytes).toBe(PDF);
    expect(checkFile("logo", "application/pdf", PDF)).toEqual({ ok: false, error: "file_type" });
  });

  it("refuses unknown types, empty and oversized files, and content that is not what it claims", () => {
    expect(checkFile("logo", "image/svg+xml", ascii("<svg/>"))).toEqual({ ok: false, error: "file_type" });
    expect(checkFile("logo", "image/webp", ascii("RIFF0000WEBP"))).toEqual({ ok: false, error: "file_type" });
    expect(checkFile("document", "text/html", ascii("<html>"))).toEqual({ ok: false, error: "file_type" });
    expect(checkFile("document", "application/pdf", new Uint8Array())).toEqual({ ok: false, error: "file_empty" });
    expect(checkFile("logo", "image/png", new Uint8Array(FILE_RULES.logo.maxBytes + 1))).toEqual({ ok: false, error: "file_too_large" });
    expect(checkFile("document", "application/pdf", new Uint8Array(FILE_RULES.document.maxBytes + 1))).toEqual({ ok: false, error: "file_too_large" });
    // An HTML page or a PDF renamed to .png.
    expect(checkFile("logo", "image/png", ascii("<html><script>alert(1)</script></html>"))).toEqual({ ok: false, error: "file_mismatch" });
    expect(checkFile("logo", "image/png", PDF)).toEqual({ ok: false, error: "file_mismatch" });
    expect(checkFile("document", "application/pdf", png(64, 64))).toEqual({ ok: false, error: "file_mismatch" });
    expect(checkFile("logo", "image/jpeg", Uint8Array.of(0xff, 0xd8, 0xff, 0xe0))).toEqual({ ok: false, error: "file_invalid" });
  });

  it("limits the pixel size of images (a tiny file can still decode to a huge picture)", () => {
    expect(checkFile("logo", "image/png", png(63, 64))).toEqual({ ok: false, error: "image_too_small" });
    expect(checkFile("logo", "image/png", png(64, 64)).ok).toBe(true);
    expect(checkFile("logo", "image/jpeg", jpeg(1024, 1024)).ok).toBe(true);
    expect(checkFile("logo", "image/jpeg", jpeg(1025, 64))).toEqual({ ok: false, error: "image_too_large" });
    // The header alone claims the size: no pixel data is needed to be refused.
    const bomb = join(PNG_SIGNATURE, chunk("IHDR", join(be32(60000), be32(60000), Uint8Array.of(8, 0, 0, 0, 0))), chunk("IDAT", deflateSync(new Uint8Array(8))), chunk("IEND"));
    expect(checkFile("document", "image/png", bomb)).toEqual({ ok: false, error: "image_too_large" });
    expect(checkFile("document", "image/jpeg", jpeg(8192, 6000)).ok).toBe(true);
  });
});

describe("rules and copy", () => {
  it("has a rule for every kind and a pt-BR sentence for every error", () => {
    for (const kind of FILE_KINDS) {
      expect(FILE_RULES[kind].maxBytes).toBeGreaterThan(0);
      expect(FILE_RULES[kind].types.length).toBeGreaterThan(0);
      for (const code of FILE_ERRORS) expect(fileErrorText(code, kind).length).toBeGreaterThan(10);
    }
    expect(fileErrorText("file_too_large", "logo")).toContain("512 KB");
    expect(fileErrorText("file_too_large", "document")).toContain("5 MB");
    // Only the logo is public, so it is the strictest: raster only, no PDF.
    expect(FILE_RULES.logo.types).toEqual(["image/png", "image/jpeg"]);
    expect(FILE_RULES.logo.maxCount).toBe(1);
  });

  it("names downloads without the original file name", () => {
    expect(fileDownloadName({ kind: "logo", contentType: "image/png" })).toBe("logo.png");
    expect(fileDownloadName({ kind: "document", contentType: "application/pdf" }, 2)).toBe("documento-2.pdf");
    expect(fileDownloadName({ kind: "document", contentType: "image/jpeg" }, 5)).toBe("documento-5.jpg");
  });

  it("lets files change until the application is published", () => {
    for (const s of ["submitted", "under_review", "changes_requested", "rejected"]) expect(filesEditable(s)).toBe(true);
    expect(filesEditable("published")).toBe(false);
    expect(filesEditable("anything")).toBe(false);
  });
});
