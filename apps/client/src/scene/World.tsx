import { Canvas } from "@react-three/fiber";
import { lazy, Suspense } from "react";

import { usePreset } from "../environment/settings";
import { LOTS } from "@vila/shared/game/world";
import type { LotInfo } from "../lib/api";
import { useQuestsEnabled } from "../game/questsFlag";
import { EnvironmentDriver } from "./environment/EnvironmentDriver";
import { Lighting } from "./environment/Lighting";
import { Footprints, GameplayBursts, Sparkles } from "./environment/Particles";
import { Sky } from "./environment/Sky";
import { Snow } from "./environment/Snow";
import { ClickMarker } from "./ClickMarker";
import { Ground } from "./Ground";
import { VillageLife } from "./Life";
import { ModerationMarker } from "./ModerationMarker";
import { Player } from "./Player";
import { RemotePlayers } from "./RemotePlayers";
import { RenderStats } from "./RenderStats";
import { ShadowCulling } from "./ShadowCulling";
import { ChristmasTree, DonationLectern, Gifts, Lamps, Lots, QuestItems, QuestNpcs } from "./Props";
import { LightStrings, PlacedProps, Mountains, Pines, Pond, Sleigh, Snowfield, Snowmen } from "./Scenery";
import { Billboards, Residences, Shops } from "./Village";

// Bloom (high/ultra only) loads on demand: low/medium devices never download the post-processing code.
const PostFx = lazy(() => import("./environment/PostFx").then((m) => ({ default: m.PostFx })));

/**
 * 3D village. Snowy Christmas village whose light follows the real São Paulo time and whose fictional
 * weather is shared by every visitor (IMPL-0006). Quality presets change cost, never the world state.
 */
export function World({ lots }: { lots: Record<string, LotInfo> }) {
  const preset = usePreset();
  // PROPOSTA quests-v1: NPCs, quest items and the donation lectern exist only while quests are on.
  const quests = useQuestsEnabled();
  // What blocks the avatar on each lot depends on whether its chalet is published (`scene/sceneColliders.ts`,
  // IMPL-0016). Keyed by the published ids, so a refetch that changes nothing keeps the same navigation field.
  const published = LOTS.filter((l) => lots[l.id]?.state === "published" && lots[l.id]?.ngo_name).map((l) => l.id).join();
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
      <ShadowCulling />
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
        <PlacedProps />
        {/* The village's characters and animals (IMPL-0025): before the avatar, which asks who stands near. */}
        <VillageLife />
        <Sleigh />
        <Lots info={lots} />
        <Shops />
        <Billboards />
        <Residences />
        <Gifts />
        <Footprints />
        <ClickMarker />
        <Player published={published} />
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
