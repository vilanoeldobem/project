import { Html } from "@react-three/drei";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, type Group, type InstancedMesh, MeshStandardMaterial, Object3D, PlaneGeometry } from "three";

import { GIFTS, LAMPS, type LotDef, LOTS, PALETTE as P } from "@vila/shared/game/world";
import { useVila } from "../game/store";
import type { LotInfo } from "../lib/api";
import { type Placement, Voxels } from "./Voxels";
import { Smoke } from "./environment/Particles";
import { gift as generateGift } from "./gen/props";
import { house } from "./gen/houses";
import { bench, BULBS, lamp, lotMarker, tree } from "./models";

const GLOW = [P.gold];

export function ChristmasTree() {
  const v = useMemo(tree, []);
  const open = useVila((s) => s.open);
  return (
    <group onClick={(e) => (e.stopPropagation(), open({ kind: "donation" }))}>
      <Voxels voxels={v} emissive={BULBS} />
      <Label y={14.5} text="Doação global" />
    </group>
  );
}

/** Lamp posts and benches: every copy shares one geometry (one draw call per material role). */
export function Lamps() {
  const v = useMemo(lamp, []);
  const b = useMemo(bench, []);
  const lamps = useMemo(() => LAMPS.map(([x, z]): Placement => ({ x, z })), []);
  const benches = useMemo(
    () => LAMPS.filter((_, i) => i % 2 === 1).map(([x, z]): Placement => ({ x: x * 0.92, z: z * 0.92, rot: Math.atan2(x, z) })),
    []
  );
  return (
    <>
      <Voxels voxels={v} size={0.5} emissive={GLOW} placements={lamps} />
      <Voxels voxels={b} size={0.5} placements={benches} />
    </>
  );
}

const PAD = new PlaneGeometry(7, 7).rotateX(-Math.PI / 2);
const PAD_MATERIAL = new MeshStandardMaterial({ roughness: 1 });
const PAD_COLOR = { published: new Color(P.snowShade), available: new Color(P.snowDeep) };
const padDummy = new Object3D();

/**
 * Lots: a generated chalet per published NGO (seed = lot id), "available" markers otherwise (one
 * instanced draw for all markers; a click resolves the lot from the instance id).
 */
export function Lots({ info }: { info: Record<string, LotInfo> }) {
  const marker = useMemo(lotMarker, []);
  const open = useVila((s) => s.open);
  const isPublished = (id: string) => info[id]?.state === "published" && !!info[id]?.ngo_name;
  const published = useMemo(() => LOTS.filter((l) => isPublished(l.id)), [info]);
  const available = useMemo(() => LOTS.filter((l) => !isPublished(l.id)), [info]);
  // Each published NGO gets its own chalet, seeded by the lot id: same house for every visitor, no branding.
  const homes = useMemo(() => published.map((lot) => ({ lot, model: house(lot.id) })), [published]);
  const chimneys = useMemo(
    () =>
      homes.map(({ lot, model }): [number, number, number] => {
        // Chimney anchor (house-local) rotated by the lot facing, then moved to the lot.
        const [cx, cy, cz] = model.anchors?.chimney ?? [0, 6, 0];
        const c = Math.cos(lot.facing), s = Math.sin(lot.facing);
        return [lot.x + cx * c + cz * s, cy, lot.z - cx * s + cz * c];
      }),
    [homes]
  );
  const place = (list: LotDef[]) => list.map((l): Placement => ({ x: l.x, z: l.z, rot: l.facing }));
  const pads = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = pads.current;
    if (!mesh) return;
    LOTS.forEach((l, i) => {
      padDummy.position.set(l.x, 0.02, l.z);
      padDummy.rotation.set(0, l.facing, 0);
      padDummy.updateMatrix();
      mesh.setMatrixAt(i, padDummy.matrix);
      mesh.setColorAt(i, isPublished(l.id) ? PAD_COLOR.published : PAD_COLOR.available);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [info]);
  const click = (list: LotDef[]) => (e: ThreeEvent<MouseEvent>) => {
    const lot = e.instanceId === undefined ? undefined : list[e.instanceId];
    if (!lot) return;
    e.stopPropagation();
    open({ kind: "lot", lotId: lot.id });
  };
  return (
    <>
      <Smoke origins={chimneys} />
      <instancedMesh ref={pads} args={[PAD, PAD_MATERIAL, LOTS.length]} receiveShadow onClick={click(LOTS)} />
      {homes.map(({ lot, model }) => (
        <group
          key={lot.id}
          position={[lot.x, 0, lot.z]}
          rotation-y={lot.facing}
          onClick={(e) => (e.stopPropagation(), open({ kind: "lot", lotId: lot.id }))}
        >
          <Voxels voxels={model.voxels} size={model.size} glow={model.glow} />
        </group>
      ))}
      {available.length > 0 && (
        <group onClick={click(available)}>
          <Voxels voxels={marker} placements={place(available)} />
        </group>
      )}
      {LOTS.map((lot) => {
        const pub = isPublished(lot.id);
        return (
          <group key={lot.id} position={[lot.x, 0, lot.z]}>
            <Label y={pub ? 7.5 : 5} text={pub ? String(info[lot.id]?.ngo_name) : "Terreno disponível"} />
          </group>
        );
      })}
    </>
  );
}

export function Gifts() {
  const progress = useVila((s) => s.progress);
  return (
    <>
      {GIFTS.map((g) =>
        progress.seen[`explore-gifts:${g.id}`] || progress.completed["explore-gifts"] ? null : <Gift key={g.id} id={g.id} x={g.x} z={g.z} />
      )}
    </>
  );
}

/** Hidden gift: wrapping generated from its id (IMPL-0010), so every visitor sees the same one. */
function Gift({ id, x, z }: { id: string; x: number; z: number }) {
  const ref = useRef<Group>(null);
  const m = useMemo(() => generateGift(id), [id]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime;
    ref.current.position.y = 0.2 + Math.sin(clock.elapsedTime * 2 + x) * 0.15;
  });
  return (
    <group ref={ref} position={[x, 0, z]}>
      <Voxels voxels={m.voxels} size={m.size} emissive={GLOW} />
    </group>
  );
}

export function Label({ y, text }: { y: number; text: string }) {
  return (
    <Html position={[0, y, 0]} center distanceFactor={28} zIndexRange={[10, 0]} className="label3d">
      {text}
    </Html>
  );
}
