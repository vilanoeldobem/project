import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  plugins: [react()],
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
  test: { include: ["src/**/*.test.ts", "worker/**/*.test.ts"], environment: "node" },
});
