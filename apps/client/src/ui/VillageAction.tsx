import { useEffect } from "react";

import { type Panel, type Place, useVila } from "../game/store";
import { hudKeyAction } from "../lib/hud-keys";

/** Symbol + words, never colour alone, like the other contextual actions of the HUD. */
const LABEL: Record<NonNullable<Place>["kind"], string> = {
  plot: "🏠 Ver terreno residencial",
  shop: "🎁 Ver loja",
  billboard: "📜 Ler placa",
};

const panelOf = (place: NonNullable<Place>): Panel =>
  place.kind === "plot" ? { kind: "plot", plotId: place.id } : place.kind === "shop" ? { kind: "shop", shopId: place.id } : { kind: "billboard", billboardId: place.id };

/**
 * Contextual action for the places of the expanded village (IMPL-0023): a residential plot, a shop door, a
 * billboard. Same button, same place on the screen and same keys (E, Enter, tap) as the HUD's action for lots
 * and villagers; `Player` sets at most one of `nearby` and `place`, so the two buttons never show together.
 * It lives beside the HUD instead of inside its switch only because the HUD was being reworked in parallel:
 * folding the three kinds into `Hud.tsx` is a follow-up.
 */
/** The place whose action shows: none under an open panel or while the HUD's own action (`nearby`) is up. */
export const actionPlace = (state: { panel: Panel; nearby: unknown; place: Place }): Place => (state.panel.kind === "none" && state.nearby === null ? state.place : null);

/** The button itself (pure): the HUD's action button, in the HUD's own layer. */
export function VillageActionButton({ place, onOpen }: { place: Place; onOpen: (panel: Panel) => void }) {
  if (!place) return null;
  return (
    <div className="hud">
      <button className="btn btn--primary hud__action" onClick={() => onOpen(panelOf(place))}>
        {LABEL[place.kind]} <kbd>E</kbd>
      </button>
    </div>
  );
}

export function VillageAction() {
  const place = useVila(actionPlace);
  const open = useVila((s) => s.open);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const at = actionPlace(useVila.getState());
      if (!at) return;
      if (hudKeyAction(e.key, e.target instanceof Element ? e.target : null, true) === "activate") open(panelOf(at));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return <VillageActionButton place={place} onOpen={open} />;
}
