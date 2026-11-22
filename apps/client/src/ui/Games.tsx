/**
 * Minigame catalogue (P09, "jogos simples"): the ten games the village really has. The Memory game is the
 * existing one; the nine story games are the calm order/match boards of slice 12. Playing is free, never a
 * donation; no game has a timer, and each can be paused and skipped after three attempts.
 */
import { STORY_GAMES } from "../game/story-games";
import { useVila } from "../game/store";
import { Panel } from "./Panel";
import { SheetNotice, SheetSection } from "./sheet";

export const GAMES = [
  { kind: "memory", icon: "🃏", name: "Jogo da Memória", description: "Encontre os pares." },
  ...STORY_GAMES.map((game) => ({
    kind: "story" as const,
    id: game.id,
    icon: game.icon,
    name: game.title,
    description: game.summary,
  })),
] as const;

export function Games() {
  const open = useVila((s) => s.open);
  return (
    <Panel board="P09" sheet icon="🎲" title="Minijogos da Vila" subtitle="Brincar">
      <SheetSection n={1} icon="🎮" title="Dez jogos, sem cronômetro">
        <div className="sheet-cards">
          {GAMES.map((game) => (
            <div key={game.kind === "memory" ? "memory" : game.id} className="sheet-card">
              <h4>
                <span aria-hidden="true">{game.icon}</span> {game.name}
              </h4>
              <p>{game.description}</p>
              <button
                className="btn btn--primary"
                onClick={() =>
                  game.kind === "memory" ? open({ kind: "memory" }) : open({ kind: "story-game", gameId: game.id })
                }
              >
                Jogar
              </button>
            </div>
          ))}
        </div>
      </SheetSection>
      <SheetNotice tone="info" icon="🎄">
        Jogar nunca é uma doação. Nenhum jogo tem cronômetro; você pode pausar e pular depois de três tentativas.
      </SheetNotice>
    </Panel>
  );
}
