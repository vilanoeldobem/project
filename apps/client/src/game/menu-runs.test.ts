/**
 * The game menu pauses nothing (IMPL-0022). With the menu open: the walk the frame loop follows is still the
 * planned route and the fixed steps still move the avatar; the presence connection stays open, keeps its timers,
 * keeps sending the pose and keeps taking the other visitors' poses. A panel, by contrast, holds the walk (as it
 * always did), which shows the gate under test is the one the loop uses (`walkRoute`, read by `Player`).
 * Browser stand-ins as in `net/multiplayer.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STEP } from "@vila/shared/game/motion";
import { stepWalk } from "@vila/shared/game/navigation";
import { OBSTACLES, SPAWN } from "@vila/shared/game/world";

import { clearRemovedHold, connectPresence, remotes, sampleRemotes, useNet } from "../net/multiplayer";
import { sim, walkRoute } from "./sim";
import { useVila } from "./store";

class FakeSocket {
  static readonly OPEN = 1;
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  closedWith: [number?, string?] | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(msg: string) {
    this.sent.push(msg);
  }
  close(code?: number, reason?: string) {
    this.readyState = 3;
    this.closedWith = [code, reason];
  }
  welcome() {
    this.readyState = 1;
    this.onopen?.();
    this.onmessage?.({ data: '["w",7,0]' });
  }
}

/** One second of the frame loop's simulation, exactly as `Player` runs it: the gate, then fixed steps. */
function simulateOneSecond() {
  for (let i = 0; i < Math.round(1 / STEP); i++) {
    const r = stepWalk(sim.body, walkRoute(useVila.getState()), sim.nav, OBSTACLES);
    if (r.targetDone) useVila.getState().setTarget(null);
  }
  // `Player` interpolates the render pose from the body; at a step boundary they are the same.
  Object.assign(sim.pose, { x: sim.body.x, z: sim.body.z, yaw: sim.body.yaw, speed: Math.hypot(sim.body.vx, sim.body.vz) });
}
const moved = () => Math.hypot(sim.body.x - SPAWN.x, sim.body.z - SPAWN.z);
const poses = (socket: FakeSocket) => socket.sent.filter((m) => m.startsWith('["p"'));

describe("the game menu pauses nothing", () => {
  let disconnect: () => void;
  let socket: FakeSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.all = [];
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("document", Object.assign(new EventTarget(), { hidden: false }));
    clearRemovedHold();
    Object.assign(sim.body, { x: SPAWN.x, z: SPAWN.z, vx: 0, vz: 0 });
    Object.assign(sim.pose, { x: SPAWN.x, z: SPAWN.z, speed: 0 });
    useVila.setState({ panel: { kind: "none" }, menu: null });
    disconnect = connectPresence();
    socket = FakeSocket.all[0];
    socket.welcome();
    useVila.getState().setTarget({ x: -8, z: 0 });
  });
  afterEach(() => {
    disconnect();
    useVila.getState().setTarget(null);
    useVila.setState({ panel: { kind: "none" }, menu: null });
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps the avatar walking: the frame loop's route is untouched while the menu is open", () => {
    useVila.getState().openMenu();
    expect(useVila.getState().menu).toBe("root");
    expect(walkRoute(useVila.getState())).toBe(sim.route);
    expect(sim.route.active).toBe(true);
    simulateOneSecond();
    expect(moved()).toBeGreaterThan(3);
    for (const view of ["settings", "controls", "help", "leave"] as const) {
      useVila.getState().showMenu(view);
      expect(walkRoute(useVila.getState())).toBe(sim.route);
    }
  });

  it("is unlike a panel, which holds the walk until it closes", () => {
    useVila.getState().open({ kind: "missions" });
    expect(walkRoute(useVila.getState())).toBeNull();
    simulateOneSecond();
    expect(moved()).toBe(0);
    useVila.getState().close();
    simulateOneSecond();
    expect(moved()).toBeGreaterThan(3);
  });

  it("keeps the presence connection as it was: same socket, same timers, the pose still sent", () => {
    vi.advanceTimersByTime(500);
    const timers = vi.getTimerCount();
    const sentBefore = poses(socket).length;

    useVila.getState().openMenu();
    simulateOneSecond();
    vi.advanceTimersByTime(500);

    expect(FakeSocket.all).toHaveLength(1);
    expect(socket.closedWith).toBeNull();
    expect(useNet.getState().status).toBe("online");
    expect(vi.getTimerCount()).toBe(timers);
    expect(poses(socket).length).toBeGreaterThan(sentBefore); // the walk behind the menu reaches the room
    expect(socket.sent.filter((m) => m.startsWith('["k"'))).toHaveLength(1); // nothing re-announced

    useVila.getState().closeMenu();
    vi.advanceTimersByTime(500);
    expect(FakeSocket.all).toHaveLength(1);
    expect(socket.closedWith).toBeNull();
    expect(vi.getTimerCount()).toBe(timers);
  });

  it("keeps the other visitors moving behind it", () => {
    useVila.getState().openMenu();
    const now = Date.now();
    socket.onmessage?.({ data: JSON.stringify(["s", now, [[9, 1, 1, 0, 4, 0]]]) });
    vi.advanceTimersByTime(100);
    socket.onmessage?.({ data: JSON.stringify(["s", now + 100, [[9, 2, 1, 0, 4, 0]]]) });
    expect(useNet.getState().others).toBe(1);
    sampleRemotes(now + 100 + 150 - 50); // render time: halfway between the two poses
    expect(remotes.get(9)!.x).toBeCloseTo(1.5);
  });
});
