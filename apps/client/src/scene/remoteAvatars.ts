/**
 * Other visitors drawn as one mesh (IMPL-0008, audit 2026-11-14): every remote in the room is a slot of one merged
 * geometry, and every rigid part of every slot (body and four limbs) reads its matrix from one row of a small
 * float texture. The cost is one draw call in the scene pass and one in the shadow pass, however many distinct
 * looks are present; the geometry is rebuilt only when the roster or a look changes, never per frame.
 */
import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  FloatType,
  type Matrix4,
  MeshDepthMaterial,
  MeshStandardMaterial,
  NearestFilter,
  RGBAFormat,
  type WebGLProgramParametersWithUniforms,
} from "three";

/** Body and four limbs: the same rig as `Player`. */
export const REMOTE_PARTS = 5;
/** Texels per matrix row: one column of the 4×4 matrix each. */
const TEXELS = 4;

/** One row per part of every slot: `slots × REMOTE_PARTS` rows of four texels. The caller disposes it. */
export function remoteTexture(slots: number): DataTexture {
  const rows = slots * REMOTE_PARTS;
  const texture = new DataTexture(new Float32Array(rows * TEXELS * 4), TEXELS, rows, RGBAFormat, FloatType);
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Writes the matrix of `part` of `slot` (column-major, as `Matrix4.elements`). */
export function writePart(data: Float32Array, slot: number, part: number, matrix: Matrix4): void {
  data.set(matrix.elements, (slot * REMOTE_PARTS + part) * TEXELS * 4);
}

/**
 * Merges the parts of every slot into one geometry. `slots[i]` is the five part geometries (`null` for a part with
 * no voxels) of the remote in slot `i`; each vertex records its row (`slot × REMOTE_PARTS + part`) in `aRow`.
 * Only position, normal and colour are kept: the solid surface of an avatar needs nothing else.
 */
export function mergeRemoteAvatars(slots: ReadonlyArray<ReadonlyArray<BufferGeometry | null>>): BufferGeometry {
  let vertices = 0;
  let indices = 0;
  for (const parts of slots)
    for (const g of parts) {
      if (!g) continue;
      vertices += g.getAttribute("position").count;
      indices += g.getIndex()!.count;
    }
  const position = new Float32Array(vertices * 3);
  const normal = new Float32Array(vertices * 3);
  const color = new Float32Array(vertices * 3);
  const row = new Float32Array(vertices);
  const index = vertices > 0xffff ? new Uint32Array(indices) : new Uint16Array(indices);
  let v = 0;
  let i = 0;
  slots.forEach((parts, slot) =>
    parts.forEach((g, part) => {
      if (!g) return;
      const n = g.getAttribute("position").count;
      position.set(g.getAttribute("position").array as Float32Array, v * 3);
      normal.set(g.getAttribute("normal").array as Float32Array, v * 3);
      color.set(g.getAttribute("color").array as Float32Array, v * 3);
      row.fill(slot * REMOTE_PARTS + part, v, v + n);
      const source = g.getIndex()!.array;
      for (let k = 0; k < source.length; k++) index[i + k] = source[k]! + v;
      v += n;
      i += source.length;
    })
  );
  const merged = new BufferGeometry();
  merged.setAttribute("position", new BufferAttribute(position, 3));
  merged.setAttribute("normal", new BufferAttribute(normal, 3));
  merged.setAttribute("color", new BufferAttribute(color, 3));
  merged.setAttribute("aRow", new BufferAttribute(row, 1));
  merged.setIndex(new BufferAttribute(index, 1));
  return merged;
}

const PARS = /* glsl */ `
attribute float aRow;
uniform highp sampler2D uRemote;
mat4 vilaRemote() {
  int r = int(aRow + 0.5);
  return mat4(texelFetch(uRemote, ivec2(0, r), 0), texelFetch(uRemote, ivec2(1, r), 0),
              texelFetch(uRemote, ivec2(2, r), 0), texelFetch(uRemote, ivec2(3, r), 0));
}
`;

function patch(shader: WebGLProgramParametersWithUniforms, texture: DataTexture, shadowPass: boolean) {
  shader.uniforms.uRemote = { value: texture };
  shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${PARS}`);
  if (shadowPass) {
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "vec3 transformed = (vilaRemote() * vec4(position, 1.0)).xyz;");
  } else {
    shader.vertexShader = shader.vertexShader
      // Rigid parts: rotation and translation only, so the upper 3×3 turns normals correctly.
      .replace("#include <beginnormal_vertex>", "mat4 vilaPart = vilaRemote();\nvec3 objectNormal = mat3(vilaPart) * vec3(normal);")
      .replace("#include <begin_vertex>", "vec3 transformed = (vilaPart * vec4(position, 1.0)).xyz;");
  }
}

/** The surface and the shadow-depth materials of the remotes, reading the same texture. The caller disposes them. */
export function remoteMaterials(texture: DataTexture): { surface: MeshStandardMaterial; depth: MeshDepthMaterial } {
  const surface = new MeshStandardMaterial({ roughness: 0.85, vertexColors: true });
  surface.onBeforeCompile = (shader) => patch(shader, texture, false);
  surface.customProgramCacheKey = () => "vila-remote";
  const depth = new MeshDepthMaterial();
  depth.onBeforeCompile = (shader) => patch(shader, texture, true);
  depth.customProgramCacheKey = () => "vila-remote-depth";
  return { surface, depth };
}
