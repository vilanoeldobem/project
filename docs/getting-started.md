# Começando — rodar a Vila localmente

> **Status:** Implementado (0.4.0) · **Versão do software:** 0.4.0 · **Schema D1:** v5 ·
> **Atualizado em:** 2026-11-11
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

Saída esperada: `0001_initial.sql ✅`, `0002_seed_lots.sql ✅`, `0003_english_schema.sql ✅` e
`0004_accounts_ngo_applications.sql ✅`. O banco fica em
`apps/api/.wrangler/` (ignorado pelo Git).

## 4. Rodar API, servidor e jogo

Três terminais:

```bash
pnpm --filter @vila/api dev            # API      → http://localhost:8787 (D1 local, contas ligadas)
pnpm --filter @vila/server dev         # servidor → http://localhost:8788 (salas de presença)
pnpm --filter @vila/client dev:worker  # jogo     → http://localhost:8799 (vite build --mode workers + wrangler dev)
```

Abra `http://localhost:8799`. Confira a API e o servidor:

```bash
curl -s localhost:8787/health
# {"ok":true,"version":"0.4.0","environment":"development","db":true}
curl -s localhost:8787/config
# {"accounts":true}
curl -s localhost:8788/health
# {"ok":true,"service":"server","rooms":true}
```

> Para iterar só na interface com recarga instantânea use `pnpm dev`: sobe o Vite em `http://localhost:5173` junto
> com a API e o servidor. Se a API não estiver de pé, a interface mostra terrenos disponíveis e "Indicadores
> indisponíveis"; sem o servidor, o jogo segue solo.

> Se `wrangler dev` disser "Address already in use", um `workerd` antigo pode estar segurando a porta do inspector
> (9230 na API, 9231 no servidor). Encerre o processo antigo ou rode o comando do script `dev` com outra
> `--inspector-port`.

## 5. Passear

1. "Entrar na Vila".
2. Ande com WASD/setas ou toque no chão. Encontre os presentes que flutuam (missão *Explorar*).
3. Perto da árvore aparece "Doação global"; perto de um terreno, "Ver terreno" (tecla **E**).
4. Abra "Jogar" e complete o Jogo da Memória; veja o ★ Missões no canto inferior.

### 5.1 Conta e candidatura de ONG (local)

Localmente as contas vêm ligadas (`ACCOUNTS_ENABLED=true`, `ENVIRONMENT=development`); em produção ainda estão
desligadas ([IMPL-0011](decisions/0011-accounts-magic-link-ngo-review.md)).

1. Chip **"Entrar"** no HUD → "Criar conta": Nome, Nickname, Cidade e E-mail (qualquer e-mail; nada é enviado sem o
   Email Service).
2. Em vez do e-mail, o painel mostra **"Abrir link (só em desenvolvimento)"** (`devLink`). Abra: o chip vira
   `@nickname` e o progresso local passa para a conta.
3. Perto de um terreno disponível, "Ver terreno" → **"Candidatar minha ONG"**: quatro etapas, terreno reservado ao
   enviar. A situação fica em "Minha candidatura de ONG", no painel da conta.
4. Para analisar, conceda `admin` à sua conta local (ver [development §4.5](guides/development.md#45-testar-contas-localmente))
   e abra **"Análise de ONGs"**.

## 6. Verificar antes de entregar

```bash
pnpm check                                         # typecheck + testes + build
node apps/client/scripts/verify.mjs http://localhost:8799
sh scripts/smoke-api.sh http://localhost:8787 http://localhost:8788 http://localhost:8799
node apps/client/scripts/verify-accounts.mjs       # contas, candidatura e análise (só local)
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
