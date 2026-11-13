import { COSMETICS, isUnlocked, requirement, SLOTS, type Slot } from "@vila/shared/game/cosmetics";

import { useVila } from "../game/store";
import { useAccount } from "../lib/account";
import { levelOf, MISSIONS, TRACK_LABEL, XP_PER_LEVEL, type Progress, type Track } from "@vila/shared/game/progress";
import { activeInventory, CHAIN_TITLES, type NpcId, QUESTS, questProgress, questState } from "@vila/shared/game/quests";
import { NPCS } from "@vila/shared/game/world";
import { useQuestsEnabled } from "../game/questsFlag";
import type { LotInfo } from "../lib/api";
import { Panel } from "./Panel";

/** Mission log (P14, DEC-039/040). Progress is saved in this browser only (accounts are D06). */
export function Missions({ lots = {} }: { lots?: Record<string, LotInfo> }) {
  const p = useVila((s) => s.progress);
  const quests = useQuestsEnabled();
  return (
    <Panel kicker="Missões da Vila" title="Caderno de Missões">
      <XpBar />
      {(Object.keys(TRACK_LABEL) as Track[]).map((track) => (
        <section key={track} className="track">
          <h3>{TRACK_LABEL[track]}</h3>
          <ul className="mission-list">
            {MISSIONS.filter((m) => m.track === track).map((m) => {
              const n = p.counters[m.id] ?? 0;
              const done = Boolean(p.completed[m.id]);
              return (
                <li key={m.id} className={done ? "done" : ""}>
                  <span aria-hidden>{done ? "★" : "☆"}</span>
                  <span>
                    {m.title}
                    <small>
                      {n}/{m.target} {m.unit} · {m.xp} XP
                    </small>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {quests && <QuestBook progress={p} lots={lots} />}
      <LookPicker />
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

const SLOT_LABEL: Record<Slot, string> = { hat: "Chapéu", scarf: "Cachecol", sweater: "Suéter", palette: "Cores" };

/**
 * Avatar look (PROPOSTA): items unlock only by completing missions or reaching levels — never by buying,
 * drawing lots or time online. Locked items say exactly how to get them.
 */
function LookPicker() {
  const p = useVila((s) => s.progress);
  const look = useVila((s) => s.look);
  const setLook = useVila((s) => s.setLook);
  return (
    <section className="track look">
      <h3>Visual do avatar</h3>
      {SLOTS.map((slot) => (
        <fieldset key={slot} className="look__slot">
          <legend>{SLOT_LABEL[slot]}</legend>
          <div className="look__options">
            {COSMETICS.filter((c) => c.slot === slot).map((c) => {
              const open = isUnlocked(c, p);
              return (
                <button
                  key={c.id}
                  className={`btn btn--chip look__item${look[slot] === c.id ? " is-on" : ""}`}
                  aria-pressed={look[slot] === c.id}
                  disabled={!open}
                  title={open ? c.name : requirement(c)}
                  onClick={() => setLook({ [slot]: c.id })}
                >
                  {open ? c.name : `🔒 ${c.name}`}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
      <p className="note">Visuais novos chegam ao concluir missões e subir de nível. Nada aqui se compra.</p>
    </section>
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
