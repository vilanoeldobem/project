import { describe, expect, it } from "vitest";

import { GAME_URL } from "./config";
import { createSnowflakes } from "./VoxelSnow";

/**
 * The `/404.html` route is static HTML served from `public/`, so its canonical game link is
 * asserted end-to-end by `scripts/verify.mjs` (every route × viewport × theme) instead of a
 * unit test that would pull Node typings into this browser tsconfig.
 */
describe("public site contract", () => {
  it("sends every game link to the play subdomain", () => {
    expect(GAME_URL).toBe("https://play.vilanoeldobem.com.br");
  });

  it("builds a deterministic flake field inside the viewport bounds", () => {
    const flakes = createSnowflakes(320, 640, 60);
    expect(flakes).toHaveLength(60);
    expect(createSnowflakes(320, 640, 60)).toEqual(flakes);

    for (const flake of flakes) {
      expect([2, 3, 4]).toContain(flake.size);
      expect(flake.x).toBeGreaterThanOrEqual(0);
      expect(flake.x).toBeLessThanOrEqual(320);
      expect(flake.y).toBeGreaterThanOrEqual(0);
      expect(flake.y).toBeLessThanOrEqual(640);
      expect(flake.alpha).toBeGreaterThanOrEqual(0.3);
      expect(flake.alpha).toBeLessThanOrEqual(0.8);
      expect(flake.drift).toBeGreaterThan(0);
    }
  });

  it("honours the requested flake count and scales from phone to desktop", () => {
    expect(createSnowflakes(320, 640, 0)).toHaveLength(0);
    expect(createSnowflakes(1440, 900, 150)).toHaveLength(150);
    const wide = createSnowflakes(1920, 1080, 150);
    expect(Math.max(...wide.map((flake) => flake.x))).toBeGreaterThan(1440);
  });
});
