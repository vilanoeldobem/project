import { useEffect } from "react";

import { MISSIONS } from "@vila/shared/game/progress";
import { activeInventory, questState } from "@vila/shared/game/quests";
import { NPCS } from "@vila/shared/game/world";
import { questsEnabled } from "../game/questsFlag";
import { type Nearby, useVila } from "../game/store";
import { AccountChip } from "./Account";
import { EnvironmentChip } from "./Environment";
import { XpBar } from "./Missions";
import { Wordmark } from "./Wordmark";

/** Contextual action label: symbol + words, never colour alone (PROPOSTA quests-v1). */
function actionLabel(nearby: NonNullable<Nearby>, readActive: boolean): string {
  switch (nearby.kind) {
    case "npc":
      return `💬 Falar com ${NPCS.find((n) => n.id === nearby.npcId)?.name ?? "morador"}`;
    case "quest":
      return nearby.interactionId === "mailbox-open" ? "📬 Abrir a caixa" : "🛷 Dar uma volta";
    case "donation-panel":
      return readActive ? "📖 Ler a promessa" : "🎄 Doação global";
    case "tree":
      return "🎄 Doação global";
    case "lot":
      return "🏡 Ver terreno";
  }
}

/** Fixed HUD: brand, missions, indicators, contextual action and toasts. */
export function Hud() {
  const open = useVila((s) => s.open);
  const nearby = useVila((s) => s.nearby);
  const panel = useVila((s) => s.panel);
  const progress = useVila((s) => s.progress);
  const record = useVila((s) => s.record);
  const notify = useVila((s) => s.notify);
  const done = MISSIONS.filter((m) => progress.completed[m.id]).length;
  const toast = useVila((s) => s.toast);
  const quests = questsEnabled();
  const readActive = quests && questState(progress, "donation-promise-reading") === "active";
  const bag = quests ? activeInventory(progress) : [];

  const activate = (n: NonNullable<Nearby>) => {
    switch (n.kind) {
      case "npc":
        open({ kind: "npc", npcId: n.npcId });
        return;
      case "quest":
        if (n.interactionId === "mailbox-open") {
          record("frozen-mailbox", "mailbox-open");
          notify("Caixa de correio destrancada! Volte a Seu Nivaldo.");
        } else {
          record("kids-sled-run", "sled-ride");
          notify("Você deu uma volta no trenó pequeno! Volte a Aurora.");
        }
        return;
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
      const n = useVila.getState().nearby;
      if ((e.key === "e" || e.key === "E" || e.key === "Enter") && n) activate(n);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nearby, open, record, notify]);

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
        <button className="btn btn--primary hud__action" onClick={() => activate(nearby)}>
          {actionLabel(nearby, readActive)} <kbd>E</kbd>
        </button>
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
