import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, Color } from "three";

import { WORLD_RADIUS } from "@vila/shared/game/world";
import { pressScene, startPress } from "../game/clicks";
import { WALK } from "../lib/controls";
import { selectVisitorAt } from "../lib/moderation";
import { solidMaterial } from "./environment/materials";
import { groundRuns } from "./groundRuns";

/**
 * Snowy ground: cobbled plaza, packed-snow streets, the paving of each tier and deep snow beyond (`groundAt`
 * in the shared world is the layout). One draw call.
 */
export function Ground() {
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
  // A new press starts with nothing picked, also one that never reaches the ground (a roof against the sky):
  // the listener runs before the scene's own, so a visitor picked by an earlier press never mutes this one.
  useEffect(() => {
    window.addEventListener("pointerdown", startPress, true);
    return () => window.removeEventListener("pointerdown", startPress, true);
  }, []);
  return (
    <group>
      <mesh geometry={geometry} material={solidMaterial} receiveShadow />
      <PressDisc />
    </group>
  );
}

/**
 * A press on the scene. The ground lies under everything, so every press comes through here, and
 * `pressScene` (`game/clicks.ts`) decides what it does: pick a visitor (moderation mode), leave it to what
 * stands in front of the ground, or walk.
 */
function press(e: ThreeEvent<PointerEvent>) {
  // Only the first finger walks: a second one starts a pinch zoom (Player).
  if (!WALK.accepts({ button: e.button, isPrimary: e.nativeEvent.isPrimary })) return;
  const outcome = pressScene({
    intersections: e.intersections,
    own: e.eventObject,
    // Feedback goes where the avatar will end up, which is not always where the click landed (`walkTo`).
    x: e.point.x,
    z: e.point.z,
    // Moderation mode only (PROPOSTA, IMPL-0021): a press on another visitor selects it, whatever is behind it.
    // The removal itself is flat HTML on the HUD; for everybody else this is always false.
    pick: () => selectVisitorAt(e.ray.origin, e.ray.direction),
  });
  if (outcome !== "left") e.stopPropagation();
}

/**
 * The invisible disc that takes the presses, a little above the drawn ground. No hooks, on purpose: the test
 * calls it and presses the very handler the scene mounts (`Ground.test.tsx`).
 */
export function PressDisc() {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.01} onPointerDown={press}>
      <circleGeometry args={[WORLD_RADIUS + 3, 64]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}
