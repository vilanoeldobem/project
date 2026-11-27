/**
 * The unified story catalog (PROPOSTA): book-00 postgame, the ten books, the v1 epilogue and the quick
 * missions. The four state functions receive the catalog; no fixed singleton is imported by callers.
 * `V1_CATALOG` is the exact v1 behavior used by defaults and tests.
 */
import { MISSIONS, type Progress } from "../progress";
import { QUESTS } from "../quests";
import { questStateIn } from "./engine";
import * as B00 from "./books/book-00-epilogue";
import * as B01 from "./books/book-01";
import * as B02 from "./books/book-02";
import * as B03 from "./books/book-03";
import * as B04 from "./books/book-04";
import * as B05 from "./books/book-05";
import * as B06 from "./books/book-06";
import * as B07 from "./books/book-07";
import * as B08 from "./books/book-08";
import * as B09 from "./books/book-09";
import * as B10 from "./books/book-10";
import { MINIGAMES } from "./minigames";
import type { CatalogQuest, StoryCatalog, StoryQuest } from "./types";

const BOOKS = [B01, B02, B03, B04, B05, B06, B07, B08, B09, B10] as const;

export const V1_CATALOG: StoryCatalog = {
  quests: QUESTS,
  milestones: [],
  minigames: MINIGAMES,
  quickMissions: MISSIONS,
};

export const STORY_CATALOG: StoryCatalog = {
  quests: [...BOOKS.flatMap((book) => book.QUESTS), ...QUESTS, ...B00.QUESTS],
  milestones: [...BOOKS.flatMap((book) => book.MILESTONES), ...B00.MILESTONES],
  minigames: MINIGAMES,
  quickMissions: MISSIONS,
};

export { activeInventoryIn, activeQuestsIn, applyEventIn, canAcceptIn, prerequisitesOf, questProgressIn, questStateIn } from "./engine";

export const isStoryQuest = (q: CatalogQuest): q is StoryQuest => "book" in q;

/**
 * Books whose story is open: at least one quest of the book is not locked. The cast of a book is drawn only then,
 * so the village shows the story that is reachable today (IMPL-0037); the v1 anchors (book 0) always stay.
 */
export function openBooksIn(catalog: StoryCatalog, p: Progress): ReadonlySet<number> {
  const books = new Set<number>();
  for (const quest of catalog.quests) {
    if (!isStoryQuest(quest)) continue;
    if (questStateIn(catalog, p, quest.id) !== "locked") books.add(quest.book);
  }
  return books;
}

/** True when the character belongs to a book that is open (or to the always-open v1 world). */
export const npcOpenIn = (npc: { book: number }, books: ReadonlySet<number>): boolean => npc.book === 0 || books.has(npc.book);

/**
 * The catalog visible to a page with each flag: v1 off hides the epilogue and postgame, v2 off hides the
 * books. Quests are always on (IMPL-0037), so the v1 epilogue no longer waits for book V; books come first,
 * then the epilogue, then postgame, so "next step" never starts at `pg1-01`.
 */
export function catalogFor(v1: boolean, v2: boolean): StoryCatalog {
  const books = v2 ? STORY_CATALOG.quests.filter((quest) => isStoryQuest(quest) && quest.book > 0) : [];
  const postgame = v2 && v1 ? STORY_CATALOG.quests.filter((quest) => isStoryQuest(quest) && quest.book === 0) : [];
  const epilogue = v1 ? QUESTS : [];
  return {
    quests: [...books, ...epilogue, ...postgame],
    milestones: v2 ? STORY_CATALOG.milestones : [],
    minigames: MINIGAMES,
    quickMissions: MISSIONS,
  };
}

export { CREDITS, EPILOGUE_FINAL_QUESTS, FINAL_SCENE, finalSceneReady } from "./books/book-00-epilogue";

export const STORY_QUEST_IDS: ReadonlySet<string> = new Set(STORY_CATALOG.quests.map((q) => q.id));
export const STORY_ENTRY_IDS: ReadonlySet<string> = new Set([...STORY_QUEST_IDS, ...MISSIONS.map((m) => m.id)]);
