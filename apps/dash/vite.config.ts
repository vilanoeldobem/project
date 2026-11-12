import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

import { headersFile } from "./security-headers.ts";
import { endpoints } from "./src/lib/endpoints.ts";

/** Per-build security headers (IMPL-0015): the CSP `connect-src` lists exactly this build's API origin. */
function securityHeaders(mode: string): Plugin {
  return {
    name: "vila-dash-headers",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "_headers", source: headersFile(endpoints(mode).api) });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), securityHeaders(mode)],
  // 5173 is the game's and the website's dev port.
  server: { port: 5175, strictPort: true },
  build: { target: "es2022", sourcemap: false },
  test: { include: ["src/**/*.test.{ts,tsx}", "*.test.ts"], environment: "node" },
}));
