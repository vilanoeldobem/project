import { Html } from "@react-three/drei";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Color, type Group, type InstancedMesh, MeshStandardMaterial, Object3D, PlaneGeometry } from "three";

import { BENCHES, GIFTS, DONATION_PANEL, INTERACT_DISTANCE, LAMPS, type LotDef, LOTS, type NpcPlacement, NPCS, PALETTE as P, QUEST_SPAWNS, STREET_LAMPS } from "@vila/shared/game/world";
import type { Progress } from "@vila/shared/game/progress";
import { QUESTS, questState } from "@vila/shared/game/quests";
import { useVila } from "../game/store";
import { sim } from "../game/sim";
import type { LotInfo } from "../lib/api";
import { lotLabel } from "../lib/lots";
import { type Placement, Voxels } from "./Voxels";
import { Smoke } from "./environment/Particles";
import { villager } from "./gen/characters";
import { donationPanel, ornamentCrate, reindeerBell } from "./gen/quest-items";
import type { GenModel } from "./gen/types";
import { gift as generateGift, lantern as generateLantern } from "./gen/props";
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

/**
 * Lamp posts (the plaza's and the street corners', IMPL-0024) and benches: every copy shares one geometry
 * (one draw call per material role).
 */
export function Lamps() {
  const v = useMemo(lamp, []);
  const b = useMemo(bench, []);
  const lamps = useMemo(() => [...LAMPS, ...STREET_LAMPS].map(([x, z]): Placement => ({ x, z })), []);
  return (
    <>
      <Voxels voxels={v} size={0.5} emissive={GLOW} placements={lamps} />
      <Voxels voxels={b} size={0.5} placements={BENCHES} />
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
            {/* Twelve lots now: a label is mounted only near the avatar, like the villagers' (see `Label`). */}
            <Label y={pub ? 7.5 : 5} text={lotLabel(info, lot.id)} x={lot.x} z={lot.z} />
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

/**
 * Distance limit (world units) for NPC and lectern DOM labels: `@react-three/drei`'s `Html` projects every
 * mounted label on the main thread each frame, so labels on the far side of the village are pure DOM cost.
 * 24 u covers the plaza (radius 12) plus the camera's 21 u reach and the 4.5 u interaction distance; from the
 * tree it reaches the porches of the square's frontage (26 u), so the lots around the square read from there.
 */
const LABEL_RADIUS = 28;

/**
 * Short 3D label over a prop. With `x`/`z` the label is only mounted while the avatar is within
 * `LABEL_RADIUS`; the check runs each frame but only changes state when the boolean flips.
 */
export function Label({ y, text, x, z }: { y: number; text: string; x?: number; z?: number }) {
  const [near, setNear] = useState(() => x === undefined || z === undefined || Math.hypot(sim.pose.x - x, sim.pose.z - z) <= LABEL_RADIUS);
  const prev = useRef(near);
  useFrame(() => {
    if (x === undefined || z === undefined) return;
    const next = Math.hypot(sim.pose.x - x, sim.pose.z - z) <= LABEL_RADIUS;
    if (next === prev.current) return;
    prev.current = next;
    setNear(next);
  });
  if (!near) return null;
  return (
    <Html position={[0, y, 0]} center distanceFactor={28} zIndexRange={[10, 0]} className="label3d">
      {text}
    </Html>
  );
}

/** Symbol + name marker over a quest NPC: never colour alone (PROPOSTA quests-v1). */
function npcMarker(npc: NpcPlacement, progress: Progress): string {
  const states = QUESTS.map((q) => ({ q, state: questState(progress, q.id) }));
  if (states.some(({ q, state }) => q.turnInNpcId === npc.id && state === "ready_to_turn_in")) return `? ${npc.name}`;
  if (states.some(({ q, state }) => q.giverNpcId === npc.id && state === "available")) return `! ${npc.name}`;
  if (states.some(({ q, state }) => (q.giverNpcId === npc.id || q.turnInNpcId === npc.id) && state === "active")) return `... ${npc.name}`;
  return npc.name;
}

/**
 * The five fictional quest NPCs (PROPOSTA quests-v1): seeded villagers that block the avatar and carry a
 * short symbol + name label. A click opens the dialogue only from talking distance (the same reach as the
 * action button); from farther away it walks the avatar up to the NPC. Mounted only with the quests flag.
 */
export function QuestNpcs() {
  const progress = useVila((s) => s.progress);
  const open = useVila((s) => s.open);
  const setTarget = useVila((s) => s.setTarget);
  const models = useMemo(() => NPCS.map((npc) => ({ npc, m: villager(npc.seed) })), []);
  return (
    <>
      {models.map(({ npc, m }) => (
        <group
          key={npc.id}
          position={[npc.x, 0, npc.z]}
          rotation-y={npc.rot}
          onClick={(e) => {
            e.stopPropagation();
            if (Math.hypot(npc.x - sim.pose.x, npc.z - sim.pose.z) < INTERACT_DISTANCE) open({ kind: "npc", npcId: npc.id });
            // Too far to talk: walk there instead. The walk ends next to the NPC, on the avatar's side.
            else setTarget({ x: npc.x, z: npc.z });
          }}
        >
          <Voxels voxels={m.voxels} size={m.size} emissive={m.emissive} idle={m.idle} castShadow />
          <Label y={4.2} text={npcMarker(npc, progress)} x={npc.x} z={npc.z} />
        </group>
      ))}
    </>
  );
}

const QUEST_ITEM_GEN: Record<string, (seed: string) => GenModel> = {
  "reindeer-bell": reindeerBell,
  "ornament-crate": ornamentCrate,
  "lake-lantern": generateLantern,
};

/** Item of an active collect quest: floats and turns like a hidden gift, so it reads as pickable. */
function QuestItem({ x, z, model }: { x: number; z: number; model: GenModel }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime;
    ref.current.position.y = 0.2 + Math.sin(clock.elapsedTime * 2 + x) * 0.15;
  });
  return (
    <group ref={ref} position={[x, 0, z]}>
      <Voxels voxels={model.voxels} size={model.size} emissive={model.emissive ?? GLOW} />
    </group>
  );
}

/** Quest pickups of the active collect quest; a collected id stops being drawn (PROPOSTA quests-v1). */
export function QuestItems() {
  const progress = useVila((s) => s.progress);
  return (
    <>
      {QUEST_SPAWNS.map((spawn) => {
        if (progress.seen[`${spawn.questId}:${spawn.id}`] || questState(progress, spawn.questId) !== "active") return null;
        const gen = QUEST_ITEM_GEN[spawn.objectId];
        return gen ? <QuestItem key={spawn.id} x={spawn.x} z={spawn.z} model={gen(spawn.id)} /> : null;
      })}
    </>
  );
}

/**
 * Global donation lectern next to the tree (DEC-026; PROPOSTA quests-v1): the 3D reading panel and the tree
 * both open the same donation modal. A proposal like the NPCs, so it is mounted only with the quests flag.
 */
export function DonationLectern() {
  const open = useVila((s) => s.open);
  const m = useMemo(() => donationPanel("donation-panel"), []);
  return (
    <group position={[DONATION_PANEL.x, 0, DONATION_PANEL.z]} rotation-y={DONATION_PANEL.rot} onClick={(e) => (e.stopPropagation(), open({ kind: "donation" }))}>
      <Voxels voxels={m.voxels} size={m.size} emissive={m.emissive} castShadow />
      <Label y={2.2} text="Doação global" x={DONATION_PANEL.x} z={DONATION_PANEL.z} />
    </group>
  );
}
