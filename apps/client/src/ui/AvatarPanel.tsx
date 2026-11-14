/**
 * Appearance of the character (P07) and the free wardrobe (P08), in one sheet: the "Aparência" tab edits a
 * draft and saves it to this browser; the "Visuais" tab wears the cosmetics unlocked by missions (nothing is
 * sold, nothing here is bought). Appearance is local by design (see IMPL-0026): the presence room carries the
 * cosmetic look only, so the note under the portrait says what others see.
 */
import { useState } from "react";

import {
  BASE_LABELS,
  BASES,
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_LABELS,
  HAIRS,
  HEIGHT_LABELS,
  HEIGHTS,
  randomAppearance,
  SKIN_COLORS,
  type Appearance,
} from "@vila/shared/game/appearance";
import { COSMETICS, isUnlocked, requirement, SLOTS, type Slot } from "@vila/shared/game/cosmetics";
import { useVila } from "../game/store";
import { AvatarPortrait } from "./AvatarPortrait";
import { Panel } from "./Panel";
import { SheetSection, SheetTabs } from "./sheet";

const TABS = ["Aparência", "Visuais"] as const;
type Tab = (typeof TABS)[number];

const SLOT_LABEL: Record<Slot, string> = { hat: "Chapéu", scarf: "Cachecol", sweater: "Suéter", palette: "Cores" };

type ColorField = "hairColor" | "skin" | "eyes";

function SwatchRow({
  label,
  field,
  colors,
  value,
  onPick,
}: {
  label: string;
  field: ColorField;
  colors: readonly string[];
  value: string;
  onPick: (color: string) => void;
}) {
  return (
    <div className="swatch-row">
      <span className="field__label">{label}</span>
      <div className="swatch-options">
        {colors.map((color, i) => (
          <button
            key={color}
            type="button"
            className="swatch"
            style={{ background: color }}
            aria-label={`${label} ${i + 1}`}
            aria-pressed={value === color}
            data-field={field}
            data-value={color}
            onClick={() => onPick(color)}
          />
        ))}
      </div>
    </div>
  );
}

export function AvatarPanel() {
  const look = useVila((s) => s.look);
  const saved = useVila((s) => s.appearance);
  const setAppearance = useVila((s) => s.setAppearance);
  const close = useVila((s) => s.close);
  const notify = useVila((s) => s.notify);
  const [draft, setDraft] = useState<Appearance>(saved);
  const [tab, setTab] = useState<Tab>("Aparência");
  const patch = (p: Partial<Appearance>) => setDraft((d) => ({ ...d, ...p }));

  return (
    <Panel board="P07" sheet icon="🎨" title="Aparência do personagem" subtitle="Não são dados da conta.">
      <div className="avatar-preview">
        <AvatarPortrait look={look} appearance={draft} size={13} label="Seu personagem" />
      </div>
      <p className="note">Sua aparência vale neste navegador; os outros visitantes veem o seu visual da Vila.</p>

      <SheetTabs label="Aparência e visuais" tabs={TABS} value={tab} onChange={setTab} />

      {tab === "Aparência" ? (
        <>
          <SheetSection n={1} icon="🧑" title="Visual base">
            <div className="tile-options">
              {BASES.map((base) => (
                <button
                  key={base}
                  type="button"
                  className={`swatch-tile${draft.base === base ? " is-on" : ""}`}
                  aria-pressed={draft.base === base}
                  onClick={() => patch({ base })}
                >
                  <AvatarPortrait look={look} appearance={{ ...draft, base }} size={5} label={BASE_LABELS[base]} />
                  <span>{BASE_LABELS[base]}</span>
                </button>
              ))}
            </div>
          </SheetSection>

          <SheetSection n={2} icon="💇" title="Tipo de cabelo">
            <div className="actions">
              {HAIRS.map((hair) => (
                <button
                  key={hair}
                  type="button"
                  className="btn btn--chip"
                  aria-pressed={draft.hair === hair}
                  onClick={() => patch({ hair })}
                >
                  {draft.hair === hair ? "● " : ""}
                  {HAIR_LABELS[hair]}
                </button>
              ))}
            </div>
          </SheetSection>

          <SheetSection n={3} icon="🎨" title="Cores">
            <SwatchRow label="Cor do cabelo" field="hairColor" colors={HAIR_COLORS} value={draft.hairColor} onPick={(hairColor) => patch({ hairColor })} />
            <SwatchRow label="Cor da pele" field="skin" colors={SKIN_COLORS} value={draft.skin} onPick={(skin) => patch({ skin })} />
            <SwatchRow label="Cor dos olhos" field="eyes" colors={EYE_COLORS} value={draft.eyes} onPick={(eyes) => patch({ eyes })} />
          </SheetSection>

          <SheetSection n={4} icon="📏" title="Altura">
            <div className="actions">
              {HEIGHTS.map((height) => (
                <button
                  key={height}
                  type="button"
                  className="btn btn--chip"
                  aria-pressed={draft.height === height}
                  onClick={() => patch({ height })}
                >
                  {draft.height === height ? "● " : ""}
                  {HEIGHT_LABELS[height]}
                </button>
              ))}
            </div>
            <p className="note">Altura é apenas visual: não dá vantagem no jogo.</p>
          </SheetSection>

          <SheetSection n={5} icon="🧔" title="Barba e bigode">
            <div className="checks">
              <label className="env-check">
                <input type="checkbox" checked={draft.beard} onChange={(e) => patch({ beard: e.target.checked })} />
                Barba
              </label>
              <label className="env-check">
                <input type="checkbox" checked={draft.mustache} onChange={(e) => patch({ mustache: e.target.checked })} />
                Bigode
              </label>
            </div>
          </SheetSection>

          <div className="actions">
            <button className="btn" onClick={() => setDraft(randomAppearance(Math.random))}>
              🎲 Aleatorizar
            </button>
            <button className="btn" onClick={close}>
              Voltar
            </button>
            <button
              className="btn btn--primary"
              onClick={() => {
                setAppearance(draft);
                notify("Aparência salva.");
              }}
            >
              Salvar aparência
            </button>
          </div>
        </>
      ) : (
        <Wardrobe />
      )}
    </Panel>
  );
}

/**
 * Avatar look (PROPOSTA): items unlock only by completing missions or reaching levels — never by buying,
 * drawing lots or time online. Locked items say exactly how to get them.
 */
function Wardrobe() {
  const p = useVila((s) => s.progress);
  const look = useVila((s) => s.look);
  const setLook = useVila((s) => s.setLook);
  return (
    <section className="track look">
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
