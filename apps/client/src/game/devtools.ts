/**
 * Localhost/dev-only automation hooks for scripts/verify.mjs (never exposed in production builds served
 * from a real hostname). Lets the browser test drive the avatar and read outcomes without pixel hunting.
 */
import { debugAllowed } from "../environment/runtime";
import { events, type GameEvent } from "./events";
import { remotes } from "../net/multiplayer";
import { sim } from "./sim";
import { lifeAt, lifeNow, lifeReport } from "./village-life";
import { useVila } from "./store";
import { QUESTS, questState } from "@vila/shared/game/quests";

export interface VilaDevtools {
  walkTo: (x: number, z: number) => void;
  pose: () => { x: number; z: number };
  progress: () => ReturnType<typeof useVila.getState>["progress"];
  /** Gameplay events seen since load (type only, newest last). */
  events: string[];
  /** Ad-hoc hooks for the verify scripts (`never[]` keeps typed callers out; the scripts are plain JS). */
  extra: Record<string, (...args: never[]) => unknown>;
}

declare global {
  interface Window {
    __vila?: VilaDevtools;
  }
}

/** Filled by the scene while it is mounted: world point → page pixel (the verify scripts click on things by where they are). */
export const probe: { project: ((x: number, y: number, z: number) => { x: number; y: number }) | null } = { project: null };

export function installDevtools() {
  if (typeof window === "undefined" || !debugAllowed()) return;
  const log: string[] = [];
  events.on((e: GameEvent) => {
    if (e.type !== "step") log.push(e.type);
  });
  window.__vila = {
    walkTo: (x, z) => useVila.getState().setTarget({ x, z }),
    pose: () => ({ x: sim.pose.x, z: sim.pose.z }),
    progress: () => useVila.getState().progress,
    events: log,
    extra: {
      remotes: () => [...remotes.values()].map((r) => ({ id: r.id, x: r.x, z: r.z })),
      /** Resolved walk destination, or null once the avatar arrived or gave up (verify-collisions.mjs). */
      target: () => useVila.getState().target,
      /** Cost of the last planned walk: waypoints, grid nodes expanded and replans after getting stuck. */
      route: () => ({ waypoints: sim.route.count, expanded: sim.route.expanded, replans: sim.route.replans, direct: sim.route.direct }),
      /**
       * Puts the avatar at a point, standing still, with no walk and no panel (verify scripts: a state to
       * check from, without the walk there). The point must be walkable: nothing is resolved.
       */
      teleport: (x, z) => {
        const { body, pose, route } = sim;
        body.x = pose.x = Number(x);
        body.z = pose.z = Number(z);
        body.vx = body.vz = 0;
        route.active = false;
        useVila.setState({ target: null, panel: { kind: "none" }, skyView: false });
      },
      /** The target of the contextual action, the open panel, the camera state and where a world point is on the page. */
      nearby: () => useVila.getState().nearby,
      panel: () => useVila.getState().panel,
      view: () => ({ ...sim.view, skyView: useVila.getState().skyView, zoom: useVila.getState().zoom }),
      setSkyView: (on) => useVila.getState().setSkyView(Boolean(on)),
      setZoom: (zoom) => useVila.setState({ zoom: Number(zoom) }),
      project: (x, y, z) => probe.project?.(Number(x), Number(y), Number(z)) ?? null,
      /** The village's characters (IMPL-0025): as the shared simulation has them now, and at any village time. */
      life: () => lifeReport(),
      lifeAt: (epochMs) => lifeAt(Number(epochMs)),
      lifeNow: () => lifeNow(),
      quest: (id) => questState(useVila.getState().progress, String(id)),
      quests: () => QUESTS.map((q) => ({ id: q.id, state: questState(useVila.getState().progress, q.id) })),
    },
  };
}
