import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

import pkg from "./package.json" with { type: "json" };
import { headersFile } from "./security-headers.ts";
import { endpoints } from "./src/lib/endpoints.ts";

/**
 * Per-build security headers and connection hints (IMPL-0009): the CSP `connect-src` lists exactly this
 * build's API and realtime origins (production subdomains, or the local Workers), and the HTML
 * preconnects to the API so the first data request skips a handshake.
 */
function services(mode: string): Plugin {
  const e = endpoints(mode);
  return {
    name: "vila-services",
    transformIndexHtml: () => [{ tag: "link", attrs: { rel: "preconnect", href: e.api, crossorigin: "" }, injectTo: "head" }],
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "_headers", source: headersFile(`${e.api} ${e.realtime}`) });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), services(mode)],
  define: { __VILA_VERSION__: JSON.stringify(pkg.version) },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 1000, // three + r3f + drei (~250 kB gzip) isolated in the "three" chunk
    rollupOptions: {
      output: {
        // Vendor code rarely changes: own chunks keep it cached across deploys. React and zustand (shared by the UI shell and r3f) stay out of
        // "three" so the HTML shell does not wait for Three.js; three/examples (bloom) stays in the
        // lazy PostFx chunk. r3f imports `* as THREE`, so three itself cannot be tree-shaken.
        manualChunks: (id: string) => {
          if (/\/node_modules\/(react|react-dom|scheduler|zustand|use-sync-external-store)\//.test(id)) return "react";
          if (/\/node_modules\/three\/examples\//.test(id)) return undefined;
          if (/\/node_modules\/(three|@react-three)\//.test(id)) return "three";
          return undefined;
        },
      },
    },
  },
  test: { include: ["src/**/*.test.{ts,tsx}", "worker/**/*.test.ts"], environment: "node" },
}));
