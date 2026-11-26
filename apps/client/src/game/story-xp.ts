export interface XpGain {
  total: number;
  quick: { id: string; xp: number }[];
  unknown: string[];
}

/**
 * XP gained between two progress snapshots, read from the canonical story manifest. The verifiers compare
 * this exactly: a range would let a duplicated narrative credit pass as quick-mission XP (DEC-042: XP once).
 */
export function newlyCompletedXp(
  before: Record<string, true>,
  after: Record<string, true>,
  entries: readonly { id: string; kind: string; xp: number }[]
): XpGain {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  let total = 0;
  const quick: XpGain["quick"] = [];
  const unknown: string[] = [];
  for (const id of Object.keys(after)) {
    if (before[id]) continue;
    const entry = byId.get(id);
    if (!entry) {
      unknown.push(id);
      continue;
    }
    total += entry.xp;
    if (entry.kind === "quick") quick.push({ id, xp: entry.xp });
  }
  return { total, quick, unknown };
}
