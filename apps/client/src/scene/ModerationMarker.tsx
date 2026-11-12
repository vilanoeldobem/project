import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { type Mesh, MeshBasicMaterial, RingGeometry } from "three";

import { useModeration } from "../lib/moderation";
import { remotes } from "../net/multiplayer";

/**
 * Moderation mode only (PROPOSTA, IMPL-0021): a ring on the ground under the visitor the administrator
 * selected, so the keyboard selection on the HUD can be told apart in the scene. A marker, not a control: it
 * takes no pointer events, and nothing is drawn for anybody who has no selection.
 */
export function ModerationMarker() {
  const selected = useModeration((s) => (s.on ? s.selected : null));
  return selected === null ? null : <Ring id={selected} />;
}

function Ring({ id }: { id: number }) {
  const mesh = useRef<Mesh>(null);
  const { geometry, material } = useMemo(
    () => ({
      geometry: new RingGeometry(0.7, 0.92, 40).rotateX(-Math.PI / 2),
      material: new MeshBasicMaterial({ color: "#b54848", transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
    }),
    []
  );
  useEffect(() => () => (geometry.dispose(), material.dispose()), [geometry, material]);
  useFrame(() => {
    const remote = remotes.get(id);
    if (!mesh.current) return;
    mesh.current.visible = Boolean(remote);
    if (remote) mesh.current.position.set(remote.x, 0.05, remote.z);
  });
  return <mesh ref={mesh} geometry={geometry} material={material} visible={false} raycast={() => null} renderOrder={2} />;
}
