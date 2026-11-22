/**
 * One story minigame panel (PROPOSTA, slice 12). Calm by construction: no timer, a visible rule and hint,
 * adjustable difficulty, a pause, and a skip that becomes available after three attempts. A win or a skip
 * records the active quest's interaction event and closes the panel, so the player can turn the quest in.
 */
import { useMemo, useState } from "react";

import {
  canSkip,
  matchCorrect,
  matchScore,
  orderCorrect,
  orderScore,
  storyGame,
  type Difficulty,
  type MatchPuzzle,
  type OrderPuzzle,
  type StoryGameId,
} from "../game/story-games";
import { useVila } from "../game/store";
import { Panel } from "./Panel";

const DIFFICULTIES: readonly { id: Difficulty; label: string }[] = [
  { id: "calma", label: "Calma" },
  { id: "normal", label: "Normal" },
  { id: "desafio", label: "Desafio" },
];

export function StoryGamePanel({
  gameId,
  interactionId,
  questId,
  done,
}: {
  gameId: StoryGameId;
  interactionId?: string;
  questId?: string;
  done?: string;
}) {
  const def = storyGame(gameId);
  const record = useVila((s) => s.record);
  const notify = useVila((s) => s.notify);
  const close = useVila((s) => s.close);
  const open = useVila((s) => s.open);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [round, setRound] = useState(0);
  const [picks, setPicks] = useState<string[]>([]);
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState("");
  const puzzle = useMemo(() => def?.build(difficulty, `r${round}`) ?? null, [def, difficulty, round]);

  if (!def || !puzzle) return null;

  const clear = () => {
    setPicks([]);
    setPairs({});
    setSelected(null);
    setStatus("");
  };

  const changeDifficulty = (next: Difficulty) => {
    setDifficulty(next);
    setRound(0);
    setAttempts(0);
    clear();
  };

  const retry = () => {
    setRound((value) => value + 1);
    clear();
  };

  const finish = (skipped: boolean) => {
    if (interactionId && questId) record(questId, interactionId);
    notify(done ?? `${def.title}: ${skipped ? "pulado" : "concluído"}.`);
    close();
  };

  const check = () => {
    if (paused) return;
    if (puzzle.kind === "order") {
      if (orderCorrect(puzzle, picks)) {
        finish(false);
        return;
      }
      setAttempts((value) => value + 1);
      setStatus(`${orderScore(puzzle, picks)} de ${puzzle.solution.length} no lugar. Tente outra vez.`);
      return;
    }
    if (matchCorrect(puzzle, pairs)) {
      finish(false);
      return;
    }
    setAttempts((value) => value + 1);
    setStatus(`${matchScore(puzzle, pairs)} de ${puzzle.left.length} pares certos. Tente outra vez.`);
  };

  const skip = () => {
    if (canSkip(attempts)) finish(true);
  };

  return (
    <Panel board="P09" sheet icon={def.icon} title={def.title} subtitle="Jogar nunca é uma doação.">
      <p className="lead">{def.instruction}</p>
      <div className="game-tabs" role="group" aria-label="Dificuldade">
        {DIFFICULTIES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`btn btn--chip${item.id === difficulty ? " is-on" : ""}`}
            aria-pressed={item.id === difficulty}
            onClick={() => changeDifficulty(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="note">
        <strong>{puzzle.rule}</strong>
      </p>
      <p className="note">Dica: {puzzle.hint}</p>

      {paused ? (
        <p className="game-paused">Jogo pausado. Nada corre enquanto você descansa.</p>
      ) : puzzle.kind === "order" ? (
        <OrderBoard puzzle={puzzle} picks={picks} setPicks={setPicks} />
      ) : (
        <MatchBoard puzzle={puzzle} pairs={pairs} setPairs={setPairs} selected={selected} setSelected={setSelected} />
      )}

      <p className="game-status" role="status" aria-live="polite">
        {status}
      </p>
      <p className="note">Tentativas: {attempts}. O botão de pular fica disponível depois de 3 tentativas.</p>
      <div className="actions">
        <button className="btn" type="button" onClick={() => setPaused((value) => !value)}>
          {paused ? "Continuar" : "Pausar"}
        </button>
        <button className="btn btn--primary" type="button" onClick={check} disabled={paused}>
          Conferir
        </button>
        <button className="btn" type="button" onClick={retry} disabled={paused}>
          Tentar outra vez
        </button>
        <button className="btn" type="button" onClick={skip} disabled={!canSkip(attempts)}>
          {canSkip(attempts) ? "Pular minijogo" : "Pular minijogo (3 tentativas)"}
        </button>
        <button className="btn" type="button" onClick={() => open({ kind: "games" })}>
          Voltar aos minijogos
        </button>
      </div>
    </Panel>
  );
}

function OrderBoard({
  puzzle,
  picks,
  setPicks,
}: {
  puzzle: OrderPuzzle;
  picks: string[];
  setPicks: (value: string[] | ((current: string[]) => string[])) => void;
}) {
  const byId = new Map(puzzle.tokens.map((token) => [token.id, token]));
  return (
    <>
      <div className="game-board" aria-label="Cartas fora de ordem">
        {puzzle.tokens
          .filter((token) => !picks.includes(token.id))
          .map((token) => (
            <button key={token.id} className="game-token" type="button" onClick={() => setPicks((current) => (current.includes(token.id) ? current : [...current, token.id]))}>
              {token.label}
            </button>
          ))}
      </div>
      {picks.length === 0 && <p className="note">Toque nas cartas para montar a ordem.</p>}
      <ol className="game-answer" aria-label="Sua ordem">
        {picks.map((id, index) => {
          const token = byId.get(id);
          return (
            <li key={id}>
              <span>
                {index + 1}. {token?.label}
              </span>
              <button className="btn" type="button" onClick={() => setPicks(picks.filter((pick) => pick !== id))}>
                Remover {token?.label}
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function MatchBoard({
  puzzle,
  pairs,
  setPairs,
  selected,
  setSelected,
}: {
  puzzle: MatchPuzzle;
  pairs: Record<string, string>;
  setPairs: (value: Record<string, string> | ((current: Record<string, string>) => Record<string, string>)) => void;
  selected: string | null;
  setSelected: (value: string | null) => void;
}) {
  const rightById = new Map(puzzle.right.map((token) => [token.id, token]));
  const leftById = new Map(puzzle.left.map((token) => [token.id, token]));
  const pick = (id: string) => {
    setSelected(id);
    setPairs((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };
  return (
    <>
      <div className="game-board" aria-label="Lado esquerdo">
        {puzzle.left.map((token) => (
          <button
            key={token.id}
            className="game-token"
            type="button"
            aria-pressed={selected === token.id}
            onClick={() => pick(token.id)}
          >
            {token.label}
            {pairs[token.id] ? ` → ${rightById.get(pairs[token.id])?.label ?? ""}` : ""}
          </button>
        ))}
      </div>
      <div className="game-board" aria-label="Lado direito">
        {puzzle.right.map((token) => (
          <button
            key={token.id}
            className="game-token"
            type="button"
            onClick={() => {
              if (!selected) return;
              setPairs((current) => ({ ...current, [selected]: token.id }));
              setSelected(null);
            }}
          >
            {token.label}
          </button>
        ))}
      </div>
      {Object.keys(pairs).length === 0 && <p className="note">Toque numa carta da esquerda e depois no par da direita.</p>}
      <ul className="game-answer" aria-label="Seus pares">
        {Object.entries(pairs).map(([leftId, rightId]) => (
          <li key={leftId}>
            <span>
              {leftById.get(leftId)?.label} → {rightById.get(rightId)?.label}
            </span>
            <button
              className="btn"
              type="button"
              onClick={() =>
                setPairs((current) => {
                  const next = { ...current };
                  delete next[leftId];
                  return next;
                })
              }
            >
              Desfazer {leftById.get(leftId)?.label}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
