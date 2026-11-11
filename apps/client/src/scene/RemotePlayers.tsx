import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CircleGeometry, type InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from "three";

import type { Look } from "@vila/shared/game/cosmetics";
import { MOTION } from "@vila/shared/game/motion";
import { ROOM_CAPACITY } from "@vila/shared/net/protocol";

import { remotes, sampleRemotes, useNet } from "../net/multiplayer";
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

const local = new Matrix4();
const rot = new Matrix4();
const out = new Matrix4();
const q = new Quaternion();
const up = new Vector3(0, 1, 0);
const one = new Vector3(1, 1, 1);
const pos = new Vector3();

/** Root matrix and limb swing of a remote for this frame (written by `RemotePlayers`, read by groups). */
const frame = new Map<number, { swing: number; root: Matrix4 }>();

/**
 * Other visitors (IMPL-0008): avatars that share a look share five instanced meshes (body + four limbs),
 * so the cost is 5 draw calls per distinct look present, plus one instanced contact shadow for everyone.
 * Poses come from snapshot interpolation; the walk cycle follows the distance moved on screen.
 */
export function RemotePlayers() {
  const looks = useNet((s) => s.looks);
  const blobs = useRef<InstancedMesh>(null);
  const blob = useMemo(() => new CircleGeometry(0.5, 16).rotateX(-Math.PI / 2), []);
  const blobMaterial = useMemo(() => new MeshBasicMaterial({ color: "#1f2a3d", transparent: true, opacity: 0.22, depthWrite: false }), []);
  useEffect(() => () => (blob.dispose(), blobMaterial.dispose()), [blob, blobMaterial]);
  const last = useRef(new Map<number, { x: number; z: number }>());

  // Runs before the look groups (lower priority value first) so they draw this frame's poses.
  useFrame(() => {
    sampleRemotes();
    let n = 0;
    for (const r of remotes.values()) {
      const prev = last.current.get(r.id);
      const moved = prev ? Math.hypot(r.x - prev.x, r.z - prev.z) : 0;
      if (prev) (prev.x = r.x), (prev.z = r.z);
      else last.current.set(r.id, { x: r.x, z: r.z });
      r.walk += (moved / MOTION.stride) * Math.PI;
      const run = Math.min(r.speed / MOTION.maxSpeed, 1);
      const f = frame.get(r.id) ?? { swing: 0, root: new Matrix4() };
      f.swing = walkSwing(r.walk, run);
      f.root.compose(pos.set(r.x, walkLift(r.walk, run), r.z), q.setFromAxisAngle(up, r.yaw), one);
      frame.set(r.id, f);
      if (n < ROOM_CAPACITY) blobs.current?.setMatrixAt(n++, out.makeTranslation(r.x, 0.03, r.z));
    }
    for (const id of last.current.keys()) if (!remotes.has(id)) (last.current.delete(id), frame.delete(id));
    if (blobs.current) {
      blobs.current.count = n;
      blobs.current.instanceMatrix.needsUpdate = true;
    }
  }, -1);

  return (
    <>
      {Object.entries(looks).map(([key, look]) => (
        <LookGroup key={key} lookKey={key} look={look} />
      ))}
      <instancedMesh ref={blobs} args={[blob, blobMaterial, ROOM_CAPACITY]} frustumCulled={false} renderOrder={1} />
    </>
  );
}

/** Five instanced meshes drawing every remote that wears `look`. */
function LookGroup({ lookKey, look }: { lookKey: string; look: Look }) {
  const meshes = useRef<Array<InstancedMesh | null>>([]);
  const geometries = useMemo(() => {
    const parts = avatarParts(look);
    return PARTS.map((p) => voxelGeometries(parts[p.key], AVATAR_SIZE)[0]!);
  }, [look]);
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);

  useFrame(() => {
    let n = 0;
    for (const r of remotes.values()) {
      if (r.lookKey !== lookKey || n >= ROOM_CAPACITY) continue;
      const f = frame.get(r.id);
      if (!f) continue;
      PARTS.forEach((p, i) => {
        const mesh = meshes.current[i];
        if (!mesh) return;
        local.makeTranslation(p.at[0], p.at[1], p.at[2]);
        if (p.swing) local.multiply(rot.makeRotationX(f.swing * p.swing));
        mesh.setMatrixAt(n, out.multiplyMatrices(f.root, local));
      });
      n++;
    }
    for (const m of meshes.current) {
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
    </>
  );
}

