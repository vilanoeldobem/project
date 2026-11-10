import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";

import { usePreset } from "../environment/settings";
import type { LotInfo } from "../lib/api";
import { EnvironmentDriver } from "./environment/EnvironmentDriver";
import { Lighting } from "./environment/Lighting";
import { Footprints, Sparkles } from "./environment/Particles";
import { PostFx } from "./environment/PostFx";
import { Sky } from "./environment/Sky";
import { Snow } from "./environment/Snow";
import { Ground } from "./Ground";
import { Player } from "./Player";
import { ChristmasTree, Gifts, Lamps, Lots } from "./Props";
import { LightStrings, Mountains, Pines, Pond, Sleigh, Snowfield, Snowmen } from "./Scenery";

/**
 * 3D village. Snowy Christmas village whose light follows the real São Paulo time and whose fictional
 * weather is shared by every visitor (IMPL-0006). Quality presets change cost, never the world state.
 */
export function World({ lots }: { lots: Record<string, LotInfo> }) {
  const preset = usePreset();
  return (
    <Canvas
      shadows={preset.shadows}
      dpr={[1, preset.maxDpr]}
      camera={{ position: [0, 26, 26], fov: 40, near: 0.5, far: 260 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      aria-label="Praça da Vila Noel do Bem em 3D"
    >
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
        <Player />
        <Snow />
        <Sparkles />
      </Suspense>
      {preset.bloom && <PostFx strength={preset.bloomStrength} />}
    </Canvas>
  );
}
