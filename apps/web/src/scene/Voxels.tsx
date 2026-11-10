import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, type InstancedMesh, type Material, Object3D } from "three";

import { foliageMaterial, lightsMaterial, solidMaterial, windowMaterial } from "./environment/materials";
import type { Voxel } from "./models";

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
}

const dummy = new Object3D();
const color = new Color();

type Role = "solid" | "lights" | "glow" | "sway";
const MATERIAL: Record<Role, Material> = {
  solid: solidMaterial,
  lights: lightsMaterial,
  glow: windowMaterial,
  sway: foliageMaterial,
};

/** Draws voxels with InstancedMesh: one draw call per material role. */
export function Voxels({ voxels, size = 1, emissive = [], glow = [], sway = [], castShadow = true }: Props) {
  const groups = useMemo(() => {
    const lower = (a: string[]) => new Set(a.map((c) => c.toLowerCase()));
    const sets: Array<[Role, Set<string>]> = [["lights", lower(emissive)], ["glow", lower(glow)], ["sway", lower(sway)]];
    const out: Record<Role, Voxel[]> = { solid: [], lights: [], glow: [], sway: [] };
    for (const v of voxels) {
      const c = v[3].toLowerCase();
      out[(sets.find(([, s]) => s.has(c))?.[0] ?? "solid") as Role].push(v);
    }
    return out;
  }, [voxels, emissive, glow, sway]);
  return (
    <group>
      {(Object.keys(groups) as Role[]).map((role) => (
        <Instanced key={role} voxels={groups[role]} size={size} role={role} castShadow={castShadow && role !== "lights" && role !== "glow"} />
      ))}
    </group>
  );
}

function Instanced({ voxels, size, role, castShadow }: { voxels: Voxel[]; size: number; role: Role; castShadow: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    voxels.forEach(([x, y, z, c], i) => {
      dummy.position.set(x * size, y * size + size / 2, z * size);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.set(c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [voxels, size]);
  if (voxels.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, MATERIAL[role], voxels.length]}
      castShadow={castShadow}
      receiveShadow
    >
      <boxGeometry args={[size * 0.98, size * 0.98, size * 0.98]} />
    </instancedMesh>
  );
}
