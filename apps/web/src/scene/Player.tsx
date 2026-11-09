import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { type Group, Vector3 } from "three";

import { useVila } from "../game/store";
import { clampToWorld, GIFTS, INTERACT_DISTANCE, LOTS, SPAWN, TREE_RADIUS } from "../game/world";
import { Voxels } from "./Voxels";
import { avatar } from "./models";

const SPEED = 9;
/** Top-down diagonal camera (study; final angle is card G12). */
const CAMERA_OFFSET = new Vector3(0, 24, 21);
const KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};

export function Player() {
  const ref = useRef<Group>(null);
  const pressed = useRef(new Set<string>());
  const look = useMemo(() => new Vector3(), []);
  const camera = useThree((s) => s.camera);
  // Portrait (phones): pull the camera back so the same plaza width fits.
  const zoom = useThree((s) => Math.min(1.8, Math.max(1, 1.3 / (s.size.width / s.size.height))));
  const model = useMemo(avatar, []);

  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const down = (e: KeyboardEvent) => {
      if (typing(e) || !(e.code in KEYS)) return;
      if (useVila.getState().panel.kind !== "none") return;
      e.preventDefault();
      pressed.current.add(e.code);
      useVila.getState().setTarget(null);
    };
    const up = (e: KeyboardEvent) => pressed.current.delete(e.code);
    const blur = () => pressed.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    dt = Math.min(dt, 0.05);
    const s = useVila.getState();
    let dx = 0, dz = 0;
    if (s.panel.kind === "none") {
      for (const k of pressed.current) {
        dx += KEYS[k][0];
        dz += KEYS[k][1];
      }
      if (!dx && !dz && s.target) {
        dx = s.target.x - g.position.x;
        dz = s.target.z - g.position.z;
        if (Math.hypot(dx, dz) < 0.3) {
          dx = dz = 0;
          s.setTarget(null);
        }
      }
    }
    const len = Math.hypot(dx, dz);
    if (len > 0) {
      const step = Math.min(SPEED * dt, len);
      const [x, z] = clampToWorld(g.position.x + (dx / len) * step, g.position.z + (dz / len) * step);
      g.position.set(x, 0, z);
      g.rotation.y = Math.atan2(dx, dz);
      g.position.y = Math.abs(Math.sin(performance.now() / 90)) * 0.15;
      s.setPlayer(x, z);
    }

    // Gifts: collected by proximity ("explore" track).
    for (const gift of GIFTS) {
      if (Math.hypot(gift.x - g.position.x, gift.z - g.position.z) < 1.4) s.record("explore-gifts", gift.id);
    }
    // Closest interaction (tree or lot).
    if (Math.hypot(g.position.x, g.position.z) < TREE_RADIUS + INTERACT_DISTANCE) s.setNearby({ kind: "tree" });
    else {
      const lot = LOTS.find((l) => Math.hypot(l.x - g.position.x, l.z - g.position.z) < INTERACT_DISTANCE);
      s.setNearby(lot ? { kind: "lot", lotId: lot.id } : null);
    }

    look.set(g.position.x, 1, g.position.z);
    camera.position.lerp(look.clone().addScaledVector(CAMERA_OFFSET, zoom), 1 - Math.exp(-4 * dt));
    camera.lookAt(look);
  });

  return (
    <group ref={ref} position={[SPAWN.x, 0, SPAWN.z]}>
      <Voxels voxels={model} size={0.3} />
    </group>
  );
}
