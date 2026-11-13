import { useThree } from "@react-three/fiber";
import { type RefObject, useEffect } from "react";
import { type Group, Matrix4, type Mesh } from "three";

import { type CasterPart, castsShadow, keyShadow, viewPlanes } from "./shadowCasters";

/** A large static block: the meshes of it that cast a shadow by themselves, and the spheres around its parts. */
interface Block {
  meshes: Mesh[];
  parts: readonly CasterPart[];
}

const blocks = new Set<Block>();

/**
 * Registers a large static block (a row of chalets, a sector of the forest) with `ShadowCulling`: it stays
 * out of the shadow pass while none of its `parts` can cast a shadow that is seen (`shadowCasters.ts`). The
 * renderer's own test is one sphere around the whole block. Only the meshes of `group` that cast by themselves
 * are switched (`meshes` says when they change), nothing is done without `parts`, and what is drawn on screen
 * does not change.
 */
export function useShadowCasters(group: RefObject<Group | null>, parts: readonly CasterPart[] | undefined, meshes: unknown) {
  useEffect(() => {
    if (!parts || !group.current) return;
    const block: Block = { meshes: group.current.children.filter((child): child is Mesh => (child as Mesh).isMesh && child.castShadow), parts };
    blocks.add(block);
    return () => {
      blocks.delete(block);
      for (const mesh of block.meshes) mesh.castShadow = true;
    };
  }, [group, parts, meshes]);
}

const viewProjection = new Matrix4();
const planes = viewPlanes(viewProjection.elements);

/**
 * Decides, for every registered block, whether it is a shadow caster in the frame about to be drawn. Runs in
 * the scene's `onBeforeRender`: the renderer has just updated the camera and has not started the shadow pass,
 * so the test sees the camera and the light (`keyShadow`, set by `Lighting` in the same frame) exactly as the
 * frame is drawn with them, whatever the order of the frame callbacks. A few hundred sphere tests per frame.
 */
export function ShadowCulling() {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const before = scene.onBeforeRender;
    scene.onBeforeRender = (...args) => {
      before.apply(scene, args);
      // For a scene the renderer passes itself, the scene and the camera it is about to draw with.
      const camera = args[2];
      viewPlanes(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements, planes);
      for (const block of blocks) {
        const on = castsShadow(keyShadow, planes, block.parts);
        for (const mesh of block.meshes) if (mesh.castShadow !== on) mesh.castShadow = on;
      }
    };
    return () => {
      scene.onBeforeRender = before;
      for (const block of blocks) for (const mesh of block.meshes) mesh.castShadow = true;
    };
  }, [scene]);
  return null;
}
