import { describe, expect, it } from "vitest";

import {
  COSMETICS,
  DEFAULT_LOOK,
  isPaid,
  isUnlocked,
  requirement,
  sanitizeLook,
  SLOTS,
  unlockedIds,
  wear,
} from "./cosmetics";
import { applyEvent, EMPTY_PROGRESS, levelOf, MISSIONS, type Progress } from "./progress";

/** Completes every mission with its own events — no donation anywhere (DEC-042). */
function playEverything(): Progress {
  let p = EMPTY_PROGRESS;
  for (const m of MISSIONS) for (let i = 0; i < m.target; i++) p = applyEvent(p, m.id, `${m.id}-e${i}`).progress;
  return p;
}

const itemsOf = (slot: string) => COSMETICS.filter((c) => c.slot === slot);

describe("cosmetics (PROPOSTA, P08)", () => {
  it("has ten slots, ten unique items each, the default first in its slot", () => {
    expect(SLOTS).toHaveLength(10);
    expect(new Set(COSMETICS.map((c) => c.id)).size).toBe(COSMETICS.length);
    expect(COSMETICS).toHaveLength(100);
    for (const slot of SLOTS) {
      const items = itemsOf(slot);
      expect(items, slot).toHaveLength(10);
      expect(items[0].unlock.kind, slot).toBe("default");
      expect(items[0].id, slot).toBe(DEFAULT_LOOK[slot]);
      // Default, seven free items, two paid.
      expect(items.filter((c) => c.unlock.kind === "default"), slot).toHaveLength(1);
      expect(items.filter((c) => c.unlock.kind === "paid"), slot).toHaveLength(2);
      expect(items.filter((c) => !isPaid(c) && c.unlock.kind !== "default"), slot).toHaveLength(7);
    }
  });

  it("matches the catalogue order the presence wire relies on", () => {
    expect(SLOTS.map((s) => itemsOf(s).map((c) => c.id))).toMatchSnapshot();
  });

  it("starts with only the ten defaults", () => {
    expect([...unlockedIds(EMPTY_PROGRESS)].sort()).toEqual(Object.values(DEFAULT_LOOK).sort());
    expect(unlockedIds(EMPTY_PROGRESS).size).toBe(10);
  });

  it("unlocks all 80 free items by playing, and none of the 20 paid ones", () => {
    const all = playEverything();
    expect(levelOf(all.xp)).toBeGreaterThanOrEqual(2);
    expect(unlockedIds(all).size).toBe(80);
    for (const c of COSMETICS) {
      expect(isUnlocked(c, all), c.id).toBe(!isPaid(c));
      if (isPaid(c)) expect(isUnlocked(c, all)).toBe(false);
    }
    expect(COSMETICS.filter(isPaid)).toHaveLength(20);
  });

  it("ties free items only to the four missions or level 2, never to the donation-themed mission", () => {
    for (const c of COSMETICS) {
      if (isPaid(c)) continue;
      const unlock = c.unlock;
      expect(["default", "mission", "level"]).toContain(unlock.kind);
      if (unlock.kind === "mission") {
        expect(MISSIONS.some((m) => m.id === unlock.missionId), c.id).toBe(true);
        // Never tied to the donation-themed mission (even though it is reading-only): no perceived link
        // between giving money and rewards.
        expect(unlock.missionId, c.id).not.toBe("causes-global-donation");
      }
      if (unlock.kind === "level") expect(unlock.level).toBe(2);
    }
  });

  it("unlocks an item when its mission completes", () => {
    const beanie = COSMETICS.find((c) => c.id === "helmet-beanie")!;
    let p = EMPTY_PROGRESS;
    expect(isUnlocked(beanie, p)).toBe(false);
    p = applyEvent(p, "explore-gifts", "a").progress;
    p = applyEvent(p, "explore-gifts", "b").progress;
    expect(isUnlocked(beanie, p)).toBe(true);
  });

  it("never equips a paid item, even when progress is complete", () => {
    const all = playEverything();
    for (const c of COSMETICS.filter(isPaid)) {
      expect(isUnlocked(c, all), c.id).toBe(false);
      // `wear` previews it; the saved look (what `setLook` keeps and presence sends) drops it.
      const tried = wear(DEFAULT_LOOK, c.id);
      expect(tried[c.slot], c.id).toBe(c.id);
      expect(sanitizeLook(tried, all)[c.slot], c.id).not.toBe(c.id);
      expect(sanitizeLook({ ...DEFAULT_LOOK, [c.slot]: c.id }, all)[c.slot], c.id).toBe(DEFAULT_LOOK[c.slot]);
    }
  });

  it("has one compatible way to wear a dress and a blouse", () => {
    const base = { ...DEFAULT_LOOK };
    expect(wear(base, "dress-red")).toEqual({ ...base, dress: "dress-red" });
    expect(wear({ ...base, dress: "dress-red" }, "blouse-stripes")).toEqual({
      ...base,
      dress: "dress-none",
      blouse: "blouse-stripes",
    });
    expect(wear({ ...base, dress: "dress-red" }, "pants-pine")).toEqual({
      ...base,
      dress: "dress-none",
      pants: "pants-pine",
    });
    expect(wear(base, "helmet-beanie")).toEqual({ ...base, helmet: "helmet-beanie" });
    expect(wear(base, "nope")).toBe(base);
  });

  it("sanitises stored looks (unknown, locked, wrong-slot and paid ids fall back to the default)", () => {
    expect(sanitizeLook({ helmet: "helmet-beanie", blouse: "helmet-santa", special: "nope" }, EMPTY_PROGRESS)).toEqual(DEFAULT_LOOK);
    expect(sanitizeLook(null, EMPTY_PROGRESS)).toEqual(DEFAULT_LOOK);
    expect(sanitizeLook({ helmet: "helmet-crown" }, playEverything())).toEqual(DEFAULT_LOOK);
    expect(sanitizeLook({ dress: "dress-red", blouse: "blouse-stripes", pants: "pants-pine" }, playEverything())).toEqual({
      ...DEFAULT_LOOK,
      dress: "dress-red",
    });
    expect(sanitizeLook({ helmet: "helmet-beanie" }, playEverything()).helmet).toBe("helmet-beanie");
  });

  it("explains how to unlock in pt-BR", () => {
    const by = (id: string) => COSMETICS.find((c) => c.id === id)!;
    expect(requirement(by("helmet-santa"))).toBe("");
    expect(requirement(by("helmet-holly"))).toBe("Conclua: Visite um terreno e conheça o cadastro de ONGs");
    expect(requirement(by("helmet-beanie"))).toBe("Conclua: Encontre 2 presentes escondidos na praça");
    expect(requirement(by("helmet-antlers"))).toBe("Chegue ao nível 2");
    expect(requirement(by("helmet-crown"))).toBe("Visual pago");
  });
});
