/**
 * Story v2 props and NPCs (PROPOSTA). Mounted once while `quests2` is on. All NPCs share one merged mesh per
 * material role, so a book's cast does not add a mesh per character; labels and pickups stay DOM/individual
 * because they are few and must be readable.
 */
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group } from "three";

import { INTERACT_DISTANCE } from "@vila/shared/game/world";
import { questStateIn, catalogFor } from "@vila/shared/game/quests-v2/catalog";
import { worldStatesIn } from "@vila/shared/game/quests-v2/states";
import type { StoryInteraction, StorySpawn, WorldStateId } from "@vila/shared/game/quests-v2/types";
import { STORY_WORLD } from "@vila/shared/game/quests-v2/world";

import { visit } from "../game/clicks";
import { npcMarkers } from "../game/npc-markers";
import { useQuestsEnabled } from "../game/questsFlag";
import { useVila } from "../game/store";
import { Label } from "./Props";
import { villager } from "./gen/characters";
import { storyProp } from "./gen/quest-v2/catalog";
import type { GenModel } from "./gen/types";
import { MergedVoxels, mergeVoxelModels, type MergeItem, Voxels } from "./Voxels";

const visible = (requires: readonly WorldStateId[] | undefined, states: ReadonlySet<WorldStateId>): boolean =>
  !requires || requires.every((state) => states.has(state));

/** One active pickup: floats and turns like a hidden gift, so it reads as collectable. */
function StoryItem({ x, z, model }: { x: number; z: number; model: GenModel }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime;
    ref.current.position.y = 0.2 + Math.sin(clock.elapsedTime * 2 + x) * 0.15;
  });
  return (
    <group ref={ref} position={[x, 0, z]}>
      <Voxels voxels={model.voxels} size={model.size} emissive={model.emissive ?? []} />
    </group>
  );
}

/** A static interaction prop, if the book supplied a generator for its object. */
function StoryProp({ interaction, model }: { interaction: StoryInteraction; model: GenModel }) {
  return (
    <group position={[interaction.x, 0, interaction.z]}>
      <Voxels voxels={model.voxels} size={model.size} emissive={model.emissive ?? []} castShadow />
    </group>
  );
}

export function StoryProps() {
  const progress = useVila((s) => s.progress);
  const quests = useQuestsEnabled();
  const catalog = useMemo(() => catalogFor(quests, true), [quests]);
  const states = useMemo(() => worldStatesIn(catalog, progress), [catalog, progress]);
  const npcs = useMemo(() => STORY_WORLD.npcs.filter((npc) => visible(npc.requires, states)), [states]);
  const markers = useMemo(() => npcMarkers(npcs, catalog, progress), [npcs, catalog, progress]);
  const models = useMemo(() => npcs.map((npc) => ({ npc, model: villager(npc.seed) })), [npcs]);
  const geometries = useMemo(
    () =>
      mergeVoxelModels(
        models.map(
          ({ npc, model }): MergeItem => ({
            voxels: model.voxels,
            size: model.size,
            placements: [{ x: npc.x, z: npc.z, rot: npc.rot }],
          })
        )
      ),
    [models]
  );
  const spawns = useMemo(
    () =>
      STORY_WORLD.spawns.filter(
        (spawn) =>
          visible(spawn.requires, states) &&
          !progress.seen[`${spawn.questId}:${spawn.id}`] &&
          questStateIn(catalog, progress, spawn.questId) === "active"
      ),
    [catalog, progress, states]
  );
  const props = useMemo(
    () =>
      STORY_WORLD.interactions.filter(
        (interaction) =>
          interaction.kind === "prop" &&
          visible(interaction.requires, states) &&
          questStateIn(catalog, progress, interaction.questId) === "active"
      ),
    [catalog, progress, states]
  );

  const click = (e: ThreeEvent<MouseEvent>) => {
    if (npcs.length === 0) return;
    e.stopPropagation();
    const npc = npcs.reduce((a, b) =>
      Math.hypot(b.x - e.point.x, b.z - e.point.z) < Math.hypot(a.x - e.point.x, a.z - e.point.z) ? b : a
    );
    visit(npc, { kind: "npc", npcId: npc.id }, INTERACT_DISTANCE);
  };

  return (
    <>
      {npcs.length > 0 && (
        <group onClick={click}>
          <MergedVoxels geometries={geometries} />
        </group>
      )}
      {models.map(({ npc }) => (
        <group key={npc.id} position={[npc.x, 0, npc.z]}>
          <Label y={4.2} text={markers.get(npc.id) ?? npc.name} x={npc.x} z={npc.z} />
        </group>
      ))}
      {spawns.map((spawn: StorySpawn) => {
        const model = storyProp(spawn.objectId);
        return model ? <StoryItem key={spawn.id} x={spawn.x} z={spawn.z} model={model} /> : null;
      })}
      {props.map((interaction) => {
        const model = storyProp(interaction.objectId);
        return model ? <StoryProp key={interaction.id} interaction={interaction} model={model} /> : null;
      })}
    </>
  );
}
