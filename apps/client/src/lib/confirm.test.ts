/**
 * The focus of a confirmation step under a mouse press (`Confirm`, every confirmation of the game): the confirm
 * button appears under the pointer that opened the question, so the second click of a double click lands on it.
 * That press must not move the focus to the button, or Enter a moment later would confirm. The events are fakes
 * with the members the rule reads.
 */
import { describe, expect, it } from "vitest";

import { CONFIRM_ARM_MS, confirmAllowed, guardConfirmPress } from "./confirm";

const SHOWN_AT = 10_000;

/** A mouse-down on the confirm button, `after` ms after the question appeared. */
function press(detail: number, after: number) {
  const log: string[] = [];
  const event = { detail, preventDefault: () => void log.push("no focus for the button") };
  const question = { focus: () => void log.push("focus on the question") };
  guardConfirmPress(event, SHOWN_AT, SHOWN_AT + after, question);
  return log;
}

describe("a mouse press on the confirm button", () => {
  it("does not give it the focus when it is the second click of a double click on what opened the question", () => {
    // "Sair da Vila" in the menu: the second click arrives a few ms after the question replaced the entry.
    expect(press(2, 90)).toEqual(["no focus for the button", "focus on the question"]);
  });

  it("does not give it the focus as the second or third click of a multi-click, however late", () => {
    expect(press(2, CONFIRM_ARM_MS + 5_000)).toEqual(["no focus for the button", "focus on the question"]);
    expect(press(3, CONFIRM_ARM_MS + 5_000)).toEqual(["no focus for the button", "focus on the question"]);
  });

  it("does not give it the focus before the confirmation is armed, also as a single click", () => {
    expect(press(1, 0)).toEqual(["no focus for the button", "focus on the question"]);
    expect(press(1, CONFIRM_ARM_MS - 1)).toEqual(["no focus for the button", "focus on the question"]);
  });

  it("is an ordinary press once the confirmation is armed: the button takes the focus and the click confirms", () => {
    expect(press(1, CONFIRM_ARM_MS)).toEqual([]);
    expect(confirmAllowed({ detail: 1 }, SHOWN_AT, SHOWN_AT + CONFIRM_ARM_MS)).toBe(true);
  });

  it("refuses the focus exactly when the click that follows is refused", () => {
    for (const detail of [0, 1, 2, 3])
      for (const after of [0, 100, CONFIRM_ARM_MS - 1, CONFIRM_ARM_MS, 5_000])
        expect(press(detail, after).length === 0).toBe(confirmAllowed({ detail }, SHOWN_AT, SHOWN_AT + after));
  });

  it("works while the question is not on screen yet (no element to focus)", () => {
    const log: string[] = [];
    guardConfirmPress({ detail: 2, preventDefault: () => void log.push("no focus for the button") }, SHOWN_AT, SHOWN_AT + 50, null);
    expect(log).toEqual(["no focus for the button"]);
  });
});
