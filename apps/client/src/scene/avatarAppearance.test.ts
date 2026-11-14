import { describe, expect, it } from "vitest";

import { DEFAULT_APPEARANCE, type Appearance } from "@vila/shared/game/appearance";
import { COSMETICS, DEFAULT_LOOK } from "@vila/shared/game/cosmetics";
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
    const body = avatarParts({ ...DEFAULT_LOOK, helmet: "helmet-santa" }, DEFAULT_APPEARANCE).body;
    // The Santa brim sits at y 9; the hair at the back of the head (z −2) is still visible.
    expect(at(body, 0, 9, 0)?.[3]).not.toBe(DEFAULT_APPEARANCE.hairColor);
    expect(at(body, 0, 7, -2)?.[3]).toBe(DEFAULT_APPEARANCE.hairColor);
  });
});

describe("the ten P08 categories (IMPL-0027)", () => {
  const parts = (look: Partial<typeof DEFAULT_LOOK>) => avatarParts({ ...DEFAULT_LOOK, ...look });

  it("paints the blouse on the torso and the sleeve on the arms", () => {
    const { body, armL } = parts({ blouse: "blouse-stripes" });
    expect(at(body, 0, 4, 0)?.[3]).toBe(PALETTE.cream);
    expect(at(body, 0, 5, 0)?.[3]).toBe(PALETTE.cream); // collar
    expect(armL.find((v) => v[1] === -1)?.[3]).toBe(PALETTE.gold); // sleeve
    expect(armL.find((v) => v[1] === -2)?.[3]).toBe(PALETTE.cream); // cuff
  });

  it("paints the trousers and the shoes on the legs, with a toe", () => {
    const { legL } = parts({ pants: "pants-gold", shoes: "shoes-brown" });
    expect(legL.find((v) => v[1] === -1)?.[3]).toBe(PALETTE.gold);
    expect(legL.find((v) => v[1] === -3 && v[2] === 0)?.[3]).toBe(PALETTE.wood);
    expect(legL.some((v) => v[1] === -3 && v[2] === 1)).toBe(true);
  });

  it("adds the dress skirt over the legs and paints the torso", () => {
    const { body } = parts({ dress: "dress-pine" });
    expect(at(body, 0, 3, 0)?.[3]).toBe(PALETTE.pine);
    expect(at(body, 1, 1, 1)?.[3]).toBe(PALETTE.gold); // hem
  });

  it("adds the back, face, hand and special layers in their own places", () => {
    const { body, armL } = parts({ back: "back-wings", face: "face-glasses", special: "special-halo" });
    expect(at(body, 0, 6, -1)).toBeDefined(); // back item behind the torso
    expect(at(body, 0, 7, 2)?.[3]).toBe(PALETTE.coal); // glasses in front of the face
    expect(at(body, 0, 10, 0)?.[3]).toBe(PALETTE.gold); // halo above the head
    const hand = parts({ handLeft: "hand-left-candy" }).armL;
    expect(hand.find((v) => v[1] === -3 && v[2] === 1)?.[3]).toBe(PALETTE.red);
    expect(armL).toHaveLength(3);
  });

  it("builds every catalogue item without NaN or duplicate cells", () => {
    for (const c of COSMETICS) {
      const drawn = avatarParts({ ...DEFAULT_LOOK, [c.slot]: c.id });
      for (const part of [drawn.body, drawn.legL, drawn.armL]) {
        expect(part.length, c.id).toBeGreaterThan(0);
        expect(part.every(([x, y, z]) => Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)), c.id).toBe(true);
        expect(new Set(part.map(([x, y, z]) => `${x},${y},${z}`)).size, c.id).toBe(part.length);
      }
    }
  });
});
