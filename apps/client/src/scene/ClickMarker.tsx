import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { type Mesh, MeshBasicMaterial, RingGeometry } from "three";

import { events } from "../game/events";
import { useVila } from "../game/store";
import { U } from "./environment/materials";

/** Seconds the click ripple lasts. */
const RIPPLE_LIFE = 0.55;
const GOLD = "#f3d27a";

/**
 * Click/tap feedback: a gold ring ripples out where the player clicked, and a small ring marks the
 * destination until the avatar arrives (or the walk is cancelled). Twinkle particles: GameplayBursts.
 */
export function ClickMarker() {
  const ripple = useRef<Mesh>(null);
  const pin = useRef<Mesh>(null);
  const tap = useRef<{ x: number; z: number; born: number; fresh: boolean }>({ x: 0, z: 0, born: -Infinity, fresh: false });
  const { geometry, rippleMaterial, pinMaterial } = useMemo(() => {
    const opts = { color: GOLD, transparent: true, depthWrite: false, toneMapped: false };
    return {
      geometry: new RingGeometry(0.42, 0.56, 40).rotateX(-Math.PI / 2),
      rippleMaterial: new MeshBasicMaterial(opts),
      pinMaterial: new MeshBasicMaterial({ ...opts, opacity: 0.6 }),
    };
  }, []);
  useEffect(() => () => (geometry.dispose(), rippleMaterial.dispose(), pinMaterial.dispose()), [geometry, rippleMaterial, pinMaterial]);
  useEffect(
    () =>
      events.on((e) => {
        if (e.type === "tap") tap.current = { x: e.x, z: e.z, born: 0, fresh: true };
      }),
    []
  );

  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    const t = tap.current;
    if (t.fresh) {
      t.fresh = false;
      t.born = now;
    }
    const r = ripple.current;
    if (r) {
      const age = (now - t.born) / RIPPLE_LIFE;
      r.visible = age >= 0 && age < 1;
      if (r.visible) {
        const ease = 1 - (1 - age) * (1 - age);
        // Reduced motion: no expansion, only the fade.
        r.scale.setScalar(1 + 1.6 * ease * U.uMotion.value);
        r.position.set(t.x, 0.06, t.z);
        rippleMaterial.opacity = 0.95 * (1 - age);
      }
    }
    const p = pin.current;
    const target = useVila.getState().target;
    if (p) {
      p.visible = target !== null;
      if (target) {
        p.position.set(target.x, 0.05, target.z);
        p.scale.setScalar(0.7 + 0.08 * Math.sin(now * 6) * U.uMotion.value);
      }
    }
  });

  return (
    <>
      <mesh ref={pin} geometry={geometry} material={pinMaterial} visible={false} renderOrder={2} />
      <mesh ref={ripple} geometry={geometry} material={rippleMaterial} visible={false} renderOrder={2} />
    </>
  );
}
