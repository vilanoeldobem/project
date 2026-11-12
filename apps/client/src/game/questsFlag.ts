/**
 * quests-v1 feature flag (PROPOSTA; DEC-039..042, PEN-025; IMPL-0013). Quest features are on only when both
 * sides agree: this page (a build with `VITE_QUESTS_V1_ENABLED=true`, or `?quests=1` on a localhost/dev page)
 * AND the API (`GET /config` → `quests`, i.e. its `QUESTS_V1_ENABLED`). Until `/config` answers, and whenever
 * the API cannot be reached, quests stay off. Production keeps both sides off until the owner approves the
 * catalog.
 */
import { create } from "zustand";

import { QUESTS } from "@vila/shared/game/quests";

import { debugAllowed } from "../environment/runtime";

/** This page's side of the flag. Constant for the page load, so the frame loop never parses the URL. */
const PAGE_FLAG =
  import.meta.env.VITE_QUESTS_V1_ENABLED === "true" ||
  (debugAllowed() && typeof location !== "undefined" && new URLSearchParams(location.search).get("quests") === "1");

/** The API's side of the flag, as last read from `/config`. */
const useServerFlag = create<{ on: boolean }>(() => ({ on: false }));

export const setServerQuests = (on: boolean) => useServerFlag.setState({ on });

/** Current value, for effects, handlers and the frame loop. */
export const questsEnabled = () => PAGE_FLAG && useServerFlag.getState().on;

/** Same value as a hook: components re-render when `/config` arrives. */
export const useQuestsEnabled = () => useServerFlag((s) => PAGE_FLAG && s.on);

const QUEST_IDS = new Set(QUESTS.map((q) => q.id));

/** The events this page may queue or send to the API: with quests off, quest events are left out. */
export const sendableEvents = <E extends { missionId: string }>(events: E[]): E[] =>
  questsEnabled() ? events : events.filter((e) => !QUEST_IDS.has(e.missionId));
