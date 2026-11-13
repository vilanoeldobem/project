/**
 * Keys on the HUD (no panel open): E and Enter open what is near, whatever HUD button has the focus, except
 * Enter on a moderation control; + = and - zoom; Escape is the menu key, with its order of precedence
 * (IMPL-0022). The DOM is a few fake elements with the one method the rule uses (`closest`), checked against
 * the markup the real components render.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Me } from "@vila/shared/accounts/contract";

import { ModerationBarView, ModerationChipView } from "../ui/Moderation";
import { boundAction, escapeAction, type EscapeLayers, hudKeyAction, isTextField, KEY_BINDINGS, type KeyTarget, onModerationControl } from "./hud-keys";

interface FakeElement extends KeyTarget {
  tag: string;
  attributes: string[];
  parent: FakeElement | null;
}

/** One simple selector of the kinds the rule uses: `tag`, `[attribute]` or `tag[attribute]`. */
const matches = (e: FakeElement, selector: string): boolean => {
  const [, tag, attribute] = /^([a-z]*)(?:\[([a-z-]+)\])?$/.exec(selector.trim()) ?? [];
  return (!tag || e.tag === tag) && (!attribute || e.attributes.includes(attribute)) && Boolean(tag || attribute);
};

function element(tag: string, attributes: string[] = [], parent: FakeElement | null = null): FakeElement {
  const self: FakeElement = {
    tag,
    attributes,
    parent,
    closest(selector) {
      for (let e: FakeElement | null = self; e; e = e.parent) if (selector.split(",").some((one) => matches(e!, one))) return e;
      return null;
    },
  };
  return self;
}

/** The HUD as `Hud.tsx` and `Moderation.tsx` draw it, reduced to what can hold the focus. */
const hud = element("div");
const nav = element("nav", [], hud);
const explore = element("button", ["aria-label"], nav); // "Explorar ONGs"
const exploreLabel = element("span", [], explore);
const menuButton = element("button", ["aria-label", "data-menu"], element("div", ["role"], nav)); // "Menu"
const moderationSwitch = element("button", ["aria-pressed", "data-moderation"], nav);
const bar = element("section", ["data-moderation", "tabindex"], hud);
const confirmStep = element("div", ["data-confirm", "tabindex"], bar);
const confirmButton = element("button", [], element("div", [], confirmStep));
const offButton = element("button", [], bar);
const canvas = element("canvas");

describe("keys on the HUD", () => {
  it("opens what is near with Enter after 'Explorar ONGs → Ir até lá', when the focus is back on that chip", () => {
    // The panel closed and the focus returned to the button that opened it; the avatar walked to the house.
    expect(hudKeyAction("Enter", explore, true)).toBe("activate");
    expect(hudKeyAction("Enter", exploreLabel, true)).toBe("activate");
  });

  it("opens what is near with Enter after closing the menu left the focus on its button", () => {
    expect(hudKeyAction("Enter", menuButton, true)).toBe("activate");
  });

  it("leaves Enter to a moderation control: the switch and every button of the moderation block", () => {
    for (const control of [moderationSwitch, confirmButton, offButton]) {
      expect(onModerationControl(control)).toBe(true);
      expect(hudKeyAction("Enter", control, true)).toBeNull();
    }
  });

  it("treats nothing else as a moderation control: the scene, another HUD button, the focused block itself", () => {
    for (const other of [null, canvas, explore, menuButton, bar, confirmStep]) expect(onModerationControl(other)).toBe(false);
    // The block and its question take the focus without being buttons: Enter there is the game's, as on the scene.
    expect(hudKeyAction("Enter", bar, true)).toBe("activate");
    expect(hudKeyAction("Enter", canvas, true)).toBe("activate");
    expect(hudKeyAction("Enter", null, true)).toBe("activate");
  });

  it("keeps E for what is near everywhere, and does nothing when nothing is near", () => {
    for (const key of ["e", "E"]) for (const target of [null, canvas, explore, moderationSwitch, confirmButton]) expect(hudKeyAction(key, target, true)).toBe("activate");
    for (const key of ["e", "E", "Enter"]) for (const target of [null, explore, moderationSwitch]) expect(hudKeyAction(key, target, false)).toBeNull();
    expect(hudKeyAction("a", canvas, true)).toBeNull();
  });

  it("zooms with + = and -, near something or not", () => {
    for (const nearby of [true, false]) {
      expect([hudKeyAction("+", null, nearby), hudKeyAction("=", explore, nearby), hudKeyAction("-", moderationSwitch, nearby)]).toEqual(["zoom-in", "zoom-in", "zoom-out"]);
    }
  });

  it("follows the key map: every listed key does what the map says, and nothing else is bound", () => {
    expect(KEY_BINDINGS.map((b) => b.action)).toEqual(["activate", "zoom-in", "zoom-out", "menu"]);
    for (const binding of KEY_BINDINGS) {
      expect(binding.caps.length > 0 && binding.does.length > 0).toBe(true);
      for (const key of binding.keys) {
        expect(boundAction(key)).toBe(binding.action);
        expect(hudKeyAction(key, canvas, true)).toBe(binding.action);
      }
    }
    for (const key of ["a", "w", "ArrowUp", " ", "Tab", "m", "M"]) expect(boundAction(key)).toBeNull();
    // Escape is the menu key whether or not something is near; what it closes first is `escapeAction`.
    expect(hudKeyAction("Escape", null, false)).toBe("menu");
  });

  it("matches the markup: the switch is a marked button, the block is marked and its controls are buttons inside it", () => {
    const ADMIN: Me = { id: "a1", name: "Ana Lima", nickname: "ana_admin", city: "Recife", email: "ana@example.com", role: "admin" };
    const noop = () => {};
    const chip = renderToStaticMarkup(createElement(ModerationChipView, { user: ADMIN, on: true, onToggle: noop }));
    expect(chip).toMatch(/^<button [^>]*data-moderation="switch"/);
    const block = renderToStaticMarkup(
      createElement(ModerationBarView, {
        user: ADMIN,
        on: true,
        presence: true,
        net: "online",
        others: 1,
        selected: 9,
        askedAt: 1,
        sending: false,
        notice: null,
        idle: true,
        onOff: noop,
        onNext: noop,
        onClear: noop,
        onAsk: noop,
        onCancel: noop,
        onConfirm: noop,
      })
    );
    expect(block).toMatch(/^<section [^>]*data-moderation="bar"/);
    expect(block.endsWith("</section>")).toBe(true);
    // Every control of the block is a button (no link, no field): the rule covers them all.
    expect(block.match(/<button/g)).toHaveLength(3);
    expect(block).not.toMatch(/<a |<input|<select|<textarea/);
  });
});

describe("Escape: one press, one layer", () => {
  const NOTHING: EscapeLayers = { confirmation: false, panel: false, menu: null, typing: false };

  it("cancels an open confirmation before anything else", () => {
    expect(escapeAction({ ...NOTHING, confirmation: true })).toBe("cancel-confirmation");
    expect(escapeAction({ ...NOTHING, confirmation: true, panel: true })).toBe("cancel-confirmation");
    expect(escapeAction({ ...NOTHING, confirmation: true, menu: "leave" })).toBe("cancel-confirmation");
    expect(escapeAction({ ...NOTHING, confirmation: true, panel: true, typing: true })).toBe("cancel-confirmation");
  });

  it("closes an open panel before touching the menu, also from a text field of the panel", () => {
    expect(escapeAction({ ...NOTHING, panel: true })).toBe("close-panel");
    expect(escapeAction({ ...NOTHING, panel: true, typing: true })).toBe("close-panel");
  });

  it("toggles the menu when nothing else is open; from one of its views it goes back to the list first", () => {
    expect(escapeAction(NOTHING)).toBe("open-menu");
    expect(escapeAction({ ...NOTHING, menu: "root" })).toBe("close-menu");
    for (const view of ["settings", "controls", "help", "leave"]) expect(escapeAction({ ...NOTHING, menu: view })).toBe("menu-back");
  });

  it("never opens the menu while the person types in a text field", () => {
    expect(escapeAction({ ...NOTHING, typing: true })).toBeNull();
  });

  it("counts a key held down once, and leaves Escape to an input method that is composing", () => {
    for (const layers of [NOTHING, { ...NOTHING, panel: true }, { ...NOTHING, menu: "root" }, { ...NOTHING, confirmation: true }]) {
      expect(escapeAction({ ...layers, repeat: true })).toBeNull();
      expect(escapeAction({ ...layers, composing: true })).toBeNull();
    }
  });

  it("knows a text field from a control that takes no text", () => {
    for (const field of [{ tagName: "INPUT" }, { tagName: "INPUT", type: "email" }, { tagName: "input", type: "search" }, { tagName: "TEXTAREA" }, { tagName: "SELECT" }, { tagName: "DIV", isContentEditable: true }])
      expect(isTextField(field)).toBe(true);
    for (const other of [null, { tagName: "BUTTON" }, { tagName: "CANVAS" }, { tagName: "BODY" }, { tagName: "INPUT", type: "checkbox" }, { tagName: "INPUT", type: "radio" }, { tagName: "INPUT", type: "file" }, { tagName: "DIV", isContentEditable: false }])
      expect(isTextField(other)).toBe(false);
  });
});
