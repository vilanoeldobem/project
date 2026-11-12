/**
 * Moderation actions on the house of a published NGO (IMPL-0021): what is offered follows `/config` and what the
 * application has; nothing is sent before the confirmation; the revision sent is the one that was read; a
 * `stale_revision` reads again and asks again; a refusal is told with its sentence. Fake API, no browser.
 */
import { describe, expect, it, type Mock, vi } from "vitest";

import type { ApplicationDetail } from "@vila/shared/accounts/contract";
import { ApiError } from "@vila/shared/accounts/errors";

import type { GalleryPhoto } from "./api";
import { availableActions, createNgoModeration, type NgoModerationDeps, refusalText, withdrawMessageFits } from "./ngo-moderation";

const NGO = "3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b";
const PHOTO = "aaaaaaaa-0000-4000-8000-0000000000aa";
const MESSAGE = "A organização pediu para sair da Vila.";

const DETAIL: ApplicationDetail = {
  application: {
    id: NGO,
    name: "Associação Exemplo",
    cnpj: "11222333000181",
    openedOn: "2020-03-10",
    city: "São Paulo",
    declarations: { activeCnpj: true, oneYear: true, fundsConfirmable: true },
    fundsConfirmation: "Extratos mensais da conta da organização.",
    summary: "Apoio escolar para crianças do bairro.",
    description: "Reforço escolar, leitura e atividades culturais no contraturno.",
    tags: ["children", "education"],
    projects: [],
    lotId: "plaza-03",
    status: "published",
    revision: 4,
    reviewNote: null,
    createdAt: "2026-11-10T12:00:00.000Z",
    updatedAt: "2026-11-11T12:00:00.000Z",
  },
  applicant: { nickname: "bia_ong" },
  history: [],
  files: [{ id: "aaaaaaaa-0000-4000-8000-000000000001", kind: "logo", contentType: "image/png", size: 186_368, createdAt: "2026-11-10T12:05:00.000Z" }],
};
const GALLERY: GalleryPhoto[] = [{ id: PHOTO, url: `/ngos/${NGO}/photos/${PHOTO}`, caption: "Sala de leitura", position: 0 }];

const withRevision = (revision: number, over: Partial<ApplicationDetail> = {}): ApplicationDetail => ({ ...DETAIL, ...over, application: { ...DETAIL.application, revision } });

type Api = NgoModerationDeps["api"];

/** A fake admin API whose application can change between reads. */
function page(over: Partial<{ [K in keyof Api]: Mock<Api[K]> }> = {}, flags = { files: true, withdrawal: true }) {
  let detail = DETAIL;
  let clock = 5_000;
  const api = {
    adminApplication: vi.fn(async () => detail),
    adminPhotos: vi.fn(async () => ({ photos: [{ id: PHOTO, status: "approved", revision: 2 }] })),
    adminRemoveLogo: vi.fn(async () => ({})),
    adminRemovePhoto: vi.fn(async () => ({})),
    adminWithdraw: vi.fn(async () => ({})),
    ...over,
  };
  const gallery = vi.fn(async (): Promise<GalleryPhoto[] | null> => GALLERY);
  const onChanged = vi.fn();
  const onWithdrawn = vi.fn();
  const moderation = createNgoModeration(NGO, { api, gallery, flags: () => flags, nickname: () => "ana_admin", onChanged, onWithdrawn, now: () => clock });
  return {
    api,
    gallery,
    onChanged,
    onWithdrawn,
    moderation,
    state: () => moderation.store.getState(),
    setDetail: (next: ApplicationDetail) => (detail = next),
    tick: (ms: number) => (clock += ms),
    writes: () => api.adminRemoveLogo.mock.calls.length + api.adminRemovePhoto.mock.calls.length + api.adminWithdraw.mock.calls.length,
  };
}

describe("which actions are offered (only the ones that can work)", () => {
  const state = { detail: DETAIL, photos: [{ ...GALLERY[0], revision: 2 }] };
  const names = (can: ReturnType<typeof availableActions>) => [can.logo && "logo", can.withdraw && "withdraw", can.photos.length > 0 && "photos"].filter(Boolean);

  it("follows /config: files for the logo, withdrawal for the withdrawal", () => {
    expect(names(availableActions(state, { files: true, withdrawal: true }, "ana_admin"))).toEqual(["logo", "withdraw", "photos"]);
    expect(names(availableActions(state, { files: false, withdrawal: true }, "ana_admin"))).toEqual(["withdraw", "photos"]);
    expect(names(availableActions(state, { files: true, withdrawal: false }, "ana_admin"))).toEqual(["logo", "photos"]);
    expect(names(availableActions({ ...state, photos: [] }, { files: false, withdrawal: false }, "ana_admin"))).toEqual([]);
  });

  it("offers no logo removal without a logo, and no withdrawal of an NGO that is not published", () => {
    expect(names(availableActions({ ...state, detail: { ...DETAIL, files: [] } }, { files: true, withdrawal: true }, "ana_admin"))).toEqual(["withdraw", "photos"]);
    const withdrawn = { ...DETAIL, application: { ...DETAIL.application, status: "withdrawn" as const } };
    expect(names(availableActions({ ...state, detail: withdrawn }, { files: true, withdrawal: true }, "ana_admin"))).toEqual(["logo", "photos"]);
  });

  it("offers nothing before the application is read, to its own responsible, or while the responsible's account is being erased", () => {
    const all = { files: true, withdrawal: true };
    expect(names(availableActions({ detail: null, photos: state.photos }, all, "ana_admin"))).toEqual([]);
    expect(names(availableActions(state, all, "Bia_ONG"))).toEqual([]);
    expect(names(availableActions({ ...state, detail: { ...DETAIL, applicant: { nickname: "bia_ong", deletionPending: true } } }, all, "ana_admin"))).toEqual([]);
  });

  it("shows only gallery photos the village shows that the admin API confirms as approved", async () => {
    const p = page({ adminPhotos: vi.fn(async () => ({ photos: [{ id: PHOTO, status: "pending", revision: 2 }] })) });
    await p.moderation.load();
    expect(p.state().photos).toEqual([]);

    const q = page();
    await q.moderation.load();
    expect(q.state().photos).toEqual([{ ...GALLERY[0], revision: 2 }]);

    // Photos off in the API: the public gallery is empty, and the admin list is not even read.
    const off = page();
    off.gallery.mockResolvedValue([]);
    await off.moderation.load();
    expect(off.state()).toMatchObject({ status: "ready", photos: [] });
    expect(off.api.adminPhotos).not.toHaveBeenCalled();
  });

  it("says so when the application cannot be read, and offers nothing", async () => {
    const p = page({ adminApplication: vi.fn(async () => Promise.reject(new ApiError(0, "network"))) });
    await p.moderation.load();
    expect(p.state()).toMatchObject({ status: "failed", detail: null, notice: { tone: "error", text: "Sem conexão com a Vila. Tente de novo em instantes." } });
  });
});

describe("confirmation step", () => {
  it("sends nothing when the action is asked: it reads the application again and opens the step", async () => {
    const p = page();
    await p.moderation.load();
    expect(p.api.adminApplication).toHaveBeenCalledTimes(1);
    await p.moderation.ask({ kind: "logo" });
    expect(p.api.adminApplication).toHaveBeenCalledTimes(2);
    expect(p.state().asking).toEqual({ action: { kind: "logo" }, at: 5_000 });
    expect(p.writes()).toBe(0);
    p.moderation.cancel();
    expect(p.state().asking).toBeNull();
    expect(p.writes()).toBe(0);
    // Confirming with no step open does nothing either.
    await p.moderation.confirm();
    expect(p.writes()).toBe(0);
  });

  it("removes the logo with the revision that was read, tells the result and refreshes the village", async () => {
    const p = page();
    await p.moderation.load();
    await p.moderation.ask({ kind: "logo" });
    p.setDetail(withRevision(5, { files: [] })); // what the API shows after the removal
    await p.moderation.confirm();
    expect(p.api.adminRemoveLogo).toHaveBeenCalledExactlyOnceWith(NGO, 4);
    expect(p.onChanged).toHaveBeenCalledTimes(1);
    expect(p.state()).toMatchObject({ asking: null, busy: false, notice: { tone: "ok", text: "Logo de Associação Exemplo removido." } });
    expect(p.state().detail?.application.revision).toBe(5);
    expect(availableActions(p.state(), { files: true, withdrawal: true }, "ana_admin").logo).toBe(false);
  });

  it("removes a gallery photo with the photo's own revision", async () => {
    const p = page();
    await p.moderation.load();
    await p.moderation.ask({ kind: "photo", photoId: PHOTO });
    await p.moderation.confirm();
    expect(p.api.adminRemovePhoto).toHaveBeenCalledExactlyOnceWith(PHOTO, 2);
    expect(p.onChanged).toHaveBeenCalledTimes(1);
    expect(p.state().notice).toEqual({ tone: "ok", text: "Foto removida da galeria de Associação Exemplo." });
  });

  it("withdraws the NGO with the message to the organisation, and tells it outside the panel too", async () => {
    const p = page();
    await p.moderation.load();
    await p.moderation.ask({ kind: "withdraw" });
    await p.moderation.confirm(`  ${MESSAGE}  `);
    expect(p.api.adminWithdraw).toHaveBeenCalledExactlyOnceWith(NGO, 4, MESSAGE);
    expect(p.onChanged).toHaveBeenCalledTimes(1);
    expect(p.onWithdrawn).toHaveBeenCalledExactlyOnceWith("Associação Exemplo foi retirada da Vila: a casa saiu e o terreno foi liberado.");
  });

  it("does not send a withdrawal without its message", async () => {
    const p = page();
    await p.moderation.load();
    await p.moderation.ask({ kind: "withdraw" });
    for (const text of ["", "   ", "curta", "x".repeat(1001)]) {
      await p.moderation.confirm(text);
      expect([text.length, withdrawMessageFits(text)]).toEqual([text.length, false]);
    }
    expect(p.api.adminWithdraw).not.toHaveBeenCalled();
    expect(p.state().asking?.action).toEqual({ kind: "withdraw" });
    expect(p.state().messageError).toContain("10 a 1000 caracteres");
  });

  it("is single flight: a second confirmation while the first is in flight sends nothing", async () => {
    let release!: () => void;
    const p = page({ adminRemoveLogo: vi.fn(() => new Promise((resolve) => (release = () => resolve({})))) });
    await p.moderation.load();
    await p.moderation.ask({ kind: "logo" });
    const first = p.moderation.confirm();
    expect(p.state().busy).toBe(true);
    await p.moderation.confirm();
    p.moderation.cancel(); // cannot be cancelled once sent
    expect(p.state().asking).not.toBeNull();
    release();
    await first;
    expect(p.api.adminRemoveLogo).toHaveBeenCalledTimes(1);
  });

  it("does not open the step when the action stopped being possible meanwhile", async () => {
    const p = page();
    await p.moderation.load();
    p.setDetail({ ...DETAIL, files: [] }); // another administrator removed the logo meanwhile
    await p.moderation.ask({ kind: "logo" });
    expect(p.state().asking).toBeNull();
    expect(p.state().notice?.tone).toBe("info");
    expect(p.writes()).toBe(0);
  });
});

describe("stale_revision", () => {
  it("reads the application again and asks again: nothing is resent without a new confirmation", async () => {
    let refuse = true;
    const p = page({
      adminRemoveLogo: vi.fn(async () => {
        if (refuse) throw new ApiError(409, "stale_revision");
        return {};
      }),
    });
    await p.moderation.load();
    await p.moderation.ask({ kind: "logo" });
    p.setDetail(withRevision(5)); // the organisation changed something meanwhile
    p.tick(3_000);
    await p.moderation.confirm();
    expect(p.api.adminRemoveLogo).toHaveBeenCalledExactlyOnceWith(NGO, 4);
    // Read again, the step is asked again (re-armed at the new instant), with the reason; nothing was resent.
    expect(p.state().detail?.application.revision).toBe(5);
    expect(p.state().asking).toEqual({ action: { kind: "logo" }, at: 8_000 });
    expect(p.state().notice).toEqual({ tone: "info", text: "A candidatura mudou enquanto esta tela estava aberta. Confira a versão atual e confirme de novo." });
    expect(p.onChanged).not.toHaveBeenCalled();

    refuse = false;
    await p.moderation.confirm();
    expect(p.api.adminRemoveLogo).toHaveBeenLastCalledWith(NGO, 5);
    expect(p.api.adminRemoveLogo).toHaveBeenCalledTimes(2);
    expect(p.state().notice?.tone).toBe("ok");
    expect(p.onChanged).toHaveBeenCalledTimes(1);
  });

  it("does not ask again when the newer version no longer has what the action was about", async () => {
    const p = page({ adminRemoveLogo: vi.fn(async () => Promise.reject(new ApiError(409, "stale_revision"))) });
    await p.moderation.load();
    await p.moderation.ask({ kind: "logo" });
    p.setDetail(withRevision(5, { files: [] }));
    await p.moderation.confirm();
    expect(p.state().asking).toBeNull();
    expect(p.state().notice?.tone).toBe("error");
  });
});

describe("refusals", () => {
  it("closes the step and shows the sentence of the refusal", async () => {
    const cases: Array<[ApiError, string]> = [
      [new ApiError(403, "self_review"), "Você é responsável por esta organização: outro administrador precisa fazer esta ação."],
      [new ApiError(403, "admin_only"), "Esta ação é só para administradores. Seu papel pode ter mudado; atualize a página."],
      [new ApiError(409, "application_withdrawn"), "Esta organização foi retirada da Vila pela administração. Não é possível enviar arquivos, reenviar a candidatura nem registrar novas decisões."],
      [new ApiError(0, "network"), "Sem conexão com a Vila. Tente de novo em instantes."],
      [new ApiError(404, "not_found"), "Isto não está mais disponível: pode já ter sido removido, ou a função está desligada."],
    ];
    for (const [error, sentence] of cases) {
      const p = page({ adminWithdraw: vi.fn(async () => Promise.reject(error)) });
      await p.moderation.load();
      await p.moderation.ask({ kind: "withdraw" });
      await p.moderation.confirm(MESSAGE);
      expect([error.code, p.state().notice]).toEqual([error.code, { tone: "error", text: sentence }]);
      expect(p.state().asking).toBeNull();
      expect(p.onChanged).not.toHaveBeenCalled();
      expect(p.onWithdrawn).not.toHaveBeenCalled();
    }
  });

  it("keeps the step open with the API's sentence when it refuses the message", async () => {
    const sentence = "Escreva a mensagem para a organização (10 a 1000 caracteres). Ela lê este texto.";
    const p = page({ adminWithdraw: vi.fn(async () => Promise.reject(new ApiError(400, "reason_required", { reason: sentence }))) });
    await p.moderation.load();
    await p.moderation.ask({ kind: "withdraw" });
    await p.moderation.confirm(MESSAGE);
    expect(p.state().asking?.action).toEqual({ kind: "withdraw" });
    expect(p.state().messageError).toBe(sentence);
  });

  it("refreshes the village when the logo is gone but its stored file is not deleted yet", async () => {
    const p = page({ adminRemoveLogo: vi.fn(async () => Promise.reject(new ApiError(503, "file_cleanup_pending"))) });
    await p.moderation.load();
    await p.moderation.ask({ kind: "logo" });
    await p.moderation.confirm();
    expect(p.onChanged).toHaveBeenCalledTimes(1);
    expect(p.state().notice).toEqual({ tone: "error", text: refusalText(new ApiError(503, "file_cleanup_pending")) });
    expect(p.state().notice?.text).toContain("já saiu da Vila");
  });
});
