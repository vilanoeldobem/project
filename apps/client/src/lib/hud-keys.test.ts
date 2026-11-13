/**
 * Keys on the HUD (no panel open): E opens what is near whatever has the focus; Enter does it only when the
 * focus is not on a control that Enter activates by itself (a button, a link, a field), and never as a key
 * repeat; + = and - zoom; Escape is the menu key, with its order of precedence (IMPL-0022). The DOM is a few
 * fake elements with the one method the rule uses (`closest`), checked against the markup the real components
 * render.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Me } from "@vila/shared/accounts/contract";

import { ModerationBarView, ModerationChipView } from "../ui/Moderation";
import { boundAction, escapeAction, type EscapeLayers, heldOnControl, hudKeyAction, isTextField, KEY_BINDINGS, type KeyTarget, onControl } from "./hud-keys";

interface FakeElement extends KeyTarget {
  tag: string;
  attributes: string[];
  parent: FakeElement | null;
}

/**
 * One simple selector of the kinds the rule uses: `tag`, `[attribute]`, `tag[attribute]` or `[attribute="value"]`.
 * A fake element lists its attributes as `name` or `name=value`.
 */
const matches = (e: FakeElement, selector: string): boolean => {
  const [, tag, attribute, value] = /^([a-z]*)(?:\[([a-z-]+)(?:="([^"]*)")?\])?$/.exec(selector.trim()) ?? [];
  const has = value === undefined ? e.attributes.some((a) => a.split("=")[0] === attribute) : e.attributes.includes(`${attribute}=${value}`);
  return (!tag || e.tag === tag) && (!attribute || has) && Boolean(tag || attribute);
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
const explore = element("button", ["data-path"], nav); // "Explorar ONGs"
const exploreLabel = element("span", [], explore);
const menuButton = element("button", ["aria-label", "data-menu"], element("div", ["role=group"], nav)); // "Menu"
const moderationSwitch = element("button", ["aria-pressed", "data-moderation"], nav);
const people = element("span", ["role=status"], nav); // "👥 2": drawn like a chip, it is not a control
const bar = element("section", ["data-moderation", "tabindex"], hud);
const confirmStep = element("div", ["data-confirm", "tabindex", "role=group"], bar);
const confirmButton = element("button", [], element("div", [], confirmStep));
const offButton = element("button", [], bar);
const actionButton = element("button", [], hud); // "🎄 Doação global [E]"
const missions = element("button", ["aria-label"], hud);
const canvas = element("canvas");
const body = element("body");
/** Controls the HUD does not draw today, in case one is added. */
const link = element("a", ["href"], hud);
const anchor = element("a", [], hud); // no `href`: not a link
const checkbox = element("input", ["type=checkbox"], hud);
const summary = element("summary", [], element("details", [], hud));
const roleButton = element("div", ["role=button", "tabindex"], hud);
const roleLink = element("span", ["role=link", "tabindex"], hud);

const CONTROLS = [explore, exploreLabel, menuButton, moderationSwitch, confirmButton, offButton, actionButton, missions, link, checkbox, summary, roleButton, roleLink];
const NOT_CONTROLS = [null, body, canvas, hud, nav, people, bar, confirmStep, anchor];

describe("keys on the HUD", () => {
  it("leaves Enter to the focused control: next to the tree, Enter on 'Menu' opens the menu, not the donation panel", () => {
    expect(hudKeyAction("Enter", menuButton, true)).toBeNull();
    // The focus is back on the chip that opened a panel ("Explorar ONGs → Ir até lá"): Enter is that chip's too.
    expect(hudKeyAction("Enter", explore, true)).toBeNull();
    expect(hudKeyAction("Enter", exploreLabel, true)).toBeNull();
  });

  it("leaves Enter to every control that Enter activates by itself: buttons, links, fields and their ARIA roles", () => {
    for (const control of CONTROLS) {
      expect(onControl(control)).toBe(true);
      expect(hudKeyAction("Enter", control, true)).toBeNull();
    }
  });

  it("keeps the moderation controls their own: the switch and every button of the moderation block", () => {
    for (const control of [moderationSwitch, confirmButton, offButton]) expect(hudKeyAction("Enter", control, true)).toBeNull();
  });

  it("opens what is near with Enter when the focus is on the page, the scene or a block that is not a control", () => {
    for (const other of NOT_CONTROLS) {
      expect(onControl(other)).toBe(false);
      expect(hudKeyAction("Enter", other, true)).toBe("activate");
    }
  });

  it("keeps E for what is near everywhere, and does nothing when nothing is near", () => {
    for (const key of ["e", "E"]) for (const target of [...CONTROLS, ...NOT_CONTROLS]) expect(hudKeyAction(key, target, true)).toBe("activate");
    for (const key of ["e", "E", "Enter"]) for (const target of [null, canvas, explore, moderationSwitch]) expect(hudKeyAction(key, target, false)).toBeNull();
    expect(hudKeyAction("a", canvas, true)).toBeNull();
  });

  it("opens what is near once per press: a key held down does not open it again", () => {
    for (const key of ["e", "E", "Enter"]) {
      expect(hudKeyAction(key, canvas, true, false)).toBe("activate");
      for (const target of [null, canvas, body, explore, menuButton]) expect(hudKeyAction(key, target, true, true)).toBeNull();
    }
  });

  it("drops a held Enter that reaches a HUD control: 'Continuar' closed the menu and the focus is back on 'Menu'", () => {
    expect(heldOnControl("Enter", menuButton, true)).toBe(true);
    for (const control of CONTROLS) expect(heldOnControl("Enter", control, true)).toBe(true);
    // The first press is the control's; a held Enter anywhere else is not this rule's, and no other key is.
    for (const control of CONTROLS) expect(heldOnControl("Enter", control, false)).toBe(false);
    for (const other of NOT_CONTROLS) expect(heldOnControl("Enter", other, true)).toBe(false);
    for (const key of ["e", " ", "Tab", "+", "-", "Escape"]) expect(heldOnControl(key, menuButton, true)).toBe(false);
  });

  it("zooms with + = and -, near something or not, and keeps zooming while the key is held", () => {
    for (const nearby of [true, false]) {
      expect([hudKeyAction("+", null, nearby), hudKeyAction("=", explore, nearby), hudKeyAction("-", moderationSwitch, nearby)]).toEqual(["zoom-in", "zoom-in", "zoom-out"]);
      expect([hudKeyAction("+", canvas, nearby, true), hudKeyAction("-", canvas, nearby, true)]).toEqual(["zoom-in", "zoom-out"]);
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

  it("matches the markup: the moderation switch is a button, and every control of the moderation block is a button", () => {
    const ADMIN: Me = { id: "a1", name: "Ana Lima", nickname: "ana_admin", city: "Recife", email: "ana@example.com", role: "admin" };
    const noop = () => {};
    const chip = renderToStaticMarkup(createElement(ModerationChipView, { user: ADMIN, on: true, onToggle: noop }));
    expect(chip).toMatch(/^<button /);
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
    expect(block).toMatch(/^<section /);
    expect(block.endsWith("</section>")).toBe(true);
    // Every control of the block is a button (no link, no field), and the block itself is not a control.
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
