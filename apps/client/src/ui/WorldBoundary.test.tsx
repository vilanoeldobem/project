import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type ContextState, watchContext } from "../lib/context-watch";
import { WorldBoundary, WorldPaused, WorldUnavailable } from "./WorldBoundary";

afterEach(() => vi.useRealTimers());

describe("lost graphics context", () => {
  const setup = () => {
    vi.useFakeTimers();
    const canvas = new EventTarget();
    const states: ContextState[] = [];
    const stop = watchContext(canvas, (s) => states.push(s), 8000);
    return { canvas, states, stop };
  };

  it("pauses, then resumes when the browser gives the context back in time", () => {
    const { canvas, states } = setup();
    canvas.dispatchEvent(new Event("webglcontextlost"));
    vi.advanceTimersByTime(7000);
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    vi.advanceTimersByTime(5000);
    expect(states).toEqual(["lost", "ok"]);
  });

  it("fails when the context does not come back, and a late restore does not hide the failure", () => {
    const { canvas, states } = setup();
    canvas.dispatchEvent(new Event("webglcontextlost"));
    vi.advanceTimersByTime(8000);
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(states).toEqual(["lost", "failed"]);
  });

  it("stops listening and cancels a pending failure when the canvas goes away", () => {
    const { canvas, states, stop } = setup();
    canvas.dispatchEvent(new Event("webglcontextlost"));
    stop();
    vi.advanceTimersByTime(10000);
    canvas.dispatchEvent(new Event("webglcontextlost"));
    expect(states).toEqual(["lost"]);
  });
});

describe("world failure screens", () => {
  it("explains in plain Portuguese and offers a retry, without promising anything", () => {
    const html = renderToStaticMarkup(<WorldUnavailable />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("A Vila em 3D não abriu neste aparelho.");
    expect(html).toContain("Os botões do topo continuam funcionando.");
    expect(html).toMatch(/<button type="button"[^>]*>Tentar de novo<\/button>/);
    expect(html).not.toMatch(/doa|compr|em breve/i);
  });

  it("announces a pause as a status", () => {
    expect(renderToStaticMarkup(<WorldPaused />)).toContain('role="status"');
  });

  it("the boundary shows the world until something fails", () => {
    expect(renderToStaticMarkup(<WorldBoundary>mundo</WorldBoundary>)).toBe("mundo");
    expect(renderToStaticMarkup(<WorldBoundary failed>mundo</WorldBoundary>)).toContain("A Vila em 3D não abriu");
    expect(WorldBoundary.getDerivedStateFromError()).toEqual({ failed: true });
  });
});
