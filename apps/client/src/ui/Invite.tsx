/**
 * Invite an ONG (P11, "Convite por link, WhatsApp e e-mail"). The message is the visitor's, the link is the
 * public website; nothing is sent to the API and an invite approves nothing. "Empresa — conhecer parcerias" is
 * not rendered: the Vila has no company programme and no destination to send anyone to.
 */
import { useState } from "react";

import { useVila } from "../game/store";
import { useAccount } from "../lib/account";
import { INVITE_MESSAGE, inviteLinks } from "../lib/invite";
import { SERVICES } from "../lib/services";
import { Panel } from "./Panel";
import { SheetNotice, SheetSection } from "./sheet";

export function Invite() {
  const open = useVila((s) => s.open);
  const notify = useVila((s) => s.notify);
  const accountsEnabled = useAccount((s) => s.enabled);
  const [message, setMessage] = useState(INVITE_MESSAGE);
  const links = inviteLinks(message, SERVICES.site);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(links.link);
      notify("Link copiado.");
    } catch {
      notify("Não foi possível copiar o link.");
    }
  };

  return (
    <Panel board="P11" sheet icon="👥" title="Convide uma ONG" subtitle="Quem conhece a Vila pode se candidatar">
      <SheetSection n={1} icon="🤝" title="ONG — conhecer e se candidatar">
        <div className="sheet-card">
          <p>Uma ONG aprovada pode ter uma casa na Vila.</p>
          {accountsEnabled ? (
            <button className="btn" onClick={() => open({ kind: "ngo" })}>
              Ver o cadastro de ONG
            </button>
          ) : (
            <p className="note">O cadastro de ONGs abre em breve.</p>
          )}
        </div>
      </SheetSection>

      <SheetSection n={2} icon="✏️" title="Mensagem editável">
        <div className="field">
          <label className="field__label" htmlFor="invite-msg">
            O texto vai junto com o link
          </label>
          <textarea
            id="invite-msg"
            rows={3}
            maxLength={500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
      </SheetSection>

      <SheetSection n={3} icon="📣" title="Compartilhar o convite (você escolhe):">
        <div className="actions">
          <button className="btn" onClick={() => void copyLink()}>
            🔗 Copiar link
          </button>
          <a className="btn" href={links.whatsapp} target="_blank" rel="noopener noreferrer">
            💬 WhatsApp
          </a>
          <a className="btn" href={links.email}>
            ✉️ E-mail
          </a>
        </div>
      </SheetSection>

      <SheetNotice tone="pending" icon="ℹ️">
        Indicação não garante aprovação.
      </SheetNotice>
    </Panel>
  );
}
