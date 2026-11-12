/**
 * Files of an NGO application on the client (IMPL-0017, PROPOSTA): the pure helpers of the applicant's panel
 * (`./files`), the `/config.files` flag and the file calls of the API client (`./account`).
 * Runs in Node with a stubbed `fetch`, `localStorage` and `window`, like `account.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@vila/shared/accounts/errors";
import { type ApplicationFile, FILE_RULES } from "@vila/shared/accounts/files";

import { checkUpload, fileAccept, fileFailure, fileHint, fileSize, filesStale, fileTypeLabel, withFile } from "./files";

const PDF = Uint8Array.from("%PDF-1.4\n%%EOF\n", (c) => c.charCodeAt(0));

/** What the panel reads from a chosen `File`: the type the browser declared, the size and the bytes. */
const chosen = (type: string, bytes: Uint8Array<ArrayBuffer>, size = bytes.length) => ({ type, size, arrayBuffer: vi.fn(async () => bytes.buffer) });

const file = (id: string, kind: ApplicationFile["kind"]): ApplicationFile => ({ id, kind, contentType: kind === "logo" ? "image/png" : "application/pdf", size: 10, createdAt: "2026-11-12T10:00:00.000Z" });

describe("copy built from the shared rules", () => {
  it("writes sizes for people in pt-BR", () => {
    expect(fileSize(35)).toBe("35 bytes");
    expect(fileSize(141_107)).toBe("138 KB");
    expect(fileSize(1024 * 1024 * 1.5)).toBe("1,5 MB");
    expect(fileSize(FILE_RULES.logo.maxBytes)).toBe("512 KB");
    expect(fileSize(FILE_RULES.document.maxBytes)).toBe("5 MB");
  });

  it("takes formats and limits from FILE_RULES", () => {
    expect(fileAccept("logo")).toBe("image/png,image/jpeg");
    expect(fileAccept("document")).toBe("application/pdf,image/png,image/jpeg");
    expect(fileHint("logo")).toBe("PNG ou JPEG, até 512 KB, com 64 a 1024 pixels em cada lado.");
    expect(fileHint("document")).toBe("PDF, PNG ou JPEG, até 5 MB cada. A candidatura pode ter até 5 documentos.");
    expect(fileTypeLabel("application/pdf")).toBe("PDF");
  });
});

describe("checkUpload (before anything is sent)", () => {
  it("accepts a PDF as a document and returns its bytes", async () => {
    await expect(checkUpload("document", chosen("application/pdf", PDF))).resolves.toEqual({ ok: true, type: "application/pdf", bytes: PDF });
  });

  it("refuses a PDF as a logo, an empty file and a file whose bytes are not what it says", async () => {
    await expect(checkUpload("logo", chosen("application/pdf", PDF))).resolves.toEqual({ ok: false, error: "file_type" });
    await expect(checkUpload("document", chosen("application/pdf", new Uint8Array()))).resolves.toEqual({ ok: false, error: "file_empty" });
    await expect(checkUpload("logo", chosen("image/png", PDF))).resolves.toEqual({ ok: false, error: "file_mismatch" });
    // The browser knows no type for the file (unknown extension).
    await expect(checkUpload("document", chosen("", PDF))).resolves.toEqual({ ok: false, error: "file_type" });
  });

  it("refuses a file over the limit without reading it, type first", async () => {
    const huge = chosen("application/pdf", PDF, FILE_RULES.document.maxBytes + 1);
    await expect(checkUpload("document", huge)).resolves.toEqual({ ok: false, error: "file_too_large" });
    expect(huge.arrayBuffer).not.toHaveBeenCalled();

    const wrong = chosen("application/pdf", PDF, FILE_RULES.logo.maxBytes + 1);
    await expect(checkUpload("logo", wrong)).resolves.toEqual({ ok: false, error: "file_type" });
    expect(wrong.arrayBuffer).not.toHaveBeenCalled();
  });
});

describe("list and errors", () => {
  it("puts a new logo in the place of the old one and a new document last", () => {
    const files = [file("l1", "logo"), file("d1", "document")];
    expect(withFile(files, file("l2", "logo")).map((f) => f.id)).toEqual(["l2", "d1"]);
    expect(withFile(files, file("d2", "document")).map((f) => f.id)).toEqual(["l1", "d1", "d2"]);
    expect(withFile([file("d1", "document")], file("l1", "logo")).map((f) => f.id)).toEqual(["l1", "d1"]);
  });

  it("shows the API's sentence about the file, else the sentence of the error code", () => {
    expect(fileFailure(new ApiError(413, "file_too_large", { file: "O arquivo passa do limite de 512 KB." }))).toBe("O arquivo passa do limite de 512 KB.");
    expect(fileFailure(new ApiError(409, "application_locked"))).toBe("Os arquivos não podem ser alterados agora: a candidatura está em análise ou a organização já foi publicada.");
    expect(fileFailure(new ApiError(0, "network"))).toBe("Sem conexão com a Vila. Tente de novo em instantes.");
  });

  it("asks for a reload only when the application or its files changed elsewhere", () => {
    for (const code of ["application_changed", "application_locked", "application_withdrawn", "too_many_files", "not_found"]) expect(filesStale(new ApiError(409, code))).toBe(true);
    for (const code of ["file_too_large", "too_many_requests", "network", "account_changed"]) expect(filesStale(new ApiError(400, code))).toBe(false);
    expect(filesStale(new Error("boom"))).toBe(false);
  });
});

describe("API client", () => {
  const USER = { id: "u1", name: "Ana Lima", nickname: "ana_lima", city: "Recife", email: "ana@example.com", role: "player" as const };
  const STORED: ApplicationFile = { id: "f1", kind: "logo", contentType: "image/png", size: 3, createdAt: "2026-11-12T10:00:00.000Z" };
  type Call = { method: string; url: string; headers: Record<string, string>; credentials?: RequestCredentials; body: unknown };
  let calls: Call[];

  /** A page with `u1` signed in; `answer` gives the response of every call after the start-up ones. */
  async function page(config: object, answer: (call: Call) => Response = () => new Response("{}")) {
    const storage = new Map<string, string>();
    calls = [];
    vi.stubGlobal("localStorage", { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v), removeItem: (k: string) => void storage.delete(k) });
    vi.stubGlobal("window", { addEventListener: () => undefined, removeEventListener: () => undefined });
    vi.stubGlobal("location", { hash: "", search: "", hostname: "play.example", pathname: "/" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const path = new URL(url).pathname;
        if (path === "/config") return Response.json(config);
        if (path === "/me") return Response.json({ user: USER });
        if (path.startsWith("/progress")) return Response.json({ progress: { xp: 0, counters: {}, completed: {}, seen: {} } });
        const call = { method: init.method ?? "GET", url, headers: init.headers as Record<string, string>, credentials: init.credentials, body: init.body };
        calls.push(call);
        return answer(call);
      })
    );
    vi.resetModules();
    const account = await import("./account");
    await account.initAccount();
    return account;
  }

  afterEach(() => vi.unstubAllGlobals());

  it("turns files on only when /config says so (an older API has no such field)", async () => {
    expect((await page({ accounts: true, quests: false, files: true })).useAccount.getState().files).toBe(true);
    expect((await page({ accounts: true, quests: false, files: false })).useAccount.getState().files).toBe(false);
    expect((await page({ accounts: true, quests: false })).useAccount.getState().files).toBe(false);
    expect((await page({ accounts: false, files: true })).useAccount.getState().files).toBe(false);
  });

  it("uploads the raw bytes with their type and the account in a header", async () => {
    const { api } = await page({ accounts: true, files: true }, () => Response.json({ file: STORED, revision: 2 }, { status: 201 }));
    await expect(api.uploadFile("logo", "image/png", Uint8Array.of(1, 2, 3))).resolves.toEqual({ file: STORED, revision: 2 });
    const [call] = calls;
    expect(call.method).toBe("POST");
    expect(call.url).toBe("http://localhost:8787/ngo/application/files?kind=logo");
    expect(call.credentials).toBe("include");
    expect(call.headers).toEqual({ Accept: "application/json", "Content-Type": "image/png", "X-Vila-Account": "u1" });
    expect(call.body).toEqual(Uint8Array.of(1, 2, 3));
  });

  it("maps a refused upload to ApiError with the status, the code and the file message", async () => {
    const message = "A imagem pode ter no máximo 1024 × 1024 pixels.";
    const { api, ApiError: PageError } = await page({ accounts: true, files: true }, () => Response.json({ error: "image_too_large", fields: { file: message } }, { status: 400 }));
    const refused = await api.uploadFile("logo", "image/jpeg", Uint8Array.of(1)).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(PageError);
    expect(refused).toMatchObject({ status: 400, code: "image_too_large", fields: { file: message } });
  });

  it("deletes with the account in a header and returns the new revision", async () => {
    const { api } = await page({ accounts: true, files: true }, () => Response.json({ revision: 3 }));
    await expect(api.deleteFile("f1")).resolves.toEqual({ revision: 3 });
    const [call] = calls;
    expect(call.method).toBe("DELETE");
    expect(call.url).toBe("http://localhost:8787/ngo/application/files/f1");
    expect(call.credentials).toBe("include");
    expect(call.headers).toEqual({ Accept: "application/json", "X-Vila-Account": "u1" });
    expect(call.body).toBeUndefined();
  });

  it("reads a file as a Blob with the session, and an error answer as ApiError", async () => {
    let { api } = await page({ accounts: true, files: true }, () => new Response(Uint8Array.of(1, 2, 3), { headers: { "Content-Type": "image/png" } }));
    const blob = await api.fileBlob("f1");
    expect(blob.type).toBe("image/png");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(Uint8Array.of(1, 2, 3));
    expect(calls[0]).toMatchObject({ method: "GET", url: "http://localhost:8787/ngo/application/files/f1", credentials: "include" });

    ({ api } = await page({ accounts: true, files: true }, () => Response.json({ error: "not_found" }, { status: 404 })));
    await expect(api.fileBlob("f1")).rejects.toMatchObject({ status: 404, code: "not_found" });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    await expect(api.fileBlob("f1")).rejects.toMatchObject({ status: 0, code: "network" });
  });

  it("returns the application with its files, and without them from an older API", async () => {
    let { api } = await page({ accounts: true, files: true }, () => Response.json({ application: null, files: [STORED] }));
    expect((await api.application()).files).toEqual([STORED]);
    ({ api } = await page({ accounts: true }, () => Response.json({ application: null })));
    expect((await api.application()).files).toBeUndefined();
  });

  it("fetches a public logo without credentials and gives null for anything that is not an image", async () => {
    await page({ accounts: true, files: true }, () => new Response(Uint8Array.of(1, 2), { headers: { "Content-Type": "image/png" } }));
    const { fetchLogo } = await import("./api");
    expect((await fetchLogo("/ngos/n1/logo?v=abc"))?.size).toBe(2);
    expect(calls[0].url).toBe("http://localhost:8787/ngos/n1/logo?v=abc");
    expect(calls[0].credentials).toBeUndefined();

    await page({ accounts: true, files: true }, () => Response.json({ error: "not_found" }, { status: 404 }));
    expect(await (await import("./api")).fetchLogo("/ngos/n1/logo")).toBeNull();
    await page({ accounts: true, files: true }, () => Response.json({ ok: true }));
    expect(await (await import("./api")).fetchLogo("/ngos/n1/logo")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    expect(await (await import("./api")).fetchLogo("/ngos/n1/logo")).toBeNull();
  });
});
