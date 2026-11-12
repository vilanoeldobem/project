import { useEffect, useState } from "react";

import { NPCS } from "@vila/shared/game/world";
import { TRACK_LABEL } from "@vila/shared/game/progress";
import { activeQuest, type NpcId, QUESTS, questProgress, questState } from "@vila/shared/game/quests";

import { useVila } from "../game/store";
import type { LotInfo } from "../lib/api";
import { Panel, Status } from "./Panel";

/** Neutral greeting in each resident's voice (PROPOSTA quests-v1; never a call to action). */
const GREETING: Record<NpcId, string> = {
  "sleigh-keeper": "A noite se aproxima. O trenó escuta.",
  "market-keeper": "Chegue perto, que o cheiro é de festa.",
  postmaster: "Toda carta é uma promessa que viaja.",
  "pond-keeper": "A luz do lago acalma até a pressa.",
  storyteller: "Toda história começa com alguém que para para ouvir.",
};

/** Published lots only: the visit quest never names an NGO that does not exist. */
const hasPublishedLot = (lots: Record<string, LotInfo>) => Object.values(lots).some((l) => l.state === "published" && Boolean(l.ngo_name));

/**
 * NPC dialogue (PROPOSTA quests-v1): turn-in first, then the offer, then the quest in progress, then a
 * neutral greeting. Accepting or turning in records one quest event; the next offer of the same NPC
 * appears in the same panel without a second click.
 */
export function NpcDialog({ npcId, lots }: { npcId: NpcId; lots: Record<string, LotInfo> }) {
  const progress = useVila((s) => s.progress);
  const record = useVila((s) => s.record);
  const notify = useVila((s) => s.notify);
  const close = useVila((s) => s.close);
  const npc = NPCS.find((n) => n.id === npcId);
  // Talking to the postmaster completes the talk objective of market-invitations on open.
  const [talked] = useState(() => npcId === "postmaster" && questState(useVila.getState().progress, "market-invitations") === "active");
  useEffect(() => {
    if (!talked) return;
    record("market-invitations", "talk-postmaster");
    notify("Recado entregue a Seu Nivaldo · Volte à Dona Filó.");
  }, [talked, record, notify]);
  if (!npc) return null;

  const turnIn = QUESTS.find((q) => q.turnInNpcId === npcId && questState(progress, q.id) === "ready_to_turn_in");
  const offer = QUESTS.find((q) => q.giverNpcId === npcId && questState(progress, q.id) === "available");
  const running = QUESTS.find((q) => (q.giverNpcId === npcId || q.turnInNpcId === npcId) && questState(progress, q.id) === "active");
  const busy = activeQuest(progress) !== undefined;

  const body = talked ? (
    <>
      <p className="lead">Os convites estão prontos?</p>
      <p>{QUESTS.find((q) => q.id === "market-invitations")?.objectiveDialogue}</p>
      <button className="btn btn--primary" onClick={close}>
        Continuar
      </button>
    </>
  ) : turnIn ? (
    <>
      <p className="lead">{turnIn.title}</p>
      <p>{turnIn.dialogue.turnIn}</p>
      {turnIn.objectKind === "quest_item" && turnIn.objectName && (
        <p className="note">
          Entregando: {turnIn.target}× {turnIn.objectName}
        </p>
      )}
      <button
        className="btn btn--primary"
        onClick={() => {
          record(turnIn.id, "turn-in");
          const next = QUESTS.some((q) => q.giverNpcId === npcId && questState(useVila.getState().progress, q.id) === "available");
          if (!next) close();
        }}
      >
        Concluir missão (+{turnIn.xp} XP)
      </button>
    </>
  ) : offer ? (
    <>
      <p>
        <Status>{TRACK_LABEL[offer.track]}</Status>
      </p>
      <p className="lead">{offer.title}</p>
      <p>{offer.dialogue.offer}</p>
      <p className="note">{offer.description}</p>
      <p>
        <strong>+{offer.xp} XP</strong>
      </p>
      <button
        className="btn btn--primary"
        disabled={busy || (Boolean(offer.needsPublishedLot) && !hasPublishedLot(lots))}
        onClick={() => {
          record(offer.id, "accept");
          notify(`Missão aceita: ${offer.title}`);
          close();
        }}
      >
        Aceitar missão
      </button>
      {busy && (
        <p className="note" role="status">
          Conclua a missão atual primeiro
        </p>
      )}
      {!busy && Boolean(offer.needsPublishedLot) && !hasPublishedLot(lots) && (
        <p className="note" role="status">
          Nenhuma casa publicada ainda
        </p>
      )}
      <button className="btn" onClick={close}>
        Agora não
      </button>
    </>
  ) : running ? (
    <>
      <p className="lead">{running.title}</p>
      <p>{running.description}</p>
      <p className="note">
        Em andamento: {questProgress(progress, running.id).count}/{running.target} {running.unit}
      </p>
      <button className="btn btn--primary" onClick={close}>
        Continuar
      </button>
    </>
  ) : (
    <>
      <p className="lead">{GREETING[npcId]}</p>
      <button className="btn btn--primary" onClick={close}>
        Continuar
      </button>
    </>
  );

  return (
    // After a turn-in the next offer replaces the button that had focus: the key sends focus back to the dialog.
    <Panel kicker={npc.role} title={npc.name} contentKey={talked ? "talked" : (turnIn ?? offer ?? running)?.id ?? "greeting"}>
      {body}
    </Panel>
  );
}
