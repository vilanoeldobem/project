import { describe, expect, it } from "vitest";

import { AVATAR_RADIUS, boundingRadius, clearance, distanceTo, footprint } from "./collision";

describe("colliders (IMPL-0016)", () => {
  it("measures a circle from its surface", () => {
    const c = { x: 2, z: -1, r: 1.5 };
    expect(distanceTo(c, 2, -1)).toBeCloseTo(-1.5);
    expect(distanceTo(c, 5, -1)).toBeCloseTo(1.5);
    expect(distanceTo(c, 2, 0.5)).toBeCloseTo(0);
    expect(boundingRadius(c)).toBe(1.5);
  });

  it("builds a box from a model-local rectangle, turned like three.js rotation.y", () => {
    // A 4 × 2 rectangle whose near end is at the model origin, on a model turned a quarter turn:
    // local +x points to world -z, local +z to world +x.
    const c = footprint({ x: 10, z: 5, rot: Math.PI / 2 }, 0, 4, -1, 1);
    expect(c.x).toBeCloseTo(10);
    expect(c.z).toBeCloseTo(3);
    expect(distanceTo(c, 10, 5)).toBeCloseTo(0); // the model origin is on the near edge
    expect(distanceTo(c, 10, 1)).toBeCloseTo(0); // the far end, 4 u along local +x
    expect(distanceTo(c, 11, 3)).toBeCloseTo(0); // the side, 1 u along local +z
    expect(distanceTo(c, 10, 3)).toBeCloseTo(-1); // centre: 1 u inside the nearest side
    expect(distanceTo(c, 12, 0)).toBeCloseTo(Math.hypot(1, 1)); // off a corner
    expect(boundingRadius(c)).toBeCloseTo(Math.hypot(2, 1));
  });

  it("rounds the corners by r without growing the rectangle, and collapses to a circle or a capsule", () => {
    const rounded = footprint({ x: 0, z: 0 }, -2, 2, -1, 1, 0.5);
    expect(distanceTo(rounded, 2, 0)).toBeCloseTo(0);
    expect(distanceTo(rounded, 0, 1)).toBeCloseTo(0);
    expect(distanceTo(rounded, 2, 1)).toBeCloseTo(Math.hypot(0.5, 0.5) - 0.5); // the corner is cut
    expect(footprint({ x: 3, z: 4, rot: 1 }, -0.5, 0.5, -0.5, 0.5, 0.5)).toEqual({ x: 3, z: 4, r: 0.5 });
    const capsule = footprint({ x: 0, z: 0 }, -1.5, 1.5, -0.25, 0.25, 0.25);
    expect(capsule).toMatchObject({ r: 0.25, hx: 1.25, hz: 0 });
    expect(distanceTo(capsule, 1.5, 0)).toBeCloseTo(0);
  });

  it("offsets an off-centre rectangle along the model's own axes", () => {
    // The signpost's board: 0.2 u behind the post to 0.86 u in front of it, model turned half a turn.
    const c = footprint({ x: 1, z: 1, rot: Math.PI }, -0.2, 0.2, -0.2, 0.86, 0.2);
    expect(c.x).toBeCloseTo(1);
    expect(c.z).toBeCloseTo(1 - 0.33);
    expect(distanceTo(c, 1, 1 - 0.86)).toBeCloseTo(0);
    expect(distanceTo(c, 1, 1.2)).toBeCloseTo(0);
  });

  it("reports the room around the avatar's body", () => {
    const colliders = [{ x: 0, z: 0, r: 1 }, footprint({ x: 5, z: 0 }, -1, 1, -1, 1)];
    expect(clearance(colliders, 2, 0)).toBeCloseTo(1 - AVATAR_RADIUS);
    expect(clearance(colliders, 3.2, 0)).toBeCloseTo(0.8 - AVATAR_RADIUS);
    expect(clearance(colliders, 0.5, 0)).toBeLessThan(0);
    expect(clearance([], 0, 0)).toBe(Infinity);
  });
});
