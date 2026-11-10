import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  type InstancedMesh,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from "three";

import { env } from "../../environment/runtime";
import { mulberry32 } from "../../environment/random";
import { useEnvSettings, usePreset } from "../../environment/settings";
import { useVila } from "../../game/store";
import { U } from "./materials";

function quadGeometry(count: number, seed: number, attrs = 4) {
  const g = new InstancedBufferGeometry();
  const quad = new PlaneGeometry(1, 1);
  g.index = quad.index;
  g.setAttribute("position", quad.getAttribute("position"));
  g.setAttribute("uv", quad.getAttribute("uv"));
  const rnd = mulberry32(seed);
  const data = new Float32Array(count * attrs);
  for (let i = 0; i < data.length; i++) data[i] = rnd();
  g.setAttribute("aSeed", new InstancedBufferAttribute(data, attrs));
  g.instanceCount = count;
  return g;
}

/* ------------------------------------------------------------------ sparkles */

const sparkleVertex = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uWorldTime;
uniform float uTwinkle;
uniform float uMotion;
varying float vAlpha;
varying vec2 vUv;
void main() {
  vUv = uv;
  float a = aSeed.x * 6.2831;
  float r = 2.5 + aSeed.y * 9.0;
  float rise = mod(aSeed.z * 14.0 + uTime * (0.25 + 0.35 * aSeed.w) * uMotion, 14.0);
  vec3 p = vec3(cos(a + uTime * 0.05 * uMotion) * r, 0.4 + rise, sin(a + uTime * 0.05 * uMotion) * r);
  float tw = mix(1.0, 0.5 + 0.5 * sin(uWorldTime * 2.0 + aSeed.w * 40.0), uTwinkle);
  vAlpha = tw * smoothstep(0.0, 1.5, rise) * (1.0 - smoothstep(10.0, 14.0, rise));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * (0.12 + 0.12 * aSeed.w);
  gl_Position = projectionMatrix * mv;
}
`;

const glowFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - d), 2.0) * vAlpha * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;

/** Magic sparkles drifting up around the tree (spec §9.3); strength = shared `sparkle` × evening. */
export function Sparkles() {
  const { sparkles } = usePreset();
  const particles = useEnvSettings((s) => s.particles);
  const { geometry, material } = useMemo(
    () => ({
      geometry: quadGeometry(sparkles, 0xa11ce),
      material: new ShaderMaterial({
        vertexShader: sparkleVertex,
        fragmentShader: glowFragment,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: U.uTime,
          uWorldTime: U.uWorldTime,
          uTwinkle: U.uTwinkle,
          uMotion: U.uMotion,
          uColor: { value: new Vector3(1.0, 0.82, 0.45) },
          uOpacity: { value: 0 },
        },
      }),
    }),
    [sparkles]
  );
  useEffect(() => () => (geometry.dispose(), material.dispose()), [geometry, material]);
  useFrame(() => {
    const { weather, look } = env.frame;
    material.uniforms.uOpacity.value = particles ? weather.sparkle * (0.25 + 0.75 * look.artificial) : 0;
  });
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />;
}

/* --------------------------------------------------------------------- smoke */

const smokeVertex = /* glsl */ `
attribute vec4 aSeed;
attribute vec3 aOrigin;
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
varying float vAlpha;
varying vec2 vUv;
void main() {
  vUv = uv;
  float life = 6.0;
  float t = mod(uTime + aSeed.x * life, life) / life;
  vec3 p = aOrigin;
  p.y += t * 4.5;
  p.xz += uWindDir * t * (0.6 + 5.0 * uWindStrength) + (aSeed.yz - 0.5) * 0.6 * t;
  vAlpha = smoothstep(0.0, 0.1, t) * (1.0 - t);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * (0.35 + 1.1 * t);
  gl_Position = projectionMatrix * mv;
}
`;

const softFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.3, 1.0, d)) * vAlpha * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;

const PUFFS = 10;

/** Chimney smoke leaning with the shared wind (spec §8.4). One draw call for every chimney. */
export function Smoke({ origins }: { origins: [number, number, number][] }) {
  const key = origins.map((o) => o.join(",")).join(";");
  const { geometry, material } = useMemo(() => {
    const g = quadGeometry(origins.length * PUFFS, 0x5307e);
    const o = new Float32Array(origins.length * PUFFS * 3);
    origins.forEach((v, i) => {
      for (let k = 0; k < PUFFS; k++) o.set(v, (i * PUFFS + k) * 3);
    });
    g.setAttribute("aOrigin", new InstancedBufferAttribute(o, 3));
    const m = new ShaderMaterial({
      vertexShader: smokeVertex,
      fragmentShader: softFragment,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: U.uTime,
        uWindDir: U.uWindDir,
        uWindStrength: U.uWindStrength,
        uColor: { value: new Vector3(0.85, 0.87, 0.9) },
        uOpacity: { value: 0.5 },
      },
    });
    return { geometry: g, material: m };
  }, [key]);
  useEffect(() => () => (geometry.dispose(), material.dispose()), [geometry, material]);
  useFrame(() => {
    const d = env.frame.look.daylight;
    material.uniforms.uColor.value.set(0.45 + 0.42 * d, 0.48 + 0.4 * d, 0.58 + 0.33 * d);
  });
  if (origins.length === 0) return null;
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />;
}

/* ---------------------------------------------------------------- footprints */

const footVertex = /* glsl */ `
attribute float aBirth;
uniform float uNow;
uniform float uTtl;
varying float vAlpha;
varying vec2 vUv;
void main() {
  vUv = uv;
  float age = uNow - aBirth;
  vAlpha = aBirth < 0.0 ? 0.0 : clamp(1.0 - age / uTtl, 0.0, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

const footFragment = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
varying vec2 vUv;
void main() {
  vec2 q = (vUv - 0.5) * vec2(2.0, 1.3);
  float a = (1.0 - smoothstep(0.6, 1.0, length(q))) * vAlpha * 0.55;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;

const STRIDE = 0.75;
const dummy = new Object3D();

/** Local footprints (spec §8.7): stamped per distance walked, pooled, fading; never sent over the network. */
export function Footprints() {
  const { footprints } = usePreset();
  const ref = useRef<InstancedMesh>(null);
  const state = useRef({ last: new Vector3(Number.NaN, 0, 0), next: 0, left: false });
  const { geometry, material } = useMemo(() => {
    const g = new PlaneGeometry(0.22, 0.34);
    g.rotateX(-Math.PI / 2);
    const birth = new Float32Array(footprints).fill(-1);
    g.setAttribute("aBirth", new InstancedBufferAttribute(birth, 1));
    const m = new ShaderMaterial({
      vertexShader: footVertex,
      fragmentShader: footFragment,
      transparent: true,
      depthWrite: false,
      uniforms: { uNow: { value: 0 }, uTtl: { value: 20 }, uColor: { value: new Vector3(0.55, 0.65, 0.78) } },
    });
    return { geometry: g, material: m };
  }, [footprints]);
  useEffect(() => () => (geometry.dispose(), material.dispose()), [geometry, material]);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const now = clock.elapsedTime;
    material.uniforms.uNow.value = now;
    // Fresh snowfall covers tracks faster.
    material.uniforms.uTtl.value = 24 - 16 * env.frame.weather.snowfall;
    const p = useVila.getState().player;
    const s = state.current;
    if (Number.isNaN(s.last.x)) s.last.set(p.x, 0, p.z);
    const dx = p.x - s.last.x, dz = p.z - s.last.z;
    const dist = Math.hypot(dx, dz);
    if (dist < STRIDE) return;
    const nx = dx / dist, nz = dz / dist;
    const side = s.left ? 0.13 : -0.13;
    dummy.position.set(p.x - nz * side, 0.03, p.z + nx * side);
    dummy.rotation.set(0, Math.atan2(nx, nz), 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(s.next, dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
    const birth = geometry.getAttribute("aBirth") as InstancedBufferAttribute;
    birth.setX(s.next, now);
    birth.needsUpdate = true;
    s.next = (s.next + 1) % footprints;
    s.left = !s.left;
    s.last.set(p.x, 0, p.z);
  });

  return <instancedMesh ref={ref} args={[geometry, material, footprints]} frustumCulled={false} renderOrder={1} />;
}
