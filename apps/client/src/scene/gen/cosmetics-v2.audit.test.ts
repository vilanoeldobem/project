/** The 60 book cosmetics: CSV, catalogue, model budget and the append-only wire order. */
import { describe, expect, it } from "vitest";

import { COSMETICS as V1, DEFAULT_LOOK, SLOTS } from "@vila/shared/game/cosmetics";
import { COSMETICS_V2, isPaid, isUnlockedIn, sanitizeLookIn } from "@vila/shared/game/cosmetics-v2";
import { EMPTY_PROGRESS } from "@vila/shared/game/progress";
import * as B01 from "@vila/shared/game/quests-v2/books/book-01";
import * as B02 from "@vila/shared/game/quests-v2/books/book-02";
import * as B03 from "@vila/shared/game/quests-v2/books/book-03";
import * as B04 from "@vila/shared/game/quests-v2/books/book-04";
import * as B05 from "@vila/shared/game/quests-v2/books/book-05";
import * as B06 from "@vila/shared/game/quests-v2/books/book-06";
import * as B07 from "@vila/shared/game/quests-v2/books/book-07";
import * as B08 from "@vila/shared/game/quests-v2/books/book-08";
import * as B09 from "@vila/shared/game/quests-v2/books/book-09";
import * as B10 from "@vila/shared/game/quests-v2/books/book-10";

import { measure } from "./budget";
import { COSMETIC_MODELS_V2 } from "./cosmetics-v2";

const BOOKS = [B01, B02, B03, B04, B05, B06, B07, B08, B09, B10] as const;
const CSV_COLUMNS = ["cosmetic_id", "slot", "nome", "origem", "premium", "recompensa", "orcamento_voxels", "orcamento_faces"];

const CSV = import.meta.glob("../../../../../content/proposals/quests-v2/book-*/cosmetics.csv", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function rowsOf(book: number): Record<string, string>[] {
  const suffix = `/book-${String(book).padStart(2, "0")}/cosmetics.csv`;
  const text = Object.entries(CSV).find(([path]) => path.endsWith(suffix))?.[1];
  expect(text, suffix).toBeTruthy();
  const [header, ...lines] = (text ?? "").trim().split(/\r?\n/);
  expect(header.split(",")).toEqual(CSV_COLUMNS);
  return lines.map((line: string) => {
    const cells = line.split(",");
    return Object.fromEntries(header.split(",").map((column: string, index: number) => [column, (cells[index] ?? "").trim()]));
  });
}

describe("the 60 book cosmetics", () => {
  it("has six rows per book and matches the module order, names, slots and premium flags", () => {
    let total = 0;
    for (const [index, book] of BOOKS.entries()) {
      const rows = rowsOf(index + 1);
      expect(rows, `book-${index + 1}`).toHaveLength(6);
      expect(book.COSMETICS, `book-${index + 1}`).toHaveLength(6);
      expect(rows).toHaveLength(book.COSMETICS.length);
      for (const [position, row] of rows.entries()) {
        const item = book.COSMETICS[position];
        expect(item.id).toBe(row.cosmetic_id);
        expect(item.slot).toBe(row.slot);
        expect(item.name).toBe(row.nome);
        expect(isPaid(item)).toBe(row.premium === "true");
        expect(row.orcamento_voxels).toBe("40");
        expect(row.orcamento_faces).toBe("140");
        if (row.premium === "true") {
          expect(item.unlock, item.id).toEqual({ kind: "paid" });
          expect(item.unlock).not.toHaveProperty("price");
        } else {
          expect(item.unlock.kind, item.id).toBe("mission");
          if (item.unlock.kind === "mission") expect(item.unlock.missionId).toBe(row.recompensa);
        }
        total++;
      }
      expect(rows.filter((row) => row.premium === "true")).toHaveLength(3);
      expect(rows.filter((row) => row.premium === "false")).toHaveLength(3);
    }
    expect(total).toBe(60);
  });

  it("has a model for every row inside the 40/140 layer budget", () => {
    for (const [index, book] of BOOKS.entries()) {
      for (const item of book.COSMETICS) {
        const model = COSMETIC_MODELS_V2.find((candidate) => candidate.id === item.id);
        expect(model, `book-${index + 1} ${item.id}`).toBeDefined();
        if (!model) continue;
        const measured = measure(model.layer.voxels);
        expect(measured.voxels, item.id).toBeLessThanOrEqual(40);
        expect(measured.faces, item.id).toBeLessThanOrEqual(140);
      }
    }
    expect(new Set(COSMETIC_MODELS_V2.map((model) => model.id)).size).toBe(COSMETIC_MODELS_V2.length);
  });

  it("keeps the 160-item union, the v1 prefix and the append-only slot order", () => {
    expect(V1).toHaveLength(100);
    expect(COSMETICS_V2).toHaveLength(160);
    expect(COSMETICS_V2.slice(0, V1.length)).toEqual(V1);
    for (const slot of SLOTS) {
      const expected = [...V1.filter((item) => item.slot === slot), ...BOOKS.flatMap((book) => book.COSMETICS.filter((item) => item.slot === slot))];
      const actual = COSMETICS_V2.filter((item) => item.slot === slot);
      expect(actual.map((item) => item.id), slot).toEqual(expected.map((item) => item.id));
      expect(actual, slot).toHaveLength(16);
    }
  });

  it("never unlocks or equips a paid item and has no price or purchase field", () => {
    const paid = COSMETICS_V2.filter(isPaid);
    expect(paid).toHaveLength(50);
    for (const item of paid) {
      expect(Object.keys(item.unlock)).toEqual(["kind"]);
      expect(item).not.toHaveProperty("price");
      expect(item).not.toHaveProperty("purchase");
      expect(isUnlockedIn(COSMETICS_V2, item, { ...EMPTY_PROGRESS, xp: 100_000 })).toBe(false);
      expect(sanitizeLookIn(COSMETICS_V2, { [item.slot]: item.id }, { ...EMPTY_PROGRESS, xp: 100_000 })[item.slot]).toBe(DEFAULT_LOOK[item.slot]);
    }
  });
});
