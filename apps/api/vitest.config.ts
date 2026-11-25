import { defineConfig } from "vitest/config";

// Values mirror `endpoints("test")` in apps/client/src/lib/endpoints.ts. Apps never import each other
// (AGENTS.md; docs/reference/architecture.md §7).
const services = {
  api: "http://localhost:8787",
  realtime: "ws://localhost:8788",
  dash: "http://localhost:8797",
  site: "http://localhost:4173",
};

// The cross-app progress test imports the real game client under this Vitest config.
export default defineConfig({
  define: { __VILA_SERVICES__: JSON.stringify(services) },
  test: { include: ["src/**/*.test.ts", "scripts/*.test.mjs", "../../tests/progress-account.test.mjs"], environment: "node" },
});
