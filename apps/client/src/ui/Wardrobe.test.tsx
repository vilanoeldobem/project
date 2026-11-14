/**
 * The P08 provador (server-side render, no browser): the full sheet has ten categories and ten cards in the
 * first one, the default is "Em uso", a free item says how to unlock, and a paid card only offers "Ver compra".
 * The interactive equip/preview path is exercised in `scripts/verify-shop.mjs`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Wardrobe } from "./Wardrobe";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the wardrobe (P08)", () => {
  it("shows the ten categories, ten cards and the free inventory", () => {
    const html = renderToStaticMarkup(<Wardrobe />);
    const read = text(html);
    expect(html).toContain('data-owned="10" data-free="80"');
    expect((html.match(/aria-pressed=/g) ?? []).length).toBe(10);
    expect((html.match(/data-item-id=/g) ?? []).length).toBe(10);
    for (const label of ["Capacete", "Blusa", "Calça", "Vestido", "Sapato", "Costas", "Rosto", "Mão esquerda", "Mão direita", "Especial"]) {
      expect(read).toContain(label);
    }
    expect(read).toContain("No inventário: 10 de 80 visuais gratuitos.");
    expect(read).toContain("Só o que eu tenho");
  });

  it("marks the default equipped, the locked free item with its requirement and the paid one as a purchase only", () => {
    const html = renderToStaticMarkup(<Wardrobe />);
    const read = text(html);
    expect(html).toContain('data-item-id="helmet-santa" data-slot="helmet" data-sale="free" data-state="equipped"');
    expect(html).toContain('data-item-id="helmet-beanie" data-slot="helmet" data-sale="free" data-state="locked"');
    expect(html).toContain('data-item-id="helmet-crown" data-slot="helmet" data-sale="paid" data-state="paid"');
    expect(read).toContain("Conclua: Encontre 2 presentes escondidos na praça");
    expect(read).toContain("Ver compra");
    expect(read).not.toMatch(/R\$|\bpreço\b|\bmoedas?\b|\bpag(ar|amento)\b|\bcarrinho\b|\balug\w+\b/i);
    expect(read).toContain("Visuais pagos são compras de aparência. Doações são separadas.");
  });

  it("shows only the categories of a shop, and all of them for an unknown id", () => {
    const shop = renderToStaticMarkup(<Wardrobe shopId="shop-02" />);
    const read = text(shop);
    expect((shop.match(/aria-pressed=/g) ?? []).length).toBe(2);
    expect((shop.match(/data-item-id=/g) ?? []).length).toBe(10);
    expect(read).toContain("Mão esquerda");
    expect(read).toContain("Mão direita");
    expect(read).not.toContain("Capacete");
    expect((renderToStaticMarkup(<Wardrobe shopId="nope" />).match(/aria-pressed=/g) ?? []).length).toBe(10);
  });
});
