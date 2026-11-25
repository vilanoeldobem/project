/**
 * The minigame catalogue (P09), server-side: the ten games the village really has, one action to play, and
 * the honest note that playing is free and no game has a timer. Third-party names from the board's
 * references never appear.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GAMES, Games } from "./Games";

const TITLES = [
  "Jogo da Memória",
  "Sino Afinado",
  "Fio do Tempo",
  "Trenó na Neve",
  "Coro dos Nomes",
  "Mapa das Estrelas",
  "Lago dos Reflexos",
  "Ponte das Pegadas",
  "Forno da Memória",
  "Jardim das Estações",
];

describe("the minigame catalogue (P09)", () => {
  it("lists the ten real games with their action", () => {
    const html = renderToStaticMarkup(<Games />);
    expect(html).toContain('aria-label="Minijogos da Vila"');
    expect(html).toContain('data-board="P09"');
    expect(GAMES).toHaveLength(10);
    for (const title of TITLES) expect(html).toContain(title);
    expect(html).toContain("Encontre os pares.");
    expect((html.match(/<button class="btn btn--primary">Jogar<\/button>/g) ?? []).length).toBe(10);
  });

  it("says playing is free and no game has a timer", () => {
    const html = renderToStaticMarkup(<Games />);
    expect(html).toContain("Jogar nunca é uma doação.");
    expect(html).toContain("Nenhum jogo tem cronômetro");
    expect(html).toContain("pular depois de três tentativas");
    for (const name of ["Tetris", "Pop It", "Gemini", "Chicken", "Sudoku", "Colorir", "7 Erros"]) expect(html).not.toContain(name);
  });
});
