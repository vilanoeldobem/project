/**
 * The signed-in donor's Título de Doação (P15, DEC-041; PROPOSTA, PEN-026). Shown in the mission log and in the
 * account panel only when the API has donations on. The amount is the sum of the account's paid Pix donations
 * credited once; a refund removes it. Donations grant no XP (DEC-042).
 */
import { useEffect, useState } from "react";

import { formatBrl } from "@vila/shared/donations/contract";

import { useAccount } from "../lib/account";
import { fetchMyTitle, type MyTitle } from "../lib/api";

export function MyTitleCard() {
  const donations = useAccount((s) => s.donations);
  const user = useAccount((s) => s.user);
  const [data, setData] = useState<MyTitle | null | undefined>(undefined);
  const userId = user?.id;
  useEffect(() => {
    if (!donations || !userId) return;
    let live = true;
    fetchMyTitle().then((result) => live && setData(result));
    return () => {
      live = false;
    };
  }, [donations, userId]);
  if (!donations || !user) return null;
  return (
    <section className="track" data-title-tier={data?.title.tier}>
      <h3>Meu Título de Doação (DEC-041)</h3>
      {data === undefined && <p className="note">Carregando seu Título…</p>}
      {data === null && <p className="note">Não foi possível carregar seu Título agora.</p>}
      {data && (
        <>
          <p>
            <strong>{data.title.tierLabel}</strong>
          </p>
          <p className="note">
            Total confirmado: {formatBrl(data.title.eligibleCents)} em {data.title.confirmedCount}{" "}
            {data.title.confirmedCount === 1 ? "doação confirmada" : "doações confirmadas"}.
          </p>
          {data.title.nextTierCents !== null && <p className="note">Próxima faixa a partir de {formatBrl(data.title.nextTierCents)}.</p>}
        </>
      )}
      <p className="note">Cada doação confirmada via Pix conta uma única vez para o Título e não concede XP de missão (DEC-042).</p>
    </section>
  );
}
