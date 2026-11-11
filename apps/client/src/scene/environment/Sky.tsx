import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  type Group,
  type InstancedMesh,
  type Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from "three";

import { WEATHER_SEED } from "@vila/shared/environment/config";
import { env } from "../../environment/runtime";
import { mulberry32, random01 } from "@vila/shared/environment/random";
import { useEnvSettings } from "../../environment/settings";
import { linear, U } from "./materials";

const DOME = 170;

const domeVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const domeFragment = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSun;
varying vec3 vDir;
void main() {
  float h = vDir.y;
  vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(smoothstep(0.0, 0.65, h), 0.8)) : mix(uHorizon, uBottom, smoothstep(0.0, 0.12, -h));
  // Soft warm halo toward the key light (cartoon, no disc: the sun is suggested, not modelled).
  float halo = pow(max(dot(normalize(vDir), normalize(uSunDir)), 0.0), 24.0) * uSun;
  c += uSunColor * halo * 0.35;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;

const starVertex = /* glsl */ `
attribute float aPhase;
attribute float aSize;
uniform float uWorldTime;
uniform float uTwinkle;
varying float vTw;
void main() {
  vTw = mix(1.0, 0.55 + 0.45 * sin(uWorldTime * 1.2 + aPhase * 6.2831), uTwinkle);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize;
  gl_Position = projectionMatrix * mv;
}
`;

const starFragment = /* glsl */ `
uniform float uOpacity;
varying float vTw;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float a = (1.0 - smoothstep(0.15, 0.5, length(q))) * uOpacity * vTw;
  if (a < 0.01) discard;
  gl_FragColor = vec4(1.0, 0.97, 0.88, a);
  #include <colorspace_fragment>
}
`;

const moonFragment = /* glsl */ `
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec2 q = vUv - 0.5;
  float disc = 1.0 - smoothstep(0.30, 0.32, length(q));
  float bite = 1.0 - smoothstep(0.26, 0.28, length(q - vec2(0.13, 0.08)));
  float glow = (1.0 - smoothstep(0.0, 0.5, length(q))) * 0.25;
  float a = (max(disc - bite, 0.0) + glow) * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(1.0, 0.95, 0.8), a);
  #include <colorspace_fragment>
}
`;

const auroraVertex = /* glsl */ `
uniform float uTime;
uniform float uMotion;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  p.z += sin(uv.x * 9.0 + uTime * 0.25 * uMotion) * 6.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const auroraFragment = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uMotion;
varying vec2 vUv;
void main() {
  float curtain = 0.6 + 0.4 * sin(vUv.x * 40.0 + uTime * 0.6 * uMotion) * sin(vUv.x * 13.0 - uTime * 0.2 * uMotion);
  float v = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
  float ends = smoothstep(0.0, 0.15, vUv.x) * (1.0 - smoothstep(0.85, 1.0, vUv.x));
  vec3 c = mix(vec3(0.25, 1.0, 0.65), vec3(0.6, 0.4, 1.0), smoothstep(0.3, 1.0, vUv.y));
  float a = curtain * v * ends * uOpacity * 0.55;
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}
`;

function starGeometry() {
  const rnd = mulberry32(0x57a25);
  const n = 700;
  const pos = new Float32Array(n * 3), phase = new Float32Array(n), size = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const az = rnd() * Math.PI * 2;
    const el = Math.asin(0.08 + 0.92 * rnd()); // upper hemisphere only
    const r = DOME - 8;
    pos.set([Math.cos(el) * Math.cos(az) * r, Math.sin(el) * r, Math.cos(el) * Math.sin(az) * r], i * 3);
    phase[i] = rnd();
    size[i] = 1.5 + rnd() * rnd() * 3.5;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("aPhase", new BufferAttribute(phase, 1));
  g.setAttribute("aSize", new BufferAttribute(size, 1));
  return g;
}

/** Voxel cloud clusters (one instanced draw). Shown in order up to the shared `cloudCover`. */
const CLOUDS = 14;
const PUFFS_PER_CLOUD = 9;

function cloudLayout() {
  const rnd = mulberry32(0xc10d);
  const out: Array<{ cloud: number; x: number; y: number; z: number; s: number }> = [];
  for (let c = 0; c < CLOUDS; c++) {
    const a = rnd() * Math.PI * 2, r = 60 + rnd() * 90, y = 62 + rnd() * 26;
    for (let k = 0; k < PUFFS_PER_CLOUD; k++)
      out.push({ cloud: c, x: Math.cos(a) * r + (rnd() - 0.5) * 14, y: y + (rnd() - 0.5) * 3, z: Math.sin(a) * r + (rnd() - 0.5) * 6, s: 3 + rnd() * 4 });
  }
  return out;
}

const dummy = new Object3D();

/**
 * Procedural sky (spec §10.1): gradient dome by real SP time, seeded stars, cartoon moon, voxel clouds,
 * rare deterministic shooting stars and an aurora on event nights/clear nights. Follows the camera so
 * it always reads as infinitely far. Visible from the "look at the sky" view; the gameplay camera
 * looks down at the village.
 */
export function Sky() {
  const root = useRef<Group>(null);
  const moon = useRef<Mesh>(null);
  const shooting = useRef<Mesh>(null);
  const clouds = useRef<InstancedMesh>(null);
  const cloudGroup = useRef<Group>(null);
  const layout = useMemo(cloudLayout, []);
  const drift = useRef(new Vector3());

  const mats = useMemo(
    () => ({
      dome: new ShaderMaterial({
        vertexShader: domeVertex,
        fragmentShader: domeFragment,
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new Vector3() },
          uHorizon: { value: new Vector3() },
          uBottom: { value: new Vector3() },
          uSunDir: { value: new Vector3(0, 1, 0) },
          uSunColor: { value: new Vector3(1, 1, 1) },
          uSun: { value: 0 },
        },
      }),
      stars: new ShaderMaterial({
        vertexShader: starVertex,
        fragmentShader: starFragment,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        fog: false,
        uniforms: { uWorldTime: U.uWorldTime, uTwinkle: U.uTwinkle, uOpacity: { value: 0 } },
      }),
      moon: new ShaderMaterial({
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: moonFragment,
        transparent: true,
        depthWrite: false,
        fog: false,
        uniforms: { uOpacity: { value: 0 } },
      }),
      aurora: new ShaderMaterial({
        vertexShader: auroraVertex,
        fragmentShader: auroraFragment,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: 2,
        fog: false,
        uniforms: { uTime: U.uTime, uMotion: U.uMotion, uOpacity: { value: 0 } },
      }),
      shooting: new ShaderMaterial({
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader:
          "uniform float uOpacity; varying vec2 vUv; void main(){ float a = vUv.x * (1.0 - abs(vUv.y - 0.5) * 2.0) * uOpacity; gl_FragColor = vec4(1.0, 0.95, 0.85, a); }",
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        fog: false,
        uniforms: { uOpacity: { value: 0 } },
      }),
      cloud: new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85, fog: false }),
    }),
    []
  );
  const stars = useMemo(starGeometry, []);
  const auroraGeo = useMemo(() => new PlaneGeometry(150, 34, 64, 1), []);

  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose());
      stars.dispose();
      auroraGeo.dispose();
    },
    [mats, stars, auroraGeo]
  );

  useEffect(() => {
    const mesh = clouds.current;
    if (!mesh) return;
    layout.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.set(p.s * 1.6, p.s * 0.7, p.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [layout]);

  useFrame(({ camera }, dt) => {
    const f = env.frame;
    const { look, weather } = f;
    const settings = useEnvSettings.getState();
    root.current?.position.set(camera.position.x, 0, camera.position.z);

    const d = mats.dome.uniforms;
    d.uTop.value.set(...linear(look.skyTop));
    d.uHorizon.value.set(...linear(look.skyHorizon));
    d.uBottom.value.set(...linear(look.fogColor));
    d.uSunDir.value.set(...look.sunDirection);
    d.uSunColor.value.set(...linear(look.sunColor));
    d.uSun.value = look.sunIntensity;

    const dark = 1 - look.daylight;
    mats.stars.uniforms.uOpacity.value = look.stars;

    if (moon.current) {
      const [x, y, z] = look.sunDirection;
      // Artistic, not astronomical: high over the far side of the village, drifting along the night.
      moon.current.position.set(-x * 90, 75 + 25 * y, -135 + z * 10);
      moon.current.lookAt(camera.position.x, 0, camera.position.z);
      mats.moon.uniforms.uOpacity.value = Math.min(1, look.moonIntensity * 1.2) * (1 - 0.8 * weather.cloudCover);
    }

    mats.aurora.uniforms.uOpacity.value = weather.aurora * dark * dark * (1 - weather.cloudCover * 0.8);

    // Shooting star: deterministic per 2-minute window from the shared clock (rare, ~1 in 6 windows).
    const win = Math.floor(f.timestampMs / 120_000);
    const offset = random01(WEATHER_SEED, win, 9) * 100;
    const local = ((f.timestampMs / 1000) % 120) - offset;
    const show = random01(WEATHER_SEED, win, 8) < 0.17 && local >= 0 && local < 1.4 && !settings.reduceMotion;
    if (shooting.current) {
      const k = local / 1.4;
      const a = random01(WEATHER_SEED, win, 10) * Math.PI * 2;
      shooting.current.position.set(Math.cos(a) * 110 + k * 30, 95 - k * 18, Math.sin(a) * 110);
      shooting.current.rotation.set(0, -a, -0.5);
      mats.shooting.uniforms.uOpacity.value = show ? Math.sin(Math.PI * k) * look.stars : 0;
    }

    // Clouds drift with the shared wind; count follows cloud cover.
    if (clouds.current && cloudGroup.current) {
      const visible = Math.round(weather.cloudCover * CLOUDS) * PUFFS_PER_CLOUD;
      clouds.current.count = visible;
      const speed = (0.6 + 4 * weather.windStrength) * (settings.reduceMotion ? 0.3 : 1);
      drift.current.x = (drift.current.x + Math.cos(weather.windDirectionRad) * speed * dt) % 120;
      drift.current.z = (drift.current.z + Math.sin(weather.windDirectionRad) * speed * dt) % 120;
      cloudGroup.current.position.copy(drift.current);
      // Unlit, tinted from the sky: soft white by day, slate blue at night (never dark slabs).
      const lit = 0.25 + 0.75 * look.daylight;
      const [r, g, b] = linear(look.skyHorizon);
      mats.cloud.color.setRGB(r * (1 - lit) * 1.3 + lit * 0.95, g * (1 - lit) * 1.3 + lit * 0.96, b * (1 - lit) * 1.3 + lit * 1.0);
    }
  });

  return (
    <group ref={root}>
      <mesh material={mats.dome} renderOrder={-10} frustumCulled={false}>
        <sphereGeometry args={[DOME, 32, 16]} />
      </mesh>
      <points geometry={stars} material={mats.stars} renderOrder={-9} frustumCulled={false} />
      <mesh ref={moon} material={mats.moon} renderOrder={-8}>
        <planeGeometry args={[22, 22]} />
      </mesh>
      <mesh geometry={auroraGeo} material={mats.aurora} position={[0, 78, -120]} rotation={[0.35, 0, 0]} renderOrder={-7} frustumCulled={false} />
      <mesh ref={shooting} material={mats.shooting} renderOrder={-7} frustumCulled={false}>
        <planeGeometry args={[14, 0.5]} />
      </mesh>
      <group ref={cloudGroup}>
        <instancedMesh ref={clouds} args={[undefined, mats.cloud, layout.length]} frustumCulled={false} renderOrder={-6}>
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
      </group>
    </group>
  );
}
