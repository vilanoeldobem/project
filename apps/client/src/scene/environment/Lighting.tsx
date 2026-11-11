import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Color, type DirectionalLight, FogExp2, type HemisphereLight, Object3D, type PointLight } from "three";

import { env } from "../../environment/runtime";
import { usePreset } from "../../environment/settings";
import { sim } from "../../game/sim";
import { linear } from "./materials";

const SHADOW_EXTENT = 30;
const KEY_DISTANCE = 60;

/**
 * Hybrid cartoon lighting (spec §5.1): one key directional light (sun by day, moon by night — a single
 * shadow caster), a hemisphere fill so no face goes black, fog harmonised with the sky, and a single
 * hero point light on the tree. Everything else glows through emissive materials.
 */
export function Lighting() {
  const key = useRef<DirectionalLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const hero = useRef<PointLight>(null);
  const preset = usePreset();
  const { scene, gl } = useThree();
  const target = useRef(new Object3D());

  useEffect(() => {
    const fog = new FogExp2("#c8d8e6", 0.006);
    const bg = new Color("#c8d8e6");
    scene.fog = fog;
    scene.background = bg;
    scene.add(target.current);
    const t = target.current;
    return () => {
      scene.fog = null;
      scene.background = null;
      scene.remove(t);
    };
  }, [scene]);

  useFrame(() => {
    const { look } = env.frame;
    const p = sim.pose;
    const k = key.current, h = hemi.current;
    if (!k || !h) return;

    const isDay = look.sunIntensity >= look.moonIntensity * 0.25;
    k.color.setRGB(...linear(look.sunColor));
    k.intensity = 2.3 * look.sunIntensity + 1.1 * look.moonIntensity;
    if (!isDay) k.color.lerp(MOON_TINT, 0.6);
    // Keep the shadow frustum around the avatar: crisp texels where the person looks (spec §5.2).
    target.current.position.set(p.x, 0, p.z);
    k.target = target.current;
    k.position.set(
      p.x + look.sunDirection[0] * KEY_DISTANCE,
      look.sunDirection[1] * KEY_DISTANCE,
      p.z + look.sunDirection[2] * KEY_DISTANCE
    );

    h.color.setRGB(...linear(look.hemiSky));
    h.groundColor.setRGB(...linear(look.hemiGround));
    h.intensity = 1.05 * look.hemiIntensity;

    const fog = scene.fog as FogExp2 | null;
    if (fog) {
      fog.color.setRGB(...linear(look.fogColor));
      fog.density = look.fogDensity;
    }
    (scene.background as Color | null)?.setRGB(...linear(look.fogColor));
    gl.toneMappingExposure = look.exposure;

    if (hero.current) hero.current.intensity = 10 + 90 * look.artificial;
  }, 0);

  return (
    <>
      <hemisphereLight ref={hemi} args={["#DCF0FB", "#7184A1", 1]} />
      <directionalLight
        ref={key}
        castShadow={preset.shadows}
        shadow-mapSize={[preset.shadowMapSize, preset.shadowMapSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={1}
        shadow-camera-far={140}
      />
      {/* distance 0 = physical inverse-square falloff with no cut-off ring on the snow. */}
      <pointLight ref={hero} position={[0, 9, 7]} intensity={30} distance={0} decay={2} color="#FFC77A" />
    </>
  );
}

const MOON_TINT = new Color("#A1BBFF");
