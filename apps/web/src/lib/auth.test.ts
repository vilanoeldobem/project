import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("account client state", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("window", {
      location: { hash: "#login=credential", pathname: "/", search: "" },
      history: { replaceState: vi.fn() },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("captures fragments on load and subsequent same-document navigation without retaining them in the URL", async () => {
    const { useAuth, takeLoginFragment } = await import("./auth");
    expect(useAuth.getState().token).toBe("credential");
    expect(window.history.replaceState).toHaveBeenCalledWith(null, "", "/");
    window.location.hash = "#login=another";
    expect(takeLoginFragment()).toBe("another");
    expect(window.history.replaceState).toHaveBeenCalledTimes(2);
  });

  it("ignores old session responses after a newer refresh or logout", async () => {
    const responses: ((r: Response) => void)[] = [];
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => responses.push(resolve))));
    const { useAuth } = await import("./auth");
    const old = useAuth.getState().refresh();
    const current = useAuth.getState().refresh();
    responses[1](Response.json({ available: true, user: { id: "verified" } }));
    await current;
    responses[0](Response.json({ available: true, user: null }));
    await old;
    expect(useAuth.getState().user?.id).toBe("verified");
    const stale = useAuth.getState().refresh();
    useAuth.getState().signedOut();
    responses[2](Response.json({ available: true, user: { id: "verified" } }));
    await stale;
    expect(useAuth.getState().user).toBeNull();
  });
});
