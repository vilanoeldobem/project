/**
 * The test that keeps far blocks out of the shadow map (`shadowCasters.ts`) may never drop a caster the
 * renderer would have drawn into it: it is checked against three's own frustum test on the very camera the
 * key light uses, and the spheres are checked against the models they stand for.
 */
import { Frustum, Matrix4, OrthographicCamera, PerspectiveCamera, Sphere, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { mulberry32 } from "@vila/shared/environment/random";
import { type DressingKind, PLOT_TIERS, RESIDENTIAL_PLOTS } from "@vila/shared/game/world";

import { pine } from "./models";
import { CASTER_SLACK, type CasterPart, castsShadow, type KeyShadow, modelExtent, partAt, reachesShadowBox, SHADOW_BOX, shadowReachesView, viewPlanes } from "./shadowCasters";
import { dressingModel, residence } from "./villageModels";

/** The shadow camera as three sets it up for a directional light at `distance` from its target (`Lighting`). */
function lightFrustum(light: KeyShadow): Frustum {
  const { extent, distance, near, far } = SHADOW_BOX;
  const camera = new OrthographicCamera(-extent, extent, extent, -extent, near, far);
  camera.position.set(light.x + light.dx * distance, light.dy * distance, light.z + light.dz * distance);
  camera.lookAt(new Vector3(light.x, 0, light.z));
  camera.updateMatrixWorld();
  return new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
}

/**
 * The game camera behind and above the avatar at `(x, z)` (`Player`: offset (0, 24, 21) times the zoom, 40° of
 * vertical field of view, 1280 × 800), or looking somewhere else from somewhere else.
 */
function gameCamera(x: number, z: number, zoom = 1, from?: [number, number, number], at?: [number, number, number]) {
  const camera = new PerspectiveCamera(40, 1280 / 800, 0.5, 260);
  camera.position.set(...(from ?? [x, 24 * zoom, z + 21 * zoom]));
  camera.lookAt(new Vector3(...(at ?? [x, 1, z])));
  camera.updateMatrixWorld();
  const matrix = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  return { planes: viewPlanes(matrix.elements), frustum: new Frustum().setFromProjectionMatrix(matrix) };
}
/** A view that sees everything: the tests of the shadow box alone. */
const EVERYWHERE = viewPlanes(new Matrix4().makeScale(1e-6, 1e-6, 1e-6).elements);

const unit = (x: number, y: number, z: number) => {
  const n = Math.hypot(x, y, z);
  return { dx: x / n, dy: y / n, dz: z / n };
};
/** Sun low in the west, mid afternoon, near noon, low in the east, and the moon's side: as `sunDirection` gives them. */
const SUNS = [unit(-0.9, 0.2, 0.45), unit(-0.6, 0.6, 0.45), unit(0.05, 1, 0.45), unit(0.8, 0.15, 0.45), unit(0.4, 0.5, -0.3)];
const AVATARS = [[0, 9], [37.5, 6], [-68, 22.5], [0, -78]] as const;

describe("reaching the shadow box", () => {
  it("answers exactly what the renderer's own test answers for the light's camera", () => {
    const rnd = mulberry32(0x5eed);
    let inside = 0, outside = 0;
    for (const sun of SUNS)
      for (const [x, z] of AVATARS) {
        const light: KeyShadow = { on: true, x, z, ...sun };
        const frustum = lightFrustum(light);
        for (let i = 0; i < 2000; i++) {
          const part: CasterPart = { x: x + (rnd() - 0.5) * 240, y: rnd() * 14, z: z + (rnd() - 0.5) * 240, r: 0.5 + rnd() * 9 };
          const three = frustum.intersectsSphere(new Sphere(new Vector3(part.x, part.y, part.z), part.r));
          // Right on a face of the box the two sums may round apart: only clear cases are compared.
          const near = frustum.intersectsSphere(new Sphere(new Vector3(part.x, part.y, part.z), part.r + 1e-6)) !== frustum.intersectsSphere(new Sphere(new Vector3(part.x, part.y, part.z), Math.max(0, part.r - 1e-6)));
          if (near) continue;
          expect([sun, x, z, part, reachesShadowBox(light, part, 0)]).toEqual([sun, x, z, part, three]);
          three ? inside++ : outside++;
        }
      }
    // The sample really has both answers, many times over.
    expect(inside).toBeGreaterThan(2000);
    expect(outside).toBeGreaterThan(2000);
  });

  it("with its slack, never drops a sphere the renderer would draw, also one frame of walking late", () => {
    const rnd = mulberry32(0xca57);
    for (const sun of SUNS) {
      const now: KeyShadow = { on: true, x: 10, z: -4, ...sun };
      // The box the test may have seen: where the avatar was a frame ago, at 10 frames a second (0.85 u).
      const late: KeyShadow = { ...now, x: now.x - 0.6, z: now.z + 0.6 };
      const frustum = lightFrustum(now);
      for (let i = 0; i < 4000; i++) {
        const part: CasterPart = { x: (rnd() - 0.5) * 200, y: rnd() * 12, z: (rnd() - 0.5) * 200, r: 1 + rnd() * 8 };
        if (frustum.intersectsSphere(new Sphere(new Vector3(part.x, part.y, part.z), part.r))) expect([part, reachesShadowBox(late, part)]).toEqual([part, true]);
      }
    }
    expect(CASTER_SLACK).toBeGreaterThan(Math.hypot(0.6, 0.6));
  });

  it("keeps everything the renderer keeps when the light is straight overhead", () => {
    const rnd = mulberry32(0x0e4d);
    for (const d of [unit(0, 1, 0), unit(0.0002, 1, 0.0001)]) {
      const light: KeyShadow = { on: true, x: 0, z: 0, ...d };
      // three nudges a camera that looks straight down; whatever axes it ends with, the circle contains the square.
      const frustum = lightFrustum({ ...light, ...unit(0.0002, 1, 0.0001) });
      for (let i = 0; i < 3000; i++) {
        const part: CasterPart = { x: (rnd() - 0.5) * 160, y: rnd() * 12, z: (rnd() - 0.5) * 160, r: 1 + rnd() * 6 };
        if (frustum.intersectsSphere(new Sphere(new Vector3(part.x, part.y, part.z), part.r))) expect([part, reachesShadowBox(light, part)]).toEqual([part, true]);
      }
      expect(reachesShadowBox(light, { x: 120, y: 3, z: 0, r: 5 })).toBe(false);
    }
  });
});

describe("a block casts a shadow", () => {
  const light: KeyShadow = { on: true, x: 0, z: 9, ...SUNS[1] };
  const near = partAt(4, 12, 5, 8);
  const far = partAt(70, -70, 5, 8);

  it("while one of its parts reaches the box, and not while none does", () => {
    expect(castsShadow(light, EVERYWHERE, [far, near])).toBe(true);
    expect(castsShadow(light, EVERYWHERE, [far])).toBe(false);
    expect(castsShadow(light, EVERYWHERE, [])).toBe(false);
  });

  it("never when the preset draws no shadows", () => {
    expect(castsShadow({ ...light, on: false }, EVERYWHERE, [near])).toBe(false);
  });

  it("is why the far rows stay out: one sphere around a whole row reaches the box, none of its chalets does", () => {
    // A row of the economy ring south of the square, seen from the spawn with the sun in the west.
    const sun: KeyShadow = { on: true, x: 0, z: 9, ...SUNS[0] };
    const row = RESIDENTIAL_PLOTS.filter((p) => p.tier === "economy" && p.z > 60 && Math.abs(p.x) < 30);
    expect(row.length).toBeGreaterThanOrEqual(6);
    const parts = row.map((p) => partAt(p.house.x, p.house.z, 5, 8));
    const cx = row.reduce((a, p) => a + p.house.x, 0) / row.length, cz = row.reduce((a, p) => a + p.house.z, 0) / row.length;
    const whole: CasterPart = { x: cx, y: 4, z: cz, r: Math.max(...row.map((p) => Math.hypot(p.house.x - cx, p.house.z - cz))) + 6 };
    expect(lightFrustum(sun).intersectsSphere(new Sphere(new Vector3(whole.x, whole.y, whole.z), whole.r))).toBe(true);
    expect(castsShadow(sun, EVERYWHERE, parts)).toBe(false);
  });

  it("only while its shadow can be seen: a chalet east of the view with the sun in the west shades nothing on screen", () => {
    const sun: KeyShadow = { on: true, x: 0, z: 9, ...SUNS[0] }; // low in the west: shadows fall to the east
    const { planes } = gameCamera(0, 9, 1.6);
    const east = partAt(52, 9, 6, 8), west = partAt(-52, 9, 6, 8);
    // Both are inside the shadow box and off screen; only the western one throws its shadow into the view.
    for (const part of [east, west]) {
      expect(reachesShadowBox(sun, part)).toBe(true);
      expect(gameCamera(0, 9, 1.6).frustum.intersectsSphere(new Sphere(new Vector3(part.x, part.y, part.z), part.r))).toBe(false);
    }
    expect(castsShadow(sun, planes, [west])).toBe(true);
    expect(castsShadow(sun, planes, [east])).toBe(false);
    expect(castsShadow(sun, planes, [east, west])).toBe(true);
  });
});

describe("the planes of the view", () => {
  it("are the planes three.js culls with", () => {
    const rnd = mulberry32(0x91a4e);
    for (const [zoom, from, at] of [[1, undefined, undefined], [1.6, undefined, undefined], [0.55, undefined, undefined], [1, [10, 3.6, 19], [10, 31, -30]]] as const) {
      const { planes, frustum } = gameCamera(10, 9, zoom, from as [number, number, number] | undefined, at as [number, number, number] | undefined);
      const mine = (x: number, y: number, z: number, r: number) => {
        for (let p = 0; p < 24; p += 4) if (planes[p] * x + planes[p + 1] * y + planes[p + 2] * z + planes[p + 3] < -r) return false;
        return true;
      };
      let inside = 0;
      for (let i = 0; i < 3000; i++) {
        const [x, y, z, r] = [(rnd() - 0.5) * 300, rnd() * 40 - 5, (rnd() - 0.5) * 300, rnd() * 10];
        const sphere = new Sphere(new Vector3(x, y, z), r);
        if (frustum.intersectsSphere(sphere) !== frustum.intersectsSphere(new Sphere(sphere.center, r + 1e-6))) continue;
        const three = frustum.intersectsSphere(sphere);
        expect([zoom, x, y, z, r, mine(x, y, z, r)]).toEqual([zoom, x, y, z, r, three]);
        if (three) inside++;
      }
      expect(inside).toBeGreaterThan(20); // the closest zoom sees little of a 300 u wide sample
    }
  });
});

describe("the shadow of a part and the view", () => {
  it("is never missed: wherever a point shaded by the part is on screen, the part is kept", () => {
    const rnd = mulberry32(0x5bad0);
    let kept = 0, dropped = 0;
    for (const sun of SUNS)
      for (const zoom of [0.55, 1, 1.6])
        for (const [ax, az] of AVATARS) {
          const light: KeyShadow = { on: true, x: ax, z: az, ...sun };
          const { planes, frustum } = gameCamera(ax, az, zoom);
          for (let i = 0; i < 150; i++) {
            const part: CasterPart = { x: ax + (rnd() - 0.5) * 180, y: 1 + rnd() * 6, z: az + (rnd() - 0.5) * 180, r: 1 + rnd() * 8 };
            // Points the part can shade: points of the sphere, moved away from the light, at or above the ground.
            let seen = false;
            for (let k = 0; k < 400 && !seen; k++) {
              let ox = rnd() * 2 - 1, oy = rnd() * 2 - 1, oz = rnd() * 2 - 1;
              const n = Math.hypot(ox, oy, oz) || 1;
              const radius = part.r * Math.cbrt(rnd());
              (ox *= radius / n), (oy *= radius / n), (oz *= radius / n);
              const top = part.y + oy;
              if (top < 0) continue;
              const t = rnd() * (top / light.dy);
              seen = frustum.containsPoint(new Vector3(part.x + ox - light.dx * t, top - light.dy * t, part.z + oz - light.dz * t));
            }
            const answer = shadowReachesView(light, planes, part, 0);
            if (seen) expect([sun, zoom, ax, az, part, answer]).toEqual([sun, zoom, ax, az, part, true]);
            answer ? kept++ : dropped++;
          }
        }
    // The sample has both answers many times over (most parts 90 u around a view shade nothing on screen).
    expect(dropped).toBeGreaterThan(2000);
    expect(kept).toBeGreaterThan(1000);
  });

  it("keeps a part that is on screen itself, and one whose shadow alone comes into view", () => {
    const light: KeyShadow = { on: true, x: 0, z: 9, ...SUNS[1] };
    const { planes } = gameCamera(0, 9);
    expect(shadowReachesView(light, planes, partAt(0, 0, 5, 12))).toBe(true);
    // Behind the camera, up-sun: off screen, but its shadow falls forward into the view.
    const behind = partAt(-34, 34, 5, 30);
    expect(shadowReachesView(light, planes, behind)).toBe(true);
    // Down-sun and off screen: its shadow goes farther away.
    expect(shadowReachesView(light, planes, partAt(60, -20, 5, 8))).toBe(false);
  });
});

describe("the sphere of a part", () => {
  /** Every corner of every voxel of the model, standing at (x, z) and turned by `rot`, is inside the sphere. */
  function covers(voxels: ReadonlyArray<readonly [number, number, number, ...unknown[]]>, size: number, name: string) {
    const { reach, height } = modelExtent(voxels, size);
    const part = partAt(12, -7, reach, height);
    for (const rot of [0, 0.4, Math.PI / 4, Math.PI / 2, 2.2, Math.PI, 4.1, 5.5]) {
      const c = Math.cos(rot), s = Math.sin(rot);
      let worst = 0;
      for (const [vx, vy, vz] of voxels)
        for (const ox of [-0.5, 0.5])
          for (const oy of [0, 1])
            for (const oz of [-0.5, 0.5]) {
              const lx = (vx + ox) * size, ly = (vy + oy) * size, lz = (vz + oz) * size;
              worst = Math.max(worst, Math.hypot(12 + lx * c + lz * s - part.x, ly - part.y, -7 - lx * s + lz * c - part.z));
            }
      expect([name, rot, worst <= part.r + 1e-9]).toEqual([name, rot, true]);
    }
    return part;
  }

  it("holds the whole model at any turn: the pines, a chalet of each tier, every dressing part", () => {
    covers(pine(false), 1, "small pine");
    const tall = covers(pine(true), 1, "tall pine");
    expect(tall.r).toBeLessThan(8); // and is not a lazy huge sphere
    for (const tier of PLOT_TIERS) {
      const plot = RESIDENTIAL_PLOTS.find((p) => p.tier === tier)!;
      const model = residence(plot);
      expect(covers(model.voxels, model.size, `chalet ${tier}`).r).toBeLessThan(12);
    }
    const kinds: DressingKind[] = ["stone-wall", "gate-pillar", "shrub", "picket", "hedge", "stake", "firewood"];
    for (const kind of kinds) covers(dressingModel(kind, 7, 2), 0.5, kind);
  });
});
