# Especificações do produto

> **Status:** referência externa · **Atualizado em:** 2026-11-11
> **Fonte de verdade:** repositório [`vilanoeldobem/docs`](https://github.com/vilanoeldobem/docs)

As especificações **não** são copiadas para cá, para não divergirem. A equipe discute e registra regras de negócio
no repositório de documentação; o código implementa as regras CONFIRMADAS e cita o `DEC-` (fluxo em
`vilanoeldobem/docs/docs/guides/fluxo-negocio-para-codigo.md`). Caminhos abaixo são daquele repositório:

| Documento | Para quê |
|---|---|
| `docs/README.md` | Índice e precedência |
| `docs/decisions/registro-de-decisoes.md` | **Autoridade**: DEC-001..046, PEN-, PRP- |
| `docs/specs/especificacao-funcional.md` | Funções 1–14 |
| `docs/specs/plano-de-wireframes.md` + `docs/specs/wireframes/` | Telas P01–P15 |
| `docs/specs/missao-da-vila.md` | Missões, XP, regras de progressão |
| `docs/reference/guia-identidade-visual-voxel.md` | Voxel, paleta de trabalho, logo |
| `management/plano-de-desenvolvimento.md` | Rotas A/B, marcos, cartões |
| `management/acompanhamento/` | Kanban/Gantt oficial |

## Precedência

1. Declarações explícitas do responsável. 2. Registro de decisões (mais recente). 3. Base 1.0. 4. Propostas.

Estados: **CONFIRMADO** (decisão), **PROPOSTA**, **HIPÓTESE**, **PENDENTE**. Só CONFIRMADO é decisão.

## Mapa telas → código (0.4.0)

Caminhos relativos a `apps/client/src/`, salvo indicação. As telas seguem as pranchas P01–P15 (IMPL-0026).

| Tela | Código | Status |
|---|---|---|
| P01 | `ui/Hud.tsx` (barra com a marca e os quatro caminhos; IMPL-0026, que substitui em parte a IMPL-0022), `ui/Donation.tsx`, `ui/PixDonation.tsx` (doação Pix atrás de `DONATIONS_ENABLED`, PROPOSTA: IMPL-0023), `scene/Props.tsx` (árvore) | Implementado; doação global desligada em produção |
| P02 | `ui/Indicators.tsx`, `apps/api/src/api.ts` | Implementado; indicador sem fonte aparece como "—" (DEC-027) |
| P03/P04 | `ui/Lot.tsx` (terreno disponível, candidatura em análise, casa publicada, fotos quando a API devolve), `ui/Explore.tsx`, `scene/Props.tsx` (Lots) | Implementado; doação por ONG atrás de `DONATIONS_ENABLED` (IMPL-0023); fotos atrás de `NGO_PHOTOS_ENABLED` (IMPL-0018) |
| P05 | — | Não implementado: chat e texto livre são proibidos no protocolo de presença; sanções em OQ-11 |
| P06 | — | Não implementado: o protocolo de presença não retransmite emotes (IMPL-0008) |
| P07 | `ui/AvatarPanel.tsx`, `ui/AvatarPortrait.tsx`, `packages/shared/src/game/appearance.ts`, `scene/{models,Player}.tsx` | Implementado; aparência local ao navegador (IMPL-0026) |
| P08 | `ui/AvatarPanel.tsx` (aba "Visuais": cosméticos gratuitos por missão e nível) | Parcial: itens pagos exigem provedor de pagamento (PEN-004/PEN-006, IMPL-0002) |
| P09 | `ui/Games.tsx`, `ui/MemoryGame.tsx` | Parcial: só o Jogo da Memória; os demais jogos aguardam definição |
| P10 | `ui/MapPanel.tsx`, `game/map.ts` | Implementado com o plano em vigor (IMPL-0024); a planta futura segue PROPOSTA |
| P11 | `ui/Invite.tsx`, `lib/invite.ts` | Implementado para ONGs; "empresa" não existe no produto |
| P12 | `ui/NgoApplication.tsx` (4 etapas, situação), `apps/dash/src/ui/Applications.tsx` (análise administrativa, no painel `dash.*`, IMPL-0015), `apps/api/src/{ngo,admin}.ts`, `packages/shared/src/accounts/{validate,contract}.ts` | Implementado, desligado em produção (IMPL-0011); campos PROPOSTA; envio de logo e documentos atrás de `NGO_FILES_ENABLED`, desligado em produção (IMPL-0017, PEN-019) |
| P13 | `ui/Account.tsx` (chip "Entrar"/"@nickname", painel da conta, prévia pública), `lib/account.ts`, `apps/api/src/{auth,session,mail}.ts` | Implementado, desligado em produção (IMPL-0011); campos CONFIRMADOS (DEC-038), regras de formato PROPOSTA |
| P14 | `packages/shared/src/game/progress.ts`, `ui/Missions.tsx`, `apps/api/src/progress.ts` (XP no servidor) | Parcial — XP no servidor só com conta (desligado em produção) |
| P15 | `ui/Badges.tsx`, `packages/shared/src/donations/contract.ts`, `apps/api/src/donations.ts` | Implementado com as faixas PROPOSTA (PEN-026); `DONATIONS_ENABLED` desligado em produção |
