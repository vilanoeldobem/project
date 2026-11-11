# Guia de desenvolvimento

> **Status:** Implementado (0.2.0) · **Versão do software:** 0.2.0 · **Schema D1:** v3 ·
> **Atualizado em:** 2026-11-10
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
    ui/                     painéis HTML sobre o canvas (P01, P02, P03/P04, P09, P14) e HUD
    lib/                    api.ts (cliente da API), endpoints.ts (hosts por modo de build), services.ts
    net/multiplayer.ts      conexão de presença com o servidor
  worker/                   index.ts (entrada) + handle.ts (redireciona app.* → play.*)
  security-headers.ts       _headers gerado no build (CSP connect-src por build)
  scripts/verify.mjs        verificação em Chrome real
apps/api/src/               index.ts (entrada) + api.ts (rotas, CORS, testável) — api.vilanoeldobem.com.br
apps/server/src/            index.ts, handler.ts, room.ts (lógica pura), room-do.ts (VillageRoom) — server.*
apps/site/                  site público — www.vilanoeldobem.com.br
packages/shared/src/        lógica pura (@vila/shared/…), sem DOM, three.js ou runtime da Cloudflare
  game/                     world.ts (layout), motion.ts (movimento), progress.ts (missões/XP)
  environment/              config, time, random, weather, events, keyframes, network-clock, frame
  net/protocol.ts           mensagens de presença
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

1. Implemente em `apps/api/src/api.ts` (`route`), com caminho sem prefixo (`/nova-rota`). Somente leitura até existir
   autenticação.
2. Teste em `apps/api/src/api.test.ts` com um D1 falso (ver testes existentes).
3. Documente em [reference/api.md](../reference/api.md) e chame do jogo por `apps/client/src/lib/api.ts`.
4. Nunca exporte nada além do handler em `apps/api/src/index.ts` (o runtime rejeita exports que não são handlers).

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

### 4.5 Adicionar um painel

1. Componente em `apps/client/src/ui/` usando `<Panel>`; novo `kind` em `Panel` (`game/store.ts`) e no `App.tsx`.
2. Texto em pt-BR, botões com nome acessível (`aria-label` quando o rótulo some no celular).

## 5. Regras não negociáveis (resumo de AGENTS.md)

- Sem pagamento simulado; sem números inventados; sem dados fictícios em produção.
- XP idempotente; doação não dá XP.
- Só admin publica ONG; mutações de admin vão para `audit_events`.
- Nada de dados pessoais em logs.

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
- [ ] `verify.mjs` rodado se a interface mudou (desktop e celular).
- [ ] Nenhuma migration existente alterada.
- [ ] Nenhum log novo com dados pessoais ou segredos.
- [ ] `CHANGELOG.md` e docs atualizados; ADR se a decisão for estrutural.

## Limitações conhecidas

- Sem CI ainda: os gates são locais (ver ROADMAP, tarefas de base).

## Ver também

[AGENTS.md](../../AGENTS.md) · [CONTRIBUTING.md](../../CONTRIBUTING.md) · [reference/architecture.md](../reference/architecture.md)

## Cadastro e sessão local

Node 24+ para provas SQL com `node:sqlite`. [Guia local](auth-local.md): o cliente e a API usam origens distintas;
auth fica na API, não em `apps/server`. `CHROME_EXECUTABLE_PATH` permite Chromium nos verificadores; cada navegador
usa perfil isolado e `TMPDIR=/tmp`. A workspace permite scripts de instalação de esbuild e workerd.
