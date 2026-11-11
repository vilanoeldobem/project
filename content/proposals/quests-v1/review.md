# Revisão da proposta quests-v1 — missões e objetos

> **Status:** revisão read-only da PROPOSTA (DEC-039 a DEC-042; catálogo pendente em PEN-025).
> **Atualizado em:** 2026-11-11 · **Fonte de verdade:** os arquivos desta pasta e o código em
> `packages/shared/src/game/world.ts`, `packages/shared/src/game/progress.ts`,
> `apps/client/src/scene/gen/` e `apps/client/src/scene/`.

## 1. Resumo executivo

Auditoria completa dos artefatos de `content/proposals/quests-v1/`: [`README.md`](README.md),
[`quests.csv`](quests.csv), [`npcs.csv`](npcs.csv), [`dialogues.csv`](dialogues.csv),
[`story-bible.md`](story-bible.md), [`objects.csv`](objects.csv), [`objects.md`](objects.md),
[`object-prompts/README.md`](object-prompts/README.md) e os cinco prompts em [`object-prompts/`](object-prompts/).

Todas as invariantes estruturais exigidas passam: 15 missões, 5 NPCs fictícios, 5 cadeias de 3 missões
(convite → complicação → finale), trilhas 8/4/3, sete tipos de objetivo em uso, pré-requisitos lineares
presos à cadeia, 6 entregas cruzadas, 5 finales de 50 XP, XP total 465 (faixa 400–500), 8 objetos únicos
usados em 1 a 2 missões, 9 missões com objeto cobertas, e nenhuma regra inegociável de produto violada
(sem doação obrigatória, tempo online, diária/semanal/sequência, convite em massa, sorte, loot box,
compra, combate, ONG ou pessoa real, nem nomes da equipe).

Foram encontrados e **corrigidos** três desvios: a contagem `quests_with_object` do validador de objetos
(8 em vez de 9), a posição sugerida de `pond-keeper` a 4,41 u do lote `plaza-08` (abaixo da margem de
5,5 u usada por `motion.test.ts`) e a ausência de `validate-objects.mjs` na seção de validação do
`README.md`. As demais ressalvas são riscos de engenharia já implícitos nos `status_mecanica` da própria
proposta: direção dos pontos cardeais do trenó, motor de progresso para minijogos, painel de doação
físico, dependência de ONG publicada e os quatro geradores ainda `pending`.

Único gerador implementado: `quest-reindeer-bell` em `apps/client/src/scene/gen/quest-items.ts`
(`status_build: done`), registrado em `QUEST_ITEMS` e em `GENERATORS`
(`apps/client/src/scene/gen/catalog.ts`). Os outros quatro objetos `new` continuam `pending`.

## 2. Veredito

**Com ressalvas** — pronto para piloto com ressalvas.

Nenhum bloqueio de produto, de privacidade (LGPD / ECA Digital) ou de dinheiro falso foi encontrado, e
os dois validadores e a suíte de geradores passam. O que separa a proposta de um piloto jogável não é
conteúdo, e sim implementação pendente declarada na própria proposta: motor de diálogo/turn-in entre
NPCs, rastreio de visita/leitura, interação com adereços e os quatro geradores 3D `pending`. O piloto
pode começar pelas 3 missões `existing` apenas se o roteamento de eventos de minijogo por missão ativa
existir (primeiro risco da tabela) e as 3 `partial` receberem o rastreio mínimo.

## 3. Bloqueios, riscos e perguntas

| Tipo | Severidade | Arquivo | Descrição | Correção sugerida / Decisão | Status |
|---|---|---|---|---|---|
| Correção | Média | [`validate-objects.mjs:214`](validate-objects.mjs) | `quests_with_object` imprimia `questObjects.size` (8 objetos únicos, chave = `objeto_id`) em vez do número de missões com objeto (`objectIdOfQuest.size`, chave = `missao_id`), contradizendo `objects.md` §1 ("9 linhas"). | Linha alterada para `console.log(\`quests_with_object=${objectIdOfQuest.size} missions=${quests.rows.length}\`);` | **Corrigido** |
| Correção | Média | [`npcs.csv:5`](npcs.csv) | Posição sugerida de Aurora `(24.5, -7)` ficava a 4,41 u do centro do lote `plaza-08 (20.33, -8.42)`, abaixo da margem de 5,5 u verificada em `packages/shared/src/game/motion.test.ts` para elementos posicionados no mundo. | Posição alterada para `(24.5, -2.5)`: 7,24 u de `plaza-08`, 11,69 u de `plaza-01`, 4,27 u do centro do `POND (28.5, -4, raio 3.2)` — fora da água e da margem dos lotes. | **Corrigido** |
| Correção | Baixa | [`README.md:72-82`](README.md) | Seção "Validação" citava só `validate-quests.mjs`, omitindo `validate-objects.mjs`, `objects.csv`, `objects.md` e a fila `object-prompts/`. | Seção atualizada com `node validate-objects.mjs`, o escopo (9 missões / 8 objetos, orçamentos, coerência de status) e link para este relatório. | **Corrigido** |
| Risco | Alta | [`quests.csv:3,7,9`](quests.csv) · `apps/client/src/ui/MemoryGame.tsx:41` · `packages/shared/src/game/progress.ts:56-60` | As missões `route-memory-game`, `market-lucky-game` e `letter-pairs-game` são `status_mecanica: existing` por reusarem `play-memory`, mas o jogo hoje chama `record("play-memory", "win")` com `eventId` fixo `"win"` (idempotente: vale uma vez só) e `applyEvent` não conhece missão ativa, pré-requisito nem turn-in. Com a proposta, uma única vitória não pode concluir 3 missões distintas nem separar "objetivo cumprido" de "entregue ao NPC". | No motor de quests: emitir um evento por partida vencida (`eventId` por vitória, ex. contador incremental) roteado só para a missão ativa em andamento, e modelar `objective_done` → `turned_in` com o NPC de entrega. Sem isso, as 3 missões devem passar a `new`. | Aberto |
| Risco | Alta | [`quests.csv:11-12`](quests.csv) · [`npcs.csv:2`](npcs.csv) · [`dialogues.csv`](dialogues.csv) · `packages/shared/src/game/world.ts:92,147` · `apps/client/src/scene/Player.tsx:16,23-26` | O trenó (`SLEIGH (-4, 30.5)`) e o trenó pequeno (`sled` em `(2.5, 27)`) estão em `+z`, mas todas as falas dizem "ao norte". O eixo x confere com a copy (`market-west` em `x = -20.5` é o mercado oeste; `POND`/pinheiros em `x > 0` são o leste), mas no eixo z a câmera fica em `avatar + (0, 24, 21)` e `KeyW`/`ArrowUp` movem para `-z`: na tela, `-z` é "para cima" (norte) e `+z` é "para baixo" (sul). O jogador que seguir "ao norte" caminha para o lado oposto ao trenó. | Ao fechar o layout em PEN-017, mover `SLEIGH` e `kids-sled` para `-z` (ou corrigir a copy direcional para "ao sul"). Não alterado nesta revisão: `world.ts` é layout do produto e a proposta é PROPOSTA. | Aberto |
| Risco | Média | [`objects.csv:8`](objects.csv) · `apps/client/src/scene/Props.tsx:17-25` | `donation-panel` prevê um atril 3D (`quest-donation-panel`, `world_prop`, interação `inspect`) junto à grande árvore, mas hoje o clique é na própria `ChristmasTree`, que abre `{ kind: "donation" }`; não existe modelo físico nem evento de leitura. | Fazer o atril e a árvore abrirem o mesmo modal (`ui/Donation.tsx`) e emitir o evento de leitura da missão `donation-promise-reading` quando ela estiver ativa. | Aberto |
| Risco | Média | [`quests.csv:10`](quests.csv) (linha de `newest-house-visit`) | A missão exige terreno com ONG `published` (`LOTS` + `lots[id].state === "published"` em `apps/client/src/scene/World.tsx:30-34`). Em produção as contas e a publicação de ONG estão desligadas (`ACCOUNTS_ENABLED = "false"`, IMPL-0011/DEC-037), então o ambiente pode não ter nenhuma casa publicada. | Manter a missão condicionada a ≥ 1 ONG publicada ou mostrar estado honesto no Caderno de Missões ("nenhuma casa publicada ainda") em vez de missão impossível. | Aberto |
| Risco | Média | [`objects.csv:3-4,8-9`](objects.csv) · [`object-prompts/`](object-prompts/README.md) | Só `reindeer-bell` está `done`; `lucky-charm`, `ornament-crate`, `donation-panel` e `story-page` seguem `pending`. A proposta não pode ser jogada com os objetos de cena até a fila 02–05 ser executada. | Executar `object-prompts/02` a `05` (contrato completo em cada prompt: função, id, categoria, orçamento, registro em `QUEST_ITEMS`/`catalog.ts`) antes de integrar as missões no cliente. | Aberto |
| Pergunta | Baixa | [`story-bible.md:90`](story-bible.md) | Como o Caderno de Missões (P14) mostra cadeias e pré-requisitos? O painel hoje (`apps/client/src/ui/Missions.tsx:15-36`) agrupa `MISSIONS` por trilha, sem noção de cadeia nem de pré-requisito. | Decidir no P14; até lá, agrupar por `cadeia_id` com bloqueio explícito do pré-requisito. | Aberto |
| Pergunta | Baixa | [`story-bible.md:91`](story-bible.md) | Finais de cadeia (50 XP) destravam cosméticos gratuitos? O catálogo atual (`packages/shared/src/game/cosmetics.ts`) libera só por missão ou nível. | Decidir no produto; a proposta não pode prometer recompensa não prevista pelo catálogo. | Aberto |
| Pergunta | Baixa | [`story-bible.md:92`](story-bible.md) | Qual é o gatilho exato de "ler" em `donation-promise-reading`, sem tempo mínimo nem contagem regressiva (doc 22)? | Aceitar a abertura do painel com confirmação explícita do jogador (botão "Entendi"), nunca por tempo de permanência. | Aberto |

## 4. Contagens verificadas

### 4.1 Missões, NPCs e cadeias

| Métrica | Verificado | Regra |
|---|---:|---|
| Missões | 15 | 15 |
| NPCs | 5 | 5 |
| Cadeias | 5 | 5 |
| Missões por cadeia | 3 em todas | 3 |
| Missões ativadas por NPC | 3 em todos | 3 |
| NPC com `gerador = villager` e `semente = npc_id` | 5/5 | 5/5 |
| Linhas de `dialogues.csv` casando com `quests.csv` | 15/15 | 15/15 |
| Pré-requisitos lineares (ordem 1 vazio; ordem n+1 = missão anterior) | 15/15 | linear |
| Entregas cruzadas (`npc_entrega` ≠ `npc_ativacao`) | 6 | ≥ 6 |
| Primeiras missões entregues no próprio ativador | 5/5 | 5/5 |
| Finales com 50 XP | 5/5 | 5/5 |
| XP total | 465 | 400–500 |
| XP por missão | {15, 20, 25, 30, 50} | valores permitidos |
| Nível estimado (`XP_PER_LEVEL = 100`) | 5 | — |

### 4.2 Trilhas, tipos e status

| Métrica | Verificado |
|---|---|
| Trilha `explore` | 8 |
| Trilha `play` | 4 |
| Trilha `causes` | 3 |
| Tipos de objetivo | `collect` 3, `minigame` 3, `deliver` 3, `interact` 2, `visit` 2, `talk` 1, `read` 1 (7 tipos, máx. 3 por tipo) |
| Status `existing` | 3 (`route-memory-game`, `market-lucky-game`, `letter-pairs-game`) |
| Status `partial` | 3 (`newest-house-visit`, `tree-promise-visit`, `donation-promise-reading`) |
| Status `new` | 9 |
| Cadeias com missão `play` | 4 |
| Cadeias com missão `causes` | 2 |

### 4.3 XP por cadeia

| Cadeia | NPC | Missões (XP) | Total |
|---|---|---|---:|
| `flight-night` | Baltazar | `harness-bells` (20) → `route-memory-game` (30) → `charm-for-the-flight` (50) | 100 |
| `market-opening` | Dona Filó | `market-invitations` (15) → `ornament-crates` (25) → `market-lucky-game` (50) | 90 |
| `undelivered-letters` | Seu Nivaldo | `frozen-mailbox` (15) → `letter-pairs-game` (30) → `newest-house-visit` (50) | 95 |
| `lake-lights` | Aurora | `lake-lanterns` (20) → `kids-sled-run` (25) → `lantern-for-the-flight` (50) | 95 |
| `village-story` | Dona Guida | `tree-promise-visit` (15) → `donation-promise-reading` (20) → `story-page-delivery` (50) | 85 |

### 4.4 Entregas cruzadas

| Missão | Ativação | Entrega |
|---|---|---|
| `route-memory-game` | `sleigh-keeper` | `postmaster` |
| `charm-for-the-flight` | `sleigh-keeper` | `storyteller` |
| `market-lucky-game` | `market-keeper` | `sleigh-keeper` |
| `newest-house-visit` | `postmaster` | `storyteller` |
| `lantern-for-the-flight` | `pond-keeper` | `sleigh-keeper` |
| `story-page-delivery` | `storyteller` | `postmaster` |

### 4.5 Objetos

| `objeto_id` | Tipo | `status_build` | Missões | `qtd_total` | Orçamento (voxels / faces) |
|---|---|---|---|---:|---|
| `reindeer-bell` | `quest_item` | `done` | 1 | 2 | 80 / 200 |
| `lucky-charm` | `quest_item` | `pending` | 1 | 1 | 80 / 200 |
| `ornament-crate` | `quest_item` | `pending` | 1 | 2 | 80 / 200 |
| `village-mailbox` | `world_prop` | `reuse` | 1 | 1 | 220 / 600 |
| `lake-lantern` | `quest_item` | `reuse` | 2 | 3 | 80 / 200 |
| `kids-sled` | `world_prop` | `reuse` | 1 | 1 | 220 / 600 |
| `donation-panel` | `world_prop` | `pending` | 1 | 0 | 220 / 600 |
| `story-page` | `quest_item` | `pending` | 1 | 1 | 80 / 200 |

| Métrica | Verificado | Regra |
|---|---:|---|
| Objetos únicos | 8 | 8–12 |
| Missões com objeto (`tipo_objeto` ≠ `none`) | 9 | todas cobertas |
| Uso por objeto | 1 (`lucky-charm`, `ornament-crate`, `village-mailbox`, `kids-sled`, `donation-panel`, `story-page`, `reindeer-bell`) ou 2 (`lake-lantern`) | 1–4 |
| `reuse` / `new` | 3 / 5 | — |
| Prompts em `object-prompts/` | 5 (numeração 01–05 sem buraco) | 1 por objeto `new`, nenhum para `reuse` |
| Prompt de parágrafo único, sem caracteres proibidos, com as 14 strings obrigatórias | 5/5 | contrato |
| Marcadores de preenchimento (TODO/TBD/lorem/placeholder/???) | 0 | 0 |

### 4.6 Restrições de produto

| Restrição | Resultado | Evidência |
|---|---|---|
| Doação obrigatória | Ausente | `tree-promise-visit` só visita a árvore; `donation-promise-reading` só lê o painel; nenhuma missão concede XP por doar. Fala de entrega de `donation-promise-reading` afirma que a doação global vai para uma única instituição e que brincar nunca é doar (DEC-010..013, DEC-029). |
| Tempo online / recompensa por permanência | Ausente | Nenhuma coluna ou fala mede tempo; `read` não usa timer (ver a pergunta sobre o gatilho de leitura). |
| Diária / semanal / sequência | Ausente | Nenhum `tipo_objetivo` ou campo de recorrência; "todo ano" em `market-lucky-game` descreve a tradição ficcional, não um ciclo de reset. |
| Convite em massa | Ausente | `market-invitations` é um aviso único dado a Seu Nivaldo dentro do mundo; não há compartilhamento externo nem referral. |
| Sorte como mecânica | Ausente | `lucky-charm` é item narrativo; `market-lucky-game` usa o jogo de pares — a ordem das cartas é sorteada, mas o resultado depende da memória e a recompensa não é aleatória. |
| Loot box / compra / combate | Ausentes | Nenhuma recompensa aleatória, loja ou ação de dano em `quests.csv`/`dialogues.csv`. |
| ONG, doador, parceiro ou pessoa real | Ausente | `newest-house-visit` diz "uma ONG publicada", sem nome; demais citam só moradores fictícios. |
| Nomes da equipe | Ausente | Nenhum nome próprio fora dos 5 NPCs fictícios. |
| Placeholders / texto de preenchimento | Ausente | Validadores varrem `TODO`, `TBD`, `lorem`, `placeholder`, `???`. |
| Limites de texto | OK | títulos ≤ 60, descrições ≤ 240, falas ≤ 180 caracteres (15/15 em cada). |

### 4.7 Conformidade com `world.ts`

| Local citado | Constante / símbolo | Confere |
|---|---|---|
| Praça central | `PLAZA_RADIUS = 12`, árvore na origem (`TREE_RADIUS = 3.5`) | Sim |
| Pinheiros da praça / leste | `PINES` (inclui `(26, 18)` e `(31, 7)`, citados em `lake-lanterns`) | Sim |
| Lago congelado | `POND { x: 28.5, z: -4, radius: 3.2 }` | Sim |
| Trenó do Noel | `SLEIGH { x: -4, z: 30.5 }` | Sim (posição); direção na tabela de riscos |
| Trenó pequeno | `PLACED_PROPS` → `sled`, semente `kids-sled`, `(2.5, 27)` | Sim |
| Caixa de correio | `mailbox`, semente `village-mail`, `(2.4, 12.6)` | Sim |
| Placa de boas-vindas | `signpost`, semente `welcome-sign`, `(-2.4, 12.6)` | Sim |
| Rua da Vila | `STREET_INNER = 13` … `STREET_OUTER = 17` (bate com a nota "anel entre 13 e 17") | Sim |
| Mercado oeste | `market-stall` `market-west` em `(-20.5, -2.4)` + `panettone-stand` | Sim |
| Terrenos do anel externo | `LOTS` com `LOT_RING = 22` | Sim |

Nenhum lugar inexistente em `world.ts` foi citado. As posições de NPC são sugestões PROPOSTA
(PEN-017) e não colidem com obstáculos do `OBSTACLES`; após a correção, a mais próxima de um lote é
`pond-keeper (24.5, -2.5)`, a 7,24 u de `plaza-08` (as demais ficam entre 8,60 u e 15,95 u).

## 5. O que não foi verificado

- **Inspeção visual em navegador real.** `node apps/client/scripts/gallery.mjs` não foi executado;
  nenhum modelo foi conferido a olho (só contrato de teste e orçamento).
- **Execução em tempo de jogo das 15 missões.** A proposta não tem runtime de NPC, diálogo, turn-in,
  coleta de itens de quest, rastreio de visita/leitura nem interação com adereços; nada disso foi
  exercitado.
- **Os quatro geradores `pending`** (`quest-lucky-charm`, `quest-ornament-crate`,
  `quest-donation-panel`, `quest-story-page`): não existem em `apps/client/src/scene/gen/quest-items.ts`.
- **Medidas de voxels/faces declaradas em `objects.md`** para as sementes `village-mail` (48/114),
  `lake-lantern` (78/162) e `kids-sled` (47/170): tomadas como declaradas, não remedidas nesta revisão
  (o teto de categoria é coberto por `gen.test.ts`).
- **Testes executados nesta revisão:** `node validate-quests.mjs` (OK, 15/5/5, XP 465),
  `node validate-objects.mjs` (OK, 8 objetos, 3 `reuse`, 5 `new`, 5 prompts, 9 missões com objeto) e
  `pnpm --filter @vila/client test` (5 arquivos, 124 testes passando).
