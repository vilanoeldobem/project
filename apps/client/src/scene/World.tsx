import { Canvas } from "@react-three/fiber";
import { lazy, Suspense, useMemo } from "react";

import { usePreset } from "../environment/settings";
import type { Collider } from "@vila/shared/game/motion";
import { HOUSE_ENVELOPE, lotColliders, LOTS, plotColliders, RESIDENTIAL_PLOTS } from "@vila/shared/game/world";
import type { LotInfo } from "../lib/api";
import { useQuestsEnabled } from "../game/questsFlag";
import { EnvironmentDriver } from "./environment/EnvironmentDriver";
import { Lighting } from "./environment/Lighting";
import { Footprints, GameplayBursts, Sparkles } from "./environment/Particles";
import { Sky } from "./environment/Sky";
import { Snow } from "./environment/Snow";
import { ClickMarker } from "./ClickMarker";
import { Ground } from "./Ground";
import { ModerationMarker } from "./ModerationMarker";
import { Player } from "./Player";
import { RemotePlayers } from "./RemotePlayers";
import { RenderStats } from "./RenderStats";
import { ChristmasTree, DonationLectern, Gifts, Lamps, Lots, QuestItems, QuestNpcs } from "./Props";
import { Critters, LightStrings, PlacedProps, Mountains, Pines, Pond, Sleigh, Snowfield, Snowmen } from "./Scenery";
import { house } from "./gen/houses";
import { residence } from "./villageModels";
import { Billboards, Residences, Shops } from "./Village";

// Bloom (high/ultra only) loads on demand: low/medium devices never download the post-processing code.
const PostFx = lazy(() => import("./environment/PostFx").then((m) => ({ default: m.PostFx })));

/**
 * Walls and porch of the chalet of every residential plot (IMPL-0023): the footprint of the very model
 * `Residences` draws. Static, so built once.
 */
const HOMES: Collider[] = RESIDENTIAL_PLOTS.flatMap((plot) => plotColliders(plot, residence(plot).solid ?? null));

/**
 * 3D village. Snowy Christmas village whose light follows the real São Paulo time and whose fictional
 * weather is shared by every visitor (IMPL-0006). Quality presets change cost, never the world state.
 */
export function World({ lots }: { lots: Record<string, LotInfo> }) {
  const preset = usePreset();
  // PROPOSTA quests-v1: NPCs, quest items and the donation lectern exist only while quests are on.
  const quests = useQuestsEnabled();
  // What blocks the avatar on each lot (IMPL-0016): the walls and porch of a published chalet (the footprint
  // of the very model `Lots` draws), otherwise the corner posts and the sign of the "available" marker.
  // Keyed by the published ids, so a refetch that changes nothing keeps the same navigation field.
  const published = LOTS.filter((l) => lots[l.id]?.state === "published" && lots[l.id]?.ngo_name).map((l) => l.id).join();
  const lotSolids = useMemo((): Collider[] => {
    const ids = new Set(published.split(","));
    return [...LOTS.flatMap((l) => lotColliders(l, ids.has(l.id) ? (house(l.id).solid ?? HOUSE_ENVELOPE) : null)), ...HOMES];
  }, [published]);
  return (
    <Canvas
      shadows={preset.shadows}
      dpr={[1, preset.maxDpr]}
      camera={{ position: [0, 26, 26], fov: 40, near: 0.5, far: 260 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      aria-label="Praça da Vila Noel do Bem em 3D"
    >
      <RenderStats maxDpr={preset.maxDpr} />
      <EnvironmentDriver />
      <Lighting />
      <Sky />
      <Suspense fallback={null}>
        <Snowfield />
        <Ground />
        <Mountains />
        <Pines />
        <Pond />
        <ChristmasTree />
        {quests && <DonationLectern />}
        {quests && <QuestNpcs />}
        {quests && <QuestItems />}
        <Lamps />
        <LightStrings />
        <Snowmen />
        <Critters />
        <PlacedProps />
        <Sleigh />
        <Lots info={lots} />
        <Shops />
        <Billboards />
        <Residences />
        <Gifts />
        <Footprints />
        <ClickMarker />
        <Player lots={lotSolids} />
        <RemotePlayers />
        <ModerationMarker />
        <Snow />
        <Sparkles />
        <GameplayBursts />
      </Suspense>
      {preset.bloom && (
        <Suspense fallback={null}>
          <PostFx strength={preset.bloomStrength} />
        </Suspense>
      )}
    </Canvas>
  );
}
