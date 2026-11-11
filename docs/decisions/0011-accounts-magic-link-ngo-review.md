# IMPL-0011: Contas com link mágico, XP no servidor, candidatura e análise de ONGs (0.4.0)

**Status:** Proposta — implementada e testada; **desligada em produção** (`ACCOUNTS_ENABLED = "false"`) até a revisão
LGPD / ECA Digital e o cadastro do domínio no Cloudflare Email Service
**Data:** 2026-11-11
**Fontes:** pedido do responsável técnico em 2026-11-11 ("go ahead with 4 (exclude LGPD for while, use cloudflare
mail)"); OQ-02 (visitante livre, conta opcional), OQ-03 (link mágico), OQ-08 (provedor de e-mail → Cloudflare);
`vilanoeldobem/docs`: DEC-015, DEC-028, DEC-037, DEC-038, DEC-040, DEC-042, wireframes P12/P13/P14; código:
`apps/api/src/{auth,mail,session,progress,ngo,admin}.ts`, `migrations/0004_accounts_ngo_applications.sql`,
`packages/shared/src/accounts/validate.ts`, `apps/client/src/{lib/account.ts,ui/Account.tsx,ui/NgoApplication.tsx,ui/Admin.tsx}`

## Contexto

O marco 0.4.0 fecha a jornada "ONG se candidata → administração aprova → casa aparece no terreno" e guarda o
progresso no servidor. O repositório de documentação confirma só parte das regras: os quatro campos do cadastro
(DEC-038), os três critérios das ONGs (DEC-015), aprovação administrativa obrigatória antes de publicar (DEC-037) e
XP de missão creditado uma vez (DEC-040/042). Campos da candidatura, regras de nickname, papéis de administrador,
conteúdo de e-mail, idade mínima e consentimentos estão **PENDENTES**. O responsável pediu para seguir sem a revisão
LGPD por enquanto.

## Decisão

1. **Bandeira `ACCOUNTS_ENABLED`** (Worker `api`): desligada em produção. Desligada, todas as rotas de conta
   respondem `404 accounts_disabled` e o cliente esconde a interface de conta; a Vila continua jogável sem conta.
   Ligar exige a revisão LGPD / ECA Digital e o domínio cadastrado no Email Service.
2. **Cadastro mínimo** (DEC-038): Nome, Nickname, Cidade, E-mail. Só o nickname é público (regra do AGENTS.md; no
   repositório de documentação, "público além do nickname" segue PENDENTE). Regras de formato: PROPOSTA.
3. **Link mágico** (OQ-03): token de 256 bits, guardado como SHA-256, válido por 15 minutos, uso único; no máximo 3
   por conta a cada 15 minutos; resposta sempre igual (sem revelar se o e-mail existe); cadastros não confirmados
   somem em 24 h. Sessão em cookie `__Host-vila_session` (HttpOnly, Secure, SameSite=Lax, 30 dias) no host da API, também
   guardada como hash. O jogo (`play.*`) e a API (`api.*`) são o mesmo site, então o cookie viaja com
   `credentials: "include"`; CORS com credenciais só para origens exatas.
4. **E-mail pelo Cloudflare Email Service** (OQ-08): binding `send_email` `EMAIL`, remetente
   `acesso@vilanoeldobem.com.br`, uma única mensagem (o link), em pt-BR, sem rastreio nem marketing. Falha no envio
   ou binding ausente em produção → `503 mail_unavailable`. Fora de produção, sem binding, a API devolve o link
   (`devLink`) para desenvolvimento e testes de navegador.
5. **Limite por IP** (`ratelimits` `AUTH_LIMITER`, 10/min): o IP é só chave do limite, nunca gravado.
6. **XP no servidor**: eventos `(usuário, missão, evento)` com chave primária (idempotentes); o progresso é refeito
   com o mesmo `applyEvent` compartilhado; o progresso local migra ao entrar (OQ-02). O servidor confere ids, mas não
   prova que o presente foi achado na cena (limite aceito: XP não compra nada e doação não dá XP).
7. **Candidatura em 4 etapas** (P12, nomes do wireframe): dados da organização (CNPJ com dígitos verificadores,
   abertura ≥ 1 ano — PEN-013: medida pela data do CNPJ, PROPOSTA), documentos e comprovações (três declarações +
   como os recursos podem ser confirmados; **sem upload de documentos** nesta versão), apresentação e projetos
   (resumo, descrição, até 4 áreas, até 3 projetos — DEC-028), revisão e envio (terreno). O terreno fica reservado
   na hora do envio; nada é público antes da aprovação.
8. **Análise administrativa** (DEC-037): papel `admin` concedido à mão no D1 (sem tela de concessão). Ações: iniciar
   análise, aprovar, pedir ajustes, rejeitar (as duas últimas com mensagem obrigatória à organização). Cada decisão
   grava `audit_events` com o id do admin, sem e-mail e sem o texto da mensagem. A aprovação publica a casa gerada
   pela semente do terreno (IMPL-0010). O painel mostra a lista dos três critérios do DEC-015 como apoio (não
   gravada até o adendo de 2026-11-11 abaixo; agora fica no `detail` da auditoria) e só libera "Aprovar" com os três
   marcados.
9. **Validação compartilhada** (`packages/shared/src/accounts/validate.ts`): mesmas regras e mensagens pt-BR no
   formulário e na API.

## Alternativas consideradas

- **Senha ou login social:** recusados em OQ-03.
- **Provedor de e-mail externo (Resend, SES…):** descartado pelo responsável a favor do Cloudflare Email Service
  (mesma conta, sem chave de API guardada no Worker). Risco aceito: o serviço está em beta.
- **Link apontando direto para a API (GET com efeito):** recusado: scanners de e-mail "clicam" links e
  consumiriam o token. O link abre o jogo, que confirma com `POST /auth/verify`.
- **Upload de documentos no R2:** adiado: documentos de ONG são sensíveis e a lista ainda é PENDENTE (PEN-019);
  a administração os pede na análise.
- **Linha paralela de contas (PRs #9–#12, equipe, 11/11/2026):** esquema próprio (`auth_*`, `player_progress` como
  um retrato por pessoa com revisão, `ngo_applications`), adaptador de e-mail local em D1 (`auth_local_outbox`),
  administradores por lista em variável (`ADMIN_USER_IDS`), sessões de 7 dias, link preso ao navegador que o pediu
  (um segundo cookie) e candidaturas **sem reservar o terreno** até a aprovação. Substituída por esta decisão (PR
  #13, já revisada); o que ela tinha a mais virou o adendo "endurecimento" abaixo. Ficaram de fora, de propósito:
  o retrato de progresso (o registro de eventos idempotentes é mais simples), a lista de admins em variável (o papel
  no D1 + `self_review` basta), o link preso ao navegador (impede abrir o link em outro aparelho; risco aceito: quem
  repassa o próprio link entrega a própria conta) e a não reserva do terreno (reservar no envio evita que duas
  organizações preparem a casa para o mesmo terreno; a análise libera o terreno ao rejeitar).
- **E-mail de aviso a cada decisão:** adiado (sem regra de conteúdo/frequência no repositório de documentação); a
  organização vê a situação e a mensagem no próprio jogo.

## Consequências

- Esquema D1 v4 (migration 0004): `users`, `login_tokens`, `sessions`, `progress_events` e novas colunas em `ngos`.
  Aplicar no remoto junto com o deploy da API (exige autorização).
- Testes: 19 de ponta a ponta na API sobre SQLite real com as migrations reais (`node:sqlite`); validação
  compartilhada; navegador (`apps/client/scripts/verify-accounts.mjs`, só local): cadastro, migração do progresso,
  candidatura, pedido de ajustes, reenvio, aprovação e casa na Vila.
- Pendências para ligar em produção: revisão LGPD / ECA Digital (idade mínima, consentimentos, retenção), cadastro do
  domínio no Email Service (e plano compatível), moderação de nicknames, conferir que `acesso@` não recebe
  respostas (ou configurar o Email Routing).

## Relacionados

[api.md](../reference/api.md) · [storage.md](../reference/storage.md) · [deploy.md](../guides/deploy.md) ·
[open-questions.md](open-questions.md) (OQ-02, OQ-03, OQ-08) · [IMPL-0009](0009-split-client-api-server-shared.md) ·
[IMPL-0010](0010-seeded-procedural-voxel-content.md) · DEC-015 · DEC-028 · DEC-037 · DEC-038 · DEC-040 · DEC-042

## Adendo (2026-11-11): revisão de segurança antes do primeiro commit

Uma revisão independente do código levou a estas mudanças, todas com teste:

- **Link nunca devolvido fora de `development`/`test`** (antes: qualquer ambiente ≠ `production`, o que permitiria
  tomar contas num ambiente mal configurado). Links sempre apontam para `GAME_ORIGIN` (o jogo).
- **Sem enumeração de e-mail:** nickname conferido antes do e-mail; `/auth/link` responde `202` mesmo se o envio
  falhar; corrida no cadastro com e-mail existente também responde `202`.
- **Limites atômicos:** 3 links por 15 minutos e 10 por dia por conta, contados e gravados num único comando.
- **Cookie `__Host-vila_session`:** subdomínios irmãos não conseguem plantar sessão.
- **Só o jogo usa a conta:** `ACCOUNT_ORIGINS` (`play.*`) para rotas de conta e CORS com credenciais; o site
  (`www.*`) lê só dados públicos.
- **Escritas atômicas na candidatura e na análise:** cada escrita do lote é condicionada à anterior (reserva do
  terreno → candidatura → liberação/auditoria; mudança de estado → terreno → auditoria). Uma corrida perdida não grava
  nada. Migration 0005: no máximo uma candidatura ativa por pessoa (índice único parcial).
- **Admin não analisa a própria candidatura** (`403 self_review`); ação desconhecida → `400` (sem chaves de protótipo).
- **Correção dos dados (`POST /me`)** e limpeza de links usados/expirados; corpo JSON limitado antes de ler
  (`Content-Length`); no máximo 500 eventos de missão por conta (`429 too_many_events`).

Fica para depois (anotado em `tasks/todo.md`): CAPTCHA (Turnstile) no cadastro e no pedido de link contra envio
abusivo de e-mails para terceiros.

## Adendo (2026-11-11): endurecimento trazido da linha paralela (#9–#12)

Uma comparação com a implementação paralela da equipe apontou lacunas reais, corrigidas com teste:

- **Token no fragmento:** o link passa a ser `<jogo>/#login=<token>`. Com `?login=`, a primeira requisição ao Worker
  do jogo (que roda antes dos arquivos estáticos e tem observabilidade ligada) gravava o token vivo no log.
- **Progresso separado por pessoa no mesmo navegador:** a chave `vila.progress.v2` guarda só o progresso de
  visitante. Ao entrar, ele migra uma vez para a conta e é apagado do navegador; ao sair, o jogo volta ao progresso de
  visitante. Antes, a próxima pessoa que entrasse no mesmo navegador herdava os eventos da anterior.
- **Escrita na conta errada:** `POST /progress/events` e `POST /ngo/application` levam `accountId`; se outra aba
  trocou a conta, `409 account_changed` e nada é gravado.
- **Decisão presa à versão analisada:** `revision` obrigatório na decisão; um reenvio no meio → `409 stale_revision`.
- **Verificações do DEC-015 no servidor:** aprovar exige as três marcadas e as registra na auditoria.
- **Validação:** datas impossíveis (`2021-02-29`) recusadas em vez de viradas para o mês seguinte; caracteres de
  controle viram espaço; ids de evento precisam existir para a missão (presentes, terrenos).
- **Outros:** `no-store` imposto em toda rota de conta; entrar encerra a sessão anterior do navegador; erros de
  banco na candidatura não viram mais "terreno indisponível"; corpo sem `Content-Length` lido só até o limite.
