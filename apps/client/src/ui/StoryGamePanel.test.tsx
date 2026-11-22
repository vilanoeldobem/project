/** The story game panel: the calm controls, the three-attempt skip gate and no purchase surface. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StoryGamePanel } from "./StoryGamePanel";

describe("story game panel", () => {
  it("shows the rule, hint, difficulty, pause and the disabled skip", () => {
    const html = renderToStaticMarkup(<StoryGamePanel gameId="sino-afinado" />);
    expect(html).toContain("Sino Afinado");
    expect(html).toContain("Toque cada sino e escolha a nota certa no campanário.");
    expect(html).toContain("Dica:");
    expect(html).toContain("Conferir");
    expect(html).toContain("Tentar outra vez");
    expect(html).toContain("Pausar");
    expect(html).toContain("Calma");
    expect(html).toContain("Normal");
    expect(html).toContain("Desafio");
    expect(html).toContain("Pular minijogo (3 tentativas)");
    expect(html).toMatch(/disabled=""/);
    expect(html).not.toMatch(/R\$|comprar|preço|checkout|pagamento/i);
  });

  it("renders the match tokens of the garden game", () => {
    const html = renderToStaticMarkup(<StoryGamePanel gameId="jardim-das-estacoes" />);
    expect(html).toContain("Primavera");
    expect(html).toContain("Verão");
    expect(html).toContain("Flor de degelo");
    expect(html).toContain("Plante cada flor na estação certa do jardim.");
  });
});
