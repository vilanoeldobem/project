import { describe, expect, it } from "vitest";

import { endpoints } from "./endpoints";

describe("endpoints per build mode", () => {
  it("links the production game to the public site, and a local build to the site's local preview", () => {
    expect(endpoints("production").site).toBe("https://www.vilanoeldobem.com.br");
    for (const mode of ["development", "workers", "test"]) expect(endpoints(mode).site).toBe("http://localhost:4173");
  });

  it("keeps production on the public subdomains and everything else on the local Workers", () => {
    expect(endpoints("production")).toMatchObject({ api: "https://api.vilanoeldobem.com.br", realtime: "wss://server.vilanoeldobem.com.br", dash: "https://dash.vilanoeldobem.com.br" });
    expect(endpoints("workers")).toMatchObject({ api: "http://localhost:8787", realtime: "ws://localhost:8788", dash: "http://localhost:8797" });
  });
});
