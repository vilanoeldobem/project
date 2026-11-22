import { useEffect, useState } from "react";

import { TRACK_LABEL, type Progress } from "@vila/shared/game/progress";
import {
  activeQuestIn,
  questProgressIn,
  questStateIn,
  V1_CATALOG,
} from "@vila/shared/game/quests-v2/catalog";
import type { StoryCatalog, StoryWorld } from "@vila/shared/game/quests-v2/types";
import { V1_WORLD } from "@vila/shared/game/quests-v2/world";

import { useVila } from "../game/store";
import type { LotInfo } from "../lib/api";
import { Panel, Status } from "./Panel";

/** Neutral greeting in each resident's voice (PROPOSTA quests-v1; never a call to action). */
const GREETING: Record<string, string> = {
  "sleigh-keeper": "A noite se aproxima. O trenó escuta.",
  "market-keeper": "Chegue perto, que o cheiro é de festa.",
  postmaster: "Toda carta é uma promessa que viaja.",
  "pond-keeper": "A luz do lago acalma até a pressa.",
  storyteller: "Toda história começa com alguém que para para ouvir.",
};

/**
 * What a character of the village says (IMPL-0025, PROPOSTA): two or three fixed lines, chosen when the dialogue
 * opened (`game/village-life.ts`, `@vila/shared/game/life-dialogue`), and one button that closes it. Nothing to
 * accept, nothing to answer, nothing that leads to a second screen. Quest NPCs keep `NpcDialog` below.
 */
export function LifeDialog({ charId, name, role, lines }: { charId: string; name: string; role: string; lines: string[] }) {
  const close = useVila((s) => s.close);
  return (
    <Panel kicker={role} title={name} contentKey={charId}>
      {lines.map((line, i) => (
        <p key={i} className={i === 0 ? "lead" : undefined} data-life-line={i}>
          {line}
        </p>
      ))}
      <button className="btn btn--primary" onClick={close}>
        Continuar
      </button>
    </Panel>
  );
}

/** Published lots only: the visit quest never names an NGO that does not exist. */
const hasPublishedLot = (lots: Record<string, LotInfo>) => Object.values(lots).some((l) => l.state === "published" && Boolean(l.ngo_name));

/**
 * NPC dialogue (PROPOSTA quests-v1 / quests-v2): turn-in first, then the offer, then the quest in progress,
 * then a neutral greeting. Accepting or turning in records one quest event; the next offer of the same NPC
 * appears in the same panel without a second click.
 */
export function NpcDialog({
  npcId,
  lots,
  catalog = V1_CATALOG,
  world = V1_WORLD,
  progress,
}: {
  npcId: string;
  lots: Record<string, LotInfo>;
  catalog?: StoryCatalog;
  world?: StoryWorld;
  progress?: Progress;
}) {
  const stored = useVila((s) => s.progress);
  const p = progress ?? stored;
  const record = useVila((s) => s.record);
  const notify = useVila((s) => s.notify);
  const close = useVila((s) => s.close);
  const npc = world.npcs.find((n) => n.id === npcId);
  // The v1 postmaster talk objective is recorded on open, exactly as before.
  const v1Talk = npcId === "postmaster" && questStateIn(catalog, p, "market-invitations") === "active";
  // A v2 talk interaction records its objective when the target NPC's dialogue opens.
  const storyTalk = world.interactions.find(
    (i) =>
      i.kind === "talk" &&
      i.npcId === npcId &&
      questStateIn(catalog, p, i.questId) === "active" &&
      !p.seen[`${i.questId}:${i.id}`]
  );
  const [talked] = useState(() => v1Talk || storyTalk !== undefined);
  const [v1TalkAtOpen] = useState(() => v1Talk);
  const [talkInteraction] = useState(() => storyTalk);
  useEffect(() => {
    if (!talked) return;
    if (v1TalkAtOpen) {
      record("market-invitations", "talk-postmaster");
      notify("Recado entregue a Seu Nivaldo · Volte à Dona Filó.");
    } else if (talkInteraction) {
      record(talkInteraction.questId, talkInteraction.id);
      notify(talkInteraction.done ?? `Recado entregue a ${npc?.name ?? "quem escuta"}.`);
    }
  }, [talked, v1TalkAtOpen, talkInteraction, record, notify, npc?.name]);
  if (!npc) return null;

  const turnIn = catalog.quests.find((q) => q.turnInNpcId === npcId && questStateIn(catalog, p, q.id) === "ready_to_turn_in");
  const offer = catalog.quests.find((q) => q.giverNpcId === npcId && questStateIn(catalog, p, q.id) === "available");
  const running = catalog.quests.find(
    (q) => (q.giverNpcId === npcId || q.turnInNpcId === npcId) && questStateIn(catalog, p, q.id) === "active"
  );
  const busy = activeQuestIn(catalog, p) !== undefined;
  const talkQuest = talkInteraction ? catalog.quests.find((q) => q.id === talkInteraction.questId) : undefined;

  const body = talked ? (
    <>
      <p className="lead">
        {v1TalkAtOpen
          ? "Os convites estão prontos?"
          : (talkQuest?.objectiveDialogue ?? "Recado entregue")}
      </p>
      <p>
        {v1TalkAtOpen
          ? catalog.quests.find((q) => q.id === "market-invitations")?.objectiveDialogue
          : (talkInteraction?.done ?? "A Vila ouviu.")}
      </p>
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
          const next = catalog.quests.some(
            (q) => q.giverNpcId === npcId && questStateIn(catalog, useVila.getState().progress, q.id) === "available"
          );
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
        Em andamento: {questProgressIn(catalog, p, running.id).count}/{running.target} {running.unit}
      </p>
      <button className="btn btn--primary" onClick={close}>
        Continuar
      </button>
    </>
  ) : (
    <>
      <p className="lead">{npc.greeting ?? GREETING[npcId] ?? "A Vila escuta."}</p>
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
