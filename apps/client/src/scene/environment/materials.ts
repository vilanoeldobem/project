/**
 * Shared materials and uniforms for the environment (spec §6). One material per role keeps draw state
 * changes low; weather/time changes only update uniforms — never recompile shaders (spec §17.3 #14).
 */
import { Color, MeshStandardMaterial, SRGBColorSpace, Vector2 } from "three";

import type { Rgb } from "@vila/shared/environment/keyframes";

/** Uniforms shared by every environment shader; written once per frame by EnvironmentDriver. */
export const U = {
  /** Shared São Paulo-anchored seconds (synchronised patterns: light twinkle). */
  uWorldTime: { value: 0 },
  /** Local seconds (cosmetic motion that need not match across clients). */
  uTime: { value: 0 },
  uWindDir: { value: new Vector2(1, 0) },
  uWindStrength: { value: 0 },
  /** 0 = steady lights (reduce flicker), 1 = gentle twinkle. */
  uTwinkle: { value: 1 },
  /** 0 = no sway (reduce motion). */
  uMotion: { value: 1 },
};

const HASH = /* glsl */ `
float vilaHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
`;

/**
 * World-space centre of the current voxel. Every vertex of a voxel carries the same `aCenter` (mesher),
 * so effects keyed on it move or phase a whole voxel rigidly — never a rubbery stretch.
 */
const VOXEL_CENTER = /* glsl */ `
#ifdef USE_INSTANCING
  vec3 vilaCenter = (modelMatrix * instanceMatrix * vec4(aCenter, 1.0)).xyz;
#else
  vec3 vilaCenter = (modelMatrix * vec4(aCenter, 1.0)).xyz;
#endif
`;

const tmp = new Color();

/** Keyframe colours are sRGB art targets; three.js works in Linear-sRGB (spec §11.3). */
export function linear(rgb: Rgb): [number, number, number] {
  tmp.setRGB(rgb[0], rgb[1], rgb[2], SRGBColorSpace);
  return [tmp.r, tmp.g, tmp.b];
}

/** Plain voxel surface (soft, matte). */
export const solidMaterial = new MeshStandardMaterial({ roughness: 0.85, vertexColors: true });

/**
 * Christmas bulbs, stars, lanterns: emissive tinted by the instance colour, with a slow deterministic
 * twinkle (≈0.25 Hz, never a flash) phased by world position → identical pattern on every client.
 */
export const lightsMaterial = new MeshStandardMaterial({
  roughness: 0.4,
  emissive: "#ffffff",
  emissiveIntensity: 1.2,
  toneMapped: false,
  vertexColors: true,
});
lightsMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.uWorldTime = U.uWorldTime;
  shader.uniforms.uTwinkle = U.uTwinkle;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\nattribute vec3 aCenter;\nuniform float uWorldTime;\nuniform float uTwinkle;\nvarying float vTwinkle;\n${HASH}`)
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\n${VOXEL_CENTER}
      float vilaPhase = vilaHash(floor(vilaCenter * 4.0)) * 6.2831;
      float vilaWave = 0.5 + 0.5 * sin(uWorldTime * 1.6 + vilaPhase);
      vTwinkle = 1.0 - uTwinkle * 0.55 * vilaWave;`
    );
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nvarying float vTwinkle;")
    .replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      #ifdef USE_COLOR
        totalEmissiveRadiance *= vColor.rgb;
      #endif
      totalEmissiveRadiance *= vTwinkle;`
    );
};
lightsMaterial.customProgramCacheKey = () => "vila-lights";

/** Lit windows: warm steady glow (no twinkle), intensity follows the time of day. */
export const windowMaterial = new MeshStandardMaterial({
  roughness: 0.6,
  emissive: "#FFC785",
  emissiveIntensity: 0,
  toneMapped: false,
  vertexColors: true,
});

/**
 * Pine foliage: wind sway that grows with height and travels downwind as a gust wave across the forest
 * (phase from each voxel's world position along the wind). Voxels stay rigid blocks.
 */
export const foliageMaterial = new MeshStandardMaterial({ roughness: 0.9, vertexColors: true });
foliageMaterial.onBeforeCompile = (shader) => {
  Object.assign(shader.uniforms, { uTime: U.uTime, uWindDir: U.uWindDir, uWindStrength: U.uWindStrength, uMotion: U.uMotion });
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nattribute vec3 aCenter;\nuniform float uTime;\nuniform vec2 uWindDir;\nuniform float uWindStrength;\nuniform float uMotion;"
    )
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      ${VOXEL_CENTER}
      float vilaGust = sin(uTime * 1.3 - dot(vilaCenter.xz, uWindDir) * 0.14);
      float vilaK = max(aCenter.y - 1.5, 0.0) * (0.01 + uWindStrength * 0.035) * uMotion;
      #ifdef USE_INSTANCING
        mat3 vilaToLocal = transpose(mat3(modelMatrix) * mat3(instanceMatrix));
      #else
        mat3 vilaToLocal = transpose(mat3(modelMatrix));
      #endif
      vec3 vilaWind = vilaToLocal * vec3(uWindDir.x, 0.0, uWindDir.y);
      transformed.xz += vilaWind.xz * vilaK * (0.65 + 0.35 * vilaGust);`
    );
};
foliageMaterial.customProgramCacheKey = () => "vila-foliage";

/**
 * Living things (villagers, animals; IMPL-0010): gentle breathing and a slow look-around in the vertex
 * shader. Offsets grow with each voxel's height (`aCenter.y`) and are phased per object (from its
 * position), so a crowd never moves in lockstep; voxels move rigidly. Respects "menos movimento".
 */
export const idleMaterial = new MeshStandardMaterial({ roughness: 0.85, vertexColors: true });
idleMaterial.onBeforeCompile = (shader) => {
  Object.assign(shader.uniforms, { uTime: U.uTime, uMotion: U.uMotion });
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\nattribute vec3 aCenter;\nuniform float uTime;\nuniform float uMotion;\n${HASH}`)
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 vilaRoot = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #else
        vec3 vilaRoot = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #endif
      float vilaPhase = vilaHash(floor(vilaRoot * 2.0)) * 6.2831;
      float vilaH = max(aCenter.y, 0.0);
      transformed.y += vilaH * 0.02 * sin(uTime * 2.1 + vilaPhase) * uMotion;
      transformed.z += vilaH * vilaH * 0.012 * sin(uTime * 0.6 + vilaPhase * 1.7) * uMotion;`
    );
};
idleMaterial.customProgramCacheKey = () => "vila-idle";

/**
 * Block look (IMPL-0033, IMPL-0035): a thin, darker line around every block and a small shade of its own for each
 * block, drawn per pixel from `aGrid` (position in voxel units and face axis; mesher.ts). Greedy meshing merges a
 * wall into one rectangle; this keeps it reading as blocks, at no triangle or draw call. The line keeps about one
 * pixel up close and both effects fade where a block is only a few pixels wide, so far blocks never shimmer. Fine models
 * (`EDGE_MIN_SIZE` in mesher.ts) keep only the shade. A geometry without `aGrid` (read as 0) draws neither.
 */
export const BLOCK_LOOK = { width: 0.06, edge: 0.2, jitter: 0.045 } as const;

const LOOK_VERTEX = "attribute vec4 aGrid;\nvarying vec4 vGrid;";
const LOOK_FRAGMENT = /* glsl */ `
#include <color_fragment>
if (vGrid.w > 0.5) {
  float vilaCode = floor(vGrid.w + 0.5);
  float vilaEdges = vilaCode > 3.5 ? 0.0 : 1.0;
  float vilaAxis = vilaCode > 3.5 ? vilaCode - 4.0 : vilaCode;
  vec2 vilaP = vilaAxis < 1.5 ? vGrid.yz : (vilaAxis < 2.5 ? vGrid.zx : vGrid.xy);
  float vilaPlane = floor((vilaAxis < 1.5 ? vGrid.x : (vilaAxis < 2.5 ? vGrid.y : vGrid.z)) + 0.5);
  vec2 vilaCell = floor(vilaP);
  vec2 vilaF = vilaP - vilaCell;
  vec2 vilaPx = fwidth(vilaP);
  vec2 vilaW = max(vec2(${BLOCK_LOOK.width.toFixed(3)}), vilaPx);
  vec2 vilaEdge = min(vilaF, 1.0 - vilaF);
  vec2 vilaLine = 1.0 - smoothstep(vilaW, vilaW * 1.8, vilaEdge);
  float vilaFar = 1.0 - smoothstep(0.08, 0.25, max(vilaPx.x, vilaPx.y));
  float vilaHash = fract(sin(dot(vec3(vilaCell, vilaPlane), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  diffuseColor.rgb *= (1.0 + (vilaHash - 0.5) * ${(2 * BLOCK_LOOK.jitter).toFixed(3)} * vilaFar)
    * (1.0 - ${BLOCK_LOOK.edge.toFixed(3)} * vilaEdges * max(vilaLine.x, vilaLine.y) * vilaFar);
}`;

/** Adds the block look to a material, after whatever its own `onBeforeCompile` does. */
function withBlockLook(material: MeshStandardMaterial, key: string): void {
  const own = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    own(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${LOOK_VERTEX}`)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGrid = aGrid;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec4 vGrid;")
      .replace("#include <color_fragment>", LOOK_FRAGMENT);
  };
  material.customProgramCacheKey = () => `${key}-blocks`;
}

withBlockLook(solidMaterial, "vila-solid");
withBlockLook(windowMaterial, "vila-window");
withBlockLook(foliageMaterial, "vila-foliage");
withBlockLook(idleMaterial, "vila-idle");
