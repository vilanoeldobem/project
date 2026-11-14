import { useEffect, useState } from "react";

import { GameAudio } from "../environment/audio";
import { EVENT_LABEL, PHASE_LABEL, WEATHER_LABEL } from "../environment/labels";
import { debugAllowed, env, useEnvUi } from "../environment/runtime";
import { PRESETS, resolveQuality, useEnvSettings, type QualitySetting } from "../environment/settings";
import { saoPauloCivil } from "@vila/shared/environment/time";
import { perf } from "../scene/perf";
import { events } from "../game/events";
import { MOTION } from "@vila/shared/game/motion";
import { connectPresence, type NetStatus, useNet } from "../net/multiplayer";
import { useVila } from "../game/store";
import { Panel } from "./Panel";

const pad = (n: number) => String(n).padStart(2, "0");

/** Re-renders at most `ms` apart with the current environment frame (the 3D loop owns the frame). */
function useFrameSample(ms: number) {
  const [frame, setFrame] = useState(env.frame);
  useEffect(() => {
    const id = setInterval(() => setFrame(env.frame), ms);
    return () => clearInterval(id);
  }, [ms]);
  return frame;
}

/** Shown (and read aloud) while the presence connection is paused for inactivity (IMPL-0014). */
const IDLE_NOTICE = "Outros visitantes em pausa por inatividade. A conexão volta no seu próximo toque, clique ou tecla.";

/**
 * Shown (and read aloud) after an administrator removed this visitor from the room (PROPOSTA, IMPL-0021): what
 * happened, that the game goes on, and when the other visitors come back. No blame, no call to action.
 */
export const REMOVED_NOTICE = "Você foi removido da sala por um administrador.";
const REMOVED_DETAIL = "Você pode continuar jogando. Os outros visitantes voltam a aparecer depois de 1 minuto, no seu próximo toque, clique ou tecla.";

/** HUD notice while the presence connection is held after a removal (it leaves when the connection resumes). */
export function RemovedNotice() {
  const removed = useNet((s) => s.status === "removed");
  if (!removed) return null;
  return (
    <div className="hud__notice" role="status" data-state="removed">
      <strong>{REMOVED_NOTICE}</strong> {REMOVED_DETAIL}
    </div>
  );
}

/**
 * HUD status group: São Paulo time + shared weather (opens the "Ambiente" panel), who is in the plaza, and the
 * sky-view toggle (icon-only, so it carries a tooltip).
 */
export function EnvironmentChip() {
  const f = useFrameSample(1000);
  const open = useVila((s) => s.open);
  const skyView = useVila((s) => s.skyView);
  const setSkyView = useVila((s) => s.setSkyView);
  const net = useNet();
  const c = saoPauloCivil(f.timestampMs);
  const w = WEATHER_LABEL[f.weather.kind];
  const event = f.events[f.events.length - 1];
  return (
    <div className="hud__group env-chip" role="group" aria-label="Agora na Vila">
      <button
        className="btn btn--chip"
        onClick={() => open({ kind: "environment" })}
        aria-label={`Ambiente: ${pad(c.hour)}:${pad(c.minute)} em São Paulo, ${w.label}`}
      >
        <span className="chip__icon env-chip__clock" aria-hidden="true">
          🕰️
        </span>
        {pad(c.hour)}:{pad(c.minute)}
        <span className="chip__icon" aria-hidden="true">
          {w.icon}
        </span>
        <span className="env-chip__label">{event ? EVENT_LABEL[event.kind] : w.label}</span>
      </button>
      {net.status === "online" && (
        <span className="btn btn--chip env-chip__people" role="status" aria-label={`${net.others + 1} ${net.others ? "visitantes" : "visitante"} nesta praça agora`}>
          👥 {net.others + 1}
        </span>
      )}
      {/* Paused for inactivity (IMPL-0014): a plain statement, no call to action; any input reconnects. */}
      {net.status === "idle" && (
        <span className="btn btn--chip env-chip__people" role="status" aria-label={IDLE_NOTICE} title={IDLE_NOTICE}>
          👥 em pausa
        </span>
      )}
      {net.status === "removed" && (
        <span className="btn btn--chip env-chip__people" aria-hidden="true">
          👥 em pausa
        </span>
      )}
      <button
        className="btn btn--chip chip--icon"
        aria-pressed={skyView}
        onClick={() => setSkyView(!skyView)}
        aria-label={skyView ? "Voltar à vista da Vila" : "Olhar o céu"}
        data-tip={skyView ? "Voltar à vista da Vila" : "Olhar o céu"}
      >
        <span className="chip__icon" aria-hidden="true">
          {skyView ? "🏘️" : "🌌"}
        </span>
      </button>
    </div>
  );
}

const QUALITY: Array<{ value: QualitySetting; label: string }> = [
  { value: "auto", label: "Automática" },
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "ultra", label: "Ultra" },
];

const NET_NOTE: Record<NetStatus, string> = {
  off: "",
  connecting: "Conectando…",
  online: "Conectado.",
  full: "Todas as praças estão cheias agora; tentamos de novo em instantes.",
  offline: "Sem conexão com a Vila; tentando de novo.",
  idle: "Em pausa por inatividade; a conexão volta no seu próximo toque, clique ou tecla.",
  removed: `${REMOVED_NOTICE} A conexão volta depois de 1 minuto, no seu próximo toque, clique ou tecla.`,
};

const QUALITY_NAME = { low: "Baixa", medium: "Média", high: "Alta", ultra: "Ultra" } as const;

/** "Ambiente" panel: honest explanation of time/weather + the per-device options (`EnvironmentSettings`). */
export function EnvironmentPanel() {
  const f = useFrameSample(1000);
  const source = useEnvUi((u) => u.source);
  const c = saoPauloCivil(f.timestampMs);
  const w = WEATHER_LABEL[f.weather.kind];
  return (
    <Panel kicker="Hora e clima" title="Ambiente da Vila">
      <p className="env-now">
        <strong>
          {pad(c.hour)}:{pad(c.minute)}
        </strong>{" "}
        · {PHASE_LABEL[f.phase]} · {w.icon} {w.label}
        {f.events.map((e) => (
          <span key={e.eventId} className="status">
            {EVENT_LABEL[e.kind]}
          </span>
        ))}
      </p>
      <p>
        A Vila segue a <strong>hora oficial de São Paulo</strong>, em tempo real: se aqui é noite, a Vila acende as
        luzes para todo mundo, esteja a pessoa onde estiver.
      </p>
      <p>
        O clima é <strong>de faz de conta</strong>: a neve, o vento e a névoa são iguais para todos que estão na Vila,
        mas não têm relação com o tempo real lá fora.
      </p>
      {source === "local" && <p className="note">Usando o relógio deste aparelho até conectar com a Vila.</p>}
      <EnvironmentSettings />
    </Panel>
  );
}

/**
 * The per-device options: graphics quality, comfort (sound included) and other visitors. One component, shown
 * in the "Ambiente" panel and in "Configurações" of the game menu (IMPL-0022), so there is one set of controls.
 */
export function EnvironmentSettings() {
  const s = useEnvSettings();
  const net = useNet();
  return (
    <>
      <fieldset className="env-fieldset">
        <legend>Qualidade gráfica</legend>
        <div className="env-options">
          {QUALITY.map((q) => (
            <label key={q.value} className="env-radio">
              <input type="radio" name="quality" checked={s.quality === q.value} onChange={() => s.set({ quality: q.value })} />
              {q.value === "auto" ? `${q.label} (${QUALITY_NAME[s.detected]})` : q.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="env-fieldset">
        <legend>Conforto</legend>
        <label className="env-check">
          <input type="checkbox" checked={s.particles} onChange={(e) => s.set({ particles: e.target.checked })} />
          Mostrar neve caindo e brilhos
        </label>
        <label className="env-check">
          <input type="checkbox" checked={s.reduceFlicker} onChange={(e) => s.set({ reduceFlicker: e.target.checked })} />
          Luzes fixas, sem piscar
        </label>
        <label className="env-check">
          <input type="checkbox" checked={s.reduceMotion} onChange={(e) => s.set({ reduceMotion: e.target.checked })} />
          Menos movimento na tela
        </label>
        <label className="env-check">
          <input type="checkbox" checked={s.sound} onChange={(e) => s.set({ sound: e.target.checked })} />
          Som (vento, sininhos, passos e efeitos)
        </label>
      </fieldset>

      <fieldset className="env-fieldset">
        <legend>Outros visitantes</legend>
        <label className="env-check">
          <input type="checkbox" checked={s.multiplayer} onChange={(e) => s.set({ multiplayer: e.target.checked })} />
          Ver quem está na praça agora (e aparecer para eles)
        </label>
        <p className="note">
          Sem nomes e sem conversa: só bonecos anônimos andando. {NET_NOTE[net.status]}
        </p>
      </fieldset>
      <fieldset className="env-fieldset">
        <legend>Personagens da Vila</legend>
        <label className="env-check">
          <input type="checkbox" checked={s.characters} onChange={(e) => s.set({ characters: e.target.checked })} data-setting="characters" />
          Mostrar os moradores e os animais da Vila
        </label>
        <p className="note">São personagens da própria Vila, com rotinas fixas. Não são outras pessoas e não guardam nada sobre você.</p>
      </fieldset>
      <p className="note">Essas opções mudam só a aparência e o som neste aparelho, nunca o jogo.</p>
    </>
  );
}

/** Keeps the presence connection open while "Outros visitantes" is on (IMPL-0008). */
export function Presence() {
  const on = useEnvSettings((s) => s.multiplayer);
  useEffect(() => (on && typeof WebSocket !== "undefined" ? connectPresence() : undefined), [on]);
  return null;
}

/** Plays the procedural ambience and gameplay sounds while "Som" is on. */
export function GameSound() {
  const on = useEnvSettings((s) => s.sound);
  useEffect(() => {
    if (!on || typeof AudioContext === "undefined") return;
    const audio = new GameAudio();
    audio.update(env.frame);
    const id = setInterval(() => audio.update(env.frame), 250);
    const off = events.on((e) => {
      if (e.type === "step") audio.footstep(e.surface, Math.min(e.speed / MOTION.maxSpeed, 1), e.left);
      else if (e.type === "gift") audio.chime();
      else if (e.type === "mission") audio.jingle();
    });
    return () => {
      off();
      clearInterval(id);
      audio.close();
    };
  }, [on]);
  return null;
}

/** Developer overlay (spec §19.1): `?envDebug` on localhost/dev builds only. */
export function EnvironmentDebug() {
  const f = useFrameSample(500);
  const ui = useEnvUi();
  const settings = useEnvSettings();
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0, raf = 0, last = performance.now();
    const loop = (now: number) => {
      frames++;
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (!debugAllowed() || !new URLSearchParams(location.search).has("envDebug")) return null;
  const c = saoPauloCivil(f.timestampMs);
  const q = resolveQuality(settings);
  const w = f.weather;
  const deg = Math.round((w.windDirectionRad * 180) / Math.PI);
  const age = ui.lastSyncAt ? Math.round((Date.now() - ui.lastSyncAt) / 1000) : null;
  return (
    <pre className="env-debug" aria-hidden="true">
      {[
        `world ${ui.snapshot.worldId} · tz ${ui.snapshot.timezone}`,
        `SP ${c.year}-${pad(c.month)}-${pad(c.day)} ${pad(c.hour)}:${pad(c.minute)}:${pad(c.second)} (${f.phase})`,
        `clock ${ui.debug?.startEpochMs !== undefined ? "DEBUG OVERRIDE" : ui.source} · rtt ${ui.rttMs === null ? "—" : Math.round(ui.rttMs)} ms · last sync ${age ?? "—"} s`,
        `seed ${ui.snapshot.weatherSeed} · algo v${ui.snapshot.weatherAlgorithmVersion} · config v${ui.snapshot.configVersion}`,
        `slot ${w.slot} · ${w.kind}${ui.debug?.weather ? " (forced)" : ""} · blend ${w.transition.toFixed(2)}`,
        `snow ${w.snowfall.toFixed(2)} · wind ${w.windStrength.toFixed(2)} @ ${deg}° · fog ${w.fogStrength.toFixed(2)}`,
        `cloud ${w.cloudCover.toFixed(2)} · sparkle ${w.sparkle.toFixed(2)} · aurora ${w.aurora.toFixed(2)}`,
        `events ${f.events.map((e) => e.eventId).join(", ") || "—"}`,
        `preset ${q} (${settings.quality}) · flakes ${PRESETS[q].snowFlakes} · fps ${fps}`,
        `calls ${perf.calls} · tris ${perf.triangles} · frame p50 ${perf.p50.toFixed(1)} p95 ${perf.p95.toFixed(1)} ms · dpr ${perf.dpr}`,
      ].join("\n")}
    </pre>
  );
}
