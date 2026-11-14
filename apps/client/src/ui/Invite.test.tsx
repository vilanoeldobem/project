/**
 * The ONG invite (P11), server-side: the sheet, the message that goes with the link, the three ways to share
 * it and the one honest warning. The company half of the board is absent on purpose (no programme, no
 * destination), and nothing here approves an ONG.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { INVITE_MESSAGE } from "../lib/invite";
import { SERVICES } from "../lib/services";
import { Invite } from "./Invite";

describe("the invite panel (P11)", () => {
  it("is the P11 sheet, with the default message ready to edit", () => {
    const html = renderToStaticMarkup(<Invite />);
    expect(html).toContain('aria-label="Convide uma ONG"');
    expect(html).toContain('data-board="P11"');
    expect(html).toContain('id="invite-msg"');
    expect(html).toContain(INVITE_MESSAGE);
  });

  it("offers exactly the three share choices, with the encoded link", () => {
    const html = renderToStaticMarkup(<Invite />);
    expect((html.match(/<a class="btn"/g) ?? []).length).toBe(2);
    expect(html).toContain("Copiar link");
    expect(html).toContain("wa.me/?text=");
    expect(html).toContain("mailto:?subject=");
    expect(html).toContain(encodeURIComponent(SERVICES.site));
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("says an indication approves nothing and never mentions a company", () => {
    const html = renderToStaticMarkup(<Invite />);
    expect(html).toContain("Indicação não garante aprovação.");
    expect(html).not.toContain("Empresa");
  });
});
