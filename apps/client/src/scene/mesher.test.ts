import { describe, expect, it } from "vitest";

import { AO_CURVE, meshVoxels, type MeshData } from "./mesher";
import type { Voxel } from "./models";

const WHITE = "#ffffff";
const toLinear = () => [1, 1, 1] as [number, number, number];

const cube = (n: number, c = WHITE): Voxel[] => {
  const v: Voxel[] = [];
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) v.push([x, y, z, c]);
  return v;
};

/** Every triangle's winding must agree with the stored face normal (outward, counter-clockwise). */
function windingOk(m: MeshData) {
  const P = m.positions, N = m.normals;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t] * 3, m.indices[t + 1] * 3, m.indices[t + 2] * 3];
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
    const e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[0] * N[a] + n[1] * N[a + 1] + n[2] * N[a + 2] <= 0) return false;
  }
  return true;
}

describe("meshVoxels", () => {
  it("emits six unshaded faces for a lone voxel", () => {
    const [m] = meshVoxels([[0, 0, 0, WHITE]], { toLinear });
    expect(m.faces).toBe(6);
    expect(m.positions.length).toBe(24 * 3);
    expect([...m.colors].every((c) => c === 1)).toBe(true);
    expect(windingOk(m)).toBe(true);
  });

  it("culls faces between neighbours (a 3×3×3 block keeps only its shell)", () => {
    const [m] = meshVoxels(cube(3), { toLinear });
    expect(m.faces).toBe(6 * 9);
    expect(windingOk(m)).toBe(true);
  });

  it("culls across material groups but emits each face in its own group", () => {
    const v: Voxel[] = [[0, 0, 0, WHITE], [1, 0, 0, "#ff0000"]];
    const [a, b] = meshVoxels(v, { toLinear, groups: 2, groupOf: (x) => (x[3] === WHITE ? 0 : 1) });
    expect(a.faces).toBe(5);
    expect(b.faces).toBe(5);
  });

  it("darkens corners where a voxel meets the floor (AO) and leaves open tops bright", () => {
    const floor: Voxel[] = [];
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) floor.push([x, 0, z, WHITE]);
    const [m] = meshVoxels([...floor, [0, 1, 0, WHITE]], { toLinear });
    const shades = new Set<number>();
    let topOfPost = 0;
    for (let i = 0; i < m.positions.length / 3; i++) {
      shades.add(Math.round(m.colors[i * 3] * 100) / 100);
      if (m.normals[i * 3 + 1] === 1 && m.positions[i * 3 + 1] === 2) {
        topOfPost++;
        expect(m.colors[i * 3]).toBe(1);
      }
    }
    expect(topOfPost).toBe(4);
    expect(shades.has(AO_CURVE[2])).toBe(true); // post side corner touching the floor
    expect(windingOk(m)).toBe(true);
  });

  it("keeps emissive groups unshaded when asked", () => {
    const floor: Voxel[] = [[0, 0, 0, WHITE], [1, 0, 0, WHITE], [0, 1, 0, "#ff0000"]];
    const [, lights] = meshVoxels(floor, { toLinear, groups: 2, groupOf: (x) => (x[3] === WHITE ? 0 : 1), noAo: new Set([1]) });
    expect([...lights.colors].every((c) => c === 1)).toBe(true);
  });

  it("draws off-grid voxels whole and lets them occlude nothing", () => {
    const [m] = meshVoxels([[0, 0, 0, WHITE], [0.5, 0, 0, WHITE]], { toLinear });
    expect(m.faces).toBe(12);
  });

  it("deduplicates repeated cells", () => {
    const [m] = meshVoxels([[0, 0, 0, WHITE], [0, 0, 0, WHITE]], { toLinear });
    expect(m.faces).toBe(6);
  });

  it("scales by voxel size and stores the voxel centre per vertex", () => {
    const [m] = meshVoxels([[2, 0, 0, WHITE]], { toLinear, size: 0.5 });
    const xs = [...m.positions].filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs)).toBeCloseTo(0.75);
    expect(Math.max(...xs)).toBeCloseTo(1.25);
    expect(m.centers[0]).toBeCloseTo(1);
    expect(m.centers[1]).toBeCloseTo(0.25);
  });

  it("skips the downward faces of the base layer when asked, and nothing else", () => {
    // Two voxels on the ground and one overhanging above: only the two on the ground lose their underside.
    const model: Voxel[] = [[0, 0, 0, "#fff"], [1, 0, 0, "#fff"], [0, 1, 0, "#fff"], [0, 1, 1, "#fff"]];
    const [all] = meshVoxels(model, { toLinear: () => [1, 1, 1] });
    const [grounded] = meshVoxels(model, { toLinear: () => [1, 1, 1], noFloor: true });
    expect(all.faces - grounded.faces).toBe(2);
    let down = 0;
    for (let i = 0; i < grounded.faces; i++) if (grounded.normals[i * 12 + 1] === -1) down++;
    expect(down).toBe(1); // the overhang keeps its underside
    expect(grounded.positions.length).toBe(grounded.faces * 12);
    expect(grounded.indices.length).toBe(grounded.faces * 6);
  });
});
