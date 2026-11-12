/**
 * Files of an NGO application as an admin reads them (IMPL-0017). The API audits every read of a document
 * (`ngo.file_read`), so nothing here reads one by itself: a document is fetched when the admin asks for it, once
 * per request, and handed to the browser as a download. Documents are never rendered inside the dashboard.
 */
import { type ApplicationFile, fileDownloadName } from "@vila/shared/accounts/files";

import type { Api } from "./api";

/** How long the object URL of a download lives: long enough for a slow browser to start saving the file. */
export const REVOKE_AFTER_MS = 40_000;

/**
 * Hands bytes to the browser as a download named `name`, through an object URL that is revoked afterwards.
 * `page` is injectable for tests.
 */
export function saveBlob(blob: Blob, name: string, page: Document = document): void {
  const url = URL.createObjectURL(blob);
  const link = page.createElement("a");
  link.href = url;
  link.download = name;
  link.hidden = true;
  page.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}

/** One audited read of a document, saved as "documento-N.ext" (`position` counts the documents from 1). */
export async function downloadDocument(
  api: Pick<Api, "fileBytes">,
  applicationId: string,
  file: ApplicationFile,
  position: number,
  save: (blob: Blob, name: string) => void = saveBlob
): Promise<void> {
  save(await api.fileBytes(applicationId, file.id), fileDownloadName(file, position));
}
