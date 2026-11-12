# Guia de desenvolvimento

> **Status:** Implementado (0.4.0) · **Versão do software:** 0.4.0 · **Schema D1:** v5 ·
> **Atualizado em:** 2026-11-11
> **Fonte de verdade:** `AGENTS.md`, `CONTRIBUTING.md`, `apps/`, `packages/shared/`

Para quem vai mudar código da Vila (pessoas e agentes). Assume o ambiente de [getting-started](../getting-started.md).

## 1. Requisitos

Node.js ≥ 22, pnpm 10, Chrome. Editor com TypeScript (o projeto usa TypeScript 7 `strict`).

## 2. Layout

```
apps/client/                jogo (Worker "vilanoeldobem", play.vilanoeldobem.com.br)
  src/
    main.tsx, App.tsx       raiz React; escolhe o painel aberto
    game/                   store.ts (zustand), sim.ts, events.ts, devtools.ts
    environment/            runtime.ts, settings.ts, audio.ts, labels.ts (lado do navegador)
    scene/                  Three.js via react-three-fiber: World, Ground, Props, Player, Voxels, models.ts
    ui/                     painéis HTML sobre o canvas (P01, P02, P03/P04, P09, P12, P13, P14) e HUD
    lib/                    api.ts (cliente da API), account.ts (conta, sessão, sincronização do progresso),
                            endpoints.ts (hosts por modo de build), services.ts
    net/multiplayer.ts      conexão de presença com o servidor
  worker/                   index.ts (entrada) + handle.ts (redireciona app.* → play.*)
  security-headers.ts       _headers gerado no build (CSP connect-src por build)
  scripts/verify.mjs        verificação em Chrome real
  scripts/verify-accounts.mjs  contas e candidatura no jogo, análise no painel, em Chrome real (só local)
apps/dash/                  painel administrativo (Worker "vilanoeldobem-dash", dash.*; não publicado) — IMPL-0015
  src/
    main.tsx, App.tsx       raiz React; decide a tela pela sessão (entrar, só admins, contas desligadas, seções)
    lib/                    api.ts (cliente da API), session.ts, login-token.ts, router.ts (hash), hooks.ts,
                            format.ts, theme.ts (cores de PALETTE), endpoints.ts, services.ts
    ui/                     SignIn, Shell, Applications (análise de ONGs), Lots, Audit, Users, System, Pending
  security-headers.ts       _headers gerado no build (CSP estrita, noindex, no-store)
  scripts/verify.mjs        verificação em Chrome real (cabeçalhos, entrada, estados com contas desligadas)
apps/api/src/               index.ts (entrada) + api.ts (rotas, CORS, testável) — api.vilanoeldobem.com.br
                            auth, session, mail, progress, ngo, admin, http, crypto (contas, IMPL-0011)
                            backoffice (listas só de leitura do painel, IMPL-0015)
apps/api/test/d1.mjs        D1 de teste sobre node:sqlite com as migrations reais
apps/server/src/            index.ts, handler.ts, room.ts (lógica pura), room-do.ts (VillageRoom) — server.*
apps/site/                  site público — www.vilanoeldobem.com.br
packages/shared/src/        lógica pura (@vila/shared/…), sem DOM, three.js ou runtime da Cloudflare
  game/                     world.ts (layout), motion.ts (movimento), progress.ts (missões/XP)
  environment/              config, time, random, weather, events, keyframes, network-clock, frame
  net/protocol.ts           mensagens de presença
  accounts/validate.ts      validação do cadastro (P13) e da candidatura de ONG (P12)
  accounts/contract.ts      formas das respostas de conta e de análise (jogo e painel)
  accounts/errors.ts        ApiError e a frase em pt-BR de cada código de erro (jogo e painel)
migrations/                 SQL do D1
```

Apps nunca importam uns dos outros: o que for usado por mais de um vai para `packages/shared` (ver
[architecture.md §7](../reference/architecture.md#7-limites-entre-apps)).

## 3. Ciclo básico

1. `pnpm dev` para iterar (Vite :5173 + API :8787 + servidor :8788); para conferir o jogo servido pelo Worker, como
   em produção, rode os três Workers ([getting-started](../getting-started.md#4-rodar-api-servidor-e-jogo)).
2. Escreva/ajuste testes (`*.test.ts` ao lado do código).
3. Rode os gates; para mudança visual, rode `verify.mjs` e olhe as capturas.
4. Atualize docs e `CHANGELOG.md` no mesmo PR.

### 3.1 Gates obrigatórios

```bash
pnpm typecheck
pnpm test
pnpm build
```

### 3.2 Status real

Relate a saída de verdade. "Passou" sem ter rodado não existe.

## 4. Receitas

### 4.1 Adicionar uma rota de API

1. Implemente em `apps/api/src/api.ts` (`route`), com caminho sem prefixo (`/nova-rota`). Rotas públicas são somente
   leitura; escrita só nas rotas de conta (§4.1.1).
2. Teste em `apps/api/src/api.test.ts` com um D1 falso (ver testes existentes).
3. Documente em [reference/api.md](../reference/api.md) e chame do jogo por `apps/client/src/lib/api.ts`.
4. Nunca exporte nada além do handler em `apps/api/src/index.ts` (o runtime rejeita exports que não são handlers).

### 4.1.1 Rotas de conta (IMPL-0011)

Rotas que exigem conta passam por `accountRoute` em `api.ts` (bandeira, `Origin`, limite) e vivem no módulo do
assunto (`auth.ts`, `progress.ts`, `ngo.ts`, `admin.ts`). Use `requireUser` / `requireAdmin` (`session.ts`),
`readJson` e `HttpError` (`http.ts`); toda mutação de admin grava `audit_events`. Teste em
`apps/api/src/accounts.test.ts`, que roda a API inteira sobre SQLite real (`node:sqlite`) com as migrations reais
(`apps/api/test/d1.mjs`). Regras de formulário ficam em `packages/shared/src/accounts/validate.ts`, para o cliente e
a API usarem as mesmas.

### 4.2 Adicionar uma migration

1. Crie `migrations/NNNN_nome.sql` com o próximo número. Nunca edite uma existente já aplicada no remoto.
2. `pnpm db:migrate:local`.
3. Atualize [reference/storage.md](../reference/storage.md) e o "Schema D1 vN" do `CHANGELOG.md`.

### 4.3 Adicionar um objeto voxel à cena

1. Gere os voxels em `apps/client/src/scene/models.ts` (`[x, y, z, cor]`, origem no chão).
2. Desenhe com `<Voxels voxels={...} size={...} />` (1 draw call por papel de material). Papéis por cor:
   `emissive` (lâmpadas que cintilam), `glow` (janelas que acendem à noite), `sway` (folhagem com vento).
3. Use cores de `PALETTE` (`packages/shared/src/game/world.ts`). Mantenha o tamanho de bloco coerente (doc 17).
4. Muitas cópias do mesmo objeto? Junte os voxels num único `<Voxels>` (ver `Pines` em `scene/Scenery.tsx`).
5. Efeito que muda com a hora ou o clima: leia `env.frame` dentro de `useFrame`, nunca `new Date()`
   ([reference/environment.md](../reference/environment.md)).

### 4.4 Adicionar uma missão

1. Acrescente em `MISSIONS` (`packages/shared/src/game/progress.ts`) com trilha, alvo e XP.
2. Dispare `useVila.getState().record(missionId, eventId)` com um `eventId` estável e único por ocorrência.
3. Missões não podem premiar tempo online nem número de indicações enviadas (doc 22).

### 4.5 Testar contas localmente

O script `pnpm --filter @vila/api dev` já liga `ACCOUNTS_ENABLED=true` e `ENVIRONMENT=development`. Fora de
produção — e só com `ENVIRONMENT=development` ou `test` — a API devolve o link de acesso na resposta (`devLink`) e o painel mostra "Abrir link (só em
desenvolvimento)": não é preciso e-mail de verdade.

1. `pnpm db:migrate:local` (aplica a 0004) e suba os três Workers
   ([getting-started §4](../getting-started.md#4-rodar-api-servidor-e-jogo)).
2. No jogo: chip "Entrar" → "Criar conta" → "Abrir link (só em desenvolvimento)". O chip vira `@nickname`.
3. Para virar admin localmente (nunca `--remote` sem autorização):

   ```bash
   cd apps/api
   pnpm exec wrangler d1 execute vilanoeldobem --local --command "UPDATE users SET role='admin' WHERE nickname='seu_nick'"
   ```

   Suba o painel administrativo (`pnpm --filter @vila/dash dev:worker`, `http://localhost:8797`) e entre com o
   mesmo e-mail: o link "Abrir link (só em desenvolvimento)" pedido ali abre o próprio painel. Quem já entrou no
   jogo neste navegador abre o painel já autenticado (o cookie é o mesmo), e o painel da conta do jogo ganha o link
   "Abrir painel administrativo". A análise fica na seção "Candidaturas".
4. Fluxo completo automatizado (cadastro, migração do progresso e candidatura no jogo; entrada, pedido de ajustes,
   aprovação, auditoria e contas no painel; reenvio e casa publicada no jogo), só contra `localhost`, com os quatro
   Workers de pé (API, servidor, jogo e painel):

   ```bash
   node apps/client/scripts/verify-accounts.mjs    # padrão: jogo :8799, API :8787, painel :8797
   ```

   Ele cria contas e concede `admin` com `wrangler d1 execute --local`; capturas em `apps/client/verify-output/`.
   Cada execução faz 9 chamadas a `/auth/*` e a API aceita 10 por minuto por IP (`AUTH_LIMITER`): **espere 60 s
   entre duas execuções**. Se o limite for atingido, o script para com "rate limited: wait 60 s and run again".

Se `wrangler dev` falhar com "Address already in use", um `workerd` antigo pode estar segurando a porta do
inspector (9230 na API, 9231 no servidor): encerre o processo antigo ou rode o comando do script `dev` com outra
`--inspector-port`.

### 4.6 Adicionar um painel

1. Componente em `apps/client/src/ui/` usando `<Panel>`; novo `kind` em `Panel` (`game/store.ts`) e no `App.tsx`.
2. Texto em pt-BR, botões com nome acessível (`aria-label` quando o rótulo some no celular).

### 4.7 Adicionar uma seção ao painel administrativo

1. Nova entrada em `SECTIONS` e no tipo `Section` (`apps/dash/src/lib/router.ts`); componente em
   `apps/dash/src/ui/`; uma linha no `App.tsx`. Chamadas novas entram em `apps/dash/src/lib/api.ts`.
2. Só dados reais da API ou um estado vazio/pendente dito com todas as letras (`<Notice state="…">`): nada de linha
   de exemplo, número inventado ou botão que finge funcionar. Seção que precisa de sessão recebe `locked` e mostra
   `<AccountsOff>` com as contas desligadas, sem chamar a API.
3. Sem estilo inline, script externo ou fonte externa: a CSP do painel (`security-headers.ts`) bloqueia. Cores só de
   `lib/theme.ts`.
4. Rota nova de admin: `requireAdmin`, `no-store`, sem e-mail nem nome na resposta; mutação grava `audit_events`.
5. Rode `node apps/dash/scripts/verify.mjs` e acrescente a seção nova à lista `SECTIONS` do script.

## 5. Regras não negociáveis (resumo de AGENTS.md)

- Sem pagamento simulado; sem números inventados; sem dados fictícios em produção.
- XP idempotente; doação não dá XP.
- Só admin publica ONG; mutações de admin vão para `audit_events`.
- Nada de dados pessoais em logs (nem corpo de requisição, e-mail, token ou CNPJ).
- Contas ficam atrás de `ACCOUNTS_ENABLED` (`"false"` em produção) até a revisão LGPD / ECA Digital; não ligar a
  bandeira, conceder `admin` no remoto nem aplicar migration remota sem autorização.

## 6. Convenções de código

- Componentes funcionais; estado global só em `useVila`; lógica pura fora de componentes para ser testável.
- Textos de interface (UI copy) em pt-BR; todo o resto do código em inglês: identificadores, comentários, valores
  de estado, nomes de tabela/coluna, ids, chaves de API, mensagens de log e testes. Ver [IMPL-0004](../decisions/0004-english-code-portuguese-docs.md).
- Comentários citam a decisão do produto (`DEC-028`) quando a regra vem dela.

## 7. Commits

Conventional Commits — ver [CONTRIBUTING.md](../../CONTRIBUTING.md#mensagens-de-commit-e-títulos-de-pr).

## 8. Changelog e documentação no mesmo change

Toda mudança de comportamento atualiza: `CHANGELOG.md` (`[Unreleased]`), `docs/reference/`, `docs/decisions/`
(se houve decisão) e `README.md` (se mudou o começo rápido ou o status das telas).

## 9. Checklist de PR

O modelo em `.github/PULL_REQUEST_TEMPLATE.md` é obrigatório. Resumo:

- [ ] Três gates verdes, com saída real.
- [ ] `verify.mjs` rodado se a interface mudou (desktop e celular; o do app que mudou: jogo, site ou painel);
      `verify-accounts.mjs` se mexeu em conta, ONG ou admin.
- [ ] Nenhuma migration existente alterada.
- [ ] Nenhum log novo com dados pessoais ou segredos.
- [ ] `CHANGELOG.md` e docs atualizados; ADR se a decisão for estrutural.

## Limitações conhecidas

- Sem CI ainda: os gates são locais (ver ROADMAP, tarefas de base).

## Ver também

[AGENTS.md](../../AGENTS.md) · [CONTRIBUTING.md](../../CONTRIBUTING.md) · [reference/architecture.md](../reference/architecture.md)
