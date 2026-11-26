# Banco de homologação

## Posição em 22/11/2026

A equipe conferiu o D1 de homologação por leitura autenticada no Wrangler. O histórico continha **cinco migrations**,
até `0005_one_active_application.sql`. A consulta ao Worker previsto
`vilanoeldobem-api-staging` retornou o erro Cloudflare **10007** (Worker não encontrado). A revisão de referência
da release 0.8.0 é [`6d4e4fc`](https://github.com/vilanoeldobem/project/tree/6d4e4fc) e contém migrations até a
**0015**. A equipe não consultou o D1 de produção nesta conferência. O [histórico de releases](../reference/releases.md)
registra as verificações anteriores de produção.

Na revisão indicada, `env.staging` em [wrangler.jsonc](../../apps/api/wrangler.jsonc) aponta para o banco próprio
`vilanoeldobem-staging`. Naquela revisão, a configuração trazia `routes: []`, `workers_dev: false`, origens de navegador vazias e
`ACCOUNTS_ENABLED = "false"`. O arquivo daquela revisão declarava listas vazias de rate limiters e buckets R2. Sem credencial de envio
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

## Preparar a versão de teste

Os endereços abaixo são propostos para revisão pela equipe. Configurar um domínio no repositório não o publica. A jornada começa no site e termina com a aprovação pelo painel na mesma Vila de teste.

| Serviço | Host de homologação |
|---|---|
| Site e convite | `www-staging.vilanoeldobem.com.br` |
| Jogo e retorno do e-mail de cidadão | `play-staging.vilanoeldobem.com.br` |
| API e sessão | `api-staging.vilanoeldobem.com.br` |
| Painel e retorno do e-mail de administrador | `dash-staging.vilanoeldobem.com.br` |
| Presença na praça | `server-staging.vilanoeldobem.com.br` |

A partir da raiz, com as dependências do lockfile instaladas, execute `pnpm staging:check`. O comando prepara os arquivos de teste e ensaia o empacotamento dos cinco Workers com Wrangler em modo local. Revise os nomes dos Workers, os domínios e o binding do D1 antes da publicação. Os testes automatizados de navegador da CI continuam usando serviços locais descartáveis. Para o ensaio com e-mail de verdade, use duas identidades de teste controladas pela equipe, uma para a candidatura e outra para o administrador.

### Publicação pelo operador

Antes de habilitar contas (passo 5), confirme:

- os domínios de homologação ficam acessíveis publicamente até que o controle de acesso aos testadores seja
  aplicado; o mecanismo ainda está **PENDENTE** de escolha pela equipe, e uma pessoa de fora não deve entrar;
- o remetente configurado é o de produção, `acesso@vilanoeldobem.com.br`; a equipe deve aceitar esse remetente ou
  configurar um remetente de homologação antes de enviar e-mail;
- existem duas identidades de teste separadas, uma para a candidatura e outra para o administrador;
- a revisão de LGPD / ECA Digital foi registrada pelo responsável.

1. Combine os domínios e o acesso dos testadores com Augusto. Confirme a conta Cloudflare, o remetente verificado no Resend (a configuração propõe `acesso@vilanoeldobem.com.br`) e quem tem acesso à caixa de teste. Use dados fictícios. Os domínios personalizados ficam acessíveis publicamente quando publicados. Antes de habilitar contas, o operador deve aplicar o controle de acesso aos testadores que a equipe definir e confirmar que uma pessoa de fora não entra. O papel de administrador do painel controla a revisão das candidaturas dentro da aplicação.
2. Faça o backup e a atualização **do banco de homologação** conforme a seção [Aplicar migrations](#aplicar-migrations). Confira os nomes no histórico até a `0015` e `PRAGMA foreign_key_check` antes de publicar.
3. Após o aceite da revisão, prepare os arquivos com `pnpm staging:check` no mesmo checkout que será publicado. Use o ambiente explícito em cada comando, a partir da raiz. A primeira publicação mantém contas e doações desligadas.

```sh
pnpm --filter @vila/api exec wrangler deploy --env staging --x-provision=false
pnpm --filter @vila/server exec wrangler deploy --env staging --x-provision=false
pnpm --filter @vila/client exec wrangler deploy --env staging --x-provision=false
pnpm --filter @vila/dash exec wrangler deploy --env staging --x-provision=false
pnpm --filter @vila/site exec wrangler deploy --env staging --x-provision=false
```

4. Configure a chave de envio no Worker de teste com `pnpm --filter @vila/api exec wrangler secret put RESEND_API_KEY --env staging` e informe o valor no prompt do Wrangler. Confira `environment: "staging"` e `mail: true` em `https://api-staging.vilanoeldobem.com.br/health`. A presença da chave, sozinha, não comprova a entrega.
5. Quando o responsável liberar o teste com a caixa e o remetente definidos, publique a API com `pnpm --filter @vila/api exec wrangler deploy --env staging --x-provision=false --var ACCOUNTS_ENABLED:true`. Confira `accounts: true` e `donations: false` em `/config` e `checks.db: "ok"` em `/ready` no host da API de teste. Para encerrar novas entradas, republique a API de staging com a configuração versionada, sem o override, e confira `accounts: false`.
6. Cadastre e verifique a conta do operador no jogo de teste. Se for a primeira conta administrativa deste ambiente, o responsável autorizado pode conceder o papel no D1 **vilanoeldobem-staging**, usando `--env staging --remote` e o identificador conferido da conta de teste. Registre a concessão inicial. Depois, o administrador pode gerenciar os papéis em **Painel → Usuários e permissões**. A candidatura deve usar outra conta.

## Ordem da homologação de cidadão e ONG

1. **Cadastro de cidadão.** Abrir o site de teste, entrar no jogo e cadastrar a identidade fictícia com a caixa autorizada. Receber o e-mail e conferir o domínio de destino antes de confirmar o link. Sair, pedir outro e conferir o retorno à mesma conta. O link já consumido deve ser recusado.
2. **Candidatura e painel.** Registrar o valor inicial de `approved_ngos` em `/indicators`. Com a conta candidata, pedir um terreno disponível. Com a conta administrativa, abrir o painel de teste, pedir um ajuste e conferir o reenvio. Durante a análise, a ONG segue fora da listagem pública e o indicador conserva o valor inicial.
3. **Publicação e indicador.** Aprovar pelo painel. Conferir a publicação da mesma ONG no terreno escolhido, o evento de auditoria e o indicador inicial mais um após a atualização do cache. Fazer essa comparação sem outra publicação concorrente. No painel de indicadores, conferir o cartão **ONGs aprovadas**.
4. **Registrar erros reproduzíveis.** Para qualquer falha, guardar revisão, horário, domínio, papel utilizado, passo, resposta HTTP e código público de erro. Omitir e-mails, identificação de candidatos, cookies e links de acesso.

CTA-01 e ONG-02 terminam quando a equipe executar o percurso na homologação publicada e verificar a entrega de e-mail. Um teste local ou o empacotamento dos Workers cobre uma etapa anterior ao aceite.

[Guia de publicação](deploy.md) · [Armazenamento](../reference/storage.md)

### Prova local da mensagem de acesso

Na raiz, `pnpm --filter @vila/api exec vitest run src/accounts.test.ts -t "simulated staging mailbox"` exercita as origens configuradas de homologação, o handler da API e SQLite descartável. A caixa em memória captura o corpo da chamada de envio do Resend. O ensaio consome somente os links lidos dessas mensagens. Verifica cadastro e reentrada com o progresso preservado, recusa da sessão encerrada, acesso do operador pelo painel e link de uso único. A candidata recebe um pedido de ajuste, reenvia a apresentação e só aparece no terreno após a aprovação. Não há entrega em caixa postal externa nem alteração da Cloudflare.
