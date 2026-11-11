import { describe, expect, it } from "vitest";

import { localSnapshot, parseSnapshot, seedFromWorldId, WEATHER_SEED, WEATHER_SLOT_MS, WEATHER_TRANSITION_MS } from "./config";
import { activeEvents, applyEvents, eventsForYear, eventWeight } from "./events";
import { computeFrame } from "./frame";
import { KEYS, lookAt, MAX_FOG_DENSITY } from "./keyframes";
import { NetworkClock } from "./network-clock";
import { dayPhase, saoPauloCivil, saoPauloSecondsOfDay, saoPauloToEpoch } from "./time";
import { lerpAngle, sampleWeatherSlot, weatherAt } from "./weather";

const CYCLE = localSnapshot(0).cycle;
const HOUR = 3_600_000;

describe("São Paulo time", () => {
  it("converts UTC epochs to SP civil time (UTC-3 since 2019, via IANA)", () => {
    expect(saoPauloSecondsOfDay(Date.UTC(2026, 11, 24, 3, 0, 0))).toBe(0); // 00:00 SP
    expect(saoPauloSecondsOfDay(Date.UTC(2026, 11, 24, 15, 30, 15, 500))).toBe(12 * 3600 + 30 * 60 + 15.5);
  });

  it("handles year turn and historical daylight saving (2018 summer was UTC-2)", () => {
    expect(saoPauloCivil(Date.UTC(2027, 0, 1, 2, 59, 59))).toMatchObject({ year: 2026, month: 12, day: 31, hour: 23 });
    expect(saoPauloCivil(Date.UTC(2027, 0, 1, 3, 0, 0))).toMatchObject({ year: 2027, month: 1, day: 1, hour: 0 });
    expect(saoPauloCivil(Date.UTC(2018, 0, 15, 12, 0, 0)).hour).toBe(10);
  });

  it("round-trips SP civil time to epoch", () => {
    const ms = saoPauloToEpoch(2026, 12, 24, 18, 0);
    expect(ms).toBe(Date.UTC(2026, 11, 24, 21, 0));
    expect(saoPauloCivil(ms)).toMatchObject({ day: 24, hour: 18, minute: 0 });
  });

  it("reports the artistic phase at the boundaries", () => {
    const at = (h: number, m = 0) => dayPhase(saoPauloToEpoch(2026, 12, 1, h, m), CYCLE).kind;
    expect(at(4, 59)).toBe("night");
    expect(at(5)).toBe("dawn");
    expect(at(6)).toBe("day");
    expect(at(16, 59)).toBe("day");
    expect(at(17)).toBe("dusk");
    expect(at(18, 30)).toBe("night");
    expect(at(0)).toBe("night");
  });

  it("is the same São Paulo hour for every visitor regardless of their zone", () => {
    const epoch = Date.UTC(2026, 11, 20, 12, 0);
    // The computation never reads the host zone; the frame is a pure function of the epoch.
    expect(computeFrame(epoch, localSnapshot(epoch)).hour).toBe(9);
  });
});

describe("weather v1", () => {
  it("is deterministic for the same seed and time", () => {
    const t = Date.UTC(2026, 11, 24, 20, 13);
    expect(weatherAt(WEATHER_SEED, t, WEATHER_SLOT_MS, WEATHER_TRANSITION_MS)).toEqual(
      weatherAt(WEATHER_SEED, t, WEATHER_SLOT_MS, WEATHER_TRANSITION_MS)
    );
  });

  it("changes with the seed and stays within the expected distribution", () => {
    let differ = 0;
    const counts: Record<string, number> = {};
    for (let slot = 0; slot < 4000; slot++) {
      const a = sampleWeatherSlot(1, slot), b = sampleWeatherSlot(2, slot);
      if (a.kind !== b.kind) differ++;
      counts[a.kind] = (counts[a.kind] ?? 0) + 1;
    }
    expect(differ).toBeGreaterThan(1000);
    expect(counts.SNOW / 4000).toBeGreaterThan(0.27);
    expect(counts.SNOW / 4000).toBeLessThan(0.37);
    expect(counts.BLIZZARD / 4000).toBeLessThan(0.08);
  });

  it("keeps every numeric parameter within [0, 1] and wind within [0, 2π)", () => {
    for (let slot = 0; slot < 2000; slot++) {
      const w = sampleWeatherSlot(WEATHER_SEED, slot);
      for (const k of ["snowfall", "windStrength", "fogStrength", "cloudCover", "sparkle", "aurora"] as const) {
        expect(w[k]).toBeGreaterThanOrEqual(0);
        expect(w[k]).toBeLessThanOrEqual(1);
      }
      expect(w.windDirectionRad).toBeGreaterThanOrEqual(0);
      expect(w.windDirectionRad).toBeLessThan(Math.PI * 2);
    }
  });

  it("is continuous across slot boundaries (numeric params)", () => {
    for (let slot = 1000; slot < 1100; slot++) {
      const edge = slot * WEATHER_SLOT_MS;
      const before = weatherAt(WEATHER_SEED, edge - 1, WEATHER_SLOT_MS, WEATHER_TRANSITION_MS);
      const after = weatherAt(WEATHER_SEED, edge, WEATHER_SLOT_MS, WEATHER_TRANSITION_MS);
      expect(Math.abs(before.snowfall - after.snowfall)).toBeLessThan(1e-6);
      expect(Math.abs(before.fogStrength - after.fogStrength)).toBeLessThan(1e-6);
    }
  });

  it("interpolates wind direction along the shortest arc", () => {
    const deg = (d: number) => (d * Math.PI) / 180;
    const mid = lerpAngle(deg(359), deg(1), 0.5);
    expect(Math.min(mid, Math.PI * 2 - mid)).toBeLessThan(deg(0.001) + 1e-9);
    expect(lerpAngle(deg(10), deg(350), 0.5)).toBeCloseTo(0, 6);
  });

  it("rejects invalid timing", () => {
    expect(() => weatherAt(1, 0, 0, 1)).toThrow();
    expect(() => weatherAt(1, 0, 10, 20)).toThrow();
  });

  it("derives the seed from the world id (stable FNV-1a)", () => {
    expect(seedFromWorldId("vila-noel-do-bem")).toBe(WEATHER_SEED);
    expect(seedFromWorldId("a")).toBe(0xe40c292c);
  });
});

describe("scheduled events", () => {
  const eve = eventsForYear(2026)[0];

  it("starts, blends and expires by timestamp", () => {
    expect(eventWeight(eve, eve.startsAtMs - 1)).toBe(0);
    expect(eventWeight(eve, eve.startsAtMs + eve.transitionMs)).toBe(1);
    expect(eventWeight(eve, eve.endsAtMs)).toBe(0);
    expect(activeEvents(eve.startsAtMs + HOUR).map((a) => a.event.eventId)).toContain("christmas-eve-2026");
    expect(activeEvents(eve.endsAtMs + 1).map((a) => a.event.eventId)).not.toContain("christmas-eve-2026");
  });

  it("finds the new-year event that started in the previous SP year", () => {
    const ny = saoPauloToEpoch(2027, 1, 1, 0, 30);
    expect(activeEvents(ny).map((a) => a.event.eventId)).toContain("new-year-2026");
  });

  it("overrides the procedural weather while active", () => {
    const base = sampleWeatherSlot(WEATHER_SEED, 1);
    const out = applyEvents(base, [{ event: eve, weight: 1 }]);
    expect(out.sparkle).toBe(1);
    expect(out.aurora).toBe(1);
  });
});

describe("lighting keyframes", () => {
  it("wraps midnight without a jump", () => {
    const a = lookAt(23.9999, { cloudCover: 0, fogStrength: 0 });
    const b = lookAt(0, { cloudCover: 0, fogStrength: 0 });
    a.skyTop.forEach((v, i) => expect(Math.abs(v - b.skyTop[i])).toBeLessThan(1e-3));
    expect(KEYS[0]).toMatchObject({ ...KEYS[KEYS.length - 1], h: 0 });
  });

  it("is continuous through the day (no visual pops)", () => {
    for (let m = 0; m < 24 * 60; m++) {
      const a = lookAt(m / 60, { cloudCover: 0.3, fogStrength: 0.2 });
      const b = lookAt((m + 1) / 60, { cloudCover: 0.3, fogStrength: 0.2 });
      expect(Math.abs(a.sunIntensity - b.sunIntensity)).toBeLessThan(0.05);
      expect(Math.abs(a.artificial - b.artificial)).toBeLessThan(0.05);
    }
  });

  it("is bright at noon, lit by Christmas lights at night", () => {
    const noon = lookAt(12, { cloudCover: 0, fogStrength: 0 });
    const night = lookAt(23, { cloudCover: 0, fogStrength: 0 });
    expect(noon.sunIntensity).toBeGreaterThan(0.9);
    expect(noon.artificial).toBe(0);
    expect(night.artificial).toBe(1);
    expect(night.stars).toBe(1);
  });

  it("caps fog for gameplay visibility even in a blizzard", () => {
    expect(lookAt(12, { cloudCover: 1, fogStrength: 1 }).fogDensity).toBeLessThanOrEqual(MAX_FOG_DENSITY);
  });
});

describe("network clock", () => {
  const fake = () => {
    let t = 1000;
    return { mono: () => t, advance: (ms: number) => (t += ms) };
  };

  it("anchors to server time with RTT/2 and runs at 1:1 on the monotonic clock", () => {
    const m = fake();
    const c = new NetworkClock(m.mono, 0);
    m.advance(100); // response arrives at mono 1100
    c.update(1_000_000, 1000, 1100);
    expect(c.now()).toBe(1_000_050);
    m.advance(60_000);
    expect(c.now()).toBe(1_060_050);
  });

  it("rejects bad samples", () => {
    const c = new NetworkClock(fake().mono, 0);
    expect(c.update(1, 0, 6000)).toBeNull();
    expect(c.update(Number.NaN, 0, 10)).toBeNull();
    expect(c.update(1, 10, 0)).toBeNull();
    expect(c.getStatus().synced).toBe(false);
  });

  it("slews small corrections monotonically instead of jumping", () => {
    const m = fake();
    const c = new NetworkClock(m.mono, 0);
    c.update(1_000_000, 1000, 1000);
    m.advance(1000);
    c.update(1_001_500, 2000, 2000); // server says +500 ms ahead
    const t0 = c.now();
    m.advance(100);
    const t1 = c.now();
    expect(t1 - t0).toBeGreaterThanOrEqual(100);
    expect(t1 - t0).toBeLessThanOrEqual(110 + 1e-9);
    m.advance(10_000);
    expect(c.now()).toBeCloseTo(1_001_500 + 10_100, 6);
  });

  it("jumps on large errors", () => {
    const m = fake();
    const c = new NetworkClock(m.mono, 0);
    c.update(1_000_000, 1000, 1000);
    c.update(2_000_000, 1000, 1000);
    expect(c.now()).toBe(2_000_000);
  });
});

describe("snapshot contract", () => {
  it("accepts the server snapshot and rejects incompatible ones", () => {
    const snap = localSnapshot(123);
    expect(parseSnapshot(JSON.parse(JSON.stringify(snap)))).toMatchObject({ serverTimeMs: 123 });
    expect(parseSnapshot({ ...snap, timezone: "UTC" })).toBeNull();
    expect(parseSnapshot({ ...snap, weatherAlgorithmVersion: 2 })).toBeNull();
    expect(parseSnapshot({ ...snap, weatherTransitionMs: snap.weatherSlotDurationMs + 1 })).toBeNull();
    expect(parseSnapshot(null)).toBeNull();
  });
});
