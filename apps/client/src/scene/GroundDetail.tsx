import { useMemo } from "react";

import { WORLD_RADIUS } from "@vila/shared/game/world";
import { DETAIL_MODELS, DETAIL_VOXEL, type DetailKind, groundDetail } from "./groundDecor";
import { GROUND_SECTORS, groundPiece } from "./groundRuns";
import { MergedVoxels, type MergeItem, mergeVoxelModels } from "./Voxels";

/**
 * The small things on the ground (IMPL-0035; `groundDetail.ts`): baked into one mesh per piece of ground, the
 * pieces of `Ground`, so the camera draws the detail of the stretch it sees. Casts no shadow: a blade of grass
 * would cost a shadow pass for nothing anyone sees.
 */
export function GroundDetail() {
  const pieces = useMemo(() => {
    const byPiece = Array.from({ length: GROUND_SECTORS + 1 }, () => new Map<DetailKind, MergeItem>());
    for (const d of groundDetail(Math.floor(WORLD_RADIUS))) {
      const piece = byPiece[groundPiece([d.x, d.x, d.z, ""])];
      let item = piece.get(d.kind);
      if (!item) piece.set(d.kind, (item = { voxels: DETAIL_MODELS[d.kind], size: DETAIL_VOXEL, placements: [] }));
      item.placements.push({ x: d.x, z: d.z, rot: d.rot });
    }
    return byPiece.filter((p) => p.size > 0).map((p) => mergeVoxelModels([...p.values()]));
  }, []);
  return (
    <group>
      {pieces.map((geometries, i) => (
        <MergedVoxels key={i} geometries={geometries} castShadow={false} />
      ))}
    </group>
  );
}
