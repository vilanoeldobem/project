# Decisões técnicas (ADRs)

> **Status:** 10 ADRs · **Atualizado em:** 2026-11-10
> **Fonte de verdade:** este diretório; decisões de produto em `vilanoeldobem/docs/docs/decisions/registro-de-decisoes.md`

## Como funciona

- Formato MADR simplificado. Arquivo `NNNN-titulo-kebab.md`, id `IMPL-NNNN` sequencial, nunca reutilizado.
- O namespace `IMPL-` é distinto das decisões de produto (`DEC-`), pendências (`PEN-`) e propostas (`PRP-`) do
  repositório de documentação. ADRs técnicos **não** decidem produto: quando dependem de uma decisão de produto,
  citam o `DEC-`/`PEN-` e, se ela não existe, registram a pergunta em [open-questions.md](open-questions.md).
- Seções fixas: Contexto, Decisão, Alternativas consideradas, Consequências, Relacionados.
- Cabeçalho: **Status**, **Data**, **Fontes**.
- Status: **Aceita (versão, data)** · **Proposta — a validar** · **Pendente do dono** · **Substituída por IMPL-NNNN**.
- Uma decisão nunca é editada para mudar de sentido: uma nova a substitui e a antiga tem o status atualizado.
  Complementos entram como **Adendo (AAAA-MM-DD)** no fim.

## Índice

| ADR | Título | Status |
|---|---|---|
| [IMPL-0001](0001-stack-react-threejs-cloudflare.md) | Stack: React + Three.js (react-three-fiber) + Cloudflare | Proposta — a validar (G11) |
| [IMPL-0002](0002-donations-disabled-until-partner-contract.md) | Doações desabilitadas até contrato da parceira e provedor | Aceita (0.1.0, 2026-11-08) |
| [IMPL-0003](0003-cloudflare-workers-static-assets-d1.md) | Um Worker com Static Assets + D1, monorepo pnpm | Aceita (0.1.0, 2026-11-08) |
| [IMPL-0004](0004-english-code-portuguese-docs.md) | Código e conversa com agentes em en-US; documentação em pt-BR | Aceita (0.2.0, 2026-11-08) |
| [IMPL-0005](0005-public-site-and-domains.md) | Site público em `apps/site` e domínios `www` / `app` | Aceita (0.3.0, 2026-11-08) |
| [IMPL-0006](0006-christmas-environment-real-time-procedural-weather.md) | Ambiente natalino: hora real de SP, clima procedural, vila nevada | Proposta — a validar (arte confirmada, OQ-07) |
| [IMPL-0007](0007-voxel-mesher-fixed-step-simulation.md) | Malha de voxels com AO, simulação em passo fixo, eventos de jogo | Proposta — a validar (G12) |
| [IMPL-0008](0008-multiplayer-presence-durable-objects.md) | Multiplayer de presença com Durable Objects e WebSocket | Aceita (2026-11-10, em produção) |
| [IMPL-0009](0009-split-client-api-server-shared.md) | Separar cliente, API e servidor em apps e subdomínios | Aceita (2026-11-10, em produção) |
| [IMPL-0010](0010-seeded-procedural-voxel-content.md) | Conteúdo voxel procedural por semente (geradores, orçamentos, galeria) | Proposta — fases 0–5 implementadas |

Perguntas que só o dono do produto responde: [open-questions.md](open-questions.md).

- [IMPL-0011 - Conta opcional por link mágico, teste local](0011-optional-magic-link-accounts.md) - proposta implementada para revisão; envio público pendente.
