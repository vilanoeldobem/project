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
físico, dependência de ONG publicada e o runtime de interação com NPCs, itens e leitura.

Os cinco objetos `new` têm gerador em `apps/client/src/scene/gen/quest-items.ts` e estão `status_build:
done`: `quest-reindeer-bell`, `quest-lucky-charm`, `quest-ornament-crate`, `quest-donation-panel` e
`quest-story-page`, todos registrados em `QUEST_ITEMS` e em `GENERATORS`
(`apps/client/src/scene/gen/catalog.ts`). As receitas visuais pesquisadas estão em
[`object-references.md`](object-references.md). Máximos medidos na galeria de adereços, em 12 sementes de
teste e 8 sementes de galeria: 57/138, 50/108, 68/156, 77/196 e 47/130 (voxels/faces), dentro dos tetos
de 80/200 dos itens e 220/600 do adereço de mundo. Os três objetos `reuse` foram remedidos
(`village-mail` 48/114, `lake-lantern` 78/162, `kids-sled` 47/170) e mantiveram as sementes. O snapshot de
`gen.test.ts` mudou só nas cinco entradas de quest; as outras 20 entradas permaneceram idênticas.

## 2. Veredito

**Com ressalvas** — runtime implementado para avaliação local/dev; aprovação do conteúdo continua em PEN-025.

Nenhum bloqueio de produto, de privacidade (LGPD / ECA Digital) ou de dinheiro falso foi encontrado, e
os dois validadores e a suíte de geradores passam. O runtime declarado na proposta passou a existir atrás
de flags (`VITE_QUESTS_V1_ENABLED` / `?quests=1` no cliente, `QUESTS_V1_ENABLED` na API, ambos desligados
em produção): motor de diálogo/entrega entre NPCs, coleta de itens de quest, rastreio de visita/leitura,
interação com os adereços, Caderno de cadeias e roteamento do minijogo para a missão ativa. As 15 missões
foram exercitadas em navegador real por `apps/client/scripts/verify-quests.mjs`, e o XP no servidor reusa
`applyEvent` sem migration. O que separa a proposta de um piloto público é a decisão do responsável
(PEN-025) e o layout final (PEN-017/PEN-023), não mais a mecânica ausente.

## 3. Bloqueios, riscos e perguntas

| Tipo | Severidade | Arquivo | Descrição | Correção sugerida / Decisão | Status |
|---|---|---|---|---|---|
| Correção | Média | [`validate-objects.mjs:214`](validate-objects.mjs) | `quests_with_object` imprimia `questObjects.size` (8 objetos únicos, chave = `objeto_id`) em vez do número de missões com objeto (`objectIdOfQuest.size`, chave = `missao_id`), contradizendo `objects.md` §1 ("9 linhas"). | Linha alterada para `console.log(\`quests_with_object=${objectIdOfQuest.size} missions=${quests.rows.length}\`);` | **Corrigido** |
| Correção | Média | [`npcs.csv:5`](npcs.csv) | Posição sugerida de Aurora `(24.5, -7)` ficava a 4,41 u do centro do lote `plaza-08 (20.33, -8.42)`, abaixo da margem de 5,5 u verificada em `packages/shared/src/game/motion.test.ts` para elementos posicionados no mundo. | Posição alterada para `(24.5, -2.5)`: 7,24 u de `plaza-08`, 11,69 u de `plaza-01`, 4,27 u do centro do `POND (28.5, -4, raio 3.2)` — fora da água e da margem dos lotes. | **Corrigido** |
| Correção | Baixa | [`README.md:72-82`](README.md) | Seção "Validação" citava só `validate-quests.mjs`, omitindo `validate-objects.mjs`, `objects.csv`, `objects.md` e a fila `object-prompts/`. | Seção atualizada com `node validate-objects.mjs`, o escopo (9 missões / 8 objetos, orçamentos, coerência de status) e link para este relatório. | **Corrigido** |
| Risco | Alta | [`quests.csv:3,7,9`](quests.csv) · `apps/client/src/ui/MemoryGame.tsx:41` · `packages/shared/src/game/progress.ts:56-60` | As missões `route-memory-game`, `market-lucky-game` e `letter-pairs-game` são `status_mecanica: existing` por reusarem `play-memory`, mas o jogo hoje chama `record("play-memory", "win")` com `eventId` fixo `"win"` (idempotente: vale uma vez só) e `applyEvent` não conhece missão ativa, pré-requisito nem turn-in. Com a proposta, uma única vitória não pode concluir 3 missões distintas nem separar "objetivo cumprido" de "entregue ao NPC". | Resolvido sem ids dinâmicos: `MemoryGame` continua gravando `play-memory:win` e, com a flag ligada, grava `memory-win` **apenas** na missão ativa de minijogo (no máximo uma pela regra de uma missão ativa). O motor separa objetivo de `turn-in` e o XP entra só na entrega. | **Corrigido** |
| Risco | Alta | [`quests.csv:11-12`](quests.csv) · [`npcs.csv:2`](npcs.csv) · [`dialogues.csv`](dialogues.csv) · `packages/shared/src/game/world.ts:92,147` · `apps/client/src/scene/Player.tsx:16,23-26` | O trenó (`SLEIGH (-4, 30.5)`) e o trenó pequeno (`sled` em `(2.5, 27)`) estão em `+z`, mas todas as falas dizem "ao norte". O eixo x confere com a copy (`market-west` em `x = -20.5` é o mercado oeste; `POND`/pinheiros em `x > 0` são o leste), mas no eixo z a câmera fica em `avatar + (0, 24, 21)` e `KeyW`/`ArrowUp` movem para `-z`: na tela, `-z` é "para cima" (norte) e `+z` é "para baixo" (sul). O jogador que seguir "ao norte" caminha para o lado oposto ao trenó. | Copy corrigida para "ao sul" em `quests.csv`, `npcs.csv`, `story-bible.md` e `objects.md`; a fala do "céu do norte" virou "céu da noite"; `validate-quests.mjs` passa a falhar se `ao norte` voltar aos CSVs. As posições (`SLEIGH`, `kids-sled`) **não** mudaram: decidir o layout final em PEN-017/PEN-023. | **Corrigido** (copy; layout em PEN-017/PEN-023) |
| Risco | Média | [`objects.csv:8`](objects.csv) · `apps/client/src/scene/Props.tsx:17-25` | `donation-panel` prevê um atril 3D (`quest-donation-panel`, `world_prop`, interação `inspect`) junto à grande árvore, mas hoje o clique é na própria `ChristmasTree`, que abre `{ kind: "donation" }`; não existe modelo físico nem evento de leitura. | `DonationLectern` monta o atril em `DONATION_PANEL (4.6, 6.4)` com obstáculo, sempre visível; ele e a árvore abrem o mesmo `ui/Donation.tsx`, e `donation-promise-reading` grava `read-confirm` só pelo botão "Entendi, li a promessa". | **Corrigido** |
| Risco | Média | [`quests.csv:10`](quests.csv) (linha de `newest-house-visit`) | A missão exige terreno com ONG `published` (`LOTS` + `lots[id].state === "published"` em `apps/client/src/scene/World.tsx:30-34`). Em produção as contas e a publicação de ONG estão desligadas (`ACCOUNTS_ENABLED = "false"`, IMPL-0011/DEC-037), então o ambiente pode não ter nenhuma casa publicada. | `needsPublishedLot`: sem casa publicada, o Caderno mostra "Aguardando uma casa publicada" e o aceite fica desabilitado com "Nenhuma casa publicada ainda"; o resto da cadeia continua jogável. Com casa publicada, abrir o painel do terreno grava o id. Nenhuma ONG é inventada. | **Corrigido** |
| Risco | Média | [`objects.csv:3-4,8-9`](objects.csv) · [`object-prompts/`](object-prompts/README.md) | Antes só `reindeer-bell` estava `done`; `lucky-charm`, `ornament-crate`, `donation-panel` e `story-page` estavam `pending`, e a proposta não podia ser jogada com os objetos de cena. | Os cinco geradores foram implementados em `quest-items.ts` e marcados `done` em `objects.csv`/`objects.md`; máximos medidos 57/138, 50/108, 68/156, 77/196 e 47/130 (voxels/faces), todos dentro do teto. O runtime de quests usa os modelos na cena atrás das flags. | **Corrigido** |
| Pergunta | Baixa | [`story-bible.md:90`](story-bible.md) | Como o Caderno de Missões (P14) mostra cadeias e pré-requisitos? O painel hoje (`apps/client/src/ui/Missions.tsx:15-36`) agrupa `MISSIONS` por trilha, sem noção de cadeia nem de pré-requisito. | Com a flag ligada, o Caderno mantém as três trilhas e acrescenta uma seção por cadeia (ordem, estado textual, ativador → destinatário, bolsa), sem tocar no contador das quatro missões. A apresentação final continua sujeita a PEN-025/P14. | **Corrigido** (atrás de flag) |
| Pergunta | Baixa | [`story-bible.md:91`](story-bible.md) | Finais de cadeia (50 XP) destravam cosméticos gratuitos? O catálogo atual (`packages/shared/src/game/cosmetics.ts`) libera só por missão ou nível. | Decidir no produto; a proposta não pode prometer recompensa não prevista pelo catálogo. | Aberto |
| Pergunta | Baixa | [`story-bible.md:92`](story-bible.md) | Qual é o gatilho exato de "ler" em `donation-promise-reading`, sem tempo mínimo nem contagem regressiva (doc 22)? | Botão explícito "Entendi, li a promessa" no painel de doação: grava `read-confirm` e mostra "Agora procure Dona Guida."; abrir, rolar ou permanecer no painel nunca grava. | **Corrigido** |

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

| `objeto_id` | Tipo | `status_build` | Missões | `qtd_total` | Orçamento (voxels / faces) | Medido (máx.) |
|---|---|---|---|---:|---|---|
| `reindeer-bell` | `quest_item` | `done` | 1 | 2 | 80 / 200 | 57 / 138 |
| `lucky-charm` | `quest_item` | `done` | 1 | 1 | 80 / 200 | 50 / 108 |
| `ornament-crate` | `quest_item` | `done` | 1 | 2 | 80 / 200 | 68 / 156 |
| `village-mailbox` | `world_prop` | `reuse` | 1 | 1 | 220 / 600 | 48 / 114 |
| `lake-lantern` | `quest_item` | `reuse` | 2 | 3 | 80 / 200 | 78 / 162 |
| `kids-sled` | `world_prop` | `reuse` | 1 | 1 | 220 / 600 | 47 / 170 |
| `donation-panel` | `world_prop` | `done` | 1 | 0 | 220 / 600 | 77 / 196 |
| `story-page` | `quest_item` | `done` | 1 | 1 | 80 / 200 | 47 / 130 |

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

## 5. O que foi e o que não foi verificado

**Verificado nesta revisão**

- **Geradores dos cinco objetos `new`**: implementados em `apps/client/src/scene/gen/quest-items.ts` e
  conferidos na galeria real de adereços. Máximos medidos em 12 sementes de teste e 8 sementes de galeria:
  `quest-reindeer-bell` 57/138, `quest-lucky-charm` 50/108, `quest-ornament-crate` 68/156,
  `quest-donation-panel` 77/196 e `quest-story-page` 47/130 (voxels/faces). Todos determinísticos, com base
  em `y = 0`, coordenadas inteiras, 11–12 variantes distintas em 12 sementes e sem `Math.random`.
- **Objetos `reuse` remedidos**: `village-mail` 48/114, `lake-lantern` 78/162 e `kids-sled` 47/170; as
  sementes continuam as mesmas de `objects.csv` e de `PLACED_PROPS`.
- **Inspeção visual em navegador real**: `pnpm --filter @vila/client dev` em `http://localhost:5174`
  (a porta 5173 estava ocupada) e `node apps/client/scripts/gallery.mjs http://localhost:5174 props`;
  capturas em `apps/client/verify-output/gallery-props.png`, `gallery-props-quests.png`,
  `gallery-props-bells-charms.png` e `gallery-props-panels-pages.png`. O painel de doação foi refeito depois
  da primeira captura porque as colunas passavam da prancha e o móvel lia como banco; a página foi refeita
  porque a fita em cruz e o debruado dourado nas bordas levantadas liam como presente. Servidor encerrado.
- **Testes e build**: `pnpm --filter @vila/client typecheck`, `pnpm --filter @vila/client test`
  (5 arquivos, 144 testes) e `pnpm --filter @vila/client build` passam; o snapshot mudou só nas cinco
  entradas de quest.
- **Validadores**: `node validate-quests.mjs` (OK, 15/5/5, XP 465) e `node validate-objects.mjs`
  (OK, 8 objetos, 3 `reuse`, 5 `new`, 5 prompts, 9 missões com objeto).

**Não verificado**

- **Aprovação do responsável (PEN-025):** catálogo, valores de XP, nomes e falas dos cinco NPCs, visuais e
  apresentação final no Caderno continuam PROPOSTA; as flags ficam desligadas até a decisão.
- **Posição final de NPCs, pontos de coleta e atril**: continuam sugestões PROPOSTA dependentes de
  PEN-017/PEN-023. As folgas atuais são verificadas em `motion.test.ts`, mas mover peças do layout muda esses
  números.
- **Medição em GPU real**: a galeria e a verificação rodam com renderização por software no Chromium; custo de
  quadro em aparelho real não foi medido.
