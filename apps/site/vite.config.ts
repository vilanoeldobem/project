import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import { stagingHeaders, stagingHtml } from "../../scripts/staging-pages";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: "vila-staging-site",
      apply: (_config, env) => env.mode === "staging",
      transformIndexHtml: { order: "pre", handler: stagingHtml },
      generateBundle() {
        const notFound = readFileSync(new URL("./public/404.html", import.meta.url), "utf8");
        this.emitFile({ type: "asset", fileName: "404.html", source: stagingHtml(notFound) });
        this.emitFile({ type: "asset", fileName: "_headers", source: stagingHeaders() });
      },
    },
  ],
  build: { outDir: mode === "staging" ? ".wrangler/staging-assets" : "dist", target: "es2022", sourcemap: false },
  test: { include: ["src/**/*.test.ts", "worker/**/*.test.ts"], environment: "node" },
}));
