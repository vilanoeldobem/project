/**
 * The minigame catalogue (P09), server-side: only the games the village really has, one action to play, and the
 * honest note that more arrive when defined. Third-party names from the board's references never appear.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GAMES, Games } from "./Games";

describe("the minigame catalogue (P09)", () => {
  it("lists the one real game with its action", () => {
    const html = renderToStaticMarkup(<Games />);
    expect(html).toContain('aria-label="Minijogos da Vila"');
    expect(html).toContain('data-board="P09"');
    expect(GAMES).toHaveLength(1);
    expect(html).toContain("Jogo da Memória");
    expect(html).toContain("Encontre os pares.");
    expect((html.match(/<button class="btn btn--primary">Jogar<\/button>/g) ?? []).length).toBe(1);
  });

  it("says more games are to be defined, without borrowing other games' names", () => {
    const html = renderToStaticMarkup(<Games />);
    expect(html).toContain("Outros jogos entram na Vila depois de definidos.");
    for (const name of ["Tetris", "Pop It", "Gemini", "Chicken", "Sudoku", "Colorir", "7 Erros"]) expect(html).not.toContain(name);
  });
});
