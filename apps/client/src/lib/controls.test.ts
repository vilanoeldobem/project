/**
 * The "Controles" list of the game menu (IMPL-0022) is built from the tables the handlers read, so it cannot
 * say something the game does not do: the keyboard rows are the key map, the zoom rows are the wired gestures.
 */
import { describe, expect, it } from "vitest";

import { controls, OPEN, VISIT, WALK } from "./controls";
import { boundAction, KEY_BINDINGS } from "./hud-keys";
import { ZOOM_GESTURES } from "./zoom-gestures";

const group = (device: string) => controls().find((g) => g.device === device)!;

describe("controls list", () => {
  it("has one group per device, in pt-BR", () => {
    expect(controls().map((g) => [g.device, g.label])).toEqual([
      ["keyboard", "Teclado"],
      ["mouse", "Mouse"],
      ["touch", "Toque"],
    ]);
  });

  it("lists the keyboard exactly as the key map has it: same rows, same order, same words", () => {
    expect(group("keyboard").rows).toEqual(KEY_BINDINGS.map((b) => ({ input: b.caps, does: b.does })));
    // Every cap on screen is a key the handler answers to (Esc is the cap of Escape).
    for (const binding of KEY_BINDINGS)
      for (const cap of binding.caps) expect(binding.keys.some((key) => key === cap || key.startsWith(cap))).toBe(true);
    for (const binding of KEY_BINDINGS) for (const key of binding.keys) expect(boundAction(key)).toBe(binding.action);
  });

  it("says how to zoom on every device now that there are no zoom buttons", () => {
    const zoomRows = (device: string) => group(device).rows.filter((r) => /câmera/.test(r.does));
    expect(zoomRows("keyboard").map((r) => r.input)).toEqual([["+", "="], ["-"]]);
    expect(zoomRows("mouse")).toEqual(ZOOM_GESTURES.filter((g) => g.device === "mouse").map((g) => ({ input: [g.input], does: g.does })));
    expect(zoomRows("touch")).toEqual(ZOOM_GESTURES.filter((g) => g.device === "touch").map((g) => ({ input: [g.input], does: g.does })));
    expect(zoomRows("mouse")).toHaveLength(1);
    expect(zoomRows("touch")).toHaveLength(1);
    // Every wired gesture is listed.
    const listed = controls().flatMap((g) => g.rows.map((r) => r.input[0]));
    for (const gesture of ZOOM_GESTURES) expect(listed).toContain(gesture.input);
  });

  it("lists walking and opening for the mouse and for touch", () => {
    for (const device of ["mouse", "touch"] as const) {
      expect(group(device).rows.slice(0, 3)).toEqual([
        { input: [WALK.input[device]], does: WALK.does },
        { input: [OPEN.input[device]], does: OPEN.does },
        { input: [VISIT.input[device]], does: VISIT.does },
      ]);
    }
  });

  it("says what a click on a shop, a sign or a residential house does, which is not what a click on the tree does", () => {
    // The tree, an NGO's house and a lot open at once; the places of the expanded village are walked to first.
    for (const device of ["mouse", "touch"] as const) {
      expect(OPEN.input[device]).toMatch(/árvore.*casa de ONG.*terreno/);
      expect(VISIT.input[device]).toMatch(/loja.*placa.*casa residencial/);
    }
    expect(OPEN.does).toMatch(/^Abrir/);
    expect(VISIT.does).toMatch(/^Ir até lá; de perto, abrir/);
    // The key that opens what is near names the new places too.
    const activate = group("keyboard").rows.find((r) => r.input.includes("E"))!;
    expect(activate.does).toMatch(/uma loja, uma placa/);
  });

  it("has no empty row and no row twice", () => {
    for (const g of controls()) {
      const seen = new Set<string>();
      for (const row of g.rows) {
        expect(row.input.length > 0 && row.input.every((i) => i.length > 0) && row.does.length > 0).toBe(true);
        expect(seen.has(row.input.join())).toBe(false);
        seen.add(row.input.join());
      }
    }
  });
});

describe("walking press", () => {
  it("is the main mouse button or the first finger; a second finger or another button does not walk", () => {
    expect(WALK.accepts({ button: 0, isPrimary: true })).toBe(true);
    expect(WALK.accepts({ button: 0, isPrimary: false })).toBe(false);
    expect(WALK.accepts({ button: 2, isPrimary: true })).toBe(false);
    expect(WALK.accepts({ button: 1, isPrimary: true })).toBe(false);
  });
});
