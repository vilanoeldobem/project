import { describe, expect, it } from "vitest";

import { handle } from "./handle";

const env = { ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher };
const call = async (url: string) => handle(new Request(url), env);

describe("client worker", () => {
  it("moves the old game host to play.* keeping path and query", async () => {
    const res = await call("https://app.vilanoeldobem.com.br/ongs?x=1");
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("https://play.vilanoeldobem.com.br/ongs?x=1");
  });

  it("serves assets on play.*", async () => {
    expect(await (await call("https://play.vilanoeldobem.com.br/")).text()).toBe("asset");
  });
});
