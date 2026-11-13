import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CircleGeometry, type Group, type Mesh, MeshBasicMaterial, ShaderMaterial, Vector3 } from "three";

import { U } from "./environment/materials";
import { probe } from "../game/devtools";
import { events } from "../game/events";
import { MOTION, STEP } from "@vila/shared/game/motion";
import { createNavField, planRoute, stepWalk } from "@vila/shared/game/navigation";
import { QUESTS, questProgress, questState } from "@vila/shared/game/quests";
import { sim, walkRoute } from "../game/sim";
import { questsEnabled, useQuestsEnabled } from "../game/questsFlag";
import { pickNearby } from "../game/nearby";
import { type Nearby, useVila } from "../game/store";
import { attachZoomGestures } from "../lib/zoom-gestures";
import { GIFTS, INTERACT_DISTANCE, QUEST_SPAWNS, surfaceAt, TREE_RADIUS } from "@vila/shared/game/world";
import { usePreset } from "../environment/settings";
import { AVATAR_SIZE, avatarParts, HIP_Y, SHOULDER_Y, walkLift, walkSwing } from "./models";
import { avatarHidden, clearSkyOffset, type Offset } from "./occlusion";
import { sceneBuildings, sceneColliders, sceneOccluders } from "./sceneColliders";
import { Voxels } from "./Voxels";

/** Top-down diagonal camera (study; final angle is card G12). */
const CAMERA_OFFSET = new Vector3(0, 24, 21);
/**
 * "Look at the sky" view (PROPOSAL): low behind the avatar, looking up over the village. The first offset is
 * that view; the others rise over the roofs and are used only where a building stands on the first one's view
 * (a residential street: `clearSkyOffset`), so the sky is seen from every street.
 */
const SKY_OFFSETS: readonly Offset[] = [
  { x: 0, y: 2.6, z: 10 },
  { x: 0, y: 5.5, z: 10 },
  { x: 0, y: 8.5, z: 10 },
  { x: 0, y: 11.5, z: 10 },
  { x: 0, y: 14.5, z: 7 },
];
const SKY_LOOK = { x: 0, y: 30, z: -40 } as const;
/** The camera leads the avatar slightly in the walking direction (seconds of velocity). */
const LOOK_AHEAD = 0.22;
const GIFT_RADIUS = 1.4;
/**
 * See-through tint of the avatar (IMPL-0024): the camera looks north from above, so a chalet south of a street
 * hides whoever walks behind it. While the camera cannot see the avatar's chest or its head (`avatarHidden`:
 * a real line from the camera to each, against the chalets, the shops, the tree and the pines), the avatar is
 * drawn once more over everything, in its own colours and half transparent, so it stays readable as itself.
 * Never shown in the open, and not when only the feet are behind something.
 */
const SEE_THROUGH = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.72, depthTest: false, depthWrite: false, fog: false });
/** The avatar moved this far (u) since the last look: look again. */
const LOOK_AGAIN = 0.2;
/**
 * …or the camera moved at all (it eases to its place for a second after the avatar stops, and the answer must
 * be the one for where it comes to rest). One look is a couple of microseconds.
 */
const CAMERA_MOVED = 0.01;

const blobVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const blobFragment = /* glsl */ `
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.25, 1.0, d)) * uOpacity;
  gl_FragColor = vec4(0.12, 0.16, 0.24, a);
}
`;

/**
 * The avatar: click/tap target → route around the colliders (`navigation.ts`, planned once per click) →
 * fixed-step simulation (`motion.ts`, 60 Hz) → interpolated render pose → walk animation, contact shadow and
 * camera. Gameplay facts (footsteps, gifts) go out on the event bus. `published` = ids of the lots with a
 * published chalet, joined by commas: with the quests flag it decides the colliders (`sceneColliders`).
 */
export function Player({ published }: { published: string }) {
  const root = useRef<Group>(null);
  const rig = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const limbs = useRef<Array<Group | null>>([]);
  const blob = useRef<Mesh>(null);
  const clock = useRef({ acc: 0, px: sim.body.x, pz: sim.body.z, pyaw: sim.body.yaw, walk: 0, lean: 0, speed: 0 });
  const look = useMemo(() => new Vector3(), []);
  const aim = useMemo(() => new Vector3(sim.pose.x, 1, sim.pose.z), []);
  const goal = useMemo(() => new Vector3(), []);
  const ahead = useMemo(() => new Vector3(), []);
  const camera = useThree((s) => s.camera);
  const canvas = useThree((s) => s.gl.domElement);
  // Portrait (phones): pull the camera back so the same plaza width fits.
  const fit = useThree((s) => Math.min(1.8, Math.max(1, 1.3 / (s.size.width / s.size.height))));
  const avatarLook = useVila((s) => s.look);
  const parts = useMemo(() => avatarParts(avatarLook), [avatarLook]);
  const { shadows } = usePreset();
  // Quest NPCs and the lectern block the avatar only while they are drawn (PROPOSTA quests-v1).
  const questsOn = useQuestsEnabled();
  const houses = useMemo(() => new Set(published.split(",").filter(Boolean)), [published]);
  const colliders = useMemo(() => sceneColliders(houses, questsOn), [houses, questsOn]);
  // What can hide the avatar from the camera. A new set is looked at afresh (`x: Infinity`).
  const occluders = useMemo(() => sceneOccluders(houses), [houses]);
  // The sky camera minds the buildings only: the tree and the pines belong in its picture.
  const buildings = useMemo(() => sceneBuildings(houses), [houses]);
  const outline = useRef<Array<Group | null>>([]);
  const hidden = useRef({ x: Infinity, z: Infinity, cx: 0, cy: 0, cz: 0, on: false });
  const sky = useRef<{ x: number; z: number; offset: Offset }>({ x: Infinity, z: Infinity, offset: SKY_OFFSETS[0] });
  useEffect(() => {
    hidden.current.x = Infinity;
    sky.current.x = Infinity;
  }, [occluders]);
  const near = useRef<Nearby>(null);
  // The navigation field follows the collider set (rebuilt only when a house or the quests flag changes).
  const field = useMemo(() => createNavField(colliders), [colliders]);
  useEffect(() => {
    sim.nav = field;
    const { body, route } = sim;
    if (route.active) {
      // The scenery changed under a walk in progress: plan it again and move the marker with it.
      planRoute(field, route, body.x, body.z, route.x, route.z);
      useVila.setState({ target: { x: route.x, z: route.z } });
    }
    return () => void (sim.nav === field && (sim.nav = null));
  }, [field]);
  const blobMaterial = useMemo(
    () => new ShaderMaterial({ vertexShader: blobVertex, fragmentShader: blobFragment, transparent: true, depthWrite: false, uniforms: { uOpacity: { value: 0.3 } } }),
    []
  );
  const blobGeometry = useMemo(() => new CircleGeometry(0.55, 20).rotateX(-Math.PI / 2), []);
  useEffect(() => () => (blobMaterial.dispose(), blobGeometry.dispose()), [blobMaterial, blobGeometry]);

  // Dev hooks only (`game/devtools.ts`): where a point of the world is on the screen, for the verify scripts.
  useEffect(() => {
    const v = new Vector3();
    probe.project = (x, y, z) => {
      v.set(x, y, z).project(camera);
      const r = canvas.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    };
    return () => void (probe.project = null);
  }, [camera, canvas]);

  // Zoom: mouse wheel and two-finger pinch on the canvas (`lib/zoom-gestures.ts`), only while nothing is open
  // over the village. The scene is ready from here on: the line that says how to walk starts counting.
  useEffect(() => {
    const vila = () => useVila.getState();
    vila().sceneUp();
    return attachZoomGestures(canvas, window, {
      idle: () => vila().panel.kind === "none" && vila().menu === null,
      zoomBy: (factor) => vila().zoomBy(factor),
      stopWalk: () => vila().setTarget(null),
    });
  }, [canvas]);

  useFrame(({ clock: three }, frameDt) => {
    const g = root.current;
    if (!g) return;
    const s = useVila.getState();
    const c = clock.current;
    const b = sim.body;
    const quests = questsEnabled();

    // ---- simulation: fixed steps, independent of the display refresh rate. An open panel pauses the walk;
    // the game menu does not (`walkRoute`).
    const route = walkRoute(s);
    c.acc += Math.min(frameDt, 0.1);
    while (c.acc >= STEP) {
      c.acc -= STEP;
      c.px = b.x;
      c.pz = b.z;
      c.pyaw = b.yaw;
      const r = stepWalk(b, route, field, colliders);
      if (r.targetDone) s.setTarget(null);
      if (r.step) {
        events.emit({ type: "step", x: b.x, z: b.z, yaw: b.yaw, left: b.leftFoot, surface: surfaceAt(b.x, b.z), speed: Math.hypot(b.vx, b.vz) });
      }
      // Gifts: collected by proximity ("explore" track). Remaining gifts vanish once the mission is done.
      const progress = useVila.getState().progress;
      if (!progress.completed["explore-gifts"]) {
        for (const gift of GIFTS) {
          if (progress.seen[`explore-gifts:${gift.id}`]) continue;
          if (Math.hypot(gift.x - b.x, gift.z - b.z) >= GIFT_RADIUS) continue;
          events.emit({ type: "gift", x: gift.x, z: gift.z });
          s.record("explore-gifts", gift.id);
        }
      }
      // Quest pickups and the tree visit (PROPOSTA quests-v1): only while their quest is active.
      if (quests) {
        for (const spawn of QUEST_SPAWNS) {
          if (progress.seen[`${spawn.questId}:${spawn.id}`] || questState(progress, spawn.questId) !== "active") continue;
          if (Math.hypot(spawn.x - b.x, spawn.z - b.z) >= GIFT_RADIUS) continue;
          events.emit({ type: "gift", x: spawn.x, z: spawn.z });
          s.record(spawn.questId, spawn.id);
          const { count, target } = questProgress(useVila.getState().progress, spawn.questId);
          s.notify(`${QUESTS.find((q) => q.id === spawn.questId)?.objectName ?? "Item"} recolhido (${count}/${target})`);
        }
        if (
          questState(progress, "tree-promise-visit") === "active" &&
          !progress.seen["tree-promise-visit:tree"] &&
          Math.hypot(b.x, b.z) < TREE_RADIUS + INTERACT_DISTANCE
        ) {
          s.record("tree-promise-visit", "tree");
          s.notify("Você visitou a grande árvore · Volte a Dona Guida.");
        }
      }
    }

    // ---- render pose: interpolate between the last two steps (smooth at any refresh rate).
    const alpha = c.acc / STEP;
    const pose = sim.pose;
    pose.x = c.px + (b.x - c.px) * alpha;
    pose.z = c.pz + (b.z - c.pz) * alpha;
    pose.yaw = c.pyaw + (b.yaw - c.pyaw) * alpha;
    pose.speed = Math.hypot(b.vx, b.vz);
    g.position.set(pose.x, 0, pose.z);
    g.rotation.y = pose.yaw;

    // ---- walk cycle: driven by distance (feet never skate), breathing when idle.
    const dt = Math.min(frameDt, 0.05);
    const run = Math.min(pose.speed / MOTION.maxSpeed, 1);
    c.walk += (pose.speed * dt) / MOTION.stride * Math.PI;
    const accel = (pose.speed - c.speed) / Math.max(dt, 1e-3);
    c.speed = pose.speed;
    c.lean += (Math.max(-0.12, Math.min(0.2, 0.1 * run + accel * 0.006)) - c.lean) * (1 - Math.exp(-10 * dt));
    const swing = walkSwing(c.walk, run);
    const [legL, legR, armL, armR] = limbs.current;
    if (legL && legR && armL && armR) {
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.8;
      armR.rotation.x = swing * 0.8;
    }
    // The whole figure bobs (feet leave the ground at mid-stride) and leans like a toy about its feet.
    const lift = walkLift(c.walk, run);
    if (rig.current) {
      rig.current.position.y = lift;
      rig.current.rotation.x = c.lean;
    }
    if (torso.current) {
      const breathe = (1 - run) * Math.sin(three.elapsedTime * 2.2) * 0.012 * U.uMotion.value;
      torso.current.scale.set(1, 1 + breathe, 1);
    }
    if (blob.current) {
      blob.current.scale.setScalar(1 - lift * 1.5);
      blobMaterial.uniforms.uOpacity.value = (shadows ? 0.2 : 0.34) * (1 - lift * 2);
    }

    // ---- closest interaction (`game/nearby.ts`): one target, one action button. A residential plot is offered
    // only standing still, and the target on offer is held across the edge of its reach.
    near.current = pickNearby(pose.x, pose.z, pose.speed, quests, useVila.getState().progress, near.current);
    s.setNearby(near.current);

    // ---- see-through tint: shown while the camera cannot see the avatar's chest or head. Looked at again only
    // when the avatar or the camera has moved: never while both are at rest.
    const h = hidden.current;
    const eye = camera.position;
    if (Math.abs(pose.x - h.x) + Math.abs(pose.z - h.z) > LOOK_AGAIN || Math.abs(eye.x - h.cx) + Math.abs(eye.y - h.cy) + Math.abs(eye.z - h.cz) > CAMERA_MOVED) {
      h.x = pose.x;
      h.z = pose.z;
      h.cx = eye.x;
      h.cy = eye.y;
      h.cz = eye.z;
      h.on = avatarHidden(occluders, eye.x, eye.y, eye.z, pose.x, pose.z);
    }
    const show = h.on && !s.skyView;
    for (const o of outline.current) if (o && o.visible !== show) o.visible = show;
    sim.view.seeThrough = show;

    // ---- camera: eased follow with a small look-ahead along the velocity.
    ahead.lerp(goal.set(b.vx, 0, b.vz).multiplyScalar(LOOK_AHEAD * U.uMotion.value), 1 - Math.exp(-3 * dt));
    look.set(pose.x, 1, pose.z).add(ahead);
    const k = 1 - Math.exp(-(s.skyView ? 2 : 4) * dt);
    if (s.skyView) {
      // Where a building stands on the low view, the camera rises over the roofs (looked at once per spot).
      const v = sky.current;
      if (Math.abs(pose.x - v.x) + Math.abs(pose.z - v.z) > LOOK_AGAIN) {
        v.x = pose.x;
        v.z = pose.z;
        v.offset = clearSkyOffset(buildings, pose.x, pose.z, SKY_OFFSETS, SKY_LOOK);
      }
      goal.set(look.x + v.offset.x, look.y + v.offset.y, look.z + v.offset.z);
      sim.view.skyHeight = v.offset.y;
    } else {
      goal.copy(look).addScaledVector(CAMERA_OFFSET, fit * s.zoom);
      sim.view.skyHeight = 0;
    }
    camera.position.lerp(goal, k);
    // The aim point eases too, so switching views pans smoothly instead of snapping.
    aim.lerp(s.skyView ? goal.set(look.x + SKY_LOOK.x, look.y + SKY_LOOK.y, look.z + SKY_LOOK.z) : look, k);
    camera.lookAt(aim);
  });

  const limb = (i: number) => (el: Group | null) => void (limbs.current[i] = el);
  /** The see-through tint of one part: a second drawing of the same voxels, inside the part's own animated group. */
  const ghost = (i: number, voxels: typeof parts.body) => (
    <group ref={(el) => void (outline.current[i] = el)} visible={false}>
      <Voxels voxels={voxels} size={AVATAR_SIZE} material={SEE_THROUGH} castShadow={false} />
    </group>
  );
  return (
    <>
      <group ref={root} position={[sim.pose.x, 0, sim.pose.z]}>
        <group ref={rig}>
        <group ref={torso}>
          <Voxels voxels={parts.body} size={AVATAR_SIZE} />
          {ghost(0, parts.body)}
          <group ref={limb(2)} position={[-2 * AVATAR_SIZE, SHOULDER_Y, 0]}>
            <Voxels voxels={parts.armL} size={AVATAR_SIZE} />
            {ghost(1, parts.armL)}
          </group>
          <group ref={limb(3)} position={[2 * AVATAR_SIZE, SHOULDER_Y, 0]}>
            <Voxels voxels={parts.armR} size={AVATAR_SIZE} />
            {ghost(2, parts.armR)}
          </group>
        </group>
        <group ref={limb(0)} position={[-AVATAR_SIZE, HIP_Y, 0]}>
          <Voxels voxels={parts.legL} size={AVATAR_SIZE} />
          {ghost(3, parts.legL)}
        </group>
        <group ref={limb(1)} position={[AVATAR_SIZE, HIP_Y, 0]}>
          <Voxels voxels={parts.legR} size={AVATAR_SIZE} />
          {ghost(4, parts.legR)}
        </group>
        </group>
        <mesh ref={blob} geometry={blobGeometry} material={blobMaterial} position-y={0.03} renderOrder={1} />
      </group>
    </>
  );
}
