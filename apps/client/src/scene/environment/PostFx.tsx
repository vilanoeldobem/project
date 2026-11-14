import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { HalfFloatType, Vector2 } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import { env } from "../../environment/runtime";

/**
 * Modest bloom for bulbs, windows and the star (spec §11.2), high/ultra presets only.
 * HDR scene pass → bloom → OutputPass (tone mapping + sRGB exactly once, spec §11.3).
 * The threshold sits above lit snow, so white surfaces never bloom.
 */
export function PostFx({ strength }: { strength: number }) {
  const { gl, scene, camera, size } = useThree();
  // Adaptive resolution changes the pixel ratio without changing the CSS size: follow it, or the passes keep
  // rendering at the resolution they started with.
  const dpr = useThree((s) => s.viewport.dpr);

  const { composer, bloom, passes } = useMemo(() => {
    const c = new EffectComposer(gl);
    c.renderTarget1.texture.type = HalfFloatType;
    c.renderTarget2.texture.type = HalfFloatType;
    const b = new UnrealBloomPass(new Vector2(256, 256), strength, 0.55, 1.0);
    const owned = [new RenderPass(scene, camera), b, new OutputPass()];
    for (const pass of owned) c.addPass(pass);
    return { composer: c, bloom: b, passes: owned };
  }, [gl, scene, camera, strength]);

  useEffect(() => {
    composer.setPixelRatio(dpr);
    composer.setSize(size.width, size.height);
  }, [composer, dpr, size]);

  // The composer frees only its own targets; each pass owns render targets, materials and a quad of its own.
  useEffect(
    () => () => {
      for (const pass of passes) pass.dispose();
      composer.dispose();
    },
    [composer, passes]
  );

  // Priority 1 takes over rendering from react-three-fiber.
  useFrame((_, dt) => {
    bloom.strength = strength * (0.35 + 0.65 * env.frame.look.artificial);
    composer.render(dt);
  }, 1);

  return null;
}
