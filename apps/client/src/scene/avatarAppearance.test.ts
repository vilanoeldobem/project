import { describe, expect, it } from "vitest";

import { DEFAULT_APPEARANCE, type Appearance } from "@vila/shared/game/appearance";
import { DEFAULT_LOOK } from "@vila/shared/game/cosmetics";
import { PALETTE } from "@vila/shared/game/world";

import { avatarParts, type Voxel } from "./models";

const at = (body: Voxel[], x: number, y: number, z: number) => body.find((v) => v[0] === x && v[1] === y && v[2] === z);

describe("the avatar without an appearance", () => {
  it("keeps the original head, skin and eyes (remote visitors and the geometry tests)", () => {
    const { body } = avatarParts(DEFAULT_LOOK);
    expect(at(body, 0, 7, 0)?.[3]).toBe(PALETTE.skin);
    expect(at(body, 0, 7, -2)).toBeUndefined();
    expect(body.filter((v) => v[3] === "#1D2B27")).toHaveLength(2);
  });
});

describe("the avatar with an appearance (P07)", () => {
  const draw = (over: Partial<Appearance> = {}) => avatarParts(DEFAULT_LOOK, { ...DEFAULT_APPEARANCE, ...over }).body;

  it("uses the chosen skin on the head and the chosen eyes twice", () => {
    const body = draw({ skin: "#82502F", eyes: "#3B5A7A" });
    expect(at(body, 0, 7, 0)?.[3]).toBe("#82502F");
    expect(at(body, 0, 7, 1)?.[3]).toBe("#82502F");
    expect(body.filter((v) => v[3] === "#3B5A7A")).toHaveLength(2);
  });

  it("cuts the head corners for the round base and adds a chin for the large jaw", () => {
    expect(at(draw({ base: "round" }), -1, 7, -1)).toBeUndefined();
    expect(at(draw({ base: "square" }), -1, 7, -1)?.[3]).toBe(DEFAULT_APPEARANCE.skin);
    expect(at(draw({ base: "jaw" }), 0, 6, 2)?.[3]).toBe(DEFAULT_APPEARANCE.skin);
  });

  it("draws hair at the back and below the hat, longer for the long style", () => {
    const short = draw();
    expect(at(short, 0, 7, -2)?.[3]).toBe(DEFAULT_APPEARANCE.hairColor);
    expect(at(short, 0, 4, -2)).toBeUndefined();
    expect(at(draw({ hair: "long" }), 0, 4, -2)?.[3]).toBe(DEFAULT_APPEARANCE.hairColor);
    expect(at(draw({ hair: "curly" }), 2, 7, 0)).toBeDefined();
  });

  it("adds the beard and the mustache only when chosen", () => {
    expect(at(draw(), 0, 5, 1.5)).toBeUndefined();
    expect(at(draw({ beard: true }), 0, 5, 1.5)?.[3]).toBe(DEFAULT_APPEARANCE.hairColor);
    expect(at(draw({ mustache: true }), 0, 6, 1.5)?.[3]).toBe(DEFAULT_APPEARANCE.hairColor);
  });

  it("keeps the cosmetic hats on top of the hair", () => {
    const body = avatarParts({ ...DEFAULT_LOOK, hat: "hat-santa" }, DEFAULT_APPEARANCE).body;
    // The Santa brim sits at y 9; the hair at the back of the head (z −2) is still visible.
    expect(at(body, 0, 9, 0)?.[3]).not.toBe(DEFAULT_APPEARANCE.hairColor);
    expect(at(body, 0, 7, -2)?.[3]).toBe(DEFAULT_APPEARANCE.hairColor);
  });
});
