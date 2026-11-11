/**
 * Voxel mesher (pure, no three.js scene objects): turns a voxel model into merged triangle buffers.
 *
 * - **Face culling:** a face between two occupied cells is never emitted. Occupancy is shared by every
 *   group of the model, so a bulb set into foliage also hides the foliage face behind it.
 * - **Ambient occlusion:** classic per-vertex voxel AO from the three cells around each face corner, baked
 *   into the vertex colour (no runtime cost), with the quad diagonal flipped to keep the gradient symmetric.
 * - **`center` attribute:** every vertex carries its voxel's centre, so shaders move/phase a whole voxel
 *   rigidly (wind sway, twinkle) even though the model is a single mesh.
 *
 * Cells with non-integer coordinates (decor placed off-grid) are drawn with all six faces and occlude
 * nothing: correct, only less optimal.
 */
import type { Voxel } from "./models";

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  /** Linear-sRGB vertex colours with AO applied. */
  colors: Float32Array;
  /** Voxel centre per vertex (model space). */
  centers: Float32Array;
  indices: Uint16Array | Uint32Array;
  /** Quads emitted (2 triangles each). */
  faces: number;
}

export interface MeshOptions {
  /** Edge length of one voxel (model units). */
  size?: number;
  /** Group index per voxel (material role); voxels of every group still occlude each other. */
  groupOf?: (v: Voxel) => number;
  groups?: number;
  /** Groups that skip AO (emissive bulbs must keep their colour). */
  noAo?: ReadonlySet<number>;
  /** Converts a CSS colour to linear RGB (three's `Color` in the app; injectable for tests). */
  toLinear: (css: string) => [number, number, number];
}

/** Corner brightness by number of occluding neighbours (0..3). Tuned for soft, toy-like contact shading. */
export const AO_CURVE = [1, 0.8, 0.66, 0.54] as const;

const OFFSET = 1024;
const SPAN = 2048;
const isInt = (n: number) => Number.isInteger(n) && n > -OFFSET && n < OFFSET;
const key = (x: number, y: number, z: number) => ((x + OFFSET) * SPAN + (y + OFFSET)) * SPAN + (z + OFFSET);

/** Face corners in (u, v) order; counter-clockwise seen from the positive side of the axis. */
const CORNERS: ReadonlyArray<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

export function meshVoxels(voxels: readonly Voxel[], opts: MeshOptions): MeshData[] {
  const size = opts.size ?? 1;
  const groups = opts.groups ?? 1;
  const groupOf = opts.groupOf ?? (() => 0);

  // Deduplicate cells (last voxel wins), and index occupancy of grid-aligned cells.
  const solid = new Set<number>();
  const cells = new Map<number | string, Voxel>();
  for (const v of voxels) {
    if (isInt(v[0]) && isInt(v[1]) && isInt(v[2])) {
      const k = key(v[0], v[1], v[2]);
      solid.add(k);
      cells.set(k, v);
    } else cells.set(`${v[0]},${v[1]},${v[2]}`, v);
  }
  const grid = (v: Voxel) => isInt(v[0]) && isInt(v[1]) && isInt(v[2]);
  const filled = (x: number, y: number, z: number) => solid.has(key(x, y, z));

  const colorCache = new Map<string, [number, number, number]>();
  const linear = (c: string) => {
    let rgb = colorCache.get(c);
    if (!rgb) colorCache.set(c, (rgb = opts.toLinear(c)));
    return rgb;
  };

  // Pass 1: count faces per group so buffers are allocated once.
  const counts = new Array<number>(groups).fill(0);
  const p = [0, 0, 0];
  for (const v of cells.values()) {
    const g = groupOf(v);
    if (!grid(v)) {
      counts[g] += 6;
      continue;
    }
    for (let d = 0; d < 3; d++)
      for (const s of [1, -1]) {
        p[0] = v[0]; p[1] = v[1]; p[2] = v[2];
        p[d] += s;
        if (!filled(p[0], p[1], p[2])) counts[g]++;
      }
  }

  const out = counts.map((faces): MeshData => {
    const verts = faces * 4;
    return {
      positions: new Float32Array(verts * 3),
      normals: new Float32Array(verts * 3),
      colors: new Float32Array(verts * 3),
      centers: new Float32Array(verts * 3),
      indices: verts > 65535 ? new Uint32Array(faces * 6) : new Uint16Array(faces * 6),
      faces: 0,
    };
  });

  const half = size / 2;
  const q = [0, 0, 0];
  const ao = [0, 0, 0, 0];
  for (const v of cells.values()) {
    const g = groupOf(v);
    const m = out[g];
    const onGrid = grid(v);
    const useAo = onGrid && !opts.noAo?.has(g);
    const [r, gr, b] = linear(v[3]);
    const cx = v[0] * size, cy = v[1] * size + half, cz = v[2] * size;
    for (let d = 0; d < 3; d++) {
      const u = (d + 1) % 3, w = (d + 2) % 3;
      for (const s of [1, -1]) {
        if (onGrid) {
          p[0] = v[0]; p[1] = v[1]; p[2] = v[2];
          p[d] += s;
          if (filled(p[0], p[1], p[2])) continue;
        }
        // AO: the layer in front of the face (p), sampled at the two edge cells and the corner cell.
        for (let i = 0; i < 4; i++) {
          if (!useAo) {
            ao[i] = 0;
            continue;
          }
          const [cu, cv] = CORNERS[i];
          q[0] = p[0]; q[1] = p[1]; q[2] = p[2];
          q[u] += cu;
          const s1 = filled(q[0], q[1], q[2]) ? 1 : 0;
          q[u] -= cu; q[w] += cv;
          const s2 = filled(q[0], q[1], q[2]) ? 1 : 0;
          q[u] += cu;
          const c = filled(q[0], q[1], q[2]) ? 1 : 0;
          ao[i] = s1 && s2 ? 3 : s1 + s2 + c;
        }
        const base = m.faces * 4;
        for (let k = 0; k < 4; k++) {
          // Negative faces walk the corners backwards so every face stays counter-clockwise from outside.
          const i = s > 0 ? k : 3 - k;
          const [cu, cv] = CORNERS[i];
          const o = (base + k) * 3;
          const pos = [cx, cy, cz];
          pos[d] += s * half;
          pos[u] += cu * half;
          pos[w] += cv * half;
          m.positions[o] = pos[0]; m.positions[o + 1] = pos[1]; m.positions[o + 2] = pos[2];
          m.normals[o + d] = s;
          const shade = AO_CURVE[ao[i]];
          m.colors[o] = r * shade; m.colors[o + 1] = gr * shade; m.colors[o + 2] = b * shade;
          m.centers[o] = cx; m.centers[o + 1] = cy; m.centers[o + 2] = cz;
        }
        // Choose the diagonal so a single dark (or bright) corner stays inside one triangle: split along 1–3
        // when corners 0 and 2 are the more occluded pair, else along 0–2 (no anisotropic seam).
        const a0 = ao[s > 0 ? 0 : 3], a1 = ao[s > 0 ? 1 : 2], a2 = ao[s > 0 ? 2 : 1], a3 = ao[s > 0 ? 3 : 0];
        const t = m.faces * 6;
        if (a0 + a2 > a1 + a3) {
          m.indices.set([base + 1, base + 2, base + 3, base + 1, base + 3, base], t);
        } else {
          m.indices.set([base, base + 1, base + 2, base, base + 2, base + 3], t);
        }
        m.faces++;
      }
    }
  }
  return out;
}
