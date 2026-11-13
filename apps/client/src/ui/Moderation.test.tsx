/**
 * What the moderation feature renders (IMPL-0021), server-side, no browser: nothing at all for a signed-out
 * visitor or a non-admin account, nothing while moderation mode is off, only the actions `/config` allows, a
 * confirmation step that names what is acted on, and the blocked-account screen with the two things it still
 * does.
 */
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type ApplicationDetail, type Me, ROLE_LABEL } from "@vila/shared/accounts/contract";

import { CONFIRM_ARM_MS, confirmAllowed } from "../lib/confirm";
import type { NgoModerationState } from "../lib/ngo-moderation";
import { BlockedAccount, blockDate } from "./Account";
import { Confirm } from "./Confirm";
import { RemovedNotice } from "./Environment";
import { dashApplicationUrl, LotModerationView } from "./LotModeration";
import { savedWhere } from "./Missions";
import { ModerationBarView, ModerationChipView, ModerationFlagView } from "./Moderation";

const PLAYER: Me = { id: "u1", name: "Ana Lima", nickname: "ana_lima", city: "Recife", email: "ana@example.com", role: "player" };
const ADMIN: Me = { ...PLAYER, id: "a1", nickname: "ana_admin", role: "admin" };
const BLOCK = { message: "Conta bloqueada por uso indevido do nickname.", at: "2026-11-12T13:00:00.000Z" };
const NGO = "3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b";
const PHOTO = "aaaaaaaa-0000-4000-8000-0000000000aa";

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
/** Everything read, every action possible. */
const READY: NgoModerationState = {
  status: "ready",
  detail: DETAIL,
  photos: [{ id: PHOTO, url: `/ngos/${NGO}/photos/${PHOTO}`, caption: "Sala de leitura", position: 0, revision: 2 }],
  photosFailed: false,
  asking: null,
  busy: false,
  notice: null,
  messageError: "",
};
const ALL = { files: true, withdrawal: true };
/** Accounts that must never get anything: signed out, not an administrator, a blocked administrator. */
const OTHERS: Array<[string, Me | null]> = [
  ["signed out", null],
  ["player", PLAYER],
  ["blocked admin", { ...ADMIN, blocked: BLOCK }],
];

const html = (element: ReactElement) => renderToStaticMarkup(element);
/** Visible text of every button, in order. */
const buttons = (page: string) => [...page.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
const noop = () => {};
/**
 * Zustand's server snapshot is the initial state of the store. To render a component that reads a store, the
 * hook is replaced by one that selects from the current state, as the subscribed browser hook would see it.
 */
const live = <S,>(store: { getState: () => S }) => Object.assign((select?: (s: S) => unknown) => (select ? select(store.getState()) : store.getState()), store);

const lot = (over: { user?: Me | null; on?: boolean; state?: Partial<NgoModerationState>; flags?: typeof ALL; message?: string } = {}) =>
  html(
    <LotModerationView
      on={over.on ?? true}
      user={over.user === undefined ? ADMIN : over.user}
      ngoId={NGO}
      name="Associação Exemplo"
      state={{ ...READY, ...over.state }}
      flags={over.flags ?? ALL}
      message={over.message ?? ""}
      onMessage={noop}
      onAsk={noop}
      onRetry={noop}
      onCancel={noop}
      onConfirm={noop}
    />
  );

const bar = (over: Partial<Parameters<typeof ModerationBarView>[0]> = {}) =>
  html(
    <ModerationBarView
      user={ADMIN}
      on
      presence
      net="online"
      others={2}
      selected={null}
      askedAt={null}
      sending={false}
      notice={null}
      idle
      onOff={noop}
      onNext={noop}
      onClear={noop}
      onAsk={noop}
      onCancel={noop}
      onConfirm={noop}
      {...over}
    />
  );

afterEach(() => {
  vi.doUnmock("../lib/account");
  vi.doUnmock("../lib/moderation");
  vi.doUnmock("./Panel");
  vi.unstubAllGlobals();
});

describe("nobody but an administrator gets anything", () => {
  it("renders no switch, no indicator, no visitor action and no house action for anybody else, even with the mode forced on", () => {
    for (const [who, user] of OTHERS) {
      const pages = [
        html(<ModerationChipView user={user} on onToggle={noop} />),
        html(<ModerationFlagView user={user} on />),
        bar({ user, selected: 9, askedAt: 1 }),
        lot({ user }),
        lot({ user, state: { asking: { action: { kind: "withdraw" }, at: 1 } } }),
      ];
      expect([who, pages]).toEqual([who, ["", "", "", "", ""]]);
    }
  });

  it("gives an administrator the labelled switch, pressed or not", () => {
    const off = html(<ModerationChipView user={ADMIN} on={false} onToggle={noop} />);
    expect(off).toContain('aria-label="Modo moderação"');
    expect(off).toContain('aria-pressed="false"');
    expect(html(<ModerationChipView user={ADMIN} on onToggle={noop} />)).toContain('aria-pressed="true"');
  });

  it("mounts nothing on the lot panel for a visitor or a player, and the section for an administrator in the mode", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    vi.stubGlobal("window", new EventTarget());
    vi.resetModules();
    const account = await import("../lib/account");
    const moderation = await import("../lib/moderation");
    vi.doMock("../lib/account", () => ({ ...account, useAccount: live(account.useAccount) }));
    vi.doMock("../lib/moderation", () => ({ ...moderation, useModeration: live(moderation.useModeration) }));
    const { Lot } = await import("./Lot");
    const info = { id: "plaza-03", state: "published" as const, ngo_id: NGO, ngo_name: "Associação Exemplo", ngo_summary: "Apoio escolar.", ngo_logo: null };
    const panel = () => html(<Lot lotId="plaza-03" info={info} />);
    const clean = (page: string) => !/Moderação|data-moderation|Remover|Retirar|Abrir no painel/.test(page);

    account.useAccount.setState({ enabled: true, files: true, withdrawal: true, presenceModeration: true, user: null });
    moderation.useModeration.setState({ on: true }); // forced: the gate still checks the account
    expect(panel()).toContain("Associação Exemplo");
    expect(clean(panel())).toBe(true);
    account.useAccount.setState({ user: PLAYER });
    moderation.useModeration.setState({ on: true });
    expect(clean(panel())).toBe(true);

    account.useAccount.setState({ user: ADMIN });
    expect(moderation.useModeration.getState().on).toBe(false); // a change of account always ends the mode
    expect(clean(panel())).toBe(true); // an administrator who is just playing sees the public panel
    moderation.useModeration.getState().setOn(true);
    expect(panel()).toContain('data-moderation="ngo"');
    expect(panel()).toContain("Lendo a candidatura desta organização…");
    // A house without a published NGO has nothing to moderate.
    expect(clean(html(<Lot lotId="plaza-04" info={{ id: "plaza-04", state: "available", ngo_id: null, ngo_name: null, ngo_summary: null }} />))).toBe(true);
  });
});

describe("focus when the moderation section leaves an open house", () => {
  it("changes the panel's content key with the section, so the dialog takes the focus the section had", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    vi.stubGlobal("window", new EventTarget());
    vi.resetModules();
    const account = await import("../lib/account");
    const moderation = await import("../lib/moderation");
    vi.doMock("../lib/account", () => ({ ...account, useAccount: live(account.useAccount) }));
    vi.doMock("../lib/moderation", () => ({ ...moderation, useModeration: live(moderation.useModeration) }));
    // The dialog itself needs a browser: here it only shows the key it was given (`Panel` refocuses on its change).
    vi.doMock("./Panel", () => ({
      Status: ({ children }: { children: ReactNode }) => <span>{children}</span>,
      Panel: ({ contentKey, children }: { contentKey?: string; children: ReactNode }) => <div data-content-key={contentKey}>{children}</div>,
    }));
    const { Lot } = await import("./Lot");
    const info = { id: "plaza-03", state: "published" as const, ngo_id: NGO, ngo_name: "Associação Exemplo", ngo_summary: "Apoio escolar.", ngo_logo: null };
    const key = () => /^<div data-content-key="([^"]*)"/.exec(html(<Lot lotId="plaza-03" info={info} />))?.[1];
    const section = () => html(<Lot lotId="plaza-03" info={info} />).includes('data-moderation="ngo"');

    account.useAccount.setState({ enabled: true, files: true, withdrawal: true, user: ADMIN });
    const plain = key();
    expect(section()).toBe(false);
    moderation.useModeration.getState().setOn(true);
    const moderated = key();
    expect(section()).toBe(true);
    expect(moderated).not.toBe(plain);
    // Every way the section leaves while the house is open gives the key of the public panel back.
    const leaves: Array<[string, () => void]> = [
      ["the role was taken away", () => account.useAccount.setState({ user: { ...ADMIN, role: "player" } })],
      ["the account was blocked", () => account.useAccount.setState({ user: { ...ADMIN, blocked: BLOCK } })],
      ["the session ended", () => account.useAccount.setState({ user: null })],
      ["the mode was switched off", () => moderation.useModeration.getState().setOn(false)],
    ];
    for (const [why, leave] of leaves) {
      account.useAccount.setState({ user: ADMIN });
      moderation.useModeration.getState().setOn(true);
      expect([why, key(), section()]).toEqual([why, moderated, true]);
      leave();
      expect([why, key(), section()]).toEqual([why, plain, false]);
    }
  });
});

describe("moderation mode off hides every action", () => {
  it("renders nothing for an administrator while the mode is off", () => {
    expect(html(<ModerationFlagView user={ADMIN} on={false} />)).toBe("");
    expect(bar({ on: false, selected: 9 })).toBe("");
    expect(lot({ on: false })).toBe("");
  });

  it("shows a persistent indicator while it is on, and the way out", () => {
    expect(html(<ModerationFlagView user={ADMIN} on />)).toContain("Modo moderação");
    expect(html(<ModerationFlagView user={ADMIN} on />)).toContain('role="status"');
    const page = bar();
    expect(page).toContain("Modo moderação ligado");
    expect(buttons(page)).toContain("Desligar modo moderação");
  });
});

describe("house of a published NGO: only the actions that can work", () => {
  it("offers logo, withdrawal, photos and the dashboard link when everything is on", () => {
    const page = lot();
    expect(buttons(page)).toEqual(["Remover logo", "Retirar ONG da Vila", "Remover foto"]);
    expect(page).toContain(`<a class="btn btn--small" href="${dashApplicationUrl(NGO)}" target="_blank" rel="noopener">Abrir no painel</a>`);
    expect(dashApplicationUrl(NGO)).toBe(`http://localhost:8797/#applications/${NGO}`);
    expect(page).toContain("versão 4 da candidatura");
    expect(page).toContain('role="status" aria-live="polite"');
  });

  it("follows the flags of /config", () => {
    expect(buttons(lot({ flags: { files: false, withdrawal: true } }))).toEqual(["Retirar ONG da Vila", "Remover foto"]);
    expect(buttons(lot({ flags: { files: true, withdrawal: false } }))).toEqual(["Remover logo", "Remover foto"]);
    const none = lot({ flags: { files: false, withdrawal: false }, state: { photos: [] } });
    expect(buttons(none)).toEqual([]);
    expect(none).toContain("Nenhuma ação de moderação está disponível para esta casa agora.");
    expect(none).toContain("Abrir no painel"); // the full review is always one link away
  });

  it("offers no action before the application is read, or when it could not be read", () => {
    expect(buttons(lot({ state: { status: "loading", detail: null, photos: [] } }))).toEqual([]);
    const failed = lot({ state: { status: "failed", detail: null, photos: [], notice: { tone: "error", text: "Sem conexão com a Vila. Tente de novo em instantes." } } });
    expect(buttons(failed)).toEqual([]);
    expect(failed).toContain('<p class="form__error" role="status" aria-live="polite" data-result="error">Sem conexão com a Vila. Tente de novo em instantes.</p>');
  });

  it("says that the photos could not be read, with a retry, instead of 'no action available'", () => {
    // The gallery has photos but the admin read failed: nothing else can be done on this house either.
    const page = lot({ flags: { files: false, withdrawal: false }, state: { photos: [], photosFailed: true } });
    expect(page).toContain('<p class="form__error" data-state="photos-failed">Não foi possível ler as fotos agora.</p>');
    expect(buttons(page)).toEqual(["Tentar ler as fotos de novo"]);
    expect(page).not.toContain("Nenhuma ação de moderação está disponível");
    // The other actions stay, and the retry waits while something is in flight.
    const rest = lot({ state: { photos: [], photosFailed: true } });
    expect(buttons(rest)).toEqual(["Remover logo", "Retirar ONG da Vila", "Tentar ler as fotos de novo"]);
    expect(lot({ state: { photos: [], photosFailed: true, busy: true } }).match(/<button[^>]*disabled=""/g)).toHaveLength(3);
    // Not shown over a confirmation step, nor to the responsible of the organisation (no photo action for them).
    expect(lot({ state: { photos: [], photosFailed: true, asking: { action: { kind: "logo" }, at: 1 } } })).not.toContain("photos-failed");
    expect(lot({ user: { ...ADMIN, nickname: "bia_ong" }, state: { photos: [], photosFailed: true } })).not.toContain("photos-failed");
  });

  it("offers nothing to the administrator who is responsible for the organisation, and says why", () => {
    const page = lot({ user: { ...ADMIN, nickname: "bia_ong" } });
    expect(buttons(page)).toEqual([]);
    expect(page).toContain("Você é responsável por esta organização");
  });
});

describe("confirmation steps", () => {
  it("names the organisation in the question and on the confirm button, with Cancel first", () => {
    const logo = lot({ state: { asking: { action: { kind: "logo" }, at: 1 } } });
    expect(logo).toContain('role="group" aria-label="Remover o logo de Associação Exemplo?"');
    expect(buttons(logo)).toEqual(["Cancelar", "Remover o logo de Associação Exemplo"]);
    const photo = lot({ state: { asking: { action: { kind: "photo", photoId: PHOTO }, at: 1 } } });
    expect(buttons(photo)).toEqual(["Cancelar", "Remover a foto de Associação Exemplo"]);
    expect(photo).toContain("“Sala de leitura”");
  });

  it("asks for the message to the organisation before a withdrawal can be confirmed", () => {
    const step = { asking: { action: { kind: "withdraw" as const }, at: 1 } };
    const empty = lot({ state: step });
    expect(empty).toContain("PROPOSTA (IMPL-0020)");
    expect(empty).toContain("Mensagem para a organização (obrigatória, de 10 a 1000 caracteres)");
    expect(empty).toContain("A organização lê este texto como foi escrito");
    expect(empty).toMatch(/<button type="button" class="btn btn--primary" disabled="">Retirar Associação Exemplo da Vila<\/button>/);
    const filled = lot({ state: step, message: "A organização pediu para sair da Vila." });
    expect(filled).toMatch(/<button type="button" class="btn btn--primary">Retirar Associação Exemplo da Vila<\/button>/);
    const refused = lot({ state: { ...step, messageError: "Escreva a mensagem para a organização (10 a 1000 caracteres). Ela lê este texto." } });
    expect(refused).toContain('role="alert"');
  });

  it("disables both buttons while the request is in flight", () => {
    const page = lot({ state: { asking: { action: { kind: "logo" }, at: 1 }, busy: true } });
    expect(page.match(/<button[^>]*disabled=""/g)).toHaveLength(2);
    expect(buttons(page)).toEqual(["Cancelar", "Removendo…"]);
  });

  it("cannot be answered by the gesture that opened it: double click, key held down, or too soon", () => {
    const shown = 10_000;
    const later = shown + CONFIRM_ARM_MS;
    expect(confirmAllowed({ detail: 1 }, shown, later)).toBe(true); // a mouse click
    expect(confirmAllowed({ detail: 0 }, shown, later)).toBe(true); // Enter or Space, pressed once
    expect(confirmAllowed({ detail: 2 }, shown, later)).toBe(false); // second click of a double click
    expect(confirmAllowed({ detail: 3 }, shown, later + 5_000)).toBe(false);
    expect(confirmAllowed({ detail: 0, repeat: true }, shown, later)).toBe(false); // Enter held down
    expect(confirmAllowed({ detail: 1 }, shown, later - 1)).toBe(false); // the step has just appeared
    expect(confirmAllowed({ detail: 1 }, shown, shown)).toBe(false);
    expect(CONFIRM_ARM_MS).toBeGreaterThanOrEqual(500);
  });

  it("does not take the focus on its confirm button: the question is the focus target", () => {
    const page = html(<Confirm title="Remover?" confirmLabel="Remover" shownAt={0} onConfirm={noop} onCancel={noop} />);
    expect(page).toMatch(/^<div class="confirm" role="group" aria-label="Remover\?" tabindex="-1"/);
    expect(page).not.toContain("autofocus");
  });
});

describe("visitors of the room (PROPOSTA)", () => {
  it("offers nothing about visitors while /config says moderation.presence is off", () => {
    const page = bar({ presence: false, selected: 9 });
    expect(buttons(page)).toEqual(["Desligar modo moderação"]);
    expect(page).not.toMatch(/[Vv]isitante/);
  });

  it("offers the selection by keyboard, then the removal of the selected visitor", () => {
    expect(buttons(bar())).toEqual(["Selecionar visitante mais próximo", "Desligar modo moderação"]);
    expect(buttons(bar({ others: 0 }))).toEqual(["Desligar modo moderação"]);
    const selected = bar({ selected: 9 });
    expect(selected).toContain("Visitante nº 9");
    expect(buttons(selected)).toEqual(["Remover da sala", "Próximo visitante", "Cancelar seleção", "Desligar modo moderação"]);
  });

  it("asks for a confirmation that names the visitor", () => {
    const page = bar({ selected: 9, askedAt: 1 });
    expect(page).toContain('aria-label="Remover o visitante nº 9 da sala?"');
    expect(buttons(page)).toEqual(["Cancelar", "Remover o visitante nº 9", "Desligar modo moderação"]);
  });

  it("says so when there is no room to moderate, and hides its controls behind an open panel", () => {
    expect(buttons(bar({ net: "offline", selected: 9 }))).toEqual(["Desligar modo moderação"]);
    const behind = bar({ idle: false, selected: 9 });
    expect(buttons(behind)).toEqual([]);
    expect(behind).toContain("Modo moderação ligado");
  });

  it("announces the result in a live region, with the failure told apart", () => {
    const ok = bar({ notice: { ok: true, text: "Visitante nº 9 removido da sala." } });
    expect(ok).toContain('<p class="note" role="status" aria-live="polite" data-result="ok">Visitante nº 9 removido da sala.</p>');
    const failed = bar({ notice: { ok: false, text: "Não foi possível remover agora. A sala não respondeu a tempo." } });
    expect(failed).toContain('<p class="form__error" role="status" aria-live="polite" data-result="failed">Não foi possível remover agora. A sala não respondeu a tempo.</p>');
    expect(bar()).toContain('role="status" aria-live="polite" data-result=""></p>'); // the region exists before any result
  });
});

describe("being removed from the room", () => {
  it("says it calmly, only while the connection is held", async () => {
    vi.resetModules();
    const net = await import("../net/multiplayer");
    vi.doMock("../net/multiplayer", () => ({ ...net, useNet: live(net.useNet) }));
    const { RemovedNotice: Notice } = await import("./Environment");
    vi.doUnmock("../net/multiplayer");
    expect(html(<Notice />)).toBe("");
    net.useNet.setState({ status: "removed" });
    const page = html(<Notice />);
    expect(page).toContain('role="status"');
    expect(page).toContain("Você foi removido da sala por um administrador.");
    expect(page).toContain("Você pode continuar jogando.");
    expect(buttons(page)).toEqual([]);
    for (const status of ["online", "idle", "offline", "connecting", "full", "off"] as const) {
      net.useNet.setState({ status });
      expect([status, html(<Notice />)]).toEqual([status, ""]);
    }
    expect(html(<RemovedNotice />)).toBe(""); // the page's own store starts "off"
  });
});

describe("blocked account (PROPOSTA)", () => {
  const blocked: Me = { ...PLAYER, blocked: BLOCK };

  it("shows that the account is blocked, the message from the administration and its date", () => {
    const page = html(<BlockedAccount user={blocked} />);
    expect(page).toContain('aria-label="Conta bloqueada"');
    expect(page).toContain("A conta @ana_lima está bloqueada pela administração da Vila.");
    expect(page).toContain(`<p data-field="block-message">${BLOCK.message}</p>`);
    expect(blockDate(BLOCK.at)).toBe("12 de novembro de 2026 às 10:00");
    expect(page).toContain("Mensagem da administração · 12 de novembro de 2026 às 10:00");
  });

  it("offers only what still works: sign out and delete the account", () => {
    const page = html(<BlockedAccount user={blocked} />);
    expect(buttons(page)).toEqual(["×", "Sair", "Excluir minha conta"]);
    expect(page).not.toMatch(/<a |<input|<textarea|<details/);
    for (const gone of ["Minha candidatura de ONG", "Editar meus dados", "Continuar", "Abrir painel administrativo", "Salvar"]) expect(page).not.toContain(gone);
  });

  it("stays truthful when the API sent no message or no date", () => {
    const page = html(<BlockedAccount user={{ ...PLAYER, blocked: { message: "", at: "" } }} />);
    expect(page).toContain("<strong>Mensagem da administração</strong>");
    expect(page).toContain("A administração não deixou uma mensagem.");
    expect(blockDate("not a date")).toBe("");
  });

  it("tells a blocked account where its progress is kept, never that it is offline", async () => {
    const OFFLINE = "Sem conexão com a Vila: seu progresso será enviado para a sua conta quando a conexão voltar.";
    const BLOCKED = "Conta bloqueada: o progresso fica só neste navegador.";
    // A blocked account plays on this browser's progress (`progressOwner` null): that is not a lost connection.
    expect(savedWhere({ signedIn: true, blocked: true, pending: false, onAccount: false })).toBe(BLOCKED);
    expect(savedWhere({ signedIn: true, blocked: true, pending: true, onAccount: true })).toBe(BLOCKED);
    expect(savedWhere({ signedIn: false, blocked: false, pending: false, onAccount: false })).toBe("Seu progresso fica salvo neste navegador.");
    expect(savedWhere({ signedIn: true, blocked: false, pending: false, onAccount: true })).toBe("Seu progresso fica salvo na sua conta.");
    expect(savedWhere({ signedIn: true, blocked: false, pending: true, onAccount: true })).toBe(OFFLINE);
    expect(savedWhere({ signedIn: true, blocked: false, pending: false, onAccount: false })).toBe(OFFLINE);

    // The panel itself, for the account as the page holds it after a blocked sign-in.
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    vi.stubGlobal("window", new EventTarget());
    vi.resetModules();
    const account = await import("../lib/account");
    vi.doMock("../lib/account", () => ({ ...account, useAccount: live(account.useAccount) }));
    const { Missions } = await import("./Missions");
    account.useAccount.setState({ enabled: true, user: blocked, sync: "saved" });
    const panel = html(<Missions />);
    expect(panel).toContain(`<p class="note" role="status">${BLOCKED}</p>`);
    expect(panel).not.toContain("Sem conexão");
    account.useAccount.setState({ user: null });
    expect(html(<Missions />)).toContain('<p class="note" role="status">Seu progresso fica salvo neste navegador.</p>');
  });

  it("is what the account panel and the NGO application show for a blocked account, and the chip says so", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    vi.stubGlobal("window", new EventTarget());
    vi.resetModules();
    const account = await import("../lib/account");
    vi.doMock("../lib/account", () => ({ ...account, useAccount: live(account.useAccount) }));
    const { Account, AccountChip } = await import("./Account");
    const { NgoApplicationPanel } = await import("./NgoApplication");

    account.useAccount.setState({ enabled: true, files: true, user: blocked });
    expect(buttons(html(<Account then={{ kind: "ngo" }} />))).toEqual(["×", "Sair", "Excluir minha conta"]);
    // The chip reads "@ana_lima (bloqueada)"; the state is a span of its own, which nothing cuts.
    expect(html(<AccountChip />).replace(/<[^>]+>/g, "")).toContain("@ana_lima (bloqueada)");
    expect(html(<AccountChip />)).toContain('<span class="chip__state"> (bloqueada)</span>');
    const application = html(<NgoApplicationPanel />);
    expect(application).toContain('data-state="blocked"');
    expect(buttons(application)).toEqual(["×", "Ler a mensagem da administração"]);
    expect(application).not.toMatch(/Carregando|type="file"/);

    // The same account, not blocked: the usual panel, with the role by its shared label.
    account.useAccount.setState({ user: PLAYER });
    const usual = html(<Account />);
    expect(buttons(usual)).toContain("Minha candidatura de ONG");
    expect(usual).toContain(`<dt>Papel</dt><dd>${ROLE_LABEL.player}</dd>`);
    account.useAccount.setState({ user: ADMIN });
    expect(html(<Account />)).toContain(`<dt>Papel</dt><dd>${ROLE_LABEL.admin}</dd>`);
    expect(ROLE_LABEL).toEqual({ player: "Padrão", admin: "Administrador" });
  });
});
