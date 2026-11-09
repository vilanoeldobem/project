# IMPL-0002: Doações desabilitadas até contrato da parceira e provedor de pagamento

**Status:** Aceita (0.1.0, 2026-11-08)
**Data:** 2026-11-08
**Fontes:** DEC-010..013, DEC-026, DEC-029, PEN-004, PEN-006; doc 23 (D14 bloqueado por G13); dossiê §9.4, §12;
Código: `apps/web/src/ui/Donation.tsx`, `apps/web/src/ui/Lot.tsx`

## Contexto

A interface precisa mostrar a doação desde a chegada (DEC-008), mas não há instituição parceira contratada nem
provedor de pagamento. Um botão que simula doação engana o usuário e fere a transparência da marca.

## Decisão

- Botões "Doar" e "Doar para esta ONG" existem, **desabilitados**, com nota explicando o motivo.
- O destinatário é sempre mostrado: "Instituição parceira: a definir".
- Nenhum código de pagamento, Pix ou link de campanha entra no repositório até G13 e PEN-006 serem resolvidos.
- Indicadores de doação retornam `null`.

## Alternativas consideradas

- **Esconder a doação** — rejeitada: contraria DEC-008 (solidariedade visível).
- **Simular doação em modo demonstração** — rejeitada: risco de confusão e de dado fictício em produção.

## Consequências

- Positivas: transparência; nenhum risco financeiro ou regulatório nesta fase.
- Negativas: a jornada de doação não pode ser testada ponta a ponta até o contrato.
- Verificação: `grep -rn "disabled" apps/web/src/ui/Donation.tsx`.

## Relacionados

[IMPL-0001](0001-stack-react-threejs-cloudflare.md) · ROADMAP marco "Doação e badges"
