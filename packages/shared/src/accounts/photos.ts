/** Institutional gallery (IMPL-0018, PROPOSTA), distinct from the application's single logo. */
import { cleanImage, type FileCheck, sniffFileType } from "./files";

export function checkPhoto(type: string, bytes: Uint8Array): FileCheck {
  if (type !== "image/png" && type !== "image/jpeg") return { ok: false, error: "file_type" };
  if (!bytes.length) return { ok: false, error: "file_empty" };
  if (bytes.length > 2 * 1024 * 1024) return { ok: false, error: "file_too_large" };
  if (sniffFileType(bytes) !== type) return { ok: false, error: "file_mismatch" };
  const image = cleanImage(bytes, type);
  if (!image) return { ok: false, error: "file_invalid" };
  if (image.width > 4096 || image.height > 4096 || image.width * image.height > 16_000_000) return { ok: false, error: "image_too_large" };
  return { ok: true, type, bytes: image.bytes };
}
