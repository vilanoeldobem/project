/**
 * Materials of the cast (IMPL-0025): the plain voxel surface and the shadow depth, each with one vertex-shader
 * step that puts a character where the frame says it is. A character is one row of a small float texture
 * (`LIFE_TEXTURE_WIDTH` texels): position and heading; the walk angle, two gesture angles and the size; the
 * lean, whether what it holds shows, a phase for its breathing and whether it casts a shadow. A part turns
 * about its own pivot by a weighted sum of the three angles: the cheap transforms the avatar walks with, done
 * where the vertices already are. No skeleton, no weights per bone, no new dependency.
 */
import { DataTexture, FloatType, MeshDepthMaterial, MeshStandardMaterial, NearestFilter, RGBAFormat, type WebGLProgramParametersWithUniforms } from "three";

import { U } from "../environment/materials";

export const LIFE_TEXTURE_WIDTH = 4;

/** One row per character: `rows` × 4 texels × 4 floats. The caller writes `image.data` and sets `needsUpdate`. */
export function lifeTexture(rows: number): DataTexture {
  const texture = new DataTexture(new Float32Array(rows * LIFE_TEXTURE_WIDTH * 4), LIFE_TEXTURE_WIDTH, rows, RGBAFormat, FloatType);
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const PARS = /* glsl */ `
attribute vec4 aRig;
attribute vec3 aAnim;
uniform highp sampler2D uLife;
uniform float uTime;
uniform float uMotion;
void vilaLife(inout vec3 p, inout vec3 n, float shadowPass) {
  int row = int(aRig.x + 0.5);
  vec4 place = texelFetch(uLife, ivec2(0, row), 0);
  vec4 pose = texelFetch(uLife, ivec2(1, row), 0);
  vec4 more = texelFetch(uLife, ivec2(2, row), 0);
  // The part turns about its pivot (an axis across the body).
  float a = dot(aAnim, pose.xyz);
  float c = cos(a), s = sin(a);
  vec2 d = p.yz - aRig.yz;
  p.yz = aRig.yz + vec2(d.x * c - d.y * s, d.x * s + d.y * c);
  n.yz = vec2(n.y * c - n.z * s, n.y * s + n.z * c);
  // What is held shows only while the activity uses it.
  p *= mix(1.0, more.y, aRig.w);
  // Breathing, then the lean of the whole figure about its feet.
  p.y *= 1.0 + 0.012 * sin(uTime * 2.1 + more.z) * uMotion;
  c = cos(more.x); s = sin(more.x);
  p.yz = vec2(p.y * c - p.z * s, p.y * s + p.z * c);
  n.yz = vec2(n.y * c - n.z * s, n.y * s + n.z * c);
  // Size (0 while off stage), heading, place. In the shadow pass tiny animals are left out.
  p *= pose.w * mix(1.0, more.w, shadowPass);
  c = cos(place.w); s = sin(place.w);
  p.xz = vec2(p.x * c + p.z * s, -p.x * s + p.z * c);
  n.xz = vec2(n.x * c + n.z * s, -n.x * s + n.z * c);
  p += place.xyz;
}
`;

function patch(shader: WebGLProgramParametersWithUniforms, texture: DataTexture, shadowPass: boolean) {
  Object.assign(shader.uniforms, { uLife: { value: texture }, uTime: U.uTime, uMotion: U.uMotion });
  shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${PARS}`);
  if (shadowPass) {
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "vec3 transformed = vec3(position);\nvec3 vilaNormal = vec3(0.0, 1.0, 0.0);\nvilaLife(transformed, vilaNormal, 1.0);");
  } else {
    shader.vertexShader = shader.vertexShader
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvec3 vilaPosition = vec3(position);\nvilaLife(vilaPosition, objectNormal, 0.0);")
      .replace("#include <begin_vertex>", "vec3 transformed = vilaPosition;");
  }
}

/** The surface and the shadow-depth materials of the cast, reading the same texture. The caller disposes them. */
export function lifeMaterials(texture: DataTexture): { surface: MeshStandardMaterial; depth: MeshDepthMaterial } {
  const surface = new MeshStandardMaterial({ roughness: 0.85, vertexColors: true });
  surface.onBeforeCompile = (shader) => patch(shader, texture, false);
  surface.customProgramCacheKey = () => "vila-life";
  const depth = new MeshDepthMaterial();
  depth.onBeforeCompile = (shader) => patch(shader, texture, true);
  depth.customProgramCacheKey = () => "vila-life-depth";
  return { surface, depth };
}
