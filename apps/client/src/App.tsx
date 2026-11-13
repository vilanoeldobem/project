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
import { ModerationFlag } from "./ui/Moderation";
import { NgoApplicationPanel } from "./ui/NgoApplication";
import { Missions } from "./ui/Missions";
import { NpcDialog } from "./ui/NpcDialog";
import { BillboardPanel, PlotPanel, ShopPanel } from "./ui/Village";
import { VillageAction } from "./ui/VillageAction";
import { Welcome } from "./ui/Welcome";

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
      <main className="stage">
        <Suspense fallback={<div className="loading">Acendendo as luzes da Vila…</div>}>
          <World lots={lots} />
        </Suspense>
      </main>
      <Hud />
      <ModerationFlag />
      <VillageAction />
      {panel.kind === "welcome" && <Welcome />}
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
