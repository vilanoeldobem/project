import { beforeEach, describe, expect, it } from "vitest";

import { ingestSnapshot, remotes, resetRemotes, sampleRemotes } from "./multiplayer";

describe("snapshot interpolation", () => {
  beforeEach(resetRemotes);

  it("ignores the local visitor's own id", () => {
    ingestSnapshot([[1, 0, 0, 0, 0, 0], [2, 1, 1, 0, 0, 0]], 1000, 1, 1000);
    expect([...remotes.keys()]).toEqual([2]);
  });

  it("renders 150 ms in the past between two known poses", () => {
    // Server clock = local clock (offset 0 after the first sample arrives instantly).
    ingestSnapshot([[2, 0, 0, 0, 4, 0]], 1000, null, 1000);
    ingestSnapshot([[2, 1, 0, 0, 4, 0]], 1100, null, 1100);
    sampleRemotes(1100 + 150 - 50); // render time = 1050 → halfway
    expect(remotes.get(2)!.x).toBeCloseTo(0.5);
  });

  it("holds the last pose instead of extrapolating", () => {
    ingestSnapshot([[2, 0, 0, 0, 4, 0]], 1000, null, 1000);
    ingestSnapshot([[2, 1, 0, 0, 4, 0]], 1100, null, 1100);
    sampleRemotes(5000);
    expect(remotes.get(2)!.x).toBe(1);
  });

  it("uses the per-entry age to place samples in time", () => {
    ingestSnapshot([[2, 0, 0, 0, 4, 0]], 1000, null, 1000);
    ingestSnapshot([[2, 1, 0, 0, 4, 80]], 1100, null, 1100); // accepted at 1020
    sampleRemotes(1010 + 150); // render time 1010 → halfway between 1000 and 1020
    expect(remotes.get(2)!.x).toBeCloseTo(0.5);
  });

  it("turns along the shortest arc", () => {
    ingestSnapshot([[2, 0, 0, 3.1, 0, 0]], 1000, null, 1000);
    ingestSnapshot([[2, 0, 0, -3.1, 0, 0]], 1100, null, 1100);
    sampleRemotes(1050 + 150);
    expect(Math.abs(Math.cos(remotes.get(2)!.yaw) + 1)).toBeLessThan(0.01);
  });
});
