import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CircleGeometry, type Group, type Mesh, ShaderMaterial, Vector3 } from "three";

import { U } from "./environment/materials";
import { events } from "../game/events";
import { type Collider, type Intent, MOTION, STEP, stepBody } from "../game/motion";
import { sim } from "../game/sim";
import { useVila } from "../game/store";
import { GIFTS, INTERACT_DISTANCE, LOTS, OBSTACLES, surfaceAt, TREE_RADIUS } from "../game/world";
import { usePreset } from "../environment/settings";
import { AVATAR_SIZE, avatarParts, HIP_Y, SHOULDER_Y } from "./models";
import { Voxels } from "./Voxels";

/** Top-down diagonal camera (study; final angle is card G12). */
const CAMERA_OFFSET = new Vector3(0, 24, 21);
/** "Look at the sky" view: low behind the avatar, looking up over the village (PROPOSAL). */
const SKY_OFFSET = new Vector3(0, 2.6, 10);
const SKY_LOOK = new Vector3(0, 30, -40);
/** The camera leads the avatar slightly in the walking direction (seconds of velocity). */
const LOOK_AHEAD = 0.22;
const GIFT_RADIUS = 1.4;
const KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};

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
 * The avatar: input → fixed-step simulation (`motion.ts`, 60 Hz) → interpolated render pose → walk
 * animation, contact shadow and camera. Gameplay facts (footsteps, gifts) go out on the event bus.
 */
export function Player({ houses }: { houses: Collider[] }) {
  const root = useRef<Group>(null);
  const rig = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const limbs = useRef<Array<Group | null>>([]);
  const blob = useRef<Mesh>(null);
  const pressed = useRef(new Set<string>());
  const clock = useRef({ acc: 0, px: sim.body.x, pz: sim.body.z, pyaw: sim.body.yaw, walk: 0, lean: 0, speed: 0 });
  const look = useMemo(() => new Vector3(), []);
  const aim = useMemo(() => new Vector3(sim.pose.x, 1, sim.pose.z), []);
  const goal = useMemo(() => new Vector3(), []);
  const ahead = useMemo(() => new Vector3(), []);
  const camera = useThree((s) => s.camera);
  // Portrait (phones): pull the camera back so the same plaza width fits.
  const zoom = useThree((s) => Math.min(1.8, Math.max(1, 1.3 / (s.size.width / s.size.height))));
  const parts = useMemo(avatarParts, []);
  const { shadows } = usePreset();
  const colliders = useMemo(() => [...OBSTACLES, ...houses], [houses]);
  const blobMaterial = useMemo(
    () => new ShaderMaterial({ vertexShader: blobVertex, fragmentShader: blobFragment, transparent: true, depthWrite: false, uniforms: { uOpacity: { value: 0.3 } } }),
    []
  );
  const blobGeometry = useMemo(() => new CircleGeometry(0.55, 20).rotateX(-Math.PI / 2), []);
  useEffect(() => () => (blobMaterial.dispose(), blobGeometry.dispose()), [blobMaterial, blobGeometry]);

  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const down = (e: KeyboardEvent) => {
      if (typing(e) || !(e.code in KEYS)) return;
      if (useVila.getState().panel.kind !== "none") return;
      e.preventDefault();
      pressed.current.add(e.code);
      useVila.getState().setTarget(null);
      useVila.getState().setSkyView(false);
    };
    const up = (e: KeyboardEvent) => pressed.current.delete(e.code);
    const blur = () => pressed.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  useFrame(({ clock: three }, frameDt) => {
    const g = root.current;
    if (!g) return;
    const s = useVila.getState();
    const c = clock.current;
    const b = sim.body;

    // ---- simulation: fixed steps, independent of the display refresh rate.
    const intent: Intent = { moveX: 0, moveZ: 0, target: null };
    if (s.panel.kind === "none") {
      for (const k of pressed.current) {
        intent.moveX += KEYS[k][0];
        intent.moveZ += KEYS[k][1];
      }
      intent.target = s.target;
    }
    c.acc += Math.min(frameDt, 0.1);
    while (c.acc >= STEP) {
      c.acc -= STEP;
      c.px = b.x;
      c.pz = b.z;
      c.pyaw = b.yaw;
      const r = stepBody(b, intent, colliders);
      if (r.targetDone && intent.target) {
        s.setTarget(null);
        intent.target = null;
      }
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
    const swing = Math.sin(c.walk) * 0.75 * run;
    const [legL, legR, armL, armR] = limbs.current;
    if (legL && legR && armL && armR) {
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.8;
      armR.rotation.x = swing * 0.8;
    }
    // The whole figure bobs (feet leave the ground at mid-stride) and leans like a toy about its feet.
    const lift = Math.abs(Math.sin(c.walk)) * 0.09 * run;
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

    // ---- closest interaction (tree or lot).
    if (Math.hypot(pose.x, pose.z) < TREE_RADIUS + INTERACT_DISTANCE) s.setNearby({ kind: "tree" });
    else {
      const lot = LOTS.find((l) => Math.hypot(l.x - pose.x, l.z - pose.z) < INTERACT_DISTANCE);
      s.setNearby(lot ? { kind: "lot", lotId: lot.id } : null);
    }

    // ---- camera: eased follow with a small look-ahead along the velocity.
    ahead.lerp(goal.set(b.vx, 0, b.vz).multiplyScalar(LOOK_AHEAD * U.uMotion.value), 1 - Math.exp(-3 * dt));
    look.set(pose.x, 1, pose.z).add(ahead);
    const k = 1 - Math.exp(-(s.skyView ? 2 : 4) * dt);
    if (s.skyView) goal.copy(look).add(SKY_OFFSET);
    else goal.copy(look).addScaledVector(CAMERA_OFFSET, zoom);
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
