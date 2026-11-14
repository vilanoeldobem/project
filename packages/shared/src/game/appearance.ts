/**
 * Character appearance (P07, "categorias de aparência"): the base head, hair, skin, eyes, height and facial
 * hair the visitor chooses. Purely visual and stored in this browser (`vila.appearance.v1`): it is not account
 * data and is not relayed to other visitors (the presence protocol carries the cosmetic look only).
 *
 * Every list is a fixed catalogue (the board's "opções visuais em estudo"); colours are data, never a claim.
 */
export type BaseId = "square" | "round" | "jaw";
export type HairId = "short" | "curly" | "long";
export type HeightId = "low" | "medium" | "high";

export interface Appearance {
  base: BaseId;
  hair: HairId;
  hairColor: string;
  skin: string;
  eyes: string;
  height: HeightId;
  beard: boolean;
  mustache: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = {
  base: "square",
  hair: "short",
  hairColor: "#5A3B22",
  skin: "#EFC29A",
  eyes: "#23211F",
  height: "medium",
  beard: false,
  mustache: false,
};

export const BASE_LABELS: Record<BaseId, string> = { square: "Clássico", round: "Redondo", jaw: "Queixo largo" };
export const HAIR_LABELS: Record<HairId, string> = { short: "Curto", curly: "Cacheado", long: "Longo" };
export const HEIGHT_LABELS: Record<HeightId, string> = { low: "Baixo", medium: "Médio", high: "Alto" };

/** How much the whole figure is scaled for a height. Visual only: no reach, speed or collider changes. */
export const HEIGHT_SCALE: Record<HeightId, number> = { low: 0.92, medium: 1, high: 1.08 };

export const HAIR_COLORS = ["#1B1410", "#3A2A1C", "#5A3B22", "#8A5A2E", "#C9973F", "#A8452A", "#8C8C8C", "#E4E0D8"] as const;
export const SKIN_COLORS = ["#F6D7B8", "#EFC29A", "#E3A97C", "#CE8B5E", "#A96B45", "#82502F", "#5E3920", "#3F2716"] as const;
export const EYE_COLORS = ["#23211F", "#3B5A7A", "#4A6B3A", "#6B4A2A", "#6E6A66", "#2F6B5A", "#5B3B63", "#A8762A"] as const;

export const BASES: readonly BaseId[] = Object.keys(BASE_LABELS) as BaseId[];
export const HAIRS: readonly HairId[] = Object.keys(HAIR_LABELS) as HairId[];
export const HEIGHTS: readonly HeightId[] = Object.keys(HEIGHT_LABELS) as HeightId[];

const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T =>
  typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : fallback;

const color = (list: readonly string[], value: unknown, fallback: string): string =>
  typeof value === "string" && list.includes(value) ? value : fallback;

/** Keeps the known values, field by field; `null`, junk and an old shape fall back to the defaults. */
export function sanitizeAppearance(value: unknown): Appearance {
  if (!value || typeof value !== "object") return { ...DEFAULT_APPEARANCE };
  const v = value as Record<string, unknown>;
  return {
    base: oneOf(BASES, v.base, DEFAULT_APPEARANCE.base),
    hair: oneOf(HAIRS, v.hair, DEFAULT_APPEARANCE.hair),
    hairColor: color(HAIR_COLORS, v.hairColor, DEFAULT_APPEARANCE.hairColor),
    skin: color(SKIN_COLORS, v.skin, DEFAULT_APPEARANCE.skin),
    eyes: color(EYE_COLORS, v.eyes, DEFAULT_APPEARANCE.eyes),
    height: oneOf(HEIGHTS, v.height, DEFAULT_APPEARANCE.height),
    beard: typeof v.beard === "boolean" ? v.beard : DEFAULT_APPEARANCE.beard,
    mustache: typeof v.mustache === "boolean" ? v.mustache : DEFAULT_APPEARANCE.mustache,
  };
}

/** #rrggbb darkened by `amount` (0..1): the strands of curly hair and the edge of a portrait voxel. */
export function darkenHex(hex: string, amount = 0.18): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.max(0, Math.round((((n >> shift) & 255) * (1000 - amount * 1000)) / 1000));
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, "0")}`;
}

/** One option of each list, and a coin for each kind of facial hair the visitor did not choose. */
export function randomAppearance(rng: () => number): Appearance {
  const pick = <T extends string>(list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
  return {
    base: pick(BASES),
    hair: pick(HAIRS),
    hairColor: pick(HAIR_COLORS),
    skin: pick(SKIN_COLORS),
    eyes: pick(EYE_COLORS),
    height: pick(HEIGHTS),
    beard: rng() < 0.5,
    mustache: rng() < 0.5,
  };
}
