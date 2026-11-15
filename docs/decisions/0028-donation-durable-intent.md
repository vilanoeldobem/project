# IMPL-0028: Intenção durável da cobrança Pix e eventos do webhook em espera

**Status:** Proposta — implementada, desligada em produção e homologação (`DONATIONS_ENABLED`); a idempotência do
lado da AbacatePay é PENDENTE; a migration 0013 foi aplicada no remoto em 2026-11-15 (01h27 UTC), aditiva, sem uso
enquanto a bandeira estiver desligada
**Data:** 2026-11-14
**Fontes:** auditoria §6.2 (P1, atrás da bandeira); IMPL-0023 (doações e conciliação), IMPL-0002 (nenhum fluxo de
dinheiro simulado), IMPL-0015 (painel), IMPL-0021 (papel de administrador); DEC-010..013, DEC-027, DEC-042; PEN-004,
PEN-006, PEN-026.
**Código:** `apps/api/src/{donations,abacatepay,api}.ts`, `apps/api/src/donations.test.ts`,
`apps/client/src/{lib/api.ts,ui/PixDonation.tsx}`, `packages/shared/src/accounts/errors.ts`,
`apps/api/wrangler.jsonc` (`DONATION_LIMITER`), `migrations/0013_donation_durable_intent.sql`.

## Contexto

A auditoria (§6.2) encontrou dois defeitos no fluxo da IMPL-0023, ambos atrás de `DONATIONS_ENABLED`:

1. `POST /donations/pix` chamava a AbacatePay **antes** de gravar qualquer coisa no D1. Se o provedor criasse a
   cobrança e o D1 falhasse (ou a resposta do provedor demorasse além do tempo-limite), não restava registro local
   da operação. Uma nova tentativa do cliente era outra operação lógica e podia criar uma segunda cobrança.
2. O webhook gravava o id do evento em `abacatepay_webhook_events` mesmo quando nenhuma doação local correspondia à
   cobrança. Um evento que chegasse antes da linha da doação (por exemplo, depois daquela falha do D1) não alterava
   nada, mas ficava marcado como processado: a confirmação de um pagamento real se perdia.

Nenhum dos dois move dinheiro sozinho (o pagador só paga o código Pix que recebeu), mas ambos quebram a regra de
que a linha em `donations` é a fonte única e de que um pagamento confirmado conta uma vez.

## Decisão

1. **Intenção durável antes do provedor.** O cliente envia `idempotencyKey` (UUID; outro formato →
   `400 invalid_idempotency_key`), um por pedido de doação. A API grava `donation_intents` (`pending_provider`) com
   destino, recebedor, subconta, split e um `request_hash` (SHA-256 de destino, ONG, valor e conta) **antes** de
   chamar o provedor. O id da intenção é o id da doação e o `externalId` enviado à AbacatePay. A configuração que a
   chamada exige (chave da API; nenhum marcador de sandbox em produção) é conferida **antes** de gravar a intenção:
   um erro de configuração não deixa linha nem consome a chave.
2. **No máximo uma chamada ao provedor por chave.** Como a deduplicação por `externalId` do lado da AbacatePay não
   está verificada, nenhuma repetição chama o provedor de novo, em nenhum caminho. Com a intenção `created`, a
   repetição responde `200` com a mesma doação. Com `pending_provider`, `409 donation_in_progress`; repetições
   simultâneas causam uma única chamada (a inserção usa `ON CONFLICT DO NOTHING`). Com `unknown`,
   `409 donation_intent_unknown`; com `failed`, `409 donation_intent_failed`: o cliente começa um novo pedido, com
   outra chave. A mesma chave com outro valor, destino ou doador responde `409 idempotency_key_reused`.
3. **Resultado do provedor na mesma intenção; falha não apaga nada.**
   - Sucesso: a doação é inserida e a intenção passa a `created` **na mesma transação** (`db.batch`), e só enquanto
     a intenção ainda está `pending_provider` sem cobrança (ou `unknown` com exatamente aquela cobrança, no caso
     abaixo). Quem chega atrasado, depois de a intenção mudar, não grava doação nem sobrescreve o estado.
   - Provedor respondeu e o D1 falhou, ou a intenção foi marcada parada enquanto ele respondia: a resposta (id da
     cobrança, código Pix, validade) é copiada na intenção, que fica `unknown` (`last_error = 'store_failed'`); a
     resposta é `503 donation_not_confirmed`. A repetição com a mesma chave cria a doação **a partir dessa cópia**,
     sem nova chamada. Ao criar a doação, a cópia volta a `NULL`, menos `provider_charge_id` (liga a intenção à
     cobrança) e `dev_mode`.
   - Sem resposta, tempo esgotado, 5xx ou sucesso sem id: `unknown` (o provedor pode ter criado a cobrança). Recusa
     4xx: `failed` (nada foi criado). Nenhum dos dois volta ao provedor.
   - Se o próprio D1 cair a ponto de não gravar nem a cópia, a intenção fica `pending_provider`; passados 60 s (o
     tempo-limite do provedor é 15 s), a próxima leitura da chave a marca `unknown` (`stale_in_flight`), só para o
     operador, e responde `409 donation_intent_unknown`. Ninguém a assume para chamar o provedor de novo.
   - O jogo mantém a chave enquanto o pedido pode ser retomado (sem resposta, `donation_in_progress`,
     `donation_not_confirmed`) e a troca depois de uma doação concluída ou de `idempotency_key_reused`,
     `donation_intent_unknown`, `donation_intent_failed` e `payment_provider_unavailable`.
4. **Webhook sem doação não é "processado".** Um evento assinado sobre uma cobrança sem doação vai para
   `abacatepay_pending_events` e responde `{ok: true, applied: false, unmatched: true}`; a repetição dele responde
   `duplicate`. A decisão entre "processar" e "esperar" é tomada dentro da mesma transação, pela existência da
   doação, sem relógio. Assim que a doação existe (na criação, em `GET /donations/:id` ou no próximo evento da mesma
   cobrança), os eventos em espera são aplicados na ordem de chegada pela mesma atualização protegida da IMPL-0023,
   gravados em `abacatepay_webhook_events` e marcados com `resolved_at`, numa transação por evento. A
   idempotência continua sendo pelo id do evento.
5. **Visão do operador.** `GET /admin/donations/overview` (só `role = 'admin'`, leitura sem auditoria, como as
   demais listas) ganha `reconciliation`: intenções `unknown` e `pending_provider` paradas, e eventos em espera, cada
   um com a idade em segundos. Só ids, valores, estado, código de erro e o nome público do recebedor: nenhum doador,
   e-mail, código Pix ou comprovante. A tela do painel não muda nesta decisão.
6. **Limite de abuso.** Binding `DONATION_LIMITER` (10 pedidos por 60 s, namespace `1104`), por conta quando há
   sessão e por SHA-256 do `CF-Connecting-IP` para visitantes, aplicado antes de qualquer gravação
   (`429 too_many_requests`). A chave não é gravada nem registrada em log. Sem o binding (local, testes, staging)
   não há limite, como no `AUTH_LIMITER`.
7. **Migration aditiva.** `0013_donation_durable_intent.sql` cria `donation_intents` e `abacatepay_pending_events`;
   nenhuma tabela da 0011 muda (o `CHECK` de `donations.status` não precisou de novos estados). Sem a 0013, com a
   bandeira ligada, `POST /donations/pix`, `GET /donations/:id`, o webhook e a visão do operador respondem
   `503 schema_outdated`; as rotas públicas sempre ativas não leem as tabelas novas (teste cobre v3 a v13).

## O que continua PENDENTE

- **Idempotência do lado da AbacatePay.** O código envia `externalId` em `POST /transparents/create`, mas nada no
  repositório confirma que a AbacatePay recusa ou devolve a mesma cobrança para o mesmo `externalId`, nem que exista
  um cabeçalho de idempotência ou uma consulta de cobrança por `externalId`. Nenhum campo novo da API do provedor
  foi usado. Por isso o desenho é conservador: uma chamada por chave, e um resultado desconhecido fica para o
  operador. Uma cobrança criada pela chamada sem resposta pode existir no painel da AbacatePay sem doação local.
  Confirmar com a documentação ou o suporte da AbacatePay antes de ligar as doações.
- **Chave do limite por endereço sem sal.** O `DONATION_LIMITER` usa SHA-256 do `CF-Connecting-IP` sem chave
  secreta; um HMAC com chave exigiria um novo segredo do Worker, o que depende de aprovação do responsável.
- **Limite antes da repetição idempotente.** O limite de abuso conta também as repetições da mesma chave, inclusive
  as que só devolvem a doação já criada.
- **`paid` depois de `under_dispute`.** A transição herdada da IMPL-0023 aceita um `transparent.completed`
  atrasado depois de uma disputa e devolve a doação a `paid`. Se isso é desejado é PENDENTE.
- **Evento gravado mesmo quando a transição é recusada.** Um evento cuja mudança de status a guarda recusa
  (por exemplo, `paid` depois de `refunded`) entra em `abacatepay_webhook_events` como processado, com
  `applied: false`; não fica registro separado de "recusado".
- **Retenção e limite de `abacatepay_pending_events`.** Não há prazo de retenção nem teto de linhas; eventos de
  cobranças que não são da Vila ficam em espera indefinidamente (visíveis, com a idade).
- **Se o webhook traz `externalId`/`metadata`.** Se trouxer, um evento em espera poderia ser ligado à intenção
  `unknown` sem o id da cobrança. Hoje só o id da cobrança liga um evento a uma doação.
- **Rota do operador para resolver intenções `unknown`.** Não há rota para o admin encerrar uma intenção
  `unknown` ou ligá-la a uma cobrança encontrada no painel do provedor; a visão é só de leitura. Retenção das
  intenções: PENDENTE, como a das demais tabelas de doação.
- Tudo o que a IMPL-0023 deixa PENDENTE continua: contrato da parceira e provedor (PEN-004, PEN-006), Título
  (PEN-026). Nenhuma bandeira foi ligada e nenhuma migration remota foi aplicada.

## Alternativas consideradas

- **Inserir a linha em `donations` com `status = 'pending'` antes do provedor** — a linha apareceria como doação
  pendente sem código Pix, nas listas e na soma por status; e estados como `unknown` exigiriam reconstruir a
  tabela da 0011 para mudar o `CHECK`. Rejeitada: a intenção separada mantém `donations` só com cobranças reais.
- **Responder erro ao webhook sem doação, para o provedor reenviar** — depende de uma política de reenvio da
  AbacatePay que não está verificada. Rejeitada: o evento fica guardado aqui.
- **Chave de idempotência opcional** — manteria o defeito para qualquer cliente que não a enviasse. Rejeitada; o
  jogo foi ajustado no mesmo passo (uma chave por pedido, reaproveitada ao tentar de novo).
- **Retomar `unknown`/`failed` ou uma intenção parada chamando o provedor de novo (até N tentativas)** — foi a
  primeira versão desta decisão. Rejeitada na revisão: sem deduplicação verificada no provedor, cada nova chamada
  pode criar outra cobrança. Uma chamada por chave é a única garantia que o código consegue dar sozinho.
- **Limite só no D1 (contagem de intenções por conta/hora)** — guardaria o hash do endereço do visitante.
  Rejeitada em favor do binding de limite, como nas outras rotas.

## Consequências

- Positivas: nenhuma operação de cobrança fica sem registro local; cada chave causa no máximo uma chamada ao
  provedor, em qualquer caminho; um pagamento confirmado antes da linha da doação não se perde; o operador vê o que
  precisa de atenção, com a idade.
- Negativas: `POST /donations/pix` passa a exigir `idempotencyKey` (o único cliente, o jogo, já envia); um tempo
  esgotado encerra o pedido e quem doa começa outro; duas tabelas e uma migration a aplicar antes de ligar as
  doações; uma cobrança sem doação local é possível no provedor até a idempotência do lado dele ser confirmada.
- Verificação: `pnpm typecheck && pnpm test && pnpm build`; `apps/api/src/donations.test.ts` cobre chave inválida,
  configuração ausente (nada gravado), repetição da mesma chave, chave reaproveitada (`409`), repetições
  simultâneas, uma chamada por chave depois de tempo esgotado, falha de rede, 5xx e 4xx, provedor com sucesso e D1
  com falha (com evento chegando no meio, e duas repetições disputando a cópia), D1 sem gravar nem a cópia
  (intenção parada vira `unknown` sem nova chamada), escritor atrasado barrado depois de a intenção ficar parada,
  evento antes da doação, repetição do evento, ordem dos eventos em espera, drenagem na leitura, limite de abuso e
  schema v12; `apps/client/src/lib/donation-key.test.ts` cobre quando o jogo mantém ou troca a chave;
  `public-ngo.test.ts` cobre v13; `node scripts/verify-media-local.mjs --progress --withdrawal` aplica a 0013 num
  D1 local do workerd.

## Relacionados

[IMPL-0023](0023-donations-abacatepay.md) · [IMPL-0002](0002-donations-disabled-until-partner-contract.md) ·
[IMPL-0015](0015-dash-backoffice-app.md) · [IMPL-0021](0021-administrator-role-and-moderation.md) ·
[api.md](../reference/api.md) · [storage.md](../reference/storage.md)
