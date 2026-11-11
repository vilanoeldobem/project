# Banco de homologação

> Preparação do D1 em 11/11/2026. Nenhum Worker de homologação foi publicado e o login público permanece desabilitado.

O ambiente `staging` da API usa um banco próprio. Não compartilha o binding de produção, suas rotas ou suas origens de navegador.

| Ambiente | Banco | Identificador | Migrations verificadas |
|---|---|---|---|
| Produção | `vilanoeldobem` | `7c65d21d-0431-4ec5-bdd0-691dacb81f92` | 0001-0003; somente leitura nesta entrega |
| Homologação | `vilanoeldobem-staging` | `32ebb383-e765-4ed0-aa25-d8871be3e414` | 0001-0005 aplicadas e conferidas |

Os recursos pertencem à conta do projeto configurada em `apps/api/wrangler.jsonc`. A configuração de homologação tem nome de Worker próprio, `routes: []`, `workers_dev: false` e nenhuma origem autorizada. Isso prepara o banco sem criar um endereço público de teste nem ativar o adaptador local de e-mail.

## Acesso

Autentique o Wrangler ou forneça um API Token pelo ambiente do processo. Para administrar o banco, o token precisa de acesso à conta e permissão D1 Edit. Guarde a credencial no cofre local ou no gerenciador de segredos do CI; nunca no repositório, em comandos com o valor literal, em logs ou em capturas.

Confirme `wrangler whoami` e `wrangler d1 list` antes de escrever. Account ID identifica a conta; credenciais S3/R2 não substituem a autorização D1.

## Aplicar uma nova migration

Depois de autorização para a mudança, a partir de `apps/api`:

```bash
pnpm exec wrangler d1 export vilanoeldobem-staging --env staging --remote --output /caminho/privado/staging-before.sql
pnpm exec wrangler d1 migrations apply vilanoeldobem-staging --env staging --remote
pnpm exec wrangler d1 execute vilanoeldobem-staging --env staging --remote --command "SELECT name FROM d1_migrations ORDER BY id; PRAGMA foreign_key_check;" --json
```

Use simultaneamente o nome do banco de homologação e `--env staging`. Não use o script `db:migrate:remote`, que continua apontando para produção. Migrations já aplicadas permanecem imutáveis; correções recebem um novo número.

O export interrompe temporariamente consultas ao banco escolhido. O CLI pode mostrar uma URL temporária de download: trate-a como acesso ao backup e não a publique. Backups podem conter dados pessoais; mantenha-os fora do Git, em local privado. Dados de homologação devem ser sintéticos.

## Evidência executada

- Export do banco vazio antes da aplicação, preservado localmente.
- Migrations 0001-0004 aplicadas somente no D1 de homologação.
- Histórico e tabelas conferidos no remoto; `PRAGMA foreign_key_check` não retornou violações.
- Sete casos SQL remotos: unicidade de e-mail e nickname sem distinção de maiúsculas; sessão rejeita usuário inexistente; chave de link rejeita duplicata; consumo de um registro de link ocorre uma vez; exclusão do usuário sintético remove a sessão por cascata; limpeza deixa tabelas de contas vazias.
- `PRAGMA integrity_check` não é aceito pela interface D1 usada e não foi considerado aprovado.

Esses casos verificam a integridade do schema. O fluxo completo de autenticação continua validado localmente, com cliente e API separados; não foi disponibilizado em uma URL de homologação.

## Progresso por conta - migration 0005

Antes da migration 0005, um novo export do schema v4 foi preservado fora do Git e restaurado em SQLite descartável. Somente `0005_player_progress.sql` foi aplicada nesta rodada, usando o nome e ambiente de homologação explícitos. Histórico 0001-0005 e ausência de violações de chave estrangeira foram conferidos no remoto.

Onze verificações passaram: restauração do export v4, histórico/FKs, rejeição de usuário ausente, JSON inválido e revisão negativa, uma linha por usuário, rejeição de CAS com revisão antiga, preservação da marca de importação em atualização posterior, cascata de exclusão, limpeza das tabelas de contas/progresso e produção inalterada. A marca é preservada pela escrita condicional da aplicação; o schema não impõe sozinho a política de importação única.

Os testes usaram usuário sintético descartável e deixaram `auth_users`, `auth_links`, `auth_sessions`, `auth_local_outbox` e `player_progress` vazias. Produção permanece nas migrations 0001-0003, sem tabelas de conta/progresso; as consultas de verificação escreveram zero linhas. Não houve publicação de API nem teste HTTP remoto de autenticação. A jornada integrada de progresso foi validada localmente.

## Recuperação

Primeiro ensaie o export em um banco local descartável, usando `wrangler d1 execute <banco> --local --file <backup.sql>` com configuração isolada. Confira as tabelas e o histórico antes de apontar qualquer aplicação para ele.

Para recuperação remota, prefira uma nova migration corretiva ou um banco de recuperação isolado. Uma restauração Time Travel substitui o estado do banco: consulte `wrangler d1 time-travel info vilanoeldobem-staging --env staging` e use `time-travel restore` somente após aprovação explícita do instante e do impacto. Não execute uma restauração contra produção por analogia com este guia.

O export inicial vazio foi restaurado em SQLite local descartável. Não foi realizado ensaio de restauração remota nem de recuperação com dados reais.

## Próximas liberações

Uma API de homologação acessível ainda precisa de endereço e origens exatas aprovados, política de acesso e publicação específica. Login por e-mail exige provedor/remetente e configuração própria de entrega; `AUTH_MODE=local` permanece restrito a loopback. Esta etapa prepara o schema de contas e progresso; não altera produção, R2 ou pagamentos e não coleta progresso de jogadores reais.

[Guia de publicação](deploy.md) · [Armazenamento](../reference/storage.md) · [Login local](auth-local.md)
