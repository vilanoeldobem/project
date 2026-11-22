/**
 * Voxel mesher (pure, no three.js scene objects): turns a voxel model into merged triangle buffers.
 *
 * - **Face culling:** a face between two occupied cells is never emitted. Occupancy is shared by every
 *   group of the model, so a bulb set into foliage also hides the foliage face behind it.
 * - **Greedy meshing (IMPL-0035):** coplanar faces of one group, one colour and one flat ambient occlusion are
 *   merged into rectangles, the usual practice of voxel games: a wall of one colour is two triangles, not two per
 *   block. A face whose corners are shaded differently stays on its own, so the AO gradient is exact.
 * - **Ambient occlusion:** classic per-vertex voxel AO from the three cells around each face corner, baked
 *   into the vertex colour (no runtime cost), with the quad diagonal flipped to keep the gradient symmetric.
 * - **`center` attribute:** every vertex of a group in `centers` carries its voxel's centre, so shaders
 *   move/phase a whole voxel rigidly (wind sway, twinkle, idle breathing). Those groups are never merged: each
 *   voxel must keep its own quads to move on its own.
 * - **`grid` attribute (block look, IMPL-0033):** the position of every vertex in voxel units and the axis of its
 *   face. The shared materials draw each block's edge and its own small shade from it per pixel, so a merged
 *   rectangle still reads as blocks.
 *
 * Cells with non-integer coordinates (decor placed off-grid) are drawn with all six faces and occlude
 * nothing: correct, only less optimal.
 */
import type { Voxel } from "./models";

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  /** Linear-sRGB vertex colours with AO and the face light applied. */
  colors: Float32Array;
  /** Voxel centre per vertex (model space); null for a group outside `MeshOptions.centers`. */
  centers: Float32Array | null;
  /**
   * Per vertex: x, y, z in voxel units (block edges at whole numbers) and the face axis plus one (1..3), plus 4
   * when the block has no edge line (fine models). The shaders read a geometry without it as 0 and draw no block
   * look.
   */
  grid: Float32Array;
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
  /** Groups that skip AO and the face light (emissive bulbs must keep their colour). */
  noAo?: ReadonlySet<number>;
  /** false: no ambient occlusion anywhere (the face light stays). For fine models (`GenModel.ao`). */
  ao?: boolean;
  /** Groups whose vertices carry the voxel centre (animated in a shader) and are not merged. Omitted = every group. */
  centers?: ReadonlySet<number>;
  /**
   * Skips the downward faces of the base layer (y = 0): a model that stands on the ground is never seen
   * from underneath. Faces that look down higher up (eaves, awnings) are kept: the sky view sees them.
   */
  noFloor?: boolean;
  /** Converts a CSS colour to linear RGB (three's `Color` in the app; injectable for tests). */
  toLinear: (css: string) => [number, number, number];
  /**
   * Whether the shaders draw a line around every block (`EDGE_MIN_SIZE`): on large blocks it shows the grid, on
   * fine ones it turns a surface into graph paper, so fine models keep only the per-block shade.
   */
  edges?: boolean;
}

/**
 * Colour of a cell that fills space but is never drawn: it hides the faces of its neighbours (the inside of a
 * building under its walls; `refine.ts`) and emits none of its own.
 */
export const HIDDEN = "hidden";

/** Smallest voxel (world units) that gets block edges by default; finer models show only the per-block shade. */
export const EDGE_MIN_SIZE = 0.5;

/** Corner brightness by number of occluding neighbours (0..3). Tuned for soft, toy-like contact shading. */
export const AO_CURVE = [1, 0.8, 0.66, 0.54] as const;

/**
 * Block look (IMPL-0033): each face gets a fixed light by its direction, so the top of a block reads lighter than
 * its sides even under flat light. Indexed `[axis][side]`, side 0 = positive. Emissive groups (`noAo`) keep their
 * colour. The per-block shade is drawn by the shaders from `grid` (`BLOCK_LOOK` in environment/materials.ts).
 */
export const FACE_LIGHT = [
  [0.93, 0.93],
  [1, 0.78],
  [0.87, 0.87],
] as const;

const OFFSET = 1024;
const SPAN = 2048;
const isInt = (n: number) => Number.isInteger(n) && n > -OFFSET && n < OFFSET;
const key = (x: number, y: number, z: number) => ((x + OFFSET) * SPAN + (y + OFFSET)) * SPAN + (z + OFFSET);

/** Face corners in (u, v) order; counter-clockwise seen from the positive side of the axis. */
const CORNERS: ReadonlyArray<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/** One rectangle to emit: cells [u0..u1] × [w0..w1] of the plane through cell `at` on axis `d`, facing `s`. */
interface Quad {
  g: number;
  d: number;
  s: 1 | -1;
  /** Cell coordinates of the first cell (its d coordinate is the layer of the voxels). */
  at: [number, number, number];
  du: number;
  dw: number;
  rgb: [number, number, number];
  ao: [number, number, number, number];
  center: [number, number, number] | null;
}

export function meshVoxels(voxels: readonly Voxel[], opts: MeshOptions): MeshData[] {
  const size = opts.size ?? 1;
  const half = size / 2;
  const groups = opts.groups ?? 1;
  const groupOf = opts.groupOf ?? (() => 0);
  const noFloor = opts.noFloor === true;
  const animated = (g: number) => !opts.centers || opts.centers.has(g);
  const noEdges = (opts.edges ?? size >= EDGE_MIN_SIZE) ? 0 : 4;

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

  const quads: Quad[] = [];
  /** Faces that may merge, by plane: `g|d|s|layer` → (u, w) → face. */
  const planes = new Map<string, Map<string, { u: number; w: number; v: Voxel; ao: number; rgb: [number, number, number] }>>();
  const p = [0, 0, 0];
  const q = [0, 0, 0];
  const ao: [number, number, number, number] = [0, 0, 0, 0];

  for (const v of cells.values()) {
    if (v[3] === HIDDEN) continue;
    const g = groupOf(v);
    const onGrid = grid(v);
    const lit = onGrid && !opts.noAo?.has(g);
    const useAo = lit && opts.ao !== false;
    const base = linear(v[3]);
    for (let d = 0; d < 3; d++) {
      const u = (d + 1) % 3, w = (d + 2) % 3;
      for (const s of [1, -1] as const) {
        if (noFloor && onGrid && d === 1 && s === -1 && v[1] === 0) continue;
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
        const light = lit ? FACE_LIGHT[d][s > 0 ? 0 : 1] : 1;
        const rgb: [number, number, number] = [base[0] * light, base[1] * light, base[2] * light];
        const flat = ao[0] === ao[1] && ao[1] === ao[2] && ao[2] === ao[3];
        if (onGrid && flat && !animated(g)) {
          const plane = `${g}|${d}|${s}|${v[d]}`;
          let faces = planes.get(plane);
          if (!faces) planes.set(plane, (faces = new Map()));
          faces.set(`${v[u]},${v[w]}`, { u: v[u] as number, w: v[w] as number, v, ao: ao[0], rgb });
          continue;
        }
        quads.push({
          g, d, s, at: [v[0], v[1], v[2]], du: 1, dw: 1, rgb, ao: [ao[0], ao[1], ao[2], ao[3]],
          center: animated(g) ? [v[0] * size, v[1] * size + half, v[2] * size] : null,
        });
      }
    }
  }

  // Greedy merge of each plane: grow a run along u, then add rows along w while the whole row matches.
  for (const [plane, faces] of planes) {
    const [g, d, s] = plane.split("|").map(Number) as [number, number, 1 | -1];
    const u = (d + 1) % 3, w = (d + 2) % 3;
    const same = (a: { ao: number; v: Voxel }, b: { ao: number; v: Voxel } | undefined) => !!b && b.ao === a.ao && b.v[3] === a.v[3];
    const done = new Set<string>();
    const order = [...faces.values()].sort((a, b) => a.w - b.w || a.u - b.u);
    for (const f of order) {
      const k = `${f.u},${f.w}`;
      if (done.has(k)) continue;
      let du = 1;
      while (!done.has(`${f.u + du},${f.w}`) && same(f, faces.get(`${f.u + du},${f.w}`))) du++;
      let dw = 1;
      grow: for (;;) {
        for (let i = 0; i < du; i++) {
          const kk = `${f.u + i},${f.w + dw}`;
          if (done.has(kk) || !same(f, faces.get(kk))) break grow;
        }
        dw++;
      }
      for (let j = 0; j < dw; j++) for (let i = 0; i < du; i++) done.add(`${f.u + i},${f.w + j}`);
      const at: [number, number, number] = [0, 0, 0];
      at[d] = f.v[d] as number; at[u] = f.u; at[w] = f.w;
      quads.push({ g, d, s, at, du, dw, rgb: f.rgb, ao: [f.ao, f.ao, f.ao, f.ao], center: null });
    }
  }

  // Emit.
  const counts = new Array<number>(groups).fill(0);
  for (const qd of quads) counts[qd.g]++;
  const out = counts.map((faces, g): MeshData => {
    const verts = faces * 4;
    return {
      positions: new Float32Array(verts * 3),
      normals: new Float32Array(verts * 3),
      colors: new Float32Array(verts * 3),
      centers: animated(g) ? new Float32Array(verts * 3) : null,
      grid: new Float32Array(verts * 4),
      indices: verts > 65535 ? new Uint32Array(faces * 6) : new Uint16Array(faces * 6),
      faces: 0,
    };
  });
  /** Model-space coordinate of a cell's centre along an axis (models stand on y = 0). */
  const centre = (axis: number, cell: number) => cell * size + (axis === 1 ? half : 0);
  const pos = [0, 0, 0];
  for (const qd of quads) {
    const m = out[qd.g];
    const { d, s } = qd;
    const u = (d + 1) % 3, w = (d + 2) % 3;
    const base = m.faces * 4;
    for (let k = 0; k < 4; k++) {
      // Negative faces walk the corners backwards so every face stays counter-clockwise from outside.
      const i = s > 0 ? k : 3 - k;
      const [cu, cv] = CORNERS[i];
      pos[d] = centre(d, qd.at[d]) + s * half;
      pos[u] = centre(u, cu < 0 ? qd.at[u] : qd.at[u] + qd.du - 1) + cu * half;
      pos[w] = centre(w, cv < 0 ? qd.at[w] : qd.at[w] + qd.dw - 1) + cv * half;
      const o = (base + k) * 3;
      m.positions[o] = pos[0]; m.positions[o + 1] = pos[1]; m.positions[o + 2] = pos[2];
      m.normals[o + d] = s;
      const shade = AO_CURVE[qd.ao[i]];
      m.colors[o] = qd.rgb[0] * shade; m.colors[o + 1] = qd.rgb[1] * shade; m.colors[o + 2] = qd.rgb[2] * shade;
      if (m.centers && qd.center) {
        m.centers[o] = qd.center[0]; m.centers[o + 1] = qd.center[1]; m.centers[o + 2] = qd.center[2];
      }
      // Voxel units with block edges at whole numbers: x and z centres sit on whole numbers, y centres on halves.
      const gi = (base + k) * 4;
      m.grid[gi] = pos[0] / size + 0.5;
      m.grid[gi + 1] = pos[1] / size;
      m.grid[gi + 2] = pos[2] / size + 0.5;
      m.grid[gi + 3] = d + 1 + noEdges;
    }
    // Choose the diagonal so a single dark (or bright) corner stays inside one triangle: split along 1–3
    // when corners 0 and 2 are the more occluded pair, else along 0–2 (no anisotropic seam).
    const a = qd.ao;
    const a0 = a[s > 0 ? 0 : 3], a1 = a[s > 0 ? 1 : 2], a2 = a[s > 0 ? 2 : 1], a3 = a[s > 0 ? 3 : 0];
    const t = m.faces * 6;
    if (a0 + a2 > a1 + a3) m.indices.set([base + 1, base + 2, base + 3, base + 1, base + 3, base], t);
    else m.indices.set([base, base + 1, base + 2, base, base + 2, base + 3], t);
    m.faces++;
  }
  return out;
}
