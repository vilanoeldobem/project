import { useEffect, useMemo, useState } from "react";

import { useVila } from "../game/store";
import { Panel } from "./Panel";

/** Memory game (P09; first minigame in doc 23). Playing is free and is never a donation. */
const SYMBOLS = ["🎁", "⭐", "🔔", "🎄", "🕯️", "🍪", "🧦", "🌺"];

export function shuffle<T>(xs: T[], rand = Math.random): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function MemoryGame() {
  const record = useVila((s) => s.record);
  const [round, setRound] = useState(0);
  const deck = useMemo(() => shuffle([...SYMBOLS, ...SYMBOLS]), [round]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [moves, setMoves] = useState(0);
  const won = matched.size === deck.length;

  useEffect(() => {
    if (flipped.length !== 2) return;
    const [a, b] = flipped;
    const t = setTimeout(
      () => {
        if (deck[a] === deck[b]) setMatched((m) => new Set([...m, a, b]));
        setFlipped([]);
      },
      deck[a] === deck[b] ? 250 : 750
    );
    return () => clearTimeout(t);
  }, [flipped, deck]);

  useEffect(() => {
    if (won) record("play-memory", "win");
  }, [won, record]);

  const flip = (i: number) => {
    if (flipped.length === 2 || flipped.includes(i) || matched.has(i)) return;
    if (flipped.length === 1) setMoves((m) => m + 1);
    setFlipped((f) => [...f, i]);
  };

  const restart = () => {
    setRound((r) => r + 1);
    setFlipped([]);
    setMatched(new Set());
    setMoves(0);
  };

  return (
    <Panel kicker="Jogar gratuitamente" title="Jogo da Memória">
      <p className="note">
        Jogadas: {moves} · Pares: {matched.size / 2}/{SYMBOLS.length}
      </p>
      <div className="memory" role="grid" aria-label="Cartas">
        {deck.map((s, i) => {
          const up = flipped.includes(i) || matched.has(i);
          return (
            <button
              key={`${round}-${i}`}
              className={`card${up ? " card--up" : ""}${matched.has(i) ? " card--ok" : ""}`}
              onClick={() => flip(i)}
              aria-label={up ? s : "Carta virada"}
            >
              {up ? s : ""}
            </button>
          );
        })}
      </div>
      {won && <p className="lead">Muito bem! Você encontrou todos os pares em {moves} jogadas.</p>}
      <button className="btn" onClick={restart}>
        {won ? "Jogar de novo" : "Recomeçar"}
      </button>
    </Panel>
  );
}
