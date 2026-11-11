/**
 * quests-v1 feature flag (PROPOSTA; DEC-039..042, PEN-025). Off in production builds: either the build
 * sets `VITE_QUESTS_V1_ENABLED=true` or a localhost/dev page asks `?quests=1`. Local verification uses
 * `?quests=1`; production keeps both conditions false until the owner approves the catalog.
 */
import { debugAllowed } from "../environment/runtime";

export const questsEnabled = () =>
  import.meta.env.VITE_QUESTS_V1_ENABLED === "true" ||
  (debugAllowed() && typeof location !== "undefined" && new URLSearchParams(location.search).get("quests") === "1");
