# IMPL-0037: Missões em paralelo, Caderno de Missões e HUD com assentos para o elenco

**Status:** Aceita — implementada (pedido do responsável pelas missões em 2026-11-26). O conteúdo das missões
continua **PROPOSTA** (PEN-025); esta decisão muda o runtime e a interface, não o catálogo.
**Data:** 2026-11-26
**Fontes:** pedido do responsável pelas missões ("missões em paralelo", "deixar tudo redondo", "espalhe os NPCs
pelo mapa", "quests com enabled permanente, pode tirar a flag que desativa"); [IMPL-0013](0013-quests-v1-runtime.md)
(ordem, transições e XP), [IMPL-0019](0019-progress-concurrency-and-acknowledgment.md) (concorrência do progresso),
[IMPL-0022](0022-immersive-entry-and-game-menu.md) e [IMPL-0026](0026-boards-ui-and-character-appearance.md) (HUD e
pranchas P01–P15); código: `packages/shared/src/game/{quests,progress}.ts`,
`packages/shared/src/game/quests-v2/{engine,catalog,seats}.ts`, `apps/client/src/{game,ui,scene}`, `apps/api/src/progress.ts`.

## Contexto

O motor aceitava **uma missão por vez**: `activeQuest`/`activeQuestIn` devolvia a primeira missão aberta e
`canAccept`/`canAcceptIn` exigia que nenhuma outra estivesse em andamento. O diálogo do NPC desabilitava "Aceitar
missão" com a frase "Conclua a missão atual primeiro". A interface mostrava "Missão ativa" no singular e o Caderno
listava todas as cadeias de todos os livros como um bloco de texto corrido, mesmo com as missões desligadas.
As missões dependiam de duas bandeiras (cliente e API) e o epílogo v1 ficava atrás do livro V (`b05-c3-04`) quando
as duas estavam ligadas. Nove personagens de história (Mestre Anselmo, Nina, Tomás, Tia Bete, Seu Nazário, Dona Íris,
Dona Cida, Mestre Téo e Lia) ficavam dentro da praça, a menos de 19 u da árvore, junto dos cinco moradores-âncora.

## Decisão

1. **Missões em paralelo.** `activeQuests`/`activeQuestsIn` devolvem **todas** as missões abertas; `canAccept` e
   `canAcceptIn` só exigem que o pré-requisito da própria cadeia tenha sido concluído. `accept` deixa de consultar
   outra missão. Cada objetivo e cada `turn-in` continuam valendo apenas para a missão que os nomeia, e o XP é pago
   uma vez na entrega (as regras da IMPL-0013 e da IMPL-0019 não mudam).
2. **Sem bandeira.** As chaves `QUESTS_V1_ENABLED`/`QUESTS_V2_ENABLED` (API) e `VITE_QUESTS_V1_ENABLED`/
   `VITE_QUESTS_V2_ENABLED` (cliente) foram removidas; o cliente usa `catalogFor(true, true)` e a API aplica os
   eventos conhecidos sem consultar `wrangler.jsonc`. `GET /config` deixa de devolver `quests`/`questsV2`.
3. **O epílogo v1 não espera o livro V.** O portão `b05-c3-04` foi removido; `bough-ribbon` continua esperando
   `story-page-delivery`, como sempre. As cadeias do epílogo e as dos livros ficam disponíveis ao mesmo tempo.
4. **Roteamento por dono do evento.** `storyInteractionFor` recebe catálogo e progresso e escolhe a interação cuja
   missão está aberta e cujo evento ainda não foi visto; o Jogo da Memória grava `memory-win` em **todas** as missões
   abertas com esse objetivo. O diálogo mostra um bloco de cada vez (uma entrega, uma oferta) e nomeia os demais.
5. **Caderno de Missões.** O P14 lista as missões abertas em cartões com progresso, item da bolsa e entrega; mostra
   os próximos passos; agrupa as cadeias em blocos recolhíveis (abertos quando há um passo agora); mantém as quatro
   missões rápidas, os marcos e a cena final.
6. **HUD.** Uma faixa com até duas missões abertas (barra e contagem, mais "+N"), o botão "Missões" com o número de
   ativas e a barra de XP, e a bolsa limitada a duas fichas. Ícones vetoriais próprios substituem os emoji; o foco
   ganha um anel de duas cores; seleção, cursor e barra de rolagem têm estilo; o movimento reduzido é aplicado só aos
   controles, sem a regra global com `!important`.
7. **Assentos do elenco.** Os nove personagens que ficavam na praça passam a morar em lugares com nome nos anéis 1 a 4
   (`quests-v2/seats.ts`): pracinha, restaurante, escola, teatro, parques, mercado, estação, mall. Cada interação
   `talk` deriva a posição do seu NPC (`seatPoint`), e um teste mantém a igualdade, a distância de 2 u entre
   personagens e a folga dos spots da vida da Vila.

## Consequências

- A API passa a gravar mais `accept`s (um por missão aceita), na ordem em que chegam; o replay continua determinístico e
  as linhas antigas continuam válidas.
- Contas que já tinham progresso do epílogo v1 antes do portão continuam com ele: o replay usa o catálogo sem portão.
- Não há transição de abandono (OQ-09); agora ela não bloqueia mais as outras missões.
- O HUD e o Caderno ganham testes de unidade e um verificador de navegador (`verify-hud.mjs`) em oito larguras; a
  verificação de movimento reduzido, cores forçadas e 200 % de zoom é explícita.
- O catálogo, os XP, os nomes e as falas continuam **PROPOSTA** (PEN-025); ligar o runtime não aprova o conteúdo.
- A remoção do portão muda a ordem narrativa proposta (o epílogo podia ser um fim de saga); fica registrada aqui para
  o dono do produto reverter com uma decisão de conteúdo, não com uma bandeira.

## Alternativas

- **Manter a bandeira e só ligá-la:** menos mudanças, mas o pedido foi explícito para remover a chave que desliga; uma
  bandeira sempre `true` é peso morto e um caminho de desligamento acidental.
- **Limitar o número de missões abertas (por exemplo, três):** não foi pedido e transformaria uma regra de conteúdo em
  regra de interface; o rastreador já mostra duas e conta o resto.
- **Aceitar missões pelo Caderno:** evitaria caminhadas, mas tira o diálogo do centro da missão; o Caderno só diz com
  quem falar.
- **Manter o portão do livro V:** obrigaria todo jogador novo a terminar cinco livros antes das cadeias do epílogo, que
  são o conteúdo mais antigo e completo; foi rejeitado.

## Verificação

`pnpm typecheck`, `pnpm test` e `pnpm build`; o teste de assento (`quests-v2/seats.test.ts`), a suíte da vida
(`life.test.ts`), `verify-hud.mjs` em 320–1920 px, `verify-quests.mjs`, `verify-story.mjs`, `verify.mjs` e
`verify-boards.mjs`. O que não foi verificado: tema escuro (não existe; `color-scheme: light`), impressão e 3G (o HUD
não tem imagem nem rede).
