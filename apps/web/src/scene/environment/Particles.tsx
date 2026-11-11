import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  type InstancedMesh,
  NormalBlending,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from "three";

import { env } from "../../environment/runtime";
import { mulberry32 } from "../../environment/random";
import { useEnvSettings, usePreset } from "../../environment/settings";
import { events, type GameEvent } from "../../game/events";
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

const dummy = new Object3D();

/**
 * Local footprints (spec §8.7): one print per simulated footstep (left/right offset), pooled and fading;
 * never sent over the network. Hard ground (plaza stone, ice) keeps no prints.
 */
export function Footprints() {
  const { footprints } = usePreset();
  const ref = useRef<InstancedMesh>(null);
  const queue = useRef<Array<{ x: number; z: number; yaw: number; left: boolean }>>([]);
  const next = useRef(0);
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
  useEffect(
    () =>
      events.on((e) => {
        if (e.type === "step" && (e.surface === "snow" || e.surface === "packed")) queue.current.push(e);
      }),
    []
  );

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const now = clock.elapsedTime;
    material.uniforms.uNow.value = now;
    // Fresh snowfall covers tracks faster.
    material.uniforms.uTtl.value = 24 - 16 * env.frame.weather.snowfall;
    const q = queue.current;
    if (q.length === 0) return;
    const birth = geometry.getAttribute("aBirth") as InstancedBufferAttribute;
    for (const step of q) {
      const side = step.left ? 0.13 : -0.13;
      const nx = Math.sin(step.yaw), nz = Math.cos(step.yaw);
      dummy.position.set(step.x - nz * side, 0.03, step.z + nx * side);
      dummy.rotation.set(0, step.yaw, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(next.current, dummy.matrix);
      birth.setX(next.current, now);
      next.current = (next.current + 1) % footprints;
    }
    q.length = 0;
    mesh.instanceMatrix.needsUpdate = true;
    birth.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[geometry, material, footprints]} frustumCulled={false} renderOrder={1} />;
}

/* -------------------------------------------------------------------- bursts */

const burstVertex = /* glsl */ `
attribute vec4 aSeed;
attribute vec4 aSpawn; // xyz origin, w birth time (s); w < 0 = unused slot
uniform float uNow;
uniform float uLife;
uniform float uSpeed;
uniform float uUp;
uniform float uGravity;
uniform float uSize;
varying float vAlpha;
varying vec2 vUv;
void main() {
  vUv = uv;
  float age = uNow - aSpawn.w;
  float t = age / (uLife * (0.7 + 0.6 * aSeed.w));
  if (aSpawn.w < 0.0 || t >= 1.0 || t < 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; return; }
  float a = aSeed.x * 6.2831;
  vec3 v = vec3(cos(a), 0.0, sin(a)) * uSpeed * (0.4 + 0.6 * aSeed.y) + vec3(0.0, uUp * (0.5 + aSeed.z), 0.0);
  vec3 p = aSpawn.xyz + v * age - vec3(0.0, 0.5 * uGravity * age * age, 0.0);
  p.y = max(p.y, 0.05);
  vAlpha = smoothstep(0.0, 0.08, t) * (1.0 - t);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * uSize * (0.6 + 0.8 * aSeed.w) * (1.0 - 0.5 * t);
  gl_Position = projectionMatrix * mv;
}
`;

export interface BurstStyle {
  /** Particles per burst and bursts kept alive at once (pool = per × slots). */
  per: number;
  slots: number;
  life: number;
  speed: number;
  up: number;
  gravity: number;
  size: number;
  color: [number, number, number];
  opacity: number;
  additive: boolean;
}

/** Snow kicked up by a footstep in soft snow. */
const KICK: BurstStyle = { per: 6, slots: 10, life: 0.55, speed: 0.9, up: 1.6, gravity: 6, size: 0.12, color: [0.93, 0.96, 1], opacity: 0.85, additive: false };
/** Gold sparkle burst when a gift is found. */
const GIFT: BurstStyle = { per: 40, slots: 2, life: 1.3, speed: 2.6, up: 4.5, gravity: 4, size: 0.2, color: [1, 0.82, 0.42], opacity: 1, additive: true };

/**
 * Pooled GPU particle bursts: each burst writes one spawn record into a ring of slots; motion is
 * computed in the vertex shader from the age (no per-particle CPU work, one draw call per style).
 */
function Bursts({ style, accept }: { style: BurstStyle; accept: (e: GameEvent) => [number, number, number] | null }) {
  const particles = useEnvSettings((s) => s.particles);
  const { geometry, material } = useMemo(() => {
    const count = style.per * style.slots;
    const g = quadGeometry(count, 0xb0057 + style.per);
    g.setAttribute("aSpawn", new InstancedBufferAttribute(new Float32Array(count * 4).fill(-1), 4));
    const m = new ShaderMaterial({
      vertexShader: burstVertex,
      fragmentShader: glowFragment,
      transparent: true,
      depthWrite: false,
      blending: style.additive ? AdditiveBlending : NormalBlending,
      uniforms: {
        uNow: { value: 0 },
        uLife: { value: style.life },
        uSpeed: { value: style.speed },
        uUp: { value: style.up },
        uGravity: { value: style.gravity },
        uSize: { value: style.size },
        uColor: { value: new Vector3(...style.color) },
        uOpacity: { value: style.opacity },
      },
    });
    return { geometry: g, material: m };
  }, [style]);
  useEffect(() => () => (geometry.dispose(), material.dispose()), [geometry, material]);
  const slot = useRef(0);
  const pending = useRef<Array<[number, number, number]>>([]);
  useEffect(
    () =>
      events.on((e) => {
        const at = accept(e);
        if (at) pending.current.push(at);
      }),
    [accept]
  );
  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    material.uniforms.uNow.value = now;
    // Snow puffs take the ambient light (no glowing white at night); sparkles are their own light.
    if (!style.additive) material.uniforms.uColor.value.set(...style.color).multiplyScalar(0.5 + 0.5 * env.frame.look.daylight);
    const q = pending.current;
    if (q.length === 0) return;
    if (particles) {
      const spawn = geometry.getAttribute("aSpawn") as InstancedBufferAttribute;
      for (const [x, y, z] of q) {
        for (let i = 0; i < style.per; i++) spawn.setXYZW(slot.current * style.per + i, x, y, z, now);
        slot.current = (slot.current + 1) % style.slots;
      }
      spawn.needsUpdate = true;
    }
    q.length = 0;
  });
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />;
}

const kickAt = (e: GameEvent): [number, number, number] | null =>
  e.type === "step" && e.surface === "snow" && e.speed > 3 ? [e.x, 0.1, e.z] : null;
const giftAt = (e: GameEvent): [number, number, number] | null => (e.type === "gift" ? [e.x, 0.6, e.z] : null);

/** Gameplay-driven particle effects (snow kick-up, gift sparkle). */
export function GameplayBursts() {
  return (
    <>
      <Bursts style={KICK} accept={kickAt} />
      <Bursts style={GIFT} accept={giftAt} />
    </>
  );
}
