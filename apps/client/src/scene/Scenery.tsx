import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { type Group, ShaderMaterial, UniformsLib, UniformsUtils, Vector3 } from "three";

import { mulberry32 } from "@vila/shared/environment/random";
import { env } from "../environment/runtime";
import {
  PLACED_PROPS,
  FOREST_INNER,
  FOREST_OUTER,
  LAMPS,
  PALETTE as P,
  pineAt,
  pineIsTall,
  PINES,
  POND,
  REINDEER,
  SLEIGH,
  SNOWMEN,
} from "@vila/shared/game/world";
import { linear, U } from "./environment/materials";
import { fence, lantern, logPile, mailbox, marketStall, panettoneStand, signpost, sled } from "./gen/props";
import { BULBS, pine, reindeer, sleigh, snowman, SWAY, type Voxel } from "./models";
import { type CasterPart, modelExtent, partAt } from "./shadowCasters";
import { MergedVoxels, mergeVoxelModels, type Placement, splitParts, voxelGeometries, Voxels } from "./Voxels";

/** Rotates a voxel model by quarter turns and moves it (merging many props into one instanced draw). */
function place(model: Voxel[], dx: number, dz: number, quarter: number, scale = 1): Voxel[] {
  return model.map(([x, y, z, c]) => {
    let rx = x, rz = z;
    for (let q = 0; q < (quarter & 3); q++) [rx, rz] = [-rz, rx];
    return [rx + dx / scale, y, rz + dz / scale, c];
  });
}

/** Sectors the pines are meshed in: the pines of a sector hide each other's faces where they touch. */
const PINE_SECTORS = 8;
/**
 * Pieces a sector is drawn in, each one mesh per role with its own bounding sphere: the small pines by the
 * plaza, the tall pines of the belt behind the last ring, and the decorative forest of the sector in two
 * halves of the horizon.
 */
const PINE_PARTS = 4;

/**
 * Every pine (the village's own and the decorative forest). One mesh for the whole forest was drawn in full
 * every frame, shadow pass included, wherever the camera looked; with the larger village (IMPL-0024) that was
 * the single largest cost of the scene. It was then cut into eight sectors of the horizon, but a sector held
 * the pines by the plaza and the forest 100 u away together: its bounding sphere reached the middle of the
 * village, so six of the eight were drawn from the plaza with no pine of the forest on the screen (35 000
 * triangles of a 250 000 budget, issue #41). Each sector is still meshed as one model, so the picture is the
 * same triangle for triangle, but drawn in `PINE_PARTS` pieces the renderer culls one by one. A piece joins
 * the shadow pass only while the shadow of one of its pines is seen (`casters`).
 */
export function Pines() {
  const pieces = useMemo(() => {
    const small = pine(false), tall = pine(true);
    const extent = new Map([small, tall].map((model) => [model, modelExtent(model, 1)]));
    const sectors = Array.from({ length: PINE_SECTORS }, () => ({ voxels: [] as Voxel[], part: new Map<Voxel, number>(), casters: Array.from({ length: PINE_PARTS }, (): CasterPart[] => []) }));
    const add = (model: Voxel[], x: number, z: number, quarter: number, forest: boolean) => {
      const turn = (Math.atan2(z, x) * PINE_SECTORS) / (2 * Math.PI);
      const sector = sectors[((Math.round(turn) % PINE_SECTORS) + PINE_SECTORS) % PINE_SECTORS];
      const part = forest ? (turn >= Math.round(turn) ? 3 : 2) : model === tall ? 1 : 0;
      for (const voxel of place(model, x, z, quarter)) {
        sector.voxels.push(voxel);
        sector.part.set(voxel, part);
      }
      const { reach, height } = extent.get(model)!;
      // Half a unit more than the model: the foliage sways up to about 0.45 u at the top of a tall pine (`foliageMaterial`).
      sector.casters[part].push(partAt(x, z, reach + 0.5, height));
    };
    // Size and position come from `world.ts`, which sizes each pine's collider from the same two facts.
    PINES.forEach((p, i) => add(pineIsTall(i) ? tall : small, pineAt(p).x, pineAt(p).z, i, false));
    const rnd = mulberry32(0xf0e57);
    // The forest ring is longer now (IMPL-0024) and farther away: a third more trees keep it reading as a forest.
    for (let i = 0; i < 120; i++) {
      const a = rnd() * Math.PI * 2;
      const r = FOREST_INNER + rnd() * (FOREST_OUTER - FOREST_INNER);
      add(rnd() < 0.6 ? tall : small, Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r), i, true);
    }
    return sectors.flatMap((sector) => {
      const geometries = voxelGeometries(sector.voxels, 1, { sway: SWAY, partOf: (v) => sector.part.get(v) ?? 0, parts: PINE_PARTS });
      // The foliage sways up to about 0.45 u beyond where it is meshed: the sphere a piece is culled by allows for it.
      for (const g of geometries) if (g?.boundingSphere) g.boundingSphere.radius += 0.5;
      return splitParts(geometries, PINE_PARTS)
        .map((roles, part) => ({ roles, casters: sector.casters[part] }))
        .filter((piece) => piece.roles.some(Boolean));
    });
  }, []);
  return (
    <>
      {pieces.map((piece, i) => (
        <MergedVoxels key={i} geometries={piece.roles} casters={piece.casters} />
      ))}
    </>
  );
}

/** Pieces the mountains are drawn in: sectors of the horizon, each culled on its own. */
const MOUNTAIN_SECTORS = 8;

/**
 * Low-poly mountain silhouettes on the horizon (large voxels, far away, no collision). Meshed as one model
 * and drawn in sectors: one mesh was 12 000 triangles in every frame, although the camera, which looks down on
 * the village, seldom has more than a stretch of the horizon in its picture (issue #41).
 */
export function Mountains() {
  const sectors = useMemo(() => {
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
    const sectorOf = ([x, , z]: Voxel) => Math.min(MOUNTAIN_SECTORS - 1, Math.floor(((Math.atan2(z, x) + Math.PI) / (2 * Math.PI)) * MOUNTAIN_SECTORS));
    return splitParts(voxelGeometries(out, 6, { partOf: sectorOf, parts: MOUNTAIN_SECTORS }), MOUNTAIN_SECTORS);
  }, []);
  return (
    <group position-y={-6}>
      {sectors.map((roles, i) => (
        <MergedVoxels key={i} geometries={roles} castShadow={false} />
      ))}
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
    <>
      <group position={[SLEIGH.x, 0, SLEIGH.z]}>
        <Voxels voxels={s} size={0.5} emissive={[P.gold]} />
      </group>
      {REINDEER.map((d, i) => (
        <group key={i} position={[d.x, 0, d.z]} ref={(g) => void (g && (deer.current[i] = g))}>
          <Voxels voxels={r} size={0.35} />
        </group>
      ))}
    </>
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

const PROP_GEN = {
  "market-stall": marketStall,
  "panettone-stand": panettoneStand,
  lantern,
  fence,
  mailbox,
  signpost,
  sled,
  "log-pile": logPile,
} as const;

/**
 * Generated props placed as decor (IMPL-0010, PROPOSTA). All static, so they are baked into one geometry per
 * material role (one draw call per role for the whole set).
 */
export function PlacedProps() {
  const geometries = useMemo(
    () =>
      mergeVoxelModels(
        PLACED_PROPS.map((p) => {
          const m = PROP_GEN[p.kind](p.seed);
          return { ...m, placements: p.at.map((a): Placement => ({ x: a.x, z: a.z, rot: a.rot ?? 0 })) };
        })
      ),
    []
  );
  return <MergedVoxels geometries={geometries} />;
}
