import { describe, expect, it } from "vitest";

import { COSMETICS, DEFAULT_LOOK, isUnlocked, requirement, sanitizeLook, SLOTS, unlockedIds } from "./cosmetics";
import { applyEvent, EMPTY_PROGRESS, levelOf, MISSIONS, type Progress } from "./progress";

/** Completes every mission with its own events — no donation anywhere (DEC-042). */
function playEverything(): Progress {
  let p = EMPTY_PROGRESS;
  for (const m of MISSIONS) for (let i = 0; i < m.target; i++) p = applyEvent(p, m.id, `${m.id}-e${i}`).progress;
  return p;
}

describe("cosmetics (PROPOSTA)", () => {
  it("has unique ids and one default per slot", () => {
    expect(new Set(COSMETICS.map((c) => c.id)).size).toBe(COSMETICS.length);
    for (const slot of SLOTS) {
      const defaults = COSMETICS.filter((c) => c.slot === slot && c.unlock.kind === "default");
      expect(defaults.map((c) => c.id)).toEqual([DEFAULT_LOOK[slot]]);
    }
  });

  it("unlocks only through missions or levels, and every item is reachable without donating", () => {
    for (const c of COSMETICS) {
      expect(["default", "mission", "level"]).toContain(c.unlock.kind);
      if (c.unlock.kind === "mission") {
        const id = c.unlock.missionId;
        expect(MISSIONS.some((m) => m.id === id)).toBe(true);
        // Never tied to the donation-themed mission (even though it is reading-only): no perceived link
        // between giving money and rewards.
        expect(id).not.toBe("causes-global-donation");
      }
    }
    const all = playEverything();
    expect(levelOf(all.xp)).toBeGreaterThanOrEqual(Math.max(...COSMETICS.map((c) => (c.unlock.kind === "level" ? c.unlock.level : 1))));
    expect(unlockedIds(all).size).toBe(COSMETICS.length);
  });

  it("starts with only the defaults", () => {
    expect([...unlockedIds(EMPTY_PROGRESS)].sort()).toEqual(Object.values(DEFAULT_LOOK).sort());
  });

  it("unlocks an item when its mission completes", () => {
    const beanie = COSMETICS.find((c) => c.id === "hat-beanie")!;
    let p = EMPTY_PROGRESS;
    expect(isUnlocked(beanie, p)).toBe(false);
    p = applyEvent(p, "explore-gifts", "a").progress;
    p = applyEvent(p, "explore-gifts", "b").progress;
    expect(isUnlocked(beanie, p)).toBe(true);
  });

  it("sanitises stored looks (unknown, locked or wrong-slot ids fall back to the default)", () => {
    expect(sanitizeLook({ hat: "hat-beanie", scarf: "hat-santa", palette: "nope" }, EMPTY_PROGRESS)).toEqual(DEFAULT_LOOK);
    expect(sanitizeLook(null, EMPTY_PROGRESS)).toEqual(DEFAULT_LOOK);
    expect(sanitizeLook({ hat: "hat-holly" }, playEverything()).hat).toBe("hat-holly");
  });

  it("explains how to unlock in pt-BR", () => {
    expect(requirement(COSMETICS.find((c) => c.id === "hat-holly")!)).toBe("Chegue ao nível 2");
    expect(requirement(COSMETICS.find((c) => c.id === "hat-beanie")!)).toMatch(/^Conclua: /);
  });
});
