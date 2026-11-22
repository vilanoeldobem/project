import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, CanvasTexture, MeshStandardMaterial, SRGBColorSpace } from "three";

import {
  type BillboardDef,
  BILLBOARDS,
  BOARD_FORMATS,
  CIVIC,
  LOT_DRESSING,
  PALETTE as P,
  RESIDENTIAL_DRESSING,
  RESIDENTIAL_PLOTS,
  type ResidentialPlot,
  SCREEN_SLIDE_SECONDS,
  shopCopy,
  SHOPS,
  siteCopy,
  type SiteDef,
  SITE_PROPS,
  SITES,
} from "@vila/shared/game/world";
import { useEnvSettings } from "../environment/settings";
import { env } from "../environment/runtime";
import { groundUnder, tapResidence, tapSite, visit } from "../game/clicks";
import { type AtlasCell, boardAtlas, cellUv, wrapNotice } from "./boardAtlas";
import { civic } from "./gen/civic";
import { shop } from "./gen/shops";
import { bench, lamp } from "./models";
import { Label } from "./Props";
import { blockOf } from "./sectors";
import { type CasterPart, modelExtent, partAt } from "./shadowCasters";
import { bandstand, billboardFrame, dressingItems, fountain, LAWN_SIGN_VOXEL, lawnSign, outdoorFrame, residence, screenFrame } from "./villageModels";
import { joinLitRoles, type MergeItem, MergedVoxels, mergeVoxelModels } from "./Voxels";
import { StoryProps } from "./StoryProps";

const nearest = <T extends { x: number; z: number }>(list: readonly T[], x: number, z: number): T =>
  list.reduce((a, b) => (Math.hypot(b.x - x, b.z - z) < Math.hypot(a.x - x, a.z - z) ? b : a));

/**
 * Christmas shops on the square's frontage (IMPL-0024, PROPOSTA): real buildings with a door to walk up to.
 * None is open: the panel says the shop's name and theme and that it is closed (no catalogue, no
 * purchase). All four shops and the frames of their rooftop boards are one geometry per material role.
 */
export function Shops() {
  const geometries = useMemo(
    () =>
      mergeVoxelModels([
        ...SHOPS.map((s): MergeItem => {
          const m = shop(s.id);
          return { voxels: m.voxels, size: m.size, glow: m.glow, placements: [{ x: s.x, z: s.z, rot: s.facing }] };
        }),
        { voxels: billboardFrame(), size: 1, emissive: [P.gold], placements: BILLBOARDS.filter((b) => b.format === "rooftop").map((b) => ({ x: b.x, z: b.z })) },
      ]),
    []
  );
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const s = nearest(SHOPS, e.point.x, e.point.z);
    visit(s.door, { kind: "shop", shopId: s.id });
  };
  return (
    <>
      <group onClick={click}>
        <MergedVoxels geometries={geometries} />
      </group>
      {SHOPS.map((s) => (
        // Over the billboard frame, so the name never covers the notice whichever side the shop is seen from.
        <group key={s.id} position={[s.x, 0, s.z]}>
          <Label y={11.6} text={shopCopy(s.id).name} x={s.x} z={s.z} />
        </group>
      ))}
    </>
  );
}

/** How far in front of its backing a board's artwork is drawn (the backing is a voxel thick, a lawn sign half of one). */
const PANEL_GAP = { rooftop: 0.53, outdoor: 0.53, screen: 0.53, lawn: LAWN_SIGN_VOXEL / 2 + 0.03 } as const;

/**
 * Draws every notice into the one canvas the boards share, each in its cell (`boardAtlas`): cream board and pine
 * text for the printed ones, a dark panel with light text for the screens. No image and no brand.
 */
function drawBoards(canvas: HTMLCanvasElement, cells: readonly AtlasCell[]) {
  const g = canvas.getContext("2d");
  if (!g) return;
  for (const cell of cells) {
    const screen = cell.format === "screen";
    const border = Math.max(3, Math.round(cell.h / 26));
    g.fillStyle = screen ? P.coal : P.cream;
    g.fillRect(cell.x, cell.y, cell.w, cell.h);
    g.strokeStyle = screen ? P.gold : P.red;
    g.lineWidth = border;
    g.strokeRect(cell.x + border * 1.4, cell.y + border * 1.4, cell.w - border * 2.8, cell.h - border * 2.8);
    g.fillStyle = screen ? P.cream : P.pine;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const size = Math.round(cell.h * (cell.format === "lawn" ? 0.24 : 0.19));
    g.font = `800 ${size}px Nunito, system-ui, sans-serif`;
    const lines = wrapNotice(cell.text, cell.w * 0.84, (line) => g.measureText(line).width);
    const step = size * 1.16;
    lines.forEach((line, k) => g.fillText(line, cell.x + cell.w / 2, cell.y + cell.h / 2 + (k - (lines.length - 1) / 2) * step));
  }
}

/** One quad per board, facing +z, with the texture coordinates of the cell of its first notice. */
function boardQuads(boards: readonly BillboardDef[], uvOf: (board: BillboardDef) => [number, number, number, number]): BufferGeometry {
  const n = boards.length;
  const positions = new Float32Array(n * 12), normals = new Float32Array(n * 12), uvs = new Float32Array(n * 8);
  const indices: number[] = [];
  boards.forEach((b, i) => {
    const hw = BOARD_FORMATS[b.format].width / 2, hh = BOARD_FORMATS[b.format].height / 2;
    const [u0, v0, u1, v1] = uvOf(b);
    [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].forEach(([dx, dy], k) => {
      positions.set([b.x + dx, b.y + dy, b.z + PANEL_GAP[b.format]], (i * 4 + k) * 3);
      normals.set([0, 0, 1], (i * 4 + k) * 3);
      uvs.set([dx < 0 ? u0 : u1, dy < 0 ? v0 : v1], (i * 4 + k) * 2);
    });
    indices.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The notices on every display board (IMPL-0024, IMPL-0031, PROPOSTA): fixed text of the village from the
 * shared world, read in the world. One quad per board in two draw calls (the printed boards, lit by the scene;
 * the screens, which glow) and one texture for all of them. The same text is on the board's panel as flat
 * HTML, for whoever cannot read it here. A screen changes its notice every few seconds, unless the visitor
 * asked for less motion. Not for rent (PEN-008, OQ-18).
 */
export function Billboards() {
  const reduceMotion = useEnvSettings((s) => s.reduceMotion);
  const { printed, screens, paper, glass, texture, canvas, atlas } = useMemo(() => {
    const atlas = boardAtlas();
    const canvas = document.createElement("canvas");
    canvas.width = atlas.width;
    canvas.height = atlas.height;
    drawBoards(canvas, atlas.cells);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    const first = (b: BillboardDef) => cellUv(atlas, atlas.cells.find((c) => c.boardId === b.id && c.slide === 0)!);
    const printedBoards = BILLBOARDS.filter((b) => b.format !== "screen"), screenBoards = BILLBOARDS.filter((b) => b.format === "screen");
    // Printed boards are lit by the scene like the backing behind them, with a faint glow of their own so they
    // read at night. A screen is its own light.
    const paper = new MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: "#ffffff", emissiveIntensity: 0.25, roughness: 1 });
    const glass = new MeshStandardMaterial({ color: "#1a1a1a", emissiveMap: texture, emissive: "#ffffff", emissiveIntensity: 0.9, roughness: 0.6 });
    return {
      printed: { boards: printedBoards, geometry: boardQuads(printedBoards, first) },
      screens: { boards: screenBoards, geometry: boardQuads(screenBoards, first) },
      paper, glass, texture, canvas, atlas,
    };
  }, []);
  useEffect(() => {
    // The web font may arrive after the first draw: draw again with it.
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (!alive) return;
      drawBoards(canvas, atlas.cells);
      texture.needsUpdate = true;
    });
    return () => {
      alive = false;
      printed.geometry.dispose();
      screens.geometry.dispose();
      paper.dispose();
      glass.dispose();
      texture.dispose();
    };
  }, [printed, screens, paper, glass, texture, canvas, atlas]);
  const shown = useRef(0);
  useFrame(({ clock }) => {
    // The frame's lamps light the notice once the village lights are on.
    paper.emissiveIntensity = 0.2 + 0.5 * env.frame.look.artificial;
    const slide = reduceMotion ? 0 : Math.floor(clock.elapsedTime / SCREEN_SLIDE_SECONDS);
    if (slide === shown.current) return;
    shown.current = slide;
    const uv = screens.geometry.getAttribute("uv") as BufferAttribute;
    screens.boards.forEach((b, i) => {
      const cells = atlas.cells.filter((c) => c.boardId === b.id);
      const [u0, v0, u1, v1] = cellUv(atlas, cells[slide % cells.length]);
      uv.setXY(i * 4, u0, v0);
      uv.setXY(i * 4 + 1, u1, v0);
      uv.setXY(i * 4 + 2, u1, v1);
      uv.setXY(i * 4 + 3, u0, v1);
    });
    uv.needsUpdate = true;
  });
  const click = (boards: readonly BillboardDef[]) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    // The quad under the pointer: every board of a mesh is four vertices, in the order of `boards`.
    const b = e.faceIndex !== undefined && e.faceIndex !== null ? boards[Math.floor(e.faceIndex / 2)] : nearest(boards, e.point.x, e.point.z);
    if (b) visit(b.point, { kind: "billboard", billboardId: b.id });
  };
  return (
    <>
      <mesh geometry={printed.geometry} material={paper} onClick={click(printed.boards)} />
      {screens.boards.length > 0 && <mesh geometry={screens.geometry} material={glass} onClick={click(screens.boards)} />}
    </>
  );
}

/** One sphere around every copy of a baked model: what `ShadowCulling` tests for the block. */
function castersOf(item: MergeItem): CasterPart[] {
  const { reach, height } = modelExtent(item.voxels, item.size);
  return item.placements.map((p) => partAt(p.x, p.z, reach, height));
}

/** What a click on a block may mean: the house of a plot, or a civic building, park or square. */
type Target = { kind: "plot"; plot: ResidentialPlot; x: number; z: number } | { kind: "site"; site: SiteDef; x: number; z: number };

/** The model and the place of everything that stands on the rings besides the chalets of the NGO lots. */
function ringItems(): Array<{ block: string; item: MergeItem; target?: Target }> {
  const out: Array<{ block: string; item: MergeItem; target?: Target }> = [];
  for (const plot of RESIDENTIAL_PLOTS) {
    const m = residence(plot);
    out.push({
      block: blockOf(plot.x, plot.z),
      item: { voxels: m.voxels, size: m.size, glow: m.glow, placements: [{ x: plot.house.x, z: plot.house.z, rot: plot.facing }] },
      target: { kind: "plot", plot, x: plot.house.x, z: plot.house.z },
    });
  }
  // The dressing of the residential rows and the hedges between the lots: equal parts of a block share one meshing.
  const parts = new Map<string, Array<(typeof RESIDENTIAL_DRESSING)[number]>>();
  for (const part of [...RESIDENTIAL_DRESSING, ...LOT_DRESSING]) {
    const key = blockOf(part.x, part.z);
    parts.set(key, [...(parts.get(key) ?? []), part]);
  }
  for (const [block, list] of parts) for (const item of dressingItems(list)) out.push({ block, item });
  for (const site of SITES) {
    const block = blockOf(site.x, site.z);
    const target: Target = { kind: "site", site, x: site.centre.x, z: site.centre.z };
    if (site.kind) {
      const m = civic(site.kind, site.id);
      out.push({ block, item: { voxels: m.voxels, size: m.size, glow: m.glow, emissive: m.emissive, placements: [{ x: site.centre.x, z: site.centre.z, rot: site.facing }] }, target });
    } else out.push({ block, item: { voxels: [], size: 1, placements: [] }, target });
  }
  for (const prop of SITE_PROPS) {
    const model =
      prop.kind === "bandstand" ? { voxels: bandstand(), size: 1 } : prop.kind === "fountain" ? { voxels: fountain(), size: 0.5 } : prop.kind === "site-bench" ? { voxels: bench(), size: 0.5 } : { voxels: lamp(), size: 0.5, emissive: [P.gold] };
    out.push({ block: blockOf(prop.x, prop.z), item: { ...model, placements: [{ x: prop.x, z: prop.z, rot: prop.rot }] } });
  }
  // The frames of the boards of the rings. None turns: a board faces the camera whatever its row.
  for (const b of BILLBOARDS) {
    if (b.format === "rooftop") continue;
    const roof = b.grounded ? null : (CIVIC[SITES.find((x) => x.id === b.siteId)!.kind!].screen ?? null);
    const model =
      b.format === "outdoor" ? { voxels: outdoorFrame(), size: 1, emissive: [P.gold] } : b.format === "lawn" ? { voxels: lawnSign(), size: LAWN_SIGN_VOXEL } : { voxels: screenFrame(roof), size: 1 };
    out.push({ block: blockOf(b.x, b.z), item: { ...model, placements: [{ x: b.x, z: b.z }] } });
  }
  return out;
}

/**
 * What stands on the rings (IMPL-0024, IMPL-0031, PROPOSTA): a house per residential plot, seeded by the plot
 * id, the dressing that tells the tiers apart, the hedges between the lots, the civic buildings, the parks and
 * squares and the frames of the boards. Scenery: nobody holds a plot (ownership is off), so no chimney smokes.
 * Everything static, baked into one geometry for each ring of each side of the village: blocks the renderer
 * culls one by one. A block is a long, thin row, so it joins the shadow pass only while the shadow of one of
 * its parts is seen (`casters`). The windows and the lanterns of every block are two meshes for the whole
 * village (`joinLitRoles`).
 */
export function Rings({ story = false }: { story?: boolean }) {
  const { blocks, lit, targets } = useMemo(() => {
    const byBlock = new Map<string, { items: MergeItem[]; targets: Target[] }>();
    for (const { block, item, target } of ringItems()) {
      let b = byBlock.get(block);
      if (!b) byBlock.set(block, (b = { items: [], targets: [] }));
      if (item.placements.length > 0) b.items.push(item);
      if (target) b.targets.push(target);
    }
    const blocks = [...byBlock.values()].filter((b) => b.items.length > 0).map((b) => ({ targets: b.targets, geometries: mergeVoxelModels(b.items), casters: b.items.flatMap(castersOf) }));
    return { blocks, lit: joinLitRoles(blocks.map((b) => b.geometries)), targets: [...byBlock.values()].flatMap((b) => b.targets) };
  }, []);
  /**
   * A click on a house, a civic building or anything of their row: the panel of the place or the walk to its
   * front, unless the ground under the pointer is the street behind a roof (`tapResidence`, `tapSite`).
   */
  const open = (list: readonly Target[]) => (e: ThreeEvent<MouseEvent>) => {
    if (list.length === 0) return;
    e.stopPropagation();
    const target = nearest(list, e.point.x, e.point.z);
    const ground = groundUnder(e.ray.origin, e.ray.direction);
    if (target.kind === "plot") tapResidence(target.plot, ground);
    else tapSite(target.site, ground);
  };
  return (
    <>
      {blocks.map((block, i) => (
        <group key={i} onClick={block.targets.length > 0 ? open(block.targets) : undefined}>
          <MergedVoxels geometries={block.geometries} casters={block.casters} />
        </group>
      ))}
      <group onClick={open(targets)}>
        <MergedVoxels geometries={lit} />
      </group>
      {SITES.map((site) => (
        <group key={site.id} position={[site.centre.x, 0, site.centre.z]}>
          <Label y={site.kind ? (CIVIC[site.kind].screen ?? 8) + (CIVIC[site.kind].screen ? 6.5 : 2.5) : 9} text={siteCopy(site).name} x={site.centre.x} z={site.centre.z} />
        </group>
      ))}
      {story && <StoryProps />}
    </>
  );
}
