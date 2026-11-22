import { useEffect, useMemo, useState } from "react";

import { activeQuest, questState } from "@vila/shared/game/quests";
import { canSkip } from "../game/story-games";
import { questsEnabled } from "../game/questsFlag";
import { useVila } from "../game/store";
import { Panel } from "./Panel";

/** Memory game (P09; first minigame in doc 23, now the tenth of the saga). Playing is free, never a donation. */
const SYMBOLS = ["🎁", "⭐", "🔔", "🎄", "🕯️", "🍪", "🧦", "🌺"];
const PAIRS = { calma: 4, normal: 6, desafio: 8 } as const;
type Difficulty = keyof typeof PAIRS;

export function shuffle<T>(xs: T[], rand = Math.random): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function MemoryGame({
  interactionId,
  questId,
  done,
}: {
  interactionId?: string;
  questId?: string;
  done?: string;
}) {
  const record = useVila((s) => s.record);
  const notify = useVila((s) => s.notify);
  const close = useVila((s) => s.close);
  const open = useVila((s) => s.open);
  const [difficulty, setDifficulty] = useState<Difficulty>("desafio");
  const [round, setRound] = useState(0);
  const symbols = SYMBOLS.slice(0, PAIRS[difficulty]);
  const deck = useMemo(() => shuffle([...symbols, ...symbols]), [round, difficulty]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [moves, setMoves] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [paused, setPaused] = useState(false);
  const won = matched.size === deck.length;

  useEffect(() => {
    if (flipped.length !== 2) return;
    const [a, b] = flipped;
    const same = deck[a] === deck[b];
    const t = setTimeout(
      () => {
        if (same) setMatched((m) => new Set([...m, a, b]));
        else setAttempts((value) => value + 1);
        setFlipped([]);
      },
      same ? 250 : 750
    );
    return () => clearTimeout(t);
  }, [flipped, deck]);

  useEffect(() => {
    if (!won) return;
    record("play-memory", "win");
    if (interactionId && questId) {
      record(questId, interactionId);
      notify(done ?? "Jogo da Memória concluído.");
      close();
      return;
    }
    // Quest routing (PROPOSTA quests-v1): one win advances the single active minigame quest, if any.
    if (!questsEnabled()) return;
    const progress = useVila.getState().progress;
    const quest = activeQuest(progress);
    if (quest && quest.objectiveType === "minigame" && questState(progress, quest.id) === "active") record(quest.id, "memory-win");
  }, [won, record, notify, close, interactionId, questId, done]);

  const flip = (i: number) => {
    if (paused || flipped.length === 2 || flipped.includes(i) || matched.has(i)) return;
    if (flipped.length === 1) setMoves((m) => m + 1);
    setFlipped((f) => [...f, i]);
  };

  const reset = (next: Difficulty) => {
    setDifficulty(next);
    setRound(0);
    setFlipped([]);
    setMatched(new Set());
    setMoves(0);
    setAttempts(0);
  };

  const restart = () => {
    setRound((r) => r + 1);
    setFlipped([]);
    setMatched(new Set());
    setMoves(0);
    setAttempts((value) => value + 1);
  };

  const skip = () => {
    if (!canSkip(attempts)) return;
    if (interactionId && questId) {
      record(questId, interactionId);
      notify(done ?? "Jogo da Memória pulado.");
    }
    close();
  };

  return (
    <Panel kicker="Jogar gratuitamente" title="Jogo da Memória" subtitle="Jogar nunca é uma doação.">
      <div className="game-tabs" role="group" aria-label="Dificuldade">
        {(Object.keys(PAIRS) as Difficulty[]).map((item) => (
          <button
            key={item}
            type="button"
            className={`btn btn--chip${item === difficulty ? " is-on" : ""}`}
            aria-pressed={item === difficulty}
            onClick={() => reset(item)}
          >
            {item === "calma" ? "Calma" : item === "normal" ? "Normal" : "Desafio"}
          </button>
        ))}
      </div>
      <p className="note">
        Jogadas: {moves} · Pares: {matched.size / 2}/{symbols.length} · Tentativas: {attempts}
      </p>
      {paused ? (
        <p className="game-paused">Jogo pausado. Nada corre enquanto você descansa.</p>
      ) : (
        <div className="memory" role="grid" aria-label="Cartas">
          {deck.map((s, i) => {
            const up = flipped.includes(i) || matched.has(i);
            return (
              <button
                key={`${round}-${difficulty}-${i}`}
                className={`card${up ? " card--up" : ""}${matched.has(i) ? " card--ok" : ""}`}
                onClick={() => flip(i)}
                aria-label={up ? s : "Carta virada"}
              >
                {up ? s : ""}
              </button>
            );
          })}
        </div>
      )}
      {won && !interactionId && <p className="lead">Muito bem! Você encontrou todos os pares em {moves} jogadas.</p>}
      <div className="actions">
        <button className="btn" type="button" onClick={() => setPaused((value) => !value)}>
          {paused ? "Continuar" : "Pausar"}
        </button>
        <button className="btn" type="button" onClick={restart} disabled={paused}>
          {won ? "Jogar de novo" : "Recomeçar"}
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
