# Epílogo "O ramo da chegada" — decisão de conteúdo

> **Status: PROPOSTA** (DEC-039 a DEC-042; catálogo pendente em PEN-025). Roda atrás das bandeiras
> existentes de `quests-v1` (`VITE_QUESTS_V1_ENABLED`/`?quests=1` e `QUESTS_V1_ENABLED`), desligadas em
> produção e homologação. Pesquisa: [`content/research/missoes-epilogo-ramo-2026-11-18.md`](../../research/missoes-epilogo-ramo-2026-11-18.md).

## 1. Opções consideradas

| Opção | O que é | Por que ficou de fora |
|---|---|---|
| **A. Epílogo na mesma proposta (escolhida)** | Três missões acrescentadas a `quests-v1`, depois de `story-page-delivery`, com Dona Guida e Seu Nivaldo, os pontos livres já usados pela caixa de correio e pelas caixas do mercado, e um objeto voxel novo. | Menor mudança completa: nenhum novo NPC, lugar, sistema, bandeira ou migration; o catálogo e a máquina de estados existentes já cobrem tudo. |
| B. Catálogo `quests-v2` com bandeira própria | Um catálogo separado, com `QUESTS_V2`, `VITE_QUESTS_V2_ENABLED` e `QUESTS_V2_ENABLED`. | Duplicaria o runtime de catálogo único e a UI antes da PEN-025; mais código, mais testes e mais risco do que a sessão comporta. |
| C. Missões rápidas novas em `MISSIONS` | Contadores sempre aceitos, como os quatro atuais. | Missão rápida não fica atrás das bandeiras de quest: o conteúdo iria para produção sem aprovação. Também exigiria um gatilho novo. |
| D. Cadeia com NPC e lugar novos | Um morador novo e um canto novo do mapa (por exemplo, o pátio da lenha). | O layout final é PEN-017/PEN-023; posições novas exigem revisão de navegação e colisores, e mais trabalho de voxel do que cabe. |
| E. Missão de estação/evento | Uma tarefa ligada à vida da Vila, com horário ou temporada. | O elenco e a rotina são OQ-20, e tempo/estação criaria pressão de retorno diário, um padrão que o produto evita. |

**Escolha: A.** Linha de corte explícita: **não** entram NPC novo, coordenada nova, minijogo novo,
doação/ONG/pagamento, bandeira nova, migration, dependência ou ativação em produção/homologação.

## 2. Orçamento de XP e nível

| Missão | XP |
|---|---:|
| `bough-ribbon` | 15 |
| `bough-sprigs` | 20 |
| `bough-delivery` | 50 |
| **Total do epílogo** | **85** |

- Catálogo `quests-v1` passa de 465 para **550 XP** (15 missões + 3 do epílogo).
- Com as quatro missões rápidas (110 XP), o teto passa de 575 para **660 XP**.
- `attainableLevel(false)` continua **2**; `attainableLevel(true)` passa de **6** para **7**.
- Só as quests chegam ao nível 6 (`floor(550 / 100) + 1`); com as rápidas, ao nível 7.
- O epílogo não é atalho: fica bloqueado até `story-page-delivery` ser concluída. Quem joga só as rápidas
  continua no nível 2. Nenhum requisito de terreno muda (premium 5, padrão 3, econômico 2).

## 3. NPCs, lugares e objetos

| Elemento | Uso | Posição / prova |
|---|---|---|
| Dona Guida (`storyteller`) | Ativa as três missões | `(5, 4)`, já em `NPCS`; sem colisor novo |
| Seu Nivaldo (`postmaster`) | Recebe a entrega final | `(4.5, 11.8)`, já em `NPCS`; sem colisor novo |
| Caixa de correio (`village-mailbox`) | Interação `bough-ribbon` | `(2.4, 12.6)`, raio `3.5`; mesmo ponto já fixado para `mailbox-open`, em chão livre |
| Ramos (`winter-sprig`) | Coleta de 2 | `(-14.5, 8.6)` e `(-16.8, -3.6)`; mesmos pontos já fixados para `ornament-crates`, em chão livre |
| Ramo preparado (`winter-sprig`) | Entrega de 1 | Inventário derivado do progresso; não desenha modelo no mundo |

Os pontos repetidos são seguros porque **só uma missão fica ativa por vez**: quando uma das entradas está
ativa, a outra não é desenhada nem oferecida. O `motion.test.ts` fixa as coordenadas e continua conferindo
folga de colisores; os testes de navegação continuam levando o avatar a cada ponto.

O único objeto voxel novo é o **ramo de pinheiro** (`winter-sprig`, semente `winter-sprig`, gerador
`quest-winter-sprig`, tamanho 0,18 u, orçamento 80 voxels / 200 faces). A entrega usa o mesmo objeto, sem
modelo adicional; o ícone da bolsa continua sendo texto, como nos outros itens.

## 4. Riscos de produto e como são contornados

- **OQ-09 (abandonar missão):** o epílogo é opcional e linear; o runtime atual não tem rota de abandono e
  mantém uma missão ativa por vez. Quem aceita pode concluir depois; nada é perdido. A pergunta continua
  aberta para o dono do produto, sem decisão nova no código.
- **PEN-025 (catálogo não aprovado):** tudo continua **PROPOSTA** e atrás das duas bandeiras; nada é ligado
  em produção ou homologação por esta mudança.
- **Casa publicada:** o epílogo não visita terreno nem lê ONG; não usa `needsPublishedLot` e não mostra nome
  de ONG.
- **Doação:** não há passo de doação, botão, valor, meta ou recompensa por doar. O ramo é um gesto de tempo;
  jogar nunca é doar (DEC-029). Nenhum número é inventado.
- **Layout (PEN-017/PEN-023):** nenhuma posição nova; os pontos reusados já estão fixados e testados. Se o
  layout mudar, a regra de migração de ids/posições existente se aplica.
- **Vida da Vila (OQ-20):** nenhum personagem novo e nenhuma fala de elenco; Dona Guida e Seu Nivaldo são os
  NPCs de quest já existentes. Nenhum modelo de linguagem ou texto livre.

## 5. Critérios de aceite observáveis

1. `node content/proposals/quests-v1/validate-quests.mjs` passa e imprime
   `quests=18 npcs=5 chains=6 xpTotal=550`.
2. `node content/proposals/quests-v1/validate-epilogue.mjs` passa e imprime `quests=3 xpTotal=85`.
3. `node content/proposals/quests-v1/validate-objects.mjs` passa com `objects=9` e `prompts=6`.
4. Testes compartilhados: o epílogo fica bloqueado antes de `story-page-delivery`, concede 85 XP depois,
   e o replay não passa de 550. Testes da API: a mesma cadeia é aceita, idempotente, e a bandeira desligada
   ignora os eventos novos.
5. `pnpm check` verde.
6. Navegador real: `verify-quests.mjs` conclui as 18 missões, mostra 550 XP + incidentais, sem erro de
   console/página, e o avatar chega à caixa de correio e aos dois pontos do mercado.
7. Galeria: o ramo é legível a 0,18 u sobre a neve, fica dentro de 80/200 e tem pelo menos 6 variantes em
   12 sementes; o snapshot é revisado.
8. Nenhuma bandeira, configuração de produção, migration ou dependência é alterada.
