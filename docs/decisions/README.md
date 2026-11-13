# Decisões técnicas (ADRs)

> **Status:** Índice de decisões técnicas · **Atualizado em:** 2026-11-12
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
| [IMPL-0011](0011-accounts-magic-link-ngo-review.md) | Contas, link mágico, candidatura e análise de ONGs | Proposta — implementada, desligada em produção (`ACCOUNTS_ENABLED`); item 4 substituído por IMPL-0012; concessão de papel (item 8) revista por IMPL-0021 |
| [IMPL-0012](0012-resend-transactional-email.md) | E-mail transacional pelo Resend | Aceita (2026-11-11) — implementada; aguarda chave e domínio verificado |
| [IMPL-0013](0013-quests-v1-runtime.md) | Runtime das quests `quests-v1`: duas bandeiras, máquina de estados, gravação só de transições válidas | Proposta — implementada, desligada em produção (`QUESTS_V1_ENABLED`, `VITE_QUESTS_V1_ENABLED`); concorrência e confirmação de eventos revistas em IMPL-0019; conteúdo PROPOSTA (PEN-025) |
| [IMPL-0014](0014-realtime-idle-timeout.md) | Limite de inatividade na presença (desconectar quem está ausente) | Proposta — implementada, a validar (padrão de 5 min; em produção desde 2026-11-12) |
| [IMPL-0015](0015-dash-backoffice-app.md) | Painel administrativo em app e subdomínio próprios (`apps/dash`, `dash.*`) | Aceita (2026-11-11) — em produção desde 2026-11-12 (contas desligadas); menu PROPOSTA; concessão de papel e regra "só no painel" revistas por IMPL-0021 |
| [IMPL-0016](0016-click-navigation-and-colliders.md) | Navegação por clique com desvio de obstáculos e colisores medidos pelo que é desenhado | Proposta — implementada, a validar (layout do mundo segue PROPOSTA, PEN-017) |
| [IMPL-0017](0017-ngo-files-r2.md) | Arquivos das candidaturas de ONG no R2 (logo e documentos) | Proposta — implementada, desligada em produção (`NGO_FILES_ENABLED`); bucket não criado; lista de documentos PENDENTE (PEN-019) |
| [IMPL-0018](0018-ngo-files-reconciliation.md) | Conciliação de logo/documentos e galeria sobre o fluxo do PR #32 | Proposta — implementada, sem ativação; conciliação de arquivos e galeria |
| [IMPL-0019](0019-progress-concurrency-and-acknowledgment.md) | Concorrência e confirmação da persistência de progresso | Proposta — implementada, bandeiras inalteradas |
| [IMPL-0020](0020-ngo-publication-withdrawal.md) | Retirada administrativa da publicação de ONG: registro aditivo, leituras públicas pelo terreno | Proposta — implementada, desligada em produção e homologação (`NGO_WITHDRAWAL_ENABLED`); política PENDENTE (OQ-14), missões na OQ-09 |
| [IMPL-0021](0021-administrator-role-and-moderation.md) | Papel de administrador e moderação: dois papéis, login próprio do painel, papéis geridos pelo painel, exceção de moderação dentro do jogo, bloqueio de conta e remoção de visitante de uma sala | Aceita (2026-11-12) para papéis, login do painel, gestão de papéis e exceção no jogo; Proposta — implementada, desligada em produção e homologação para o bloqueio de conta (`ACCOUNT_BLOCK_ENABLED`; política PENDENTE, OQ-11) e a remoção de visitante (`PRESENCE_MODERATION_ENABLED`) |
| [IMPL-0022](0022-immersive-entry-and-game-menu.md) | Chegada sem tela de boas-vindas, HUD sem botões de zoom e sem a marca, menu do jogo no Esc | Proposta — implementada, a validar (PROPOSTA do responsável técnico; ratificação na OQ-16) |
| [IMPL-0023](0023-donations-abacatepay.md) | Doações Pix com split e conciliação pela AbacatePay (global e por ONG), Título creditado uma vez | Proposta — implementada, desligada em produção e homologação (`DONATIONS_ENABLED`); depende de PEN-004, PEN-006 e PEN-026 |
| [IMPL-0023](0023-village-expansion-and-zoning.md) | Expansão da Vila e zoneamento: plano único, fachada de ONGs, três faixas residenciais, lojas e placas como marcadores, regra de vista para a árvore | Proposta — fase 1 implementada; posse de terrenos desligada em produção e homologação (`RESIDENTIAL_PLOTS_ENABLED`); política PENDENTE (OQ-17, OQ-18, OQ-19) |

Perguntas que só o dono do produto responde: [open-questions.md](open-questions.md).
