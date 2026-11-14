/**
 * A flat portrait of the avatar, drawn from the same voxels the scene uses (P07/P13/P15): an oblique front
 * view, painter's order, one rect per voxel. No WebGL, no randomness, no time: the same look and appearance
 * always draw the same picture, so a test can read it.
 */
import { useMemo } from "react";

import { darkenHex, HEIGHT_SCALE, type Appearance } from "@vila/shared/game/appearance";
import type { Look } from "@vila/shared/game/cosmetics";
import { AVATAR_SIZE, avatarParts, HIP_Y, SHOULDER_Y, type Voxel } from "../scene/models";

/** The camera steps diagonally: one voxel of depth shifts the drawing by this much on each axis. */
const DEPTH = 0.3;

/** Body and limbs in the avatar's own voxel frame (legs at the hip, arms at the shoulder). */
function figure(look: Look, appearance: Appearance): Voxel[] {
  const parts = avatarParts(look, appearance);
  const hip = Math.round(HIP_Y / AVATAR_SIZE);
  const shoulder = Math.round(SHOULDER_Y / AVATAR_SIZE);
  const shift = (voxels: Voxel[], dx: number, dy: number): Voxel[] => voxels.map(([x, y, z, c]) => [x + dx, y + dy, z, c]);
  return [...parts.body, ...shift(parts.legL, -1, hip), ...shift(parts.legR, 1, hip), ...shift(parts.armL, -2, shoulder), ...shift(parts.armR, 2, shoulder)];
}

export function AvatarPortrait({
  look,
  appearance,
  size = 12,
  label,
}: {
  look: Look;
  appearance: Appearance;
  /** Pixels per voxel (before the height scale). */
  size?: number;
  label: string;
}) {
  const drawing = useMemo(() => {
    const voxels = figure(look, appearance).map(([x, y, z, c]) => ({ x: x + DEPTH * z, y: -(y + DEPTH * z), z, c }));
    voxels.sort((a, b) => a.z - b.z || a.x - b.x || b.y - a.y);
    const xPositions = voxels.map((v) => v.x);
    const yPositions = voxels.map((v) => v.y);
    const minX = Math.min(...xPositions) - 1;
    const maxX = Math.max(...xPositions) + 1;
    const minY = Math.min(...yPositions) - 1;
    const maxY = Math.max(...yPositions) + 1;
    const viewWidth = maxX - minX;
    const viewHeight = maxY - minY;
    const scale = size * HEIGHT_SCALE[appearance.height];
    return {
      rects: voxels.map((v) => ({ key: `${v.z}:${v.x}:${v.y}`, x: v.x, y: v.y, fill: v.c, stroke: darkenHex(v.c) })),
      viewBox: `${minX} ${minY} ${viewWidth} ${viewHeight}`,
      width: Math.round(viewWidth * scale),
      height: Math.round(viewHeight * scale),
    };
  }, [look, appearance, size]);

  return (
    <svg className="avatar-portrait" role="img" aria-label={label} viewBox={drawing.viewBox} width={drawing.width} height={drawing.height}>
      {drawing.rects.map((r) => (
        <rect key={r.key} x={r.x} y={r.y} width={1.02} height={1.02} fill={r.fill} stroke={r.stroke} strokeWidth={0.06} />
      ))}
    </svg>
  );
}
