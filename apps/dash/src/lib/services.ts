import type { ApiError } from "@vila/shared/accounts/errors";

import { createApi } from "./api";
import { endpoints } from "./endpoints";

/** Endpoints of the running build (see endpoints.ts). */
export const SERVICES = endpoints(import.meta.env.MODE);

/** Error codes that mean "who you are changed": signed out, no longer an admin, or accounts turned off. */
const SESSION_CODES = new Set(["not_signed_in", "admin_only", "accounts_disabled"]);

let sessionChanged: () => void = () => {};

/** The app registers here to re-read the session when a call is refused for one of `SESSION_CODES`. */
export function onSessionChanged(listener: () => void): () => void {
  sessionChanged = listener;
  return () => {
    sessionChanged = () => {};
  };
}

/** The API of the running build. */
export const api = createApi(SERVICES.api, (input, init) => fetch(input, init), (e: ApiError) => {
  if (SESSION_CODES.has(e.code)) sessionChanged();
});
