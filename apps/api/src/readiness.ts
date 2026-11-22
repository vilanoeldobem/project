/**
 * GET /ready: a real round trip to each dependency the API has bound (audit §7.6). `/health` only says the Worker
 * answers; this says whether D1 and the R2 bucket answer too. Read-only: one `SELECT 1` and one `head` of a key that
 * never exists, so nothing is written, created or listed, and no file name or object key is reported.
 */
import type { Env } from "./api";

export type Check = "ok" | "fail" | "off";

/** Each probe gets this long before it counts as failed: a hung dependency must not hang the probe. */
export const READY_TIMEOUT_MS = 2000;
/** Never a stored object: stored keys are built from an NGO id and a random id (`objectKey`, files.ts). */
const PROBE_KEY = "readiness-probe";

async function probe(run: () => Promise<unknown>): Promise<Check> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      run(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), READY_TIMEOUT_MS);
      }),
    ]);
    return "ok";
  } catch {
    return "fail";
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function readiness(env: Env): Promise<{ ok: boolean; checks: { db: Check; files: Check } }> {
  const db = env.DB;
  const files = env.FILES;
  const [dbCheck, filesCheck] = await Promise.all([
    db ? probe(() => db.prepare("SELECT 1 AS one").first()) : Promise.resolve<Check>("fail"),
    files ? probe(() => files.head(PROBE_KEY)) : Promise.resolve<Check>("off"),
  ]);
  return { ok: dbCheck === "ok" && filesCheck !== "fail", checks: { db: dbCheck, files: filesCheck } };
}
