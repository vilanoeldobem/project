/**
 * One press of Escape, applied to what is on screen (IMPL-0022). The rule is `escapeAction` (pure, in
 * `lib/hud-keys.ts`); this is the one place that reads the layers and acts, so no two listeners can answer the
 * same press: closing a panel never also opens the menu.
 */
import { useVila } from "../game/store";
import { cancelConfirmation, confirmationOpen } from "./confirm";
import { type EscapeAction, escapeAction, type FieldLike, isTextField } from "./hud-keys";

/** `press`: the part of the `keydown` event the rule needs. Returns what was done (null = nothing). */
export function pressEscape(press: { target: FieldLike | null; repeat?: boolean; isComposing?: boolean }): EscapeAction {
  const vila = useVila.getState();
  const action = escapeAction({
    confirmation: confirmationOpen(),
    panel: vila.panel.kind !== "none",
    menu: vila.menu,
    typing: isTextField(press.target),
    repeat: press.repeat,
    composing: press.isComposing,
  });
  if (action === "cancel-confirmation") cancelConfirmation();
  else if (action === "close-panel") vila.close();
  else if (action === "menu-back") vila.showMenu("root");
  else if (action === "close-menu") vila.closeMenu();
  else if (action === "open-menu") vila.openMenu();
  return action;
}
