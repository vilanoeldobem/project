import { lazy, Suspense, useCallback, useEffect, useState } from "react";

import { useVila } from "./game/store";
import { fetchLots, type LotInfo } from "./lib/api";
import { AccountPanel, AuthBootstrap } from "./ui/Account";
import { Donation } from "./ui/Donation";
import { EnvironmentDebug, EnvironmentPanel, GameSound, Presence } from "./ui/Environment";
import { Explore } from "./ui/Explore";
import { Hud } from "./ui/Hud";
import { Indicators } from "./ui/Indicators";
import { Lot } from "./ui/Lot";
import { MemoryGame } from "./ui/MemoryGame";
import { Missions } from "./ui/Missions";
import { NgoApplications } from "./ui/NgoApplications";
import { Welcome } from "./ui/Welcome";

const World = lazy(() => import("./scene/World").then((m) => ({ default: m.World })));

export function App() {
  const panel = useVila((s) => s.panel);
  const [lots, setLots] = useState<Record<string, LotInfo>>({});

  const refreshLots = useCallback((fresh = false) => {
    void fetchLots(fresh).then((r) => r && setLots(Object.fromEntries(r.lots.map((l) => [l.id, l]))));
  }, []);
  useEffect(refreshLots, [refreshLots]);

  return (
    <>
      <AuthBootstrap />
      <main className="stage">
        <Suspense fallback={<div className="loading">Acendendo as luzes da Vila…</div>}>
          <World lots={lots} />
        </Suspense>
      </main>
      <Hud />
      {panel.kind === "welcome" && <Welcome />}
      {panel.kind === "donation" && <Donation />}
      {panel.kind === "lot" && <Lot lotId={panel.lotId} info={lots[panel.lotId]} />}
      {panel.kind === "explore" && <Explore lots={lots} />}
      {panel.kind === "memory" && <MemoryGame />}
      {panel.kind === "missions" && <Missions />}
      {panel.kind === "indicators" && <Indicators />}
      {panel.kind === "environment" && <EnvironmentPanel />}
      {panel.kind === "account" && <AccountPanel />}
      {panel.kind === "ngo-applications" && <NgoApplications lotId={panel.lotId} review={panel.review} lots={lots} onPublished={() => refreshLots(true)} />}
      <GameSound />
      <Presence />
      <EnvironmentDebug />
    </>
  );
}
