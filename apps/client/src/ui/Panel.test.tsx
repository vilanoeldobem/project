/**
 * The veil of every panel and of the game menu (`Panel` draws its dialog inside `Veil`), no browser: the events
 * of a press are given to the handlers of the element `Veil` returns, in the order a browser sends them.
 */
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Panel, Veil } from "./Panel";

type Handler = (event: { target: unknown; currentTarget: unknown }) => void;

/** A dialog on screen: the veil element and what happened to it. */
function open() {
  const log: string[] = [];
  const veil = Veil({ onClose: () => void log.push("close") }) as ReactElement<{ onPointerDown: Handler; onClick: Handler; onPointerUp?: Handler }>;
  const inside = { name: "a button of the dialog" };
  const send = (type: "onPointerDown" | "onClick", target: unknown) => veil.props[type]({ target, currentTarget: veil });
  return { log, veil, inside, send };
}

describe("the veil of a dialog", () => {
  it("is what Panel draws around the dialog, for a panel and for the menu", () => {
    expect(renderToStaticMarkup(<Panel title="Indicadores">x</Panel>)).toMatch(/^<div class="backdrop"><div class="panel" role="dialog"/);
    expect(renderToStaticMarkup(<Panel title="Menu" variant="menu">x</Panel>)).toMatch(/^<div class="backdrop backdrop--menu"><div class="panel panel--menu" role="dialog"/);
    expect(renderToStaticMarkup(<Veil onClose={() => undefined}>x</Veil>)).toBe('<div class="backdrop">x</div>');
    expect(renderToStaticMarkup(<Veil variant="menu" onClose={() => undefined}>x</Veil>)).toBe('<div class="backdrop backdrop--menu">x</div>');
  });

  it("stays through the pointerdown of a tap and closes on its click, so the click cannot reach the HUD button under it", () => {
    const { log, veil, send } = open();
    send("onPointerDown", veil);
    expect(log).toEqual([]);
    send("onClick", veil);
    expect(log).toEqual(["close"]);
  });

  it("stays for a press that started inside the dialog and ended on the veil", () => {
    const { log, veil, inside, send } = open();
    send("onPointerDown", inside);
    send("onClick", veil);
    expect(log).toEqual([]);
  });

  it("stays for a press inside the dialog", () => {
    const { log, inside, send } = open();
    send("onPointerDown", inside);
    send("onClick", inside);
    expect(log).toEqual([]);
  });
});
