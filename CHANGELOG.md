# Changelog

Todas as mudanças notáveis da Vila Noel do Bem são registradas neste arquivo.

O formato segue [Keep a Changelog 1.1.0](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota
[Semantic Versioning 2.0.0](https://semver.org/lang/pt-BR/). A política completa (o que cada número significa,
versão do schema D1, processo de release) está em [`docs/reference/versioning.md`](docs/reference/versioning.md).
Cada versão indica o schema D1 que entrega.

## [Unreleased]

### Added — moderação dentro do jogo para administradores (IMPL-0021; remoção de sala e bloqueio PROPOSTA, desligados)

- Jogo: **modo moderação**, só para conta conectada com papel Administrador. Botão "Moderação" no HUD, desligado a
  cada carregamento; ligado, a faixa "Modo moderação" fica visível no topo, acima de qualquer painel, e o HUD desce
  para a faixa não cobrir a marca nem os botões (em qualquer largura). Fora do modo nenhuma ação de moderação
  aparece nem é consultada na API; o modo desliga ao sair, trocar de conta, perder o papel, ser bloqueado ou quando
  a sessão termina em outro lugar.
- Jogo: perto de uma casa, da árvore ou de um morador, Enter sobre o botão "Moderação" ou sobre um botão do bloco
  de moderação aciona esse botão em vez de abrir o que está perto. Para os outros botões do HUD nada muda: Enter e
  E continuam abrindo o que está perto, também com o foco num botão (depois de "Explorar ONGs → Ir até lá" ou de um
  clique no zoom).
- Jogo, casa de ONG publicada (no modo moderação): "Remover logo", "Remover foto" da galeria pública, "Retirar ONG
  da Vila" (PROPOSTA, IMPL-0020; com a mensagem obrigatória para a organização) e o link "Abrir no painel". Só
  aparecem as ações que podem funcionar (`/config.files`, `/config.withdrawal`, galeria pública com fotos). Cada
  ação pede uma confirmação que nomeia a organização, envia a revisão lida pela API administrativa, pede de novo
  em `409 stale_revision` e relê os terrenos ao concluir. Se a leitura administrativa das fotos falha, a seção diz
  "Não foi possível ler as fotos agora." e oferece ler de novo, em vez de dizer que não há ação disponível. Se a
  seção sai com a casa aberta (papel perdido, sessão encerrada), o foco volta para o diálogo.
- Jogo, **PROPOSTA** (só com `/config.moderation.presence`): selecionar outro visitante (clique no avatar ou botão
  do HUD) e "Remover da sala", com confirmação. O cliente pede o bilhete, envia `["m", alvo, bilhete]` e espera a
  resposta da sala; 5 s sem resposta é falha. Só `ok: true` vira "removido"; o bilhete nunca é exibido nem
  registrado. Trocar a seleção fecha a confirmação aberta, e o resultado de uma remoção enviada antes de o modo ser
  desligado e religado (ou de a conta mudar) é descartado: a confirmação aberta nunca passa a nomear outro
  visitante.
- Jogo, limites da remoção (a sala fecha a conexão de quem os quebra, e conta a mensagem quando ela chega): um
  pedido por vez; depois de um pedido sem resposta, nada mais é enviado naquela conexão até a resposta chegar (a
  resposta atrasada nunca é tomada pela resposta da nova tentativa); 1100 ms entre o último momento em que a sala
  sabidamente ouviu uma mensagem (o envio ou a chegada da resposta) e a próxima; no máximo 9 pedidos em 61 s,
  contados da saída da mensagem (um a menos que a sala aceita). O pedido de bilhete é abandonado em 5 s, e nada é
  enviado se o visitante saiu entre o bilhete e o envio; as duas situações são ditas como são.
- Jogo: quem é removido (fechamento `4003`) lê "Você foi removido da sala por um administrador.", continua
  jogando e só reconecta depois de 60 s, no próximo toque, clique ou tecla (sem laço, sem contar como erro de rede).
  A espera vale também se "Outros visitantes" for desligado e ligado de novo; recarregar a página a encerra (é uma
  cortesia, não uma barreira).
- Jogo, **PROPOSTA**: conta bloqueada (`/me` com `blocked`, ou `403 session_blocked` em qualquer rota) vê "Conta
  bloqueada", a mensagem da administração e a data, e só pode sair ou excluir a conta; a sincronização do progresso
  e a tela da candidatura param sem erro. O Caderno de Missões diz "Conta bloqueada: o progresso fica só neste
  navegador." (não "Sem conexão com a Vila").
- Jogo: sessão que termina com a página aberta (saída em outra aba, expiração, bloqueio que encerra as sessões). Na
  primeira resposta `401 not_signed_in` o jogo relê `/me`; sem sessão, volta ao estado desconectado com o aviso
  "Sua sessão terminou. Entre de novo.", o progresso deixa de ficar pendente e o modo moderação desliga. Se `/me`
  ainda responde a mesma conta, nada muda e a releitura não se repete por 1 minuto.
- Jogo: o painel da conta mostra o papel pelo rótulo compartilhado ("Padrão" / "Administrador").
- Confirmações de moderação e a exclusão de conta bloqueada não aceitam duplo clique, tecla mantida pressionada
  nem resposta nos primeiros 600 ms.

### Added — papel de administrador e moderação (API e contrato compartilhado; bloqueio e remoção de sala PROPOSTA, desligados)

- [IMPL-0021](docs/decisions/0021-administrator-role-and-moderation.md): dois papéis, Padrão (`player`) e
  Administrador (`admin`); o painel mantém o login próprio; os papéis passam a ser concedidos e retirados pelo
  painel; o jogo pode mostrar *ações* de moderação a um administrador conectado (listas, filas de análise e
  auditoria ficam no painel). **Schema D1 v10** (`0010_account_blocks.sql`, aditiva, não aplicada no remoto). Esta
  entrega é a API e o contrato compartilhado; as telas do painel e do jogo e a parte do servidor de tempo real são
  entregas separadas.
- API: `POST /admin/users/:id/role {accountId, role}` (auditoria `user.role_change`). Ninguém muda o próprio papel,
  conta bloqueada não é promovida, e de dois administradores que se rebaixam ao mesmo tempo exatamente um vence
  (`409 last_admin`). `GET /admin/users` passa a trazer `blocked`. Sem bandeira própria.
- API: `POST /admin/ngos/:id/logo/remove {accountId, revision}`: um administrador remove o logo de uma ONG em
  qualquer estado, com as guardas da remoção feita pelo responsável (auditoria `ngo.logo_remove`). Exige o bucket.
- **PROPOSTA**, atrás de `ACCOUNT_BLOCK_ENABLED` (`"false"` em produção e homologação; política PENDENTE,
  [OQ-11](docs/decisions/open-questions.md)): `POST /admin/users/:id/block {accountId, message}` e
  `POST /admin/users/:id/unblock {accountId}` (auditoria `user.block` / `user.unblock`, sem o texto). `message` é a
  **mensagem para a pessoa bloqueada**: ela a lê como foi escrita em `GET /me` (`user.blocked`). O bloqueio encerra
  as sessões; o link de acesso responde como para qualquer e-mail e abre uma sessão restrita (ler o motivo, sair,
  excluir a conta); todo o resto responde `403 session_blocked`. Candidatura, progresso e envios em andamento são
  recusados no SQL. A bandeira controla só novos bloqueios; desfazer um bloqueio funciona com ela desligada.
- **PROPOSTA**, atrás de `PRESENCE_MODERATION_ENABLED` (`"false"` em produção e homologação): bilhete de uso único
  para remover um visitante de uma sala (`POST /admin/moderation/ticket`; 32 caracteres, 30 segundos, 10 por
  administrador por minuto) e `POST /moderation/consume`, chamada pelo servidor de tempo real por binding de
  serviço (sem sessão, sem CORS, limite próprio; auditoria `presence.remove`, que registra a remoção autorizada). A
  presença continua anônima; é uma cortesia, não um banimento.
- `GET /config` informa `moderation: {presence, block}`.
- Contrato compartilhado (`packages/shared/src/accounts`): `ROLE_LABEL` ("Padrão", "Administrador"), `Me.blocked`,
  `UserSummary.blocked`, `ModerationConfig`, `ModerationTicket`, regras da mensagem e do bilhete
  (`moderation.ts`, com `MODERATION_TICKET_TTL_MS`) e frases em pt-BR para os novos erros.

### Added — painel: papéis, bloqueio de conta (PROPOSTA) e remoção de logo (IMPL-0021)

- Seção "Usuários": papel com os rótulos compartilhados ("Padrão" / "Administrador"; o rótulo local "Jogador"
  saiu), coluna "Situação" ("Bloqueada") e as ações "Tornar administrador" / "Tornar padrão"
  (`POST /admin/users/:id/role`). Nada é oferecido na própria linha ("Você não pode mudar o próprio papel."). Cada
  ação tem um segundo passo que nomeia a conta e diz a consequência; o botão só libera depois de marcada a frase de
  confirmação (clique duplo ou Enter segurado não enviam nada). Recusas mostram a frase da API (`last_admin`,
  `account_blocked`, `admin_only`, …); depois de uma mudança a linha mostra o que a API respondeu e a lista é
  relida. Uma resposta 200 sem a linha da conta é tratada como falha ("Algo deu errado. …") e a lista é relida.
  Depois de uma recusa que faz a lista ser relida, o foco vai para a linha do resultado (não para um botão que
  some com a releitura). E-mail e nome continuam fora do painel.
- **PROPOSTA** (política PENDENTE, [OQ-11](docs/decisions/open-questions.md)): "Bloquear conta" só aparece quando
  `/config` traz `moderation.block: true`, pede a "Mensagem para a pessoa (ela vai ler)" (regra compartilhada, 10 a
  1000 caracteres) e diz o efeito (sessões encerradas; a pessoa só lê a mensagem, sai e exclui a conta). Não é
  oferecido na própria linha nem na de um administrador ("Remova o papel de administrador antes…"). "Desbloquear"
  aparece sempre que a conta está bloqueada, também com a bandeira desligada. A seção traz o aviso de PROPOSTA.
- Link `dash.*/#applications/<id>` (o que o jogo monta) abre a candidatura; seguido sem sessão, a pessoa cai nessa
  candidatura depois de entrar (o id fica 20 minutos no `localStorage` do navegador e é usado uma vez). Id
  malformado ou desconhecido mostra "Candidatura não encontrada."; só um id bem formado entra no caminho de uma
  requisição.
- Detalhe da candidatura: "Remover logo" (`POST /admin/ngos/:id/logo/remove`), com confirmação, a revisão em tela e
  releitura em `stale_revision`. Auditoria com rótulos para `user.role_change`, `user.block`, `user.unblock`,
  `ngo.logo_remove` e `presence.remove` ("Remoção de visitante autorizada"). "Sistema" mostra `moderation.presence`
  e `moderation.block` como as outras bandeiras.
- Sessões: conta bloqueada que entra no painel vê só "Conta bloqueada", a mensagem e "Sair"; um administrador
  rebaixado com o painel aberto cai em "Apenas administradores" na requisição seguinte, sem laço. Se a API recusa
  uma rota administrativa (`admin_only`, `session_blocked`, `not_signed_in`) enquanto `/me` continua respondendo o
  mesmo administrador, o painel não fica relendo a sessão: mostra o estado de indisponibilidade, que diz o que
  houve, e só "Tentar de novo" pede outra vez.
- Conferência local em navegador: `apps/dash/scripts/verify-moderation.mjs`
  ([development §4.7](docs/guides/development.md#47-adicionar-uma-seção-ao-painel-administrativo)).

### Fixed — painel em telas estreitas

- A legenda das tabelas do painel ("Contas", "Eventos de auditoria", …) aparecia com uma letra por linha abaixo de
  640 px; agora ocupa a largura da tela.

### Changed — a conferência de sessão exige a migration 0010

- Toda rota que lê a sessão passa a ler `users.blocked`: num banco sem a 0010, com as contas ligadas, elas
  respondem `503 schema_outdated` (antes, sessão, progresso e exclusão de conta funcionavam num banco na v9). Com as
  contas ligadas, a migration vem antes da API ([deploy §10](docs/guides/deploy.md#10-administrador-e-moderação-impl-0021)).
  As rotas públicas respondem igual nos schemas v3 a v10, com qualquer combinação de bandeiras.
- Um cadastro não confirmado deixa de expirar em 24 horas enquanto estiver bloqueado.

### Added — remoção de visitante da sala por administrador: servidor de tempo real e protocolo (PROPOSTA, desligada)

- **PROPOSTA** ([IMPL-0021](docs/decisions/0021-administrator-role-and-moderation.md)), atrás da bandeira
  `PRESENCE_MODERATION_ENABLED` do servidor (`"false"` em produção; ligada só no script `dev`). Parte do servidor e do
  protocolo; a API e o jogo vêm em mudanças separadas.
- Protocolo de presença (`packages/shared/src/net/protocol.ts`): pedido `["m", alvo, tíquete]` (id de conexão e
  tíquete de 32 caracteres `[A-Za-z0-9_-]`, só na forma exata de `encodeRemove`), resposta `["m", alvo, 0|1]` para
  quem pediu e código de fechamento `4003` (`CLOSE_REMOVED`).
- Servidor (`apps/server`): a sala consulta a API pelo service binding `API` (`POST /moderation/consume`, limite de
  3 s) e só fecha o alvo com `4003` diante de `200 {"ok":true}`; em qualquer outro caso responde `0` e não fecha
  ninguém. Limites por conexão: um pedido por segundo e 10 por minuto, depois `1008`. A sala não guarda nem registra
  o tíquete, a resposta ou quem pediu, e não grava no storage.
- Diferença em relação ao contrato: a sala só atende pedidos depois de 35 s em memória, para que um tíquete emitido
  antes de um reinício não alcance outra conexão que recebeu o mesmo id.
- `apps/server/wrangler.jsonc` ganha o binding `services` para `vilanoeldobem-api`: publicar a API antes do servidor
  ([deploy.md §4.4](docs/guides/deploy.md#44-service-binding-do-servidor-para-a-api-proposta-impl-0021)).

### Added — apelido `client.*` para o jogo

- `client.vilanoeldobem.com.br` passa a ser um Custom Domain do Worker do jogo e redireciona (302) para
  `play.vilanoeldobem.com.br`, com o mesmo caminho e query. O jogo continua em uma única origem (`play.*`): CORS,
  cookie de sessão e servidor de tempo real não mudam. O domínio é criado no próximo `pnpm deploy:client`.

### Added — retirada administrativa de ONG publicada (PROPOSTA, desligada)

- **PROPOSTA** ([IMPL-0020](docs/decisions/0020-ngo-publication-withdrawal.md)), atrás da bandeira
  `NGO_WITHDRAWAL_ENABLED` (`"false"` em produção e homologação). A política da retirada é PENDENTE
  ([OQ-14](docs/decisions/open-questions.md)): o código não decide o que ela significa para a conta, o CNPJ, o
  retorno da organização ou a guarda dos dados. Portada do PR #33 para o fluxo canônico de arquivos e galeria.
- API: `POST /admin/ngos/:id/withdraw {accountId, revision, reason}`. Registro, revisão, liberação dos terrenos
  realmente associados e auditoria (`ngo.withdraw`, sem o texto) confirmam juntos; disputa ou repetição não
  duplica nada. `reason` é a **mensagem para a organização**: o responsável a lê como foi escrita.
- `GET /config` informa `withdrawal`. Respostas privadas mostram o estado efetivo `withdrawn` e
  `withdrawal: {reason, at}`; a lista administrativa filtra por ele.
- Leituras públicas (`/lots`, `/indicators`, `/ngos/:id`, logo, fotos) deixam de mostrar a ONG porque o terreno é
  liberado; nenhuma delas lê a tabela nova. `approved_ngos` passa a contar ONGs publicadas **em terreno
  publicado**. Teste cobre as rotas públicas nos schemas v3 a v9, com a bandeira ligada e desligada.
- Depois da retirada: envio de logo, documento e foto, reenvio e aprovação/rejeição de foto são recusados
  (`409 application_withdrawn`); o responsável ainda remove os próprios arquivos e fotos. A exclusão da conta
  apaga também o logo da ONG retirada. A retirada é recusada enquanto a exclusão da conta estiver pendente.
- O que o código faz hoje e depende da OQ-14: a conta do responsável não consegue se candidatar de novo, o CNPJ
  continua em uso, não há rota para desfazer, e a linha conserva `status = 'published'`.
- Jogo: a candidatura retirada mostra "Retirada da Vila" e a mensagem da administração, sem reenvio. Painel:
  situação e mensagem, rótulo da ação na auditoria e a ação "Retirar da Vila" (mensagem, revisão em tela,
  confirmação), só quando `/config` traz `withdrawal: true`.
- Migration `0009_ngo_withdrawals.sql` (schema D1 v9): tabela `ngo_withdrawals`. Com as contas ligadas, a
  migration vem antes da API (rotas de candidatura e análise respondem `503 schema_outdated` sem ela); com as
  contas desligadas a API funciona nos schemas v3 a v9. Nenhuma migration remota foi aplicada.
- Provas locais com dados sintéticos: `node scripts/verify-media-local.mjs --withdrawal` (workerd, D1 e R2;
  também no CI) e `apps/dash/scripts/verify-withdrawal.mjs` (painel em Chrome).

### Fixed — persistência de progresso entre sessões (D12)

- Gravações de missões/XP usam revisão por conta e token exclusivo no D1, evitando que pedidos simultâneos
  reposicionem eventos já aceitos ou gravem quests incompatíveis. Reenvios não consomem vagas adicionais no limite.
- Eventos de quest incompatíveis com o estado salvo são omitidos e a resposta devolve o progresso da conta,
  preservando o login quando o visitante tinha outra quest ativa. Contenção após três tentativas com jitter
  retorna `409 progress_conflict`. Regressão conecta cliente real à API real e confere proprietário, XP e reload.
- Nova migration `0008_progress_write_guard.sql` (schema D1 v8), após arquivos e galeria; nenhuma migration remota ou flag foi ativada.
  Catálogo, XP, níveis e interface permanecem iguais. Testes SQL e prova local com duas sessões cobrem persistência,
  duplicidade, concorrência, falha transacional e isolamento de contas ([IMPL-0019](docs/decisions/0019-progress-concurrency-and-acknowledgment.md)).

### Fixed
- Revisão de mídias: revalidação de logo/fotos com ETag, leitura pública tolerante a schemas antigos e FK de galeria sem cascata para preservar a referência aos arquivos.
- Exclusão de conta recusada por falta do bucket (`503 files_unavailable`), antes de apagar qualquer objeto, não
  deixa mais a conta congelada: a marca posta pelo próprio pedido é desfeita. Falha do R2 continua mantendo a
  exclusão pendente, visível e repetível.
- Rotas públicas sempre ligadas (`/lots`, `/indicators`, `/ngos/:id`, logo e foto) cobertas por teste nos schemas
  v3 a v6, em todas as combinações de bandeiras e bucket.
- `AGENTS.md` e `storage.md` voltam a trazer as regras originais (bucket só com arquivos de candidatura, só o logo
  público, regras de migrations); a galeria aparece como exceção estreita e explícita, PROPOSTA.

### Added — conciliação dos arquivos e galeria de ONGs (PR, PROPOSTA)

- Reaproveita o PR #32: `FILES`, `ngo_files`, uploads crus, sanitizador e telas de logo/documentos permanecem
  canônicos. Perfil público e galeria dos PRs #28/#29 são adaptados a esse bucket, sem o pipeline concorrente
  de documentos do #31. Galeria PNG/JPEG com aprovação individual, desligada em produção/staging (IMPL-0018).
- Migration 0007 preserva 0006; acrescenta galeria, token exclusivo de escrita e intenção durável de exclusão.
  Sequência 0001–0007 sem lacunas; não importa pipelines alternativos nem a retirada do PR #33.
- Candidatura e arquivos compartilham snapshot SQL. Estado/revisão exatos e token exclusivo impedem escrita
  atrasada e auditoria duplicada; preserva o bloqueio em `under_review` do #32 atualizado.
- Exclusão de conta congela as evidências antes da limpeza R2 e permite retomar em falha. Incrementa a revisão
  final para invalidar decisões antigas; conserva o logo institucional canônico e remove toda a galeria.
- Logo público passa a exigir terreno publicado; logo/fotos usam `no-cache` com ETag e o perfil usa `no-store`. Nenhuma alteração de jogo,
  deploy, migration remota ou ativação pública faz parte desta entrega.

### Fixed — revisão de perfil e arquivos

- Exclusão de conta pendente visível no jogo e no painel; repetição explícita e rejeição administrativa de
  candidatura aberta para liberar terreno, mantendo bloqueio de aprovação e sem cancelar descarte parcial.
- Perfil público tolerante ao schema v3, sem cidade, com aviso explícito dos campos públicos na candidatura.
- Configuração de teste local separada da configuração de deploy, com banco e bucket sintéticos novos.
- Numeração sequencial de migrations/ADRs e registro de entrega indexado, com respostas às revisões.
- Logo/comprovantes registram intenção antes de R2, preservam bytes após confirmação incerta e rastreiam
  limpeza de arquivos removidos/substituídos. Recuperação autenticada por responsável/admin, limitada a 50
  intenções por chamada; primitiva de reserva/escrita condicional compartilhada com galeria (validação atual pendente).
- Galeria removível pelo responsável e na exclusão da conta; demais salvaguardas e validação registradas na entrega.

### Added — conferência do jogo em produção

- `apps/client/scripts/verify-live.mjs`: conferência do jogo publicado (carrega, entra na Vila, sem erro de console
  ou de CSP, presença respondendo). O `verify.mjs` passa a ser documentado como só local.
- A documentação registra o deploy de 2026-11-12 (painel administrativo publicado) e a pergunta aberta OQ-13
  (destinos de medição do Google bloqueados pela CSP do jogo).

### Added — arquivos das candidaturas de ONG no R2 (desligado em produção)

- Logo e documentos da candidatura num bucket R2 privado ([IMPL-0017](docs/decisions/0017-ngo-files-r2.md)):
  **PROPOSTA**, atrás da bandeira `NGO_FILES_ENABLED` (`"false"` em produção). O bucket `vilanoeldobem-files` ainda
  não foi criado e a migration 0006 não foi aplicada no remoto. Nenhum documento é obrigatório nem nomeado: a lista
  é PENDENTE (PEN-019, OQ-12).
- API: `POST /ngo/application/files`, `GET` e `DELETE /ngo/application/files/:id`,
  `GET /admin/applications/:id/files/:fileId` e a rota pública `GET /ngos/:id/logo` (só de ONG publicada).
  `GET /ngo/application` e `GET /admin/applications/:id` trazem `files`; `/lots` traz `ngo_logo`; `/config` traz
  `files` e `/health` diz se o bucket está ligado. Novo cabeçalho `X-Vila-Account` nas escritas de arquivo.
- Logo: PNG ou JPEG, até 512 KB, 64 a 1024 px. Documentos: até 5, PDF, PNG ou JPEG, até 5 MB cada. O formato é
  conferido pelos bytes (SVG e HTML recusados) e o tamanho é conferido de novo enquanto o arquivo chega.
- Imagens são guardadas sem metadados (EXIF com GPS, XMP, comentários); o nome original do arquivo não é guardado.
- Enviar ou remover arquivo muda a `revision` da candidatura: decisão do admin sobre a versão anterior é recusada.
  Durante a análise (`under_review`) os arquivos ficam travados e, depois de publicada, a ONG não troca mais
  arquivo. `start_review` passa a valer para a versão atual, sem conferir a revisão vista.
- Limites: 20 envios ou remoções por minuto por conta e 60 mudanças de arquivo por candidatura a cada 24 horas.
- Admins leem os arquivos existentes sempre que o bucket está ligado, mesmo com o envio desligado.
- `pnpm deploy:api` passa `--x-provision=false`: o wrangler não cria mais sozinho um bucket que falta.
- Leitura de documento por admin gravada em `audit_events` (`ngo.file_read`), além de `ngo.file_add` e
  `ngo.file_remove`.
- `DELETE /me` apaga do R2 e do D1 os documentos da pessoa e o logo de candidatura não publicada.
- Jogo: seção "Arquivos da candidatura" na tela da candidatura (enviar, trocar e remover logo; até 5 documentos,
  com download e remoção), só quando `/config` traz `files: true`. O arquivo é conferido no navegador com as mesmas
  regras da API antes do envio. O painel do terreno publicado mostra o logo da ONG.
- Painel administrativo: seção "Arquivos" na análise da candidatura (prévia do logo; documentos só por download,
  um registro de auditoria por clique), rótulos das novas ações na auditoria e estado "Envio de arquivos desligado".
  A CSP do painel passa a aceitar `blob:` em `img-src` (só para a prévia do logo).
- `verify-accounts.mjs` cobre o envio de arquivos no jogo e a leitura no painel; aceita uma API em outra porta
  (argumento `api`) e `VILA_API_PERSIST_TO` para o banco local dela.
- Migration `0006_ngo_files.sql` (schema D1 v6): tabela `ngo_files`.
- `packages/shared/src/accounts/files.ts`: limites, detecção de formato, limpeza de metadados e frases de erro,
  usados pela API, pelo jogo e pelo painel.

## [0.4.0] - 2026-11-12

**Contas e ONGs, painel administrativo, presença em tempo real e navegação por clique**
([IMPL-0006](docs/decisions/0006-christmas-environment-real-time-procedural-weather.md) a
[IMPL-0016](docs/decisions/0016-click-navigation-and-colliders.md)). Schema D1 **v5** no código; **produção segue na
v3**: as migrations `0004` e `0005` não foram aplicadas e as contas continuam desligadas (`ACCOUNTS_ENABLED`), assim
como as missões narrativas (`QUESTS_V1_ENABLED`). Os cinco Workers foram publicados a partir da `main` em 2026-11-12,
na ordem API, servidor, painel administrativo (`vilanoeldobem-dash`, criado nesse deploy), jogo e site; esse deploy
foi feito antes deste commit de versão, então `GET /health` em produção responde `"version": "0.3.0"` até a próxima
publicação da API.

### Added — painel administrativo (`apps/dash`)

- Novo app `apps/dash` ([IMPL-0015](docs/decisions/0015-dash-backoffice-app.md)): backoffice em
  `dash.vilanoeldobem.com.br`, Worker `vilanoeldobem-dash` só com Static Assets (sem script, sem bindings). **Não
  publicado**: criar o Worker e o domínio exige autorização. Seções: Candidaturas (análise de ONGs, movida do jogo),
  ONGs e terrenos, Auditoria, Usuários (só leitura, sem ação de sanção), Sistema (`/health` e bandeiras da API) e
  Pendentes (Doações, Indicadores, Documentos e logos das ONGs — só avisos, sem função).
- Entrada no painel pelo mesmo link mágico e pelo mesmo cookie de sessão do jogo; o painel não cria contas. Conta sem
  papel `admin` vê só "Apenas administradores" e "Sair". Com as contas desligadas, o painel mostra "Contas desligadas"
  e só dados públicos.
- API: `GET /admin/audit` e `GET /admin/users` (admin, só leitura, paginadas por `before` e `limit`; a lista de contas
  não traz e-mail nem nome). Nova variável `DASH_ORIGIN`; `https://dash.vilanoeldobem.com.br` entra em
  `ALLOWED_ORIGINS` e `ACCOUNT_ORIGINS`.
- Cabeçalhos do painel gerados por build: CSP sem inline e sem terceiros, `connect-src` só com a API da build,
  `noindex`, `no-referrer`, HTML `no-store`. Sem analytics nem Google Tag Manager.
- `apps/dash/scripts/verify.mjs` (Chrome real, desktop e celular) e scripts `pnpm dev:dash` / `pnpm deploy:dash`.
- `packages/shared/src/accounts/{contract,errors}.ts`: formas das respostas de conta e de análise e textos de erro,
  usados pelo jogo e pelo painel.

### Changed — análise de ONGs fora do jogo

- O painel "Análise de ONGs" saiu do jogo (`ui/Admin.tsx` removido). Admins veem, no painel da conta, o link "Abrir
  painel administrativo" (nova aba) para `dash.*`.
- `POST /auth/link`: o link abre o painel administrativo quando o pedido vem exatamente de `DASH_ORIGIN`; nos demais
  casos continua abrindo o jogo. `POST /auth/register` vindo do painel é recusado (`403 forbidden_origin`).
- `apps/client/scripts/verify-accounts.mjs`: os passos de admin rodam no painel (terceiro argumento, padrão
  `http://localhost:8797`); esperas reais no lugar de `isVisible`, 30 s depois de chamadas à API e mensagem clara
  quando o limite de `/auth/*` é atingido (esperar 60 s entre execuções).

### Changed — e-mail

- O link de acesso passa a sair pelo Resend ([IMPL-0012](docs/decisions/0012-resend-transactional-email.md)) no
  lugar do Cloudflare Email Service: segredo `RESEND_API_KEY` no Worker da API, sem binding `send_email`. Sem a
  chave o envio falha fechado (`503 mail_unavailable`), como antes. `GET /health` ganhou `mail` (se a chave existe).
- Workflow manual `api-secrets` grava `RESEND_API_KEY` no Worker a partir dos segredos do GitHub.

### Added — presença: limite de inatividade

- A sala de presença fecha conexões sem atividade real por mais de `IDLE_TIMEOUT_SECONDS` (padrão 300 s; código de
  fechamento `4002`, motivo `idle`), para que abas esquecidas não mantenham o Durable Object acordado e cobrando
  duração ([IMPL-0014](docs/decisions/0014-realtime-idle-timeout.md)). O `"ping"` não conta como atividade; cliques,
  toques e teclas contam, pela nova mensagem `["a"]` (no máximo uma a cada 20 s).
- No jogo, a conexão com os outros visitantes entra em pausa (chip "👥 em pausa") e volta no próximo toque, clique
  ou tecla, sem reconectar sozinha; aba oculta por 2 minutos também pausa. Quedas de rede seguem reconectando com
  espera exponencial. Deploy: servidor antes do cliente.

### Added — medição

- Google Tag Manager (`GTM-MQP2RVMB`) no site e no jogo. A inicialização do `dataLayer` fica em `/gtag-init.js`
  (a CSP não aceita script inline). A CSP dos dois apps libera `https://www.googletagmanager.com` como script e
  `*.googletagmanager.com`, `*.google-analytics.com` e `*.analytics.google.com` como imagem e conexão. Tags HTML
  personalizadas do GTM continuam bloqueadas pela CSP.
- No jogo, o token do link mágico (`#login=`) sai da barra de endereço antes de o GTM carregar
  (`/login-fragment.js`, guardado só em memória), para nunca aparecer na URL medida.

### Fixed — colisões e clique para andar

- O avatar chega aonde se clica ([IMPL-0016](docs/decisions/0016-click-navigation-and-colliders.md)): a rota contorna
  árvore, pinheiros, postes, bancos, barracas, trenó, moradores e casas, planejada uma vez por clique. Antes ele ia em
  linha reta e desistia em 0,5 s no primeiro obstáculo (parava 10 a 20 u antes do destino). Clique em cima de um
  obstáculo ou fora do mundo leva ao ponto caminhável mais próximo, e o marcador aparece onde o avatar vai parar.
- Colisores do tamanho do que é desenhado: nada sólido é atravessado (cercas, extremidades das barracas, trenó,
  renas, cachorro, gato, coelho, guirlanda dos postes, placa, caixa de correio, lanternas, estacas e placa dos
  terrenos disponíveis, paredes e varanda dos chalés, ramas da árvore e dos pinheiros) e nada invisível bloqueia
  (banco, trenó pequeno). Um teste compara cada modelo com o seu colisor.
- O avatar não passa mais espremido por vãos menores que ele.
- Terrenos: o botão de ação aparece a até 6 u do centro (antes 4,5 u), porque a varanda do chalé agora bloqueia.
- Quests (PROPOSTA, desligadas em produção): dois sinos e uma lanterna do lago saíram de baixo das ramas dos
  pinheiros (`bell-pine-north`, `bell-pine-east`, `lantern-lake-1`; ids inalterados).
- `apps/client/scripts/verify-collisions.mjs`: verificação em navegador real do clique para andar (só local).

### Changed — controles

- Andar é só por clique/toque no chão: WASD e setas foram removidos. O clique mostra um anel dourado que se expande,
  um brilho de gelo e um marcador no destino até o avatar chegar (sem expansão com movimento reduzido).
- Zoom da câmera: roda do mouse, gesto de pinça, botões ＋/－ no canto e teclas `+`/`-`; fica salvo neste navegador
  (`vila.zoom.v1`). Névoa gelada mais leve (0,82 → 0,60).

### Added — 0.4.0 "Contas e ONGs" (desligado em produção)

- Contas ([IMPL-0011](docs/decisions/0011-accounts-magic-link-ngo-review.md)): cadastro com Nome, Nickname, Cidade e
  E-mail (DEC-038; só o nickname é público), entrada por link mágico enviado por e-mail (15 min,
  uso único), sessão em cookie HttpOnly, sair e excluir conta. Atrás da bandeira `ACCOUNTS_ENABLED`, **desligada em
  produção** até a revisão LGPD / ECA Digital e o cadastro do domínio de e-mail.
- Missões e XP no servidor: eventos idempotentes, progresso local migrado ao entrar (DEC-042).
- Candidatura de ONG em 4 etapas (P12, campos PROPOSTA; sem upload de documentos), reserva do terreno, reenvio após
  pedido de ajustes ou rejeição.
- Análise administrativa (DEC-037): iniciar análise, aprovar, pedir ajustes, rejeitar; histórico auditado; a
  aprovação publica a casa gerada no terreno.
- Migration `0004_accounts_ngo_applications.sql` (schema D1 v4). Rotas `/config`, `/auth/*`, `/me`, `/progress`,
  `/ngo/application`, `/admin/applications`. `apps/client/scripts/verify-accounts.mjs` (navegador, só local).

### Security — endurecimento das contas (trazido da linha paralela #9–#12)

- Link de acesso com o token no fragmento (`/#login=`), fora dos logs do Worker do jogo.
- Progresso de cada conta separado do progresso de visitante: num navegador compartilhado, a próxima pessoa não herda
  eventos da anterior; eventos não enviados ficam numa fila e são reenviados quando a conexão volta.
- Escritas com `accountId` (`409 account_changed` se outra aba trocou de conta); decisões da análise presas à versão
  vista (`409 stale_revision`); aprovação exige e registra as três verificações do DEC-015.
- Datas impossíveis recusadas, caracteres de controle removidos, ids de evento conferidos por missão, `no-store`
  imposto nas rotas de conta, sessão anterior encerrada ao entrar, leitura de corpo limitada sem `Content-Length`.

### Added — infraestrutura

- Ambiente `staging` da API (`apps/api/wrangler.jsonc`) com banco D1 próprio (`vilanoeldobem-staging`), sem rotas,
  sem origens e com contas desligadas; guia [staging-database.md](docs/guides/staging-database.md). Preparado pela
  equipe no PR #10 e trazido para o `main` sem as migrations divergentes; banco recriado com as migrations 0001-0005
  do `main` (ensaio da aplicação em produção).

### Changed

- **Monorepo separado em apps e subdomínios** ([IMPL-0009](docs/decisions/0009-split-client-api-server-shared.md)):
  `apps/client` (jogo, `play.vilanoeldobem.com.br`; `app.*` redireciona com 301), `apps/api` (API + D1,
  `api.vilanoeldobem.com.br`), `apps/server` (presença em tempo real, `server.vilanoeldobem.com.br`), `apps/site`
  (sem mudança, links para `play.*`) e `packages/shared` (lógica pura comum). **Incompatível:** rotas da API perdem
  o prefixo `/api` (`/health`, `/indicators`, `/lots`, `/environment`); presença em `wss://server.…/room`. CORS e
  WebSocket só para origens exatas; CSP do jogo gerada por build. `smoke-api.sh` confere os três serviços.

### Added

- Runtime das quests narrativas `quests-v1` (PROPOSTA, DEC-039 a DEC-042; PEN-025) atrás de flags
  (`VITE_QUESTS_V1_ENABLED=true` ou `?quests=1` em localhost/dev no cliente **e** `QUESTS_V1_ENABLED` na API, lida
  pelo cliente em `GET /config`; as duas precisam estar ligadas), com catálogo em
  `packages/shared/src/game/quests.ts`, máquina de estados pura, cinco NPCs (`villager`), coleta por proximidade,
  bolsa derivada, diálogos, Caderno de cadeias, integração com XP idempotente na API, testes em
  `packages/shared/src/game/quests.test.ts`, verificação no navegador (`apps/client/scripts/verify-quests.mjs`) e
  referência em [quests.md](docs/reference/quests.md).
- Painel de doação global físico (`DONATION_PANEL`, gerador `quest-donation-panel`; PROPOSTA `quests-v1`), montado só
  com as quests ligadas: abre o mesmo painel de doação da árvore (DEC-026) e serve à leitura da promessa.
- Regras do runtime de `quests-v1` ([IMPL-0013](docs/decisions/0013-quests-v1-runtime.md)): com as flags desligadas o
  mundo é o de antes (moradores, atril e os obstáculos deles só existem com as quests ligadas); a API grava um evento
  de quest apenas quando ele é uma transição válida (um `accept` de aba desatualizada ou um objetivo antes do
  `accept` não travam mais a missão e podem ser reenviados); com `QUESTS_V1_ENABLED` desligada a API ignora os
  eventos de quest e grava o resto do lote, em vez de recusar tudo com `400`; clicar num morador de longe faz o
  avatar andar até ele em vez de abrir o diálogo; o foco do teclado fica no diálogo quando a próxima missão aparece.
- Itens de quest (PROPOSTA, `quests-v1`): cinco geradores em `apps/client/src/scene/gen/quest-items.ts` —
  `quest-reindeer-bell` (Sino do arreio), `quest-lucky-charm` (Patuá da sorte), `quest-ornament-crate` (Caixa de
  enfeites), `quest-donation-panel` (Painel de doação global) e `quest-story-page` (Página da história) — com
  receitas visuais pesquisadas em `content/proposals/quests-v1/object-references.md`, todos dentro de 80 voxels e
  200 faces (itens) ou 220 e 600 (adereço de mundo).
- Proposta estruturada `content/proposals/quests-v1/` (15 missões em 5 cadeias de NPC, diálogos, bíblia de
  história, catálogo normalizado de 8 objetos em `objects.csv`/`objects.md`, fila de prompts em `object-prompts/`,
  auditoria em `review.md`, plano de piloto em `pilot-plan.md` e validadores `validate-quests.mjs` e
  `validate-objects.mjs`).

- Adereços gerados na Vila (PROPOSTA): mercado com barraca de panetone, lanternas, placa, caixa de correio e trenó,
  fundidos numa só geometria por material (+3 chamadas de desenho para todos).

- Multiplayer mostra o visual de cada visitante (chapéu, cachecol, suéter, cores) e `apps/server/scripts/load.mjs`
  testa uma sala cheia (40 visitantes: ~10 kB/s por visitante, p95 9 ms local).

- Conteúdo procedural por semente ([IMPL-0010](docs/decisions/0010-seeded-procedural-voxel-content.md), PROPOSTA):
  núcleo de geradores determinísticos (PRNG por semente, partes, paleta nomeada, orçamento por categoria testado,
  snapshots) e 9 geradores de adereços (presente, lanterna, cerca, trenó, caixa de correio, placa, guirlanda,
  barraca, barraca de panetone) e de chalés (planta, andares, três telhados, varanda, guirlanda, chaminé), moradores (corpo, casaco, cachecol, chapéu,
  tons de pele) e animais (rena, cachorro, gato, passarinho, coelho, coruja noturna) com respiração em shader;
  decoração com 3 moradores e 6 animais na Vila (PROPOSTA).
- Visual do avatar (PROPOSTA): chapéus, cachecóis, suéteres e paletas como camadas sobre o avatar, liberados só por
  missões e nível (tudo alcançável sem doar; nada se compra ou sorteia). Escolha em "Caderno de Missões". Presentes
  escondidos gerados pelo id; terrenos com ONG publicada ganham um chalé gerado pelo id do terreno. Galeria `?gallery` (só desenvolvimento)
  e `scripts/gallery.mjs`. Ver [content.md](docs/reference/content.md).

- Multiplayer de presença ([IMPL-0008](docs/decisions/0008-multiplayer-presence-durable-objects.md)): quem está na
  mesma praça vê os outros andando em tempo real (Durable Object `VillageRoom` + WebSocket `GET /api/room`, até 40
  por sala, 8 salas). Bonecos anônimos, sem nomes, sem chat, nada gravado. Chip "👥 N" no HUD; opção "Outros
  visitantes" no painel "Ambiente". `verify.mjs` testa dois navegadores se vendo e a coleta dos presentes.

- Motor e jogabilidade ([IMPL-0007](docs/decisions/0007-voxel-mesher-fixed-step-simulation.md), PROPOSTA): malha de
  voxels com remoção de faces escondidas e oclusão de ambiente por vértice; adereços repetidos instanciados.
  Medido no `verify.mjs` (preset Média): 96 → 56 chamadas de desenho e 362 mil → 108 mil triângulos por quadro.
- Avatar com simulação em passo fixo (aceleração, chegada suave, giro suave), colisão com pinheiros, postes, bancos,
  bonecos de neve, trenó e chalés, caminhada articulada, sombra de contato e câmera com antecipação.
- Efeitos: neve levantada pelos passos, brilho dourado ao achar presente; pegadas por passo (não na pedra nem no gelo).
- Som: passos por superfície (neve, neve batida, pedra, gelo), carrilhão do presente e vinheta de missão, além do
  vento e dos sininhos; continua desligado por padrão.
- Resolução adaptativa pelo p95 do tempo de quadro; `?envDebug` mostra chamadas, triângulos, p50/p95 e DPR;
  `verify.mjs` grava `verify-output/stats.json`.

- CI no GitHub Actions: `ci.yml` (typecheck, testes e build em todo PR e push na `main`) e `smoke.yml` (smoke de
  produção diário e manual). `scripts/smoke-api.sh` passa a conferir `/api/environment`.

- Decisões: OQ-02 (visitante livre, conta opcional) e OQ-03 (login por link mágico no e-mail) resolvidas; nova
  pergunta OQ-08 (provedor de envio de e-mail).

- Ambiente natalino ([IMPL-0006](docs/decisions/0006-christmas-environment-real-time-procedural-weather.md),
  PROPOSTA): a Vila segue a hora real de São Paulo (1:1, via fuso IANA) com amanhecer, dia, entardecer e noite;
  clima fictício e determinístico, igual para todos (neve leve a nevasca, névoa, vento), com eventos de Natal e
  Virada do Ano. Rota `GET /api/environment` (autoridade da hora, `no-store`). Sem Durable Object nem recurso novo.
- Vila nevada: chão com neve, pinheiros que balançam com o vento, chalés com janelas acesas e chaminé com fumaça,
  cordões de lâmpadas, bonecos de neve, trenó com renas, lago congelado, floresta e montanhas; céu com estrelas, lua,
  nuvens, aurora e estrelas cadentes; neve por GPU; pegadas; bloom moderado nos presets Alta/Ultra.
- HUD: hora de SP e clima; botão "Olhar o céu"; painel "Ambiente" com qualidade gráfica e conforto (sem partículas,
  luzes fixas, menos movimento, som ambiente procedural desligado por padrão).
- Depuração local: `?envDebug`, `?envTime=`, `?envWeather=` (só localhost/dev); `verify.mjs` fotografa as fases.

### Changed

- Rótulos de missão sobre os cinco NPCs e o atril da doação (`@react-three/drei` `Html`), um botão de ação no HUD
  por alvo (NPC, interação de quest, painel de doação, árvore, terreno) com `E`/`Enter`, diálogo modal
  (`ui/Panel.tsx`) seguindo o padrão APG de foco, copy cardinal corrigida para **ao sul** para o trenó, cabeçalhos
  de CORS aplicados na própria `Response` em `apps/api/src/api.ts`, teste de coordenadas exatas em
  `packages/shared/src/game/motion.test.ts` e atualização de [api.md](docs/reference/api.md),
  [architecture.md](docs/reference/architecture.md) e [content.md](docs/reference/content.md).
- Referências atuais ao repositório de documentação atualizadas para `vilanoeldobem/docs`; nomes anteriores mantidos apenas onde registram contexto histórico.
- Desempenho do primeiro carregamento: o chunk `three` caiu de 317 para 245 kB gzip (meta ≤ 250 kB). React e
  zustand foram para um chunk `react` próprio (69 kB gzip), então a interface não espera mais o Three.js; o bloom
  (`PostFx`, 5 kB gzip) só é baixado nos presets Alta/Ultra.
- Direção de arte: o estudo "Natal brasileiro de verão" (palmeiras, terracota) deu lugar à vila nevada, confirmada
  pelo responsável em 2026-11-09 (OQ-07 resolvida; DEC no repositório de documentação pendente).
  O id de missão `gift-palm` foi mantido.
- ROADMAP: novo marco "Infraestrutura de entrega" (CI, staging, backup do D1, redução do chunk Three.js) e
  marco "Contas e ONGs" (0.4.0) detalhado em quatro entregas com critérios de pronto; missões no servidor
  antecipadas para a 0.4.0.
- Site público adotou identidade voxel da Vila nevada, com temas Dia Nevado e Noite Natalina, arte própria e conteúdo reorganizado.
  A marca continua sendo o texto temporário ([IMPL-0005](docs/decisions/0005-public-site-and-domains.md)): o site
  não exibe imagem de logo enquanto não houver uma aprovada (DEC-024, PEN-016).
- Efeitos oferecem controle de neve e movimento reduzido, relógio de São Paulo e suporte responsivo e acessível.
  Com a neve desligada não sobra floco na tela; com movimento reduzido a neve fica parada e o botão continua
  ligando e desligando. Os links das seções quebram de linha no celular (nada fica fora da tela) e a ordem do
  teclado segue a ordem visual do cabeçalho.
- O relógio do site usa as mesmas fronteiras de fase do jogo (`CYCLE` em `packages/shared/src/environment`), em
  `apps/site/src/villageClock.ts`, com testes nas fronteiras.
- Verificação automatizada do site (`apps/site/scripts/verify.mjs`) passou a cobrir rotas, temas, tamanhos de tela,
  acessibilidade e estados extremos: o que a neve realmente pinta (ligada, desligada, movimento reduzido), contraste
  do anel de foco (≥ 3:1), ordem do teclado, contraste alto nos dois temas e a página sem JavaScript.

### Fixed

- Contador "Missões n/4" do HUD restrito às quatro missões rápidas (`MISSIONS`), mantendo as 15 quests narrativas
  em seção própria no Caderno.
- Clicar do outro lado da árvore podia deixar o avatar parado contra ela: a árvore agora é um obstáculo com
  deslizamento.

- Concluída a missão "2 presentes", o terceiro presente ficava visível para sempre e não podia ser pego: agora some.
- A posição do avatar deixou de ser gravada no estado da interface a cada quadro (seletores rodavam 60×/s).
- Rota 404 passou a compartilhar o tema do site e direcionar para o endereço correto do jogo; não é indexada
  (`noindex`).

### Fixed — verificação

- `apps/client/scripts/verify.mjs`: o toque de teste no celular caía na árvore (abria o painel de doação e escondia
  os botões de zoom); agora toca no chão da praça, ao lado do avatar.

## [0.3.0] - 2026-11-08

**Site público e domínio oficial** ([IMPL-0005](docs/decisions/0005-public-site-and-domains.md)). Schema D1 **v3**
(migration `0003` aplicada em produção junto com este deploy).

### Added

- `apps/site`: site público em <https://www.vilanoeldobem.com.br> — como funciona, doação transparente, critérios
  para ONGs; todos os "Entrar na Vila" levam ao jogo. Página 404 própria; `scripts/verify.mjs` (Chrome real).
- Domínios: jogo em <https://app.vilanoeldobem.com.br>; `vilanoeldobem.com.br` redireciona (301) para `www`.
- Scripts na raiz: `dev:site`, `deploy:site`; `build`/`typecheck`/`test` rodam em todos os apps.

### Changed

- Publicação da 0.2.0 (idiomas) em produção: migration `0003_english_schema` aplicada no D1 remoto.

### Fixed

- CSP bloqueava o beacon do Cloudflare Web Analytics injetado pela zona (erro de console); domínios liberados.

## [0.2.0] - 2026-11-08

**Padronização de idiomas** ([IMPL-0004](docs/decisions/0004-english-code-portuguese-docs.md)): código e conversa com
agentes em inglês, documentação e interface em pt-BR. Mudança incompatível na API e no schema. Schema D1 **v3**.

### Changed

- **BREAKING (API):** `/api/lots` usa `ngo_name`/`ngo_summary`, estados `available`/`application_sent`/
  `under_review`/`published` e ids `plaza-NN`; chaves de `/api/indicators` em inglês (`approved_ngos`,
  `registered_users`, `confirmed_donations`, `confirmed_amount`, `people_impacted`). Textos exibidos não mudaram.
- **BREAKING (schema):** migration `0003_english_schema` recria `ongs` → `ngos` (`ong_id` → `ngo_id`) com estados em
  inglês, preservando dados; `audit_events` passa a usar `ngo.*`.
- Ids de missões em inglês (`explore-gifts`, `play-memory`, `causes-visit-lot`, `causes-global-donation`); o progresso
  local recomeça (chave `vila.progress.v2`).
- Comentários, testes, scripts, tokens CSS e mensagens de `smoke-api.sh`/`verify.mjs` em inglês. Migrations
  `0001`/`0002`: só comentários traduzidos (SQL idêntico).
- `AGENTS.md`/`CLAUDE.md`: agentes respondem em inglês; regra de idiomas em `CONTRIBUTING.md` e no modelo de PR.

### Fixed

- `pnpm deploy` na raiz chamava o comando nativo do pnpm; agora `pnpm run deploy` executa o script.

## [0.1.0] - 2026-11-08

Fundação do repositório e **primeira fatia funcional** (rota de entrega B do doc 23: praça → terreno → jogo →
missão). Stack proposta em [IMPL-0001](docs/decisions/0001-stack-react-threejs-cloudflare.md); doações
desabilitadas por [IMPL-0002](docs/decisions/0002-donations-disabled-until-partner-contract.md).
Schema D1 **v2**.

### Added

- Praça voxel 3D (React + Three.js): árvore central como marcador da doação global, rua circular, postes, palmeiras,
  8 terrenos ao redor (P01, P03; layout provisório, PEN-017).
- Avatar padrão com movimento por teclado (WASD/setas) e por clique/toque; câmera diagonal que acompanha e se
  afasta em telas retrato (estudo, cartão G12).
- Entrada com três caminhos: Explorar ONGs, Jogar, Doação global (DEC-026).
- Painel da doação global com destinatário "Instituição parceira: a definir" e botão desabilitado (DEC-010..013).
- Painel de terreno com os três critérios de elegibilidade (DEC-015) e painel de casa publicada com
  "Jogar gratuitamente" e "Doar para esta ONG" desabilitado (DEC-028/029).
- Jogo da Memória (P09, primeiro jogo do doc 23).
- Caderno de Missões com 4 missões em 3 trilhas (Explorar, Brincar, Conhecer causas), XP e nível; progresso
  idempotente salvo no navegador (DEC-039/040/042; missões e curva são proposta, PEN-025).
- Indicadores públicos lidos da API; valores sem fonte verificável aparecem como "—" (DEC-027).
- Worker Cloudflare com Static Assets e API somente leitura: `GET /api/health`, `/api/indicators`, `/api/lots`.
- D1: migrations `0001_initial` (ongs, lots, audit_events) e `0002_seed_lots` (8 terrenos disponíveis).
- Governança: `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `ROADMAP.md`, modelo de PR e `docs/` (Diátaxis) com
  ADRs IMPL-0001..0003 e perguntas abertas.
- `apps/web/scripts/verify.mjs`: verificação em Chrome real (desktop e celular) com capturas.
- `scripts/smoke-api.sh`: conferência das rotas da API de qualquer deploy.
- Publicação na conta Cloudflare do projeto: https://vilanoeldobem.vilanoeldobem.workers.dev (Worker `vilanoeldobem`, D1 `vilanoeldobem` em `enam`).

### Security

- Cabeçalhos estritos em `public/_headers` (CSP, `X-Frame-Options: DENY`, `Permissions-Policy` sem pagamento,
  câmera, microfone e localização). API rejeita métodos de escrita (405).

### Known limitations

- Sem contas, cadastro de ONG, painel admin, chat, avatar editável, skins, badges (ver [ROADMAP.md](ROADMAP.md)).
- Progresso de missões existe só no navegador até o cadastro (D06).
- Paleta, tipografia e logo são marcadores provisórios.

<!--
[Unreleased]: <url>/compare/v0.1.0...HEAD
[0.1.0]: <url>/releases/tag/v0.1.0
-->
