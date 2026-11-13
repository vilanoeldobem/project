/** Labels and the HUD (issue #41): a 3D label that would sit under a control of the HUD is hidden. */
import { describe, expect, it } from "vitest";

import { hudChrome, overlaps, underChrome } from "./hud-chrome";

const box = (left: number, top: number, width: number, height: number) => ({ left, top, right: left + width, bottom: top + height });

describe("a label and the HUD", () => {
  // A 390 px phone at the spawn: the top bar's chips, and the mission card at the bottom.
  const chrome = [box(12, 12, 150, 44), box(170, 12, 44, 44), box(200, 68, 178, 44), box(12, 776, 220, 56)];

  it("is under the chrome when it touches a control, by any edge", () => {
    expect(underChrome(box(140, 40, 110, 24), chrome)).toBe(true); // "Doação global" under the top chips
    expect(underChrome(box(100, 790, 120, 24), chrome)).toBe(true); // over the mission card
    expect(underChrome(box(215, 40, 60, 24), chrome)).toBe(true); // a hairline from a chip counts
  });

  it("is clear in the open part of the screen", () => {
    expect(underChrome(box(140, 300, 110, 24), chrome)).toBe(false);
    expect(underChrome(box(240, 120, 110, 24), chrome)).toBe(false);
    expect(underChrome(box(140, 300, 110, 24), [])).toBe(false);
  });

  it("compares boxes with an optional gap", () => {
    expect(overlaps(box(0, 0, 10, 10), box(10, 0, 10, 10))).toBe(false);
    expect(overlaps(box(0, 0, 10, 10), box(10, 0, 10, 10), 1)).toBe(true);
    expect(overlaps(box(0, 0, 10, 10), box(5, 5, 10, 10))).toBe(true);
    expect(overlaps(box(0, 0, 10, 10), box(0, 30, 10, 10), 5)).toBe(false);
  });

  it("has no chrome to read where there is no page", () => {
    expect(hudChrome(0)).toEqual([]);
  });
});
