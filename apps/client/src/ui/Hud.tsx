import { useEffect } from "react";

import { MISSIONS } from "@vila/shared/game/progress";
import { activeInventory, questState } from "@vila/shared/game/quests";
import { NPCS, QUEST_INTERACTIONS } from "@vila/shared/game/world";
import { useQuestsEnabled } from "../game/questsFlag";
import { type Nearby, useVila, ZOOM_MAX, ZOOM_MIN } from "../game/store";
import { AccountChip } from "./Account";
import { EnvironmentChip, RemovedNotice } from "./Environment";
import { XpBar } from "./Missions";
import { ModerationBar, ModerationChip } from "./Moderation";
import { Wordmark } from "./Wordmark";

/** Copy of each quest interaction, by `QUEST_INTERACTIONS` id (PROPOSTA quests-v1). */
const INTERACTION_COPY: Record<string, { label: string; done: string }> = {
  "mailbox-open": { label: "📬 Abrir a caixa", done: "Caixa de correio destrancada! Volte a Seu Nivaldo." },
  "sled-ride": { label: "🛷 Dar uma volta", done: "Você deu uma volta no trenó pequeno! Volte a Aurora." },
};

/** Contextual action label: symbol + words, never colour alone (PROPOSTA quests-v1). */
function actionLabel(nearby: NonNullable<Nearby>, readActive: boolean): string {
  switch (nearby.kind) {
    case "npc":
      return `💬 Falar com ${NPCS.find((n) => n.id === nearby.npcId)?.name ?? "morador"}`;
    case "quest":
      return INTERACTION_COPY[nearby.interactionId]?.label ?? "Interagir";
    case "donation-panel":
      return readActive ? "📖 Ler a promessa" : "🎄 Doação global";
    case "tree":
      return "🎄 Doação global";
    case "lot":
      return "🏡 Ver terreno";
  }
}

/** One zoom button/key press: 15% closer or farther. */
const ZOOM_STEP = 1.15;

/** Fixed HUD: brand, missions, indicators, contextual action, zoom and toasts. */
export function Hud() {
  const open = useVila((s) => s.open);
  const nearby = useVila((s) => s.nearby);
  const panel = useVila((s) => s.panel);
  const progress = useVila((s) => s.progress);
  const record = useVila((s) => s.record);
  const notify = useVila((s) => s.notify);
  const done = MISSIONS.filter((m) => progress.completed[m.id]).length;
  const toast = useVila((s) => s.toast);
  const quests = useQuestsEnabled();
  const readActive = quests && questState(progress, "donation-promise-reading") === "active";
  const bag = quests ? activeInventory(progress) : [];
  const zoom = useVila((s) => s.zoom);
  const zoomBy = useVila((s) => s.zoomBy);

  const activate = (n: NonNullable<Nearby>) => {
    switch (n.kind) {
      case "npc":
        open({ kind: "npc", npcId: n.npcId });
        return;
      case "quest": {
        // The quest and the event come from the interaction itself; an unknown id records nothing.
        const interaction = QUEST_INTERACTIONS.find((i) => i.id === n.interactionId);
        if (!interaction) return;
        record(interaction.questId, interaction.id);
        const done = INTERACTION_COPY[interaction.id]?.done;
        if (done) notify(done);
        return;
      }
      case "donation-panel":
      case "tree":
        open({ kind: "donation" });
        return;
      case "lot":
        open({ kind: "lot", lotId: n.lotId });
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useVila.getState().panel.kind !== "none") return;
      if (e.key === "+" || e.key === "=") return zoomBy(1 / ZOOM_STEP);
      if (e.key === "-") return zoomBy(ZOOM_STEP);
      const n = useVila.getState().nearby;
      // Enter on a focused button, link or field belongs to that control: without this, pressing Enter on a HUD
      // button near a house opened the house instead (the panel took the focus before the button was activated).
      const onControl = e.key === "Enter" && e.target instanceof Element && e.target.closest("button, a[href], input, select, textarea, summary") !== null;
      if ((e.key === "e" || e.key === "E" || e.key === "Enter") && n && !onControl) activate(n);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nearby, open, record, notify, zoomBy]);

  return (
    <div className="hud">
      <div className="hud__top">
        <div className="hud__left">
          <button className="hud__brand" onClick={() => open({ kind: "welcome" })} aria-label="Início">
            <Wordmark />
          </button>
          <EnvironmentChip />
          {bag.length > 0 && (
            <div className="hud__bag" role="status" aria-label="Bolsa de missão">
              {bag.map((item) => (
                <span key={item.questId}>
                  {item.name} {item.count}/{item.target}
                </span>
              ))}
            </div>
          )}
          <RemovedNotice />
          <ModerationBar />
        </div>
        <nav className="hud__nav">
          <AccountChip />
          <ModerationChip />
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
        <button className="btn btn--primary hud__action" onClick={() => activate(nearby)}>
          {actionLabel(nearby, readActive)} <kbd>E</kbd>
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
