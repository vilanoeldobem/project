import { useEffect, useState } from "react";

import { Ambience } from "../environment/audio";
import { EVENT_LABEL, PHASE_LABEL, WEATHER_LABEL } from "../environment/labels";
import { debugAllowed, env, useEnvUi } from "../environment/runtime";
import { PRESETS, resolveQuality, useEnvSettings, type QualitySetting } from "../environment/settings";
import { saoPauloCivil } from "../environment/time";
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

/** HUD chip: São Paulo time + shared weather; opens the "Ambiente" panel. Also the sky-view toggle. */
export function EnvironmentChip() {
  const f = useFrameSample(1000);
  const open = useVila((s) => s.open);
  const skyView = useVila((s) => s.skyView);
  const setSkyView = useVila((s) => s.setSkyView);
  const c = saoPauloCivil(f.timestampMs);
  const w = WEATHER_LABEL[f.weather.kind];
  const event = f.events[f.events.length - 1];
  return (
    <div className="env-chip">
      <button
        className="btn btn--chip"
        onClick={() => open({ kind: "environment" })}
        aria-label={`Ambiente: ${pad(c.hour)}:${pad(c.minute)} em São Paulo, ${w.label}`}
      >
        🕰️ {pad(c.hour)}:{pad(c.minute)} <span aria-hidden="true">{w.icon}</span>
        <span className="env-chip__label">{event ? EVENT_LABEL[event.kind] : w.label}</span>
      </button>
      <button
        className="btn btn--chip"
        aria-pressed={skyView}
        onClick={() => setSkyView(!skyView)}
        aria-label={skyView ? "Voltar à vista da Vila" : "Olhar o céu"}
      >
        {skyView ? "🏘️" : "🌌"}
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

const QUALITY_NAME = { low: "Baixa", medium: "Média", high: "Alta", ultra: "Ultra" } as const;

/** "Ambiente" panel: honest explanation of time/weather + per-device comfort and quality options. */
export function EnvironmentPanel() {
  const f = useFrameSample(1000);
  const s = useEnvSettings();
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
          Som ambiente (vento e sininhos)
        </label>
      </fieldset>
      <p className="note">Essas opções mudam só a aparência e o som neste aparelho, nunca o jogo.</p>
    </Panel>
  );
}

/** Plays the procedural ambience while "Som ambiente" is on. */
export function AmbienceSound() {
  const on = useEnvSettings((s) => s.sound);
  useEffect(() => {
    if (!on || typeof AudioContext === "undefined") return;
    const amb = new Ambience();
    amb.update(env.frame);
    const id = setInterval(() => amb.update(env.frame), 250);
    return () => {
      clearInterval(id);
      amb.close();
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
      ].join("\n")}
    </pre>
  );
}
