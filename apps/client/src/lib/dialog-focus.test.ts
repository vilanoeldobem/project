/**
 * Focus of a modal dialog (every panel and the game menu, IMPL-0022): focus goes in, Tab stays in, and focus
 * goes back to what had it. The DOM is a few fake elements with the members the rules use.
 */
import { describe, expect, it } from "vitest";

import { type DialogNode, FOCUSABLE, tabTarget, trapFocus } from "./dialog-focus";

interface Fake {
  name: string;
  offsetParent: unknown;
  focus(): void;
}

function page() {
  const doc = { activeElement: null as unknown };
  const node = (name: string, visible = true): Fake => {
    const self: Fake = { name, offsetParent: visible ? {} : null, focus: () => void (doc.activeElement = self) };
    return self;
  };
  const opener = node("hud menu button");
  const [close, resume, settings, hidden, leave] = [node("close"), node("Continuar"), node("Configurações"), node("hidden", false), node("Sair da Vila")];
  const inside: Fake[] = [close, resume, settings, hidden, leave];
  const selectors: string[] = [];
  const dialog: DialogNode & Fake = {
    ...node("dialog"),
    focus: () => void (doc.activeElement = dialog),
    contains: (n: unknown) => n === dialog || inside.includes(n as Fake),
    querySelectorAll: (selector: string) => (selectors.push(selector), inside),
  };
  const keys = new EventTarget();
  const tab = (shiftKey = false) => {
    const event = Object.assign(new Event("keydown", { cancelable: true }), { key: "Tab", shiftKey });
    keys.dispatchEvent(event);
    return event.defaultPrevented;
  };
  return { doc, opener, close, resume, settings, hidden, leave, inside, dialog, keys, tab, selectors };
}

describe("Tab inside a dialog", () => {
  it("wraps from the last control to the first and back, skipping what is not visible", () => {
    const p = page();
    expect(tabTarget(p.dialog, p.leave, false)).toBe(p.close);
    expect(tabTarget(p.dialog, p.close, true)).toBe(p.leave);
    expect(tabTarget(p.dialog, p.dialog, true)).toBe(p.leave);
    expect(p.selectors.every((s) => s === FOCUSABLE)).toBe(true);
  });

  it("leaves the browser alone between two controls of the dialog", () => {
    const p = page();
    expect(tabTarget(p.dialog, p.resume, false)).toBeNull();
    expect(tabTarget(p.dialog, p.settings, true)).toBeNull();
    expect(tabTarget(p.dialog, p.dialog, false)).toBeNull();
  });

  it("brings the focus back in when it is outside", () => {
    const p = page();
    expect(tabTarget(p.dialog, p.opener, false)).toBe(p.close);
    expect(tabTarget(p.dialog, p.opener, true)).toBe(p.leave);
    expect(tabTarget(p.dialog, null, false)).toBe(p.close);
  });

  it("keeps the focus on the dialog when nothing in it can take it", () => {
    const p = page();
    p.inside.length = 0;
    expect(tabTarget(p.dialog, p.dialog, false)).toBe(p.dialog);
  });
});

describe("trapFocus", () => {
  it("moves the focus into the dialog, keeps Tab inside and gives the focus back on close", () => {
    const p = page();
    p.opener.focus();
    const release = trapFocus(p.dialog, p.doc, p.keys);
    expect(p.doc.activeElement).toBe(p.dialog);

    p.leave.focus();
    expect(p.tab()).toBe(true); // handled here, not by the browser
    expect(p.doc.activeElement).toBe(p.close);
    expect(p.tab(true)).toBe(true);
    expect(p.doc.activeElement).toBe(p.leave);
    p.resume.focus();
    expect(p.tab()).toBe(false); // the browser moves to the next control

    release();
    expect(p.doc.activeElement).toBe(p.opener);
    p.leave.focus();
    expect(p.tab()).toBe(false); // no longer trapped
  });

  it("ignores every other key", () => {
    const p = page();
    trapFocus(p.dialog, p.doc, p.keys);
    const event = Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape", shiftKey: false });
    p.keys.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(p.doc.activeElement).toBe(p.dialog);
  });

  it("opened with nothing focused (Escape on the page), closes without moving the focus anywhere", () => {
    const p = page();
    const release = trapFocus(p.dialog, p.doc, p.keys);
    p.resume.focus();
    release();
    expect(p.doc.activeElement).toBe(p.resume);
  });
});
