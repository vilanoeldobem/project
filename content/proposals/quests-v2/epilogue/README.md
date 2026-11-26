# Epílogo e pós-jogo da saga (PROPOSTA)

Fatia 11 da saga das Longas Noites. Preenche `packages/shared/src/game/quests-v2/books/book-00-epilogue.ts` com as 12 missões de pós-jogo, a cena final e os créditos, e liga o epílogo v1 ao runtime v2 sem editar `quests.ts`, `world.ts` v1 ou os arquivos do PR #63.

## Estado detectado

O PR #63 está integrado: `packages/shared/src/game/quests.ts` contém `bough-ribbon`, `bough-sprigs` e `bough-delivery`. O epílogo tem **18 missões e 550 XP**; sem o PR #63 o fallback é 15 e 465. Não recriar as missões do ramo.

| Bloco | Entradas | XP |
|---|---:|---:|
| Epílogo v1 (existente) | 18 | 550 |
| Pós-jogo | 12 | 240 |
| Missões rápidas | 4 | 110 |
| **Total desta fatia** | **34** | **900** |

As 12 de pós-jogo são `pg1-01` a `pg1-06` e `pg2-01` a `pg2-06`, todas com 20 XP, `book: 0`, `kind: "postgame"` e `prerequisiteIds: []`, iguais ao manifesto. O manifesto não foi editado.

## Ponte com o epílogo v1

- `catalogFor(true, true)` devolve os livros, o epílogo v1 com os cinco inícios presos a `b05-c3-04` e o pós-jogo. A sexta cadeia, `welcome-bough`, já depende de `story-page-delivery`, que depende de uma raiz presa.
- `catalogFor(true, false)` devolve o `QUESTS` cru, preservando o comportamento v1 e o `verify-quests.mjs` (`?quests=1`, sem `quests2`).
- `catalogFor(false, true)` devolve só os livros; sem epílogo e sem pós-jogo.
- A API, com as duas bandeiras ligadas, usa o catálogo com portão só para eventos novos; o replay dos eventos salvos continua no `STORY_CATALOG` para não perder progresso v1 antigo.
- O manifesto tem os 18 ids do epílogo e os 12 do pós-jogo; nenhum id novo.

## Cena final e créditos

`finalSceneReady(progress)` fica verdadeiro quando as seis últimas missões das cadeias do epílogo estão concluídas: `charm-for-the-flight`, `market-lucky-game`, `newest-house-visit`, `lantern-for-the-flight`, `story-page-delivery` e `bough-delivery`. A cena e os créditos aparecem no painel "A próxima Longa Noite", aberto pelo Caderno de Missões.

`newest-house-visit` depende de uma casa publicada; sem casa, a cena final fica bloqueada e o Caderno diz por quê. Nenhuma casa, ONG ou número é inventado.

## Arquivos

- `packages/shared/src/game/quests-v2/books/book-00-epilogue.ts`: 12 quests, 18 interações, `FINAL_SCENE`, `CREDITS`, `EPILOGUE_FINAL_QUESTS`.
- `packages/shared/src/game/quests-v2/catalog.ts`: `EPILOGUE_QUESTS`, `catalogFor` e reexports.
- `packages/shared/src/game/quests-v2/books/book-00-epilogue.test.ts`: contagens, manifesto, mundo, portão, XP, idempotência, bandeira v1 e cena final.
- `apps/client/src/ui/FinalScene.tsx` e `apps/client/src/ui/FinalScene.test.tsx`: painel da cena e dos créditos.
- `apps/client/src/ui/Missions.tsx`: botão "Ver a cena final" no Caderno.
- `apps/api/src/progress.ts` e `apps/api/src/progress.test.ts`: portão do servidor v2 e teste do planejador.
- `content/proposals/quests-v2/epilogue/quests.csv` e `dialogues.csv`: referência de conteúdo.

## Validação

```bash
node content/proposals/quests-v2/validate-slice.mjs --kind=epilogue content/proposals/quests-v2/epilogue
node content/proposals/quests-v2/validate-slice.mjs --kind=spine
node apps/client/scripts/verify-story.mjs http://localhost:8799 epilogue
node apps/client/scripts/verify-story.mjs http://localhost:8799 postgame
```

## Divergência registrada

A referência antiga dizia que a sessão não editaria `catalog.ts`. A ponte exige uma edição mínima nesse arquivo para aplicar o portão de `b05-c3-04` e ordenar livros, epílogo e pós-jogo. O `quests.ts`, o `world.ts` v1 e os arquivos do PR #63 continuam intactos. A prova `verify-story.mjs all` segue presa nos minijogos da saga, que pertencem à sessão 12.
