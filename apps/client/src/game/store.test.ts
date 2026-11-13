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
  const { useVila, MOVE_HINT_MS, ZOOM_MAX, ZOOM_MIN } = await import("./store");
  const { sim } = await import("./sim");
  return { useVila, sim, MOVE_HINT_MS, ZOOM_MAX, ZOOM_MIN };
}

beforeEach(() => {
  storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

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

  it("is not shown again to a visitor who walked after it had timed out", async () => {
    const first = await load();
    first.useVila.getState().dismissMoveHint(); // 20 s without a walk
    first.useVila.getState().setTarget({ x: -8, z: 0 }); // the first walk, with the line already gone
    expect([...storage]).toEqual([["vila.moved.v1", "1"]]);
    expect((await load()).useVila.getState().moveHint).toBe(false);
  });

  it("writes the key at the first walk only, not at every click on the ground", async () => {
    const writes: string[] = [];
    vi.stubGlobal("localStorage", { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => (writes.push(k), void storage.set(k, v)) });
    const { useVila } = await load();
    for (const x of [-8, -6, -4]) useVila.getState().setTarget({ x, z: 0 });
    expect(writes).toEqual(["vila.moved.v1"]);
    const back = await load();
    back.useVila.getState().setTarget({ x: -8, z: 0 });
    expect(writes).toEqual(["vila.moved.v1"]);
  });

  it("goes away 20 s after the scene is on screen, whatever opened and closed in the meantime", async () => {
    vi.useFakeTimers();
    const { useVila, MOVE_HINT_MS } = await load();
    expect(MOVE_HINT_MS).toBe(20_000);
    vi.advanceTimersByTime(60_000); // the village is still loading: the 20 s have not started
    expect(useVila.getState()).toMatchObject({ moveHint: true, sceneReady: false });
    useVila.getState().sceneUp();
    expect(useVila.getState().sceneReady).toBe(true);
    // The line leaves the screen and comes back with every panel and with the menu: the 20 s are the page's.
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(3_000);
      useVila.getState().open({ kind: "indicators" });
      vi.advanceTimersByTime(1_500);
      useVila.getState().close();
      useVila.getState().openMenu();
      vi.advanceTimersByTime(1_500);
      useVila.getState().closeMenu();
    }
    vi.advanceTimersByTime(MOVE_HINT_MS - 18_000 - 1);
    expect(useVila.getState().moveHint).toBe(true);
    vi.advanceTimersByTime(1);
    expect(useVila.getState().moveHint).toBe(false);
    expect(storage.size).toBe(0); // timing out is not walking: the line comes back on the next visit
  });

  it("counts the 20 s once: the scene coming up again does not start them over", async () => {
    vi.useFakeTimers();
    const { useVila, MOVE_HINT_MS } = await load();
    useVila.getState().sceneUp();
    vi.advanceTimersByTime(MOVE_HINT_MS - 1_000);
    useVila.getState().sceneUp();
    vi.advanceTimersByTime(1_000);
    expect(useVila.getState().moveHint).toBe(false);
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
