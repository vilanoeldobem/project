import { useState } from "react";

import { useVila } from "../game/store";
import { useAccount } from "../lib/account";
import { levelOf, MISSIONS, TRACK_LABEL, XP_PER_LEVEL, type Progress, type Track } from "@vila/shared/game/progress";
import { activeInventory, CHAIN_TITLES, type NpcId, QUESTS, questProgress, questState } from "@vila/shared/game/quests";
import { NPCS } from "@vila/shared/game/world";
import { useQuestsEnabled } from "../game/questsFlag";
import type { LotInfo } from "../lib/api";
import { Panel } from "./Panel";
import { SheetNotice, SheetProgress, SheetSection, SheetTabs } from "./sheet";

/** Missions that have a place in the village; "Ver no mapa" is only offered for these. */
const ON_THE_MAP: Record<string, true> = { "explore-gifts": true, "causes-visit-lot": true, "causes-global-donation": true };

/** Mission log (P14, DEC-039/040). Progress is saved in this browser only (accounts are D06). */
export function Missions({ lots = {} }: { lots?: Record<string, LotInfo> }) {
  const p = useVila((s) => s.progress);
  const open = useVila((s) => s.open);
  const quests = useQuestsEnabled();
  const [track, setTrack] = useState<Track>("explore");
  const level = levelOf(p.xp);
  const into = p.xp % XP_PER_LEVEL;
  // The active mission: the first unfinished one of the selected tab, else any unfinished one, else none.
  const active = MISSIONS.find((m) => m.track === track && !p.completed[m.id]) ?? MISSIONS.find((m) => !p.completed[m.id]) ?? null;
  return (
    <Panel board="P14" sheet icon="🎯" title="Missões da Vila" subtitle="Brincar e conhecer">
      <div className="sheet-card mission-level">
        <strong>Nível {level}</strong>
        <span>
          {into} / {XP_PER_LEVEL} XP
        </span>
        <SheetProgress value={into} max={XP_PER_LEVEL} label={`Nível ${level}, ${into} de ${XP_PER_LEVEL} XP`} />
      </div>

      <SheetSection n={1} icon="🎯" title="Missão ativa">
        {active ? (
          <div className="sheet-card">
            <strong>{active.title}</strong>
            <SheetProgress
              value={p.counters[active.id] ?? 0}
              max={active.target}
              label={`${p.counters[active.id] ?? 0} de ${active.target} ${active.unit}`}
            />
            <p className="note">
              {p.counters[active.id] ?? 0}/{active.target} {active.unit} · Recompensa: <strong>+{active.xp} XP</strong>
            </p>
            {ON_THE_MAP[active.id] && (
              <button className="btn btn--primary" onClick={() => open({ kind: "map" })}>
                Ver no mapa
              </button>
            )}
          </div>
        ) : (
          <SheetNotice tone="done" icon="★">
            Todas as missões desta categoria estão concluídas.
          </SheetNotice>
        )}
      </SheetSection>

      <SheetSection n={2} icon="📖" title="Caderno de Missões">
        <SheetTabs
          label="Categorias de missão"
          tabs={Object.values(TRACK_LABEL)}
          value={TRACK_LABEL[track]}
          onChange={(label) => setTrack((Object.keys(TRACK_LABEL) as Track[]).find((t) => TRACK_LABEL[t] === label) ?? track)}
        />
        <ul className="mission-list">
          {MISSIONS.filter((m) => m.track === track).map((m) => {
            const n = p.counters[m.id] ?? 0;
            const done = Boolean(p.completed[m.id]);
            return (
              <li key={m.id} className={done ? "done" : ""}>
                <span aria-hidden>{done ? "★" : "☆"}</span>
                <span>
                  {m.title}
                  <SheetProgress value={n} max={m.target} label={`${n} de ${m.target} ${m.unit}`} />
                  <small>
                    {n}/{m.target} {m.unit} · {m.xp} XP {done ? "· Concluída" : ""}
                  </small>
                </span>
              </li>
            );
          })}
        </ul>
      </SheetSection>

      {quests && <QuestBook progress={p} lots={lots} />}
      <section className="sheet-card">
        <h3>Aparência e badges</h3>
        <div className="actions">
          <button className="btn" onClick={() => open({ kind: "avatar" })}>
            Abrir aparência
          </button>
          <button className="btn" onClick={() => open({ kind: "badges" })}>
            Suas badges
          </button>
        </div>
      </section>
      <SavedWhere />
    </Panel>
  );
}

const npcName = (id: NpcId) => NPCS.find((n) => n.id === id)?.name ?? id;

/**
 * Quest chains and carried items (PROPOSTA quests-v1; DEC-039..042, PEN-025). States are text plus a
 * symbol, never colour alone. The blocked visit quest says so honestly when no house is published.
 */
function QuestBook({ progress, lots }: { progress: Progress; lots: Record<string, LotInfo> }) {
  const hasPublishedLot = Object.values(lots).some((l) => l.state === "published" && Boolean(l.ngo_name));
  const bag = activeInventory(progress);
  const stateLine = (questId: string) => {
    const quest = QUESTS.find((q) => q.id === questId);
    if (!quest) return "";
    const state = questState(progress, quest.id);
    if (state === "completed") return "★ Concluída";
    if (state === "ready_to_turn_in") return `➜ Entregar a ${npcName(quest.turnInNpcId)}`;
    if (state === "active") {
      const { count, target } = questProgress(progress, quest.id);
      return `◐ Em andamento ${count}/${target} ${quest.unit}`;
    }
    if (state === "available" && quest.needsPublishedLot && !hasPublishedLot) return "⏳ Aguardando uma casa publicada";
    if (state === "available") return `☆ Disponível com ${npcName(quest.giverNpcId)}`;
    const prerequisite = QUESTS.find((q) => q.id === quest.prerequisiteId);
    return `🔒 Bloqueada · Requer: ${prerequisite?.title ?? "a missão anterior"}`;
  };
  return (
    <>
      {bag.length > 0 && (
        <section className="track quest-bag">
          <h3>Bolsa de Missão</h3>
          <ul className="mission-list" aria-label="Bolsa de missão">
            {bag.map((item) => (
              <li key={item.questId}>
                <span aria-hidden>🎒</span>
                <span>
                  {item.name}
                  <small>
                    {item.count}/{item.target}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {Object.entries(CHAIN_TITLES).map(([chainId, title]) => (
        <section key={chainId} className="track quest-chain">
          <h3>{title}</h3>
          <ul className="mission-list">
            {QUESTS.filter((q) => q.chainId === chainId)
              .sort((a, b) => a.order - b.order)
              .map((q) => {
                const { count, target } = questProgress(progress, q.id);
                const done = questState(progress, q.id) === "completed";
                return (
                  <li key={q.id} className={done ? "done" : ""}>
                    <span aria-hidden>{done ? "★" : questState(progress, q.id) === "ready_to_turn_in" ? "➜" : "☆"}</span>
                    <span>
                      {q.title}
                      <small>{stateLine(q.id)}</small>
                      <small>{q.description}</small>
                      <small>
                        {npcName(q.giverNpcId)} → {npcName(q.turnInNpcId)} · {count}/{target} {q.unit} · {q.xp} XP
                      </small>
                    </span>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </>
  );
}

/**
 * Where progress is kept, in one sentence: this browser (a guest, or a blocked account, IMPL-0021 PROPOSTA: the
 * API refuses its progress, so nothing is sent and nothing is waiting for a connection), the account, or waiting
 * for the connection. Pure.
 */
export function savedWhere(s: { signedIn: boolean; blocked: boolean; pending: boolean; onAccount: boolean }): string {
  if (!s.signedIn) return "Seu progresso fica salvo neste navegador.";
  if (s.blocked) return "Conta bloqueada: o progresso fica só neste navegador.";
  if (s.pending || !s.onAccount) return "Sem conexão com a Vila: seu progresso será enviado para a sua conta quando a conexão voltar.";
  return "Seu progresso fica salvo na sua conta.";
}

/** The sentence of `savedWhere` for the account on screen (also shown before leaving the Vila, IMPL-0022). */
export function SavedWhere() {
  const signedIn = useAccount((s) => !!s.user);
  const blocked = useAccount((s) => !!s.user?.blocked);
  const pending = useAccount((s) => s.sync === "pending");
  const onAccount = useVila((s) => s.progressOwner !== null);
  return (
    <p className="note" role="status">
      {savedWhere({ signedIn, blocked, pending, onAccount })}
    </p>
  );
}

export function XpBar({ compact }: { compact?: boolean }) {
  const xp = useVila((s) => s.progress.xp);
  const into = xp % XP_PER_LEVEL;
  return (
    <div className={`xp${compact ? " xp--compact" : ""}`} aria-label={`Nível ${levelOf(xp)}, ${into} de ${XP_PER_LEVEL} XP`}>
      <span className="xp__level">Nv {levelOf(xp)}</span>
      <span className="xp__bar">
        <span style={{ width: `${(into / XP_PER_LEVEL) * 100}%` }} />
      </span>
      <span className="xp__num">
        {into}/{XP_PER_LEVEL} XP
      </span>
    </div>
  );
}
