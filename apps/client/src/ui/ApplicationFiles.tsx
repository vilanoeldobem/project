/**
 * Files of the applicant's own NGO application (IMPL-0017, PROPOSTA): the logo and optional documents, shown only
 * while the API has uploads on. The list of documents an NGO must send is PENDENTE (PEN-019): nothing here names,
 * requires or suggests one. Files have no name (the original one may carry personal data): documents are numbered.
 * The bytes of a file live only inside a call here: never in a store, never logged.
 */
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import type { ApplicationStatus } from "@vila/shared/accounts/contract";
import { type ApplicationFile, fileDownloadName, fileErrorText, type FileKind, FILE_RULES, filesEditable } from "@vila/shared/accounts/files";

import { api, ApiError } from "../lib/account";
import { checkUpload, fileAccept, fileFailure, fileHint, fileSize, filesStale, fileTypeLabel, withFile } from "../lib/files";
import { Field } from "./Account";
import { BlobImage } from "./BlobImage";

/** The applicant's own file, for a preview. Null when it cannot be read. */
const ownFile = (id: string) => api.fileBlob(id).catch(() => null);

/** Hands a file to the browser as a download. The object URL goes away once the download has had time to start. */
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const details = (file: ApplicationFile) => `${fileTypeLabel(file.contentType)} · ${fileSize(file.size)}`;

export function ApplicationFiles({
  status,
  files,
  onChange,
  onStale,
}: {
  status: ApplicationStatus;
  files: ApplicationFile[];
  /** After a change the API accepted: the new list and the application's new revision. */
  onChange: (files: ApplicationFile[], revision: number) => void;
  /** The application or its files changed elsewhere: read them again. */
  onStale: () => Promise<unknown>;
}) {
  const editable = filesEditable(status);
  const logo = files.find((f) => f.kind === "logo");
  const documents = files.filter((f) => f.kind === "document");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<{ at: FileKind | "list"; text: string } | null>(null);
  /** One change at a time, even for two events in the same frame (state would still say "not busy"). */
  const working = useRef(false);
  /** The control that started the change. Disabled while busy, it lost the focus: it gets it back if it is still there. */
  const origin = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const from = origin.current;
    if (busy || !from) return;
    origin.current = null;
    if (from.isConnected && (document.activeElement === document.body || document.activeElement === from)) from.focus();
  }, [busy]);

  const run = async (from: HTMLElement, at: FileKind | "list", change: () => Promise<string>) => {
    if (working.current) return;
    working.current = true;
    origin.current = from;
    setBusy(true);
    setMessage("");
    setError(null);
    try {
      setMessage(await change());
    } catch (e) {
      setError({ at, text: fileFailure(e) });
      if (filesStale(e)) await onStale().catch(() => undefined);
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  const send = (kind: FileKind) => (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    // The browser's own control would keep showing the file name: clear it (the same file can be chosen again).
    input.value = "";
    if (!file) return;
    void run(input, kind, async () => {
      const check = await checkUpload(kind, file);
      // Refused here exactly as the API would refuse it, before anything is sent.
      if (!check.ok) throw new ApiError(400, check.error, { file: fileErrorText(check.error, kind) });
      // Images go without their metadata (place, device): `checkFile` returned them clean.
      const sent = await api.uploadFile(kind, check.type, check.bytes);
      onChange(withFile(files, sent.file), sent.revision);
      return kind === "logo" ? "Logo enviado." : `Documento ${documents.length + 1} enviado.`;
    });
  };

  const remove = (file: ApplicationFile, what: string) => (e: { currentTarget: HTMLElement }) =>
    void run(e.currentTarget, "list", async () => {
      const { revision } = await api.deleteFile(file.id);
      onChange(
        files.filter((f) => f.id !== file.id),
        revision
      );
      return `${what} removido.`;
    });

  const download = (file: ApplicationFile, position: number) => (e: { currentTarget: HTMLElement }) =>
    void run(e.currentTarget, "list", async () => {
      save(await api.fileBlob(file.id), fileDownloadName(file, position));
      return `Documento ${position} baixado.`;
    });

  const at = (where: FileKind | "list") => (error?.at === where ? error.text : undefined);
  const maxDocuments = FILE_RULES.document.maxCount;
  return (
    <section className="files" aria-labelledby="files-title" aria-busy={busy}>
      <h3 id="files-title">Arquivos da candidatura</h3>
      {editable ? (
        <p className="note">Enviar arquivos é opcional. Só você e a administração da Vila veem os documentos. O logo só fica público se a organização for aprovada.</p>
      ) : status === "published" ? (
        <p className="note">
          A organização já foi publicada: os arquivos não podem mais ser alterados. O logo aparece na casa da organização; os documentos continuam visíveis só para você e a
          administração da Vila.
        </p>
      ) : (
        <p className="note">
          A candidatura está em análise: os arquivos ficam travados até a decisão da administração, para que seja analisado exatamente o que você enviou. Se forem pedidos
          ajustes, você poderá alterá-los de novo.
        </p>
      )}

      <h4>Logo</h4>
      {logo ? (
        <div className="file">
          <BlobImage className="logo" source={logo.id} load={ownFile} alt="Logo enviado" />
          <span className="file__name">
            <strong>Logo atual</strong>
            <small>{details(logo)}</small>
          </span>
          {editable && (
            <button type="button" className="btn btn--small" disabled={busy} onClick={remove(logo, "Logo")}>
              Remover logo
            </button>
          )}
        </div>
      ) : (
        <p className="note">Nenhum logo enviado.</p>
      )}
      {editable && (
        <Field label={logo ? "Trocar logo" : "Enviar logo"} hint={fileHint("logo")} error={at("logo")}>
          <input type="file" accept={fileAccept("logo")} disabled={busy} onChange={send("logo")} />
        </Field>
      )}

      <h4>Documentos</h4>
      {documents.length ? (
        <ul className="file-list">
          {documents.map((file, i) => (
            <li key={file.id} className="file">
              <span className="file__name">
                <strong>Documento {i + 1}</strong>
                <small>{details(file)}</small>
              </span>
              <button type="button" className="btn btn--small" disabled={busy} aria-label={`Baixar documento ${i + 1}`} onClick={download(file, i + 1)}>
                Baixar
              </button>
              {editable && (
                <button type="button" className="btn btn--small" disabled={busy} aria-label={`Remover documento ${i + 1}`} onClick={remove(file, `Documento ${i + 1}`)}>
                  Remover
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="note">Nenhum documento enviado.</p>
      )}
      {editable &&
        (documents.length < maxDocuments ? (
          <Field label="Adicionar documento" hint={fileHint("document")} error={at("document")}>
            <input type="file" accept={fileAccept("document")} disabled={busy} onChange={send("document")} />
          </Field>
        ) : (
          <p className="note">A candidatura já tem {maxDocuments} documentos. Remova um para enviar outro.</p>
        ))}

      {at("list") && (
        <p className="form__error" role="alert">
          {at("list")}
        </p>
      )}
      <p className="note" role="status">
        {busy ? "Aguarde…" : message}
      </p>
    </section>
  );
}
