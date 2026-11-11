# Banco de homologação

> Banco preparado pela equipe em 11/11/2026 (PR #10). Nenhum Worker de homologação foi publicado; contas seguem
> desligadas. Este guia foi trazido para o `main` junto com a configuração `env.staging` da API.

O ambiente `staging` da API usa um banco próprio. Não compartilha o binding de produção, suas rotas ou suas origens de
navegador.

| Ambiente | Banco | Identificador | Migrations |
|---|---|---|---|
| Produção | `vilanoeldobem` | `7c65d21d-0431-4ec5-bdd0-691dacb81f92` | 0001-0003 (0004-0005 do `main` ainda não aplicadas) |
| Homologação | `vilanoeldobem-staging` | `cda0275f-6ffc-4813-8dee-efd5ae98baf4` | 0001-0005 do `main` |

A configuração `env.staging` em `apps/api/wrangler.jsonc` tem nome de Worker próprio (`vilanoeldobem-api-staging`),
`routes: []`, `workers_dev: false`, nenhuma origem autorizada e `ACCOUNTS_ENABLED = "false"`. Ambientes do Wrangler
não herdam bindings: em homologação não há `EMAIL` (envio falha fechado com `503 mail_unavailable`, sem link na
resposta) nem `AUTH_LIMITER`.

## Histórico

- **11/11/2026, manhã:** banco criado pela equipe (PR #10, id `32ebb383…`) e migrations de uma linha de trabalho
  paralela aplicadas (`0004_accounts.sql`, `0005_player_progress.sql`, `0006_ngo_applications.sql`). Essa linha foi
  substituída pelo PR #13 ([IMPL-0011](../decisions/0011-accounts-magic-link-ngo-review.md)), com outro esquema.
- **11/11/2026, tarde (autorizado pelo responsável):** conferido que o banco estava vazio (só os 8 terrenos da 0002),
  export guardado fora do Git, banco apagado e recriado em ENAM (id `cda0275f…`), migrations 0001-0005 do `main`
  aplicadas. Conferido no remoto: histórico 0001-0005, tabelas e índices de contas/candidaturas (incluindo o índice
  único parcial da 0005), 8 terrenos, `PRAGMA foreign_key_check` sem violações. Serve de ensaio para a aplicação de
  0004-0005 em produção.

## Acesso

Autentique o Wrangler ou forneça um API Token pelo ambiente do processo. Para administrar o banco, o token precisa de
acesso à conta e permissão D1 Edit. Guarde a credencial no cofre local ou no gerenciador de segredos do CI; nunca no
repositório, em comandos com o valor literal, em logs ou em capturas.

Confirme `wrangler whoami` e `wrangler d1 list` antes de escrever.

## Aplicar migrations

Depois de autorização para a mudança, a partir de `apps/api`:

```bash
pnpm exec wrangler d1 export vilanoeldobem-staging --env staging --remote --output /caminho/privado/staging-before.sql
pnpm exec wrangler d1 migrations apply vilanoeldobem-staging --env staging --remote
pnpm exec wrangler d1 execute vilanoeldobem-staging --env staging --remote --command "SELECT name FROM d1_migrations ORDER BY id; PRAGMA foreign_key_check;" --json
```

Use sempre o nome do banco de homologação **e** `--env staging`. Não use o script `db:migrate:remote`, que aponta para
produção. Migrations já aplicadas são imutáveis; correções recebem um novo número.

O export interrompe temporariamente consultas ao banco. O CLI pode mostrar uma URL temporária de download: trate-a
como acesso ao backup e não a publique. Backups podem conter dados pessoais; mantenha-os fora do Git, em local
privado. Dados de homologação devem ser sintéticos.

## Recuperação

Primeiro ensaie o export em um banco local descartável (`wrangler d1 execute <banco> --local --file <backup.sql>`)
com configuração isolada. Confira tabelas e histórico antes de apontar qualquer aplicação para ele.

Para recuperação remota, prefira uma nova migration corretiva ou um banco de recuperação isolado. Uma restauração
Time Travel substitui o estado do banco: consulte `wrangler d1 time-travel info vilanoeldobem-staging --env staging`
e use `time-travel restore` somente após aprovação explícita do instante e do impacto. Não execute uma restauração
contra produção por analogia com este guia.

## Próximos passos

Uma API de homologação acessível ainda precisa de endereço e origens exatas aprovados, política de acesso e
publicação própria. Esta etapa não altera produção, R2 ou pagamentos.

[Guia de publicação](deploy.md) · [Armazenamento](../reference/storage.md)
