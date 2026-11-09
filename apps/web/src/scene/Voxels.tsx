import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, type InstancedMesh, Object3D } from "three";

import type { Voxel } from "./models";

interface Props {
  voxels: Voxel[];
  size?: number;
  /** Colours that glow (lights, star): rendered by a second, emissive mesh. */
  emissive?: string[];
}

const dummy = new Object3D();
const color = new Color();

/** Draws voxels with InstancedMesh (1–2 draw calls per model). */
export function Voxels({ voxels, size = 1, emissive = [] }: Props) {
  const [solid, lit] = useMemo(() => {
    const glow = new Set(emissive.map((c) => c.toLowerCase()));
    const s: Voxel[] = [], l: Voxel[] = [];
    for (const v of voxels) (glow.has(v[3].toLowerCase()) ? l : s).push(v);
    return [s, l];
  }, [voxels, emissive]);
  return (
    <group>
      <Instanced voxels={solid} size={size} />
      <Instanced voxels={lit} size={size} emissive />
    </group>
  );
}

function Instanced({ voxels, size, emissive }: { voxels: Voxel[]; size: number; emissive?: boolean }) {
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
    <instancedMesh ref={ref} args={[undefined, undefined, voxels.length]} castShadow={!emissive} receiveShadow>
      <boxGeometry args={[size * 0.98, size * 0.98, size * 0.98]} />
      {emissive ? (
        <meshStandardMaterial emissive="#FFC46B" emissiveIntensity={1.6} toneMapped={false} />
      ) : (
        <meshStandardMaterial roughness={0.85} />
      )}
    </instancedMesh>
  );
}
