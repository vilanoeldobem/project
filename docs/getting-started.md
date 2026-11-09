# Começando — rodar a Vila localmente

> **Status:** Implementado (0.2.0) · **Versão do software:** 0.2.0 · **Schema D1:** v3 ·
> **Atualizado em:** 2026-11-08
> **Fonte de verdade:** `package.json`, `apps/web/package.json`, `apps/web/wrangler.jsonc`

Ao final você terá a praça 3D rodando em `http://localhost:8787`, servida pelo mesmo Worker que vai para produção,
com D1 local.

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
pnpm --filter @vila/web db:migrate:local
```

Saída esperada: `0001_initial.sql ✅` e `0002_seed_lots.sql ✅`. O banco fica em `apps/web/.wrangler/` (ignorado pelo Git).

## 4. Rodar Worker + cliente

```bash
pnpm dev:worker
```

Abra `http://localhost:8787`. Confira a API:

```bash
curl -s localhost:8787/api/health
# {"ok":true,"version":"0.2.0","environment":"production","db":true}
```

> Para iterar só na interface com recarga instantânea use `pnpm dev` (`http://localhost:5173`). Sem Worker, as
> chamadas `/api/*` falham e a interface mostra terrenos disponíveis e "Indicadores indisponíveis".

## 5. Passear

1. "Entrar na Vila".
2. Ande com WASD/setas ou toque no chão. Encontre os presentes que flutuam (missão *Explorar*).
3. Perto da árvore aparece "Doação global"; perto de um terreno, "Ver terreno" (tecla **E**).
4. Abra "Jogar" e complete o Jogo da Memória; veja o ★ Missões no canto inferior.

## 6. Verificar antes de entregar

```bash
pnpm check                                         # typecheck + testes + build
node apps/web/scripts/verify.mjs http://localhost:8787
```

As capturas ficam em `apps/web/verify-output/`.

## 7. Próximos passos

- [guides/development.md](guides/development.md) para o ciclo de trabalho e o checklist de PR.
- [guides/deploy.md](guides/deploy.md) para publicar.

## Limitações conhecidas

- `wrangler dev` serve o `dist/` gerado no momento do build: rode `pnpm dev:worker` de novo após mudar o cliente.

## Ver também

[README](../README.md) · [AGENTS.md](../AGENTS.md) · [reference/architecture.md](reference/architecture.md)
