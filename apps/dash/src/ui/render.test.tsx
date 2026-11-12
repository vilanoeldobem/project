/**
 * What each screen renders before any request answers (server-side render, no browser): the honest states, the
 * labels and roles the browser checks rely on (`scripts/verify.mjs`, `apps/client/scripts/verify-accounts.mjs`),
 * and the absence of anything that pretends to work.
 */
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ApplicationDetail, Me } from "@vila/shared/accounts/contract";

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
};
const review = (over: Partial<ApplicationDetail["application"]>) =>
  html(<Review id={DETAIL.application.id} d={{ ...DETAIL, application: { ...DETAIL.application, ...over } }} onDetail={() => {}} />);

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
    for (const id of ["PEN-004", "PEN-006", "IMPL-0002", "DEC-027", "R2"]) expect(page).toContain(id);
    expect(page).not.toMatch(/<button|<a |<input|R\$|\d+%/);
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
