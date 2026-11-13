/**
 * The store at arrival and around the game menu (IMPL-0022): the visitor lands in the village with no panel
 * open, the line that says how to walk goes away for good at the first walk, and the menu is a layer of its
 * own that a panel replaces. Runs in Node with a stubbed `localStorage`; the store is re-imported per test
 * because it reads the browser's storage once per page load.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let storage: Map<string, string>;

/** A fresh page load in the same browser (the storage is kept). */
async function load() {
  vi.resetModules();
  const { useVila, ZOOM_MAX, ZOOM_MIN } = await import("./store");
  const { sim } = await import("./sim");
  return { useVila, sim, ZOOM_MAX, ZOOM_MIN };
}

beforeEach(() => {
  storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("arrival", () => {
  it("lands in the village: no panel and no menu is open, and there is no welcome panel to open", async () => {
    const { useVila } = await load();
    expect(useVila.getState().panel).toEqual({ kind: "none" });
    expect(useVila.getState().menu).toBeNull();
  });

  it("can walk at once: a click plans the walk with nothing to close first", async () => {
    const { useVila, sim } = await load();
    useVila.getState().setTarget({ x: -8, z: 0 });
    expect(useVila.getState().target).toEqual({ x: -8, z: 0 });
    expect(sim.route.active).toBe(true);
  });
});

describe("the line that says how to walk", () => {
  it("shows on a first visit and goes away at the first walk, for good", async () => {
    const first = await load();
    expect(first.useVila.getState().moveHint).toBe(true);
    first.useVila.getState().setTarget({ x: -8, z: 0 });
    expect(first.useVila.getState().moveHint).toBe(false);
    const next = await load();
    expect(next.useVila.getState().moveHint).toBe(false);
  });

  it("keeps nothing about the person: one key that only says the visitor has walked", async () => {
    const { useVila } = await load();
    useVila.getState().setTarget({ x: -8, z: 0 });
    expect([...storage]).toEqual([["vila.moved.v1", "1"]]);
  });

  it("comes back on the next visit when it timed out without a walk", async () => {
    const first = await load();
    first.useVila.getState().dismissMoveHint();
    expect(first.useVila.getState().moveHint).toBe(false);
    expect(storage.size).toBe(0);
    expect((await load()).useVila.getState().moveHint).toBe(true);
  });

  it("stopping a walk is not a walk", async () => {
    const { useVila } = await load();
    useVila.getState().setTarget(null);
    expect(useVila.getState().moveHint).toBe(true);
  });

  it("still goes away where the storage is unavailable", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    const { useVila } = await load();
    expect(useVila.getState().moveHint).toBe(true);
    useVila.getState().setTarget({ x: -8, z: 0 });
    expect(useVila.getState().moveHint).toBe(false);
  });
});

describe("game menu state", () => {
  it("opens on its list, moves between its views and closes", async () => {
    const { useVila } = await load();
    useVila.getState().openMenu();
    expect(useVila.getState().menu).toBe("root");
    useVila.getState().showMenu("controls");
    expect(useVila.getState().menu).toBe("controls");
    useVila.getState().closeMenu();
    expect(useVila.getState().menu).toBeNull();
    useVila.getState().showMenu("help"); // a view of a closed menu opens nothing
    expect(useVila.getState().menu).toBeNull();
  });

  it("is not a panel: opening it leaves the panel, the walk and the camera as they were", async () => {
    const { useVila } = await load();
    useVila.getState().setTarget({ x: -8, z: 0 });
    const before = useVila.getState();
    useVila.getState().openMenu();
    const after = useVila.getState();
    expect(after.panel).toBe(before.panel);
    expect(after.target).toBe(before.target);
    expect([after.zoom, after.skyView]).toEqual([before.zoom, before.skyView]);
  });

  it("does not open over a panel, and a panel that opens takes its place", async () => {
    const { useVila } = await load();
    useVila.getState().open({ kind: "explore" });
    useVila.getState().openMenu();
    expect(useVila.getState().menu).toBeNull();
    useVila.getState().close();
    useVila.getState().openMenu();
    useVila.getState().open({ kind: "account" }); // e.g. a sign-in link of a blocked account
    expect(useVila.getState()).toMatchObject({ menu: null, panel: { kind: "account" } });
  });
});

describe("zoom without buttons", () => {
  it("takes the factor of a key or of the wheel, within the limits, and remembers it in this browser", async () => {
    const { useVila, ZOOM_MAX, ZOOM_MIN } = await load();
    expect(useVila.getState().zoom).toBe(1);
    useVila.getState().zoomBy(1 / 1.15);
    expect(useVila.getState().zoom).toBeCloseTo(1 / 1.15);
    expect(Number(storage.get("vila.zoom.v1"))).toBeCloseTo(1 / 1.15);
    for (let i = 0; i < 20; i++) useVila.getState().zoomBy(1 / 1.15);
    expect(useVila.getState().zoom).toBe(ZOOM_MIN);
    for (let i = 0; i < 20; i++) useVila.getState().zoomBy(1.15);
    expect(useVila.getState().zoom).toBe(ZOOM_MAX);
    expect((await load()).useVila.getState().zoom).toBe(ZOOM_MAX);
  });
});
