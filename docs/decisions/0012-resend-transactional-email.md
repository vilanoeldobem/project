# IMPL-0012: E-mail transacional pelo Resend

**Status:** Aceita pelo responsável técnico (2026-11-11) — implementada e testada; sem efeito em produção até a chave
`RESEND_API_KEY` ser gravada no Worker, o domínio ser verificado no Resend e as contas serem ligadas
**Data:** 2026-11-11
**Fontes:** pedido do responsável técnico em 2026-11-11 ("for email use resend, create full integration and wait for
API key (i will put in github)"); OQ-08 (provedor de e-mail); [IMPL-0011](0011-accounts-magic-link-ngo-review.md)
item 4, que esta decisão substitui; documentação do Resend consultada em 2026-11-11
(`resend.com/docs/api-reference`); código: `apps/api/src/mail.ts`, `apps/api/src/api.ts`, `apps/api/wrangler.jsonc`,
`.github/workflows/api-secrets.yml`

## Contexto

O único e-mail da Vila é o link de acesso (link mágico, OQ-03). A IMPL-0011 escolheu o Cloudflare Email Service
(binding `send_email`), descartando um provedor externo para não guardar chave de API no Worker. O serviço está em
beta, o domínio ainda não tinha sido cadastrado e nenhum e-mail chegou a ser enviado em produção (as contas seguem
desligadas). No mesmo dia o responsável técnico pediu a troca pelo Resend.

## Decisão

1. **Envio pela API HTTPS do Resend:** `POST https://api.resend.com/emails`, com `Authorization: Bearer`, limite de
   8 s e cabeçalho `User-Agent` (o Resend recusa com `403` requisições sem ele, e o `fetch` dos Workers não envia um
   por padrão). Sem SDK: uma chamada `fetch` basta e não acrescenta dependência.
2. **Chave como segredo do Worker** (`RESEND_API_KEY`), nunca em `vars`, no repositório ou em log. Chave com
   permissão só de envio.
3. **Falha fechada, como antes:** sem chave, com resposta diferente de 2xx ou com falha de rede, a API responde
   `503 mail_unavailable`. O link só volta na resposta (`devLink`) quando `ENVIRONMENT` é `development` ou `test`.
4. **Log mínimo:** `mail_error`, o status HTTP e o nome do erro do Resend (`validation_error`,
   `rate_limit_exceeded`…). Nunca endereço, link, chave nem a mensagem do erro, que pode citar o domínio ou o
   destinatário.
5. **`GET /health` informa `mail`** (se a chave existe, nunca o valor), para conferir a configuração sem enviar
   e-mail.
6. **Sem binding `send_email`:** removido do `wrangler.jsonc` (produção e homologação). Homologação continua sem
   envio, agora por não ter a chave.
7. **Workflow manual `api-secrets`:** grava `RESEND_API_KEY` no Worker a partir dos segredos do GitHub
   (`RESEND_API_KEY`, `CLOUDFLARE_API_TOKEN`). Só roda quando uma pessoa dispara; o `ci` continua sem segredos e sem
   deploy.
8. **Remetente inalterado:** `acesso@vilanoeldobem.com.br` (`MAIL_FROM`), uma única mensagem em pt-BR, texto e
   HTML, sem rastreio nem marketing.

## Alternativas consideradas

- **Manter o Cloudflare Email Service:** sem chave no Worker e na mesma conta, mas em beta e ainda não configurado.
  Substituído a pedido do responsável técnico.
- **SDK oficial do Resend:** recusado; uma dependência a mais para uma única requisição.
- **Chave em `vars` do `wrangler.jsonc`:** recusado; ficaria no repositório.
- **Repetir o envio em caso de falha:** não adotado. A pessoa pode pedir outro link, e repetir sem chave de
  idempotência poderia enviar dois e-mails.

## Consequências

- Passa a existir um segredo no Worker da API, e um token da Cloudflare no GitHub se o workflow for usado. Os dois
  precisam de dono e de rotação.
- O Resend passa a tratar o e-mail e o nickname de quem pede o link, fora do Brasil. Isso precisa entrar na revisão
  LGPD / ECA Digital (operador, transferência internacional) antes de `ACCOUNTS_ENABLED` ir para `"true"`.
- Antes do primeiro envio é preciso verificar o domínio do remetente no Resend (registros SPF e DKIM no DNS). O
  Resend recomenda um subdomínio no lugar do domínio raiz; manter `acesso@vilanoeldobem.com.br` ou mudar o remetente
  é decisão do responsável.
- Limites do plano do Resend (cota diária e mensal, 10 requisições por segundo) passam a valer. Acima deles o envio
  falha fechado.
- Desenvolvimento local e testes não mudam: sem chave, a API devolve `devLink`.

## Relacionados

- [IMPL-0011](0011-accounts-magic-link-ngo-review.md) (contas e link mágico), [open-questions.md](open-questions.md)
  (OQ-08)
- [deploy §7.2](../guides/deploy.md#72-e-mail-pelo-resend-impl-0012), [api — E-mail](../reference/api.md#e-mail-resend-impl-0012)
