import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  plugins: [react()],
  define: { __VILA_VERSION__: JSON.stringify(pkg.version) },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 1300, // three.js (~310 kB gzip) isolated in the "three" chunk
    rollupOptions: {
      output: {
        // Three.js rarely changes: its own chunk keeps it cached across deploys.
        manualChunks: (id: string) => (/node_modules\/(\.pnpm\/)?(three|@react-three)/.test(id) ? "three" : undefined),
      },
    },
  },
  test: { include: ["src/**/*.test.ts", "worker/**/*.test.ts"], environment: "node" },
});
