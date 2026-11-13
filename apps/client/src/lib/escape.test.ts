/**
 * Escape on the real store and the real confirmation registry (IMPL-0022): one press closes one layer, in the
 * order confirmation → panel → menu, and the press that closes a panel never also opens the menu. Runs in Node
 * (the store needs no browser); every test leaves the store as it found it.
 */
import { afterEach, describe, expect, it } from "vitest";

import { useVila } from "../game/store";
import { cancelConfirmation, confirmationOpen, registerConfirmation } from "./confirm";
import { pressEscape } from "./escape";

const SCENE = { tagName: "CANVAS" };
const TEXT = { tagName: "INPUT", type: "text" };
const press = (target: { tagName: string; type?: string } | null = SCENE) => pressEscape({ target });
const layers = () => ({ panel: useVila.getState().panel.kind, menu: useVila.getState().menu });

/** A confirmation step on screen; `cancelled` counts what its "Cancelar" would have done. */
function confirmation(busy = false) {
  const step = { current: { busy, onCancel: () => void (seen.cancelled += 1) } };
  const seen = { cancelled: 0, step, remove: registerConfirmation(step) };
  mounted.push(seen.remove);
  return seen;
}
let mounted: Array<() => void> = [];

afterEach(() => {
  mounted.forEach((remove) => remove());
  mounted = [];
  useVila.setState({ panel: { kind: "none" }, menu: null });
});

describe("Escape with nothing open", () => {
  it("opens the game menu, and the next press closes it", () => {
    expect(press()).toBe("open-menu");
    expect(layers()).toEqual({ panel: "none", menu: "root" });
    expect(press()).toBe("close-menu");
    expect(layers()).toEqual({ panel: "none", menu: null });
  });

  it("does nothing from a text field, and nothing while the key is held down", () => {
    expect(press(TEXT)).toBeNull();
    expect(pressEscape({ target: SCENE, repeat: true })).toBeNull();
    expect(pressEscape({ target: SCENE, isComposing: true })).toBeNull();
    expect(layers()).toEqual({ panel: "none", menu: null });
  });

  it("opens the menu with the focus on a HUD button or on nothing at all", () => {
    expect(press({ tagName: "BUTTON" })).toBe("open-menu");
    useVila.getState().closeMenu();
    expect(press(null)).toBe("open-menu");
  });
});

describe("Escape with a panel open", () => {
  it("closes the panel and leaves the menu closed: a second press is needed to open it", () => {
    useVila.getState().open({ kind: "missions" });
    expect(press()).toBe("close-panel");
    expect(layers()).toEqual({ panel: "none", menu: null });
    expect(press()).toBe("open-menu");
  });

  it("closes the panel from one of its text fields, as before", () => {
    useVila.getState().open({ kind: "account" });
    expect(press(TEXT)).toBe("close-panel");
    expect(layers()).toEqual({ panel: "none", menu: null });
  });
});

describe("Escape with a confirmation open", () => {
  it("cancels the confirmation and keeps the panel under it; then the panel; then the menu", () => {
    useVila.getState().open({ kind: "account" });
    const step = confirmation();
    expect(press()).toBe("cancel-confirmation");
    expect(step.cancelled).toBe(1);
    expect(layers()).toEqual({ panel: "account", menu: null });
    step.remove(); // the step left the screen with its "Cancelar"
    expect(press()).toBe("close-panel");
    expect(press()).toBe("open-menu");
  });

  it("goes to the newest confirmation, and does nothing while its action is being sent", () => {
    const first = confirmation();
    const second = confirmation(true);
    expect(press()).toBe("cancel-confirmation"); // the press is spent on the confirmation…
    expect([first.cancelled, second.cancelled]).toEqual([0, 0]); // …whose "Cancelar" is disabled
    expect(layers()).toEqual({ panel: "none", menu: null });
    second.step.current = { ...second.step.current, busy: false };
    press();
    expect([first.cancelled, second.cancelled]).toEqual([0, 1]);
  });

  it("forgets a confirmation that left the screen", () => {
    const step = confirmation();
    expect(confirmationOpen()).toBe(true);
    step.remove();
    step.remove(); // removing twice is harmless
    expect(confirmationOpen()).toBe(false);
    cancelConfirmation();
    expect(step.cancelled).toBe(0);
  });
});

describe("Escape inside the game menu", () => {
  it("goes back to the list from a view, then closes the menu", () => {
    useVila.getState().openMenu();
    useVila.getState().showMenu("controls");
    expect(press()).toBe("menu-back");
    expect(layers().menu).toBe("root");
    expect(press()).toBe("close-menu");
    expect(layers().menu).toBeNull();
  });

  it("answers the question of 'Sair da Vila' with a cancel, never with a yes", () => {
    useVila.getState().openMenu();
    useVila.getState().showMenu("leave");
    // The menu's confirmation cancels back to the list (`Menu.tsx`).
    const step = { current: { busy: false, onCancel: () => useVila.getState().showMenu("root") } };
    mounted.push(registerConfirmation(step));
    expect(press()).toBe("cancel-confirmation");
    expect(layers()).toEqual({ panel: "none", menu: "root" });
  });
});
