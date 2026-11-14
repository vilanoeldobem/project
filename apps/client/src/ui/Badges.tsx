/**
 * The donor's badges (P15, DEC-041; stages PROPOSTA, PEN-026): the four Faixas from the shared contract, the
 * account's own stage from `/donations/my-title` (a paid donation credits the tier once) and a preview of how
 * the badge reads. The board's "Exibir na Vila" is not drawn: showing names or badges over avatars is out of
 * scope (IMPL-0008). No number here is invented: with donations off, the panel says so.
 */
import { useEffect, useState } from "react";

import { formatBrl, TITLE_TIERS, type TitleProgress } from "@vila/shared/donations/contract";

import { useVila } from "../game/store";
import { useAccount } from "../lib/account";
import { fetchMyTitle } from "../lib/api";
import { AvatarPortrait } from "./AvatarPortrait";
import { Panel } from "./Panel";
import { SheetNotice, SheetSection } from "./sheet";

const BADGE_KEY = "vila.badge.v1";
const TIERS = TITLE_TIERS.filter((t) => t.tier > 0);

const BADGE_VIEWS = ["Ícone", "Texto"] as const;
type BadgeView = (typeof BADGE_VIEWS)[number];

function readBadgeView(): BadgeView {
  try {
    return localStorage.getItem(BADGE_KEY) === "text" ? "Texto" : "Ícone";
  } catch {
    return "Ícone";
  }
}

function TierBadge({ tier, label }: { tier: number; label: string }) {
  return (
    <svg className="tier-badge" viewBox="0 0 64 64" role="img" aria-label={label}>
      {tier >= 4 && <path className="tier-badge__wing" d="M8 30 L2 22 L10 24 L7 16 L16 20 L14 12 L24 18 Z M56 30 L62 22 L54 24 L57 16 L48 20 L50 12 L40 18 Z" />}
      {tier >= 3 && <path className="tier-badge__laurel" d="M14 46 Q2 36 8 22 Q6 34 16 40 Z M50 46 Q62 36 56 22 Q58 34 48 40 Z" />}
      <path
        className={`tier-badge__shield${tier >= 2 ? " is-framed" : ""}`}
        d="M32 5 L55 13 V33 Q55 50 32 59 Q9 50 9 33 V13 Z"
      />
      <text className="tier-badge__num" x="32" y="39" textAnchor="middle">
        {["I", "II", "III", "IV"][tier - 1] ?? tier}
      </text>
    </svg>
  );
}

export function Badges() {
  const user = useAccount((s) => s.user);
  const donations = useAccount((s) => s.donations);
  const look = useVila((s) => s.look);
  const appearance = useVila((s) => s.appearance);
  const open = useVila((s) => s.open);
  const [data, setData] = useState<TitleProgress | null | undefined>(undefined);
  const [view, setView] = useState<BadgeView>(readBadgeView);
  const nickname = user?.nickname ?? null;

  useEffect(() => {
    setData(undefined);
    if (!donations || !user) return;
    let live = true;
    fetchMyTitle().then((result) => live && setData(result?.title ?? null));
    return () => {
      live = false;
    };
  }, [donations, user]);

  const choose = (next: BadgeView) => {
    setView(next);
    try {
      localStorage.setItem(BADGE_KEY, next === "Texto" ? "text" : "icon");
    } catch {
      /* storage unavailable: the choice lasts for this session */
    }
  };

  return (
    <Panel board="P15" sheet icon="🏅" title="Suas badges" subtitle="Doações confirmadas">
      {!user && (
        <SheetNotice tone="info" icon="👤">
          Entre na sua conta para ver seu badge.
        </SheetNotice>
      )}
      {user && !donations && (
        <SheetNotice tone="pending" icon="ℹ️">
          Os badges aparecem quando as doações estiverem habilitadas.
        </SheetNotice>
      )}
      {user && donations && (
        <SheetSection n={1} icon="🏅" title="Seu badge">
          {data === undefined && <p className="note">Carregando seu badge…</p>}
          {data === null && <p className="note">Não foi possível carregar seu badge agora.</p>}
          {data && (
            <div className="sheet-card">
              <strong>{data.tierLabel}</strong>
              <p>
                {data.confirmedCount} {data.confirmedCount === 1 ? "doação confirmada" : "doações confirmadas"}
              </p>
              {data.nextTierCents !== null && <p className="note">Próxima faixa a partir de {formatBrl(data.nextTierCents)}.</p>}
            </div>
          )}
        </SheetSection>
      )}

      <SheetSection n={2} icon="🎖️" title="Faixas">
        <div className="tier-grid">
          {TIERS.map((tier) => (
            <div key={tier.tier} className={`tier-card${data?.tier === tier.tier ? " is-on" : ""}`} aria-current={data?.tier === tier.tier ? "true" : undefined}>
              <TierBadge tier={tier.tier} label={tier.label} />
              <span>{tier.label}</span>
              <small>A partir de {formatBrl(tier.minCents)}</small>
            </div>
          ))}
        </div>
      </SheetSection>

      <SheetSection n={3} icon="👤" title="Como você aparece">
        <div className="badge-preview">
          <AvatarPortrait look={look} appearance={appearance} size={7} label="Seu personagem" />
          <div>
            <strong>@{nickname ?? "visitante"}</strong>
            <div className="actions">
              {BADGE_VIEWS.map((option) => (
                <button key={option} type="button" className="btn btn--chip" aria-pressed={view === option} onClick={() => choose(option)}>
                  {view === option ? "● " : ""}
                  {option}
                </button>
              ))}
            </div>
            <p className="note">{view === "Ícone" ? <TierBadge tier={Math.max(1, data?.tier || 1)} label="Exemplo de badge" /> : (data?.tierLabel ?? "Sem título ativo")}</p>
          </div>
        </div>
        <p className="note">Cada doação confirmada conta uma vez. Badges não dão XP (DEC-042).</p>
      </SheetSection>

      <SheetNotice tone="pending" icon="ℹ️">
        Faixas e visuais são proposta (PEN-026).
      </SheetNotice>

      {!user && (
        <div className="actions">
          <button className="btn btn--primary" onClick={() => open({ kind: "account" })}>
            Entrar na conta
          </button>
        </div>
      )}
    </Panel>
  );
}
