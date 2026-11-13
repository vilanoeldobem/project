/**
 * A model drawn in pieces (issue #41: the forest and the mountains were single meshes whose bounding sphere
 * covered the village, so they were drawn in full wherever the camera looked). The pieces of
 * `voxelGeometries(…, { partOf, parts })` must be the very triangles of the model meshed whole: same faces
 * hidden, same corner shading, only handed out to more than one mesh.
 */
import type { BufferGeometry } from "three";
import { describe, expect, it } from "vitest";

import { pine, SWAY, type Voxel } from "./models";
import { splitParts, voxelGeometries } from "./Voxels";

/** Every triangle of a geometry as text: its three corners with position, colour and voxel centre. */
function triangles(g: BufferGeometry | null): string[] {
  if (!g) return [];
  const position = g.getAttribute("position"), color = g.getAttribute("color"), center = g.getAttribute("aCenter");
  const index = g.getIndex()!;
  const corner = (i: number) => [position.getX(i), position.getY(i), position.getZ(i), color.getX(i), color.getY(i), color.getZ(i), center.getX(i), center.getY(i), center.getZ(i)].map((n) => n.toFixed(4)).join(",");
  const out: string[] = [];
  for (let t = 0; t < index.count; t += 3) out.push([corner(index.getX(t)), corner(index.getX(t + 1)), corner(index.getX(t + 2))].join("|"));
  return out;
}

// Three pines, two of them touching (their boughs share cells and hide each other's faces), the third apart.
const at = (model: Voxel[], dx: number, dz: number): Voxel[] => model.map(([x, y, z, c]) => [x + dx, y, z + dz, c]);
const MODEL: Voxel[] = [...at(pine(true), -3, 0), ...at(pine(true), 2, 0), ...at(pine(false), 30, 4)];
const PARTS = 3;
const partOf = (v: Voxel) => (v[0] < 0 ? 0 : v[0] < 15 ? 1 : 2);

describe("a voxel model drawn in pieces", () => {
  const whole = voxelGeometries(MODEL, 1, { sway: SWAY });
  const pieces = splitParts(voxelGeometries(MODEL, 1, { sway: SWAY, partOf, parts: PARTS }), PARTS);

  it("is, piece by piece, the very triangles of the model meshed whole", () => {
    whole.forEach((geometry, role) => {
      const all = triangles(geometry).sort();
      const split = pieces.flatMap((roles) => triangles(roles[role])).sort();
      expect(split.length, `role ${role}`).toBe(all.length);
      expect(split).toEqual(all);
    });
    // The foliage and the trunks are both there, in every piece.
    expect(pieces.map((roles) => roles.map(Boolean))).toEqual(Array(PARTS).fill([true, false, false, true]));
  });

  it("keeps the faces between two touching pines hidden, though they are in different pieces", () => {
    const apart = [...voxelGeometries(at(pine(true), -3, 0), 1, { sway: SWAY }), ...voxelGeometries(at(pine(true), 2, 0), 1, { sway: SWAY })];
    const count = (list: Array<BufferGeometry | null>) => list.reduce((n, g) => n + (g?.getIndex()?.count ?? 0) / 3, 0);
    expect(count([...pieces[0], ...pieces[1]])).toBeLessThan(count(apart));
  });

  it("gives each piece a bounding sphere of its own", () => {
    const sphere = (roles: Array<BufferGeometry | null>) => roles[3]!.boundingSphere!;
    expect(sphere(pieces[2]).center.x).toBeGreaterThan(25);
    expect(sphere(pieces[2]).radius).toBeLessThan(8);
    expect(whole[3]!.boundingSphere!.radius).toBeGreaterThan(15);
  });

  it("is one piece when no part is asked for", () => {
    expect(voxelGeometries(MODEL, 1, { sway: SWAY, parts: 4 })).toHaveLength(4);
    expect(splitParts(whole, 1)).toEqual([whole]);
  });
});
