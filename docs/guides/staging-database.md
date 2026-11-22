# Banco de homologação

## Posição em 22/11/2026

A equipe conferiu o D1 de homologação por leitura autenticada no Wrangler. O histórico continha **cinco migrations**,
até `0005_one_active_application.sql`. A consulta ao Worker previsto
`vilanoeldobem-api-staging` retornou o erro Cloudflare **10007** (Worker não encontrado). A revisão de referência
da release 0.8.0 é [`6d4e4fc`](https://github.com/vilanoeldobem/project/tree/6d4e4fc) e contém migrations até a
**0015**. A equipe não consultou o D1 de produção nesta conferência. O [histórico de releases](../reference/releases.md)
registra as verificações anteriores de produção.

Na revisão indicada, `env.staging` em [wrangler.jsonc](../../apps/api/wrangler.jsonc) aponta para o banco próprio
`vilanoeldobem-staging`. A configuração traz `routes: []`, `workers_dev: false`, origens de navegador vazias e
`ACCOUNTS_ENABLED = "false"`. O ambiente tem listas vazias de rate limiters e buckets R2. Sem credencial de envio
configurada, a API de staging responde `503 mail_unavailable` a uma tentativa válida de envio com contas habilitadas.

## Histórico

O quadro abaixo registra **11/11/2026**. Os números indicam o que a equipe observou naquele dia.

| Ambiente | Banco | Identificador | Migrations registradas em 11/11 |
|---|---|---|---|
| Produção | `vilanoeldobem` | `7c65d21d-0431-4ec5-bdd0-691dacb81f92` | 0001–0003 |
| Homologação, após recriação | `vilanoeldobem-staging` | `cda0275f-6ffc-4813-8dee-efd5ae98baf4` | 0001–0005 |

- **11/11/2026, manhã:** banco criado pela equipe (PR #10, id `32ebb383…`) e migrations de uma linha de trabalho
  paralela aplicadas (`0004_accounts.sql`, `0005_player_progress.sql`, `0006_ngo_applications.sql`). Essa linha foi
  substituída pelo PR #13 ([IMPL-0011](../decisions/0011-accounts-magic-link-ngo-review.md)), com outro esquema.
- **11/11/2026, tarde (autorizado pelo responsável):** conferido que o banco estava vazio (só os 8 terrenos da 0002),
  export guardado fora do Git, banco apagado e recriado em ENAM (id `cda0275f…`), migrations 0001-0005 do `main`
  aplicadas. Conferido no remoto: histórico 0001-0005, tabelas e índices de contas/candidaturas (incluindo o índice
  único parcial da 0005), 8 terrenos, `PRAGMA foreign_key_check` sem violações. Serve de ensaio para a aplicação de
  0004-0005 em produção naquela rodada.

## Ensaio local do upgrade 0005 → 0015

Em 22/11, a equipe executou as dez migrations seguintes sobre o schema 0005 em SQLite em memória, usando o
[harness D1 da suíte](../../apps/api/test/d1.mjs). Antes do upgrade, a fixture insere um cidadão verificado,
uma sessão e uma candidatura em estado `submitted` com o terreno `plaza-01` reservado. O ensaio verifica os
campos da conta, o vínculo da sessão, a revisão da candidatura e as duas referências entre ONG e terreno.
Para reproduzir, execute na raiz do repositório com Node.js 24:

```sh
node apps/api/scripts/verify-staging-upgrade.mjs
```

| Verificação | Resultado observado na fixture |
|---|---|
| Registros anteriores | A mesma conta, sessão e candidatura mantiveram os valores conferidos. `plaza-01` continuou associado à ONG em `application_sent`. |
| Terrenos | A base passou de 8 para 97 terrenos de ONG. Ao final havia 23 terrenos residenciais. |
| Integridade após a 0015 | `PRAGMA foreign_key_check` retornou zero linhas e `PRAGMA integrity_check` retornou `ok`. |

O [script](../../apps/api/scripts/verify-staging-upgrade.mjs) falha se um desses critérios divergir. A prova cobre o
schema e os vínculos dos dados fictícios. A atualização do banco remoto, o acesso com uma sessão válida no navegador
e o recebimento de e-mail na caixa de teste exigem verificações próprias.

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

## Ordem da homologação de cidadão e ONG

1. **Definir o ambiente de teste.** Augusto indica as URLs da API, do jogo e do painel, suas origens permitidas,
   o responsável por uma caixa que receba a mensagem e o operador administrativo distinto da conta candidata.
2. **Atualizar o D1 de homologação no momento autorizado.** Conferir novamente banco e versão, guardar o backup
   e seguir a seção “Aplicar migrations” na revisão acordada. Conferir o histórico até 0015 e as chaves estrangeiras
   antes de liberar contas.
3. **Preparar os serviços de homologação.** A equipe publica a revisão acordada nos endereços isolados, confere a
   configuração de acesso e habilita as contas de teste conforme as aprovações do projeto. O envio exige credencial
   de staging e remetente verificado no Resend. O jogo e o painel precisam apontar para a API de homologação.
4. **Checar prontidão.** Na API de homologação, conferir ambiente e `mail: true` em `GET /health`; esse campo só
   indica credencial configurada. Em `GET /ready`, conferir `checks.db: "ok"`. Essa leitura testa a conexão ao D1
   com `SELECT 1`; a versão vem do histórico de migrations. R2 pode aparecer como `off` quando não há binding
   de arquivos. Conferir ainda `accounts: true` em `GET /config`.
5. **CTA-01 · Cadastro e retorno.** Entrar pelo site e pelo jogo de teste, cadastrar um cidadão fictício com a
   caixa autorizada, receber o e-mail e confirmar o link uma vez. Conferir a mesma conta após sair e entrar por
   um novo link. Verificar que o link consumido não abre outra sessão. Registrar revisão, ambiente, horário e
   resultado, preservando e-mail, links e cookies.
6. **ONG-02 · Publicação no terreno escolhido.** Pela conta candidata de teste, reservar um terreno disponível.
   No painel, o operador pede ajuste; a candidata corrige e reenvia. Conferir a ausência do perfil público antes
   da aprovação. Após o operador aprovar, verificar na API e no mapa a identificação da ONG no mesmo terreno.

CTA-01 e ONG-02 aguardam homologação real. O recibo local desta página cobre o ensaio de migração que precede as duas jornadas.

[Guia de publicação](deploy.md) · [Armazenamento](../reference/storage.md)
