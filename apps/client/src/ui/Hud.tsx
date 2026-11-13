import { useEffect } from "react";

import { MISSIONS } from "@vila/shared/game/progress";
import { activeInventory, questState } from "@vila/shared/game/quests";
import { NPCS, QUEST_INTERACTIONS } from "@vila/shared/game/world";
import { useQuestsEnabled } from "../game/questsFlag";
import { type Nearby, type Panel, TOAST_MS, useVila } from "../game/store";
import { useAccount } from "../lib/account";
import { pressEscape } from "../lib/escape";
import { boundAction, heldOnControl, hudKeyAction, isTextField, KEY_BINDINGS } from "../lib/hud-keys";
import { moderating, useModeration } from "../lib/moderation";
import { AccountChip } from "./Account";
import { EnvironmentChip, RemovedNotice } from "./Environment";
import { XpBar } from "./Missions";
import { ModerationBar, ModerationChip } from "./Moderation";

/** Copy of each quest interaction, by `QUEST_INTERACTIONS` id (PROPOSTA quests-v1). */
const INTERACTION_COPY: Record<string, { label: string; done: string }> = {
  "mailbox-open": { label: "📬 Abrir a caixa", done: "Caixa de correio destrancada! Volte a Seu Nivaldo." },
  "sled-ride": { label: "🛷 Dar uma volta", done: "Você deu uma volta no trenó pequeno! Volte a Aurora." },
};

/** Contextual action label: symbol + words, never colour alone (PROPOSTA quests-v1; places of IMPL-0023). */
export function actionLabel(nearby: NonNullable<Nearby>, readActive: boolean): string {
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
    case "plot":
      return "🏠 Ver terreno residencial";
    case "shop":
      return "🎁 Ver loja";
    case "billboard":
      return "📜 Ler placa";
  }
}

/**
 * The one contextual action of the game: what the action button, E and Enter do with the thing the avatar is
 * next to. Every kind of `Nearby` is decided here and nowhere else, so a lot, a villager, the tree and the
 * places of the expanded village (residential plot, shop, billboard: IMPL-0023) follow the same rules: the key
 * map, a held key, the hint that gives way, Escape. Each opens its panel, except a quest interaction, which
 * records its event.
 */
export function activate(n: NonNullable<Nearby>, vila: Pick<ReturnType<typeof useVila.getState>, "open" | "record" | "notify"> = useVila.getState()): void {
  switch (n.kind) {
    case "npc":
      vila.open({ kind: "npc", npcId: n.npcId });
      return;
    case "quest": {
      // The quest and the event come from the interaction itself; an unknown id records nothing.
      const interaction = QUEST_INTERACTIONS.find((i) => i.id === n.interactionId);
      if (!interaction) return;
      vila.record(interaction.questId, interaction.id);
      const done = INTERACTION_COPY[interaction.id]?.done;
      if (done) vila.notify(done);
      return;
    }
    case "donation-panel":
    case "tree":
      vila.open({ kind: "donation" });
      return;
    case "lot":
      vila.open({ kind: "lot", lotId: n.lotId });
      return;
    case "plot":
      vila.open({ kind: "plot", plotId: n.plotId });
      return;
    case "shop":
      vila.open({ kind: "shop", shopId: n.shopId });
      return;
    case "billboard":
      vila.open({ kind: "billboard", billboardId: n.billboardId });
  }
}

/**
 * The three paths of the arrival (P01, DEC-008): on the HUD from the first second, with their names, one press
 * away and with no modal in front of them (PROPOSTA, IMPL-0022). Each opens the panel it always opened.
 */
export const PATHS: ReadonlyArray<{ id: string; icon: string; label: string; panel: Panel }> = [
  { id: "explore", icon: "🏡", label: "Explorar ONGs", panel: { kind: "explore" } },
  { id: "play", icon: "🎲", label: "Jogar", panel: { kind: "memory" } },
  { id: "donation", icon: "🎄", label: "Doação global", panel: { kind: "donation" } },
];

/** One zoom key press: 15% closer or farther. */
const ZOOM_STEP = 1.15;

/**
 * Fixed HUD (IMPL-0022). Top: what is happening now (time, weather, visitors, sky view) and one navigation
 * group (the three paths, then indicators, account, moderation and the menu). Below it: mission bag and
 * notices. Bottom: the contextual action and the mission tracker. The centre of the screen stays clear. There
 * is no brand and there are no zoom buttons here: zoom is the wheel, the pinch and the + / - keys.
 */
export function Hud() {
  const open = useVila((s) => s.open);
  const openMenu = useVila((s) => s.openMenu);
  const nearby = useVila((s) => s.nearby);
  const idle = useVila((s) => s.panel.kind === "none" && s.menu === null);
  const menuOpen = useVila((s) => s.menu !== null);
  const progress = useVila((s) => s.progress);
  const done = MISSIONS.filter((m) => progress.completed[m.id]).length;
  const toast = useVila((s) => s.toast);
  const quests = useQuestsEnabled();
  const readActive = quests && questState(progress, "donation-promise-reading") === "active";
  const bag = quests ? activeInventory(progress) : [];
  const zoomBy = useVila((s) => s.zoomBy);
  const user = useAccount((s) => s.user);
  const moderationOn = useModeration((s) => s.on);
  /** The moderation block is on screen (`ModerationBar`): the line that says how to walk gives it the room. */
  const moderation = moderating(user, moderationOn);

  useEffect(() => {
    // The one key listener of the game: every key comes from the key map (`lib/hud-keys.ts`).
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (boundAction(e.key) === "menu") {
        // Escape: a confirmation, then a panel, then the menu (`lib/escape.ts`). One press, one layer.
        if (pressEscape({ target, repeat: e.repeat, isComposing: e.isComposing })) e.preventDefault();
        return;
      }
      const vila = useVila.getState();
      if (vila.panel.kind !== "none" || vila.menu !== null || isTextField(target)) return;
      // Enter held down presses a HUD button once: the repeats that reach one are dropped (`heldOnControl`).
      if (heldOnControl(e.key, target, e.repeat)) return void e.preventDefault();
      const n = vila.nearby;
      // E opens what is near whatever has the focus; Enter only when the focus is not on a control (`hudKeyAction`).
      const action = hudKeyAction(e.key, target, n !== null, e.repeat);
      if (action === "zoom-in") zoomBy(1 / ZOOM_STEP);
      else if (action === "zoom-out") zoomBy(ZOOM_STEP);
      else if (action === "activate" && n) activate(n, vila);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomBy]);

  return (
    <div className="hud">
      <nav className="hud__top" aria-label="Vila">
        <EnvironmentChip />
        <div className="hud__nav">
          <div className="hud__group hud__paths" role="group" aria-label="Caminhos da Vila">
            {PATHS.map((path) => (
              <button key={path.id} className="btn btn--chip" data-path={path.id} onClick={() => open(path.panel)}>
                <span className="chip__icon" aria-hidden="true">
                  {path.icon}
                </span>
                <span className="chip__label">{path.label}</span>
              </button>
            ))}
          </div>
          <div className="hud__group hud__system" role="group" aria-label="Indicadores, conta e menu">
            <button className="btn btn--chip chip--wide" onClick={() => open({ kind: "indicators" })} aria-label="Indicadores" data-tip="Indicadores">
              <span className="chip__icon" aria-hidden="true">
                📊
              </span>
              <span className="chip__label">Indicadores</span>
            </button>
            <AccountChip />
            <ModerationChip />
            <button className="btn btn--chip" onClick={openMenu} aria-label="Menu" aria-haspopup="dialog" aria-expanded={menuOpen} data-tip="Menu" data-menu="open">
              <span className="chip__icon" aria-hidden="true">
                ☰
              </span>
              <span className="chip__label">Menu</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="hud__mid">
        <div className="hud__info">
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
        {toast && <Toast key={toast.id} id={toast.id} text={toast.text} />}
      </div>

      <div className="hud__bottom">
        <MoveHint visible={idle && !nearby && !moderation} />
        {idle && nearby && (
          <button className="btn btn--primary hud__action" onClick={() => activate(nearby)}>
            {actionLabel(nearby, readActive)} <kbd>E</kbd>
          </button>
        )}
        <button className="hud__missions" onClick={() => open({ kind: "missions" })} aria-label="Abrir Caderno de Missões">
          <span className="star" aria-hidden="true">
            ★
          </span>
          <span>
            Missões {done}/{MISSIONS.length}
          </span>
          <XpBar compact />
        </button>
      </div>
    </div>
  );
}

/** The key that opens the game menu, as the key map names it (the "Controles" view lists the same cap). */
const MENU_KEY = KEY_BINDINGS.find((b) => b.action === "menu")?.caps[0] ?? "Esc";
const WALK_HINT = "Clique ou toque no chão para andar.";

/**
 * How to walk, for a visitor who has not walked yet in this browser (IMPL-0022): one line, not a dialog. It
 * appears with the scene (not while the village loads), takes no clicks, goes away at the first walk (for good)
 * or `MOVE_HINT_MS` after the scene is on screen (the store counts the time), and is never shown again once the
 * visitor has walked. It also says what helps without a mouse (hidden on touch screens, `styles.css`).
 *
 * `visible`: nothing else needs the place of the line (a panel, the menu, the action button, the moderation
 * block). The line is announced by a live region of its own, which is on the page from the first render, empty,
 * and holds the sentence for as long as the hint lasts: a region that arrived with its text would not be
 * announced, and one that lost and regained it with every panel would be announced again.
 */
function MoveHint({ visible }: { visible: boolean }) {
  const hinting = useVila((s) => s.moveHint && s.sceneReady);
  const explore = PATHS[0].label;
  return (
    <>
      <p className="sr-only" role="status" data-hint="announce">
        {hinting ? `${WALK_HINT} Sem mouse: “${explore}” leva até uma casa e a tecla ${MENU_KEY} abre o menu.` : ""}
      </p>
      {hinting && visible && (
        <p className="hud__hint" aria-hidden="true" data-hint="move">
          {WALK_HINT}
          <span className="hint__keys">
            {" "}
            Sem mouse: “{explore}” leva até uma casa e <kbd>{MENU_KEY}</kbd> abre o menu.
          </span>
        </p>
      )}
    </>
  );
}

/**
 * A passing notice. It leaves `TOAST_MS` after it is drawn (not after it was asked for: a notice asked for while
 * the village loads would lose part of its time), with or without its fade: under `prefers-reduced-motion` it is
 * drawn as it is until then (`styles.css`).
 */
function Toast({ id, text }: { id: number; text: string }) {
  const dismiss = useVila((s) => s.dismissToast);
  useEffect(() => {
    const timer = setTimeout(() => dismiss(id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [id, dismiss]);
  return (
    <div className="toast" role="status">
      {text}
    </div>
  );
}
