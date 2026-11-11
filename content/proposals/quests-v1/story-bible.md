# Bíblia de história — quests-v1

> **Status: PROPOSTA** — conjunto inicial de missões para a função Missão da Vila
> (DEC-039 a DEC-042; catálogo inicial pendente em PEN-025). Nada aqui é decisão
> aprovada; nomes, números e recompensas aguardam avaliação do responsável. Esta
> proposta não acompanha código de jogo.

## 1. Tom da Vila

- Aconchegante, gentil e brincante, como uma vila de Natal contada a uma criança curiosa.
- Frases curtas e imagens concretas (neve, luz, cheiro de panetone); humor leve, sem maldade.
- Sem pressão: nenhum texto cobra urgência, retorno ou meta de tempo; sem quebra de
  quarta parede e sem tom de tutorial.
- Honestidade: nada simula doação ou pagamento; jogar nunca é doar (DEC-042).
- Público provável inclui crianças (ECA Digital, LGPD): vocabulário simples e zero
  recompensa por tempo online.

## 2. Os cinco moradores (todos fictícios)

Cada NPC usa o gerador `villager` com semente igual ao próprio `npc_id`. As posições são
sugestão PROPOSTA (layout final é PEN-017) e não bloqueiam spawn, passagem, árvore, lago,
trenó ou terrenos. Os três moradores decorativos da praça continuam sem nome e sem papel.

| NPC | Papel | Base | Voz |
|---|---|---|---|
| Baltazar (`sleigh-keeper`) | Guardião do trenó do Noel | Ao norte, junto ao trenó | Grave e calorosa; fala de voo, noite e promessas antigas |
| Dona Filó (`market-keeper`) | Mercadora do mercado oeste | Entre as barracas do mercado oeste | Prática e afetuosa; frases curtas que misturam comida e carinho |
| Seu Nivaldo (`postmaster`) | Carteiro da Vila | Ao lado da caixa de correio | Formal e poético; trata cartas como promessas |
| Aurora (`pond-keeper`) | Vigia do lago congelado | Na margem oeste do lago | Calma e sonhadora; imagens de luz e reflexo |
| Dona Guida (`storyteller`) | Contadora de histórias | Na praça, junto à grande árvore | Avó paciente; provérbios curtos que costuram passado e presente |

## 3. Os cinco arcos (convite → complicação → finale)

### A Noite de Voo — Baltazar (`flight-night`)
1. **Convite** (`harness-bells`): os sinos do arreio se perderam na neve; o guardião
   convida o visitante a ajudar.
2. **Complicação** (`route-memory-game`): a ventania embaralhou a lista da rota; treinar
   a memória e confirmar a ordem com quem a escreveu.
3. **Finale** (`charm-for-the-flight`): o patuá da sorte precisa da bênção de Dona Guida;
   com ele, o trenó está pronto para a Noite de Voo.

### A inauguração da barraca — Dona Filó (`market-opening`)
1. **Convite** (`market-invitations`): avisar o correio de que a barraca abre na grande noite.
2. **Complicação** (`ornament-crates`): a ventania espalhou as caixas de enfeites pela rua.
3. **Finale** (`market-lucky-game`): a tradição da feira pede um par achado no Jogo da
   Memória; depois, avisar Baltazar, primeiro freguês.

### As cartas que ficaram — Seu Nivaldo (`undelivered-letters`)
1. **Convite** (`frozen-mailbox`): libertar a caixa de correio trancada no gelo.
2. **Complicação** (`letter-pairs-game`): as cartas perderam os pares; o jogo ensina o olhar.
3. **Finale** (`newest-house-visit`): a última carta é para a casa mais nova da Vila —
   visitá-la e registrar a notícia com Dona Guida.

### A noite das luzes do lago — Aurora (`lake-lights`)
1. **Convite** (`lake-lanterns`): as lanternas da margem estão enterradas na neve.
2. **Complicação** (`kids-sled-run`): levar as lanternas brincando, no trenó pequeno da garotada.
3. **Finale** (`lantern-for-the-flight`): a lanterna mais firme guia o voo; entregá-la a Baltazar.

### O livro da Vila — Dona Guida (`village-story`)
1. **Convite** (`tree-promise-visit`): a última página do livro aponta para a grande árvore.
2. **Complicação** (`donation-promise-reading`): ler, com calma, o que a árvore promete.
3. **Finale** (`story-page-delivery`): a página escrita viaja pelo correio, com Seu Nivaldo.

## 4. Continuidade

- **A Noite de Voo** é o horizonte comum: trenó pronto, barraca aberta, cartas entregues,
  lago aceso e promessa lida convergem para a mesma noite.
- Entregas cruzadas: `route-memory-game` e `story-page-delivery` terminam com Seu Nivaldo;
  `charm-for-the-flight` e `newest-house-visit` com Dona Guida; `market-lucky-game` e
  `lantern-for-the-flight` com Baltazar.
- Objeto reaproveitado: a Lanterna do lago aparece em `lake-lanterns` e `lantern-for-the-flight`.
- Nenhum texto cita ONG, parceiro, doador ou pessoa real; as quests de causes apenas
  visitam e leem (casa de ONG publicada ou painel de doação global).
- Falas de entrega são ditas pelo NPC de entrega (`npc_entrega`), mesmo quando diferente
  do NPC que ativou a quest.

## 5. Suposições (PROPOSTA)

- XP total 465 ≈ nível 5 no protótipo (XP_PER_LEVEL = 100); valores por quest de
  {15, 20, 25, 30, 40, 50}, finais de cadeia com 50.
- O único minijogo hoje é o Jogo da Memória; as quests da trilha play o reusam ou
  reenquadram interações brincantes já possíveis no mundo.
- `causes/newest-house-visit` exige ambiente com ONG publicada (local); as demais quests
  de causes usam o painel de doação global, sempre presente.
- Posição final dos NPCs, pontos de coleta e pontos de interação são decisão de layout
  (PEN-017/PEN-023), não desta proposta.

## 6. Perguntas em aberto

- Como o Caderno de Missões (P14) apresentará cadeias e pré-requisitos?
- Finais de cadeia destravam cosméticos gratuitos? (catálogo atual em `cosmetics.ts`)
- Como rastrear "ler" e "visitar" sem tempo mínimo de leitura (doc 22)?
- Os itens de quest ganham modelos próprios com os geradores `gift`/`lantern`?
