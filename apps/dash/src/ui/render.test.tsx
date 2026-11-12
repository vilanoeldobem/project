/**
 * What each screen renders before any request answers (server-side render, no browser): the honest states, the
 * labels and roles the browser checks rely on (`scripts/verify.mjs`, `apps/client/scripts/verify-accounts.mjs`),
 * and the absence of anything that pretends to work.
 */
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ApplicationDetail, Me } from "@vila/shared/accounts/contract";
import type { ApplicationFile } from "@vila/shared/accounts/files";

import { dateTime } from "../lib/format";

import { Applications, Review } from "./Applications";
import { Audit } from "./Audit";
import { Lots } from "./Lots";
import { Pending } from "./Pending";
import { Shell } from "./Shell";
import { NotAdmin, SignIn } from "./SignIn";
import { System } from "./System";
import { Users } from "./Users";

const html = (el: ReactElement) => renderToStaticMarkup(el);
const count = (text: string, part: string) => text.split(part).length - 1;
const ADMIN: Me = { id: "u1", name: "Ana Lima", nickname: "ana_lima", city: "Recife", email: "ana@example.com", role: "admin" };

const DETAIL: ApplicationDetail = {
  application: {
    id: "3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b",
    name: "Associação Exemplo",
    cnpj: "11222333000181",
    openedOn: "2020-03-10",
    city: "São Paulo",
    declarations: { activeCnpj: true, oneYear: true, fundsConfirmable: true },
    fundsConfirmation: "Extratos mensais da conta da organização.",
    summary: "Apoio escolar para crianças do bairro.",
    description: "Reforço escolar, leitura e atividades culturais no contraturno.",
    tags: ["children", "education"],
    projects: [{ title: "Leitura em roda", description: "Encontros semanais." }],
    lotId: "plaza-03",
    status: "submitted",
    revision: 2,
    reviewNote: null,
    createdAt: "2026-11-10T12:00:00.000Z",
    updatedAt: "2026-11-11T12:00:00.000Z",
  },
  applicant: { nickname: "ong_teste" },
  history: [{ at: "2026-11-10T12:00:00.000Z", action: "ngo.submit", detail: null, actor: "ong_teste" }],
  files: [],
};
const review = (over: Partial<ApplicationDetail["application"]>, rest: Partial<ApplicationDetail> = {}, filesOn = true) =>
  html(<Review id={DETAIL.application.id} d={{ ...DETAIL, ...rest, application: { ...DETAIL.application, ...over } }} filesOn={filesOn} onDetail={() => {}} />);

const LOGO: ApplicationFile = { id: "aaaaaaaa-0000-4000-8000-000000000001", kind: "logo", contentType: "image/png", size: 186_368, createdAt: "2026-11-10T12:05:00.000Z" };
const PDF: ApplicationFile = { id: "aaaaaaaa-0000-4000-8000-000000000002", kind: "document", contentType: "application/pdf", size: 1_572_864, createdAt: "2026-11-10T12:06:00.000Z" };
const SCAN: ApplicationFile = { id: "aaaaaaaa-0000-4000-8000-000000000003", kind: "document", contentType: "image/jpeg", size: 734, createdAt: "2026-11-11T09:00:00.000Z" };

describe("sign-in", () => {
  it("asks only for the e-mail and offers no account creation", () => {
    const page = html(<SignIn />);
    expect(page).toContain("<h1>Entrar</h1>");
    expect(page).toContain("E-mail da sua conta");
    expect(page).toMatch(/<button class="btn btn--primary" disabled="">Enviar link de acesso<\/button>/);
    expect(count(page, "<input")).toBe(1);
    expect(page).not.toMatch(/Criar conta<\/button>|<nav/);
  });

  it("shows why the person is back at sign-in", () => {
    expect(html(<SignIn notice="Sua sessão terminou. Entre de novo." />)).toMatch(/role="alert"[^>]*>Sua sessão terminou/);
  });

  it("gives a signed-in non-admin a refusal and a way out, nothing else", () => {
    const page = html(<NotAdmin user={{ ...ADMIN, role: "player" }} onSignOut={() => {}} />);
    expect(page).toContain("<h1>Apenas administradores</h1>");
    expect(count(page, "<button")).toBe(1);
    expect(page).toContain(">Sair</button>");
    expect(page).not.toMatch(/<nav|<a |<table|ana@example\.com|Ana Lima/);
  });
});

describe("shell", () => {
  it("lists every section, marks the current one and never shows the e-mail or the name", () => {
    const page = html(
      <Shell route={{ section: "audit" }} user={ADMIN} onSignOut={() => {}}>
        <p>conteúdo</p>
      </Shell>
    );
    for (const [href, label] of [["#/applications", "Candidaturas"], ["#/lots", "ONGs e terrenos"], ["#/audit", "Auditoria"], ["#/users", "Usuários"], ["#/system", "Sistema"], ["#/pending", "Pendentes"]])
      expect(page).toContain(`href="${href}"`), expect(page).toContain(`>${label}</a>`);
    expect(page).toContain('<nav class="menu" aria-label="Seções">');
    expect(page).toContain('<a href="#/audit" aria-current="page">Auditoria</a>');
    expect(count(page, 'aria-current="page"')).toBe(1);
    expect(page).toContain("@ana_lima");
    expect(page).not.toMatch(/ana@example\.com|Ana Lima/);
    // The first focusable element is the skip link.
    expect(page.indexOf("Pular para o conteúdo")).toBeLessThan(page.indexOf("<nav"));
  });

  it("says there is no session while accounts are off", () => {
    const page = html(
      <Shell route={{ section: "system" }} user={null} onSignOut={() => {}}>
        <p>conteúdo</p>
      </Shell>
    );
    expect(page).toContain("Sem sessão");
    expect(page).not.toContain(">Sair</button>");
  });
});

describe("sections with accounts off", () => {
  it("say why they are empty, with no data and no button", () => {
    for (const [name, page] of [
      ["applications", html(<Applications locked />)],
      ["audit", html(<Audit locked />)],
      ["users", html(<Users locked />)],
    ] as const) {
      expect([name, count(page, 'data-state="accounts-off"')]).toEqual([name, 1]);
      expect([name, page.includes("Contas desligadas")]).toEqual([name, true]);
      expect([name, count(page, "<button"), count(page, "<table")]).toEqual([name, 0, 0]);
    }
    expect(html(<Lots locked />)).toContain('data-state="accounts-off"');
  });

  it("keep sanctions as a pending note without any action", () => {
    for (const page of [html(<Users locked />), html(<Users locked={false} />)]) {
      expect(page).toContain("Sanções: pendente de definição");
      expect(count(page, 'data-state="pending"')).toBe(1);
      expect(count(page, "<button")).toBe(0);
    }
  });
});

describe("pending areas", () => {
  it("are three labelled notes: no button, no link, no number", () => {
    const page = html(<Pending />);
    expect(count(page, 'data-state="pending"')).toBe(3);
    for (const title of ["Doações", "Indicadores", "Documentos e logos das ONGs"]) expect(page).toContain(`>${title}</strong>`);
    for (const id of ["PEN-004", "PEN-006", "IMPL-0002", "DEC-027", "PEN-019", "OQ-12", "IMPL-0017"]) expect(page).toContain(id);
    expect(page).not.toMatch(/<button|<a |<input|R\$|\d+%/);
  });

  it("say that uploads exist behind a flag and what is still undecided, without naming a document", () => {
    const page = html(<Pending />);
    expect(page).not.toContain("ainda não recebe arquivos");
    expect(page).toContain("<code>NGO_FILES_ENABLED</code>");
    expect(page).toContain("desligada em produção");
    expect(page).toContain("quais documentos uma ONG deve enviar (PEN-019)");
    expect(page).toContain("por quanto tempo os arquivos ficam guardados (OQ-12)");
    expect(page).toContain("nenhum documento é exigido");
    expect(page).not.toMatch(/estatuto|\bata\b|certid|comprovante|balanço/i);
  });
});

describe("system", () => {
  it("links to the realtime server instead of reading it", () => {
    const page = html(<System />);
    expect(page).toMatch(/<a class="btn btn--small" href="http:\/\/localhost:8788\/health" target="_blank" rel="noopener noreferrer">/);
    expect(page).toContain("http://localhost:8787");
  });
});

describe("review of an application", () => {
  it("explains pending account erasure and keeps only rejection enabled for an open application", () => {
    const page = review({}, { applicant:{ nickname:"ong_teste",deletionPending:true } });
    expect(page).toContain('data-state="deletion-pending"');
    expect(page).toContain("Exclusão da conta pendente");
    expect(page).toContain("rejeitar libera o terreno sem cancelar a exclusão");
    for (const action of ["Iniciar análise","Aprovar","Pedir ajustes"])
      expect(page).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${action}</button>`));
    expect(page).toMatch(/<button class="btn">Rejeitar<\/button>/);
    expect(page).toContain('<fieldset class="checks" disabled="">');
  });

  it("shows the evidence, the three checks and the applicant by nickname only", () => {
    const page = review({});
    expect(page).toContain('<span class="status" data-status="submitted">Candidatura enviada</span>');
    expect(page).toContain("Terreno 3 · versão 2 · enviada por @ong_teste");
    for (const text of ["11222333000181", "2020-03-10", "Crianças, Educação", "Leitura em roda", "Verificação dos 3 requisitos (DEC-015)"]) expect(page).toContain(text);
    expect(count(page, 'type="checkbox"')).toBe(3);
    for (const label of ["CNPJ ativo (consultado na Receita Federal)", "Pelo menos 1 ano de existência", "Forma confiável de confirmar os recursos"]) expect(page).toContain(label);
    expect(page).toContain("Candidatura enviada · @ong_teste");
    expect(page).toContain('href="#/applications">Voltar à lista</a>');
  });

  it("offers each action only in the states that allow it, and approval only after the checks", () => {
    const buttons = (page: string) => [...page.matchAll(/<button class="btn[^"]*"( disabled="")?[^>]*>([^<]+)<\/button>/g)].map((m) => `${m[2]}${m[1] ? " (disabled)" : ""}`);
    expect(buttons(review({ status: "submitted" }))).toEqual(["Iniciar análise", "Aprovar (disabled)", "Pedir ajustes", "Rejeitar"]);
    expect(buttons(review({ status: "under_review" }))).toEqual(["Aprovar (disabled)", "Pedir ajustes", "Rejeitar"]);
    expect(buttons(review({ status: "changes_requested" }))).toEqual(["Rejeitar"]);
    expect(buttons(review({ status: "published" }))).toEqual([]);
    expect(buttons(review({ status: "rejected" }))).toEqual([]);
    expect(review({ status: "submitted" })).toContain("Mensagem para a organização (obrigatória para pedir ajustes ou não aprovar)");
    expect(review({ status: "published" })).not.toContain("<textarea");
  });

  it("shows the last message sent to the organisation", () => {
    expect(review({ status: "changes_requested", reviewNote: "Envie o relatório de 2025." })).toMatch(/Última mensagem enviada<\/strong><p>Envie o relatório de 2025\.<\/p>/);
  });
});

describe("withdrawal of a published NGO (IMPL-0020, PROPOSTA)", () => {
  const MESSAGE = "A organização pediu para sair da Vila.";
  const withdrawalReview = (over: Partial<ApplicationDetail["application"]>, rest: Partial<ApplicationDetail> = {}, withdrawalOn = true, accountId: string | undefined = ADMIN.id) =>
    html(<Review id={DETAIL.application.id} d={{ ...DETAIL, ...rest, application: { ...DETAIL.application, ...over } }} filesOn withdrawalOn={withdrawalOn} accountId={accountId} onDetail={() => {}} />);
  const buttons = (page: string) => [...page.matchAll(/<button class="btn[^"]*"( disabled="")?[^>]*>([^<]+)<\/button>/g)].map((m) => `${m[2]}${m[1] ? " (disabled)" : ""}`);

  it("offers the action only for a published NGO and only when the API has it on", () => {
    expect(buttons(withdrawalReview({ status: "published" }))).toEqual(["Retirar da Vila (disabled)"]);
    expect(buttons(withdrawalReview({ status: "published" }, {}, false))).toEqual([]);
    expect(withdrawalReview({ status: "published" }, {}, false)).not.toContain("<textarea");
    for (const status of ["submitted", "under_review", "changes_requested", "rejected", "withdrawn"] as const)
      expect([status, buttons(withdrawalReview({ status })).includes("Retirar da Vila (disabled)"), withdrawalReview({ status }).includes('data-action="withdraw"')]).toEqual([status, false, false]);
  });

  it("names the text as a message the organisation reads, says what cannot be undone and asks to confirm", () => {
    const page = withdrawalReview({ status: "published" });
    expect(page).toContain('data-action="withdraw"');
    expect(page).toContain("Mensagem para a organização (obrigatória, de 10 a 1000 caracteres)");
    expect(page).toContain("A organização lê este texto como foi escrito");
    expect(page).toContain("Não é uma anotação interna");
    expect(page).toContain('data-state="withdrawal-proposal"');
    expect(page).toContain("PROPOSTA (IMPL-0020)");
    for (const effect of ["O painel não tem como desfazer", "não consegue enviar outra candidatura", "o CNPJ continua em uso"]) expect(page).toContain(effect);
    expect(page).toContain("Entendo que a retirada não pode ser desfeita pelo painel");
    expect(count(page, "<textarea")).toBe(1);
    // Nothing is sent before the confirmation: the button starts disabled.
    expect(page).toMatch(/<button class="btn" disabled="" title="Confirme antes de retirar">Retirar da Vila<\/button>/);
  });

  it("keeps the action disabled while the owner's account erasure is pending", () => {
    const page = withdrawalReview({ status: "published" }, { applicant: { nickname: "ong_teste", deletionPending: true } });
    expect(page).toMatch(/<button class="btn" disabled="" title="Exclusão da conta pendente">Retirar da Vila<\/button>/);
    expect(page).toContain("A retirada fica indisponível enquanto a exclusão da conta do responsável não terminar.");
  });

  it("shows a withdrawn NGO with its status, the message sent and no action at all", () => {
    const page = withdrawalReview(
      { status: "withdrawn", revision: 3, withdrawal: { reason: MESSAGE, at: "2026-11-12T10:00:00.000Z" } },
      { history: [...DETAIL.history, { at: "2026-11-12T10:00:00.000Z", action: "ngo.withdraw", detail: '{"from":"published","to":"withdrawn","revision":3,"lots":["plaza-03"],"hasReason":true}', actor: "ana_lima" }] }
    );
    expect(page).toContain('<span class="status" data-status="withdrawn">Retirada da Vila</span>');
    expect(page).toContain('data-state="withdrawn"');
    expect(page).toContain(`<strong>Mensagem enviada à organização</strong> em ${dateTime("2026-11-12T10:00:00.000Z")}:`);
    expect(page).toContain(`<p data-field="withdrawal-message">${MESSAGE}</p>`);
    expect(page).toContain("o painel não tem como desfazer a retirada");
    expect(page).toContain(`${dateTime("2026-11-12T10:00:00.000Z")} · Retirada da Vila pela administração · @ana_lima`);
    expect(buttons(page)).toEqual([]);
    expect(page).not.toContain("<textarea");
    // The audit detail (lot ids, flags) is never printed in the history.
    expect(page).not.toContain("hasReason");
  });

  it("still shows the status when an older API sends no message", () => {
    const page = withdrawalReview({ status: "withdrawn" });
    expect(page).toContain('data-state="withdrawn"');
    expect(page).not.toContain("Mensagem enviada à organização");
  });
});

describe("files of an application (IMPL-0017)", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** The part of the review between the "Arquivos" heading and the eligibility checks. */
  const filesOf = (page: string) => page.slice(page.indexOf("<h2>Arquivos</h2>"), page.indexOf('<fieldset class="checks">'));

  it("lists the logo and the numbered documents with type, size and date, and no file name or id", () => {
    const section = filesOf(review({}, { files: [LOGO, PDF, SCAN] }));
    expect(section).toContain("<h3>Logo</h3>");
    expect(section).toContain(`PNG · 182 KB · enviado em ${dateTime(LOGO.createdAt)}`);
    expect(section).toContain("<h3>Documentos</h3>");
    expect(section).toContain(`<strong>Documento 1</strong> <span class="muted">PDF · 1,5 MB · enviado em ${dateTime(PDF.createdAt)}</span>`);
    expect(section).toContain(`<strong>Documento 2</strong> <span class="muted">JPEG · 734 bytes · enviado em ${dateTime(SCAN.createdAt)}</span>`);
    expect(count(section, 'data-file="logo"')).toBe(1);
    expect(count(section, 'data-file="document"')).toBe(2);
    expect(section).toContain("Cada download de documento fica registrado na auditoria.");
    for (const file of [LOGO, PDF, SCAN]) expect(section).not.toContain(file.id);
    expect(section).not.toMatch(/data-state="(empty|files-off)"/);
  });

  it("offers a document only as a download button: no link, no preview, nothing the browser fetches by itself", () => {
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    const section = filesOf(review({}, { files: [LOGO, PDF, SCAN] }));
    expect([...section.matchAll(/<button class="btn btn--small" aria-label="([^"]+)">([^<]+)<\/button>/g)].map((m) => [m[1], m[2]])).toEqual([
      ["Baixar documento 1", "Baixar"],
      ["Baixar documento 2", "Baixar"],
    ]);
    expect(count(section, "<button")).toBe(2);
    // The logo preview appears only once its bytes arrive (an object URL); until then, no image at all.
    expect(section).toContain("Carregando o logo…");
    expect(section).not.toMatch(/<img|<a |<iframe|<embed|<object|href=|src=|\/files\//);
    expect(fetched).not.toHaveBeenCalled();
  });

  it("says which kind is missing when only one was sent", () => {
    const onlyLogo = filesOf(review({}, { files: [LOGO] }));
    expect(onlyLogo).toContain("Nenhum documento enviado.");
    expect(onlyLogo).not.toMatch(/<button|registrado na auditoria/);
    const onlyDocument = filesOf(review({}, { files: [PDF] }));
    expect(onlyDocument).toContain("Nenhum logo enviado.");
    expect(onlyDocument).not.toContain("Carregando o logo");
    expect(count(onlyDocument, "<button")).toBe(1);
  });

  it("has an explicit empty state when nothing was sent", () => {
    const section = filesOf(review({}));
    expect(section).toContain('<p class="muted" data-state="empty">Nenhum arquivo enviado.</p>');
    expect(section).not.toMatch(/<button|<h3|data-state="files-off"/);
  });

  it("says uploads are off instead of showing an empty list (flag off, or an API that sends no files)", () => {
    for (const rest of [{}, { files: undefined as unknown as ApplicationFile[] }]) {
      const section = filesOf(review({}, rest, false));
      expect(count(section, 'data-state="files-off"')).toBe(1);
      expect(section).toContain("Envio de arquivos desligado");
      expect(section).toContain("<code>NGO_FILES_ENABLED</code>");
      expect(section).not.toMatch(/Nenhum arquivo enviado|<button|<h3|data-state="empty"/);
    }
  });

  it("still shows the files that exist when uploads are off: an approval must not publish a logo nobody saw", () => {
    const logo: ApplicationFile = { id: "f0000000-0000-4000-8000-000000000001", kind: "logo", contentType: "image/png", size: 2048, createdAt: "2026-11-12T12:00:00.000Z" };
    const document: ApplicationFile = { id: "f0000000-0000-4000-8000-000000000002", kind: "document", contentType: "application/pdf", size: 4096, createdAt: "2026-11-12T12:01:00.000Z" };
    const section = filesOf(review({}, { files: [logo, document] }, false));
    expect(count(section, 'data-state="files-off"')).toBe(1);
    expect(section).toContain("continuam valendo");
    expect(count(section, 'data-file="logo"')).toBe(1);
    expect(count(section, 'data-file="document"')).toBe(1);
    expect(section).toContain("Baixar documento 1");
  });

  it("labels file events in the history by kind, never by the file id", () => {
    const history = [
      { at: "2026-11-10T12:05:00.000Z", action: "ngo.file_add", detail: JSON.stringify({ kind: "logo", file: LOGO.id, revision: 2 }), actor: "ong_teste" },
      { at: "2026-11-10T12:06:00.000Z", action: "ngo.file_remove", detail: JSON.stringify({ kind: "document", file: PDF.id, revision: 3 }), actor: "ong_teste" },
      { at: "2026-11-11T10:00:00.000Z", action: "ngo.file_read", detail: JSON.stringify({ kind: "document", file: PDF.id }), actor: "ana_lima" },
    ];
    const page = review({}, { history });
    const list = page.slice(page.indexOf('<ol class="history">'));
    expect(list).toContain("Arquivo enviado (logo) · @ong_teste");
    expect(list).toContain("Arquivo removido (documento) · @ong_teste");
    expect(list).toContain("Documento baixado pela administração · @ana_lima");
    expect(list).not.toMatch(/aaaaaaaa-0000|ngo\.file_/);
  });
});
