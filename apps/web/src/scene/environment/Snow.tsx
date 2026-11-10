import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { InstancedBufferAttribute, InstancedBufferGeometry, PlaneGeometry, ShaderMaterial, Vector3 } from "three";

import { env } from "../../environment/runtime";
import { mulberry32 } from "../../environment/random";
import { useEnvSettings, usePreset } from "../../environment/settings";
import { useVila } from "../../game/store";
import { U } from "./materials";

/** Snow volume around the avatar (world units). Flakes wrap inside it: no flake follows the camera. */
const BOX = new Vector3(64, 26, 64);

const vertexShader = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uFall;
uniform float uDensity;
uniform float uSize;
uniform float uWindStrength;
uniform float uMotion;
uniform vec2 uWindDir;
uniform vec3 uCenter;
uniform vec3 uBox;
varying float vAlpha;
varying vec2 vUv;

void main() {
  vUv = uv;
  float s = aSeed.w;
  // Density is a threshold over a uniform seed: snowfall 0.3 shows 30% of the pool, no reallocation.
  if (s > uDensity) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; return; }
  float speed = (0.9 + 1.2 * s) * (0.45 + 0.75 * uFall) * mix(0.6, 1.0, uMotion);
  vec3 p;
  p.y = aSeed.y * uBox.y - uTime * speed;
  vec2 drift = uWindDir * (0.3 + 7.0 * uWindStrength) * uTime * (0.6 + 0.8 * s);
  vec2 wobble = uMotion * 0.35 * vec2(sin(uTime * 0.9 + aSeed.x * 37.0), cos(uTime * 0.7 + aSeed.z * 41.0));
  p.xz = aSeed.xz * uBox.xz + drift + wobble;
  vec3 halfBox = uBox * 0.5;
  vec2 origin = uCenter.xz - halfBox.xz;
  p.xz = mod(p.xz - origin, uBox.xz) + origin;
  p.y = mod(p.y, uBox.y);
  vec2 e = abs(p.xz - uCenter.xz) / halfBox.xz;
  float edge = 1.0 - smoothstep(0.75, 1.0, max(e.x, e.y));
  float ground = smoothstep(0.0, 0.8, p.y);
  vAlpha = edge * ground * (0.55 + 0.45 * s);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  // Foreground flakes fade out right at the lens: never a big blob over the avatar or the HUD (spec §8.1).
  vAlpha *= smoothstep(2.0, 6.0, -mv.z);
  mv.xy += position.xy * uSize * (0.6 + 0.8 * s);
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.45, 1.0, d)) * vAlpha * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;

/**
 * GPU snowfall (spec §8.1–8.2): one instanced draw, motion entirely in the vertex shader. The flake
 * count comes from the quality preset; how many are visible comes from the shared macro `snowfall`.
 */
export function Snow() {
  const { snowFlakes } = usePreset();
  const particles = useEnvSettings((s) => s.particles);

  const { geometry, material } = useMemo(() => {
    const g = new InstancedBufferGeometry();
    const quad = new PlaneGeometry(1, 1);
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    g.setAttribute("uv", quad.getAttribute("uv"));
    const rnd = mulberry32(0x5eed);
    const seeds = new Float32Array(snowFlakes * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
    g.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 4));
    g.instanceCount = snowFlakes;
    const m = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: U.uTime,
        uWindDir: U.uWindDir,
        uWindStrength: U.uWindStrength,
        uMotion: U.uMotion,
        uFall: { value: 0 },
        uDensity: { value: 0 },
        uSize: { value: 0.24 },
        uCenter: { value: new Vector3() },
        uBox: { value: BOX },
        uColor: { value: new Vector3(1, 1, 1) },
        uOpacity: { value: 0.9 },
      },
    });
    return { geometry: g, material: m };
  }, [snowFlakes]);

  useEffect(() => () => (geometry.dispose(), material.dispose()), [geometry, material]);

  useFrame(() => {
    const { weather, look } = env.frame;
    const p = useVila.getState().player;
    const u = material.uniforms;
    u.uDensity.value = particles ? weather.snowfall : 0;
    u.uFall.value = weather.snowfall;
    u.uCenter.value.set(p.x, 0, p.z);
    // Flakes pick up the sky light: bright by day, moonlit blue at night, never glowing white.
    const d = look.daylight;
    u.uColor.value.set(0.72 + 0.28 * d, 0.78 + 0.22 * d, 0.92 + 0.08 * d);
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />;
}
