/**
 * The painted ground of the village (pure: no three.js). `groundAt` in the shared world says what is under a
 * point; here that becomes a colour per cell and, row by row, runs of equal colour for `Ground` to draw.
 */
import { type GroundKind, groundAt, PALETTE as P } from "@vila/shared/game/world";

/** Cheap value noise so snow reads as relief, not a flat white plane (spec §2.4). */
const noiseAt = (x: number, z: number) => Math.sin(x * 0.37 + z * 0.11) * Math.cos(z * 0.29 - x * 0.07);

/**
 * Colour of one ground cell. The paving is one of the cues of a residential tier (IMPL-0023, PROPOSTA):
 * cobbles and a stone path to each door on the premium street, packed snow on the standard street, trodden
 * snow on the economy street.
 */
export function groundColor(kind: GroundKind, x: number, z: number): string {
  const noise = noiseAt(x, z);
  const cobble = (x + z) % 2 === 0 ? P.stone : P.stoneDark;
  const r = Math.hypot(x, z);
  switch (kind) {
    case "plaza":
      return noise > 0.35 ? P.snowShade : cobble;
    case "ring-street":
      return Math.floor(r * 2) % 7 === 0 ? P.streetDark : noise > 0.5 ? P.snowShade : P.street;
    case "avenue":
      return Math.floor(r) % 6 === 0 ? P.streetDark : noise > 0.6 ? P.snowShade : P.street;
    case "lane":
      return noise > 0.25 ? P.snowShade : P.street;
    case "street-premium":
      return noise > 0.55 ? P.snowShade : cobble;
    case "street-standard":
      return noise > 0.45 ? P.snowShade : P.street;
    case "street-economy":
      return noise > 0.1 ? P.snowShade : noise < -0.5 ? P.streetDark : P.street;
    case "path-premium":
    case "pad":
      return cobble;
    case "path-standard":
      return P.street;
    case "yard-premium":
      return P.snow;
    case "yard-standard":
      return noise > 0.3 ? P.snowShade : P.snow;
    case "yard-economy":
      return noise > 0 ? P.snowDeep : P.snowShade;
    default:
      return noise > 0.45 ? P.snowDeep : noise > -0.2 ? P.snow : P.snowShade;
  }
}

/** One run of ground cells of the same colour along x: `[x0, x1, z, colour]` (cell `n` spans `n ± 0.5`). */
export type GroundRun = [x0: number, x1: number, z: number, color: string];

/**
 * The ground as runs of equal colour, row by row. The ground is flat, so neighbouring cells of one colour
 * are one quad: the village is five times larger than the first square (IMPL-0023) and costs about as many
 * triangles as that square did cell by cell. Only the top is drawn: the slab is never seen from the side or
 * from below (the snowfield lies around it).
 */
export function groundRuns(radius: number): GroundRun[] {
  const runs: GroundRun[] = [];
  for (let z = -radius; z <= radius; z++) {
    let run: GroundRun | null = null;
    for (let x = -radius; x <= radius; x++) {
      const c = Math.hypot(x, z) > radius ? null : groundColor(groundAt(x, z), x, z);
      if (run && c === run[3]) run[1] = x;
      else {
        if (run) runs.push(run);
        run = c === null ? null : [x, x, z, c];
      }
    }
    if (run) runs.push(run);
  }
  return runs;
}

