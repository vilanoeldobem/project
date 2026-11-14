/**
 * The whole cast of the village as one set of triangle buffers (IMPL-0025; pure, no three.js objects): every
 * character's rig is meshed part by part with the voxel mesher and appended, each vertex carrying the character
 * it belongs to and the pivot and weights of its part. One mesh then draws everyone in one call: a vertex shader
 * (`lifeMaterial.ts`) places each character from one row of a small data texture, and the index buffer holds
 * only the characters near the camera (`ranges` says which indices are whose).
 */
import type { Rig } from "../gen/cast";
import { meshVoxels } from "../mesher";

export interface CastBuffers {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  /** Per vertex: character index, pivot height and depth of its part (u), and 1 for something held. */
  rig: Float32Array;
  /** Per vertex: the part's share of the walk angle and of the two gesture angles. */
  anim: Float32Array;
  indices: Uint32Array;
  /** Where each character's indices are in `indices`. */
  ranges: Array<{ start: number; count: number }>;
}

export function buildCast(rigs: readonly Rig[], toLinear: (css: string) => [number, number, number]): CastBuffers {
  const meshes = rigs.map((rig) => rig.parts.map((part) => ({ part, data: meshVoxels(part.voxels, { size: rig.size, toLinear })[0] })));
  let vertices = 0, indexCount = 0;
  for (const parts of meshes) for (const { data } of parts) (vertices += data.faces * 4), (indexCount += data.faces * 6);
  const out: CastBuffers = {
    positions: new Float32Array(vertices * 3),
    normals: new Float32Array(vertices * 3),
    colors: new Float32Array(vertices * 3),
    rig: new Float32Array(vertices * 4),
    anim: new Float32Array(vertices * 3),
    indices: new Uint32Array(indexCount),
    ranges: [],
  };
  let v = 0, i = 0;
  meshes.forEach((parts, character) => {
    const start = i;
    for (const { part, data } of parts) {
      const n = data.faces * 4;
      out.positions.set(data.positions.subarray(0, n * 3), v * 3);
      out.normals.set(data.normals.subarray(0, n * 3), v * 3);
      out.colors.set(data.colors.subarray(0, n * 3), v * 3);
      const size = rigs[character].size;
      for (let k = 0; k < n; k++) {
        out.rig.set([character, part.pivot[0] * size, part.pivot[1] * size, part.prop ? 1 : 0], (v + k) * 4);
        out.anim.set([part.swing, part.first, part.second], (v + k) * 3);
      }
      for (let k = 0; k < data.faces * 6; k++) out.indices[i + k] = data.indices[k] + v;
      v += n;
      i += data.faces * 6;
    }
    out.ranges.push({ start, count: i - start });
  });
  return out;
}

/**
 * Writes the indices of the characters to draw at the front of `into` and returns how many there are: the mesh
 * draws that many and no more, so a character that is far away costs no triangle.
 */
export function packVisible(cast: CastBuffers, visible: ArrayLike<number>, into: Uint32Array): number {
  let n = 0;
  for (let c = 0; c < cast.ranges.length; c++) {
    if (!visible[c]) continue;
    const { start, count } = cast.ranges[c];
    into.set(cast.indices.subarray(start, start + count), n);
    n += count;
  }
  return n;
}
