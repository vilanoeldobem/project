import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, type InstancedMesh, type Mesh, MeshBasicMaterial, Object3D } from "three";

import { isPerson, LIFE, LIFE_CAST } from "@vila/shared/game/life";

import { env } from "../environment/runtime";
import { useEnvSettings, usePreset, useQuality } from "../environment/settings";
import { life, LIFE_COUNT, tapCharacter, tickLife } from "../game/village-life";
import { castRig } from "./gen/cast";
import { buildCast, packVisible } from "./life/castGeometry";
import { LIFE_TEXTURE_WIDTH, lifeMaterials, lifeTexture } from "./life/lifeMaterial";

const tint = new Color();
const toLinear = (css: string): [number, number, number] => {
  tint.set(css);
  return [tint.r, tint.g, tint.b];
};
const dummy = new Object3D();
/** A material that draws nothing: the boxes a click is tested against are never rendered. */
const UNSEEN = new MeshBasicMaterial({ visible: false });
const UNIT_BOX = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

/**
 * The village's characters and animals (IMPL-0025, PROPOSTA): the whole cast in **one draw call** (two with its
 * shadow), whoever is near.
 *
 * - One mesh holds every character (`castGeometry.ts`); a vertex shader places each from a row of a data
 *   texture written here once per frame (`lifeMaterial.ts`). Limbs, heads and tails are rigid parts turned
 *   about a pivot, the way the avatar walks.
 * - Only characters near the avatar are drawn: the index buffer is rewritten when that set changes (with
 *   hysteresis, so nobody flickers on the edge), and holds no triangle of anyone else.
 * - Where they are comes from the shared simulation (`game/village-life.ts`); they are not obstacles and they
 *   are not in the camera's occlusion test (a villager is too small to hide the avatar).
 * - A click on a person walks the avatar to it or, from talking distance, opens its few lines (`tapCharacter`).
 *   The boxes that take the click are invisible and cost no draw call, and they answer the click only: the
 *   press goes on to the ground under them, which decides first (`pressScene`, `game/clicks.ts`). So in
 *   moderation mode a press on another visitor's avatar picks that visitor, with a character in front or
 *   behind, and that press neither walks to the character nor talks with it.
 */
export function VillageLife() {
  const on = useEnvSettings((s) => s.characters);
  const quality = useQuality();
  const { shadows } = usePreset();
  const mesh = useRef<Mesh>(null);
  const picks = useRef<InstancedMesh>(null);
  const version = useRef(-1);

  const cast = useMemo(() => {
    const rigs = LIFE_CAST.map((c) => castRig(c.kind, c.seed));
    const buffers = buildCast(rigs, toLinear);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(buffers.positions, 3));
    geometry.setAttribute("normal", new BufferAttribute(buffers.normals, 3));
    geometry.setAttribute("color", new BufferAttribute(buffers.colors, 3));
    geometry.setAttribute("aRig", new BufferAttribute(buffers.rig, 4));
    geometry.setAttribute("aAnim", new BufferAttribute(buffers.anim, 3));
    geometry.setIndex(new BufferAttribute(new Uint32Array(buffers.indices.length), 1));
    geometry.setDrawRange(0, 0);
    const texture = lifeTexture(LIFE.maxPopulation);
    return { rigs, buffers, geometry, texture, ...lifeMaterials(texture) };
  }, []);
  useEffect(
    () => () => {
      cast.geometry.dispose();
      cast.texture.dispose();
      cast.surface.dispose();
      cast.depth.dispose();
    },
    [cast]
  );
  useEffect(() => {
    life.on = on;
    return () => void (life.on = false);
  }, [on]);

  // Before the avatar's frame (`Player`), which asks who is near: the environment frame is already this frame's.
  useFrame((_, frameDt) => {
    const calm = useEnvSettings.getState().reduceMotion;
    tickLife(env.frame.timestampMs, env.frame.worldSeconds, Math.min(frameDt, 0.1), quality, calm);
    const m = mesh.current;
    if (!m) return;
    const data = cast.texture.image.data as Float32Array;
    const proxies = picks.current;
    let shown = 0;
    for (let i = 0; i < LIFE_COUNT; i++) {
      if (!life.visible[i]) continue;
      const o = i * LIFE_TEXTURE_WIDTH * 4;
      data[o] = life.x[i];
      data[o + 1] = life.y[i];
      data[o + 2] = life.z[i];
      data[o + 3] = life.yaw[i];
      data[o + 4] = life.swing[i];
      data[o + 5] = life.first[i];
      data[o + 6] = life.second[i];
      data[o + 7] = life.scale[i];
      data[o + 8] = life.lean[i];
      data[o + 9] = life.prop[i];
      data[o + 10] = i * 1.7;
      data[o + 11] = cast.rigs[i].shadow ? 1 : 0;
      // The box a click is tested against: people only (animals are not talked to; a click there walks).
      if (proxies && isPerson(LIFE_CAST[i].kind)) {
        dummy.position.set(life.x[i], life.y[i], life.z[i]);
        dummy.rotation.set(0, life.yaw[i], 0);
        dummy.scale.set(1.3, cast.rigs[i].height, 1);
        dummy.updateMatrix();
        proxies.setMatrixAt(shown, dummy.matrix);
        proxyOf[shown++] = i;
      }
    }
    cast.texture.needsUpdate = true;
    if (proxies) {
      proxies.count = shown;
      proxies.instanceMatrix.needsUpdate = true;
      proxies.boundingSphere = null;
    }
    if (version.current !== life.version) {
      version.current = life.version;
      const index = cast.geometry.index!;
      cast.geometry.setDrawRange(0, packVisible(cast.buffers, life.visible, index.array as Uint32Array));
      index.needsUpdate = true;
    }
    m.visible = life.drawn > 0;
  }, -1);

  const proxyOf = useMemo(() => new Int16Array(LIFE.maxPopulation), []);
  const character = (e: ThreeEvent<MouseEvent>) => (e.instanceId === undefined || e.instanceId >= (picks.current?.count ?? 0) ? -1 : proxyOf[e.instanceId]);

  return (
    <>
      <mesh ref={mesh} geometry={cast.geometry} material={cast.surface} customDepthMaterial={cast.depth} castShadow={shadows} receiveShadow frustumCulled={false} visible={false} />
      <instancedMesh
        ref={picks}
        args={[UNIT_BOX, UNSEEN, LIFE.maxPopulation]}
        frustumCulled={false}
        onClick={(e) => {
          const i = character(e);
          if (i < 0) return;
          e.stopPropagation();
          tapCharacter(i);
        }}
      />
    </>
  );
}
