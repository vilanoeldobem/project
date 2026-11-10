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

  const { composer, bloom } = useMemo(() => {
    const c = new EffectComposer(gl);
    c.renderTarget1.texture.type = HalfFloatType;
    c.renderTarget2.texture.type = HalfFloatType;
    c.addPass(new RenderPass(scene, camera));
    const b = new UnrealBloomPass(new Vector2(256, 256), strength, 0.55, 1.0);
    c.addPass(b);
    c.addPass(new OutputPass());
    return { composer: c, bloom: b };
  }, [gl, scene, camera, strength]);

  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, gl, size]);

  useEffect(() => () => composer.dispose(), [composer]);

  // Priority 1 takes over rendering from react-three-fiber.
  useFrame((_, dt) => {
    bloom.strength = strength * (0.35 + 0.65 * env.frame.look.artificial);
    composer.render(dt);
  }, 1);

  return null;
}
