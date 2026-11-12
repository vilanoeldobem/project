import { describe, expect, it } from "vitest";

import { CYCLE } from "@vila/shared/environment/config";
import { saoPauloToEpoch } from "@vila/shared/environment/time";

import { villageNow } from "./villageClock";

const MINUTE = 60_000;

/** Epoch of a São Paulo wall-clock time on a fixed day (the zone has had no DST since 2019). */
const at = (hhmm: string) => {
  const [hour, minute] = hhmm.split(":").map(Number);
  return saoPauloToEpoch(2026, 11, 30, hour, minute);
};

describe("village clock", () => {
  it("formats the São Paulo wall clock as HH:MM, whatever the host time zone", () => {
    // 2026-11-30T03:05:00Z is 00:05 in São Paulo (UTC-3).
    expect(villageNow(Date.UTC(2026, 10, 30, 3, 5)).time).toBe("00:05");
    expect(villageNow(at("09:07")).time).toBe("09:07");
    expect(villageNow(at("23:59")).time).toBe("23:59");
  });

  it("switches phase exactly on the shared cycle boundaries", () => {
    const boundaries: Array<[string, string, string]> = [
      [CYCLE.dawnStart, "Noite na Vila", "Amanhecer na Vila"],
      [CYCLE.dayStart, "Amanhecer na Vila", "Dia na Vila"],
      [CYCLE.duskStart, "Dia na Vila", "Entardecer na Vila"],
      [CYCLE.nightStart, "Entardecer na Vila", "Noite na Vila"],
    ];
    for (const [boundary, before, after] of boundaries) {
      const epoch = at(boundary);
      expect(villageNow(epoch - MINUTE).phase, `one minute before ${boundary}`).toBe(before);
      expect(villageNow(epoch - 1).phase, `one millisecond before ${boundary}`).toBe(before);
      expect(villageNow(epoch).phase, `at ${boundary}`).toBe(after);
      expect(villageNow(epoch).time, `clock at ${boundary}`).toBe(boundary);
    }
  });

  it("keeps the night across midnight", () => {
    expect(villageNow(at("23:59")).phase).toBe("Noite na Vila");
    expect(villageNow(at("00:00")).phase).toBe("Noite na Vila");
    expect(villageNow(at("04:59")).phase).toBe("Noite na Vila");
  });

  it("labels each phase in pt-BR", () => {
    expect(villageNow(at("05:30")).phase).toBe("Amanhecer na Vila");
    expect(villageNow(at("12:00")).phase).toBe("Dia na Vila");
    expect(villageNow(at("17:20")).phase).toBe("Entardecer na Vila");
    expect(villageNow(at("19:00")).phase).toBe("Noite na Vila");
  });
});
