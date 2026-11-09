import { describe, expect, it } from "vitest";

import { canonicalRedirect } from "./redirect";

describe("canonicalRedirect", () => {
  it("redirects the apex to www keeping path and query", () => {
    const res = canonicalRedirect(new URL("https://vilanoeldobem.com.br/ongs?x=1"));
    expect(res?.status).toBe(301);
    expect(res?.headers.get("Location")).toBe("https://www.vilanoeldobem.com.br/ongs?x=1");
  });

  it("serves www and workers.dev hosts directly", () => {
    expect(canonicalRedirect(new URL("https://www.vilanoeldobem.com.br/"))).toBeNull();
    expect(canonicalRedirect(new URL("https://vilanoeldobem-site.vilanoeldobem.workers.dev/"))).toBeNull();
  });
});
