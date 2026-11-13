# Plano de piloto — `quests-v1` / cadeia `chain-01` (`flight-night`: A Noite de Voo)

> **Status:** PROPOSTA (DEC-039 a DEC-042; catálogo inicial pendente em PEN-025; layout final em PEN-017/PEN-023).
> **Escopo:** cadeia 1 (`flight-night` / `chain-01`), conduzida por Baltazar (`sleigh-keeper`), com entregas cruzadas em
> Seu Nivaldo (`postmaster`) e Dona Guida (`storyteller`).
> **Fonte de verdade:** [`quests.csv`](quests.csv), [`npcs.csv`](npcs.csv), [`dialogues.csv`](dialogues.csv),
> [`objects.md`](objects.md), [`story-bible.md`](story-bible.md), [`review.md`](review.md) e o código em
> `packages/shared/src/game/`, `apps/client/src/` e `apps/api/src/`.
> **Este documento é o plano do piloto da cadeia 1:** nenhum deploy, migration remota ou publicação acompanha a
> proposta. O runtime das 15 missões (todas as cadeias, não só `flight-night`) está implementado para avaliação
> local/dev atrás de flags (`VITE_QUESTS_V1_ENABLED` / `?quests=1` e `QUESTS_V1_ENABLED`), desligado em produção;
> os passos abaixo registram o desenho original e continuam válidos como contrato técnico.
> **Arte 3D:** os cinco objetos `new` da proposta já têm gerador (`status_build: done`), incluindo
> `quest-lucky-charm` (máximo 50/108 voxels e faces); a integração na cena e nas missões está no runtime
> descrito em [`docs/reference/quests.md`](../../docs/reference/quests.md), atrás das flags.

## Contexto

O piloto leva ao jogo a primeira cadeia de `quests-v1`: três missões encadeadas (`harness-bells` → `route-memory-game` →
`charm-for-the-flight`, 100 XP no total) sobre a arquitetura atual do monorepo (`packages/shared`, `apps/client`,
`apps/api`). As 4 missões hoje implementadas (`explore-gifts`, `play-memory`, `causes-visit-lot`,
`causes-global-donation`) continuam funcionando exatamente como estão, sem migração de schema no D1 e sem tocar em doação,
dinheiro ou dados pessoais. Todo o piloto fica atrás de uma feature flag desligada em produção até a decisão do responsável
(PEN-025).

## 1. Escopo da `chain-01` (`flight-night`)

| Ordem | `missao_id` | Título | Trilha | Objetivo | Objeto | Qtd | XP | Ativação | Entrega | Pré-requisito | Gerador 3D |
|---:|---|---|---|---|---|---:|---:|---|---|---|---|
| 1 | `harness-bells` | Sinos do arreio | `explore` | `collect` | `reindeer-bell` (`quest_item`) | 2 | 20 | `sleigh-keeper` (Baltazar) | `sleigh-keeper` (Baltazar) | — | `quest-reindeer-bell` (`done`) |
| 2 | `route-memory-game` | A rota na memória | `play` | `minigame` | `none` | 0 | 30 | `sleigh-keeper` (Baltazar) | `postmaster` (Seu Nivaldo) | `harness-bells` | — (reusa `MemoryGame.tsx`) |
| 3 | `charm-for-the-flight` | O patuá da Noite de Voo | `explore` | `deliver` | `lucky-charm` (`quest_item`) | 1 | 50 | `sleigh-keeper` (Baltazar) | `storyteller` (Dona Guida) | `route-memory-game` | `quest-lucky-charm` (`done`, 50/108) |

Textos de oferta e entrega: [`dialogues.csv`](dialogues.csv). Vozes e continuidade: [`story-bible.md`](story-bible.md).
Nenhuma fala cita ONG, doador, parceiro ou pessoa real; doação não aparece como objetivo e jogar nunca é doar.

## 2. Ordem de implementação (por comportamento)

Cada passo abaixo é independente dos seguintes e deixa `pnpm typecheck`, `pnpm test` e `pnpm build` verdes ao final.

### Passo 1 — Pré-requisito de conteúdo 3D: gerador `quest-lucky-charm` (concluído)

- **Estado:** `luckyCharm(seed: Seed): GenModel` já está implementado em
  `apps/client/src/scene/gen/quest-items.ts`, registrado em `QUEST_ITEMS` e em `GENERATORS`
  (`apps/client/src/scene/gen/catalog.ts`) e marcado `done` em `objects.csv`/`objects.md`.
- **Contrato cumprido:** `Rng(seed, "quest-lucky-charm")`, montagem por partes de
  `apps/client/src/scene/gen/parts.ts`, voxels inteiros, base em `y = 0` via `dedupe(ground(v))`,
  `size: 0.18`, apenas material `solid`, máximo medido de 50 voxels e 108 faces (teto 80/200) e 11 variantes
  distintas em 12 sementes, sem `Math.random`.
- **Visual:** saquinho bojudo com bochechas laterais, gargalo franzido por cordão duplo dourado, selo frontal,
  boca arrepiada sobre abertura escura, raminho de pinheiro e toque de neve. Receita em
  [`object-references.md`](object-references.md); contrato em
  [`object-prompts/02-lucky-charm.md`](object-prompts/02-lucky-charm.md).
- **O que falta para o piloto:** nada no modelo 3D; a integração à missão depende dos passos 2 a 7.

### Passo 2 — Modelo de dados da quest e máquina de estados pura, sem quebrar as 4 missões atuais

- **Alvo:** `packages/shared/src/game/progress.ts`.
- **Compatibilidade (não negociável):** `Mission`, `MISSIONS` (as 4 missões), `Progress`
  (`{ xp, counters, completed, seen }`), `EMPTY_PROGRESS`, `XP_PER_LEVEL = 100`, `levelOf` e `Track`/`TRACK_LABEL`
  permanecem com a mesma forma e o mesmo comportamento. Nenhuma assinatura existente muda; `applyEvent` só ganha um
  caminho novo.
- **Novos tipos:**
  ```ts
  export type ObjectiveType = "talk" | "collect" | "deliver" | "visit" | "read" | "minigame" | "interact";
  export type QuestState = "locked" | "available" | "active" | "ready_to_turn_in" | "completed";
  export type NpcId = "sleigh-keeper" | "market-keeper" | "postmaster" | "pond-keeper" | "storyteller";

  export interface Quest extends Mission {
    chainId: string;
    chainTitle: string;
    order: 1 | 2 | 3;
    description: string;
    objectiveType: ObjectiveType;
    objectKind: "quest_item" | "world_prop" | "none";
    objectId?: string;
    objectName?: string;
    giverNpcId: NpcId;
    turnInNpcId: NpcId;
    prerequisiteId?: string;
    dialogue: { offer: string; turnIn: string };
    objectiveEventIds: readonly string[];
  }

  export interface InventoryItem {
    objectId: string;
    name: string;
    count: number;
    target: number;
    questId: string;
  }
  ```
- **Catálogo `CHAIN_01_QUESTS: Quest[]`** (mesma trilha `Track` já existente):
  - `harness-bells`: `chainId: "flight-night"`, `chainTitle: "A Noite de Voo"`, `order: 1`, `target: 2`,
    `unit: "sinos"`, `xp: 20`, `giverNpcId: "sleigh-keeper"`, `turnInNpcId: "sleigh-keeper"`,
    `objectKind: "quest_item"`, `objectId: "reindeer-bell"`, `objectName: "Sino do arreio"`,
    `objectiveEventIds: ["bell-pine-north", "bell-pine-east"]`.
  - `route-memory-game`: `order: 2`, `target: 1`, `unit: "partida"`, `xp: 30`, `giverNpcId: "sleigh-keeper"`,
    `turnInNpcId: "postmaster"`, `prerequisiteId: "harness-bells"`, `objectKind: "none"`,
    `objectiveEventIds: ["memory-win"]`.
  - `charm-for-the-flight`: `order: 3`, `target: 1`, `unit: "patuá"`, `xp: 50`, `giverNpcId: "sleigh-keeper"`,
    `turnInNpcId: "storyteller"`, `prerequisiteId: "route-memory-game"`, `objectKind: "quest_item"`,
    `objectId: "lucky-charm"`, `objectName: "Patuá da sorte"`, `objectiveEventIds: ["accept"]` — em missão `deliver`,
    aceitar com o NPC ativador já coloca o item na bolsa e conta `1/1` para a entrega no `turnInNpcId`.
  - `description` recebe a coluna `descricao_missao` de `quests.csv`; `dialogue.offer`/`dialogue.turnIn` recebem
    `fala_oferta`/`fala_entrega` de `dialogues.csv` (ambas ≤ 180 caracteres, conforme os limites da proposta).
- **`questState(p: Progress, questId: string): QuestState`** (pura, sem efeito):
  1. `p.completed[questId]` → `"completed"`.
  2. `prerequisiteId` e `!p.completed[prerequisiteId]` → `"locked"`.
  3. `!p.seen[\`${questId}:accept\`]` → `"available"`.
  4. Contar `objectiveEventIds` marcados em `p.seen[\`${questId}:${eventId}\`]`; se `< target` → `"active"`.
  5. Caso contrário → `"ready_to_turn_in"`.
- **`applyEvent(p, missionId, eventId)`** ganha um segundo caminho; o primeiro (`MISSIONS`) fica literalmente igual:
  - Quest desconhecida em `CHAIN_01_QUESTS` → `{ progress: p }`.
  - `key = \`${missionId}:${eventId}\``; `p.seen[key]` ou `p.completed[missionId]` → `{ progress: p }` (idempotência).
  - `eventId` fora de `{"accept", "turn-in", ...quest.objectiveEventIds}` → `{ progress: p }`.
  - Novo `seen` = `{ ...p.seen, [key]: true }`; `count` = número de `objectiveEventIds` presentes no novo `seen`, limitado
    a `quest.target` (recontagem comutativa, para o replay do servidor tolerar eventos do mesmo lote em qualquer ordem).
  - `done` só é `true` quando `seen["<id>:accept"]`, `seen["<id>:turn-in"]` e `count >= quest.target` coexistem e o
    pré-requisito está concluído. A transição `false → true` acontece uma única vez (pois `completed[id]` passa a `true`):
    é o único ponto que soma `quest.xp` e devolve `completed: quest`.
- **`activeInventory(p: Progress): InventoryItem[]`** (inventário mínimo, derivado — nada novo é persistido):
  - Para cada `Quest` com `objectKind === "quest_item"`, estado `"active"` ou `"ready_to_turn_in"` e `p.counters[id] > 0`,
    devolve `{ objectId, name: objectName, count: p.counters[id], target, questId: id }`.
  - No `"turn-in"` o estado vira `"completed"` e o item sai da lista sozinho.

### Passo 3 — Persistência local e sincronização de XP no servidor (idempotente, crédito único, sem migration)

- **Alvo:** `apps/client/src/game/store.ts`, `apps/client/src/lib/account.ts`, `apps/api/src/progress.ts`,
  `apps/api/src/accounts.test.ts`.
- **Persistência local (visitante sem conta):** continua exclusivamente em `vila.progress.v2`
  (`apps/client/src/game/store.ts:27-45`). `accept`, coletas, `memory-win` e `turn-in` entram em `Progress.seen`/`counters`
  por `useVila.getState().record(questId, eventId)`; nenhuma chave nova de `localStorage`. Em `record`
  (`store.ts:117-130`): progresso intermediário é salvo quando `progressOwner === null`; ao concluir, dispara
  `missionDoneMessage(completed)` (toast com `+XP`), reavalia cosméticos liberados por nível/missão e emite
  `events.emit({ type: "mission", missionId: completed.id })`.
- **Migração visitante → conta (OQ-02, DEC-042):** `apps/client/src/lib/account.ts` já serializa todas as chaves de
  `progress.seen` (`seenEvents`), envia em lotes de 50 (`send`), mantém a fila `vila.pending.v1:<accountId>`
  (`loadPending`/`savePending`) e limpa `vila.progress.v2` no `clearGuest()` após migrar e no `signOut()`
  (`restoreGuest()`). Nada muda nesse fluxo: as quests aparecem como mais chaves `missao:evento`.
- **Servidor (`apps/api/src/progress.ts`):** acrescentar a `KNOWN_EVENTS` os `eventId`s que o jogo produz:
  ```ts
  "harness-bells": new Set(["accept", "bell-pine-north", "bell-pine-east", "turn-in"]),
  "route-memory-game": new Set(["accept", "memory-win", "turn-in"]),
  "charm-for-the-flight": new Set(["accept", "turn-in"]),
  ```
  - `isKnownEvent` continua barrando qualquer outro id (`400 bad_events`, nada gravado) e `MAX_EVENTS_PER_USER = 500`
    segue folgado: a cadeia inteira gasta 9 eventos.
  - **Crédito único:** `INSERT OR IGNORE` sobre `PRIMARY KEY (user_id, mission_id, event_id)` absorve reenvios; `loadProgress`
    refaz o progresso repetindo os eventos por `applyEvent`, e o XP da quest entra só no `turn-in` já gravado.
  - Nenhuma coluna, tabela ou migration nova: `progress_events` (`migrations/0004_accounts_ngo_applications.sql:37-44`)
    já guarda `(user_id, mission_id, event_id)`.
- **Teste existente a ajustar:** `knows the event ids of every mission`
  (`apps/api/src/accounts.test.ts:225-229`) passa a comparar `Object.keys(KNOWN_EVENTS).sort()` com
  `[...MISSIONS, ...CHAIN_01_QUESTS].map((m) => m.id).sort()`.

### Passo 4 — NPCs e pontos de coleta em `world.ts`, com o gerador `villager`

- **Alvo:** `packages/shared/src/game/world.ts`.
- **NPCs:** exportar `NpcPlacement` e `NPCS` (semente = id do NPC, como em [`npcs.csv`](npcs.csv)):
  ```ts
  export interface NpcPlacement {
    id: "sleigh-keeper" | "postmaster" | "storyteller";
    name: string;
    role: string;
    seed: string;
    x: number;
    z: number;
    rot: number;
  }

  export const NPCS: readonly NpcPlacement[] = [
    { id: "sleigh-keeper", name: "Baltazar", role: "Guardião do trenó do Noel", seed: "sleigh-keeper", x: -2.5, z: 28.5, rot: Math.atan2(2.5, -28.5) },
    { id: "postmaster", name: "Seu Nivaldo", role: "Carteiro da Vila", seed: "postmaster", x: 4.5, z: 11.8, rot: Math.atan2(-4.5, -11.8) },
    { id: "storyteller", name: "Dona Guida", role: "Contadora de histórias", seed: "storyteller", x: 5, z: 4, rot: Math.atan2(-5, -4) },
  ] as const;
  ```
  - **Colisão:** `...NPCS.map((n) => ({ x: n.x, z: n.z, r: 0.5 }))` em `OBSTACLES`, o mesmo raio dos `villager` de
    `CRITTERS` (`world.ts:198`).
  - **Folgas medidas contra `OBSTACLES`/`LOTS`/`SPAWN` reais:**
    - `sleigh-keeper (-2.5, 28.5)`: obstáculo mais próximo é a rena do trenó `(-2.8, 30.5, r: 1.1)` a `2.02 u`; lote mais
      próximo `plaza-03 (-8.42, 20.33)` a `10.09 u`; `SPAWN (0, 9)` a `19.66 u`.
    - `postmaster (4.5, 11.8)`: caixa de correio `(2.4, 12.6, r: 0.35)` a `2.25 u`; poste `(0, 12.2, r: 0.3)` a `4.52 u`;
      lote mais próximo `plaza-02 (8.42, 20.33)` a `9.39 u`; `SPAWN` a `5.30 u`; pinheiro `[10, 10]` a `5.79 u`.
    - `storyteller (5, 4)`: boneco de neve `(9.5, 4, r: 0.85)` a `4.50 u`; banco `(7.94, 7.94, r: 0.6)` a `4.92 u`; centro
      da árvore `(0, 0)` a `6.40 u` (obstáculo `r: 3.05`, então fora do raio da árvore); `SPAWN` a `7.07 u`; lote mais
      próximo `plaza-01 (20.33, 8.42)` a `15.95 u`; `7.77 u` do segmento reto `gift-bench (-10, 6) → gift-palm (9.5, -9.5)`
      usado por `motion.test.ts` e `verify.mjs`.
    - Nenhum par de NPCs se sobrepõe: a menor distância entre dois deles é `7.82 u` (`postmaster` ↔ `storyteller`).
- **Pontos de coleta dos sinos:** exportar
  ```ts
  export const BELL_SPAWNS = [
    { id: "bell-pine-north", questId: "harness-bells", objectId: "reindeer-bell", x: -10, z: -12.4 },
    { id: "bell-pine-east", questId: "harness-bells", objectId: "reindeer-bell", x: 12.2, z: 9.5 },
  ] as const;
  ```
  - `bell-pine-north (-10, -12.4)`: pinheiro `[-10, -10]` (`r: 1.6`) a `2.40 u` — o avatar alcança o sino a partir da borda
    do pinheiro (mantém `1.4 u` de raio de coleta); poste `(-8.63, -8.63)` a `4.01 u`; banco `(-7.94, -7.94)` a `4.91 u`;
    lote mais próximo `plaza-06 (-8.42, -20.33)` a `8.09 u`; `gift-bench` a `18.40 u`.
  - `bell-pine-east (12.2, 9.5)`: pinheiro `[10, 10]` (`r: 1.6`) a `2.26 u`; poste `(8.63, 8.63)` a `3.67 u`; banco
    `(7.94, 7.94)` a `4.54 u`; lote mais próximo `plaza-01` a `8.20 u`; `gift-street (0, 15)` a `13.38 u`; `SPAWN` a
    `12.21 u`.
  - Os dois pontos ficam fora dos três `GIFTS` existentes e não colidem com nada: a coleta é por proximidade, então o sino
    não precisa de colisor.

### Passo 5 — Feature flag (`quests-v1`), cliente e API

- **Alvo:** `apps/client/src/game/questsFlag.ts` (novo), `apps/api/src/api.ts`, `apps/api/wrangler.jsonc`,
  `apps/api/package.json`.
- **Cliente (`questsEnabled(): boolean`)** — verdadeiro apenas quando:
  1. `import.meta.env.VITE_QUESTS_V1_ENABLED === "true"`, **ou**
  2. `debugAllowed()` (já existente em `apps/client/src/environment/runtime.ts`) **e**
     `new URLSearchParams(location.search).get("quests") === "1"`.
  Em produção `VITE_QUESTS_V1_ENABLED` fica ausente e `debugAllowed()` é falso, então a proposta não aparece sem decisão do
  responsável.
- **API (`Env.QUESTS_V1_ENABLED`):**
  - `apps/api/src/api.ts`: campo `QUESTS_V1_ENABLED?: string` em `Env`; `isKnownEvent` só aceita ids de `CHAIN_01_QUESTS`
    quando `env.QUESTS_V1_ENABLED === "true"` (as 4 missões atuais continuam aceitas sempre, para não quebrar contas que já
    têm eventos).
  - `apps/api/wrangler.jsonc`: `"QUESTS_V1_ENABLED": "false"` em `vars` (produção desligada).
  - `apps/api/package.json` (`dev`) e `apps/api/src/accounts.test.ts` (`beforeEach`): `"QUESTS_V1_ENABLED": "true"`.
  - `GET /config` responde `{ accounts, quests }`, mantendo `accounts` como está; `quests` é `true` só com a flag ligada.
    O cliente lê o campo novo de forma opcional (`quests === true`), então uma API antiga continua funcionando.

### Passo 6 — NPCs na cena, marcadores, spawn/pickup dos sinos e roteamento do minijogo

- **Alvo:** `apps/client/src/scene/Props.tsx`, `apps/client/src/scene/World.tsx`, `apps/client/src/scene/Player.tsx`,
  `apps/client/src/ui/MemoryGame.tsx`.
- **NPCs e marcadores (`QuestNpcs` em `Props.tsx`):**
  - Montado em `World.tsx` dentro do `Suspense` existente, apenas se `questsEnabled()`.
  - Modelo por NPC: `useMemo(() => villager(npc.seed), [npc.seed])` de `apps/client/src/scene/gen/characters.ts`; `<group
    position={[npc.x, 0, npc.z]} rotation-y={npc.rot}>` com `<Voxels voxels={m.voxels} size={m.size} idle={m.idle}
    castShadow />` e `onClick` que abre `{ kind: "npc", npcId: npc.id }`.
  - Marcador curto com o `Label` existente (`Props.tsx:151-157`) em `y = 4.2`, calculado por `questState`:
    `"? " + npc.name` se há quest com `turnInNpcId === npc.id` em `ready_to_turn_in`; senão `"! " + npc.name` se há quest com
    `giverNpcId === npc.id` em `available`; senão `"… " + npc.name` se alguma quest da cadeia está `active` com esse NPC;
    senão só `npc.name`. Marcador é símbolo + nome, nunca depende de cor.
- **Sinos na cena (`QuestItems` em `Props.tsx`):**
  - Montado em `World.tsx` só com `questsEnabled()` e `questState(progress, "harness-bells") === "active"`.
  - Para cada `BELL_SPAWNS` sem `progress.seen["harness-bells:<spawn.id>"]`, renderiza `QuestBell` com
    `reindeerBell(spawn.id)` (`apps/client/src/scene/gen/quest-items.ts`), reusando a animação de rotação/flutuação de
    `Gift` (`Props.tsx:136-149`).
- **Pickup e alvo de interação (`Player.tsx`):**
  - No laço de passo fixo (`Player.tsx:114-137`), depois do bloco de `GIFTS` (que fica intacto): se `questsEnabled()` e
    `harness-bells` estiver `active`, cada spawn com `Math.hypot(spawn.x - b.x, spawn.z - b.z) < GIFT_RADIUS` (1.4) emite
    `events.emit({ type: "gift", x: spawn.x, z: spawn.z })`, chama `s.record("harness-bells", spawn.id)` e notifica
    `"Sino do arreio recolhido (1/2)"` / `"Sinos do arreio encontrados (2/2) · Volte a Baltazar"`.
  - Na detecção de alvo (`Player.tsx:179-184`), quando `questsEnabled()`, verifica `NPCS` dentro de `INTERACT_DISTANCE`
    (4.5) e escolhe o mais próximo antes da árvore e dos lotes, gravando `s.setNearby({ kind: "npc", npcId })`.
- **Vitória do Jogo da Memória (`MemoryGame.tsx:40-42`):**
  ```ts
  useEffect(() => {
    if (!won) return;
    record("play-memory", "win");
    if (questsEnabled() && questState(useVila.getState().progress, "route-memory-game") === "active") {
      record("route-memory-game", "memory-win");
      useVila.getState().notify("Rota memorizada! Procure Seu Nivaldo ao lado da caixa de correio.");
    }
  }, [won, record]);
  ```
  `play-memory` continua idêntico; `route-memory-game` só avança com uma vitória obtida enquanto a quest está `active`, e os
  30 XP continuam presos ao `turn-in` em Seu Nivaldo.

### Passo 7 — Diálogo de aceitar e entregar, HUD, bolsa de missão e Caderno de Quests

- **Alvo:** `apps/client/src/game/store.ts`, `apps/client/src/ui/NpcDialog.tsx` (novo), `apps/client/src/ui/Hud.tsx`,
  `apps/client/src/ui/Missions.tsx`, `apps/client/src/App.tsx`.
- **Store:** `Panel` ganha `| { kind: "npc"; npcId: NpcId }` e `Nearby` ganha `| { kind: "npc"; npcId: NpcId }`;
  `setNearby` (`store.ts:111-115`) compara também `npcId` para não re-renderizar a cada quadro.
- **HUD (`Hud.tsx`):** a tecla `E`/`Enter`/botão `.hud__action` passa a abrir `{ kind: "npc", npcId }` com o rótulo
  `"💬 Falar com " + npc.name`. Quando `questsEnabled()` e `activeInventory(progress)` não está vazio, um chip
  `<div className="hud__bag" role="status" aria-label="Bolsa de missão">` ao lado de `.hud__missions` lista os itens
  carregados (`🔔 Sino do arreio 1/2`, `🔔 Sino do arreio 2/2`, `✨ Patuá da sorte 1/1`).
- **`NpcDialog.tsx`** (montado em `App.tsx` quando `panel.kind === "npc"`, sobre o `Panel` existente com
  `kicker={npc.role}` e `title={npc.name}`), com prioridade:
  1. **Entrega** (`ready_to_turn_in` com `turnInNpcId === npcId`): título, `dialogue.turnIn`, item entregue
     (`"Entregando: 2× Sino do arreio"` ou `"Entregando: 1× Patuá da sorte"`) e botão `"Concluir missão (+${xp} XP)"`;
     ao clicar chama `record(quest.id, "turn-in")` e, se o mesmo NPC tiver a próxima missão já `available`, mostra a oferta
     dela em seguida; senão fecha.
  2. **Oferta** (`available` com `giverNpcId === npcId`): trilha (`TRACK_LABEL`), `dialogue.offer`, `description`,
     `+${xp} XP`, botão `"Aceitar missão"` (`record(quest.id, "accept")` + toast `Missão aceita: ${title}`; em
     `charm-for-the-flight` também `"Você recebeu: Patuá da sorte (leve a Dona Guida)"`) e `"Agora não"` (fecha).
  3. **Em andamento** (`active` com esse NPC como ativador ou entregador): título, `description`, progresso
     `${counters[id] ?? 0}/${target} ${unit}` e botão `"Continuar"`.
  4. **Neutro:** saudação curta na voz do morador (ver `story-bible.md`); com a cadeia concluída, agradece pela preparação da
     Noite de Voo. Nenhuma opção de doar, pagar ou sortear.
- **Caderno de Missões (`Missions.tsx`):** as três seções de trilha com as 4 missões de `MISSIONS`, o `LookPicker` e o
  `SavedWhere` ficam intactos. Com `questsEnabled()`, entra uma seção extra `<section className="track quest-chain">` com
  `<h3>Cadeia piloto · A Noite de Voo (PROPOSTA)</h3>`: as 3 missões em ordem, cada uma com estado textual
  (`🔒 Bloqueada · Requer: <título>`, `☆ Disponível com Baltazar`, `◐ Em andamento n/target unit`,
  `➜ Entregar a <NPC>`, `★ Concluída`), título, descrição, ativação → entrega e XP; e, se houver itens, a subseção
  `"Bolsa de Missão"` com `activeInventory(p)`.

## 3. Arquivos críticos e âncoras

| Arquivo | Símbolo / região | Por quê |
|---|---|---|
| `packages/shared/src/game/progress.ts:13-71` | `Mission`, `MISSIONS`, `Progress`, `applyEvent` | Recebe `Quest`/`CHAIN_01_QUESTS`/`questState`/`activeInventory` e o caminho de quest sem alterar o contrato das 4 missões. |
| `packages/shared/src/game/world.ts:99-199` | `CRITTERS`, `OBSTACLES` | Recebe `NPCS` (gerador `villager`, semente = id), os colisores `r: 0.5` e `BELL_SPAWNS` com as folgas medidas. |
| `apps/api/src/progress.ts:20-30` | `KNOWN_EVENTS`, `isKnownEvent` | Whitelist dos 9 `eventId`s da cadeia; é o que permite sincronizar com crédito único sem migration. |
| `apps/client/src/scene/Player.tsx:127-136,179-184` | laço de `GIFTS` e `setNearby` | Pickup dos sinos por proximidade e alvo de NPC sem tocar na lógica das 4 missões. |
| `apps/client/src/ui/Missions.tsx:9-40` | `Missions` | Seção da cadeia com estados, entrega cruzada e bolsa, preservando trilhas, cosméticos e aviso de onde o progresso é salvo. |

## 4. Verificação

### 4.1 Validadores da proposta (sem dependências)

```bash
node content/proposals/quests-v1/validate-quests.mjs
node content/proposals/quests-v1/validate-objects.mjs
```

Esperado: `OK: quests-v1 passes all structural checks` (`quests=15 npcs=5 chains=5 xpTotal=465`) e
`OK: quests-v1 objects pass all checks` (`objects=8 reuse=3 new=5 prompts=5`).

### 4.2 Testes puros

```bash
pnpm typecheck
pnpm test
pnpm build
```

Casos obrigatórios:

1. **Máquina de estados** (`packages/shared/src/game/progress.test.ts`), partindo de `EMPTY_PROGRESS`:
   - `harness-bells` `available`; `route-memory-game` e `charm-for-the-flight` `locked`; `activeInventory` vazio.
   - `accept` → `active`, `xp === 0`. Coletar `bell-pine-north` duas vezes → `counters["harness-bells"] === 1`,
     `activeInventory` com `{ objectId: "reindeer-bell", count: 1, target: 2 }`, `xp === 0`.
   - `turn-in` com `1/2` → ignorado (`completed` ausente, `xp === 0`).
   - Coletar `bell-pine-east` → `ready_to_turn_in`, `xp === 0`; `turn-in` → `completed`, `xp === 20`,
     `activeInventory` vazio, `route-memory-game` passa a `available`; repetir `turn-in` mantém `xp === 20`.
   - `accept` + `memory-win` → `ready_to_turn_in`, `xp === 20`; `turn-in` → `xp === 50`, `charm-for-the-flight`
     `available`; `accept` → `ready_to_turn_in` com `{ objectId: "lucky-charm", count: 1, target: 1 }`; `turn-in` →
     `xp === 100`, `levelOf(100) === 2`, bolsa vazia.
   - As 4 missões atuais continuam nos mesmos estados e XP (`explore-gifts` 30 após 2 presentes, `play-memory` 40,
     `causes-visit-lot` 20, `causes-global-donation` 20).
2. **Geometria** (`packages/shared/src/game/motion.test.ts`): cada `NPCS` e `BELL_SPAWNS` a mais de `o.r + MOTION.radius`
   de todo obstáculo, a mais de `5.5` dos 8 `LOTS`, fora do `POND` e do `SLEIGH`; os testes atuais de caminhada
   (`gift-bench` → `gift-palm`, `SPAWN`, lugares livres) continuam passando.
3. **Gerador** (`apps/client/src/scene/gen/gen.test.ts`): `quest-lucky-charm` dentro de 80 voxels / 200 faces, base `y = 0`,
   coordenadas inteiras, determinístico e com `>= 6` variantes em 12 sementes.
4. **API** (`apps/api/src/accounts.test.ts`): lote com os 9 eventos da cadeia → `200`, `progress.xp === 100`; reenvio do
   mesmo lote → `progress.xp === 100`; `eventId` inventado (`bell-fake`) ou flag desligada → `400 bad_events`.

### 4.3 Navegador real e regressão das 4 missões atuais

Pré-requisito, em três terminais:

```bash
pnpm db:migrate:local && pnpm --filter @vila/api dev      # :8787
pnpm --filter @vila/server dev                            # :8788
pnpm --filter @vila/client dev:worker                     # :8799
```

1. **Regressão sem a flag** (as 4 missões e as contas não podem mudar):
   ```bash
   node apps/client/scripts/verify.mjs http://localhost:8799
   node apps/client/scripts/verify-accounts.mjs
   ```
   Prova: os dois presentes viram `explore-gifts:gift-bench`/`explore-gifts:gift-palm`, o toast traz `Novo visual` com o
   `Gorro de tricô` desbloqueado, e a conta nova não herda progresso após logout (mensagens de erro do script em zero).
2. **Cadeia completa com a flag** em `http://localhost:8799/?quests=1`:
   - (a página abre direto na praça, IMPL-0022) `window.__vila.walkTo(-2.5, 27)` → botão `💬 Falar com Baltazar` → `Aceitar missão`; conferir
     `harness-bells` em andamento e o marcador `… Baltazar`.
   - `walkTo(-10, -12.4)` e `walkTo(12.2, 9.5)` → bolsa mostra `Sino do arreio 2/2` e os dois sinos somem da cena;
     `window.__vila.progress().counters["harness-bells"] === 2` e `xp === 0`.
   - Voltar a Baltazar → `Concluir missão (+20 XP)` → a oferta de `A rota na memória` aparece no mesmo painel → aceitar →
     vencer o Jogo da Memória → `walkTo(4.5, 11.8)` → `Concluir missão (+30 XP)` (total 50).
   - Voltar a Baltazar → aceitar `O patuá da Noite de Voo` (bolsa `✨ Patuá da sorte 1/1`) → `walkTo(5, 4)` → Dona Guida →
     `Concluir missão (+50 XP)`: `xp === 100`, `Nv 2` no `XpBar` e o Caderno com a cadeia toda `★ Concluída`.
   - Nenhum erro de console nem de página; capturas em `verify-output/`.

## 5. Riscos de UX, persistência, acessibilidade, público jovem e LGPD

| Dimensão | Risco | Tratamento neste desenho |
|---|---|---|
| **UX — orientação norte/sul** | A câmera fica em `avatar + (0, 24, 21)` e `KeyW` anda para `-z` (topo da tela), mas `SLEIGH`/Baltazar estão em `+z` (base) e os diálogos diziam "ao norte" ([`review.md`](review.md), risco do trenó). | **Corrigido na copy:** as falas e `npcs.csv`/`story-bible.md`/`objects.md` dizem "ao sul" e `validate-quests.mjs` barra "ao norte"; marcadores `!`/`?`/`...` sobre cada NPC e referências visuais nas falas e toasts continuam. Mover o trenó segue em PEN-017/PEN-023. |
| **UX — Jogo da Memória reutilizado** | `play-memory` usa `eventId` fixo `"win"` e a quest não pode concluir sem entregar ao carteiro. | Evento separado `route-memory-game:memory-win`, emitido só com a quest `active`, e XP apenas no `turn-in` em Seu Nivaldo. |
| **UX — entregas cruzadas** | Ativação em Baltazar e entrega em outro morador confunde quem volta ao ativador. | Toast, linha do Caderno e marcador nomeiam o destinatário (`➜ Entregar a Seu Nivaldo` / `Dona Guida`); `?` só aparece no NPC de entrega. |
| **Persistência — navegador compartilhado e replay** | Herdar quests/itens de outra pessoa e, no servidor, reordenar eventos do mesmo lote. | Estado só em `Progress` (`vila.progress.v2` para visitante; `clearGuest()`/`restoreGuest()` no login/logout, IMPL-0011); `applyEvent` recalcula os objetivos a partir de `seen` (comutativo) e o XP depende do `turn-in` gravado. |
| **Acessibilidade** | Texto longo em 3D é ilegível; jogador de teclado precisa falar com NPC sem clique; cor não pode ser o único sinal. | Falas e objetivos só em HTML no `Panel` (`role="dialog"`, `aria-modal`); marcador com símbolo + nome curto; `E`/`Enter` abre o diálogo e `Escape` fecha; bolsa e toasts com `role="status"`. |
| **Público jovem (ECA Digital)** | Pressão de tempo, sequência diária, sorte ou confusão entre brincar e doar. | Sem cronômetro, sem perda de item, sem diária/semanal, sem sorteio; o patuá é narrativo ("sorte não se carrega, se planta") e os 100 XP levam ao nível 2 sem doar. |
| **LGPD** | Sincronizar quests não pode ampliar dado pessoal coletado. | `POST /progress/events` recebe só pares de ids estáticos da whitelist, sem coordenadas, texto livre ou metadado de dispositivo; `DELETE /me` apaga os eventos por `ON DELETE CASCADE`. |

## 6. Perguntas que só o responsável pode responder

1. **Aprovação do catálogo e da curva de XP (PEN-025, DEC-039..042):** os três moradores fictícios (Baltazar, Seu Nivaldo,
   Dona Guida), as falas de [`dialogues.csv`](dialogues.csv) e `20 + 30 + 50 = 100 XP` da cadeia saem de `PROPOSTA`?
   Enquanto não saírem, tudo fica rotulado `PROPOSTA` e desligado em produção (`VITE_QUESTS_V1_ENABLED` ausente,
   `QUESTS_V1_ENABLED = "false"`).
2. **Coexistência com as 4 missões (P14):** as cadeias narrativas convivem com as 4 missões rápidas no Caderno ou as
   substituem quando as 5 cadeias estiverem prontas? O piloto adota coexistência, em seção separada, sem tocar no contador
   principal.
3. **Recompensa do finale (DEC-032, [`story-bible.md`](story-bible.md) §6):** o finale de 50 XP libera um cosmético
   exclusivo em `packages/shared/src/game/cosmetics.ts` ou vale só o XP, que já leva ao nível 2 (Coroa de azevinho, Suéter
   listrado, paleta Noite estrelada)? O piloto não cria cosmético fora do catálogo atual.
4. **Posição do trenó (PEN-017/PEN-023):** na definição do layout, `SLEIGH`/`kids-sled`/Baltazar vão para `-z` (norte da
   tela) ou permanecem em `+z` com a fala "ao norte" corrigida? O piloto mantém Baltazar junto ao trenó atual
   (`-2.5, 28.5`) e guia por marcadores.
5. **Modelo do patuá:** `quest-lucky-charm` já está `done` (máximo de 50 voxels e 108 faces, 11 variantes em
   12 sementes) e não precisa de fallback genérico. O responsável aprova este visual como definitivo do piloto
   ou quer ajuste antes de ligar a flag?

**Aprovação do piloto (PEN-025):** o piloto da cadeia `flight-night` continua sendo PROPOSTA e só pode ser
ligado depois que o responsável aprovar o catálogo de missões, a curva de XP, os NPCs fictícios e os visuais
dos cinco objetos. Nenhum código de missão, migration ou deploy acompanha este documento; a arte 3D dos
objetos é a única parte já implementada.
