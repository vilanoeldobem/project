/**
 * Talking to a character of the village (IMPL-0025), server-side, no browser: the label of the one contextual
 * action, what the action opens, the dialogue itself (a few fixed lines and one button) and the setting that
 * hides the characters.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { saoPauloToEpoch } from "@vila/shared/environment/time";
import { isPerson, LIFE_CAST } from "@vila/shared/game/life";
import { LIFE_NAMES, NOTHING_SOLD } from "@vila/shared/game/life-dialogue";

import { env, frameAt } from "../environment/runtime";
import { useEnvSettings } from "../environment/settings";
import type { Panel as PanelState } from "../game/store";
import { life, tickLife } from "../game/village-life";
import { EnvironmentSettings } from "./Environment";
import { actionLabel, activate } from "./Hud";
import { LifeDialog } from "./NpcDialog";

const at = (hour: number) => {
  const ms = saoPauloToEpoch(2026, 12, 20, hour, 0);
  env.frame = frameAt(ms);
  life.on = true;
  tickLife(ms, env.frame.worldSeconds, 1 / 60, "high", false);
};
afterEach(() => {
  life.on = false;
  life.sim = null;
  vi.unstubAllGlobals();
});

describe("the action offered next to a character", () => {
  it("says who the avatar would talk to, by what the character is: never a person's name", () => {
    const label = (charId: string) => actionLabel({ kind: "life", charId }, false);
    expect(label("santa")).toBe("💬 Conversar com Papai Noel");
    expect(label("elf-2")).toBe("💬 Conversar com o duende");
    expect(label("lumberjack")).toBe("💬 Conversar com o lenhador");
    expect(label("shopkeeper-3")).toBe("💬 Conversar com lojista");
    expect(label("villager-5")).toBe("💬 Conversar com morador");
    expect(label("visitor-1")).toBe("💬 Conversar com visitante");
    for (const c of LIFE_CAST) if (isPerson(c.kind)) expect(label(c.id), c.id).toBe(`💬 ${LIFE_NAMES[c.kind]!.action}`);
    // The quest NPCs keep their own label.
    expect(actionLabel({ kind: "npc", npcId: "postmaster" }, false)).toBe("💬 Falar com Seu Nivaldo");
  });

  it("opens the character's lines, chosen at that moment, and nothing for an id it does not know", () => {
    at(15);
    const opened: PanelState[] = [];
    const vila = { open: (panel: PanelState) => void opened.push(panel), record: () => undefined, notify: () => undefined };
    activate({ kind: "life", charId: "shopkeeper-1" }, vila);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ kind: "life", charId: "shopkeeper-1", name: "Lojista", role: "Cuida de uma loja da praça" });
    const lines = (opened[0] as Extract<PanelState, { kind: "life" }>).lines;
    expect(lines[0]).toContain("Ateliê de Enfeites");
    expect(lines[lines.length - 1]).toBe(NOTHING_SOLD);
    activate({ kind: "life", charId: "nobody" }, vila);
    activate({ kind: "life", charId: "cat-1" }, vila);
    expect(opened).toHaveLength(1);
  });
});

describe("the dialogue of a character", () => {
  it("shows who is talking, the lines and one button that closes it: nothing to answer, accept or buy", () => {
    vi.stubGlobal("window", new EventTarget());
    const page = renderToStaticMarkup(<LifeDialog charId="lumberjack" name="Lenhador" role="Cuida do pátio da lenha" lines={["Eu corto e empilho lenha aqui, na beira da floresta.", "O pátio da lenha está fechado.", NOTHING_SOLD]} />);
    expect(page).toContain('role="dialog"');
    expect(page).toContain('aria-label="Lenhador"');
    expect(page).toContain("Cuida do pátio da lenha");
    expect([...page.matchAll(/<p[^>]*data-life-line="\d"[^>]*>(.*?)<\/p>/g)].map((m) => m[1])).toEqual(["Eu corto e empilho lenha aqui, na beira da floresta.", "O pátio da lenha está fechado.", "Nada é vendido na Vila."]);
    const buttons = [...page.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
    expect(buttons).toEqual(["×", "Continuar"]);
    expect(/<input|<textarea|<a |<form|<select/.test(page)).toBe(false);
  });
});

describe("the setting that hides the characters", () => {
  it("is on by default, one checkbox in the options, and says what the characters are", () => {
    expect(useEnvSettings.getState().characters).toBe(true);
    const page = renderToStaticMarkup(<EnvironmentSettings />);
    const box = /<input[^>]*data-setting="characters"[^>]*>/.exec(page)?.[0] ?? "";
    expect(box).toContain('type="checkbox"');
    expect(box).toContain("checked");
    expect(page).toContain(`${box}Mostrar os moradores e os animais da Vila`);
    expect(page.match(/data-setting="characters"/g)).toHaveLength(1);
    expect(page).toContain("São personagens da própria Vila, com rotinas fixas. Não são outras pessoas e não guardam nada sobre você.");
  });

  it("is remembered in this browser with the other options", async () => {
    const storage = new Map<string, string>([["vila.environment.v1", JSON.stringify({ quality: "low", characters: false })]]);
    vi.stubGlobal("localStorage", { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v), removeItem: (k: string) => void storage.delete(k) });
    vi.resetModules();
    const fresh = await import("../environment/settings");
    expect(fresh.useEnvSettings.getState().characters).toBe(false);
    fresh.useEnvSettings.getState().set({ characters: true });
    expect(JSON.parse(storage.get("vila.environment.v1")!)).toMatchObject({ quality: "low", characters: true });
    // Anything that is not a boolean falls back to on.
    storage.set("vila.environment.v1", JSON.stringify({ characters: "no" }));
    vi.resetModules();
    expect((await import("../environment/settings")).useEnvSettings.getState().characters).toBe(true);
  });
});
