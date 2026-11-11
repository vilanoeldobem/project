/**
 * Seeded randomness for procedural content (IMPL-0010). The same seed always yields the same model on
 * every device and on the server: no `Math.random`, no clock, only 32-bit integer maths (Mulberry32 from
 * the shared package). String seeds (lot ids, catalogue ids) are hashed with FNV-1a.
 */
import { mulberry32 } from "@vila/shared/environment/random";

export type Seed = string | number;

/** Stable 32-bit hash of a seed (FNV-1a over the UTF-16 code units of its string form). */
export function seedOf(seed: Seed): number {
  const s = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  private next: () => number;

  constructor(seed: Seed, salt = "") {
    this.next = mulberry32(seedOf(`${seed}|${salt}`));
  }

  /** Uniform in [0, 1). */
  float() {
    return this.next();
  }

  /** Integer in [min, max] (inclusive). */
  int(min: number, max: number) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number) {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
}
