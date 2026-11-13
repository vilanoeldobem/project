/**
 * Keys on the HUD (no panel open): E and Enter open what is near, whatever HUD button has the focus, except
 * Enter on a moderation control. The DOM is a few fake elements with the one method the rule uses (`closest`),
 * checked against the markup the real components render.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Me } from "@vila/shared/accounts/contract";

import { ModerationBarView, ModerationChipView } from "../ui/Moderation";
import { hudKeyAction, type KeyTarget, onModerationControl } from "./hud-keys";

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
const zoomOut = element("button", ["aria-label"], element("div", ["role"], hud)); // "Afastar"
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

  it("opens what is near with Enter after a mouse click on a zoom button left the focus there", () => {
    expect(hudKeyAction("Enter", zoomOut, true)).toBe("activate");
  });

  it("leaves Enter to a moderation control: the switch and every button of the moderation block", () => {
    for (const control of [moderationSwitch, confirmButton, offButton]) {
      expect(onModerationControl(control)).toBe(true);
      expect(hudKeyAction("Enter", control, true)).toBeNull();
    }
  });

  it("treats nothing else as a moderation control: the scene, another HUD button, the focused block itself", () => {
    for (const other of [null, canvas, explore, zoomOut, bar, confirmStep]) expect(onModerationControl(other)).toBe(false);
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
