# IMPL-0034: Entrega contínua dos cinco Workers na Cloudflare a partir da `main`

**Status:** Aceita — implementada (pedido do responsável técnico em 2026-11-22; escolha "deploy automático no merge,
sem gate extra").
**Data:** 2026-11-22
**Fontes:** pedido do responsável técnico em 2026-11-22; `.github/workflows/ci.yml`,
`.github/workflows/api-secrets.yml`, `package.json` (`deploy:*`), `apps/*/wrangler.jsonc`,
[guides/deploy.md](../guides/deploy.md); documentação da Cloudflare sobre
[GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) e
[permissões de Workers](https://developers.cloudflare.com/workers/authorization/workers/).

## Contexto

O CI já roda em todo PR e em todo push na `main`, mas a publicação dos cinco Workers era manual (`pnpm deploy:*`),
com um token de longa duração na máquina de quem publica. O pedido é publicar automaticamente quando um PR entra na
`main`, sem revelar nenhuma credencial.

O merge continua sendo a autorização humana de publicação. Migrations remotas, criação de recursos Cloudflare e
alteração de segredos de Worker continuam fora do CD e exigem autorização explícita ([AGENTS.md](../../AGENTS.md)).

## Decisão

1. **Gatilho no mesmo workflow.** O job `deploy` fica em `ci.yml`, depois do job `check` (`needs: check`), e só
   roda em `push` para `main`. Ele usa o mesmo commit que o CI validou (`github.sha`). Um workflow separado com
   `workflow_run` teria de fazer checkout de `workflow_run.head_sha`, um padrão que analisadores de segurança
   tratam como código não confiável; o mesmo workflow evita isso e não corre o risco de publicar antes do CI.
2. **Sem gate extra.** O merge é a autorização; o ambiente `production` não tem revisor obrigatório. A política de
   branches do ambiente aceita somente `main`, então um workflow de PR não recebe o segredo mesmo que altere o YAML.
   Um revisor obrigatório pode ser acrescentado depois sem mudar o workflow.
3. **Escopo.** Os cinco Workers existentes, na ordem API → servidor → jogo → painel → site, pelos scripts
   `pnpm deploy:*`. A API usa `pnpm deploy:api` (`wrangler deploy --x-provision=false`) para não criar um bucket R2
   que falte. Não há migration D1, criação de recurso, escrita de segredo de Worker nem deploy de homologação.
4. **Credencial.** `CLOUDFLARE_API_TOKEN` é segredo de ambiente de `production`, não segredo de repositório;
   `CLOUDFLARE_ACCOUNT_ID` é público e está fixado no workflow e nos `wrangler.jsonc`. O token é um "Editor" de
   Workers (`Workers Scripts: Edit`) mais `Workers Routes: Edit` na zona `vilanoeldobem.com.br`. Ele não tem D1,
   R2, KV, Workers Tail, Account Settings nem User Details, e não cria Workers novos (isso exige Admin de conta).
   O token expira em 90 dias e é rotacionado.
5. **Sem OIDC.** O fluxo documentado pela Cloudflare para GitHub Actions usa um API token; o repositório adota esse
   fluxo. Se a Cloudflare passar a oferecer OIDC para deploy de Workers, a troca é feita depois, não agora.
6. **`api-secrets` no mesmo ambiente.** O workflow manual que grava `RESEND_API_KEY` no Worker passa a ler os
   segredos de `production`. Isso substitui a localização dos segredos da IMPL-0012 (repositório → ambiente) e a nota
   de que o `ci` ficava sem segredos e sem deploy: agora há o job `deploy`, com o segredo só no ambiente.
7. **Falha.** O job para no primeiro Worker que falhar e não faz rollback automático. O resumo da execução lista as
   versões anteriores de cada Worker; o rollback é manual (`wrangler rollback <version-id>`, na ordem inversa).
8. **Verificação.** Depois dos cinco Workers, roda `scripts/smoke-api.sh` (até três tentativas) e confere as raízes
   de `www.*` e `dash.*`. As conferências visuais locais (`verify.mjs`, colisões, vida, pranchas, provador, missões)
   continuam sendo gates de PR/release; `verify-live.mjs` continua manual até a OQ-13 ser resolvida.
9. **Cadeia de suprimentos.** Todas as actions dos workflows tocados são fixadas por SHA de commit, e o checkout não
   persiste credenciais (`persist-credentials: false`).

## Consequências

- Todo merge verde na `main` publica os cinco Workers, inclusive mudanças só de documentação (builds idênticas).
- Um merge que altere `wrangler.jsonc` (bandeiras) ou o código vai ao ar sem uma segunda aprovação; a revisão do PR
  é o controle. O CD publica o que está commitado, não decide bandeiras.
- Os passos de deploy reconstroem cada app com o token no ambiente. O escopo do token (Workers Scripts:Edit +
  Routes:Edit, sem D1/R2) limita uma dependência comprometida a publicar Workers existentes e mexer em rotas; as
  dependências vêm do lockfile.
- Um deploy parcial deixa versões misturadas até o rollback manual; o resumo da execução guarda as versões anteriores.
- Migrations continuam manuais e exigem autorização. O código publicado precisa tolerar o schema em produção, como
  já acontece nas rotas públicas; uma migration nova não é aplicada pelo CD.
- O token expira em 90 dias; sem rotação o deploy falha e a versão anterior continua no ar.
- Criar um Worker novo, um recurso Cloudflare ou mudar um segredo continua exigindo Admin/autorização.
- A fronteira de confiança é a `main`: quem pode fazer merge pode alterar o workflow e usar o segredo do ambiente.
  A `main` é protegida e só recebe PR com o CI verde.

## Alternativas consideradas

- **Workflow separado com `workflow_run`:** recusado; faria checkout de um `head_sha` tratado como não confiável por
  analisadores de segurança e poderia correr antes do CI terminar.
- **Publicar na abertura do PR:** recusado; publicaria código não revisado em produção.
- **Revisor obrigatório no ambiente:** não adotado nesta decisão; o responsável escolheu deploy automático no merge.
  Pode ser acrescentado depois, sem mudar o workflow.
- **Cloudflare Workers Builds (integração GitHub):** não preserva a ordem dos cinco Workers nem a dependência do CI
  deste monorepo.
- **OIDC do GitHub com a Cloudflare:** não é o fluxo documentado para deploy de Workers; o token de ambiente é o
  caminho suportado.

## Ver também

[IMPL-0009](0009-split-client-api-server-shared.md) · [IMPL-0012](0012-resend-transactional-email.md) ·
[IMPL-0015](0015-dash-backoffice-app.md) · [guides/deploy.md](../guides/deploy.md) ·
[reference/releases.md](../reference/releases.md) · [AGENTS.md](../../AGENTS.md)
