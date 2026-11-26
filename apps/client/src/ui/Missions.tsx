import { useState } from "react";

import { levelOf, TRACK_LABEL, XP_PER_LEVEL, type Progress, type Track } from "@vila/shared/game/progress";
import {
  activeInventoryIn,
  canAcceptIn,
  isStoryQuest,
  prerequisitesOf,
  finalSceneReady,
  questProgressIn,
  questStateIn,
  V1_CATALOG,
} from "@vila/shared/game/quests-v2/catalog";
import { milestoneProgressIn, milestoneStateIn, type Counters } from "@vila/shared/game/quests-v2/milestones";
import type { CatalogQuest, StoryCatalog, StoryWorld } from "@vila/shared/game/quests-v2/types";
import { V1_WORLD } from "@vila/shared/game/quests-v2/world";
import { useVila } from "../game/store";
import { useAccount } from "../lib/account";
import { useQuestsEnabled } from "../game/questsFlag";
import { useQuestsV2Enabled } from "../game/questsV2Flag";
import type { LotInfo } from "../lib/api";
import { Panel } from "./Panel";
import { SheetNotice, SheetProgress, SheetSection, SheetTabs } from "./sheet";

/** Missions that have a place in the village; "Ver no mapa" is only offered for these. */
const ON_THE_MAP: Record<string, true> = { "explore-gifts": true, "causes-visit-lot": true, "causes-global-donation": true };

const KIND_LABEL: Record<string, string> = {
  main: "História principal",
  regional: "Arcos regionais",
  side: "Secundárias",
  epilogue: "Epílogo",
  postgame: "Pós-jogo",
};

/** Mission log (P14, DEC-039/040). Progress is saved in this browser only (accounts are D06). */
export function Missions({
  lots = {},
  catalog = V1_CATALOG,
  world = V1_WORLD,
  progress,
  counters = {},
  stories,
}: {
  lots?: Record<string, LotInfo>;
  catalog?: StoryCatalog;
  world?: StoryWorld;
  progress?: Progress;
  counters?: Counters;
  /** Defaults to either story flag; false hides the quest book exactly as v1 did with quests off. */
  stories?: boolean;
}) {
  const stored = useVila((s) => s.progress);
  const claims = useVila((s) => s.missionClaims);
  const p = progress ?? stored;
  const open = useVila((s) => s.open);
  const v1 = useQuestsEnabled();
  const v2 = useQuestsV2Enabled();
  const showStories = stories ?? (v1 || v2);
  const [track, setTrack] = useState<Track>("explore");
  const level = levelOf(p.xp);
  const into = p.xp % XP_PER_LEVEL;
  // The active mission: the first unfinished one of the selected tab, else any unfinished one, else none.
  const active =
    catalog.quickMissions.find((m) => m.track === track && !p.completed[m.id]) ??
    catalog.quickMissions.find((m) => !p.completed[m.id]) ??
    null;
  const next = catalog.quests.find((q) => canAcceptIn(catalog, p, q.id));
  return (
    <Panel board="P14" sheet icon="🎯" title="Missões da Vila" subtitle="Brincar e conhecer">
      <div className="sheet-card mission-level">
        <strong>Nível {level}</strong>
        <span>
          {into} / {XP_PER_LEVEL} XP
        </span>
        <SheetProgress value={into} max={XP_PER_LEVEL} label={`Nível ${level}, ${into} de ${XP_PER_LEVEL} XP`} />
      </div>
      {Object.entries(claims).map(([id, claim]) => (
        <button key={id} className="btn btn--primary" onClick={() => useVila.getState().claimMission(id)}>
          Concluir missão: {claim.title}
        </button>
      ))}
      {showStories && next && (
        <p className="note" role="status">
          Próximo passo: {next.title} com {npcName(world, next.giverNpcId)}.
        </p>
      )}

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
          {catalog.quickMissions.filter((m) => m.track === track).map((m) => {
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

      {showStories && <QuestBook progress={p} lots={lots} catalog={catalog} world={world} counters={counters} />}
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

const npcName = (world: StoryWorld, id: string) => world.npcs.find((n) => n.id === id)?.name ?? id;

/**
 * Quest chains and carried items (PROPOSTA quests-v1 / quests-v2). States are text plus a symbol, never
 * colour alone. The blocked visit quest says so honestly when no house is published.
 */
function QuestBook({
  progress,
  lots,
  catalog,
  world,
  counters,
}: {
  progress: Progress;
  lots: Record<string, LotInfo>;
  catalog: StoryCatalog;
  world: StoryWorld;
  counters: Counters;
}) {
  const open = useVila((s) => s.open);
  const hasPublishedLot = Object.values(lots).some((l) => l.state === "published" && Boolean(l.ngo_name));
  const bag = activeInventoryIn(catalog, progress);
  const stateLine = (quest: CatalogQuest) => {
    const state = questStateIn(catalog, progress, quest.id);
    if (state === "completed") return "★ Concluída";
    if (state === "ready_to_turn_in") return `➜ Entregar a ${npcName(world, quest.turnInNpcId)}`;
    if (state === "active") {
      const { count, target } = questProgressIn(catalog, progress, quest.id);
      return `◐ Em andamento ${count}/${target} ${quest.unit}`;
    }
    if (state === "available" && quest.needsPublishedLot && !hasPublishedLot) return "⏳ Aguardando uma casa publicada";
    if (state === "available") return `☆ Disponível com ${npcName(world, quest.giverNpcId)}`;
    const required = prerequisitesOf(quest)
      .map((id) => catalog.quests.find((q) => q.id === id)?.title ?? id)
      .join(" e ");
    return `🔒 Bloqueada · Requer: ${required || "a missão anterior"}`;
  };
  // One group per chain, in catalog order; the kind comes from the first quest of the chain.
  const chains = new Map<string, { id: string; title: string; kind: string; quests: CatalogQuest[] }>();
  for (const quest of catalog.quests) {
    let chain = chains.get(quest.chainId);
    if (!chain) {
      chain = { id: quest.chainId, title: quest.chainTitle, kind: isStoryQuest(quest) ? quest.kind : "epilogue", quests: [] };
      chains.set(quest.chainId, chain);
    }
    chain.quests.push(quest);
  }
  const kinds = [...new Set([...chains.values()].map((chain) => chain.kind))];
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
      {kinds.map((kind) => (
        <section key={kind} className="track quest-kind">
          <h2>{KIND_LABEL[kind] ?? kind}</h2>
          {[...chains.values()]
            .filter((chain) => chain.kind === kind)
            .map((chain) => (
              <div key={chain.id} className="quest-chain">
                <h3>{chain.title}</h3>
                <ul className="mission-list">
                  {chain.quests
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((quest) => {
                      const { count, target } = questProgressIn(catalog, progress, quest.id);
                      const state = questStateIn(catalog, progress, quest.id);
                      const done = state === "completed";
                      return (
                        <li key={quest.id} className={done ? "done" : ""}>
                          <span aria-hidden>{done ? "★" : state === "ready_to_turn_in" ? "➜" : "☆"}</span>
                          <span>
                            {quest.title}
                            <small>{stateLine(quest)}</small>
                            <small>{quest.description}</small>
                            <small>
                              {npcName(world, quest.giverNpcId)} → {npcName(world, quest.turnInNpcId)} · {count}/{target}{" "}
                              {quest.unit} · {quest.xp} XP
                            </small>
                          </span>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}
        </section>
      ))}
      {catalog.milestones.length > 0 && (
        <section className="track quest-milestones">
          <h2>Marcos</h2>
          <ul className="mission-list">
            {catalog.milestones.map((milestone) => {
              const state = milestoneStateIn(catalog, counters, progress, milestone.id);
              const { value, threshold } = milestoneProgressIn(catalog, counters, milestone.id);
              return (
                <li key={milestone.id} className={state === "completed" ? "done" : ""}>
                  <span aria-hidden>{state === "completed" ? "★" : state === "ready" ? "➜" : "☆"}</span>
                  <span>
                    {milestone.title}
                    <SheetProgress value={Math.min(value, threshold)} max={threshold} label={`${value} de ${threshold}`} />
                    <small>
                      {value}/{threshold} · {milestone.xp} XP {state === "completed" ? "· Concluído" : ""}
                    </small>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {finalSceneReady(progress) && (
        <section className="track quest-finale">
          <h2>A próxima Longa Noite</h2>
          <p className="note">As seis cadeias do epílogo estão concluídas. A cena final e os créditos estão prontos.</p>
          <button className="btn btn--primary" onClick={() => open({ kind: "finale" })}>
            Ver a cena final
          </button>
        </section>
      )}
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
