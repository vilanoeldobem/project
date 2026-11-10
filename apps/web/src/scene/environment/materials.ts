/**
 * Shared materials and uniforms for the environment (spec §6). One material per role keeps draw state
 * changes low; weather/time changes only update uniforms — never recompile shaders (spec §17.3 #14).
 */
import { Color, MeshStandardMaterial, SRGBColorSpace, Vector2 } from "three";

import type { Rgb } from "../../environment/keyframes";

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

const INSTANCE_ORIGIN = /* glsl */ `
#ifdef USE_INSTANCING
  vec3 vilaOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
#else
  vec3 vilaOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
#endif
`;

const tmp = new Color();

/** Keyframe colours are sRGB art targets; three.js works in Linear-sRGB (spec §11.3). */
export function linear(rgb: Rgb): [number, number, number] {
  tmp.setRGB(rgb[0], rgb[1], rgb[2], SRGBColorSpace);
  return [tmp.r, tmp.g, tmp.b];
}

/** Plain voxel surface (soft, matte). */
export const solidMaterial = new MeshStandardMaterial({ roughness: 0.85 });

/**
 * Christmas bulbs, stars, lanterns: emissive tinted by the instance colour, with a slow deterministic
 * twinkle (≈0.25 Hz, never a flash) phased by world position → identical pattern on every client.
 */
export const lightsMaterial = new MeshStandardMaterial({ roughness: 0.4, emissive: "#ffffff", emissiveIntensity: 1.2, toneMapped: false });
lightsMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.uWorldTime = U.uWorldTime;
  shader.uniforms.uTwinkle = U.uTwinkle;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\nuniform float uWorldTime;\nuniform float uTwinkle;\nvarying float vTwinkle;\n${HASH}`)
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\n${INSTANCE_ORIGIN}
      float vilaPhase = vilaHash(floor(vilaOrigin * 4.0)) * 6.2831;
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
export const windowMaterial = new MeshStandardMaterial({ roughness: 0.6, emissive: "#FFC785", emissiveIntensity: 0, toneMapped: false });

/** Pine foliage: gentle wind sway that grows with height (voxels stay rigid blocks, no rubber bending). */
export const foliageMaterial = new MeshStandardMaterial({ roughness: 0.9 });
foliageMaterial.onBeforeCompile = (shader) => {
  Object.assign(shader.uniforms, { uTime: U.uTime, uWindDir: U.uWindDir, uWindStrength: U.uWindStrength, uMotion: U.uMotion });
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform vec2 uWindDir;\nuniform float uWindStrength;\nuniform float uMotion;")
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float vilaH = instanceMatrix[3].y;
      #else
        float vilaH = position.y;
      #endif
      vec3 vilaRoot = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      float vilaSway = sin(uTime * 1.3 + vilaRoot.x * 0.37 + vilaRoot.z * 0.21);
      float vilaK = max(vilaH - 1.5, 0.0) * (0.01 + uWindStrength * 0.035) * uMotion;
      vec3 vilaWind = transpose(mat3(modelMatrix)) * vec3(uWindDir.x, 0.0, uWindDir.y);
      transformed.xz += vilaWind.xz * vilaK * (0.65 + 0.35 * vilaSway);`
    );
};
foliageMaterial.customProgramCacheKey = () => "vila-foliage";
