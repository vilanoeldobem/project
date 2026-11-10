import { useFrame } from "@react-three/fiber";
import { useEffect } from "react";

import { startEnvironmentSync, tickEnvironment } from "../../environment/runtime";
import { useEnvSettings } from "../../environment/settings";
import { lightsMaterial, U, windowMaterial } from "./materials";

/**
 * Runs first in every frame (spec §16.3): one timestamp → `env.frame`, then the few shared uniforms.
 * Every other environment subsystem only reads `env.frame`.
 */
export function EnvironmentDriver() {
  useEffect(() => startEnvironmentSync(), []);

  useFrame(({ clock }) => {
    const f = tickEnvironment();
    const s = useEnvSettings.getState();
    U.uWorldTime.value = f.worldSeconds;
    U.uTime.value = clock.elapsedTime;
    U.uWindDir.value.set(Math.cos(f.weather.windDirectionRad), Math.sin(f.weather.windDirectionRad));
    U.uWindStrength.value = f.weather.windStrength;
    U.uTwinkle.value = s.reduceFlicker ? 0 : 1;
    U.uMotion.value = s.reduceMotion ? 0 : 1;
    // Emissive budget instead of real lights (spec §5.1): bulbs keep a hint of colour by day.
    lightsMaterial.emissiveIntensity = 0.45 + 1.6 * f.look.artificial;
    windowMaterial.emissiveIntensity = 0.05 + 1.9 * f.look.artificial;
  }, -1);

  return null;
}

