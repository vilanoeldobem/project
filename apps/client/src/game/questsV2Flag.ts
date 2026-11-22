/**
 * quests-v2 feature flag (PROPOSTA). Story v2 is on only when this page's flag (`VITE_QUESTS_V2_ENABLED`
 * or `?quests2=1` on localhost/dev) AND the API's `GET /config.questsV2` agree. Until `/config` answers, and
 * whenever the API cannot be reached, v2 stays off. The v1 epilogue keeps its own independent flag.
 */
import { create } from "zustand";

import { STORY_CATALOG } from "@vila/shared/game/quests-v2/catalog";

import { debugAllowed } from "../environment/runtime";

const PAGE_FLAG =
  import.meta.env.VITE_QUESTS_V2_ENABLED === "true" ||
  (debugAllowed() && typeof location !== "undefined" && new URLSearchParams(location.search).get("quests2") === "1");

const useServerFlag = create<{ on: boolean }>(() => ({ on: false }));

export const setServerQuestsV2 = (on: boolean) => useServerFlag.setState({ on });

export const questsV2Enabled = () => PAGE_FLAG && useServerFlag.getState().on;

export const useQuestsV2Enabled = () => useServerFlag((s) => PAGE_FLAG && s.on);

/** The ids the API treats as story-v2 entries (books and postgame), not the v1 epilogue. */
export const STORY_V2_QUEST_IDS: ReadonlySet<string> = new Set(
  STORY_CATALOG.quests.filter((q) => "book" in q).map((q) => q.id)
);
