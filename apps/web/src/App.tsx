import { lazy, Suspense, useEffect, useState } from "react";

import { useVila } from "./game/store";
import { fetchLots, type LotInfo } from "./lib/api";
import { Donation } from "./ui/Donation";
import { GameSound, EnvironmentDebug, EnvironmentPanel } from "./ui/Environment";
import { Explore } from "./ui/Explore";
import { Hud } from "./ui/Hud";
import { Indicators } from "./ui/Indicators";
import { Lot } from "./ui/Lot";
import { MemoryGame } from "./ui/MemoryGame";
import { Missions } from "./ui/Missions";
import { Welcome } from "./ui/Welcome";

const World = lazy(() => import("./scene/World").then((m) => ({ default: m.World })));

export function App() {
  const panel = useVila((s) => s.panel);
  const [lots, setLots] = useState<Record<string, LotInfo>>({});

  useEffect(() => {
    fetchLots().then((r) => r && setLots(Object.fromEntries(r.lots.map((l) => [l.id, l]))));
  }, []);

  return (
    <>
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
      <GameSound />
      <EnvironmentDebug />
    </>
  );
}
