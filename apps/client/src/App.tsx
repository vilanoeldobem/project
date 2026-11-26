import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";

import { useVila } from "./game/store";
import { useQuestsEnabled } from "./game/questsFlag";
import { useQuestsV2Enabled } from "./game/questsV2Flag";
import { catalogFor } from "@vila/shared/game/quests-v2/catalog";
import { ALL_WORLD, V1_WORLD } from "@vila/shared/game/quests-v2/world";
import { PixReview } from "./ui/PixReview";
import { initAccount, localRehearsalPage, useAccount } from "./lib/account";
import { type ContextState, watchContext } from "./lib/context-watch";
import { fetchLots, type LotInfo } from "./lib/api";
import { demoAllowed, isUnlisted, withDemoHouses } from "./lib/lots";
import { Account } from "./ui/Account";
import { AvatarPanel } from "./ui/AvatarPanel";
import { Badges } from "./ui/Badges";
import { Donation } from "./ui/Donation";
import { EnvironmentDebug, EnvironmentPanel, GameSound, Presence } from "./ui/Environment";
import { Explore } from "./ui/Explore";
import { Games } from "./ui/Games";
import { Hud } from "./ui/Hud";
import { Indicators } from "./ui/Indicators";
import { Invite } from "./ui/Invite";
import { Lot } from "./ui/Lot";
import { MapPanel } from "./ui/MapPanel";
import { MemoryGame } from "./ui/MemoryGame";
import { StoryGamePanel } from "./ui/StoryGamePanel";
import { GameMenu } from "./ui/Menu";
import { ModerationFlag } from "./ui/Moderation";
import { NgoApplicationPanel } from "./ui/NgoApplication";
import { FinalScene } from "./ui/FinalScene";
import { Missions } from "./ui/Missions";
import { LifeDialog, NpcDialog } from "./ui/NpcDialog";
import { BillboardPanel, PlotPanel, ShopPanel, SitePanel } from "./ui/Village";
import { BrandMark } from "./ui/BrandMark";
import { WorldBoundary, WorldPaused } from "./ui/WorldBoundary";

const World = lazy(() => import("./scene/World").then((m) => ({ default: m.World })));

export function App() {
  const panel = useVila((s) => s.panel);
  const configReady = useAccount((s) => s.configReady);
  const quests = useQuestsEnabled();
  const quests2 = useQuestsV2Enabled();
  const catalog = catalogFor(quests, quests2);
  const world = quests2 ? ALL_WORLD : V1_WORLD;
  const [lots, setLots] = useState<Record<string, LotInfo>>({});

  /** Reads the lots (again after a moderation action changed what the village shows, IMPL-0021). */
  const loadLots = useCallback(() => void fetchLots().then((r) => r && setLots(Object.fromEntries(withDemoHouses(r.lots, location.search, demoAllowed()).map((l) => [l.id, l])))), []);

  useEffect(() => void initAccount(), []);
  useEffect(loadLots, [loadLots]);

  // A lost graphics context pauses the village; one that does not come back shows the failure screen (audit 7.1).
  const [graphics, setGraphics] = useState<ContextState>("ok");
  const stopWatch = useRef<(() => void) | null>(null);
  const onCanvas = useCallback((canvas: HTMLCanvasElement) => {
    stopWatch.current?.();
    stopWatch.current = watchContext(canvas, setGraphics);
  }, []);
  useEffect(() => () => stopWatch.current?.(), []);

  // /config alone decides the local rehearsal. A slow /me never holds the village loading screen.
  if (localRehearsalPage() && !configReady) return <p role="status">Acendendo as luzes da Vila…</p>;
  return (
    <>
      {/* The page heading. The brand is not on the gameplay screen (IMPL-0022): it shows while the village loads. */}
      <h1 className="sr-only">Vila Noel do Bem</h1>
      <main className="stage">
        <WorldBoundary failed={graphics === "failed"}>
          <Suspense
            fallback={
              <div className="loading">
                <div className="loading__brand"><BrandMark large /></div>
                <p>Acendendo as luzes da Vila…</p>
              </div>
            }
          >
            <World lots={lots} onCanvas={onCanvas} />
          </Suspense>
        </WorldBoundary>
        {graphics === "lost" && <WorldPaused />}
      </main>
      {/* The visitor lands in the village: no panel opens by itself (PROPOSTA, IMPL-0022). */}
      <Hud />
      <ModerationFlag />
      <GameMenu />
      {panel.kind === "donation" && <Donation />}
      {panel.kind === "pix-review" && <PixReview key={panel.id} id={panel.id} />}
      {panel.kind === "lot" && <Lot lotId={panel.lotId} info={lots[panel.lotId]} unlisted={isUnlisted(lots, panel.lotId)} onChanged={loadLots} />}
      {panel.kind === "plot" && <PlotPanel plotId={panel.plotId} />}
      {panel.kind === "shop" && <ShopPanel shopId={panel.shopId} />}
      {panel.kind === "billboard" && <BillboardPanel billboardId={panel.billboardId} />}
      {panel.kind === "site" && <SitePanel siteId={panel.siteId} />}
      {panel.kind === "explore" && <Explore lots={lots} />}
      {panel.kind === "invite" && <Invite />}
      {panel.kind === "avatar" && <AvatarPanel />}
      {panel.kind === "games" && <Games />}
      {panel.kind === "map" && <MapPanel lots={lots} />}
      {panel.kind === "badges" && <Badges />}
      {panel.kind === "memory" && <MemoryGame interactionId={panel.interactionId} questId={panel.questId} done={panel.done} />}
      {panel.kind === "story-game" && <StoryGamePanel gameId={panel.gameId} interactionId={panel.interactionId} questId={panel.questId} done={panel.done} />}
      {panel.kind === "missions" && <Missions lots={lots} catalog={catalog} world={world} />}
      {panel.kind === "finale" && <FinalScene />}
      {panel.kind === "npc" && <NpcDialog npcId={panel.npcId} lots={lots} catalog={catalog} world={world} />}
      {panel.kind === "life" && <LifeDialog charId={panel.charId} name={panel.name} role={panel.role} lines={panel.lines} />}
      {panel.kind === "indicators" && <Indicators />}
      {panel.kind === "environment" && <EnvironmentPanel />}
      {panel.kind === "account" && <Account then={panel.then} reason={panel.reason} />}
      {panel.kind === "ngo" && <NgoApplicationPanel lotId={panel.lotId} />}
      <GameSound />
      <Presence />
      <EnvironmentDebug />
    </>
  );
}
