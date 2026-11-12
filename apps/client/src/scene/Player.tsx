import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CircleGeometry, type Group, type Mesh, ShaderMaterial, Vector3 } from "three";

import { U } from "./environment/materials";
import { events } from "../game/events";
import { type Collider, MOTION, STEP } from "@vila/shared/game/motion";
import { createNavField, planRoute, stepWalk } from "@vila/shared/game/navigation";
import { QUESTS, questProgress, questState } from "@vila/shared/game/quests";
import { sim } from "../game/sim";
import { questsEnabled, useQuestsEnabled } from "../game/questsFlag";
import { type Nearby, useVila } from "../game/store";
import {
  DONATION_PANEL,
  GIFTS,
  INTERACT_DISTANCE,
  LOT_INTERACT_DISTANCE,
  LOTS,
  NPCS,
  OBSTACLES,
  QUEST_INTERACTIONS,
  QUEST_OBSTACLES,
  QUEST_SPAWNS,
  surfaceAt,
  TREE_RADIUS,
} from "@vila/shared/game/world";
import { usePreset } from "../environment/settings";
import { AVATAR_SIZE, avatarParts, HIP_Y, SHOULDER_Y, walkLift, walkSwing } from "./models";
import { Voxels } from "./Voxels";

/** Top-down diagonal camera (study; final angle is card G12). */
const CAMERA_OFFSET = new Vector3(0, 24, 21);
/** "Look at the sky" view: low behind the avatar, looking up over the village (PROPOSAL). */
const SKY_OFFSET = new Vector3(0, 2.6, 10);
const SKY_LOOK = new Vector3(0, 30, -40);
/** The camera leads the avatar slightly in the walking direction (seconds of velocity). */
const LOOK_AHEAD = 0.22;
const GIFT_RADIUS = 1.4;
/** Interaction targets, built once: the frame loop only picks one of them (no per-frame allocation). */
const NEAR_NPC: Nearby[] = NPCS.map((n) => ({ kind: "npc", npcId: n.id }));
const NEAR_QUEST: Nearby[] = QUEST_INTERACTIONS.map((i) => ({ kind: "quest", interactionId: i.id }));
const NEAR_LOT: Nearby[] = LOTS.map((l) => ({ kind: "lot", lotId: l.id }));
const NEAR_PANEL: Nearby = { kind: "donation-panel" };
const NEAR_TREE: Nearby = { kind: "tree" };
/** Smallest centre distance wins; targets within 0.5 of each other fall back to the priority order. */
const beats = (dist: number, prio: number, best: Nearby, bestDist: number, bestPrio: number) =>
  !best || dist < bestDist - 0.5 || (dist - bestDist <= 0.5 && prio < bestPrio);
/** Mouse wheel and pinch sensitivity (zoom factor per pixel of wheel delta). */
const WHEEL_ZOOM = 0.0015;

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
 * camera. Gameplay facts (footsteps, gifts) go out on the event bus. `lots` = colliders of the eight lots.
 */
export function Player({ lots }: { lots: Collider[] }) {
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
  const colliders = useMemo(() => [...OBSTACLES, ...(questsOn ? QUEST_OBSTACLES : []), ...lots], [lots, questsOn]);
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

  // Zoom: mouse wheel and two-finger pinch on the canvas (movement is click/tap only).
  useEffect(() => {
    const idle = () => useVila.getState().panel.kind === "none";
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (idle()) useVila.getState().zoomBy(Math.exp(e.deltaY * WHEEL_ZOOM));
    };
    const touches = new Map<number, { x: number; y: number }>();
    let span = 0;
    const spread = () => {
      const [a, b] = [...touches.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        span = spread();
        useVila.getState().setTarget(null);
      }
    };
    const move = (e: PointerEvent) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size !== 2 || span <= 0 || !idle()) return;
      const d = spread();
      if (d > 0) useVila.getState().zoomBy(span / d);
      span = d;
    };
    const up = (e: PointerEvent) => {
      touches.delete(e.pointerId);
      span = 0;
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [canvas]);

  useFrame(({ clock: three }, frameDt) => {
    const g = root.current;
    if (!g) return;
    const s = useVila.getState();
    const c = clock.current;
    const b = sim.body;
    const quests = questsEnabled();

    // ---- simulation: fixed steps, independent of the display refresh rate. An open panel pauses the walk.
    const route = s.panel.kind === "none" ? sim.route : null;
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

    // ---- closest interaction: NPC, quest interaction, donation lectern, tree, then lot (see `beats`).
    let best: Nearby = null;
    let bestDist = 0;
    let bestPrio = 0;
    if (quests) {
      const live = useVila.getState().progress;
      for (let i = 0; i < NPCS.length; i++) {
        const dist = Math.hypot(NPCS[i].x - pose.x, NPCS[i].z - pose.z);
        if (dist < INTERACT_DISTANCE && beats(dist, 1, best, bestDist, bestPrio)) {
          best = NEAR_NPC[i];
          bestDist = dist;
          bestPrio = 1;
        }
      }
      for (let i = 0; i < QUEST_INTERACTIONS.length; i++) {
        const ia = QUEST_INTERACTIONS[i];
        if (live.seen[`${ia.questId}:${ia.id}`] || questState(live, ia.questId) !== "active") continue;
        const dist = Math.hypot(ia.x - pose.x, ia.z - pose.z);
        if (dist < ia.radius && beats(dist, 2, best, bestDist, bestPrio)) {
          best = NEAR_QUEST[i];
          bestDist = dist;
          bestPrio = 2;
        }
      }
      const panelDist = Math.hypot(DONATION_PANEL.x - pose.x, DONATION_PANEL.z - pose.z);
      if (panelDist < INTERACT_DISTANCE && beats(panelDist, 3, best, bestDist, bestPrio)) {
        best = NEAR_PANEL;
        bestDist = panelDist;
        bestPrio = 3;
      }
    }
    const treeDist = Math.hypot(pose.x, pose.z);
    if (treeDist < TREE_RADIUS + INTERACT_DISTANCE && beats(treeDist, 4, best, bestDist, bestPrio)) {
      best = NEAR_TREE;
      bestDist = treeDist;
      bestPrio = 4;
    }
    // Lots are far apart: at most one is within reach, and the first match is enough.
    for (let i = 0; i < LOTS.length; i++) {
      const dist = Math.hypot(LOTS[i].x - pose.x, LOTS[i].z - pose.z);
      if (dist >= LOT_INTERACT_DISTANCE) continue;
      if (beats(dist, 5, best, bestDist, bestPrio)) best = NEAR_LOT[i];
      break;
    }
    s.setNearby(best);

    // ---- camera: eased follow with a small look-ahead along the velocity.
    ahead.lerp(goal.set(b.vx, 0, b.vz).multiplyScalar(LOOK_AHEAD * U.uMotion.value), 1 - Math.exp(-3 * dt));
    look.set(pose.x, 1, pose.z).add(ahead);
    const k = 1 - Math.exp(-(s.skyView ? 2 : 4) * dt);
    if (s.skyView) goal.copy(look).add(SKY_OFFSET);
    else goal.copy(look).addScaledVector(CAMERA_OFFSET, fit * s.zoom);
    camera.position.lerp(goal, k);
    // The aim point eases too, so switching views pans smoothly instead of snapping.
    aim.lerp(s.skyView ? goal.copy(look).add(SKY_LOOK) : look, k);
    camera.lookAt(aim);
  });

  const limb = (i: number) => (el: Group | null) => void (limbs.current[i] = el);
  return (
    <>
      <group ref={root} position={[sim.pose.x, 0, sim.pose.z]}>
        <group ref={rig}>
        <group ref={torso}>
          <Voxels voxels={parts.body} size={AVATAR_SIZE} />
          <group ref={limb(2)} position={[-2 * AVATAR_SIZE, SHOULDER_Y, 0]}>
            <Voxels voxels={parts.armL} size={AVATAR_SIZE} />
          </group>
          <group ref={limb(3)} position={[2 * AVATAR_SIZE, SHOULDER_Y, 0]}>
            <Voxels voxels={parts.armR} size={AVATAR_SIZE} />
          </group>
        </group>
        <group ref={limb(0)} position={[-AVATAR_SIZE, HIP_Y, 0]}>
          <Voxels voxels={parts.legL} size={AVATAR_SIZE} />
        </group>
        <group ref={limb(1)} position={[AVATAR_SIZE, HIP_Y, 0]}>
          <Voxels voxels={parts.legR} size={AVATAR_SIZE} />
        </group>
        </group>
        <mesh ref={blob} geometry={blobGeometry} material={blobMaterial} position-y={0.03} renderOrder={1} />
      </group>
    </>
  );
}
