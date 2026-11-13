import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, Color, type Group, type InstancedMesh, type Material, Matrix4, Object3D } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { foliageMaterial, idleMaterial, lightsMaterial, solidMaterial, windowMaterial } from "./environment/materials";
import { meshVoxels } from "./mesher";
import type { Voxel } from "./models";
import type { CasterPart } from "./shadowCasters";
import { useShadowCasters } from "./ShadowCulling";

/** Placement of one copy of a model (repeated props share one geometry and one draw call per role). */
export interface Placement {
  x: number;
  z: number;
  y?: number;
  /** Rotation around Y (rad). */
  rot?: number;
}

interface Props {
  voxels: Voxel[];
  size?: number;
  /** Colours that glow and twinkle (bulbs, star, lanterns): shared emissive material. */
  emissive?: string[];
  /** Colours that glow steadily with the time of day (windows). */
  glow?: string[];
  /** Colours that sway with the wind (pine foliage). */
  sway?: string[];
  castShadow?: boolean;
  /** Draw the model once per placement (instanced). Omitted = a single copy at the group origin. */
  placements?: Placement[];
  /** Living thing: the solid role breathes/looks around in the vertex shader (`idleMaterial`). */
  idle?: boolean;
  /** Draws every role with this material instead of the shared ones (the avatar's see-through outline). */
  material?: Material;
  /** A large static block: it casts a shadow only while the shadow of one of these parts is seen (`useShadowCasters`). */
  casters?: readonly CasterPart[];
}

const ROLES = ["solid", "lights", "glow", "sway"] as const;
type Role = (typeof ROLES)[number];
const MATERIAL: Record<Role, Material> = {
  solid: solidMaterial,
  lights: lightsMaterial,
  glow: windowMaterial,
  sway: foliageMaterial,
};
/** Emissive bulbs keep their colour; AO would dim the glow tint. */
const NO_AO = new Set([ROLES.indexOf("lights")]);

const tmp = new Color();
const toLinear = (css: string): [number, number, number] => {
  tmp.set(css);
  return [tmp.r, tmp.g, tmp.b];
};
const dummy = new Object3D();

/**
 * Meshes a voxel model into one geometry per material role (`ROLES` order; null = role unused).
 * The caller owns (and disposes) the geometries.
 */
export function voxelGeometries(
  voxels: Voxel[],
  size: number,
  roles: { emissive?: string[]; glow?: string[]; sway?: string[]; noFloor?: boolean } = {}
): Array<BufferGeometry | null> {
  const lower = (a: string[] = []) => new Set(a.map((c) => c.toLowerCase()));
  const sets: Array<[number, Set<string>]> = [[1, lower(roles.emissive)], [2, lower(roles.glow)], [3, lower(roles.sway)]];
  const meshes = meshVoxels(voxels, {
    size,
    groups: ROLES.length,
    groupOf: (v) => {
      const c = v[3].toLowerCase();
      return sets.find(([, s]) => s.has(c))?.[0] ?? 0;
    },
    noAo: NO_AO,
    noFloor: roles.noFloor,
    toLinear,
  });
  return meshes.map((m) => {
    if (m.faces === 0) return null;
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(m.positions, 3));
    g.setAttribute("normal", new BufferAttribute(m.normals, 3));
    g.setAttribute("color", new BufferAttribute(m.colors, 3));
    g.setAttribute("aCenter", new BufferAttribute(m.centers, 3));
    g.setIndex(new BufferAttribute(m.indices, 1));
    g.computeBoundingSphere();
    return g;
  });
}

/**
 * Draws a voxel model as merged, face-culled, ambient-occluded meshes (see `mesher.ts`): one draw call
 * per material role, and per role for all `placements` together.
 */
export function Voxels({ voxels, size = 1, emissive = [], glow = [], sway = [], castShadow = true, placements, idle = false, material, casters }: Props) {
  const group = useRef<Group>(null);
  const geometries = useMemo(
    () => voxelGeometries(voxels, size, { emissive, glow, sway }),
    // Colour lists are literals at call sites; their content, not identity, defines the grouping.
    [voxels, size, emissive.join(), glow.join(), sway.join()]
  );
  useShadowCasters(group, casters, geometries);

  useEffect(() => () => geometries.forEach((g) => g?.dispose()), [geometries]);

  return (
    <group ref={group}>
      {ROLES.map((role, i) => {
        const geometry = geometries[i];
        if (!geometry) return null;
        const cast = castShadow && role !== "lights" && role !== "glow";
        return placements ? (
          <Instanced key={role} geometry={geometry} material={material ?? (role === "solid" && idle ? idleMaterial : MATERIAL[role])} placements={placements} castShadow={cast} />
        ) : (
          <mesh key={role} geometry={geometry} material={material ?? (role === "solid" && idle ? idleMaterial : MATERIAL[role])} castShadow={cast && !material} receiveShadow={!material} renderOrder={material ? 5 : 0} />
        );
      })}
    </group>
  );
}

function Instanced({
  geometry,
  material,
  placements,
  castShadow,
}: {
  geometry: BufferGeometry;
  material: Material;
  placements: Placement[];
  castShadow: boolean;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    placements.forEach((p, i) => {
      dummy.position.set(p.x, p.y ?? 0, p.z);
      dummy.rotation.set(0, p.rot ?? 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [geometry, placements]);
  return <instancedMesh ref={ref} args={[geometry, material, placements.length]} castShadow={castShadow} receiveShadow />;
}

/** A model and the world transforms of its copies, for `mergeVoxelModels`. */
export interface MergeItem {
  voxels: Voxel[];
  size: number;
  emissive?: string[];
  glow?: string[];
  placements: Placement[];
}

const tmpMatrix = new Matrix4();

/**
 * Bakes many static models (any rotation) into one geometry per material role: the whole set costs one
 * draw call per role instead of one per model. Positions, normals and the per-voxel `aCenter` are all
 * transformed, so twinkle/sway shaders keep working. The caller disposes the result.
 */
export function mergeVoxelModels(items: MergeItem[]): Array<BufferGeometry | null> {
  const perRole: BufferGeometry[][] = ROLES.map(() => []);
  for (const item of items) {
    // Baked models stand on the ground: the underside of their base layer is never seen.
    const base = voxelGeometries(item.voxels, item.size, { emissive: item.emissive, glow: item.glow, noFloor: (item.placements[0]?.y ?? 0) === 0 });
    for (const p of item.placements) {
      dummy.position.set(p.x, p.y ?? 0, p.z);
      dummy.rotation.set(0, p.rot ?? 0, 0);
      dummy.updateMatrix();
      tmpMatrix.copy(dummy.matrix);
      base.forEach((g, role) => {
        if (!g) return;
        const copy = g.clone();
        copy.applyMatrix4(tmpMatrix); // position + normal
        (copy.getAttribute("aCenter") as BufferAttribute).applyMatrix4(tmpMatrix);
        perRole[role].push(copy);
      });
    }
    base.forEach((g) => g?.dispose());
  }
  return perRole.map((list) => {
    if (list.length === 0) return null;
    const merged = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    merged?.computeBoundingSphere();
    return merged;
  });
}

/**
 * Takes the small roles that glow (bulbs and lanterns, windows) out of several results of `mergeVoxelModels`
 * and joins them into one geometry per role: one draw call each for the whole set instead of two per block.
 * They cast no shadow and are a few dozen triangles per block, so nothing is gained by culling them block by
 * block. The inputs keep their other roles; the roles taken are set to null in them.
 */
export function joinLitRoles(blocks: Array<Array<BufferGeometry | null>>): Array<BufferGeometry | null> {
  return ROLES.map((role, i) => {
    if (role !== "lights" && role !== "glow") return null;
    const list = blocks.flatMap((b) => (b[i] ? [b[i]] : []));
    for (const b of blocks) b[i] = null;
    if (list.length === 0) return null;
    const joined = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    joined?.computeBoundingSphere();
    return joined;
  });
}

/**
 * Draws geometries from `mergeVoxelModels` with the shared role materials. `casters`: the parts of a large
 * block, which then casts a shadow only while the shadow of one of them is seen (`useShadowCasters`).
 */
export function MergedVoxels({ geometries, castShadow = true, casters }: { geometries: Array<BufferGeometry | null>; castShadow?: boolean; casters?: readonly CasterPart[] }) {
  const group = useRef<Group>(null);
  useShadowCasters(group, casters, geometries);
  useEffect(() => () => geometries.forEach((g) => g?.dispose()), [geometries]);
  return (
    <group ref={group}>
      {ROLES.map((role, i) => {
        const g = geometries[i];
        if (!g) return null;
        return <mesh key={role} geometry={g} material={MATERIAL[role]} castShadow={castShadow && role !== "lights" && role !== "glow"} receiveShadow />;
      })}
    </group>
  );
}
