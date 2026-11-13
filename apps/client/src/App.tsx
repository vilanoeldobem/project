import { lazy, Suspense, useCallback, useEffect, useState } from "react";

import { useVila } from "./game/store";
import { initAccount } from "./lib/account";
import { fetchLots, type LotInfo } from "./lib/api";
import { Account } from "./ui/Account";
import { Donation } from "./ui/Donation";
import { EnvironmentDebug, EnvironmentPanel, GameSound, Presence } from "./ui/Environment";
import { Explore } from "./ui/Explore";
import { Hud } from "./ui/Hud";
import { Indicators } from "./ui/Indicators";
import { Lot } from "./ui/Lot";
import { MemoryGame } from "./ui/MemoryGame";
import { GameMenu } from "./ui/Menu";
import { ModerationFlag } from "./ui/Moderation";
import { NgoApplicationPanel } from "./ui/NgoApplication";
import { Missions } from "./ui/Missions";
import { NpcDialog } from "./ui/NpcDialog";
import { BillboardPanel, PlotPanel, ShopPanel } from "./ui/Village";
import { Wordmark } from "./ui/Wordmark";

const World = lazy(() => import("./scene/World").then((m) => ({ default: m.World })));

export function App() {
  const panel = useVila((s) => s.panel);
  const [lots, setLots] = useState<Record<string, LotInfo>>({});

  /** Reads the lots (again after a moderation action changed what the village shows, IMPL-0021). */
  const loadLots = useCallback(() => void fetchLots().then((r) => r && setLots(Object.fromEntries(r.lots.map((l) => [l.id, l])))), []);

  useEffect(() => void initAccount(), []);
  useEffect(loadLots, [loadLots]);

  return (
    <>
      {/* The page heading. The brand is not on the gameplay screen (IMPL-0022): it shows while the village loads. */}
      <h1 className="sr-only">Vila Noel do Bem</h1>
      <main className="stage">
        <Suspense
          fallback={
            <div className="loading">
              <Wordmark large />
              <p>Acendendo as luzes da Vila…</p>
            </div>
          }
        >
          <World lots={lots} />
        </Suspense>
      </main>
      {/* The visitor lands in the village: no panel opens by itself (PROPOSTA, IMPL-0022). */}
      <Hud />
      <ModerationFlag />
      <GameMenu />
      {panel.kind === "donation" && <Donation />}
      {panel.kind === "lot" && <Lot lotId={panel.lotId} info={lots[panel.lotId]} unlisted={Object.keys(lots).length > 0 && !lots[panel.lotId]} onChanged={loadLots} />}
      {panel.kind === "plot" && <PlotPanel plotId={panel.plotId} />}
      {panel.kind === "shop" && <ShopPanel shopId={panel.shopId} />}
      {panel.kind === "billboard" && <BillboardPanel billboardId={panel.billboardId} />}
      {panel.kind === "explore" && <Explore lots={lots} />}
      {panel.kind === "memory" && <MemoryGame />}
      {panel.kind === "missions" && <Missions lots={lots} />}
      {panel.kind === "npc" && <NpcDialog npcId={panel.npcId} lots={lots} />}
      {panel.kind === "indicators" && <Indicators />}
      {panel.kind === "environment" && <EnvironmentPanel />}
      {panel.kind === "account" && <Account then={panel.then} />}
      {panel.kind === "ngo" && <NgoApplicationPanel lotId={panel.lotId} />}
      <GameSound />
      <Presence />
      <EnvironmentDebug />
    </>
  );
}
