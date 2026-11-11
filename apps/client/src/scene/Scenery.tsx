import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { type Group, ShaderMaterial, UniformsLib, UniformsUtils, Vector3 } from "three";

import { mulberry32 } from "@vila/shared/environment/random";
import { env } from "../environment/runtime";
import {
  CRITTERS,
  FOREST_INNER,
  FOREST_OUTER,
  LAMPS,
  PALETTE as P,
  PINES,
  POND,
  SLEIGH,
  SNOWMEN,
} from "@vila/shared/game/world";
import { linear, U } from "./environment/materials";
import { bird, cat, dog, NIGHT_ONLY, owl, rabbit } from "./gen/animals";
import { villager } from "./gen/characters";
import { BULBS, pine, reindeer, sleigh, snowman, SWAY, type Voxel } from "./models";
import { type Placement, Voxels } from "./Voxels";

/** Rotates a voxel model by quarter turns and moves it (merging many props into one instanced draw). */
function place(model: Voxel[], dx: number, dz: number, quarter: number, scale = 1): Voxel[] {
  return model.map(([x, y, z, c]) => {
    let rx = x, rz = z;
    for (let q = 0; q < (quarter & 3); q++) [rx, rz] = [-rz, rx];
    return [rx + dx / scale, y, rz + dz / scale, c];
  });
}

/** Every pine (walkable ring + decorative forest) merged: 3 draw calls for the whole forest. */
export function Pines() {
  const voxels = useMemo(() => {
    const small = pine(false), tall = pine(true);
    const out: Voxel[] = [];
    // The three pines by the plaza stay small so they never hide the avatar from the camera.
    PINES.forEach(([x, z], i) => out.push(...place(i < 3 || i % 3 === 0 ? small : tall, Math.round(x), Math.round(z), i)));
    const rnd = mulberry32(0xf0e57);
    for (let i = 0; i < 90; i++) {
      const a = rnd() * Math.PI * 2;
      const r = FOREST_INNER + rnd() * (FOREST_OUTER - FOREST_INNER);
      out.push(...place(rnd() < 0.6 ? tall : small, Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r), i));
    }
    return out;
  }, []);
  return <Voxels voxels={voxels} sway={SWAY} />;
}

/** Distant voxel mountains in two rings (spec §10.2): silhouettes hazed by fog, no shadows. */
export function Mountains() {
  const voxels = useMemo(() => {
    const out: Voxel[] = [];
    const rnd = mulberry32(0x3a7);
    for (const [ring, base, amp] of [[28, 2, 4], [35, 3, 6]] as const) {
      const steps = Math.round(2 * Math.PI * ring);
      const phase = rnd() * 10;
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        const n = Math.sin(a * 5 + phase) * 0.5 + Math.sin(a * 11 + phase * 2) * 0.3 + Math.sin(a * 23) * 0.2;
        const h = Math.max(1, Math.round(base + amp * (0.5 + 0.5 * n)));
        const x = Math.round(Math.cos(a) * ring), z = Math.round(Math.sin(a) * ring);
        for (let y = 0; y < h; y++) {
          const c = y >= h - 2 ? P.snow : y >= h - 3 ? "#C7D6E4" : ring === 28 ? "#8EA3BE" : "#A8BAD2";
          out.push([x, y, z, c]);
        }
      }
    }
    return out;
  }, []);
  return (
    <group position-y={-6}>
      <Voxels voxels={voxels} size={6} castShadow={false} />
    </group>
  );
}

const iceVertex = /* glsl */ `
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const iceFragment = /* glsl */ `
uniform vec3 uIce;
uniform vec3 uSky;
uniform float uWorldTime;
varying vec3 vWorld;
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(v.y, 0.0), 3.0);
  // Stylised cracks: cell borders of a coarse grid, quantised (voxel-friendly, no shimmer).
  vec2 g = vWorld.xz * 1.2;
  vec2 f = fract(g);
  float crack = step(0.94, max(f.x, f.y)) * step(0.55, h(floor(g)));
  float glint = step(0.985, h(floor(vWorld.xz * 3.0))) * (0.5 + 0.5 * sin(uWorldTime * 1.5 + h(floor(vWorld.xz * 3.0)) * 30.0));
  vec3 c = mix(uIce, uSky, 0.35 + 0.5 * fres);
  c = mix(c, vec3(0.92, 0.97, 1.0), crack * 0.6 + glint * 0.5);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** Frozen pond (spec §6.2 IceLake): Fresnel sky tint, cracks and rare glints. Walkable, no gameplay effect. */
export function Pond() {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: iceVertex.replace("void main() {", "#include <fog_pars_vertex>\nvoid main() {").replace(
          "gl_Position = projectionMatrix * viewMatrix * w;",
          "vec4 mvPosition = viewMatrix * w;\n  gl_Position = projectionMatrix * mvPosition;\n  #include <fog_vertex>"
        ),
        fragmentShader: "#include <fog_pars_fragment>\n" + iceFragment,
        fog: true,
        uniforms: {
          uIce: { value: new Vector3(...linear([0.55, 0.78, 0.88])) },
          uSky: { value: new Vector3() },
          uWorldTime: U.uWorldTime,
          ...UniformsUtils.clone(UniformsLib.fog),
        },
      }),
    []
  );
  useFrame(() => {
    mat.uniforms.uSky.value.set(...linear(env.frame.look.skyHorizon));
  });
  const rim = useMemo(() => {
    const v: Voxel[] = [];
    const steps = 28;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      v.push([Math.cos(a) * (POND.radius + 0.4) * 2, 0, Math.sin(a) * (POND.radius + 0.4) * 2, k % 3 ? P.snow : P.snowShade]);
    }
    return v;
  }, []);
  return (
    <group position={[POND.x, 0, POND.z]}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.04} material={mat} receiveShadow>
        <circleGeometry args={[POND.radius, 32]} />
      </mesh>
      <Voxels voxels={rim} size={0.5} />
    </group>
  );
}

export function Snowmen() {
  const v = useMemo(snowman, []);
  const at = useMemo(() => SNOWMEN.map(([x, z, rot]): Placement => ({ x, z, rot })), []);
  return <Voxels voxels={v} size={0.4} placements={at} />;
}

/** Santa's parked sleigh and two reindeer breathing gently (spec §9.2). Decor only. */
export function Sleigh() {
  const s = useMemo(sleigh, []);
  const r = useMemo(reindeer, []);
  const deer = useRef<Group[]>([]);
  useFrame(({ clock }) => {
    const motion = U.uMotion.value;
    deer.current.forEach((g, i) => {
      if (!g) return;
      const breathe = Math.sin(clock.elapsedTime * 1.6 + i * 1.7) * 0.025 * motion;
      g.scale.set(1, 1 + breathe, 1 + breathe);
    });
  });
  return (
    <group position={[SLEIGH.x, 0, SLEIGH.z]}>
      <Voxels voxels={s} size={0.5} emissive={[P.gold]} />
      {[0, 1].map((i) => (
        <group key={i} position={[4.8 + i * 3, 0, i ? 0.9 : -0.9]} ref={(g) => void (g && (deer.current[i] = g))}>
          <Voxels voxels={r} size={0.35} />
        </group>
      ))}
    </group>
  );
}

const BULB = 0.2;
const PER_STRING = 13;
const LANTERN_Y = 3.15;

/** Bulb strings hanging between plaza lamps: emissive instances, no real lights (spec §16.5). */
export function LightStrings() {
  const voxels = useMemo(() => {
    const v: Voxel[] = [];
    LAMPS.forEach(([x0, z0], i) => {
      const [x1, z1] = LAMPS[(i + 1) % LAMPS.length];
      for (let k = 1; k < PER_STRING; k++) {
        const t = k / PER_STRING;
        const sag = Math.sin(Math.PI * t) * 0.9;
        const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, y = LANTERN_Y - sag;
        v.push([x / BULB, y / BULB, z / BULB, BULBS[(i + k) % BULBS.length]]);
      }
    });
    return v;
  }, []);
  return <Voxels voxels={voxels} size={BULB} emissive={BULBS} />;
}

/** Snowfield beyond the voxel ground, so the village never ends at a hard edge. */
export function Snowfield() {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow>
      <circleGeometry args={[240, 48]} />
      <meshStandardMaterial color={P.snowShade} roughness={1} />
    </mesh>
  );
}

const CRITTER_GEN = { villager, dog, cat, bird, rabbit, owl } as const;

/**
 * Generated villagers and animals (IMPL-0010, PROPOSTA decor): each a seeded variant, breathing through
 * the idle material. Night-only animals (owls) appear once the village lights are on.
 */
export function Critters() {
  const items = useMemo(() => CRITTERS.map((c) => ({ c, m: CRITTER_GEN[c.kind](c.seed) })), []);
  const night = useRef<Group[]>([]);
  useFrame(() => {
    const dark = env.frame.look.artificial > 0.5;
    for (const g of night.current) if (g) g.visible = dark;
  });
  return (
    <>
      {items.map(({ c, m }, i) => (
        <group
          key={c.seed}
          position={[c.x, c.y ?? 0, c.z]}
          rotation-y={c.rot}
          ref={NIGHT_ONLY.has(c.kind) ? (g) => void (g && (night.current[i] = g)) : undefined}
        >
          {/* Tiny animals skip the shadow pass: their shadow is sub-pixel at gameplay distance. */}
          <Voxels voxels={m.voxels} size={m.size} emissive={m.emissive} idle={m.idle} castShadow={m.size >= 0.2} />
        </group>
      ))}
    </>
  );
}
