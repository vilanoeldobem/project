/**
 * Files of an NGO application in the game (IMPL-0017, PROPOSTA): what the applicant's panel needs on top of the
 * shared rules (`@vila/shared/accounts/files`). Pure: no DOM, no network. Every limit in the copy comes from
 * `FILE_RULES`.
 */
import { ApiError, errorText } from "@vila/shared/accounts/errors";
import { type ApplicationFile, checkFile, type FileCheck, type FileKind, FILE_RULES, type FileType } from "@vila/shared/accounts/files";

const TYPE_LABEL: Record<FileType, string> = { "image/png": "PNG", "image/jpeg": "JPEG", "application/pdf": "PDF" };
export const fileTypeLabel = (type: FileType): string => TYPE_LABEL[type];

/** Size for people, pt-BR: "35 bytes", "138 KB", "1,5 MB". */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  const mega = bytes >= 1024 * 1024;
  return `${(bytes / (mega ? 1024 * 1024 : 1024)).toLocaleString("pt-BR", { maximumFractionDigits: mega ? 1 : 0 })} ${mega ? "MB" : "KB"}`;
}

/** Value of the file input's `accept` for a kind. */
export const fileAccept = (kind: FileKind): string => FILE_RULES[kind].types.join(",");

/** What a file of this kind may be, for the hint under its input. */
export function fileHint(kind: FileKind): string {
  const rule = FILE_RULES[kind];
  const labels = rule.types.map(fileTypeLabel);
  const formats = `${labels.slice(0, -1).join(", ")} ou ${labels[labels.length - 1]}, até ${fileSize(rule.maxBytes)}`;
  return kind === "logo" ? `${formats}, com ${rule.minSide} a ${rule.maxSide} pixels em cada lado.` : `${formats} cada. A candidatura pode ter até ${rule.maxCount} documentos.`;
}

/**
 * The shared check on a file chosen in the browser, before any upload (the API repeats it and stays the
 * authority). A file over the limit is refused by its size alone, without reading it into memory.
 */
export async function checkUpload(kind: FileKind, file: Pick<Blob, "type" | "size" | "arrayBuffer">): Promise<FileCheck> {
  if (file.size > FILE_RULES[kind].maxBytes) {
    // `checkFile` judges the type before the size: keep its order.
    const type = checkFile(kind, file.type, new Uint8Array());
    return !type.ok && type.error === "file_type" ? type : { ok: false, error: "file_too_large" };
  }
  return checkFile(kind, file.type, new Uint8Array(await file.arrayBuffer()));
}

/** The list after an upload: a logo takes the place of the previous one, a document goes last. */
export const withFile = (files: ApplicationFile[], file: ApplicationFile): ApplicationFile[] =>
  file.kind === "logo" ? [file, ...files.filter((f) => f.kind !== "logo")] : [...files, file];

/** The sentence for a refused file change: the API's message about the file when there is one. */
export const fileFailure = (e: unknown): string => (e instanceof ApiError && e.fields.file ? e.fields.file : errorText(e));

/** Refusals that mean the application or its files changed elsewhere (another tab, an admin decision): read them again. */
const STALE = new Set(["application_changed", "application_locked", "application_withdrawn", "no_application", "too_many_files", "not_found"]);
export const filesStale = (e: unknown): boolean => e instanceof ApiError && STALE.has(e.code);
