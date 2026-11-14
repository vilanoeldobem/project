import { describe, expect, it } from "vitest";

import {
  DEFAULT_APPEARANCE,
  EYE_COLORS,
  HAIR_COLORS,
  HEIGHT_SCALE,
  randomAppearance,
  sanitizeAppearance,
  SKIN_COLORS,
} from "./appearance";

describe("the character appearance (P07)", () => {
  it("falls back to the defaults for null, junk and unknown values, field by field", () => {
    expect(sanitizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(sanitizeAppearance("round")).toEqual(DEFAULT_APPEARANCE);
    const mixed = sanitizeAppearance({ base: "round", hair: "spiky", hairColor: "#123456", skin: SKIN_COLORS[4], height: "tall", beard: "yes" });
    expect(mixed.base).toBe("round");
    expect(mixed.hair).toBe(DEFAULT_APPEARANCE.hair);
    expect(mixed.hairColor).toBe(DEFAULT_APPEARANCE.hairColor);
    expect(mixed.skin).toBe(SKIN_COLORS[4]);
    expect(mixed.height).toBe(DEFAULT_APPEARANCE.height);
    expect(mixed.beard).toBe(false);
  });

  it("keeps a full, valid appearance unchanged", () => {
    const appearance = { base: "jaw", hair: "long", hairColor: HAIR_COLORS[7], skin: SKIN_COLORS[7], eyes: EYE_COLORS[7], height: "high", beard: true, mustache: true } as const;
    expect(sanitizeAppearance(appearance)).toEqual(appearance);
  });

  it("randomises from the catalogues with a deterministic generator", () => {
    const first = randomAppearance(() => 0);
    expect(first).toEqual({ base: "square", hair: "short", hairColor: HAIR_COLORS[0], skin: SKIN_COLORS[0], eyes: EYE_COLORS[0], height: "low", beard: true, mustache: true });
    const last = randomAppearance(() => 0.999999);
    expect(last.hairColor).toBe(HAIR_COLORS[HAIR_COLORS.length - 1]);
    expect(last.skin).toBe(SKIN_COLORS[SKIN_COLORS.length - 1]);
    expect(last.eyes).toBe(EYE_COLORS[EYE_COLORS.length - 1]);
    expect(last.beard).toBe(false);
    expect(last.mustache).toBe(false);
  });

  it("scales the figure by height, medium being the normal size", () => {
    expect(HEIGHT_SCALE.medium).toBe(1);
    expect(HEIGHT_SCALE.low).toBeLessThan(1);
    expect(HEIGHT_SCALE.high).toBeGreaterThan(1);
  });
});
