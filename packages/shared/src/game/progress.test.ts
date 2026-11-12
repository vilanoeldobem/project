import { describe, expect, it } from "vitest";

import seed from "../../../../migrations/0002_seed_lots.sql?raw";

import { applyEvent, EMPTY_PROGRESS, levelOf, MISSIONS } from "./progress";
import { clampToWorld, LOTS, TREE_KEEP_OUT, WORLD_RADIUS } from "./world";

describe("missions (DEC-042)", () => {
  it("counts each event only once", () => {
    let p = applyEvent(EMPTY_PROGRESS, "explore-gifts", "a").progress;
    p = applyEvent(p, "explore-gifts", "a").progress;
    expect(p.counters["explore-gifts"]).toBe(1);
    expect(p.xp).toBe(0);
  });

  it("grants the mission XP once on completion", () => {
    let r = applyEvent(EMPTY_PROGRESS, "explore-gifts", "a");
    r = applyEvent(r.progress, "explore-gifts", "b");
    expect(r.completed?.id).toBe("explore-gifts");
    expect(r.progress.xp).toBe(30);
    const again = applyEvent(r.progress, "explore-gifts", "c");
    expect(again.progress.xp).toBe(30);
    expect(again.completed).toBeUndefined();
  });

  it("ignores unknown missions", () => {
    expect(applyEvent(EMPTY_PROGRESS, "donate", "x").progress).toBe(EMPTY_PROGRESS);
  });

  it("level 2 is reachable without donating", () => {
    const total = MISSIONS.reduce((s, m) => s + m.xp, 0);
    expect(levelOf(total)).toBeGreaterThanOrEqual(2);
  });
});

describe("world", () => {
  it("lot positions match the seed migration", () => {
    for (const [i, lot] of LOTS.entries()) {
      // 0002 seeds legacy ids `praca-NN`; 0003 renames them to `plaza-NN` keeping coordinates.
      expect(seed).toContain(`${i + 1}, ${lot.x}, ${lot.z})`);
    }
  });

  it("keeps the avatar inside the world and outside the tree", () => {
    const [x, z] = clampToWorld(100, 0);
    expect(Math.hypot(x, z)).toBeCloseTo(WORLD_RADIUS);
    const [a, b] = clampToWorld(0.5, 0);
    expect(Math.hypot(a, b)).toBeCloseTo(TREE_KEEP_OUT);
  });
});
