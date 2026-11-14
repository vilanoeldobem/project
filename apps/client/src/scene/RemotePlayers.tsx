import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BufferGeometry, CircleGeometry, type InstancedMesh, Matrix4, type Mesh, MeshBasicMaterial, Quaternion, Vector3 } from "three";

import { MOTION } from "@vila/shared/game/motion";
import { ROOM_CAPACITY } from "@vila/shared/net/protocol";

import { remotes, sampleRemotes, useNet } from "../net/multiplayer";
import { AVATAR_SIZE, avatarParts, HIP_Y, SHOULDER_Y, walkLift, walkSwing } from "./models";
import { mergeRemoteAvatars, remoteMaterials, remoteTexture, writePart } from "./remoteAvatars";
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
const root = new Matrix4();
const out = new Matrix4();
const q = new Quaternion();
const up = new Vector3(0, 1, 0);
const one = new Vector3(1, 1, 1);
const pos = new Vector3();

/**
 * Other visitors (IMPL-0008): every remote is a slot of one merged mesh whose five rigid parts read their matrices
 * from a float texture (`remoteAvatars.ts`), so the room costs one draw call in the scene pass, one in the shadow
 * pass and one instanced contact shadow, whatever the number of distinct looks. The merged geometry is rebuilt
 * only when someone joins, leaves or changes look. Poses come from snapshot interpolation; the walk cycle follows
 * the distance moved on screen.
 */
export function RemotePlayers() {
  const looks = useNet((s) => s.looks);
  const mesh = useRef<Mesh>(null);
  const blobs = useRef<InstancedMesh>(null);
  const blob = useMemo(() => new CircleGeometry(0.5, 16).rotateX(-Math.PI / 2), []);
  const blobMaterial = useMemo(() => new MeshBasicMaterial({ color: "#1f2a3d", transparent: true, opacity: 0.22, depthWrite: false }), []);
  useEffect(() => () => (blob.dispose(), blobMaterial.dispose()), [blob, blobMaterial]);
  const last = useRef(new Map<number, { x: number; z: number }>());

  const batch = useMemo(() => {
    const texture = remoteTexture(ROOM_CAPACITY);
    return { texture, ...remoteMaterials(texture), geometry: new BufferGeometry(), roster: "" };
  }, []);
  /** Part geometries of each look present, meshed once per look. */
  const parts = useMemo(() => new Map<string, Array<BufferGeometry | null>>(), []);
  useEffect(
    () => () => {
      batch.geometry.dispose();
      batch.texture.dispose();
      batch.surface.dispose();
      batch.depth.dispose();
      for (const list of parts.values()) list.forEach((g) => g?.dispose());
      parts.clear();
    },
    [batch, parts]
  );

  /** Rebuilds the merged geometry for the remotes in `slots` order (on join, leave or a change of look). */
  const rebuild = (slots: ReadonlyArray<{ lookKey: string }>) => {
    const present = new Set(slots.map((r) => r.lookKey));
    for (const [key, list] of parts)
      if (!present.has(key) || !looks[key]) (list.forEach((g) => g?.dispose()), parts.delete(key));
    const geometries = slots.map((r) => {
      const look = looks[r.lookKey];
      if (!look) return [];
      let list = parts.get(r.lookKey);
      if (!list) {
        const voxels = avatarParts(look);
        list = PARTS.map((p) => voxelGeometries(voxels[p.key], AVATAR_SIZE)[0] ?? null);
        parts.set(r.lookKey, list);
      }
      return list;
    });
    batch.geometry.dispose();
    batch.geometry = mergeRemoteAvatars(geometries);
    if (mesh.current) mesh.current.geometry = batch.geometry;
  };

  useFrame(() => {
    sampleRemotes();
    const slots = [...remotes.values()].slice(0, ROOM_CAPACITY);
    const roster = slots.map((r) => `${r.id}:${r.lookKey}:${looks[r.lookKey] ? 1 : 0}`).join(",");
    if (roster !== batch.roster) (batch.roster = roster), rebuild(slots);
    const data = batch.texture.image.data as Float32Array;
    slots.forEach((r, slot) => {
      const prev = last.current.get(r.id);
      const moved = prev ? Math.hypot(r.x - prev.x, r.z - prev.z) : 0;
      if (prev) (prev.x = r.x), (prev.z = r.z);
      else last.current.set(r.id, { x: r.x, z: r.z });
      r.walk += (moved / MOTION.stride) * Math.PI;
      const run = Math.min(r.speed / MOTION.maxSpeed, 1);
      const swing = walkSwing(r.walk, run);
      root.compose(pos.set(r.x, walkLift(r.walk, run), r.z), q.setFromAxisAngle(up, r.yaw), one);
      PARTS.forEach((p, i) => {
        local.makeTranslation(p.at[0], p.at[1], p.at[2]);
        if (p.swing) local.multiply(rot.makeRotationX(swing * p.swing));
        writePart(data, slot, i, out.multiplyMatrices(root, local));
      });
      blobs.current?.setMatrixAt(slot, out.makeTranslation(r.x, 0.03, r.z));
    });
    for (const id of last.current.keys()) if (!remotes.has(id)) last.current.delete(id);
    batch.texture.needsUpdate = true;
    if (mesh.current) mesh.current.visible = slots.length > 0;
    if (blobs.current) {
      blobs.current.count = slots.length;
      blobs.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      <mesh
        ref={mesh}
        geometry={batch.geometry}
        material={batch.surface}
        customDepthMaterial={batch.depth}
        castShadow
        frustumCulled={false}
        visible={false}
      />
      <instancedMesh ref={blobs} args={[blob, blobMaterial, ROOM_CAPACITY]} frustumCulled={false} renderOrder={1} />
    </>
  );
}
