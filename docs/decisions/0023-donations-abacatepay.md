# IMPL-0023: Doações Pix e conciliação com a AbacatePay (global e por ONG)

**Status:** Proposta — implementada, desligada em produção e homologação (`DONATIONS_ENABLED`); depende de PEN-004,
PEN-006 e PEN-026
**Data:** 2026-11-13
**Fontes:** DEC-010..013 (doação global para uma única parceira), DEC-026, DEC-027 (indicador sem fonte = `null`),
DEC-029 (jogar não é doar), DEC-041 (Título), DEC-042 (doação não dá XP), DEC-037 (só admin configura/publica),
PEN-004, PEN-006, PEN-026; IMPL-0002, IMPL-0009, IMPL-0011, IMPL-0015, IMPL-0017, IMPL-0020; wireframes P01, P04 e
P15; API pública v2 da AbacatePay (`/v2/sub-accounts/create`, `/v2/transparents/*`).
**Código:** `packages/shared/src/donations/contract.ts`, `apps/api/src/{donations,abacatepay}.ts`,
`apps/api/src/api.ts`, `apps/dash/src/ui/Donations.tsx`, `apps/client/src/ui/{Donation,Lot,PixDonation,Title}.tsx`,
`migrations/0011_donations_abacatepay.sql`.

## Contexto

A Vila mostra a doação desde a chegada (DEC-008), mas nenhum meio de pagamento podia existir antes de haver
contrato da instituição parceira e provedor definidos (PEN-004, PEN-006; IMPL-0002). O desenho aprovado prevê dois
fluxos: **doação global**, para uma única instituição parceira, e **doação por ONG**, na casa dela. Sem contrato, o
código precisa existir, ser testável ponta a ponta em sandbox — e continuar desligado em produção.

A AbacatePay v2 cobra Pix com repasse por subconta (`splits`) e avisa o pagamento por webhook assinado. Um Pix
confirmado deve contar uma única vez nos indicadores públicos e no Título do doador (DEC-041); estorno ou disputa
perdida precisam desfazer o crédito. Um link de pagamento da própria ONG não permite confirmar nada sozinho: no
máximo, o Vila registra o redirecionamento.

## Decisão

1. **Bandeira única e escura.** `DONATIONS_ENABLED` (`"false"` em produção e staging; `"true"` só no script local
   `dev`). Desligada, nenhuma rota `/donations/*` ou `/webhooks/abacatepay` existe (`404`), `/config` diz
   `donations: false`, os botões continuam desabilitados com a nota da IMPL-0002 e as rotas públicas não leem
   nenhuma tabela nova.
2. **Split em centavos inteiros, no código compartilhado.** `ngoShare = floor(valor × bps / 10000) − taxaFixa`; o
   resto fica com a Vila. Padrão 95,00% e R$ 0,80. A configuração é recusada quando a doação mínima de R$ 2,00
   deixaria a ONG com menos de 1 centavo ou a Vila com menos que a taxa base — o mesmo limite que a AbacatePay
   impõe (`soma(splits) ≤ valor − platformFee`). O cálculo vive em `packages/shared` e é o mesmo no jogo, na API e
   no painel: um só arredondamento, sem divergência entre QR Code, D1 e tela.
3. **Dois destinos, nenhum atalho.** A doação global vai para a subconta da instituição parceira (DEC-010..013:
   nunca dividida entre as ONGs da Vila). A doação por ONG usa a subconta da própria ONG, criada/localizada pelo
   CNPJ, ou o link HTTPS da organização — este último só depois de a administração abrir e confirmar o link. O
   clique no link externo vira uma linha em `donation_redirects` e nada mais; um comprovante externo conferido por
   admin entra nos indicadores com `title_credited = 0`, porque a regra do Título para link externo é PENDENTE
   (PEN-026).
4. **Conciliação idempotente, sem contador paralelo.** Webhook (`transparent.completed`, `.refunded`, `.disputed`,
   `.lost`), `GET /donations/:id?refresh=1` e a simulação de sandbox passam por uma única atualização, guardada
   pelo status atual. No webhook, a atualização só vale enquanto o id do evento (`log_…`) ainda não está em
   `abacatepay_webhook_events`, e o id é gravado em seguida na mesma transação (`db.batch`): a decisão não usa
   horário nem valor gerado pelo pedido, então uma repetição, mesmo no mesmo milissegundo ou simultânea, responde
   `duplicate` e não altera nada. Estorno é final e vale a partir de qualquer status: se chega antes da
   confirmação do pagamento, a confirmação atrasada não reabre a doação. O Título e os indicadores são **somados
   de `donations`** (`status = 'paid'` e `title_credited = 1`), então repetir o webhook não duplica crédito;
   estorno/disputa perdida zeram o crédito. Doação não concede XP (DEC-042).
5. **Webhook autenticado nos dois sentidos.** Exige o segredo configurado no painel da AbacatePay
   (`X-Webhook-Secret` ou `?webhookSecret=`, comparado em tempo constante com `ABACATEPAY_WEBHOOK_SECRET`) e a
   assinatura `X-Webhook-Signature` = base64(HMAC-SHA256(corpo bruto, chave pública da AbacatePay)). O corpo é lido
   como bytes antes do JSON; nunca é re-serializado. Falha → `401 invalid_webhook_signature`, sem gravar nada.
6. **Configuração só por admin, auditada.** `POST /admin/donations/settings` (instituição parceira, CNPJ, split,
   subconta) e `POST /admin/ngos/:id/payment-config` exigem `role = 'admin'`, `accountId` da sessão e origem exata;
   cada mutação grava `audit_events` (`donation.settings_update`, `ngo.payment_config`,
   `donation.external_proof`) sem CNPJ, URL, subconta ou referência de comprovante.
7. **Sandbox utilizável antes da habilitação.** Se a conta de sandbox ainda não tem subcontas habilitadas
   (`Função não habilitada`), `createOrGetSubAccount` devolve `dev_sacc_<cnpj>` fora de produção e a cobrança sai
   sem `splits`; o split completo continua no D1 e a simulação de pagamento exercita o fluxo inteiro. Em produção a
   mesma recusa responde `409 subaccounts_unavailable` e o admin pode informar um `sacc_…` existente. A simulação
   (`POST /donations/:id/simulate`) só existe fora de produção e em cobrança `dev_mode`.
8. **Migration aditiva e compatibilidade.** `0011_donations_abacatepay.sql` cria cinco tabelas e não altera
   nenhuma existente. Com a bandeira ligada e o banco atrás do código, as rotas de doação respondem
   `503 schema_outdated`; com a bandeira desligada as rotas públicas respondem nos schemas v3 a v11 (teste cobre
   todas as combinações de bandeiras e bucket).
9. **Privacidade e produto.** `/donations/config` e `/ngos/:id/donation-info` nunca expõem CNPJ, subconta ou a URL
   do link próprio. Nenhuma chave, segredo, CNPJ ou dado do pagador é registrado em log. As faixas do Título são
   PROPOSTA (PEN-026) e vivem em código compartilhado, sem tocar `Progress.xp`.

## Alternativas consideradas

- **Checkout hospedado em vez de Pix transparente** — menos código, mas não exercita o split por subconta nem o
  webhook que o desenho aprovado exige; adiada até PEN-006.
- **Contador de Título por conta** — mais uma escrita para manter em sincronia com estornos e repetições;
  rejeitada: a soma das doações já é a fonte única.
- **Dividir a doação global entre as ONGs da Vila** — contraria DEC-010..013; rejeitada.
- **Tratar o redirecionamento externo como doação** — sem confirmação verificável, inventaria número público;
  rejeitada (DEC-027).
- **Ler `donations` em `/indicators` com a bandeira desligada** — quebraria a produção que roda atrás do código;
  rejeitada: a leitura é condicionada à bandeira e tolera a tabela ausente.

## Consequências

- Positivas: fluxo completo testável em sandbox (Pix, QR Code, webhook, simulação, estorno); um único lugar decide
  split e Título; nenhuma mudança de comportamento em produção enquanto a bandeira estiver desligada.
- Negativas: mais duas superfícies para revisar quando o contrato existir (chaves e webhook da AbacatePay); a
  política de Título para link externo fica deliberadamente incompleta até PEN-026; nenhuma migration remota foi
  aplicada e nenhuma bandeira foi ligada.
- Verificação: `pnpm typecheck && pnpm test && pnpm build`; `apps/api/src/donations.test.ts` cobre configuração,
  split mínimo, webhook válido/repetido (também no mesmo milissegundo e em entregas simultâneas)/adulterado,
  estorno, disputa, eventos fora de ordem, link externo, comprovante, sandbox e schema
  v9; `packages/shared/src/donations/contract.test.ts` cobre split, link e faixas do Título. O teste de rotas
  públicas (`public-ngo.test.ts`) passa a cobrir o schema v11.

## Relacionados

[IMPL-0002](0002-donations-disabled-until-partner-contract.md) · [IMPL-0009](0009-split-client-api-server-shared.md) ·
[IMPL-0011](0011-accounts-magic-link-ngo-review.md) · [IMPL-0015](0015-dash-backoffice-app.md) ·
[IMPL-0017](0017-ngo-files-r2.md) · [IMPL-0020](0020-ngo-publication-withdrawal.md) ·
[api.md](../reference/api.md) · [storage.md](../reference/storage.md) · [open-questions.md](open-questions.md)
