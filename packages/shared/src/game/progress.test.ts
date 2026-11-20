import { describe, expect, it } from "vitest";

import seed from "../../../../migrations/0002_seed_lots.sql?raw";
import expansion from "../../../../migrations/0012_village_expansion.sql?raw";

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
  it("lot positions match the seed migrations", () => {
    // 0002 seeds the first eight lots with legacy ids `praca-NN`; 0003 renames them to `plaza-NN`; 0012 moves
    // them to the square's frontage and adds four more (IMPL-0024); 0015 adds the lots of the rings
    // (IMPL-0031). `village.test.ts` checks 0012 and 0015 row by row, residential plots included, and
    // `apps/api` checks the migrated tables themselves.
    const plaza = LOTS.filter((l) => l.street === "plaza");
    for (const lot of plaza.slice(0, 8)) {
      expect(seed).toContain(`('praca-${String(lot.slot).padStart(2, "0")}', 'praca', ${lot.slot},`);
      expect(expansion).toContain(`UPDATE lots SET x = ${lot.x}, z = ${lot.z} WHERE id = '${lot.id}';`);
    }
    for (const lot of plaza.slice(8)) expect(expansion).toContain(`('${lot.id}', 'plaza', ${lot.slot}, ${lot.x}, ${lot.z})`);
    expect(plaza.map((l) => l.slot)).toEqual(plaza.map((_, i) => i + 1));
    // The number people read counts every lot of the village, the square first.
    expect(LOTS.map((l) => l.number)).toEqual(LOTS.map((_, i) => i + 1));
  });

  it("clamps the walk to the world of four rings (IMPL-0031)", () => {
    expect(WORLD_RADIUS).toBe(99);
  });

  it("keeps the avatar inside the world and outside the tree", () => {
    const [x, z] = clampToWorld(100, 0);
    expect(Math.hypot(x, z)).toBeCloseTo(WORLD_RADIUS);
    const [a, b] = clampToWorld(0.5, 0);
    expect(Math.hypot(a, b)).toBeCloseTo(TREE_KEEP_OUT);
  });
});
