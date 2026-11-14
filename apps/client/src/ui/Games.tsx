/**
 * Minigame catalogue (P09, "jogos simples"): only the games that exist. The board's other titles are references
 * (two of them third-party trademarks) and their rules are "em estudo", so the note says more games arrive when
 * defined — no name, no fake card. Playing is free and is never a donation.
 */
import { useVila } from "../game/store";
import { Panel } from "./Panel";
import { SheetNotice, SheetSection } from "./sheet";

export const GAMES = [{ kind: "memory", icon: "🃏", name: "Jogo da Memória", description: "Encontre os pares." }] as const;

export function Games() {
  const open = useVila((s) => s.open);
  return (
    <Panel board="P09" sheet icon="🎲" title="Minijogos da Vila" subtitle="Brincar">
      <SheetSection n={1} icon="🎮" title="Jogos disponíveis">
        {GAMES.map((game) => (
          <div key={game.kind} className="sheet-card">
            <h4>
              <span aria-hidden="true">{game.icon}</span> {game.name}
            </h4>
            <p>{game.description}</p>
            <button className="btn btn--primary" onClick={() => open({ kind: game.kind })}>
              Jogar
            </button>
          </div>
        ))}
      </SheetSection>
      <SheetNotice tone="pending" icon="✏️">
        Outros jogos entram na Vila depois de definidos.
      </SheetNotice>
    </Panel>
  );
}
