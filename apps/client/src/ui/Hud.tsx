import { useEffect } from "react";

import { MISSIONS } from "@vila/shared/game/progress";
import { useVila, ZOOM_MAX, ZOOM_MIN } from "../game/store";
import { AccountChip } from "./Account";
import { EnvironmentChip } from "./Environment";
import { XpBar } from "./Missions";
import { Wordmark } from "./Wordmark";

/** One zoom button/key press: 15% closer or farther. */
const ZOOM_STEP = 1.15;

/** Fixed HUD: brand, missions, indicators, contextual action, zoom and toasts. */
export function Hud() {
  const open = useVila((s) => s.open);
  const nearby = useVila((s) => s.nearby);
  const panel = useVila((s) => s.panel);
  const done = useVila((s) => Object.keys(s.progress.completed).length);
  const toast = useVila((s) => s.toast);
  const zoom = useVila((s) => s.zoom);
  const zoomBy = useVila((s) => s.zoomBy);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useVila.getState().panel.kind !== "none") return;
      if (e.key === "+" || e.key === "=") return zoomBy(1 / ZOOM_STEP);
      if (e.key === "-") return zoomBy(ZOOM_STEP);
      if ((e.key === "e" || e.key === "Enter") && nearby) {
        open(nearby.kind === "tree" ? { kind: "donation" } : { kind: "lot", lotId: nearby.lotId });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nearby, open, zoomBy]);

  return (
    <div className="hud">
      <div className="hud__top">
        <div className="hud__left">
          <button className="hud__brand" onClick={() => open({ kind: "welcome" })} aria-label="Início">
            <Wordmark />
          </button>
          <EnvironmentChip />
        </div>
        <nav className="hud__nav">
          <AccountChip />
          <button className="btn btn--chip" onClick={() => open({ kind: "explore" })} aria-label="Explorar ONGs">
            🏡 <span>Explorar ONGs</span>
          </button>
          <button className="btn btn--chip" onClick={() => open({ kind: "memory" })} aria-label="Jogar">
            🎲 <span>Jogar</span>
          </button>
          <button className="btn btn--chip" onClick={() => open({ kind: "indicators" })} aria-label="Indicadores">
            📊 <span>Indicadores</span>
          </button>
        </nav>
      </div>

      <button className="hud__missions" onClick={() => open({ kind: "missions" })} aria-label="Abrir Caderno de Missões">
        <span className="star">★</span>
        <span>
          Missões {done}/{MISSIONS.length}
        </span>
        <XpBar compact />
      </button>

      {panel.kind === "none" && nearby && (
        <button
          className="btn btn--primary hud__action"
          onClick={() => open(nearby.kind === "tree" ? { kind: "donation" } : { kind: "lot", lotId: nearby.lotId })}
        >
          {nearby.kind === "tree" ? "🎄 Doação global" : "🏡 Ver terreno"} <kbd>E</kbd>
        </button>
      )}

      {panel.kind === "none" && (
        <div className="hud__zoom" role="group" aria-label="Zoom da câmera">
          <button className="btn btn--chip" onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} aria-label="Aproximar" title="Aproximar (+)">
            ＋
          </button>
          <button className="btn btn--chip" onClick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} aria-label="Afastar" title="Afastar (−)">
            －
          </button>
        </div>
      )}

      {toast && <Toast key={toast.id} text={toast.text} />}
    </div>
  );
}

function Toast({ text }: { text: string }) {
  return (
    <div className="toast" role="status">
      {text}
    </div>
  );
}
