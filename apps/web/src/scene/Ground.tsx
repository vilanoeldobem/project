import { useMemo } from "react";

import { PALETTE as P, PLAZA_RADIUS, STREET_INNER, STREET_OUTER, WORLD_RADIUS } from "../game/world";
import { useVila } from "../game/store";
import { Voxels } from "./Voxels";
import type { Voxel } from "./models";

/** Voxel ground: stone plaza, ring street, grass. Click/tap sets the avatar destination. */
export function Ground() {
  const setTarget = useVila((s) => s.setTarget);
  const voxels = useMemo(() => {
    const v: Voxel[] = [];
    const R = WORLD_RADIUS + 3;
    for (let x = -R; x <= R; x++)
      for (let z = -R; z <= R; z++) {
        const r = Math.hypot(x, z);
        if (r > R) continue;
        let c: string;
        if (r <= PLAZA_RADIUS) c = (x + z) % 2 === 0 ? P.stone : P.stoneDark;
        else if (r < STREET_INNER) c = P.cream;
        else if (r <= STREET_OUTER) c = (Math.floor(r * 2) % 7 === 0 ? "#9A8E7F" : P.street);
        else c = (x * 31 + z * 17) % 5 === 0 ? P.grassDark : P.grass;
        v.push([x, -1, z, c]);
      }
    return v;
  }, []);
  return (
    <group>
      <Voxels voxels={voxels} />
      <mesh
        rotation-x={-Math.PI / 2}
        position-y={0.01}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          setTarget({ x: e.point.x, z: e.point.z });
        }}
      >
        <circleGeometry args={[WORLD_RADIUS + 3, 48]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
