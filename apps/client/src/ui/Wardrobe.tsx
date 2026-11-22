/**
 * The P08 provador and inventory: ten categories, a live portrait, the free items the visitor owns and the
 * paid cards that can only be tried on and read ("Ver compra"). It is the same component in every shop (only
 * that shop's categories) and in the appearance sheet (all ten). Nothing here is bought: a paid item is never
 * equipped and the note says the purchase is not available (D21/PEN-022). No price, no currency, no timer.
 */
import { useState } from "react";

import {
  DEFAULT_LOOK,
  isPaid,
  SLOT_LABELS,
  SLOTS,
  type Cosmetic,
  type Slot,
} from "@vila/shared/game/cosmetics";
import {
  COSMETICS_V2,
  isUnlockedIn,
  requirementIn,
  unlockedIdsIn,
  wearIn,
} from "@vila/shared/game/cosmetics-v2";
import { STORY_CATALOG } from "@vila/shared/game/quests-v2/catalog";
import { useVila } from "../game/store";
import { shopSlots } from "../game/wardrobe";
import { AvatarPortrait } from "./AvatarPortrait";
import { SheetSection } from "./sheet";

const ICONS: Record<Slot, string> = {
  helmet: "🎅",
  blouse: "👕",
  pants: "👖",
  dress: "👗",
  shoes: "👢",
  back: "🎒",
  face: "🥸",
  handLeft: "🤚",
  handRight: "✋",
  special: "✨",
};

/**
 * Paid previews stay hidden: what may be shown about paid looks to an audience that likely includes minors is PEN-022,
 * still open, and a shop says nothing is sold there (AGENTS.md). Owner's decision of 2026-11-14; the catalogue keeps
 * the paid entries, and turning this on shows the cards, "Ver compra" and the note below as IMPL-0027 proposes.
 */
export const SHOW_PAID_PREVIEWS = false;

const stateOf = (c: Cosmetic, on: boolean, owned: boolean): "equipped" | "paid" | "owned" | "locked" =>
  on ? "equipped" : isPaid(c) ? "paid" : owned ? "owned" : "locked";

export function Wardrobe({ shopId }: { shopId?: string }) {
  const slots = shopId ? shopSlots(shopId) : SLOTS;
  const [slot, setSlot] = useState<Slot>(slots[0]);
  const [preview, setPreview] = useState<string | null>(null);
  const [paidNote, setPaidNote] = useState(false);
  const [onlyOwned, setOnlyOwned] = useState(false);
  const look = useVila((s) => s.look);
  const progress = useVila((s) => s.progress);
  const appearance = useVila((s) => s.appearance);
  const setLook = useVila((s) => s.setLook);
  const owned = unlockedIdsIn(COSMETICS_V2, progress);
  const freeCount = COSMETICS_V2.filter((c) => !isPaid(c)).length;
  const ownedCount = COSMETICS_V2.filter((c) => !isPaid(c) && isUnlockedIn(COSMETICS_V2, c, progress)).length;
  const items = COSMETICS_V2.filter((c) => c.slot === slot && (SHOW_PAID_PREVIEWS || !isPaid(c)) && (!onlyOwned || owned.has(c.id)));
  const previewItem = preview ? COSMETICS_V2.find((c) => c.id === preview) ?? null : null;
  const previewLook = previewItem ? wearIn(COSMETICS_V2, look, previewItem.id) : look;

  return (
    <div className="wardrobe" data-owned={ownedCount} data-free={freeCount} data-preview={preview ?? ""}>
      <div className="wardrobe__preview">
        <SheetSection n={2} icon="🧍" title="Avatar (prévia)">
          <div className="wardrobe__portrait">
            <AvatarPortrait look={previewLook} appearance={appearance} size={12} label={previewItem ? `Prévia de ${previewItem.name}` : "Seu personagem"} />
          </div>
          <p className="wardrobe__caption">{previewItem ? `Prévia: ${previewItem.name}` : "Seu visual atual"}</p>
          {previewItem && (
            <div className="actions">
              <button type="button" className="btn" onClick={() => setPreview(null)}>
                Voltar ao meu visual
              </button>
            </div>
          )}
          {previewItem && !owned.has(previewItem.id) && (
            <p className="note">Prévia: o item não está no seu inventário; nada é equipado.</p>
          )}
          {previewLook.dress !== DEFAULT_LOOK.dress && (
            <p className="note">Vestido não combina com blusa e calça: uma peça sai quando a outra entra.</p>
          )}
        </SheetSection>
      </div>

      <div className="wardrobe__body">
        <SheetSection n={1} icon="🗂️" title="Selecionar categoria">
          <div className="category-tabs">
            {slots.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={slot === s}
                data-slot={s}
                onClick={() => {
                  setSlot(s);
                  setPreview(null);
                  setPaidNote(false);
                }}
              >
                <span aria-hidden="true">{ICONS[s]}</span>
                <span>{SLOT_LABELS[s]}</span>
              </button>
            ))}
          </div>
        </SheetSection>

        <div className="wardrobe__inventory">
          <p className="note" data-owned-count={`${ownedCount} de ${freeCount}`}>
            No inventário: {ownedCount} de {freeCount} visuais gratuitos.
          </p>
          <label className="env-check">
            <input type="checkbox" checked={onlyOwned} onChange={(e) => setOnlyOwned(e.target.checked)} />
            Só o que eu tenho
          </label>
        </div>

        <SheetSection n={3} icon="👕" title={`Itens da categoria: ${SLOT_LABELS[slot]}`}>
          <ul className="item-grid">
            {items.map((c) => {
              const on = look[c.slot] === c.id;
              const open = owned.has(c.id);
              const paid = isPaid(c);
              return (
                <li
                  key={c.id}
                  className="item-card"
                  data-item-id={c.id}
                  data-slot={c.slot}
                  data-sale={paid ? "paid" : "free"}
                  data-state={stateOf(c, on, open)}
                >
                  <button type="button" className="item-card__thumb" aria-label={`Provar ${c.name}`} onClick={() => { setPreview(c.id); setPaidNote(false); }}>
                    <AvatarPortrait look={wearIn(COSMETICS_V2, look, c.id)} appearance={appearance} size={5.5} label={c.name} />
                    <span>{c.name}</span>
                    <span className={`item-card__chip${paid ? " item-card__chip--paid" : ""}`}>{paid ? "Pago" : "Grátis"}</span>
                  </button>
                  <p className="item-card__state">{on ? "Em uso" : open ? "Já disponível" : paid ? "" : requirementIn(STORY_CATALOG, c)}</p>
                  {paid ? (
                    <button type="button" className="btn" onClick={() => setPaidNote(true)}>
                      Ver compra
                    </button>
                  ) : on ? (
                    <button type="button" className="btn" disabled>
                      Em uso
                    </button>
                  ) : open ? (
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => {
                        setLook(wearIn(COSMETICS_V2, look, c.id));
                        setPreview(null);
                        setPaidNote(false);
                      }}
                    >
                      Equipar
                    </button>
                  ) : (
                    <button type="button" className="btn" disabled>
                      Equipar
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {items.length === 0 && <p className="note">Você ainda não tem itens nesta categoria.</p>}
          {paidNote && (
            <p className="note" role="status" data-paid-note>
              A compra de visuais não está disponível.
            </p>
          )}
          {SHOW_PAID_PREVIEWS && <p className="note">Visuais pagos são compras de aparência. Doações são separadas.</p>}
        </SheetSection>
      </div>
    </div>
  );
}
