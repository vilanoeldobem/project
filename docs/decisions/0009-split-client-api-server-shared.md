# IMPL-0009: Separar cliente, API e servidor de tempo real em apps e subdomínios próprios

**Status:** Aceita pelo responsável técnico (2026-11-10) — em produção desde 2026-11-10 (api cf8a3c8a, server 9c92585f,
client 41bca2ec, site 958763b3)
**Data:** 2026-11-10
**Fontes:** pedido do responsável técnico em 2026-11-10 ("em apps/ separar site, client, server, api"; escolha:
4 apps + pacote compartilhado, com `play.*`, `api.*` e `server.*`); substitui a parte de topologia de
[IMPL-0003](0003-cloudflare-workers-static-assets-d1.md) (um Worker com Static Assets + D1) e de
[IMPL-0008](0008-multiplayer-presence-durable-objects.md) (`/api/room` no mesmo Worker)

## Contexto

`apps/web` reunia três coisas com ciclos de vida diferentes num único Worker: o jogo (arquivos estáticos que mudam a
cada ajuste de arte), a API HTTP com D1 (contrato público, muda pouco) e as salas de presença em Durable Object
(conexões longas, custo por tempo conectado). Um deploy de qualquer parte levava as outras junto, e uma falha em
uma podia derrubar as demais.

## Decisão

| App | Worker | Endereço | Responsabilidade |
|---|---|---|---|
| `apps/site` | `vilanoeldobem-site` | `www.vilanoeldobem.com.br` (raiz → www) | Site público (sem mudança) |
| `apps/client` | `vilanoeldobem` | `play.vilanoeldobem.com.br` (`app.*` → 301 para `play.*`) | Jogo 3D, só arquivos estáticos |
| `apps/api` | `vilanoeldobem-api` | `api.vilanoeldobem.com.br` | API HTTP somente leitura + D1 |
| `apps/server` | `vilanoeldobem-server` | `server.vilanoeldobem.com.br` | Presença em tempo real (Durable Object `VillageRoom`) |
| `packages/shared` | — | — | Lógica pura usada por mais de um app |

1. **Rotas da API sem prefixo:** `/health`, `/indicators`, `/lots`, `/environment` (o host já diz que é API).
   **Servidor:** `/health` e `/room?i=N` (WebSocket).
2. **Origens explícitas:** a API manda CORS só para origens exatas da lista `ALLOWED_ORIGINS` (`play.*` e `www.*`);
   o servidor só aceita WebSocket de origens exatas da sua lista (`play.*`). Sem curingas: um host parecido nunca
   passa. Em desenvolvimento local, as listas vêm do script `dev` (`--var`).
3. **CSP por build:** o `connect-src` do jogo é gerado no build a partir de `src/lib/endpoints.ts` (produção →
   subdomínios; `--mode workers` → Workers locais). O HTML faz `preconnect` para a API.
4. **`packages/shared`** (`@vila/shared/<pasta>/<módulo>`, TypeScript direto, sem build): mundo e obstáculos,
   movimento, missões/XP, ambiente (hora, clima, keyframes, relógio de rede) e protocolo de presença. Sem DOM,
   three.js ou runtime da Cloudflare. Apps nunca importam uns dos outros.
5. **Mesmo nome de Worker para o jogo** (`vilanoeldobem`): o deploy do cliente substitui o Worker atual de
   `app.*`, que passa a só redirecionar; a API e o servidor nascem como Workers novos.
6. **Gates:** cada Worker roda `wrangler deploy --dry-run` no `pnpm build` (o empacotamento quebra no CI, não no
   deploy). `scripts/smoke-api.sh` confere API, servidor e cliente.

## Alternativas consideradas

- **Pastas separadas, um Worker só:** sem mudança de rotas, mas mantém o deploy acoplado. Recusada pelo responsável.
- **Mesmo host com rotas por caminho (`play.*/api/*` → Worker da API):** evita CORS, mas amarra o roteamento da zona
  e esconde a separação; subdomínios deixam limites e logs claros.
- **Service binding da API para o servidor:** desnecessário hoje (o cliente fala direto com cada serviço).

## Consequências

- Custo extra na primeira visita: duas resoluções de DNS/TLS a mais (mitigado com `preconnect`). Todos os hosts são
  do mesmo site registrável (`vilanoeldobem.com.br`), então cookies `SameSite=Lax` de login futuro (0.4.0)
  continuam possíveis.
- **Mudança incompatível da API:** caminhos sem `/api`. Cliente e API precisam ir juntos no primeiro deploy.
- **Primeiro deploy, nesta ordem:** API (`api.*`, cria o Worker e o domínio) → servidor (`server.*`, cria a classe
  `VillageRoom`) → cliente (`play.*` e redirecionamento de `app.*`) → site (links para `play.*`). Exige autorização.
- Até o deploy, o smoke diário de produção falha (aponta para os hosts novos).
- Trocar um host exige mudar três lugares: `endpoints.ts`, `ALLOWED_ORIGINS` da API e do servidor (AGENTS.md).

## Relacionados

[architecture.md](../reference/architecture.md) · [api.md](../reference/api.md) · [deploy.md](../guides/deploy.md) ·
[IMPL-0003](0003-cloudflare-workers-static-assets-d1.md) · [IMPL-0005](0005-public-site-and-domains.md) ·
[IMPL-0008](0008-multiplayer-presence-durable-objects.md)
