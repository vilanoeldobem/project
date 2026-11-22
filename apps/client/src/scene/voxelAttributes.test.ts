/**
 * Which voxel geometries carry the per-voxel centre (`aCenter`). Only the materials that move or phase a voxel
 * in their vertex shader read it (`lightsMaterial`, `foliageMaterial`, `idleMaterial`); static solid and window
 * geometry leaves it out (48 of the 204 bytes of a quad). Every geometry of one role must still have the same
 * attributes, or `mergeGeometries` refuses to join them.
 */
import type { BufferGeometry, Material } from "three";
import { describe, expect, it } from "vitest";

import { foliageMaterial, idleMaterial, lightsMaterial, solidMaterial, windowMaterial } from "./environment/materials";
import { pine, SWAY, type Voxel } from "./models";
import { joinLitRoles, mergeVoxelModels, needsCenter, voxelGeometries } from "./Voxels";

const SOLID = 0, LIGHTS = 1, GLOW = 2, ROLE_SWAY = 3;
const BULB = "#ffd75e", WINDOW = "#ffc785";
/** A small block with a bulb on top and a window on one side: every static role and one animated one. */
const HOUSE: Voxel[] = [
  [0, 0, 0, "#aa3333"], [1, 0, 0, "#aa3333"], [0, 1, 0, "#aa3333"], [1, 1, 0, WINDOW], [0, 2, 0, BULB],
];
const names = (g: BufferGeometry | null) => (g ? Object.keys(g.attributes).sort() : null);

describe("voxel geometry attributes", () => {
  it("leaves the voxel centre out of static solid and window geometry (every role carries the block edges)", () => {
    const g = voxelGeometries(HOUSE, 1, { emissive: [BULB], glow: [WINDOW] });
    expect(names(g[SOLID])).toEqual(["aGrid", "color", "normal", "position"]);
    expect(names(g[GLOW])).toEqual(["aGrid", "color", "normal", "position"]);
  });

  it("keeps it where a shader reads it: twinkling lights, swaying foliage, idle solids", () => {
    const house = voxelGeometries(HOUSE, 1, { emissive: [BULB], glow: [WINDOW] });
    expect(names(house[LIGHTS])).toContain("aCenter");
    const tree = voxelGeometries(pine(true), 1, { sway: SWAY });
    expect(names(tree[ROLE_SWAY])).toContain("aCenter");
    expect(names(tree[SOLID])).not.toContain("aCenter");
    expect(names(voxelGeometries(HOUSE, 1, { idle: true })[SOLID])).toContain("aCenter");
  });

  it("keeps it in every piece of a model drawn in parts, for the animated roles only", () => {
    const g = voxelGeometries(pine(true), 1, { sway: SWAY, partOf: (v) => (v[0] < 0 ? 0 : 1), parts: 2 });
    g.forEach((geometry, i) => {
      if (geometry) expect(names(geometry)?.includes("aCenter"), `group ${i}`).toBe(i % 4 === ROLE_SWAY);
    });
  });

  it("merges models of mixed roles, transforming the centres it keeps", () => {
    const merged = mergeVoxelModels([
      { voxels: HOUSE, size: 1, emissive: [BULB], glow: [WINDOW], placements: [{ x: 10, z: 0 }, { x: -10, z: 5, rot: Math.PI / 2 }] },
      { voxels: HOUSE.slice(0, 2), size: 1, placements: [{ x: 0, z: 20 }] },
    ]);
    expect(merged.map(names)).toEqual([
      ["aGrid", "color", "normal", "position"],
      ["aCenter", "aGrid", "color", "normal", "position"],
      ["aGrid", "color", "normal", "position"],
      null,
    ]);
    // The bulb of the first copy is at (10, 2.5, 0) in the world.
    const center = merged[LIGHTS]!.getAttribute("aCenter");
    expect(center.getX(0)).toBeCloseTo(10);
    expect(center.getY(0)).toBeCloseTo(2.5);
    const lit = joinLitRoles([merged, mergeVoxelModels([{ voxels: HOUSE, size: 1, emissive: [BULB], glow: [WINDOW], placements: [{ x: 0, z: 0 }] }])]);
    expect(lit.map(names)).toEqual([null, ["aCenter", "aGrid", "color", "normal", "position"], ["aGrid", "color", "normal", "position"], null]);
  });

  it("keeps it for exactly the role materials whose vertex shader reads it", () => {
    const reads = (m: Material) => {
      const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <begin_vertex>", fragmentShader: "#include <common>\n#include <emissivemap_fragment>" };
      m.onBeforeCompile(shader as never, undefined as never);
      return shader.vertexShader.includes("attribute vec3 aCenter");
    };
    const roles = [["solid", solidMaterial], ["lights", lightsMaterial], ["glow", windowMaterial], ["sway", foliageMaterial]] as const;
    for (const [role, material] of roles) expect(reads(material), role).toBe(needsCenter(role));
    expect(reads(idleMaterial)).toBe(needsCenter("solid", true));
  });
});
