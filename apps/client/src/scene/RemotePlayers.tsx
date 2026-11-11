import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CircleGeometry, type InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from "three";

import { MOTION } from "@vila/shared/game/motion";
import { remotes, sampleRemotes } from "../net/multiplayer";
import { ROOM_CAPACITY } from "@vila/shared/net/protocol";
import { solidMaterial } from "./environment/materials";
import { AVATAR_SIZE, avatarParts, HIP_Y, SHOULDER_Y, walkLift, walkSwing } from "./models";
import { voxelGeometries } from "./Voxels";

/** Part pivots relative to the avatar root (same rig as `Player`). */
const PARTS = [
  { key: "body", at: [0, 0, 0], swing: 0 },
  { key: "legL", at: [-AVATAR_SIZE, HIP_Y, 0], swing: 1 },
  { key: "legR", at: [AVATAR_SIZE, HIP_Y, 0], swing: -1 },
  { key: "armL", at: [-2 * AVATAR_SIZE, SHOULDER_Y, 0], swing: -0.8 },
  { key: "armR", at: [2 * AVATAR_SIZE, SHOULDER_Y, 0], swing: 0.8 },
] as const;

const root = new Matrix4();
const local = new Matrix4();
const rot = new Matrix4();
const out = new Matrix4();
const q = new Quaternion();
const up = new Vector3(0, 1, 0);
const one = new Vector3(1, 1, 1);
const pos = new Vector3();

/**
 * Other visitors (IMPL-0008): every remote avatar shares five instanced meshes (body + four limbs) and
 * one instanced contact shadow, so 1 or 40 visitors cost the same 6 draw calls. Poses come from
 * snapshot interpolation; the walk cycle follows the distance each avatar moves on screen.
 */
export function RemotePlayers() {
  const meshes = useRef<Array<InstancedMesh | null>>([]);
  const blobs = useRef<InstancedMesh>(null);
  const geometries = useMemo(() => {
    const parts = avatarParts();
    return PARTS.map((p) => voxelGeometries(parts[p.key], AVATAR_SIZE)[0]!);
  }, []);
  const blob = useMemo(() => new CircleGeometry(0.5, 16).rotateX(-Math.PI / 2), []);
  const blobMaterial = useMemo(() => new MeshBasicMaterial({ color: "#1f2a3d", transparent: true, opacity: 0.22, depthWrite: false }), []);
  useEffect(() => () => (geometries.forEach((g) => g.dispose()), blob.dispose(), blobMaterial.dispose()), [geometries, blob, blobMaterial]);
  const last = useRef(new Map<number, { x: number; z: number }>());

  useFrame(() => {
    sampleRemotes();
    let n = 0;
    for (const r of remotes.values()) {
      if (n >= ROOM_CAPACITY) break;
      const prev = last.current.get(r.id);
      const moved = prev ? Math.hypot(r.x - prev.x, r.z - prev.z) : 0;
      if (prev) (prev.x = r.x), (prev.z = r.z);
      else last.current.set(r.id, { x: r.x, z: r.z });
      r.walk += (moved / MOTION.stride) * Math.PI;
      const run = Math.min(r.speed / MOTION.maxSpeed, 1);
      const swing = walkSwing(r.walk, run);
      root.compose(pos.set(r.x, walkLift(r.walk, run), r.z), q.setFromAxisAngle(up, r.yaw), one);
      PARTS.forEach((p, i) => {
        const mesh = meshes.current[i];
        if (!mesh) return;
        local.makeTranslation(p.at[0], p.at[1], p.at[2]);
        if (p.swing) local.multiply(rot.makeRotationX(swing * p.swing));
        mesh.setMatrixAt(n, out.multiplyMatrices(root, local));
      });
      blobs.current?.setMatrixAt(n, out.makeTranslation(r.x, 0.03, r.z));
      n++;
    }
    for (const id of last.current.keys()) if (!remotes.has(id)) last.current.delete(id);
    for (const m of [...meshes.current, blobs.current]) {
      if (!m) continue;
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      {geometries.map((g, i) => (
        <instancedMesh
          key={i}
          ref={(m) => void (meshes.current[i] = m)}
          args={[g, solidMaterial, ROOM_CAPACITY]}
          castShadow
          frustumCulled={false}
        />
      ))}
      <instancedMesh ref={blobs} args={[blob, blobMaterial, ROOM_CAPACITY]} frustumCulled={false} renderOrder={1} />
    </>
  );
}
