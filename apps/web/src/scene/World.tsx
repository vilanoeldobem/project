import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";

import type { LotInfo } from "../lib/api";
import { Ground } from "./Ground";
import { Player } from "./Player";
import { ChristmasTree, Gifts, Lamps, Lots, Palms } from "./Props";

/** 3D plaza scene. Summer late afternoon: warm light, peach sky, no snow. */
export function World({ lots }: { lots: Record<string, LotInfo> }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [0, 26, 26], fov: 40, near: 0.5, far: 220 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      aria-label="Praça da Vila Noel do Bem em 3D"
    >
      <color attach="background" args={["#F3D7B6"]} />
      <fog attach="fog" args={["#F3D7B6", 45, 95]} />
      <hemisphereLight args={["#FFE9C7", "#4E6B45", 0.9]} />
      <directionalLight
        position={[18, 30, 12]}
        intensity={1.8}
        color="#FFD9A0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
      />
      <Suspense fallback={null}>
        <Ground />
        <ChristmasTree />
        <Lamps />
        <Palms />
        <Lots info={lots} />
        <Gifts />
        <Player />
      </Suspense>
    </Canvas>
  );
}
