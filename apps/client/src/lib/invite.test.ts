import { describe, expect, it } from "vitest";

import { INVITE_MESSAGE, inviteLinks } from "./invite";

const SITE = "https://www.vilanoeldobem.com.br";

describe("the invite links (P11)", () => {
  it("carries the message and the link, encoded for WhatsApp and e-mail", () => {
    const links = inviteLinks(INVITE_MESSAGE, SITE);
    expect(links.text).toBe(`${INVITE_MESSAGE}\n\n${SITE}`);
    expect(links.link).toBe(SITE);
    expect(links.whatsapp.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(links.whatsapp.slice("https://wa.me/?text=".length))).toBe(links.text);
    expect(links.email.startsWith("mailto:?subject=")).toBe(true);
    expect(decodeURIComponent(links.email.slice(links.email.indexOf("&body=") + "&body=".length))).toBe(links.text);
    // Characters that would break a URL or an address travel encoded.
    for (const raw of [links.whatsapp, links.email]) expect(raw).not.toMatch(/[\s"<>]/);
  });

  it("encodes spaces, newlines and ampersands instead of leaving them raw", () => {
    const links = inviteLinks("Bom & barato\nsegunda linha", SITE);
    expect(links.whatsapp).toContain("%26");
    expect(links.whatsapp).toContain("%0A");
    expect(links.whatsapp).toContain("%20");
  });

  it("sends the link alone when the message is empty or blank", () => {
    for (const message of ["", "   ", "\n\t"]) {
      const links = inviteLinks(message, SITE);
      expect(links.text).toBe(SITE);
      expect(links.whatsapp).toBe(`https://wa.me/?text=${encodeURIComponent(SITE)}`);
    }
  });
});
