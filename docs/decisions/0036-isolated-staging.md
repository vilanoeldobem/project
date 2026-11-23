# IMPL-0036: Homologação isolada para o cadastro de ONG

**Status:** Aceita — implementada no repositório (issue #65, PR #112); publicação e ativação **PENDENTES**.
**Data:** 2026-11-23
**Fontes:** issue #65 e PR #112; `apps/*/wrangler.jsonc`; `apps/client/vite.config.ts`,
`apps/dash/vite.config.ts`, `apps/site/vite.config.ts`; `scripts/staging-pages.ts`,
`scripts/check-staging.mjs`; `.github/workflows/ci.yml`; [guia de homologação](../guides/staging-database.md);
[IMPL-0011](0011-accounts-magic-link-ngo-review.md), [IMPL-0012](0012-resend-transactional-email.md) e
[IMPL-0021](0021-administrator-role-and-moderation.md).

## Contexto

O cadastro de cidadão e a candidatura de ONG precisam ser ensaiados de ponta a ponta em hosts reais, com e-mail,
CORS, sessão e um banco próprio, sem tocar nos dados nem nas bandeiras de produção. As contas e os fluxos de ONG
seguem desligados em produção (`ACCOUNTS_ENABLED`, `NGO_FILES_ENABLED` etc.) até a revisão de LGPD / ECA Digital.
O D1 de homologação já era separado, mas a configuração do Worker não tinha rotas, origens de navegador nem
limites: não havia um ambiente executável para a jornada completa.

## Decisão

1. **Cinco Workers e hosts irmãos.** Cada app tem um Worker `*-staging` com domínio próprio:
   `vilanoeldobem-api-staging` em `api-staging.vilanoeldobem.com.br`,
   `vilanoeldobem-server-staging` em `server-staging.vilanoeldobem.com.br`,
   `vilanoeldobem-staging` (jogo) em `play-staging.vilanoeldobem.com.br`,
   `vilanoeldobem-dash-staging` em `dash-staging.vilanoeldobem.com.br` e
   `vilanoeldobem-site-staging` em `www-staging.vilanoeldobem.com.br`. Produção não muda: hosts, CORS, CSP,
   bandeiras e D1 continuam como estão.
2. **Banco próprio.** A API de homologação usa o D1 `vilanoeldobem-staging`
   (`cda0275f-6ffc-4813-8dee-efd5ae98baf4`), separado do banco de produção
   (`7c65d21d-0431-4ec5-bdd0-691dacb81f92`), apontando para o mesmo diretório de migrations. A atualização do
   banco remoto até a `0015` é uma etapa manual do operador.
3. **Build de teste.** Jogo, painel e site usam `vite build --mode staging` e um diretório de assets próprio,
   `.wrangler/staging-assets`. Os endereços saem de `endpoints("staging")`; o jogo e o site reescrevem os hosts
   de produção para os hosts irmãos e removem o bloco de analytics do HTML; a CSP de teste não permite GTM/GA e
   pede `noindex`. O painel usa o mesmo modo e os seus próprios cabeçalhos. `scripts/staging-pages.ts` é
   ferramenta de build compartilhada pelos três `vite.config.ts`, não código de runtime dos apps e não pertence a
   `packages/shared`.
4. **API de teste.** Declara só `AUTH_LIMITER` (namespace `2101`, 10 requisições/60 s) e nenhum bucket R2. Todas as
   bandeiras de contas, arquivos, retirada, bloqueio, presença moderada, terrenos residenciais, doações e níveis de
   ONG ficam `"false"`. As origens são exatamente os hosts irmãos. O `MAIL_FROM` continua sendo o remetente de
   produção `acesso@vilanoeldobem.com.br` até a equipe decidir o remetente de homologação.
5. **Servidor de teste.** Tem Worker e sala próprios, com o binding de serviço `API` apontando para
   `vilanoeldobem-api-staging` e `PRESENCE_MODERATION_ENABLED = "false"`.
6. **CI valida, não publica.** O job `check` roda `pnpm staging:check`, que constrói os três frontends, confere
   nomes, hosts, CSP, bindings e assets de teste e faz `wrangler deploy --dry-run` dos cinco Workers. A publicação
   de homologação é manual, pelo operador, com os comandos do guia; o CD de produção (IMPL-0034, PR #111) não
   publica homologação. Migrations de homologação também são manuais e exigem autorização.

## Pendente (não decidido no código)

- **Acesso dos testadores:** os hosts ficam publicamente acessíveis quando publicados; o mecanismo de controle de
  acesso ainda não foi escolhido pela equipe.
- **Remetente:** o `MAIL_FROM` atual é o de produção; aceitá-lo ou configurar um remetente de homologação e a chave
  Resend do ambiente é decisão da equipe.
- **Operador:** quem publica, quem guarda a chave e quem acompanha a caixa de teste.
- **Ativação de contas:** só depois da revisão de LGPD / ECA Digital registrada pelo responsável, com a chave
  Resend de homologação e o schema aplicado. Uma implementação testada não autoriza a ativação.

## Consequências

- Os hosts de homologação ficam públicos assim que publicados, até o controle de acesso ser aplicado.
- `--var ACCOUNTS_ENABLED:true` cria divergência em relação à configuração versionada; é preciso republicar sem o
  override para encerrar novas entradas.
- A publicação e as migrations são manuais; não há CD de homologação.
- O `staging:check` acrescenta tempo ao CI (três builds de frontend e cinco dry-runs).
- O remetente de produção é compartilhado até a decisão do remetente de homologação.
- Dados de homologação são sintéticos; sem bucket R2, os uploads de arquivos continuam desligados.
- O caminho de produção não muda.

## Alternativas consideradas

- **Reutilizar o Worker de produção com bandeiras:** recusado; misturaria dados, CORS, analytics e hosts de
  produção no ensaio.
- **Testar só localmente:** recusado; não exercita e-mail real, domínios, CORS nem o cookie de sessão entre hosts.
- **Um Worker para os cinco apps:** recusado; cada app tem assets, CSP e Worker próprios (IMPL-0009).
- **Publicar homologação automaticamente no merge:** recusado; a ativação é uma ação do operador e o CD da
  IMPL-0034 tem escopo de produção.

## Relacionados

[IMPL-0009](0009-split-client-api-server-shared.md) · [IMPL-0011](0011-accounts-magic-link-ngo-review.md) ·
[IMPL-0012](0012-resend-transactional-email.md) · [IMPL-0015](0015-dash-backoffice-app.md) ·
[IMPL-0021](0021-administrator-role-and-moderation.md) · [guia de homologação](../guides/staging-database.md) ·
[guia de publicação](../guides/deploy.md) · issue #65 · PR #112.
