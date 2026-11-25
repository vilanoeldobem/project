import { useEffect, useState } from "react";

import { useVila } from "../game/store";
import { useAccount } from "../lib/account";
import { fetchGlobalDonationConfig, fetchLots, fetchNgoDonationInfo } from "../lib/api";
import { readDraft, type PixDraft } from "../lib/pix-draft";
import { Panel } from "./Panel";
import { PixDonation } from "./PixDonation";

interface Terms {
  recipientName: string;
  ngoPercentBps: number;
  fixedFeeCents: number;
  minAmountCents: number;
}

async function currentTerms(draft: PixDraft): Promise<Terms | null> {
  const target = draft.target;
  if (target.kind === "global") {
    const global = (await fetchGlobalDonationConfig("no-store"))?.global;
    return global?.enabled && global.recipientName === draft.name ? { ...global, recipientName: draft.name } : null;
  }
  const [lots, ngo] = await Promise.all([fetchLots("no-store"), fetchNgoDonationInfo(target.ngoId, "no-store")]);
  const lot = lots?.lots.find(l => l.id === target.lotId);
  if (lot?.state !== "published" || lot.ngo_id !== target.ngoId || !ngo?.enabled || ngo.method !== "abacatepay"
    || ngo.ngoId !== target.ngoId || ngo.name !== draft.name) return null;
  return { recipientName: ngo.name, ngoPercentBps: ngo.ngoPercentBps, fixedFeeCents: ngo.fixedFeeCents, minAmountCents: ngo.minAmountCents };
}

/** Only shows the terms. Verifying a link, refreshing the page or fetching the destination never issues a Pix. */
export function PixReview({ id }: { id: string }) {
  const user = useAccount(s => s.user);
  const enabled = useAccount(s => s.donations && s.enabled);
  const close = useVila(s => s.close);
  const [draft] = useState(() => readDraft(id));
  const [terms, setTerms] = useState<Terms | null | undefined>();
  const [notice, setNotice] = useState("");
  const available = enabled && Boolean(user && !user.blocked && !user.deletionPending && draft && draft.owner === user.id);
  useEffect(() => {
    if (!draft || !available) return;
    let live = true;
    void currentTerms(draft).then(result => { if (live) setTerms(result); });
    return () => { live = false; };
  }, [draft, available]);

  async function recheck() {
    if (!draft || !terms) return false;
    const latest = await currentTerms(draft);
    if (!latest || latest.minAmountCents > draft.amount) {
      setTerms(latest);
      return false;
    }
    if (latest.ngoPercentBps !== terms.ngoPercentBps || latest.fixedFeeCents !== terms.fixedFeeCents
      || latest.minAmountCents !== terms.minAmountCents) {
      setTerms(latest);
      setNotice("As condições mudaram. Confira as parcelas antes de confirmar.");
      return false;
    }
    return true;
  }

  return (
    <Panel title="Confirmar doação por Pix">
      {!available || !draft || terms === null || (terms && draft.amount < terms.minAmountCents) ? (
        <>
          <p role="status">
            Não foi possível retomar esta doação. {!available ? "A conta ou a emissão de Pix está indisponível."
              : terms && draft && draft.amount < terms.minAmountCents ? "O valor escolhido ficou abaixo do mínimo atual."
              : "O destino original ou as condições de pagamento não puderam ser confirmados."}
            {" "}Volte à Vila e escolha novamente o destinatário e o valor.
          </p>
          <button className="btn" onClick={close}>Voltar à Vila</button>
        </>
      ) : terms === undefined ? (
        <p>Conferindo o destino e as condições do Pix…</p>
      ) : (
        <>
          <p>Conta da doação: <strong>@{user?.nickname}</strong></p>
          {notice && <p role="status">{notice}</p>}
          <PixDonation targetKind={draft.target.kind} ngoId={draft.target.kind === "ngo" ? draft.target.ngoId : undefined}
            {...terms} draft={draft} recheck={recheck} />
        </>
      )}
    </Panel>
  );
}
