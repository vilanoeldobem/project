/**
 * The donor badges sheet (P15), server-side: the four stages of the contract, the honest signed-out state and the
 * notes of a proposal (PEN-026). The account's own stage needs `/donations/my-title` and is checked in the
 * browser run.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TITLE_TIERS } from "@vila/shared/donations/contract";

import { Badges } from "./Badges";

describe("the badges sheet (P15)", () => {
  it("shows the four Faixas of the contract with their thresholds", () => {
    const html = renderToStaticMarkup(<Badges />);
    expect(html).toContain('aria-label="Suas badges"');
    expect(html).toContain('data-board="P15"');
    for (const tier of TITLE_TIERS.filter((t) => t.tier > 0)) expect(html).toContain(tier.label);
    expect(html).toContain("A partir de R$ 2,00");
  });

  it("asks a visitor to sign in and says that badges are a proposal", () => {
    const html = renderToStaticMarkup(<Badges />);
    expect(html).toContain("Entre na sua conta para ver seu badge.");
    expect(html).toContain("Entrar na conta");
    expect(html).toContain("Cada doação confirmada conta uma vez. Badges não dão XP (DEC-042).");
    expect(html).toContain("Faixas e visuais são proposta (PEN-026).");
  });

  it("does not draw the board's switch to show the badge over the avatar (out of scope)", () => {
    expect(renderToStaticMarkup(<Badges />)).not.toContain("Exibir na Vila");
  });
});
