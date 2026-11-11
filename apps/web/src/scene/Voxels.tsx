import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, Color, type InstancedMesh, type Material, Object3D } from "three";

import { foliageMaterial, lightsMaterial, solidMaterial, windowMaterial } from "./environment/materials";
import { meshVoxels } from "./mesher";
import type { Voxel } from "./models";

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
 * Draws a voxel model as merged, face-culled, ambient-occluded meshes (see `mesher.ts`): one draw call
 * per material role, and per role for all `placements` together.
 */
export function Voxels({ voxels, size = 1, emissive = [], glow = [], sway = [], castShadow = true, placements }: Props) {
  const geometries = useMemo(() => {
    const lower = (a: string[]) => new Set(a.map((c) => c.toLowerCase()));
    const sets: Array<[number, Set<string>]> = [[1, lower(emissive)], [2, lower(glow)], [3, lower(sway)]];
    const meshes = meshVoxels(voxels, {
      size,
      groups: ROLES.length,
      groupOf: (v) => {
        const c = v[3].toLowerCase();
        return sets.find(([, s]) => s.has(c))?.[0] ?? 0;
      },
      noAo: NO_AO,
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
    // Colour lists are literals at call sites; their content, not identity, defines the grouping.
  }, [voxels, size, emissive.join(), glow.join(), sway.join()]);

  useEffect(() => () => geometries.forEach((g) => g?.dispose()), [geometries]);

  return (
    <group>
      {ROLES.map((role, i) => {
        const geometry = geometries[i];
        if (!geometry) return null;
        const cast = castShadow && role !== "lights" && role !== "glow";
        return placements ? (
          <Instanced key={role} geometry={geometry} material={MATERIAL[role]} placements={placements} castShadow={cast} />
        ) : (
          <mesh key={role} geometry={geometry} material={MATERIAL[role]} castShadow={cast} receiveShadow />
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
