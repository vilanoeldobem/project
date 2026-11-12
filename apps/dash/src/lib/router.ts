/**
 * Tiny hash router (no dependency): `#/applications`, `#/applications/<uuid>`, `#/lots`, `#/audit`, `#/users`,
 * `#/system`, `#/pending`. The hash keeps every screen on the single HTML document (`/`), whose headers are the
 * ones that matter (security-headers.ts). The list of sections is PROPOSTA: the product owner asked for the
 * backoffice, not for this exact menu (IMPL-0015).
 */
import { useEffect, useState } from "react";

export type Section = "applications" | "lots" | "audit" | "users" | "system" | "pending";

export type Route = { section: Exclude<Section, "applications"> } | { section: "applications"; id?: string };

/** Menu order and pt-BR labels. */
export const SECTIONS: ReadonlyArray<{ section: Section; label: string }> = [
  { section: "applications", label: "Candidaturas" },
  { section: "lots", label: "ONGs e terrenos" },
  { section: "audit", label: "Auditoria" },
  { section: "users", label: "Usuários" },
  { section: "system", label: "Sistema" },
  { section: "pending", label: "Pendentes" },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Anything unknown (an empty hash, a stray `#login=…`) is the first section. Pure. */
export function parseRoute(hash: string): Route {
  const [, section, id, ...rest] = hash.replace(/^#/, "").split("/");
  const known = SECTIONS.find((s) => s.section === section)?.section;
  if (!known || rest.length) return { section: "applications" };
  if (known === "applications") return id && UUID.test(id) ? { section: known, id } : { section: known };
  return id ? { section: "applications" } : { section: known };
}

export function hrefOf(route: Route): string {
  return `#/${route.section}${route.section === "applications" && route.id ? `/${route.id}` : ""}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseRoute(location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}
