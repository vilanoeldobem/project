# Story v2: runtime e catálogo

> **Status:** PROPOSTA, runtime do spine implementado atrás de flags; conteúdo dos livros pendente. **Atualizado em:**
> 2026-11-21. **Fonte de verdade:** `packages/shared/src/game/quests-v2/`, `packages/shared/src/game/cosmetics-v2.ts`,
> `apps/client/src/game/questsV2Flag.ts`, `apps/api/src/progress.ts`; o epílogo continua em
> [quests.md](quests.md) e `quests.ts`.

O runtime v2 permite que dez livros sejam implementados em paralelo e um epílogo/pós-jogo feche a saga. Nenhum livro
edita arquivos compartilhados: cada um preenche o próprio módulo, a própria pasta de conteúdo, os próprios props e os
próprios cosméticos. O spine não escreve história.

## 1. Bandeiras

| Lado | Chave | Efeito |
|---|---|---|
| Cliente | `VITE_QUESTS_V2_ENABLED=true` no build | Liga o lado da página da v2 |
| Cliente | `?quests2=1` em localhost/desenvolvimento | O mesmo, para verificação local |
| API | `QUESTS_V2_ENABLED=true` | Aceita eventos v2; em produção e homologação é `false` |
| API | `GET /config` → `questsV2` | O cliente só liga a v2 se a página e a API concordarem |

As duas bandeiras da v2 são independentes de `QUESTS_V1_ENABLED` / `VITE_QUESTS_V1_ENABLED`. O epílogo continua
exigindo as duas bandeiras v1; a saga principal é jogável até o último quest sem a bandeira v1. Enquanto `/config`
não responde, ou se a API está fora do ar, a v2 fica desligada. Com a v2 desligada, eventos v2 são ignorados pela API
e não são enfileirados pelo cliente; ids desconhecidos continuam `400 bad_events`.

## 2. Contagens e XP

| Bloco | Entradas | XP |
|---|---:|---:|
| Livros I a X, narrativa | 330 | 9.300 |
| Livros I a X, marcos | 120 | 1.200 |
| Epílogo | 18 | 550 |
| Pós-jogo | 12 | 240 |
| Rápidas | 4 | 110 |
| **Total** | **484** | **11.400** |

Sem o PR #63 (`welcome-bough`), o epílogo tem 15 entradas e 465 XP; o total canônico cai para 11.315. O manifesto
mantém os 18 ids do epílogo e o teste detecta o estado real do `quests.ts`.

## 3. Arquitetura

| Arquivo | Papel |
|---|---|
| `quests-v2/types.ts` | `StoryQuest` (Quest com NPCs e ordem abertos), `Milestone`, `StoryCatalog`, mundo e estados |
| `quests-v2/manifest.ts` | os 484 ids canônicos, leitura apenas para os livros |
| `quests-v2/engine.ts` | máquina de estados parametrizada; o catálogo v1 é o teste de paridade |
| `quests-v2/catalog.ts` | agrega livro 00 (pós-jogo), livros 01 a 10, epílogo v1 e missões rápidas |
| `quests-v2/milestones.ts` | estado derivado do contador, XP uma vez, sem aceite ou entrega |
| `quests-v2/minigames.ts` | os 10 ids e o contrato sem cronômetro, com pular após três tentativas |
| `quests-v2/world.ts` | agrega NPCs, spawns, interações e obstáculos dos livros; o mundo v1 fica intacto |
| `quests-v2/states.ts` | seletores puros de estado de mundo derivados de `Progress` |
| `cosmetics-v2.ts` | prefixo v1 + 60 cosméticos dos livros; avatar, provador e presença usam o catálogo unido |

As funções `questStateIn`, `activeQuestIn`, `canAcceptIn`, `questProgressIn`, `activeInventoryIn` e `applyEventIn`
recebem o catálogo. Nenhuma delas importa o catálogo v1 fixo. O motor mantém uma missão ativa por vez, pré-requisitos,
`accept`, objetivos e `turn-in`, com XP só na entrega.

## 4. Mundo e UI

O mundo v1 (`world.ts`) não muda. `STORY_WORLD` contém apenas os livros; `ALL_WORLD` é a união usada pela UI e pelo
verificador. `StoryProps.tsx` desenha os NPCs v2 em uma malha agregada, os itens ativos e os props de interação. Os
rótulos usam `?` para pronto, `!` para disponível, `...` para em andamento e o nome sozinho para conversa neutra; o
sinal nunca depende de cor.

`Missions.tsx` e `NpcDialog.tsx` recebem catálogo, mundo e progresso por prop; sem as flags, continuam exibindo o
comportamento v1. O diário separa principal, regional, secundária, epílogo, pós-jogo e marcos, e mostra o próximo
passo. O jogador não vê uma entrada de livro enquanto o módulo daquele livro estiver vazio.

## 5. API e dados

Nenhuma migration, tabela ou coluna nova. `POST /progress/events` valida o catálogo unido, mantém a idempotência e
grava apenas transições válidas de quest; missões rápidas continuam independentes de ordem. O limite por conta subiu
de 500 para 5.000 eventos porque a saga completa tem cerca de 1.500. Com a bandeira v2 desligada, eventos v2 do lote
são ignorados e o resto é gravado; id desconhecido dá `400`.

## 6. Epílogo e pós-jogo

O epílogo é o catálogo v1, importado sem edição. A última missão principal, `b05-c3-04`, libera as seis cadeias do
epílogo; a ordem é livre e a cena final espera as seis. O módulo `book-00-epilogue.ts` recebe o pós-jogo e a cena
final na sessão 11, sem editar `catalog.ts` nem `progress.ts`.

## Ver também

[quests.md](quests.md) · [api.md](api.md) · [content.md](content.md) ·
[`content/proposals/quests-v2/`](../../content/proposals/quests-v2/README.md)
