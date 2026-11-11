# Guia de desenvolvimento

> **Status:** Implementado (0.2.0) · **Versão do software:** 0.2.0 · **Schema D1:** v3 ·
> **Atualizado em:** 2026-11-08
> **Fonte de verdade:** `AGENTS.md`, `CONTRIBUTING.md`, `apps/web/`

Para quem vai mudar código da Vila (pessoas e agentes). Assume o ambiente de [getting-started](../getting-started.md).

## 1. Requisitos

Node.js ≥ 24 (testes de conta usam `node:sqlite`), pnpm 10, Chrome ou Chromium. Editor com TypeScript
(o projeto usa TypeScript 7 `strict`). `pnpm-workspace.yaml` permite scripts de instalação de `esbuild` e
`workerd`, necessários para build e Worker local.

## 2. Layout

```
apps/web/
  src/
    main.tsx, App.tsx       raiz React; escolhe o painel aberto
    game/                   lógica sem React/Three: world.ts (layout), progress.ts (missões/XP), store.ts (zustand)
    scene/                  Three.js via react-three-fiber: World, Ground, Props, Player, Voxels, models.ts
    ui/                     painéis HTML sobre o canvas (P01, P02, P03/P04, P09, P14) e HUD
    lib/api.ts              cliente da API do Worker
  worker/                   index.ts (entrada) + api.ts (rotas, testável)
  public/                   _headers, favicon
  scripts/verify.mjs        verificação em Chrome real
migrations/                 SQL do D1
```

## 3. Ciclo básico

1. `pnpm dev` para iterar na interface; `pnpm dev:worker` quando tocar na API ou no D1.
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

Para Chromium fora do canal padrão Chrome, use `CHROME_EXECUTABLE_PATH=/usr/bin/chromium` antes do comando
`node apps/web/scripts/verify.mjs http://localhost:8787`. Os testes usam perfil isolado e `TMPDIR=/tmp` no
processo do navegador. Cadastro/login têm guia próprio: [auth-local.md](auth-local.md).

## 4. Receitas

### 4.1 Adicionar uma rota de API

1. Implemente em `apps/web/worker/api.ts` (`handleApi`). Escritas de conta ficam isoladas em `auth.ts` e exigem origem validada.
2. Teste em `worker/api.test.ts` com um D1 falso (ver testes existentes).
3. Documente em [reference/api.md](../reference/api.md).
4. Nunca exporte nada além do handler em `worker/index.ts` (o runtime rejeita exports que não são handlers).

### 4.2 Adicionar uma migration

1. Crie `migrations/NNNN_nome.sql` com o próximo número. Nunca edite uma existente já aplicada no remoto.
2. `pnpm --filter @vila/web db:migrate:local`.
3. Atualize [reference/storage.md](../reference/storage.md) e o "Schema D1 vN" do `CHANGELOG.md`.

### 4.3 Adicionar um objeto voxel à cena

1. Gere os voxels em `src/scene/models.ts` (`[x, y, z, cor]`, origem no chão).
2. Desenhe com `<Voxels voxels={...} size={...} />` (1 draw call por papel de material). Papéis por cor:
   `emissive` (lâmpadas que cintilam), `glow` (janelas que acendem à noite), `sway` (folhagem com vento).
3. Use cores de `PALETTE` (`src/game/world.ts`). Mantenha o tamanho de bloco coerente (doc 17).
4. Muitas cópias do mesmo objeto? Junte os voxels num único `<Voxels>` (ver `Pines` em `scene/Scenery.tsx`).
5. Efeito que muda com a hora ou o clima: leia `env.frame` dentro de `useFrame`, nunca `new Date()`
   ([reference/environment.md](../reference/environment.md)).

### 4.4 Adicionar uma missão

1. Acrescente em `MISSIONS` (`src/game/progress.ts`) com trilha, alvo e XP.
2. Dispare `useVila.getState().record(missionId, eventId)` com um `eventId` estável e único por ocorrência.
3. Missões não podem premiar tempo online nem número de indicações enviadas (doc 22).

### 4.5 Adicionar um painel

1. Componente em `src/ui/` usando `<Panel>`; novo `kind` em `Panel` (`store.ts`) e no `App.tsx`.
2. Texto em pt-BR, botões com nome acessível (`aria-label` quando o rótulo some no celular).

## 5. Regras não negociáveis (resumo de AGENTS.md)

- Sem pagamento simulado; sem números inventados; sem dados fictícios em produção.
- XP idempotente; doação não dá XP.
- Só admin publica ONG; mutações de admin vão para `audit_events`.
- Nada de dados pessoais em logs.

## 6. Convenções de código

- Componentes funcionais; estado do mundo em `useVila`, sessão opcional em `useAuth`; lógica fora de componentes para ser testável.
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
