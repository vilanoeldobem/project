import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, CanvasTexture, MeshStandardMaterial, SRGBColorSpace } from "three";

import {
  billboardNotice,
  BILLBOARDS,
  PALETTE as P,
  PLACE_INTERACT_DISTANCE,
  type PlotTier,
  RESIDENTIAL_DRESSING,
  RESIDENTIAL_PLOTS,
  type ResidentialPlot,
  shopCopy,
  SHOPS,
  VILLAGE_PLAN,
} from "@vila/shared/game/world";
import { env } from "../environment/runtime";
import { sim } from "../game/sim";
import { type Panel, useVila } from "../game/store";
import { shop } from "./gen/shops";
import { Label } from "./Props";
import { type CasterPart, modelExtent, partAt } from "./shadowCasters";
import { BILLBOARD_PANEL, billboardFrame, dressingItems, residence } from "./villageModels";
import { joinLitRoles, type MergeItem, MergedVoxels, mergeVoxelModels } from "./Voxels";

/**
 * A click on a building of the village: its panel opens from where it is used (the same reach as the action
 * button); from farther away the avatar walks to that spot instead, like a click on a villager.
 */
function visit(spot: { x: number; z: number }, panel: Panel) {
  const { open, setTarget } = useVila.getState();
  if (Math.hypot(spot.x - sim.pose.x, spot.z - sim.pose.z) < PLACE_INTERACT_DISTANCE) open(panel);
  else setTarget(spot);
}

const nearest = <T extends { x: number; z: number }>(list: readonly T[], x: number, z: number): T =>
  list.reduce((a, b) => (Math.hypot(b.x - x, b.z - z) < Math.hypot(a.x - x, a.z - z) ? b : a));

/**
 * Christmas shops on the square's frontage (IMPL-0024, PROPOSTA): real buildings with a door to walk up to.
 * None is open: the panel says what the shop will offer and that it has not opened (no catalogue, no
 * purchase). All four shops and their billboard frames are one geometry per material role.
 */
export function Shops() {
  const geometries = useMemo(
    () =>
      mergeVoxelModels([
        ...SHOPS.map((s): MergeItem => {
          const m = shop(s.id);
          return { voxels: m.voxels, size: m.size, glow: m.glow, placements: [{ x: s.x, z: s.z, rot: s.facing }] };
        }),
        { voxels: billboardFrame(), size: 1, emissive: [P.gold], placements: BILLBOARDS.map((b) => ({ x: b.x, z: b.z })) },
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

const CELL = { width: 640, height: 256 } as const;

/** Draws every notice into one canvas, one cell per billboard: cream board, pine text, no image and no brand. */
function drawNotices(canvas: HTMLCanvasElement) {
  const g = canvas.getContext("2d");
  if (!g) return;
  BILLBOARDS.forEach((b, i) => {
    const top = i * CELL.height;
    g.fillStyle = P.cream;
    g.fillRect(0, top, CELL.width, CELL.height);
    g.strokeStyle = P.red;
    g.lineWidth = 10;
    g.strokeRect(14, top + 14, CELL.width - 28, CELL.height - 28);
    g.fillStyle = P.pine;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "800 50px Nunito, system-ui, sans-serif";
    // Greedy wrap: the notices are short (two or three lines).
    const lines: string[] = [];
    for (const word of billboardNotice(b.id).split(" ")) {
      const last = lines[lines.length - 1];
      if (last !== undefined && g.measureText(`${last} ${word}`).width <= CELL.width - 90) lines[lines.length - 1] = `${last} ${word}`;
      else lines.push(word);
    }
    const step = 58;
    lines.forEach((line, k) => g.fillText(line, CELL.width / 2, top + CELL.height / 2 + (k - (lines.length - 1) / 2) * step));
  });
}

/**
 * The notices on the billboard frames (IMPL-0024, PROPOSTA): fixed text of the village from the shared world,
 * read in the world. One quad per frame, all in one draw call and one small texture. The same text is on the
 * billboard's panel as flat HTML, for whoever cannot read it here. Not for rent (PEN-008, OQ-18).
 */
export function Billboards() {
  const { geometry, material, texture, canvas } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = CELL.width;
    canvas.height = CELL.height * BILLBOARDS.length;
    drawNotices(canvas);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    const n = BILLBOARDS.length;
    const positions = new Float32Array(n * 12), normals = new Float32Array(n * 12), uvs = new Float32Array(n * 8);
    const indices: number[] = [];
    const hw = BILLBOARD_PANEL.width / 2, hh = BILLBOARD_PANEL.height / 2;
    BILLBOARDS.forEach((b, i) => {
      // Just in front of the board (the frame's voxels end at z + 0.5), facing +z: towards the camera.
      const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
      corners.forEach(([dx, dy], k) => {
        positions.set([b.x + dx, b.y + dy, b.z + 0.53], (i * 4 + k) * 3);
        normals.set([0, 0, 1], (i * 4 + k) * 3);
        uvs.set([dx < 0 ? 0 : 1, 1 - (i + (dy < 0 ? 1 : 0)) / n], (i * 4 + k) * 2);
      });
      indices.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    // Lit by the scene like the board behind it, with a faint glow of its own so it reads at night.
    const material = new MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: "#ffffff", emissiveIntensity: 0.25, roughness: 1 });
    return { geometry, material, texture, canvas };
  }, []);
  useEffect(() => {
    // The web font may arrive after the first draw: draw again with it.
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (!alive) return;
      drawNotices(canvas);
      texture.needsUpdate = true;
    });
    return () => {
      alive = false;
      geometry.dispose();
      material.dispose();
      texture.dispose();
    };
  }, [geometry, material, texture, canvas]);
  useFrame(() => {
    // The frame's lamps light the notice once the village lights are on.
    material.emissiveIntensity = 0.2 + 0.5 * env.frame.look.artificial;
  });
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const b = nearest(BILLBOARDS, e.point.x, e.point.z);
    visit(b.point, { kind: "billboard", billboardId: b.id });
  };
  return <mesh geometry={geometry} material={material} onClick={click} />;
}

/** Side of the village a point belongs to (the sides are the sectors between two avenues). */
const sideOf = (x: number, z: number) => {
  const n = VILLAGE_PLAN.sides;
  return ((Math.round((Math.atan2(z, x) * n) / (2 * Math.PI)) % n) + n) % n;
};

/** The tier whose ring a point of a residential row is in. */
const tierOf = (x: number, z: number): PlotTier => nearest(RESIDENTIAL_PLOTS, x, z).tier;

/**
 * The residential rows (IMPL-0024, PROPOSTA): a chalet per plot, seeded by the plot id, and the dressing that
 * tells the tiers apart. Scenery: nobody holds a plot (ownership is off), so no chimney smokes. Everything
 * static, baked into one geometry for each tier of each side of the village: 24 blocks the renderer culls
 * one by one, instead of 112 chalets and 272 parts. A block is a long, thin row, so it joins the shadow
 * pass only while the shadow of one of its chalets or parts is seen (`casters`). The windows and the
 * lanterns of every block are two meshes for the whole village (`joinLitRoles`).
 */
export function Residences() {
  const { sides, lit } = useMemo(() => {
    const out = new Map<string, { plots: ResidentialPlot[]; items: MergeItem[] }>();
    const block = (x: number, z: number, tier: PlotTier) => {
      const key = `${sideOf(x, z)}:${tier}`;
      let b = out.get(key);
      if (!b) out.set(key, (b = { plots: [], items: [] }));
      return b;
    };
    for (const plot of RESIDENTIAL_PLOTS) {
      const m = residence(plot);
      const b = block(plot.x, plot.z, plot.tier);
      b.plots.push(plot);
      b.items.push({ voxels: m.voxels, size: m.size, glow: m.glow, placements: [{ x: plot.house.x, z: plot.house.z, rot: plot.facing }] });
    }
    // The dressing joins the block of the plot it stands on; equal parts of a block share one meshing.
    const parts = new Map<string, typeof RESIDENTIAL_DRESSING>();
    for (const part of RESIDENTIAL_DRESSING) {
      const key = `${sideOf(part.x, part.z)}:${tierOf(part.x, part.z)}`;
      parts.set(key, [...(parts.get(key) ?? []), part]);
    }
    for (const [key, list] of parts) out.get(key)?.items.push(...dressingItems(list));
    const sides = [...out.values()].map((b) => ({ plots: b.plots, geometries: mergeVoxelModels(b.items), casters: b.items.flatMap(castersOf) }));
    return { sides, lit: joinLitRoles(sides.map((side) => side.geometries)) };
  }, []);
  /** A click on a chalet or on anything of its plot: the plot's panel, or the walk to its front. */
  const open = (plots: readonly ResidentialPlot[]) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const plot = nearest(plots, e.point.x, e.point.z);
    visit(plot.front, { kind: "plot", plotId: plot.id });
  };
  return (
    <>
      {sides.map((side, s) => (
        <group key={s} onClick={open(side.plots)}>
          <MergedVoxels geometries={side.geometries} casters={side.casters} />
        </group>
      ))}
      <group onClick={open(RESIDENTIAL_PLOTS)}>
        <MergedVoxels geometries={lit} />
      </group>
    </>
  );
}

/** One sphere around every copy of a baked model: what `ShadowCulling` tests for the block. */
function castersOf(item: MergeItem): CasterPart[] {
  const { reach, height } = modelExtent(item.voxels, item.size);
  return item.placements.map((p) => partAt(p.x, p.z, reach, height));
}
