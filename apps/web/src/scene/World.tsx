import { Canvas } from "@react-three/fiber";
import { lazy, Suspense, useMemo } from "react";

import { usePreset } from "../environment/settings";
import type { Collider } from "../game/motion";
import { HOUSE_RADIUS, LOTS } from "../game/world";
import type { LotInfo } from "../lib/api";
import { EnvironmentDriver } from "./environment/EnvironmentDriver";
import { Lighting } from "./environment/Lighting";
import { Footprints, GameplayBursts, Sparkles } from "./environment/Particles";
import { Sky } from "./environment/Sky";
import { Snow } from "./environment/Snow";
import { Ground } from "./Ground";
import { Player } from "./Player";
import { RenderStats } from "./RenderStats";
import { ChristmasTree, Gifts, Lamps, Lots } from "./Props";
import { LightStrings, Mountains, Pines, Pond, Sleigh, Snowfield, Snowmen } from "./Scenery";

// Bloom (high/ultra only) loads on demand: low/medium devices never download the post-processing code.
const PostFx = lazy(() => import("./environment/PostFx").then((m) => ({ default: m.PostFx })));

/**
 * 3D village. Snowy Christmas village whose light follows the real São Paulo time and whose fictional
 * weather is shared by every visitor (IMPL-0006). Quality presets change cost, never the world state.
 */
export function World({ lots }: { lots: Record<string, LotInfo> }) {
  const preset = usePreset();
  // Published chalets block the avatar; available lots stay walkable.
  const houses = useMemo(
    (): Collider[] =>
      LOTS.filter((l) => lots[l.id]?.state === "published" && lots[l.id]?.ngo_name).map((l) => ({ x: l.x, z: l.z, r: HOUSE_RADIUS })),
    [lots]
  );
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
        <Lamps />
        <LightStrings />
        <Snowmen />
        <Sleigh />
        <Lots info={lots} />
        <Gifts />
        <Footprints />
        <Player houses={houses} />
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
