/**
 * GET /ready (audit §7.6): `/health` says the Worker answers; this asks one presence room to answer too. The room
 * replies from memory to `READY_PATH` without a WebSocket, a join or any storage (room-do.ts).
 */
import type { Env } from "./env";

export const READY_PATH = "/ready";
/** The probe asks room 0, the one every first visitor joins: if it cannot answer, nobody can play together. */
export const READY_ROOM = "plaza-0";
export const READY_TIMEOUT_MS = 2000;

export async function roomsReady(env: Env): Promise<"ok" | "fail"> {
  if (!env.ROOMS) return "fail";
  const stub = env.ROOMS.get(env.ROOMS.idFromName(READY_ROOM));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const res = await Promise.race([
      stub.fetch(`https://room.internal${READY_PATH}`),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), READY_TIMEOUT_MS);
      }),
    ]);
    return res.status === 204 ? "ok" : "fail";
  } catch {
    return "fail";
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
