/**
 * Colours for generated content: only PALETTE entries and named, deterministic variations of them
 * (IMPL-0010). A generator never invents a hex value; new tones are added here with a name.
 */
import { PALETTE as P } from "@vila/shared/game/world";

/** Scales an sRGB hex colour (k < 1 darker, k > 1 lighter), clamped; returns upper-case #RRGGBB. */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  const [r, g, b] = [ch((n >> 16) & 255), ch((n >> 8) & 255), ch(n & 255)];
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0").toUpperCase()}`;
}

export const V = {
  woodLight: shade(P.wood, 1.18),
  woodDark: shade(P.wood, 0.78),
  redDeep: shade(P.red, 0.8),
  redBright: shade(P.red, 1.25),
  pineMoss: shade(P.leaf, 0.85),
  creamShade: shade(P.cream, 0.9),
  goldDeep: shade(P.gold, 0.82),
  blueNight: shade(P.bulbBlue, 0.55),
  stoneWarm: shade(P.stone, 0.95),
  crust: shade(P.gold, 0.68),
  ice: P.ice,
  // Skin tones for villagers: named variations of the palette skin (no single "default" person).
  skinLight: shade(P.skin, 1.18),
  skinDeep: shade(P.skin, 0.72),
  skinDark: shade(P.skin, 0.5),
  // Animal coats.
  furLight: shade(P.wood, 1.45),
  furGrey: shade(P.stoneDark, 0.8),
  ginger: shade(P.carrot, 0.85),
} as const;

/** Wrapping paper pairs (base, pattern) and ribbons for gifts. */
export const WRAPS: ReadonlyArray<readonly [string, string]> = [
  [P.red, P.cream],
  [P.pine, P.gold],
  [V.blueNight, P.snow],
  [P.cream, P.red],
  [V.redDeep, P.gold],
  [P.leaf, P.cream],
];
export const RIBBONS = [P.gold, P.cream, P.red, V.redBright] as const;

/** Painted wood (fences, stalls, mailboxes, sleds). */
export const PAINTS = [P.red, P.pine, P.cream, P.wood, V.blueNight, V.woodLight] as const;
/** Awning stripe pairs. */
export const AWNINGS: ReadonlyArray<readonly [string, string]> = [
  [P.red, P.cream],
  [P.pine, P.cream],
  [V.blueNight, P.snow],
  [P.gold, P.cream],
];
/** Emissive bulb colours (shared lights role). */
export const BULB_COLORS = [P.gold, P.bulbRed, P.bulbGreen, P.bulbBlue] as const;
