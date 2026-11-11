# Começando — rodar a Vila localmente

> **Status:** Implementado (0.2.0) · **Versão do software:** 0.2.0 · **Schema D1:** v3 ·
> **Atualizado em:** 2026-11-10
> **Fonte de verdade:** `package.json`, `apps/{client,api,server}/package.json`, `apps/{client,api,server}/wrangler.jsonc`

Ao final você terá a praça 3D rodando em `http://localhost:8799`, servida pelo mesmo Worker do jogo que vai para
produção, falando com a API (D1 local) em `:8787` e com o servidor de presença em `:8788`
([IMPL-0009](decisions/0009-split-client-api-server-shared.md)).

## 1. Pré-requisitos

- Node.js ≥ 22 e pnpm 10 (`corepack enable` ativa a versão de `packageManager`).
- Google Chrome (só para `verify.mjs`).
- Nenhuma conta Cloudflare é necessária para rodar localmente.

## 2. Instalar

```bash
git clone <repo> vilanoeldobem && cd vilanoeldobem
pnpm install
```

## 3. Criar o banco local

```bash
pnpm db:migrate:local
```

Saída esperada: `0001_initial.sql ✅`, `0002_seed_lots.sql ✅` e `0003_english_schema.sql ✅`. O banco fica em
`apps/api/.wrangler/` (ignorado pelo Git).

## 4. Rodar API, servidor e jogo

Três terminais:

```bash
pnpm --filter @vila/api dev            # API      → http://localhost:8787 (D1 local)
pnpm --filter @vila/server dev         # servidor → http://localhost:8788 (salas de presença)
pnpm --filter @vila/client dev:worker  # jogo     → http://localhost:8799 (vite build --mode workers + wrangler dev)
```

Abra `http://localhost:8799`. Confira a API e o servidor:

```bash
curl -s localhost:8787/health
# {"ok":true,"version":"0.3.0","environment":"production","db":true}
curl -s localhost:8788/health
# {"ok":true,"service":"server","rooms":true}
```

> Para iterar só na interface com recarga instantânea use `pnpm dev`: sobe o Vite em `http://localhost:5173` junto
> com a API e o servidor. Se a API não estiver de pé, a interface mostra terrenos disponíveis e "Indicadores
> indisponíveis"; sem o servidor, o jogo segue solo.

## 5. Passear

1. "Entrar na Vila".
2. Ande com WASD/setas ou toque no chão. Encontre os presentes que flutuam (missão *Explorar*).
3. Perto da árvore aparece "Doação global"; perto de um terreno, "Ver terreno" (tecla **E**).
4. Abra "Jogar" e complete o Jogo da Memória; veja o ★ Missões no canto inferior.

## 6. Verificar antes de entregar

```bash
pnpm check                                         # typecheck + testes + build
node apps/client/scripts/verify.mjs http://localhost:8799
sh scripts/smoke-api.sh http://localhost:8787 http://localhost:8788 http://localhost:8799
```

As capturas ficam em `apps/client/verify-output/`. Sem argumentos, `smoke-api.sh` confere a produção.

## 7. Próximos passos

- [guides/development.md](guides/development.md) para o ciclo de trabalho e o checklist de PR.
- [guides/deploy.md](guides/deploy.md) para publicar.

## Limitações conhecidas

- `wrangler dev` do jogo serve o `dist/` gerado no momento do build: rode `pnpm --filter @vila/client dev:worker` de
  novo após mudar o cliente (ou use `pnpm dev`).

## Ver também

[README](../README.md) · [AGENTS.md](../AGENTS.md) · [reference/architecture.md](reference/architecture.md)
