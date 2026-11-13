import { useMemo } from "react";

import { PALETTE as P, PLAZA_RADIUS, STREET_INNER, STREET_OUTER, WORLD_RADIUS } from "@vila/shared/game/world";
import { events } from "../game/events";
import { useVila } from "../game/store";
import { WALK } from "../lib/controls";
import { selectVisitorAt } from "../lib/moderation";
import { Voxels } from "./Voxels";
import type { Voxel } from "./models";

/** Snowy voxel ground: cobbled plaza with snow patches, packed-snow ring street, deep snow beyond. */
export function Ground() {
  const setTarget = useVila((s) => s.setTarget);
  const voxels = useMemo(() => {
    const v: Voxel[] = [];
    const R = WORLD_RADIUS + 3;
    // Cheap value noise so snow reads as relief, not a flat white plane (spec §2.4).
    const n = (x: number, z: number) => Math.sin(x * 0.37 + z * 0.11) * Math.cos(z * 0.29 - x * 0.07);
    for (let x = -R; x <= R; x++)
      for (let z = -R; z <= R; z++) {
        const r = Math.hypot(x, z);
        if (r > R) continue;
        const noise = n(x, z);
        let c: string;
        if (r <= PLAZA_RADIUS) c = noise > 0.35 ? P.snowShade : (x + z) % 2 === 0 ? P.stone : P.stoneDark;
        else if (r < STREET_INNER) c = P.snow;
        else if (r <= STREET_OUTER) c = Math.floor(r * 2) % 7 === 0 ? P.streetDark : noise > 0.5 ? P.snowShade : P.street;
        else c = noise > 0.45 ? P.snowDeep : noise > -0.2 ? P.snow : P.snowShade;
        v.push([x, -1, z, c]);
      }
    return v;
  }, []);
  return (
    <group>
      <Voxels voxels={voxels} castShadow={false} />
      <mesh
        rotation-x={-Math.PI / 2}
        position-y={0.01}
        onPointerDown={(e) => {
          // Only the first finger walks: a second one starts a pinch zoom (Player).
          if (!WALK.accepts({ button: e.button, isPrimary: e.nativeEvent.isPrimary })) return;
          e.stopPropagation();
          // Moderation mode only (PROPOSTA, IMPL-0021): a click on another visitor selects it instead of walking.
          // The removal itself is flat HTML on the HUD; for everybody else this is always false.
          if (selectVisitorAt(e.ray.origin, e.ray.direction)) return;
          setTarget({ x: e.point.x, z: e.point.z });
          // Feedback goes where the avatar will end up, which is not always where the click landed.
          const to = useVila.getState().target;
          if (to) events.emit({ type: "tap", x: to.x, z: to.z });
        }}
      >
        <circleGeometry args={[WORLD_RADIUS + 3, 48]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
