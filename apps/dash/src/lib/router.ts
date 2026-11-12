/**
 * Tiny hash router (no dependency): `#/applications`, `#/applications/<uuid>`, `#/lots`, `#/audit`, `#/users`,
 * `#/system`, `#/pending`. The hash keeps every screen on the single HTML document (`/`), whose headers are the
 * ones that matter (security-headers.ts). The list of sections is PROPOSTA: the product owner asked for the
 * backoffice, not for this exact menu (IMPL-0015).
 *
 * The slash after `#` is optional: `#applications/<uuid>` is the link the game builds to open one NGO's
 * application here (IMPL-0021). A sign-in token in the same fragment (`#login=…`, login-token.ts) is ignored.
 */
import { useEffect, useState } from "react";

import { isId } from "./ids";
import { splitLoginFragment } from "./login-token";

export type Section = "applications" | "lots" | "audit" | "users" | "system" | "pending";

export type Route =
  | { section: Exclude<Section, "applications"> }
  /**
   * `id` is a well-formed application id. `unknown` marks an address that names one application but not with a
   * well-formed id: the section says "not found" and no request is made with what the address carried.
   */
  | { section: "applications"; id?: string; unknown?: true };

/** Menu order and pt-BR labels. */
export const SECTIONS: ReadonlyArray<{ section: Section; label: string }> = [
  { section: "applications", label: "Candidaturas" },
  { section: "lots", label: "ONGs e terrenos" },
  { section: "audit", label: "Auditoria" },
  { section: "users", label: "Usuários" },
  { section: "system", label: "Sistema" },
  { section: "pending", label: "Pendentes" },
];

/** The parts of the address in a fragment. A sign-in token that shares the fragment (`#login=…&…`) is not part of it. */
const segments = (hash: string): string[] => splitLoginFragment(hash).rest.replace(/^#\/?/, "").split("/");

/** True when the fragment names a section of the dashboard (so it is an address, not an empty or stray fragment). */
export const namesSection = (hash: string): boolean => SECTIONS.some((s) => s.section === segments(hash)[0]);

/** Anything unknown (an empty hash, a stray `#login=…`) is the first section. Pure. */
export function parseRoute(hash: string): Route {
  const [section, id, ...rest] = segments(hash);
  const known = SECTIONS.find((s) => s.section === section)?.section;
  if (!known) return { section: "applications" };
  // A trailing slash adds nothing (`#/lots/`); anything else after the id does.
  const extra = rest.some((part) => part !== "");
  if (known === "applications") {
    if (!id && !extra) return { section: known };
    return isId(id) && !extra ? { section: known, id } : { section: known, unknown: true };
  }
  return id || extra ? { section: "applications" } : { section: known };
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
