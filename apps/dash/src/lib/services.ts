import type { ApiError } from "@vila/shared/accounts/errors";

import { createApi } from "./api";
import type { Endpoints } from "./endpoints";
import { sessionChangedBy } from "./session";

/** Endpoints of the running build (see endpoints.ts). */
declare const __VILA_SERVICES__: Endpoints;
export const SERVICES = __VILA_SERVICES__;

let sessionChanged: () => void = () => {};

/** The app registers here to re-read the session when a call is refused because who is signed in changed (session.ts). */
export function onSessionChanged(listener: () => void): () => void {
  sessionChanged = listener;
  return () => {
    sessionChanged = () => {};
  };
}

/** The API of the running build. */
export const api = createApi(SERVICES.api, (input, init) => fetch(input, init), (e: ApiError) => {
  if (sessionChangedBy(e.code)) sessionChanged();
});
