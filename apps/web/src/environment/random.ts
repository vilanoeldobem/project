/** Integer hash PRNG (deterministic across engines: only 32-bit integer ops). Never Math.random for shared state. */
export function hash32(seed: number, slot: number, salt: number): number {
  let x = (seed ^ Math.imul(slot | 0, 0x9e3779b1) ^ Math.imul(salt | 0, 0x85ebca6b)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Uniform in [0, 1). */
export function random01(seed: number, slot: number, salt: number): number {
  return hash32(seed, slot, salt) / 0x100000000;
}

/** Local, non-shared PRNG for cosmetic layouts (stars, flakes). Mulberry32. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}
