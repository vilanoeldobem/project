/**
 * A press on the veil of a dialog, as the browser sends it: `pointerdown`, then `click` (the last event of a
 * tap or of a mouse click). The DOM is two fake nodes; an event is its `target` and its `currentTarget`.
 */
import { describe, expect, it } from "vitest";

import { veilClick, veilPointerDown } from "./veil";

const veil = { name: "veil" };
const dialog = { name: "dialog" };
/** An event that reached the veil's handler: on the veil itself, or bubbling from inside the dialog. */
const on = (target: object, currentTarget: object = veil) => ({ target, currentTarget });

function page() {
  const log: string[] = [];
  return {
    log,
    down: (target: object, at: object = veil) => (veilPointerDown(on(target, at)), log.push("down")),
    click: (target: object, at: object = veil) => (veilClick(on(target, at), () => void log.push("close")), log.push("click")),
  };
}

describe("a press on the veil of a dialog", () => {
  it("closes on the click, not on the pointerdown: the tap has no event left to fall through", () => {
    const { log, down, click } = page();
    down(veil);
    expect(log).toEqual(["down"]); // still open: the click of this tap lands on the veil, not on what is under it
    click(veil);
    expect(log).toEqual(["down", "close", "click"]);
  });

  it("closes once per press", () => {
    const { log, down, click } = page();
    down(veil);
    click(veil);
    click(veil); // a click with no press of its own
    expect(log.filter((e) => e === "close")).toHaveLength(1);
  });

  it("does not close when the press started inside the dialog and ended on the veil (a drag, a text selection)", () => {
    const { log, down, click } = page();
    down(dialog); // bubbles to the veil
    click(veil); // the browser sends the click to the common ancestor of where it went down and up
    expect(log).not.toContain("close");
  });

  it("does not close for a click inside the dialog, also right after a press on the veil that had no click", () => {
    const { log, down, click } = page();
    down(dialog);
    click(dialog);
    down(veil); // e.g. the start of a scroll: no click follows
    down(dialog);
    click(dialog);
    click(veil);
    expect(log).not.toContain("close");
  });

  it("does not close for a click with no pointerdown before it", () => {
    const { log, click } = page();
    click(veil);
    expect(log).not.toContain("close");
  });

  it("does not close a dialog for a press that started on the veil of another one", () => {
    const { log, down, click } = page();
    const next = { name: "the veil of the dialog that replaced it" };
    down(veil);
    click(next, next);
    expect(log).not.toContain("close");
  });
});
