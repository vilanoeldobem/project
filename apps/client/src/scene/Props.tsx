import { Html } from "@react-three/drei";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Color, type Group, type InstancedMesh, MeshStandardMaterial, Object3D, PlaneGeometry } from "three";

import { BENCHES, GIFTS, DONATION_PANEL, INTERACT_DISTANCE, LAMPS, type LotDef, LOTS, NPCS, PALETTE as P, QUEST_SPAWNS, STREET_LAMPS } from "@vila/shared/game/world";
import { asNgoLevel } from "@vila/shared/game/ngo-level";
import { questState } from "@vila/shared/game/quests";
import { catalogFor } from "@vila/shared/game/quests-v2/catalog";
import { STORY_NPC_IDS } from "@vila/shared/game/quests-v2/world";
import { openFromScene, visit } from "../game/clicks";
import { npcMarkers } from "../game/npc-markers";
import { useQuestsEnabled } from "../game/questsFlag";
import { useQuestsV2Enabled } from "../game/questsV2Flag";
import { useVila } from "../game/store";
import { sim } from "../game/sim";
import type { LotInfo } from "../lib/api";
import { hudChrome, underChrome } from "../lib/hud-chrome";
import { lotLabel } from "../lib/lots";
import { joinLitRoles, type MergeItem, MergedVoxels, mergeVoxelModels, type Placement, Voxels } from "./Voxels";
import { sideOf } from "./sectors";
import { modelExtent, partAt } from "./shadowCasters";
import { Smoke } from "./environment/Particles";
import { villager } from "./gen/characters";
import { donationPanel, ornamentCrate, reindeerBell, winterSprig } from "./gen/quest-items";
import type { GenModel } from "./gen/types";
import { gift as generateGift, lantern as generateLantern } from "./gen/props";
import { NGO_LABEL_HEIGHT, ngoBuilding } from "./gen/ngoBuilding";
import { refinedOnce } from "./gen/refine";
import { bench, BULBS, lamp, lotMarker, tree } from "./models";

const GLOW = [P.gold];

export function ChristmasTree() {
  const v = useMemo(tree, []);
  return (
    <group onClick={(e) => (e.stopPropagation(), openFromScene({ kind: "donation" }))}>
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
// A paved pad under a published chalet, gravel on a free lot (IMPL-0030: the ground is no longer white).
const PAD_COLOR = { published: new Color(P.paver), available: new Color(P.gravel) };
const padDummy = new Object3D();

/**
 * Lots: a generated chalet per published NGO (seed = lot id), "available" markers otherwise (one
 * instanced draw for all markers; a click resolves the lot from the instance id).
 *
 * The chalets are baked into one geometry for each street of each side of the village (IMPL-0031): the village
 * has 97 lots, and a mesh per chalet was two or three draw calls each. A block joins the shadow pass only while
 * the shadow of one of its chalets is seen (`casters`), like the rows of houses; all are baked again when the
 * list of published lots changes, which is when `/lots` answers.
 */
export function Lots({ info }: { info: Record<string, LotInfo> }) {
  const marker = useMemo(lotMarker, []);
  const isPublished = (id: string) => info[id]?.state === "published" && !!info[id]?.ngo_name;
  const published = useMemo(() => LOTS.filter((l) => isPublished(l.id)), [info]);
  const available = useMemo(() => LOTS.filter((l) => !isPublished(l.id)), [info]);
  // Each published NGO gets its own building, seeded by the lot id: same house for every visitor, no branding.
  // Its level (IMPL-0032, PROPOSTA) comes from the API and is 1 while the feature is off.
  const levels = published.map((lot) => asNgoLevel(info[lot.id]?.ngo_level)).join();
  const homes = useMemo(() => published.map((lot) => ({ lot, level: asNgoLevel(info[lot.id]?.ngo_level), model: refinedOnce(`ngo:${lot.id}:${asNgoLevel(info[lot.id]?.ngo_level)}`, () => ngoBuilding(lot.id, info[lot.id]?.ngo_level)) })), [published, levels]);
  const { blocks, lit } = useMemo(() => {
    const byBlock = new Map<string, { lots: LotDef[]; items: MergeItem[] }>();
    for (const { lot, model } of homes) {
      // A block for each side of each ring, and for each quarter of the square, whose twelve chalets stand
      // close together and are in view together. Measured with every lot published, zoomed out at the tree:
      // 142 draw calls with a block a side everywhere, 130 with the square in quarters; a block a quarter on
      // the rings too was worse on both counts (153 calls, 280 000 triangles: blocks too large to cull).
      const side = sideOf(lot.x, lot.z);
      const key = `${lot.street}:${lot.street === "plaza" ? Math.floor(side / 2) : side}`;
      let b = byBlock.get(key);
      if (!b) byBlock.set(key, (b = { lots: [], items: [] }));
      b.lots.push(lot);
      b.items.push({ voxels: model.voxels, size: model.size, glow: model.glow, emissive: model.emissive, ao: model.ao, placements: [{ x: lot.x, z: lot.z, rot: lot.facing }] });
    }
    const blocks = [...byBlock.values()].map((b) => ({
      lots: b.lots,
      geometries: mergeVoxelModels(b.items),
      casters: b.items.flatMap((item) => {
        const { reach, height } = modelExtent(item.voxels, item.size);
        return item.placements.map((at) => partAt(at.x, at.z, reach, height));
      }),
    }));
    // The windows and the strings of lights of every block are two meshes for the whole village, like the rows of
    // houses: a block of its own for them was two more draw calls for every block in view (148 of the 150 of the
    // budget on the second street, with a house on every lot and the lights of the upper levels, IMPL-0032).
    return { blocks, lit: joinLitRoles(blocks.map((b) => b.geometries)) };
  }, [homes]);
  const chimneys = useMemo(
    () =>
      homes.map(({ lot, model }): [number, number, number] => {
        // Chimney anchor (house-local) rotated by the lot facing, then moved to the lot.
        const [cx, cy, cz] = (model.anchors?.chimney ?? [0, 6 / model.size, 0]).map((a) => a * model.size);
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
    openFromScene({ kind: "lot", lotId: lot.id });
  };
  return (
    <>
      <Smoke origins={chimneys} />
      <instancedMesh ref={pads} args={[PAD, PAD_MATERIAL, LOTS.length]} receiveShadow onClick={click(LOTS)} />
      {blocks.map((block) => (
        <group
          key={block.lots.map((lot) => lot.id).join()}
          onClick={(e) => {
            e.stopPropagation();
            // The chalet under the pointer: the lot of the block nearest to where the ray landed.
            const lot = block.lots.reduce((a, b) => (Math.hypot(b.x - e.point.x, b.z - e.point.z) < Math.hypot(a.x - e.point.x, a.z - e.point.z) ? b : a));
            openFromScene({ kind: "lot", lotId: lot.id });
          }}
        >
          <MergedVoxels geometries={block.geometries} casters={block.casters} />
        </group>
      ))}
      <group
        onClick={(e) => {
          if (published.length === 0) return;
          e.stopPropagation();
          const lot = published.reduce((a, b) => (Math.hypot(b.x - e.point.x, b.z - e.point.z) < Math.hypot(a.x - e.point.x, a.z - e.point.z) ? b : a));
          openFromScene({ kind: "lot", lotId: lot.id });
        }}
      >
        <MergedVoxels geometries={lit} />
      </group>
      {available.length > 0 && (
        <group onClick={click(available)}>
          <Voxels voxels={marker} placements={place(available)} />
        </group>
      )}
      {LOTS.map((lot) => {
        const pub = isPublished(lot.id);
        return (
          <group key={lot.id} position={[lot.x, 0, lot.z]}>
            {/* A label is mounted only near the avatar, like the villagers' (see `Label`): the village has 97 lots. */}
            <Label y={pub ? NGO_LABEL_HEIGHT[asNgoLevel(info[lot.id]?.ngo_level)] : 5} text={lotLabel(info, lot.id)} x={lot.x} z={lot.z} radius={pub ? undefined : FREE_LOT_LABEL_RADIUS} />
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
 * Distance limit (world units) for the DOM labels of lots, shops, NPCs and the lectern: `@react-three/drei`'s
 * `Html` projects every mounted label on the main thread each frame, so labels on the far side of the village
 * are pure DOM cost. A label is on the page only while its prop is within 28 u of the avatar: more than the
 * 21 u the camera sits south of the avatar at the default zoom, so whatever is near the middle of the screen is
 * labelled. The lots and the shops stand about 31 u from the tree: from the spawn the south ones are labelled,
 * from the tree's axis none is. (The tree's own label has no limit.)
 */
const LABEL_RADIUS = 28;
/**
 * A free lot says so only from close by (IMPL-0031): the rings have rows of them, and the same two words over
 * every lot in sight covered the village. The name of a published house keeps the full radius.
 */
const FREE_LOT_LABEL_RADIUS = 13;
/** A mounted label is compared with the HUD every this many frames. */
const CHROME_EVERY = 6;

/**
 * Short 3D label over a prop. With `x`/`z` the label is only mounted while the avatar is within `radius`
 * (`LABEL_RADIUS` unless a nearer one is asked); the check runs each frame but only changes state when the
 * boolean flips.
 */
export function Label({ y, text, x, z, radius = LABEL_RADIUS }: { y: number; text: string; x?: number; z?: number; radius?: number }) {
  const [near, setNear] = useState(() => x === undefined || z === undefined || Math.hypot(sim.pose.x - x, sim.pose.z - z) <= radius);
  const prev = useRef(near);
  const box = useRef<HTMLDivElement>(null);
  const tick = useRef(0);
  useFrame(() => {
    // A label that would sit under a button, the hint or a notice of the HUD is hidden until it is clear of it
    // (`lib/hud-chrome.ts`): on a phone the HUD covers the top and the bottom of a small screen.
    const el = box.current;
    if (el && tick.current++ % CHROME_EVERY === 0) {
      const hide = underChrome(el.getBoundingClientRect(), hudChrome(performance.now()));
      if ((el.style.visibility === "hidden") !== hide) el.style.visibility = hide ? "hidden" : "";
    }
    if (x === undefined || z === undefined) return;
    const next = Math.hypot(sim.pose.x - x, sim.pose.z - z) <= radius;
    if (next === prev.current) return;
    prev.current = next;
    setNear(next);
  });
  if (!near) return null;
  return (
    <Html ref={box} position={[0, y, 0]} center distanceFactor={28} zIndexRange={[10, 0]} className="label3d">
      {text}
    </Html>
  );
}

/**
 * The five fictional quest NPCs (PROPOSTA quests-v1): seeded villagers that block the avatar and carry a
 * short symbol + name label. A click opens the dialogue only from talking distance (the same reach as the
 * action button); from farther away it walks the avatar up to the NPC. Mounted only with the quests flag.
 * While the story is on, a book that re-declares one of them draws it (`StoryProps`): only the v1 characters
 * no book owns stay here, so nobody is drawn and labelled twice.
 */
export function QuestNpcs() {
  const progress = useVila((s) => s.progress);
  const quests = useQuestsEnabled();
  const quests2 = useQuestsV2Enabled();
  const catalog = useMemo(() => catalogFor(quests, quests2), [quests, quests2]);
  const models = useMemo(
    () => NPCS.filter((npc) => !quests2 || !STORY_NPC_IDS.has(npc.id)).map((npc) => ({ npc, m: villager(npc.seed) })),
    [quests2]
  );
  const labels = useMemo(() => npcMarkers(models.map(({ npc }) => npc), catalog, progress), [models, catalog, progress]);
  return (
    <>
      {models.map(({ npc, m }) => (
        <group
          key={npc.id}
          position={[npc.x, 0, npc.z]}
          rotation-y={npc.rot}
          onClick={(e) => {
            e.stopPropagation();
            // Too far to talk: walk there instead. The walk ends next to the NPC, on the avatar's side.
            visit(npc, { kind: "npc", npcId: npc.id }, INTERACT_DISTANCE);
          }}
        >
          <Voxels voxels={m.voxels} size={m.size} emissive={m.emissive} idle={m.idle} castShadow />
          <Label y={4.2} text={labels.get(npc.id) ?? npc.name} x={npc.x} z={npc.z} />
        </group>
      ))}
    </>
  );
}

const QUEST_ITEM_GEN: Record<string, (seed: string) => GenModel> = {
  "reindeer-bell": reindeerBell,
  "ornament-crate": ornamentCrate,
  "lake-lantern": generateLantern,
  "winter-sprig": winterSprig,
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
  const m = useMemo(() => donationPanel("donation-panel"), []);
  return (
    <group position={[DONATION_PANEL.x, 0, DONATION_PANEL.z]} rotation-y={DONATION_PANEL.rot} onClick={(e) => (e.stopPropagation(), openFromScene({ kind: "donation" }))}>
      <Voxels voxels={m.voxels} size={m.size} emissive={m.emissive} castShadow />
      <Label y={2.2} text="Doação global" x={DONATION_PANEL.x} z={DONATION_PANEL.z} />
    </group>
  );
}
