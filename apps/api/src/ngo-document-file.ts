/** PROPOSTA: bounded type/header checks only, never a PDF sanitizer or malware scanner. */
import { HttpError } from "./http";
import { MAX_PHOTO_BYTES, photoBytes } from "./ngo-photo-image";

export function documentBytes(data: unknown, contentType: unknown): Uint8Array {
  if (contentType === "image/png" || contentType === "image/jpeg") {
    try { return photoBytes(data, contentType); }
    catch (error) {
      if (error instanceof HttpError) throw new HttpError(error.status, error.status === 413 ? "document_too_large" : "invalid_document");
      throw error;
    }
  }
  if (contentType !== "application/pdf") throw new HttpError(400, "invalid_document");
  if (typeof data !== "string" || data.length > 4 * Math.ceil(MAX_PHOTO_BYTES / 3)) throw new HttpError(413, "document_too_large");
  if (!data.length || data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new HttpError(400, "invalid_document");
  let decoded: string;
  try { decoded = atob(data); } catch { throw new HttpError(400, "invalid_document"); }
  if (btoa(decoded) !== data) throw new HttpError(400, "invalid_document");
  if (decoded.length > MAX_PHOTO_BYTES) throw new HttpError(413, "document_too_large");
  if (!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(decoded.slice(0, 10)) || !/%%EOF[\t\n\r ]*$/.test(decoded.slice(-1024)))
    throw new HttpError(400, "invalid_document");
  return Uint8Array.from(decoded, (c) => c.charCodeAt(0));
}
