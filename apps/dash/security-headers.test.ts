import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, headersFile } from "./security-headers.ts";
import { endpoints } from "./src/lib/endpoints.ts";

describe("dashboard security headers (IMPL-0015)", () => {
  it("connects only to itself and to the API of the build", () => {
    for (const mode of ["production", "workers", "development"]) {
      const e = endpoints(mode);
      const directives = Object.fromEntries(contentSecurityPolicy(e.api).split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1)]));
      expect([mode, directives["connect-src"]]).toEqual([mode, ["'self'", e.api]]);
      // The realtime server and the game are only linked, never fetched.
      expect(contentSecurityPolicy(e.api)).not.toContain(new URL(e.realtime).host);
      expect(contentSecurityPolicy(e.api)).not.toContain(new URL(e.game).host);
    }
  });

  it("allows no inline code, no third party and no framing", () => {
    const csp = contentSecurityPolicy("https://api.vilanoeldobem.com.br");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|\*|data:|blob:/);
    expect(csp).not.toMatch(/google|cloudflareinsights|gstatic/);
    for (const directive of ["default-src 'self'", "script-src 'self'", "style-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'"])
      expect(csp.split("; ")).toContain(directive);
  });

  it("keeps the dashboard out of search engines and its HTML out of caches", () => {
    const file = headersFile("https://api.vilanoeldobem.com.br");
    const [all, root, index, assets] = file.split("\n\n");
    expect(all.split("\n")[0]).toBe("/*");
    for (const header of ["X-Robots-Tag: noindex, nofollow", "Referrer-Policy: no-referrer", "X-Frame-Options: DENY", "X-Content-Type-Options: nosniff"])
      expect(all).toContain(`  ${header}`);
    // A catch-all Cache-Control would be joined with the one of /assets/*.
    expect(all).not.toContain("Cache-Control");
    expect(root).toBe("/\n  Cache-Control: no-store, no-transform");
    expect(index).toBe("/index.html\n  Cache-Control: no-store, no-transform");
    expect(assets.trim()).toBe("/assets/*\n  Cache-Control: public, max-age=31536000, immutable");
  });

  it("uses the public API in production and the local Worker otherwise", () => {
    expect(endpoints("production")).toEqual({
      api: "https://api.vilanoeldobem.com.br",
      realtime: "https://server.vilanoeldobem.com.br",
      game: "https://play.vilanoeldobem.com.br",
    });
    expect(endpoints("workers").api).toBe("http://localhost:8787");
    expect(endpoints("development").api).toBe("http://localhost:8787");
  });
});
