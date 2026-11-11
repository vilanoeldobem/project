# Missões da Vila (quests-v1)

> **Status:** Implementado no cliente, na API e no código compartilhado, atrás de flags; conteúdo **PROPOSTA**
> (DEC-039 a DEC-042; catálogo pendente em PEN-025) · **Versão do software:** 0.4.0 · **Schema D1:** v5 ·
> **Atualizado em:** 2026-11-11
> **Fonte de verdade:** `packages/shared/src/game/quests.ts`, `packages/shared/src/game/progress.ts`,
> `packages/shared/src/game/world.ts`, `apps/client/src/{game,scene,ui}`, `apps/api/src/progress.ts`;
> conteúdo em `content/proposals/quests-v1/` (PROPOSTA).

O runtime de `quests-v1` leva ao jogo as 15 missões narrativas da [proposta](../../content/proposals/quests-v1/README.md)
(cinco cadeias de três missões). Nada aqui é decisão de produto: o catálogo, os XP, os cinco moradores fictícios e
os visuais continuam pendentes em **PEN-025**. Em produção tudo fica desligado; nada muda para quem joga sem as flags.

## 1. Flags

| Lado | Chave | Efeito |
|---|---|---|
| Cliente | `VITE_QUESTS_V1_ENABLED=true` (build) | Monta NPCs, itens de quest e o Caderno de cadeias |
| Cliente | `?quests=1` (só `localhost`/`127.0.0.1` ou build de desenvolvimento) | O mesmo, para verificação local |
| API | `QUESTS_V1_ENABLED=false` em `apps/api/wrangler.jsonc` (produção e staging) | Eventos de quest recusados com `400 bad_events` |
| API | `--var QUESTS_V1_ENABLED:true` no script `dev` | `:8787` local aceita e grava eventos de quest |
| API | `GET /config` → `{accounts, quests}` | O cliente e os scripts leem a bandeira do servidor |

As quatro missões rápidas (`explore-gifts`, `play-memory`, `causes-visit-lot`, `causes-global-donation`) continuam
iguais e **sempre** aceitas pela API, com ou sem a flag.

## 2. Catálogo

| Cadeia | Ordem | `missao_id` | Tipo | Ativação → entrega | XP |
|---|---:|---|---|---|---:|
| A Noite de Voo (`flight-night`) | 1 | `harness-bells` | collect | Baltazar → Baltazar | 20 |
| | 2 | `route-memory-game` | minigame | Baltazar → Seu Nivaldo | 30 |
| | 3 | `charm-for-the-flight` | deliver | Baltazar → Dona Guida | 50 |
| A inauguração da barraca (`market-opening`) | 1 | `market-invitations` | talk | Dona Filó → Dona Filó | 15 |
| | 2 | `ornament-crates` | collect | Dona Filó → Dona Filó | 25 |
| | 3 | `market-lucky-game` | minigame | Dona Filó → Baltazar | 50 |
| As cartas que ficaram (`undelivered-letters`) | 1 | `frozen-mailbox` | interact | Seu Nivaldo → Seu Nivaldo | 15 |
| | 2 | `letter-pairs-game` | minigame | Seu Nivaldo → Seu Nivaldo | 30 |
| | 3 | `newest-house-visit` | visit | Seu Nivaldo → Dona Guida | 50 |
| A noite das luzes do lago (`lake-lights`) | 1 | `lake-lanterns` | collect | Aurora → Aurora | 20 |
| | 2 | `kids-sled-run` | interact | Aurora → Aurora | 25 |
| | 3 | `lantern-for-the-flight` | deliver | Aurora → Baltazar | 50 |
| O livro da Vila (`village-story`) | 1 | `tree-promise-visit` | visit | Dona Guida → Dona Guida | 15 |
| | 2 | `donation-promise-reading` | read | Dona Guida → Dona Guida | 20 |
| | 3 | `story-page-delivery` | deliver | Dona Guida → Seu Nivaldo | 50 |

Total: **465 XP** de quest (mais os 110 XP das quatro missões rápidas). Níveis continuam
`floor(xp / 100) + 1` (`XP_PER_LEVEL = 100`); a soma leva ao nível 5.

## 3. Máquina de estados

`questState(progress, questId)` devolve, nesta ordem de verificação:

| Estado | Regra |
|---|---|
| `completed` | `progress.completed[questId]` |
| `locked` | existe `prerequisiteId` e ele ainda não está concluído |
| `available` | `progress.seen["<id>:accept"]` ausente |
| `ready_to_turn_in` | missão `deliver` logo após o `accept`, ou todos os ids de objetivo vistos |
| `active` | aceita, com objetivos pendentes |

`activeQuest(progress)` devolve a primeira missão em `active` ou `ready_to_turn_in`; `canAccept` exige `available`
e nenhuma outra em andamento. As funções são puras e usadas pelo cliente e pela API.

**Entregas (`deliver`)** ficam prontas ao aceitar: o item existe por derivação (`activeInventory`), sem campo novo
no progresso. `objectiveEventIds` é vazio nas três entregas.

## 4. Ids de evento

Toda missão aceita `accept` e `turn-in`; os objetivos usam ids estáveis:

| Missão | Objetivos |
|---|---|
| `harness-bells` | `bell-pine-north`, `bell-pine-east` |
| `route-memory-game`, `market-lucky-game`, `letter-pairs-game` | `memory-win` |
| `charm-for-the-flight`, `lantern-for-the-flight`, `story-page-delivery` | — (prontas ao aceitar) |
| `market-invitations` | `talk-postmaster` |
| `ornament-crates` | `crate-street`, `crate-market` |
| `frozen-mailbox` | `mailbox-open` |
| `newest-house-visit` | id do terreno publicado (`plaza-01`…`plaza-08`) |
| `lake-lanterns` | `lantern-lake-1`, `lantern-lake-2` |
| `kids-sled-run` | `sled-ride` |
| `tree-promise-visit` | `tree` |
| `donation-promise-reading` | `read-confirm` |

`applyEvent` grava a chave `<missao>:<evento>` apenas quando a transição é válida; evento fora de hora não entra em
`seen` (nada de pré-coleta) e o XP só é somado no `turn-in`, uma vez. O replay é comutativo porque os contadores são
recalculados a partir de `seen`.

## 5. Um minijogo, uma missão ativa

Uma vitória no Jogo da Memória grava `play-memory:win` (comportamento antigo, inalterado) e, com as quests ligadas,
`memory-win` **apenas** na missão ativa cujo `objectiveType` é `minigame` (no máximo uma pela regra de uma missão
ativa). Sem missão de minijogo ativa, nada novo é gravado. O mesmo vale para o restante: aceitar uma segunda missão é
recusado no motor e a interface explica **Conclua a missão atual primeiro**.

## 6. Mundo (`packages/shared/src/game/world.ts`)

| NPC | Papel | Posição | Semente |
|---|---|---|---|
| Baltazar (`sleigh-keeper`) | Guardião do trenó do Noel | `(-2.5, 28.5)` | `sleigh-keeper` |
| Dona Filó (`market-keeper`) | Mercadora do mercado oeste | `(-18.6, 0)` | `market-keeper` |
| Seu Nivaldo (`postmaster`) | Carteiro da Vila | `(4.5, 11.8)` | `postmaster` |
| Aurora (`pond-keeper`) | Vigia do lago congelado | `(24.5, -2.5)` | `pond-keeper` |
| Dona Guida (`storyteller`) | Contadora de histórias | `(5, 4)` | `storyteller` |

- Os cinco usam o gerador `villager` com semente igual ao `npc_id` e colidem com raio `0.5`, como os moradores
  decorativos. Posições são sugestão PROPOSTA (layout final em PEN-017/PEN-023).
- `QUEST_SPAWNS` (coleta por proximidade, raio `1.4`): dois sinos, duas caixas de enfeites, duas lanternas do lago.
- `QUEST_INTERACTIONS`: `mailbox-open` (raio `3.5`) e `sled-ride` (raio `3.5`).
- A câmera faz `-z` ser o topo da tela (norte) e `+z` a base (sul): o trenó e o trenó pequeno estão **ao sul**, e a
  copy foi corrigida para "ao sul". Mover as peças continua sendo PEN-017/PEN-023.
- `?` sobre um NPC = missão pronta para entregar; `!` = missão disponível; `...` = missão daquele NPC em andamento;
  o nome sozinho = conversa neutra. O sinal nunca depende de cor.

### Posições (fixadas nesta fatia)

As tabelas abaixo repetem `world.ts` e são conferidas por um teste de coordenadas exatas em
`packages/shared/src/game/motion.test.ts`, ao lado das folgas. Mudar uma peça de lugar passa a exigir uma alteração
deliberada no teste, não pode ser um deslize.

| NPC (`NPCS`, colisão `r: 0.5`) | `id` | `x` | `z` | `rot` |
|---|---|---:|---:|---|
| Baltazar | `sleigh-keeper` | `-2.5` | `28.5` | `Math.atan2(2.5, -28.5)` |
| Dona Filó | `market-keeper` | `-18.6` | `0` | `Math.atan2(18.6, 0)` |
| Seu Nivaldo | `postmaster` | `4.5` | `11.8` | `Math.atan2(-4.5, -11.8)` |
| Aurora | `pond-keeper` | `24.5` | `-2.5` | `Math.atan2(-24.5, 2.5)` |
| Dona Guida | `storyteller` | `5` | `4` | `Math.atan2(-5, -4)` |

| Coleta (`QUEST_SPAWNS`, raio de coleta `1.4`, sem colisor) | `questId` | `objectId` | `x` | `z` |
|---|---|---|---:|---:|
| `bell-pine-north` | `harness-bells` | `reindeer-bell` | `-10` | `-12.4` |
| `bell-pine-east` | `harness-bells` | `reindeer-bell` | `12.2` | `9.5` |
| `crate-street` | `ornament-crates` | `ornament-crate` | `-14.5` | `8.6` |
| `crate-market` | `ornament-crates` | `ornament-crate` | `-16.8` | `-3.6` |
| `lantern-lake-1` | `lake-lanterns` | `lake-lantern` | `23.5` | `17` |
| `lantern-lake-2` | `lake-lanterns` | `lake-lantern` | `30.5` | `10` |

| Interação (`QUEST_INTERACTIONS`) | `questId` | `x` | `z` | `radius` |
|---|---|---:|---:|---:|
| `mailbox-open` | `frozen-mailbox` | `2.4` | `12.6` | `3.5` |
| `sled-ride` | `kids-sled-run` | `2.5` | `27` | `3.5` |

| Peça | `x` | `z` | `rot` | `r` |
|---|---:|---:|---|---:|
| `DONATION_PANEL` | `4.6` | `6.4` | `Math.atan2(SPAWN.x - 4.6, SPAWN.z - 6.4)` | `0.5` |

O layout final continua com **PEN-017** e **PEN-023**; nada aqui é decisão de produto. A copy **"ao sul"** pressupõe
o `+z` atual do trenó (`SLEIGH`) e do trenó pequeno (`kids-sled`). Mover qualquer peça exige, na mesma mudança:
(1) atualizar `packages/shared/src/game/world.ts`; (2) atualizar o teste de coordenadas exatas em
`packages/shared/src/game/motion.test.ts`; (3) atualizar os trajetos de aproximação em
`apps/client/scripts/verify-quests.mjs` (coletas atrás de pinheiros precisam de rota em etapas); e (4) rodar de novo
`content/proposals/quests-v1/validate-quests.mjs` (guarda cardinal) e decidir se a copy deve voltar a ser
**"ao norte"**.

## 7. Painel de doação e gatilho de leitura

- `DONATION_PANEL` fica em `(4.6, 6.4)`, virado para a chegada do spawn, com obstáculo `r: 0.5`. É um adereço
  **permanente** (ponto de doação global, DEC-026), montado mesmo com as quests desligadas, e usa o gerador
  `quest-donation-panel` com a semente `donation-panel`.
- A árvore e o atril abrem o **mesmo** painel `ui/Donation.tsx`. Nenhum texto é 3D.
- A missão `donation-promise-reading` avança só pelo botão explícito **Entendi, li a promessa**. Abrir o painel,
  rolar ou permanecer parado **nunca** grava `read-confirm` (sem cronômetro, sem tempo mínimo).
- O painel mantém o botão "Doar" desabilitado: sem contrato e provedor (PEN-004/PEN-006) nada simula pagamento.

## 8. Portão da casa publicada

`newest-house-visit` tem `needsPublishedLot: true`. Enquanto nenhum terreno tiver ONG `published` com `ngo_name`:

- o Caderno mostra **Aguardando uma casa publicada**;
- o botão "Aceitar missão" fica desabilitado com a nota **Nenhuma casa publicada ainda**;
- o resto da cadeia continua jogável.

Com uma casa publicada, abrir o painel do terreno durante a missão grava o id do terreno e a missão fica pronta para
entrega em Dona Guida. Nenhum nome de ONG é inventado nem mostrado fora do painel da casa publicada.

## 9. Progresso, API e dados pessoais

- O progresso continua em `Progress` (`vila.progress.v2` para visitante; conta no servidor). Nenhuma chave nova.
- `POST /progress/events` aceita até 50 eventos por requisição e 500 por conta; cada missão gasta de 2 a 4 eventos
  (o log completo tem cerca de 70). A gravação continua `INSERT OR IGNORE` em `progress_events`, cuja chave primária
  `(user_id, mission_id, event_id)` já garante idempotência.
- **Nenhuma migration, tabela ou coluna nova.** Nenhum texto livre, coordenada ou dado de dispositivo é enviado.
- Doação não dá XP de quest; jogar nunca é doar; nada aqui usa sorte, loot box, compra, tempo online, diária,
  sequência ou convite em massa.

## 10. Verificação

- `packages/shared/src/game/quests.test.ts`: catálogo, sincronia com os três CSVs, máquina de estados, regra de uma
  missão ativa, roteamento do minijogo, 465 XP e replay em qualquer ordem.
- `packages/shared/src/game/motion.test.ts`: folgas de NPCs, pontos de coleta e atril contra obstáculos, terrenos,
  lago, árvore e entre si.
- `apps/api/src/accounts.test.ts`: cadeia completa no servidor (100 XP), replay idempotente, evento desconhecido e
  bandeira desligada.
- `apps/client/scripts/verify-quests.mjs`: navegador real, `?quests=1`, 15 missões em ordem, capturas em
  `apps/client/verify-output/`.

### Verificação em aparelho real (responsável)

Os tempos de quadro do `verify.mjs` local vêm de renderização por software (SwiftShader), não de uma GPU de
celular: valem como sinal de regressão, não como desempenho real. Em aparelho real, o responsável deve abrir
`?quests=1&envDebug` num celular, anotar p50/p95 do quadro, chamadas de desenho e triângulos no dia e na noite, e
registrar os números medidos. Enquanto isso não acontece, o custo de DOM dos rótulos de NPC e do atril fica limitado
ao raio de `24 u` ao redor do avatar: fora dele o rótulo não é montado.

## Ver também

[api.md](api.md) · [architecture.md](architecture.md) · [content.md](content.md) · [storage.md](storage.md) ·
[`content/proposals/quests-v1/`](../../content/proposals/quests-v1/README.md)
