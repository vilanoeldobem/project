/**
 * The P08 provador (server-side render, no browser): the full sheet has ten categories and ten cards in the
 * first one, the default is "Em uso", a free item says how to unlock, and paid previews are hidden until PEN-022
 * (`SHOW_PAID_PREVIEWS`).
 * The interactive equip/preview path is exercised in `scripts/verify-shop.mjs`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SHOW_PAID_PREVIEWS, Wardrobe } from "./Wardrobe";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the wardrobe (P08)", () => {
  it("shows the ten categories, the eight free cards and the free inventory", () => {
    const html = renderToStaticMarkup(<Wardrobe />);
    const read = text(html);
    expect(html).toContain('data-owned="10" data-free="80"');
    expect((html.match(/aria-pressed=/g) ?? []).length).toBe(10);
    expect((html.match(/data-item-id=/g) ?? []).length).toBe(8);
    for (const label of ["Capacete", "Blusa", "Calça", "Vestido", "Sapato", "Costas", "Rosto", "Mão esquerda", "Mão direita", "Especial"]) {
      expect(read).toContain(label);
    }
    expect(read).toContain("No inventário: 10 de 80 visuais gratuitos.");
    expect(read).toContain("Só o que eu tenho");
  });

  it("marks the default equipped and the locked free item with its requirement, and shows no paid item", () => {
    const html = renderToStaticMarkup(<Wardrobe />);
    const read = text(html);
    expect(html).toContain('data-item-id="helmet-santa" data-slot="helmet" data-sale="free" data-state="equipped"');
    expect(html).toContain('data-item-id="helmet-beanie" data-slot="helmet" data-sale="free" data-state="locked"');
    expect(SHOW_PAID_PREVIEWS).toBe(false);
    expect(html).not.toContain("helmet-crown");
    expect(html).not.toContain('data-sale="paid"');
    expect(read).toContain("Conclua: Encontre 2 presentes escondidos na praça");
    expect(read).not.toMatch(/R\$|\bpreço\b|\bmoedas?\b|\bpag(ar|amento|o)\b|\bcarrinho\b|\balug\w+\b|\bcompras?\b/i);
  });

  it("shows only the categories of a shop, and all of them for an unknown id", () => {
    const shop = renderToStaticMarkup(<Wardrobe shopId="shop-02" />);
    const read = text(shop);
    expect((shop.match(/aria-pressed=/g) ?? []).length).toBe(2);
    expect((shop.match(/data-item-id=/g) ?? []).length).toBe(8);
    expect(read).toContain("Mão esquerda");
    expect(read).toContain("Mão direita");
    expect(read).not.toContain("Capacete");
    expect((renderToStaticMarkup(<Wardrobe shopId="nope" />).match(/aria-pressed=/g) ?? []).length).toBe(10);
  });
});
