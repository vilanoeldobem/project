/**
 * The appearance sheet (P07/P08), server-side: the portrait drawn from the avatar voxels, the five sections of
 * the board, the colour swatches the browser check clicks and the two tabs. Saving is a store action, exercised
 * in the browser check.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AvatarPanel } from "./AvatarPanel";

describe("the appearance sheet (P07)", () => {
  it("opens the sheet with the portrait of the character and the local-only note", () => {
    const html = renderToStaticMarkup(<AvatarPanel />);
    expect(html).toContain('aria-label="Aparência do personagem"');
    expect(html).toContain('data-board="P07"');
    expect(html).toContain('role="img" aria-label="Seu personagem"');
    expect(html).toContain("Sua aparência vale neste navegador; os outros visitantes veem o seu visual da Vila.");
  });

  it("shows the five sections and the height note", () => {
    const html = renderToStaticMarkup(<AvatarPanel />);
    for (const title of ["Visual base", "Tipo de cabelo", "Cores", "Altura", "Barba e bigode"]) expect(html).toContain(title);
    expect(html).toContain("Altura é apenas visual: não dá vantagem no jogo.");
    expect(html).toContain("Salvar aparência");
    expect(html).toContain("Aleatorizar");
  });

  it("offers the eight swatches of each colour row, with the values the browser check clicks", () => {
    const html = renderToStaticMarkup(<AvatarPanel />);
    for (const field of ["hairColor", "skin", "eyes"]) expect((html.match(new RegExp(`data-field="${field}"`, "g")) ?? []).length).toBe(8);
    expect(html).toContain('data-field="skin" data-value="#A96B45"');
    expect((html.match(/role="tab"/g) ?? []).length).toBe(2);
  });
});
