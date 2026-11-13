import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, Color } from "three";

import { WORLD_RADIUS } from "@vila/shared/game/world";
import { events } from "../game/events";
import { useVila } from "../game/store";
import { selectVisitorAt } from "../lib/moderation";
import { solidMaterial } from "./environment/materials";
import { groundRuns } from "./groundRuns";

/**
 * Snowy ground: cobbled plaza, packed-snow streets, the paving of each tier and deep snow beyond (`groundAt`
 * in the shared world is the layout). One draw call.
 */
export function Ground() {
  const setTarget = useVila((s) => s.setTarget);
  const geometry = useMemo(() => {
    const runs = groundRuns(Math.ceil(WORLD_RADIUS) + 3);
    const positions = new Float32Array(runs.length * 12), normals = new Float32Array(runs.length * 12), colors = new Float32Array(runs.length * 12);
    const indices = new Uint32Array(runs.length * 6);
    const tint = new Color();
    const cache = new Map<string, [number, number, number]>();
    runs.forEach(([x0, x1, z, c], i) => {
      let rgb = cache.get(c);
      if (!rgb) cache.set(c, (rgb = [tint.set(c).r, tint.g, tint.b]));
      const corners = [[x0 - 0.5, z - 0.5], [x0 - 0.5, z + 0.5], [x1 + 0.5, z + 0.5], [x1 + 0.5, z - 0.5]];
      corners.forEach(([x, cz], k) => {
        const o = (i * 4 + k) * 3;
        positions[o] = x;
        positions[o + 2] = cz;
        normals[o + 1] = 1;
        colors.set(rgb, o);
      });
      indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    });
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("normal", new BufferAttribute(normals, 3));
    g.setAttribute("color", new BufferAttribute(colors, 3));
    g.setIndex(new BufferAttribute(indices, 1));
    g.computeBoundingSphere();
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group>
      <mesh geometry={geometry} material={solidMaterial} receiveShadow />
      <mesh
        rotation-x={-Math.PI / 2}
        position-y={0.01}
        onPointerDown={(e) => {
          // Only the first finger walks: a second one starts a pinch zoom (Player).
          if (e.button !== 0 || !e.nativeEvent.isPrimary) return;
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
        <circleGeometry args={[WORLD_RADIUS + 3, 64]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
