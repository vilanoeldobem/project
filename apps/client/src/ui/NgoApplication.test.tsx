/**
 * What the applicant reads about an application already sent (server-side render, no browser): every status says
 * something true, and an NGO the administration withdrew (IMPL-0020, PROPOSTA) is never shown as "waiting for
 * approval".
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { APPLICATION_STATUSES, type Application, STATUS_LABEL } from "@vila/shared/accounts/contract";
import type { ApplicationFile } from "@vila/shared/accounts/files";

import { ApplicationFiles } from "./ApplicationFiles";
import { ApplicationStatusView } from "./NgoApplication";

const APP: Application = {
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
  projects: [],
  lotId: "plaza-03",
  status: "submitted",
  revision: 2,
  reviewNote: null,
  createdAt: "2026-11-10T12:00:00.000Z",
  updatedAt: "2026-11-11T12:00:00.000Z",
};
const LOGO: ApplicationFile = { id: "aaaaaaaa-0000-4000-8000-000000000001", kind: "logo", contentType: "image/png", size: 186_368, createdAt: "2026-11-10T12:05:00.000Z" };
const PDF: ApplicationFile = { id: "aaaaaaaa-0000-4000-8000-000000000002", kind: "document", contentType: "application/pdf", size: 1_572_864, createdAt: "2026-11-10T12:06:00.000Z" };
const MESSAGE = "A organização pediu para sair da Vila.";
const WAITING = "A casa só aparece na Vila depois da aprovação da administração.";

const view = (over: Partial<Application>) =>
  renderToStaticMarkup(<ApplicationStatusView app={{ ...APP, ...over }} files={[]} onEdit={() => {}} onFiles={() => {}} onStale={async () => {}} />);
/** The files section as the status view shows it when the API has uploads on. */
const filesOf = (status: Application["status"]) => renderToStaticMarkup(<ApplicationFiles status={status} files={[LOGO, PDF]} onChange={() => {}} onStale={async () => {}} />);
const buttons = (page: string) => [...page.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map((m) => m[1]).filter((text) => text !== "×");

describe("status of an application already sent", () => {
  it("labels every status the API can answer", () => {
    for (const status of APPLICATION_STATUSES) expect(view({ status })).toContain(`<span class="status">${STATUS_LABEL[status]}</span>`);
  });

  it("says the house waits for approval only while that is true", () => {
    for (const status of ["submitted", "under_review", "changes_requested", "rejected"] as const) expect([status, view({ status }).includes(WAITING)]).toEqual([status, true]);
    for (const status of ["published", "withdrawn"] as const) expect([status, view({ status }).includes(WAITING)]).toEqual([status, false]);
  });

  it("offers editing only after changes were requested or the application was not approved", () => {
    for (const status of APPLICATION_STATUSES)
      expect([status, buttons(view({ status }))]).toEqual([status, status === "changes_requested" || status === "rejected" ? ["Editar e reenviar"] : []]);
  });
});

describe("an NGO withdrawn by the administration (IMPL-0020, PROPOSTA)", () => {
  const withdrawn = { status: "withdrawn", revision: 3, withdrawal: { reason: MESSAGE, at: "2026-11-12T10:00:00.000Z" } } as const;

  it("says what happened, shows the message from the administration and offers no resubmission", () => {
    const page = view(withdrawn);
    expect(page).toContain('<span class="status">Retirada da Vila</span>');
    expect(page).toContain("Terreno 3 (liberado) · versão 3");
    expect(page).toContain('<li class="is-done">Retirada da Vila pela administração</li>');
    expect(page).toContain('data-state="withdrawn"');
    expect(page).toContain("A administração retirou esta organização da Vila: a casa não aparece mais e o terreno foi liberado.");
    expect(page).toContain("não pode ser editada nem reenviada");
    expect(page).toContain(`<strong>Mensagem da administração</strong><p>${MESSAGE}</p>`);
    expect(page).not.toContain(WAITING);
    expect(buttons(page)).toEqual([]);
  });

  it("keeps the earlier review message next to the message of the withdrawal", () => {
    const page = view({ ...withdrawn, reviewNote: "Aprovada na primeira análise." });
    expect(page).toContain("<strong>Mensagem da análise</strong><p>Aprovada na primeira análise.</p>");
    expect(page).toContain(`<strong>Mensagem da administração</strong><p>${MESSAGE}</p>`);
  });

  it("still tells the truth when an older API sends the status without the message", () => {
    const page = view({ status: "withdrawn" });
    expect(page).toContain('data-state="withdrawn"');
    expect(page).not.toContain("Mensagem da administração");
    expect(page).not.toContain(WAITING);
  });

  it("lets the person remove and download their own files, never send or replace one", () => {
    const page = filesOf("withdrawn");
    expect(page).toContain("A organização foi retirada da Vila: não é possível enviar nem trocar arquivos.");
    expect(page).toContain("O logo não aparece mais na Vila.");
    expect(buttons(page)).toEqual(["Remover logo", "Baixar", "Remover"]);
    expect(page).not.toContain('type="file"');
    // The same files while published or under review stay frozen: download only.
    for (const status of ["published", "under_review"] as const) {
      expect([status, buttons(filesOf(status))]).toEqual([status, ["Baixar"]]);
      expect(filesOf(status)).not.toContain('type="file"');
    }
    // And while editable both sending and removing are offered.
    const editable = filesOf("changes_requested");
    expect(buttons(editable)).toEqual(["Remover logo", "Baixar", "Remover"]);
    expect(editable.split('type="file"').length - 1).toBe(2);
  });
});
