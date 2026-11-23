import { defineConfig } from "vitest/config";

import { endpoints } from "../client/src/lib/endpoints";

// The cross-app progress test imports the real game client under this Vitest config.
export default defineConfig({
  define: { __VILA_SERVICES__: JSON.stringify(endpoints("test")) },
  test: { include: ["src/**/*.test.ts", "../../tests/progress-account.test.mjs"], environment: "node" },
});
