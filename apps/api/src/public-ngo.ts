/** Published NGO content for a village house (D09, P03/P04, DEC-028/037). No application-only fields. */
import { NGO_TAGS, type NgoProject } from "@vila/shared/accounts/validate";

import { publicPhotos } from "./ngo-photos";
import { HttpError, json, NO_STORE } from "./http";
import type { Env } from "./api";

interface PublicNgoRow {
  id: string;
  name: string;
  summary: string | null;
  description: string | null;
  tags: string | null;
  projects: string | null;
  lotId: string;
}

/** Older rows may have no JSON; malformed or non-array data must never become a public object. */
function arrayOf(raw: string | null): unknown[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export async function publicNgo(env: Env, id: string): Promise<Response> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new HttpError(404, "not_found");
  if (!env.DB) throw new HttpError(503, "db_unavailable");
  // The published lot is the actual public association; requested_lot_id only records the application.
  const row = await env.DB.prepare(
    `SELECT n.*, l.id AS lotId
       FROM ngos n JOIN lots l ON l.ngo_id = n.id
      WHERE n.id = ? AND n.status = 'published' AND l.state = 'published'
      ORDER BY l.id LIMIT 1`
  ).bind(id).first<PublicNgoRow>();
  if (!row) throw new HttpError(404, "not_found");

  const tags = arrayOf(row.tags).filter((tag): tag is string => typeof tag === "string" && Object.hasOwn(NGO_TAGS, tag));
  const projects = arrayOf(row.projects)
    .filter((value): value is NgoProject => Boolean(value) && typeof value === "object" &&
      typeof (value as NgoProject).title === "string" && typeof (value as NgoProject).description === "string")
    .map(({ title, description }) => ({ title, description }));

  return json({ ngo: {
    id: row.id, name: row.name, summary: row.summary ?? null, description: row.description ?? null,
    tags, projects, lotId: row.lotId, photos: await publicPhotos(env, id),
  } }, { headers: NO_STORE });
}
