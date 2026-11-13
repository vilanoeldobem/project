/**
 * Zoom without buttons (IMPL-0022): the mouse wheel and the two-finger pinch, with plain `EventTarget`s in
 * place of the canvas and the window. The keys are in `hud-keys.test.ts`.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { attachZoomGestures, WHEEL_ZOOM, ZOOM_GESTURES } from "./zoom-gestures";

let canvas: EventTarget, page: EventTarget;
let idle: boolean;
let factors: number[];
let stops: number;
let detach: () => void;

const wheel = (deltaY: number) => {
  const event = Object.assign(new Event("wheel", { cancelable: true }), { deltaY });
  canvas.dispatchEvent(event);
  return event;
};
const pointer = (target: EventTarget, type: string, pointerId: number, clientX: number, clientY: number, pointerType = "touch") =>
  target.dispatchEvent(Object.assign(new Event(type), { pointerId, clientX, clientY, pointerType }));

beforeEach(() => {
  canvas = new EventTarget();
  page = new EventTarget();
  idle = true;
  factors = [];
  stops = 0;
  detach = attachZoomGestures(canvas, page, { idle: () => idle, zoomBy: (f) => void factors.push(f), stopWalk: () => void stops++ });
});

describe("mouse wheel", () => {
  it("zooms in when rolled up and out when rolled down, by the wheel delta", () => {
    wheel(-400);
    wheel(400);
    expect(factors).toHaveLength(2);
    expect(factors[0]).toBeCloseTo(Math.exp(-400 * WHEEL_ZOOM));
    expect(factors[0]).toBeLessThan(1); // smaller distance = closer
    expect(factors[1]).toBeGreaterThan(1);
  });

  it("never scrolls the page, and does not zoom while a panel or the menu is open", () => {
    idle = false;
    expect(wheel(-400).defaultPrevented).toBe(true);
    expect(factors).toEqual([]);
    idle = true;
    expect(wheel(-400).defaultPrevented).toBe(true);
    expect(factors).toHaveLength(1);
  });
});

describe("two-finger pinch", () => {
  it("zooms in as the fingers spread and out as they close; the second finger stops the walk", () => {
    pointer(canvas, "pointerdown", 1, 100, 100);
    expect(stops).toBe(0); // one finger walks (the ground handles it)
    pointer(canvas, "pointerdown", 2, 200, 100);
    expect(stops).toBe(1);
    pointer(page, "pointermove", 2, 300, 100); // 100 px apart → 200 px
    pointer(page, "pointermove", 2, 150, 100); // 200 px → 50 px
    expect(factors[0]).toBeCloseTo(0.5);
    expect(factors[1]).toBeCloseTo(4);
  });

  it("ends when a finger lifts, and ignores the mouse and a single finger", () => {
    pointer(canvas, "pointerdown", 1, 100, 100);
    pointer(page, "pointermove", 1, 180, 100);
    pointer(canvas, "pointerdown", 7, 0, 0, "mouse");
    pointer(page, "pointermove", 7, 90, 90, "mouse");
    expect(factors).toEqual([]);
    pointer(canvas, "pointerdown", 2, 200, 100);
    pointer(page, "pointerup", 2, 200, 100);
    pointer(page, "pointermove", 1, 400, 100);
    expect(factors).toEqual([]);
  });

  it("does not zoom while a panel or the menu is open", () => {
    idle = false;
    pointer(canvas, "pointerdown", 1, 100, 100);
    pointer(canvas, "pointerdown", 2, 200, 100);
    pointer(page, "pointermove", 2, 300, 100);
    expect(factors).toEqual([]);
  });
});

describe("the gesture table", () => {
  it("is what gets wired: a mouse gesture and a touch gesture, each with the words the menu shows", () => {
    expect(ZOOM_GESTURES.map((g) => [g.id, g.device])).toEqual([
      ["wheel", "mouse"],
      ["pinch", "touch"],
    ]);
    for (const g of ZOOM_GESTURES) expect(g.input.length > 0 && g.does.length > 0).toBe(true);
  });

  it("unwires every gesture", () => {
    detach();
    wheel(-400);
    pointer(canvas, "pointerdown", 1, 100, 100);
    pointer(canvas, "pointerdown", 2, 200, 100);
    pointer(page, "pointermove", 2, 300, 100);
    expect(factors).toEqual([]);
    expect(stops).toBe(0);
  });
});
