import { afterEach, describe, expect, it, vi } from "vitest";

import { WEATHER_SEED } from "../environment/config";
import { saoPauloToEpoch } from "../environment/time";
import { clearance, type Collider } from "./collision";
import {
  compileLife,
  createLifeState,
  evaluateLife,
  isPerson,
  LIFE,
  LIFE_ACTIVITIES,
  LIFE_CAST,
  LIFE_GROUPS,
  LIFE_KINDS,
  LIFE_PACE,
  LIFE_PATHS,
  LIFE_RADIUS,
  type Life,
  lifeMaxSpeed,
  lifeRoute,
  lifeVenues,
  PACE_RANGE,
  sampleLife,
  warmLife,
} from "./life";
import { createNavField, lineClear } from "./navigation";
import { QUESTS } from "./quests";
import {
  groundAt,
  HOUSE_ENVELOPE,
  INTERACT_DISTANCE,
  lotColliders,
  LOTS,
  NPCS,
  OBSTACLES,
  PATH_GRAPH,
  plotColliders,
  QUEST_INTERACTIONS,
  QUEST_OBSTACLES,
  QUEST_SPAWNS,
  RESIDENTIAL_PLOTS,
  SHOPS,
  WOOD_YARD,
  WORLD_RADIUS,
} from "./world";

const HOMES = RESIDENTIAL_PLOTS.flatMap((p) => plotColliders(p));
/** The two ends of what can stand in the village: every lot empty with quests off, every lot built with quests on. */
const COLLIDER_SETS: Array<[string, Collider[]]> = [
  ["every lot available, quests off", [...OBSTACLES, ...HOMES, ...LOTS.flatMap((l) => lotColliders(l, null))]],
  ["every lot with a chalet, quests on", [...OBSTACLES, ...QUEST_OBSTACLES, ...HOMES, ...LOTS.flatMap((l) => lotColliders(l, HOUSE_ENVELOPE))]],
];
const SEEDS = [WEATHER_SEED, 1, 20261225, 0xdeadbeef];
const DAY = saoPauloToEpoch(2026, 12, 20, 0, 0);
const HOUR = 3_600_000;

/** Free room around a body of `radius` at a point, in the tighter of the two collider sets. */
const room = (x: number, z: number, radius = 0.45) => Math.min(...COLLIDER_SETS.map(([, set]) => clearance(set, x, z))) + 0.45 - radius;
/** Why a ground position is not allowed, or null. */
function unsafe(x: number, z: number): string | null {
  if (Math.hypot(x, z) > WORLD_RADIUS - 0.45) return "outside the world";
  if (groundAt(x, z) === "ice") return "on the pond";
  const free = room(x, z);
  return free < LIFE.clearance ? `inside a collider (clearance ${free.toFixed(2)})` : null;
}
const key = (x: number, z: number) => `(${x.toFixed(2)}, ${z.toFixed(2)})`;
const life = compileLife(WEATHER_SEED);
const index = (id: string) => life.index.get(id)!;

/** Points every `step` u along a route of a character. */
function routePoints(sim: Life, char: number, a: number, b: number, step = 0.15): Array<[number, number]> {
  const route = lifeRoute(sim, char, a, b);
  const out: Array<[number, number]> = [];
  const n = Math.max(1, Math.ceil(route.length / step));
  for (let i = 0; i <= n; i++) {
    const u = i / n, walked = u * route.length;
    let seg = 0;
    while (seg < route.at.length - 2 && route.at[seg + 1] <= walked) seg++;
    const span = route.at.length > 1 ? route.at[seg + 1] - route.at[seg] : 0;
    const t = span > 0 ? (walked - route.at[seg]) / span : 0;
    out.push([route.xs[seg] + ((route.xs[seg + 1] ?? route.xs[seg]) - route.xs[seg]) * t, route.zs[seg] + ((route.zs[seg + 1] ?? route.zs[seg]) - route.zs[seg]) * t]);
  }
  return out;
}
/** Everywhere a character can ever be on the ground: its spots and every route between two of them. */
function footprint(sim: Life, char: number): Array<[number, number]> {
  const c = sim.chars[char];
  const n = c.def.spots.length;
  const out: Array<[number, number]> = [];
  for (let a = 0; a < n; a++) {
    if (c.sy[a] > 0) continue;
    out.push([c.sx[a], c.sz[a]]);
    for (let b = 0; b < n; b++) if (a !== b && c.sy[b] === 0) out.push(...routePoints(sim, char, a, b));
  }
  return out;
}

describe("village life: the cast and its config (IMPL-0025, PROPOSTA)", () => {
  it("has the whole cast in one table, under the population cap", () => {
    const count = (kind: string) => LIFE_CAST.filter((c) => c.kind === kind).length;
    expect(Object.fromEntries(LIFE_KINDS.map((k) => [k, count(k)]))).toEqual({
      santa: 1, elf: 3, shopkeeper: 4, lumberjack: 1, villager: 6, visitor: 3,
      reindeer: 2, dog: 2, cat: 2, bird: 4, rabbit: 1, owl: 1,
    });
    expect(LIFE_CAST).toHaveLength(30);
    expect(LIFE_CAST.length).toBeLessThanOrEqual(LIFE.maxPopulation);
    expect(new Set(LIFE_CAST.map((c) => c.id)).size).toBe(LIFE_CAST.length);
    expect(() => compileLife(1, {}, Array.from({ length: LIFE.maxPopulation + 1 }, (_, i) => ({ ...LIFE_CAST[0], id: `extra-${i}` })))).toThrow(/cap/);
    // Every group named by a character exists, and every group has someone.
    for (const c of LIFE_CAST) expect(LIFE_GROUPS.some((g) => g.id === c.group), c.id).toBe(true);
    for (const g of LIFE_GROUPS) expect(LIFE_CAST.some((c) => c.group === g.id), g.id).toBe(true);
  });

  it("keeps the decorative critters and villagers that existed, with their looks, instead of adding duplicates", () => {
    // Seeds of the nine critters that stood still before this phase: the generated model of each is unchanged.
    for (const seed of ["villager-1", "villager-2", "villager-3", "dog-1", "cat-1", "bird-1", "bird-2", "rabbit-1", "owl-1"]) {
      expect(LIFE_CAST.filter((c) => c.seed === seed), seed).toHaveLength(1);
    }
    // And each still has a spot where it used to stand (the cat came down from the bench to the ground beside it).
    const was: Record<string, [number, number]> = { "villager-1": [6, -6.5], "villager-2": [-7, 2.5], "villager-3": [14.6, -2.6], "dog-1": [4.6, -7.6], "bird-1": [12.2, 0], "bird-2": [-12.2, 0] };
    for (const [id, [x, z]] of Object.entries(was)) expect(LIFE_CAST.find((c) => c.id === id)!.spots.some((s) => s.x === x && s.z === z), id).toBe(true);
  });

  it("puts each shopkeeper at the keeper spot of its shop during the shop's hours, and at home at night", () => {
    const state = createLifeState();
    for (const seed of SEEDS) {
      const sim = compileLife(seed);
      SHOPS.forEach((shop, i) => {
        const c = sim.index.get(`shopkeeper-${i + 1}`)!;
        expect(sim.chars[c].def.shopId).toBe(shop.id);
        let atKeeper = 0, samples = 0;
        // Well inside the hours (a slot after opening, a slot before closing): always by the shop.
        for (let h = LIFE.shopHours[0] + 0.2; h < LIFE.shopHours[1] - 0.2; h += 0.07) {
          sampleLife(sim, DAY + h * HOUR, state);
          samples++;
          expect(Math.hypot(state.x[c] - shop.door.x, state.z[c] - shop.door.z), `${shop.id} at ${h.toFixed(2)} h`).toBeLessThan(4);
          expect(state.presence[c]).toBe(1);
          if (state.x[c] === shop.keeper.x && state.z[c] === shop.keeper.z) atKeeper++;
        }
        expect(atKeeper / samples, `${shop.id}: share of the hours at the keeper spot`).toBeGreaterThan(0.5);
        for (const h of [0.5, 3, 6, 21, 23.5]) {
          sampleLife(sim, DAY + h * HOUR, state);
          expect(state.presence[c], `${shop.id} at ${h} h`).toBe(0);
        }
      });
    }
  });

  it("keeps the lumberjack at the wood yard for most of his working hours", () => {
    const state = createLifeState();
    const c = index("lumberjack");
    let yard = 0, n = 0;
    for (let h = 7.5; h < 12; h += 0.02, n++) {
      sampleLife(life, DAY + h * HOUR, state);
      if (Math.hypot(state.x[c] - WOOD_YARD.x, state.z[c] - WOOD_YARD.z) < 4) yard++;
    }
    expect(yard / n).toBeGreaterThan(0.4);
  });

  it("sends most people home at night and brings the owl out; heavy snow thins the streets", () => {
    const people = LIFE_CAST.map((c, i) => ({ c, i })).filter(({ c }) => isPerson(c.kind));
    const present = (sim: Life, ms: number, state = createLifeState()) => (sampleLife(sim, ms, state), people.filter(({ i }) => state.presence[i] > 0).length);
    const owl = index("owl-1");
    const state = createLifeState();
    for (const seed of SEEDS) {
      const clear = compileLife(seed, { snowAt: () => 0, festiveAt: () => false });
      const blizzard = compileLife(seed, { snowAt: () => 1, festiveAt: () => false });
      const heavy = compileLife(seed, { snowAt: () => 0.78, festiveAt: () => false });
      let day = 0, night = 0, storm = 0, snowy = 0, n = 0;
      for (let m = 0; m < 180; m += 7, n++) {
        day += present(clear, DAY + 15 * HOUR + m * 60_000);
        night += present(clear, DAY + 1 * HOUR + m * 60_000);
        storm += present(blizzard, DAY + 15 * HOUR + m * 60_000);
        snowy += present(heavy, DAY + 15 * HOUR + m * 60_000);
      }
      expect(day / n, `seed ${seed}: people out in the afternoon`).toBeGreaterThan(12);
      expect(night / n, `seed ${seed}: people out at 1 to 4 in the morning`).toBe(0);
      expect(snowy / n, `seed ${seed}: people out in heavy snow`).toBeLessThan((day / n) * 0.75);
      // In a blizzard only the shopkeepers under their awnings, Santa and the elves by the sleigh stay out.
      expect(storm / n, `seed ${seed}: people out in a blizzard`).toBeLessThanOrEqual(8);
      sampleLife(clear, DAY + 2 * HOUR, state);
      expect(state.presence[owl], "owl at 2 h").toBe(1);
      sampleLife(clear, DAY + 13 * HOUR, state);
      expect(state.presence[owl], "owl at 13 h").toBe(0);
    }
  });

  it("keeps people out later while a village event runs (Christmas Eve)", () => {
    const eve = saoPauloToEpoch(2026, 12, 24, 22, 40);
    const plain = compileLife(WEATHER_SEED, { snowAt: () => 0.2, festiveAt: () => false });
    const festive = compileLife(WEATHER_SEED, { snowAt: () => 0.2 });
    const out = (sim: Life) => {
      const state = createLifeState();
      let n = 0;
      for (let m = 0; m < 40; m += 4) {
        sampleLife(sim, eve + m * 60_000, state);
        n += LIFE_CAST.filter((c, i) => isPerson(c.kind) && state.presence[i] > 0).length;
      }
      return n;
    };
    expect(out(plain)).toBe(0);
    expect(out(festive)).toBeGreaterThan(20);
  });
});

describe("village life: paths, spots and routes on open ground (static, every seed's lanes)", () => {
  const fields = COLLIDER_SETS.map(([name, set]) => [name, createNavField(set)] as const);

  it("adds footpaths only on open ground: every node is free and every edge is a clear walk, in both collider sets", () => {
    const node = new Map(LIFE_PATHS.nodes.map((n) => [n.id, n]));
    expect(node.size).toBe(LIFE_PATHS.nodes.length);
    // The street graph of the village plan is all there, but for the chords of the round street.
    for (const n of PATH_GRAPH.nodes) expect(node.has(n.id), n.id).toBe(groundAt(n.x, n.z) !== "ice");
    expect(PATH_GRAPH.nodes.filter((n) => !node.has(n.id)).map((n) => n.id)).toEqual(["lane-08-square"]);
    expect(LIFE_PATHS.edges.length).toBeGreaterThan(PATH_GRAPH.edges.filter((e) => e.kind !== "plaza").length - 1);
    const wrong: string[] = [];
    for (const n of LIFE_PATHS.nodes) {
      const why = unsafe(n.x, n.z);
      if (why) wrong.push(`${n.id} ${key(n.x, n.z)}: ${why}`);
    }
    for (const e of LIFE_PATHS.edges) {
      const a = node.get(e.a)!, b = node.get(e.b)!;
      for (const [name, field] of fields) if (!lineClear(field, a.x, a.z, b.x, b.z)) wrong.push(`${e.a} → ${e.b}: not a clear walk (${name})`);
    }
    expect(wrong).toEqual([]);
  });

  it("stands every spot on open ground, off the pond and inside the world; elevated spots are over every head", () => {
    const wrong: string[] = [];
    for (const c of LIFE_CAST)
      c.spots.forEach((s, i) => {
        if ((s.y ?? 0) > 0) {
          if ((s.y ?? 0) < 3) wrong.push(`${c.id} spot ${i}: perched at ${s.y} u, within reach of a head`);
          return;
        }
        const why = unsafe(s.x, s.z);
        if (why) wrong.push(`${c.id} spot ${i} ${key(s.x, s.z)}: ${why}`);
      });
    expect(wrong).toEqual([]);
  });

  it("walks every route of every character on open ground, on or beside the paths, for every seed", { timeout: 60_000 }, () => {
    const pathNode = new Map(LIFE_PATHS.nodes.map((n) => [n.id, n]));
    const toSegment = (x: number, z: number, a: { x: number; z: number }, b: { x: number; z: number }) => {
      const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2)) : 0;
      return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    };
    for (const seed of SEEDS) {
      const sim = compileLife(seed);
      const wrong: string[] = [];
      for (const c of sim.chars) {
        const n = c.def.spots.length;
        // What a walker may be near: the paths, and the straight stretch between each of its spots and that spot's node.
        const spurs = c.def.spots.filter((s) => s.via).map((s) => [s, pathNode.get(s.via!)!] as const);
        for (let a = 0; a < n; a++)
          for (let b = 0; b < n; b++) {
            if (a === b || c.sy[a] > 0 || c.sy[b] > 0) continue;
            for (const [x, z] of routePoints(sim, c.index, a, b)) {
              const why = unsafe(x, z);
              if (why) {
                wrong.push(`${c.def.id} ${a} → ${b} at ${key(x, z)}: ${why}`);
                break;
              }
              if (c.leader >= 0 || !c.def.spots[a].via) continue;
              let off = Infinity;
              for (const e of LIFE_PATHS.edges) off = Math.min(off, toSegment(x, z, pathNode.get(e.a)!, pathNode.get(e.b)!));
              for (const [s, v] of spurs) off = Math.min(off, toSegment(x, z, s, v));
              // A lane offset at a corner (a mitre) reaches at most 1.42 times the lane.
              if (off > LIFE.maxLane * 1.42 + 0.01) {
                wrong.push(`${c.def.id} ${a} → ${b} at ${key(x, z)}: ${off.toFixed(2)} u off the paths`);
                break;
              }
            }
          }
      }
      expect(wrong, `seed ${seed}`).toEqual([]);
    }
  });

  it("keeps the footprints of characters of different groups apart by at least the two bodies", { timeout: 60_000 }, () => {
    for (const seed of SEEDS) {
      const sim = compileLife(seed);
      const prints = sim.chars.map((c) => footprint(sim, c.index));
      const boxes = prints.map((p) => ({ x0: Math.min(...p.map((q) => q[0])), x1: Math.max(...p.map((q) => q[0])), z0: Math.min(...p.map((q) => q[1])), z1: Math.max(...p.map((q) => q[1])) }));
      const wrong: string[] = [];
      for (let i = 0; i < sim.count; i++)
        for (let j = i + 1; j < sim.count; j++) {
          if (sim.chars[i].group === sim.chars[j].group) continue;
          const need = sim.chars[i].radius + sim.chars[j].radius + LIFE.bodyGap;
          const a = boxes[i], b = boxes[j];
          if (a.x0 - b.x1 > need || b.x0 - a.x1 > need || a.z0 - b.z1 > need || b.z0 - a.z1 > need) continue;
          // Only the points of each that lie in the other's box, grown by the distance asked, can be too close.
          const near = (p: Array<[number, number]>, o: typeof a) => p.filter(([x, z]) => x > o.x0 - need && x < o.x1 + need && z > o.z0 - need && z < o.z1 + need);
          const pi = near(prints[i], b), pj = near(prints[j], a);
          let min = Infinity, at = "";
          for (const [ax, az] of pi) for (const [bx, bz] of pj) {
            const d = Math.hypot(ax - bx, az - bz);
            if (d < min) (min = d), (at = `${key(ax, az)} / ${key(bx, bz)}`);
          }
          if (min < need) wrong.push(`${sim.chars[i].def.id} and ${sim.chars[j].def.id}: ${min.toFixed(2)} u apart at ${at}, need ${need.toFixed(2)}`);
        }
      expect(wrong, `seed ${seed}`).toEqual([]);
    }
  });

  it("keeps a walker's routes clear of where the others of its group stand, and off the quest NPCs and what quests put on the ground", () => {
    for (const seed of SEEDS) {
      const sim = compileLife(seed);
      const wrong: string[] = [];
      for (const c of sim.chars) {
        const print = footprint(sim, c.index);
        for (const o of sim.chars) {
          // A companion walks beside its leader, and a pair stands side by side: their own distance is sampled in time below.
          if (o === c || o.group !== c.group || o.leader === c.index || c.leader === o.index) continue;
          o.def.spots.forEach((s, k) => {
            if (s.inside || (s.y ?? 0) > 0) return;
            // The spot the two share by design (a pair at its bench) is each one's own point.
            const need = c.radius + o.radius + LIFE.bodyGap;
            const min = Math.min(...print.map(([x, z]) => Math.hypot(x - s.x, z - s.z)));
            if (min < need) wrong.push(`${c.def.id} passes ${min.toFixed(2)} u from spot ${k} of ${o.def.id}, need ${need.toFixed(2)}`);
          });
        }
      }
      expect(wrong, `seed ${seed}`).toEqual([]);
    }
  });

  it("keeps a companion beside or behind its leader on every trip, never across it", () => {
    for (const seed of SEEDS) {
      const sim = compileLife(seed);
      const followers = sim.chars.filter((c) => c.leader >= 0);
      expect(followers.map((c) => c.def.id)).toEqual(["dog-1"]);
      for (const f of followers) {
        const l = sim.chars[f.leader];
        const n = f.def.spots.length;
        const need = f.radius + l.radius;
        const at = (route: ReturnType<typeof lifeRoute>, u: number): [number, number] => {
          const walked = Math.max(0, Math.min(1, u)) * route.length;
          let seg = 0;
          while (seg < route.at.length - 2 && route.at[seg + 1] <= walked) seg++;
          const span = route.at.length > 1 ? route.at[seg + 1] - route.at[seg] : 0;
          const t = span > 0 ? (walked - route.at[seg]) / span : 0;
          return [route.xs[seg] + ((route.xs[seg + 1] ?? route.xs[seg]) - route.xs[seg]) * t, route.zs[seg] + ((route.zs[seg + 1] ?? route.zs[seg]) - route.zs[seg]) * t];
        };
        for (let a = 0; a < n; a++)
          for (let b = 0; b < n; b++) {
            if (a === b) continue;
            const lead = lifeRoute(sim, l.index, a, b), follow = lifeRoute(sim, f.index, a, b);
            const dur = lead.length / l.pace, lag = f.delayMs / 1000;
            let min = Infinity;
            for (let t = 0; t <= dur + lag; t += 0.02) {
              const ul = t / dur, uf = (t - lag) / dur;
              // Off stage at a door: the one that has not come out yet, or has already gone in, is not there.
              if ((l.inside[a] && ul <= 0) || (l.inside[b] && ul >= 1) || (f.inside[a] && uf <= 0) || (f.inside[b] && uf >= 1)) continue;
              const [lx, lz] = at(lead, ul), [fx, fz] = at(follow, uf);
              min = Math.min(min, Math.hypot(lx - fx, lz - fz));
            }
            expect(min, `${f.def.id} and ${l.def.id}, spot ${a} → ${b} (seed ${seed})`).toBeGreaterThanOrEqual(need);
          }
      }
    }
  });

  it("leaves room for every trip of a group inside one slot, one after the other", () => {
    for (const g of LIFE_GROUPS) {
      const walkers = life.chars.filter((c) => c.def.group === g.id && c.leader < 0);
      let total = 0;
      for (const c of walkers) {
        const n = c.def.spots.length;
        let longest = 0;
        for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (a !== b) longest = Math.max(longest, lifeRoute(life, c.index, a, b).length);
        // The slowest this kind ever walks, whatever the seed.
        total += Math.max(LIFE.fade, longest / (LIFE_PACE[c.def.kind] * PACE_RANGE[0])) + LIFE.gap;
      }
      // Companions set off a moment after their leaders.
      const delay = Math.max(0, ...life.chars.filter((c) => c.def.group === g.id).map((c) => c.delayMs / 1000));
      expect(total + delay + (g.dwell ?? LIFE.minDwell), `group ${g.id}: ${total.toFixed(1)} s of trips in a slot of ${g.slot} s`).toBeLessThanOrEqual(g.slot);
    }
  });

  it("gives every activity place as many standing points as characters that use it", () => {
    const venues = lifeVenues();
    expect(venues.length).toBeGreaterThan(20);
    for (const v of venues) {
      expect(v.capacity, v.id).toBeGreaterThanOrEqual(1);
      expect(new Set(v.members.map((m) => m.char)).size, v.id).toBe(v.capacity);
    }
    // The bench of the pair holds two, the sleigh four (Santa and three elves).
    const of = (id: string, spot: number) => venues.find((v) => v.members.some((m) => m.char === index(id) && m.spot === spot))!;
    expect(of("villager-5", 1).capacity).toBe(2);
    expect(of("santa", 1).capacity).toBe(4);
  });
});

describe("village life: a pure function of (seed, time, plan)", () => {
  it("returns the same positions for the same time, whatever was asked before", () => {
    const a = compileLife(WEATHER_SEED), b = compileLife(WEATHER_SEED);
    const sa = createLifeState(), sb = createLifeState();
    const times = Array.from({ length: 400 }, (_, i) => DAY + ((i * 7919) % 86_400) * 1000 + i * 0.37);
    // `a` is asked in order, `b` backwards and after unrelated questions: no state carries over.
    const expected = times.map((t) => (sampleLife(a, t, sa), [Array.from(sa.x), Array.from(sa.z), Array.from(sa.y), Array.from(sa.presence), Array.from(sa.activity)]));
    for (let i = times.length - 1; i >= 0; i--) {
      sampleLife(b, times[(i * 13) % times.length] + 5 * 86_400_000, sb);
      sampleLife(b, times[i], sb);
      expect([Array.from(sb.x), Array.from(sb.z), Array.from(sb.y), Array.from(sb.presence), Array.from(sb.activity)], `time ${i}`).toEqual(expected[i]);
    }
    // A second evaluation of the same time changes nothing.
    sampleLife(a, times[7], sa);
    const once = Array.from(sa.x);
    sampleLife(a, times[7], sa);
    expect(Array.from(sa.x)).toEqual(once);
  });

  it("differs between seeds, and between characters of a kind (pace, lane, how long they linger)", () => {
    const a = compileLife(1), b = compileLife(2);
    const sa = createLifeState(), sb = createLifeState();
    let differ = 0;
    for (let m = 0; m < 600; m += 9) {
      sampleLife(a, DAY + 15 * HOUR + m * 60_000, sa);
      sampleLife(b, DAY + 15 * HOUR + m * 60_000, sb);
      if (sa.x.some((x, i) => x !== sb.x[i])) differ++;
    }
    expect(differ).toBeGreaterThan(40);
    const villagers = a.chars.filter((c) => c.def.kind === "villager" && c.mirror < 0);
    expect(new Set(villagers.map((c) => c.pace.toFixed(4))).size).toBe(villagers.length);
    for (const c of a.chars) {
      expect(c.pace / LIFE_PACE[c.def.kind], c.def.id).toBeGreaterThanOrEqual(PACE_RANGE[0]);
      expect(c.pace / LIFE_PACE[c.def.kind], c.def.id).toBeLessThanOrEqual(PACE_RANGE[1]);
      expect(c.lane, c.def.id).toBeLessThanOrEqual(LIFE.maxLane);
      expect(c.linger).toBeGreaterThanOrEqual(c.def.linger[0]);
      expect(c.linger).toBeLessThanOrEqual(c.def.linger[1]);
    }
  });

  describe("on another engine's floats", () => {
    const real = { sin: Math.sin, cos: Math.cos, tan: Math.tan, atan2: Math.atan2, hypot: Math.hypot, exp: Math.exp, pow: Math.pow };
    afterEach(() => {
      Object.assign(Math, real);
      vi.resetModules();
    });

    it("gives bit-identical positions when the transcendental functions round differently, and never asks for a random number or the wall clock", async () => {
      const times = Array.from({ length: 300 }, (_, i) => DAY + ((i * 104_729) % 86_400) * 1000 + i * 0.61);
      const run = async () => {
        vi.resetModules();
        const m = await import("./life");
        const sim = m.compileLife(WEATHER_SEED);
        const s = m.createLifeState();
        return times.map((t) => (m.sampleLife(sim, t, s), [Array.from(s.x), Array.from(s.z), Array.from(s.y), Array.from(s.presence), Array.from(s.moving), Array.from(s.spot)]));
      };
      const here = await run();
      // Another JavaScript engine may round `sin`, `cos`, `atan2`, `hypot`… one unit in the last place the other
      // way (they are not correctly rounded by the language). The village plan and the paths are rebuilt with
      // such an engine, and positions must not move by a single bit: they depend on +, -, ×, ÷, `sqrt`, `floor`
      // and whole-number hashes only, over coordinates rounded to the centimetre.
      const ulp = (v: number, up: boolean) => {
        if (!Number.isFinite(v) || v === 0) return v;
        const f = new Float64Array([v]), bits = new BigInt64Array(f.buffer);
        bits[0] += (v > 0) === up ? 1n : -1n;
        return f[0];
      };
      let calls = 0;
      for (const name of Object.keys(real) as Array<keyof typeof real>) {
        (Math as unknown as Record<string, unknown>)[name] = (...args: number[]) => ulp((real[name] as (...a: number[]) => number)(...args), calls++ % 2 === 0);
      }
      const random = vi.spyOn(Math, "random").mockImplementation(() => {
        throw new Error("Math.random used by the shared simulation");
      });
      const now = vi.spyOn(Date, "now").mockImplementation(() => {
        throw new Error("Date.now used by the shared simulation");
      });
      const there = await run();
      random.mockRestore();
      now.mockRestore();
      expect(calls).toBeGreaterThan(100);
      expect(there).toEqual(here);
    });
  });

  it("does not depend on the order characters are listed in", () => {
    // The same cast, shuffled: every character is where it was, by id.
    const order = LIFE_CAST.map((_, i) => i).sort((a, b) => ((a * 7 + 3) % LIFE_CAST.length) - ((b * 7 + 3) % LIFE_CAST.length));
    const shuffled = compileLife(WEATHER_SEED, {}, order.map((i) => LIFE_CAST[i]), [...LIFE_GROUPS].reverse());
    const sa = createLifeState(), sb = createLifeState();
    for (let m = 0; m < 24 * 60; m += 11) {
      const t = DAY + m * 60_000 + 137;
      sampleLife(life, t, sa);
      sampleLife(shuffled, t, sb);
      order.forEach((original, at) => {
        expect([sb.x[at], sb.z[at], sb.presence[at]], `${LIFE_CAST[original].id} at minute ${m}`).toEqual([sa.x[original], sa.z[original], sa.presence[original]]);
      });
    }
  });

  it("is continuous: across a whole day at fine steps nobody moves faster than its own speed", { timeout: 60_000 }, () => {
    const state = createLifeState();
    const step = 250;
    for (const seed of [WEATHER_SEED, 7]) {
      const sim = compileLife(seed);
      const limit = sim.chars.map((_, i) => lifeMaxSpeed(sim, i));
      const px = new Float64Array(sim.count), pz = new Float64Array(sim.count), py = new Float64Array(sim.count);
      const worst = new Float64Array(sim.count);
      let moved = 0;
      for (let t = DAY; t <= DAY + 24 * HOUR; t += step) {
        sampleLife(sim, t, state);
        if (t > DAY)
          for (let i = 0; i < sim.count; i++) {
            const v = Math.hypot(state.x[i] - px[i], state.z[i] - pz[i], state.y[i] - py[i]) / (step / 1000);
            if (v > worst[i]) worst[i] = v;
            if (v > 0) moved++;
          }
        px.set(state.x);
        pz.set(state.z);
        py.set(state.y);
      }
      expect(moved, "somebody walks").toBeGreaterThan(10_000);
      // No off-stage transition is a jump: a character goes off stage and comes back at the same door, so the
      // limit holds for everyone, the whole day, with no exception declared.
      for (let i = 0; i < sim.count; i++) expect(worst[i], `${sim.chars[i].def.id} (seed ${seed})`).toBeLessThanOrEqual(limit[i] * 1.0001 + 1e-9);
      // And the limit is the configured pace: at most 12 % over the pace of the kind (a companion a little more).
      for (const c of sim.chars) if (c.leader < 0) expect(limit[c.index]).toBeLessThanOrEqual(LIFE_PACE[c.def.kind] * PACE_RANGE[1] + 1e-9);
    }
  });

  it("shows a clock that is a little off a character a little ahead or behind, never somewhere else", () => {
    const a = createLifeState(), b = createLifeState();
    const limit = life.chars.map((_, i) => lifeMaxSpeed(life, i));
    for (const offset of [20, 150, 800]) {
      let worst = 0;
      for (let t = DAY; t < DAY + 24 * HOUR; t += 9_973) {
        sampleLife(life, t, a);
        sampleLife(life, t + offset, b);
        for (let i = 0; i < life.count; i++) {
          const d = Math.hypot(a.x[i] - b.x[i], a.z[i] - b.z[i]);
          expect(d, `${life.chars[i].def.id}, clocks ${offset} ms apart`).toBeLessThanOrEqual((limit[i] * offset) / 1000 + 1e-9);
          worst = Math.max(worst, d);
        }
      }
      expect(worst).toBeLessThan(5.5 * (offset / 1000));
    }
  });
});

describe("village life: safety sampled over 24 h, several seeds and weather states", () => {
  const WEATHERS: Array<[string, (ms: number) => number]> = [
    ["clear", () => 0],
    ["snow", () => 0.48],
    ["heavy snow", () => 0.78],
    ["blizzard", () => 1],
    // Weather that changes every 45 minutes, so that people set out and turn back.
    ["changing", (ms) => [0, 0.78, 0.2, 1, 0.48][Math.floor(ms / 2_700_000) % 5]],
  ];
  const venues = lifeVenues();

  it("keeps every shared position on open ground, inside the world, apart from the others, and within each place's capacity", { timeout: 120_000 }, () => {
    const state = createLifeState();
    let samples = 0, walking = 0, closest = Infinity;
    // Standing positions repeat (they are the spots): each is looked up once.
    const known = new Map<number, string | null>();
    const check = (x: number, z: number, moving: number) => {
      if (moving) return unsafe(x, z);
      const k = Math.round(x * 100) * 100_003 + Math.round(z * 100);
      let why = known.get(k);
      if (why === undefined) known.set(k, (why = unsafe(x, z)));
      return why;
    };
    for (const seed of SEEDS)
      for (const [weather, snowAt] of WEATHERS) {
        // Every seed in clear weather, in heavy snow and in changing weather; the first seed in the other two too.
        if (seed !== SEEDS[0] && (weather === "snow" || weather === "blizzard")) continue;
        const sim = compileLife(seed, { snowAt, festiveAt: (ms) => seed === 1 && Math.floor(ms / HOUR) % 5 === 0 });
        const wrong: string[] = [];
        // A step that no slot length divides: over the day, every part of every slot is looked at.
        for (let t = DAY + (seed % 997); t < DAY + 24 * HOUR && wrong.length < 5; t += 2_713) {
          sampleLife(sim, t, state);
          samples++;
          for (let i = 0; i < sim.count; i++) {
            if (state.presence[i] === 0) continue;
            const x = state.x[i], z = state.z[i];
            if (state.y[i] > 0) {
              if (state.y[i] < 3 || Math.hypot(x, z) > WORLD_RADIUS) wrong.push(`${sim.chars[i].def.id} at ${key(x, z)}, ${state.y[i].toFixed(1)} u up`);
              continue;
            }
            if (state.moving[i]) walking++;
            const why = check(x, z, state.moving[i]);
            if (why) wrong.push(`${sim.chars[i].def.id} at ${key(x, z)}: ${why}`);
            for (let j = i + 1; j < sim.count; j++) {
              if (state.presence[j] === 0 || state.y[j] > 0) continue;
              const dx = x - state.x[j], dz = z - state.z[j];
              const need = sim.chars[i].radius + sim.chars[j].radius;
              if (dx > 4 || dx < -4 || dz > 4 || dz < -4) continue;
              const d = Math.sqrt(dx * dx + dz * dz);
              closest = Math.min(closest, d - need);
              if (d < need) wrong.push(`${sim.chars[i].def.id} and ${sim.chars[j].def.id} are ${d.toFixed(2)} u apart at ${key(x, z)}, need ${need.toFixed(2)}`);
            }
          }
          for (const v of venues) {
            let here = 0;
            for (const m of v.members) if (state.presence[m.char] > 0 && !state.moving[m.char] && state.spot[m.char] === m.spot) here++;
            if (here > v.capacity) wrong.push(`${v.id} holds ${here}, capacity ${v.capacity}`);
          }
        }
        expect(wrong, `seed ${seed}, ${weather}`).toEqual([]);
      }
    expect(samples).toBeGreaterThan(400_000);
    expect(walking).toBeGreaterThan(5_000);
    // Nobody ever touches anybody.
    expect(closest).toBeGreaterThanOrEqual(0);
    expect(closest).toBeLessThan(1);
  });

  it("never has two characters of one group on the move at the same time, but for a companion beside its leader", () => {
    const state = createLifeState();
    for (const seed of SEEDS) {
      const sim = compileLife(seed, { snowAt: WEATHERS[4][1] });
      for (let t = DAY; t < DAY + 24 * HOUR; t += 2_311) {
        sampleLife(sim, t, state);
        const moving = new Map<number, number>();
        for (const c of sim.chars) if (c.leader < 0 && state.moving[c.index]) moving.set(c.group, (moving.get(c.group) ?? 0) + 1);
        for (const [g, n] of moving) expect(n, `group ${sim.groups[g].def.id}`).toBe(1);
      }
    }
  });
});

describe("village life and the quests (quests-v1)", () => {
  it("leaves every quest NPC, quest item and quest interaction where it was, clear of every character", () => {
    // The five quest NPCs keep their names, places and colliders (they stand still, and block the avatar while
    // quests are on). No character of the cast ever stands or walks within a body of them, of an item to pick up
    // or of a thing to use: the routes above are checked against the collider set that holds the NPCs, and here
    // against the points themselves.
    const prints = life.chars.map((c) => ({ c, print: footprint(life, c.index) }));
    for (const npc of NPCS) {
      expect(QUESTS.some((q) => q.giverNpcId === npc.id || q.turnInNpcId === npc.id), npc.id).toBe(true);
      for (const { c, print } of prints) {
        const min = Math.min(...print.map(([x, z]) => Math.hypot(x - npc.x, z - npc.z)));
        expect(min, `${c.def.id} near ${npc.id}`).toBeGreaterThan(0.75 + c.radius);
      }
    }
    // Nobody stands on a quest item or on the spot a quest interaction is used from: the avatar gets to each.
    for (const p of [...QUEST_SPAWNS, ...QUEST_INTERACTIONS])
      for (const { c } of prints) for (const s of c.def.spots) if (!s.inside && !(s.y ?? 0)) expect(Math.hypot(s.x - p.x, s.z - p.z), `${c.def.id} on ${p.id}`).toBeGreaterThan(1);
    // And talking distance of a quest NPC holds no spot of a person, so the action offered there is the NPC's.
    for (const npc of NPCS)
      for (const c of LIFE_CAST) if (isPerson(c.kind)) for (const s of c.spots) if (!s.inside) expect(Math.hypot(s.x - npc.x, s.z - npc.z), `${c.id} by ${npc.id}`).toBeGreaterThan(2.5);
    expect(INTERACT_DISTANCE).toBeGreaterThan(2.5);
  });
});

describe("village life: cost of one evaluation", () => {
  it("evaluates the whole cast without allocating, in well under a microsecond per character", { timeout: 60_000 }, () => {
    const sim = compileLife(WEATHER_SEED);
    warmLife(sim);
    const state = createLifeState();
    const node = globalThis as unknown as { process: { memoryUsage(): { heapUsed: number } }; performance: { now(): number } };
    // One minute of frames at 60 Hz, over and over: the people's slots stay put, the animals' turn over (and
    // are planned anew) some fifty times a minute.
    const start = DAY + 15 * HOUR;
    const run = (frames: number) => {
      for (let i = 0; i < frames; i++) {
        state.epochMs = start + (i % 3600) * 16.7;
        evaluateLife(sim, state);
      }
    };
    // Until the engine has compiled the loop, it allocates on its own account.
    run(600_000);
    const frames = 800_000;
    let grown = Infinity, ms = Infinity;
    for (let round = 0; round < 3; round++) {
      const before = node.process.memoryUsage().heapUsed, t0 = node.performance.now();
      run(frames);
      ms = Math.min(ms, node.performance.now() - t0);
      // A collection in the middle of a round shows as a negative number: the quietest round is the measure.
      grown = Math.min(grown, Math.abs(node.process.memoryUsage().heapUsed - before));
    }
    const perCharacter = (ms * 1000) / frames / sim.count;
    // Stated cost: under 1 µs per character per frame (measured on the development machine: 0.018 µs per
    // character, 0.53 µs for the 30 of them).
    expect(perCharacter, `${perCharacter.toFixed(3)} µs per character`).toBeLessThan(1);
    // 800 000 frames: the smallest thing the engine can allocate per frame (a boxed number, 16 bytes) would be
    // 12.8 MB. Measured alone: a few hundred bytes in all; beside the other test files, the runner's own noise
    // is a few hundred kilobytes. The bar is 2 bytes per frame.
    expect(grown / frames, `${grown} bytes over ${frames} frames`).toBeLessThan(2);
    // The same call with the time as an argument gives the same answer (the engine may box that argument).
    const other = createLifeState();
    sampleLife(sim, state.epochMs, other);
    expect(Array.from(other.x)).toEqual(Array.from(state.x));
    expect(LIFE_ACTIVITIES[state.activity[0]]).toBeDefined();
    expect(LIFE_RADIUS.reindeer).toBeGreaterThan(LIFE_RADIUS.villager);
  });
});
