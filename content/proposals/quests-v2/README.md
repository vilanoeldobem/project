# quests-v2: saga das Longas Noites

> **Status: PROPOSTA.** O runtime do spine e os dez livros estão implementados atrás de `VITE_QUESTS_V2_ENABLED` /
> `?quests2=1` no cliente e `QUESTS_V2_ENABLED` na API, desligados em produção e homologação.
> Nada aqui é decisão de produto: catálogo, XP e conteúdo continuam pendentes de aprovação.

## Índice das fatias

| Sessão | Trabalho | Branch | Entrega |
|---:|---|---|---|
| 00 | spine | `story/00-spine` | runtime v2, manifesto 484, flags, UI/API genéricas |
| 01 | Livro I, A Chegada | `story/01-livro-01-a-chegada` | 45 entradas, 4 props, 6 cosméticos |
| 02 | Livro II, As Casas e os Nomes | `story/02-livro-02-casas-e-nomes` | 45 entradas, 4 props, 6 cosméticos |
| 03 | Livro III, O Tempo e as Cartas | `story/03-livro-03-tempo-e-cartas` | 45 entradas, 4 props, 6 cosméticos |
| 04 | Livro IV, O Bosque e o Lago | `story/04-livro-04-bosque-e-lago` | 45 entradas, 4 props, 6 cosméticos |
| 05 | Livro V, A Longa Noite | `story/05-livro-05-longa-noite` | 45 entradas, 4 props, 6 cosméticos |
| 06 | Livro VI, O Amanhecer | `story/06-livro-06-amanhecer` | 45 entradas, 4 props, 6 cosméticos |
| 07 | Livro VII, A Ponte de Gelo | `story/07-livro-07-ponte-de-gelo` | 45 entradas, 4 props, 6 cosméticos |
| 08 | Livro VIII, O Verão da Vila | `story/08-livro-08-verao-da-vila` | 45 entradas, 4 props, 6 cosméticos |
| 09 | Livro IX, As Fundações | `story/09-livro-09-fundacoes` | 45 entradas, 4 props, 6 cosméticos |
| 10 | Livro X, A Próxima Noite | `story/10-livro-10-proxima-noite` | 45 entradas, 4 props, 6 cosméticos |
| 11 | epílogo e pós-jogo | `story/11-epilogo-e-pos-jogo` | 18 epílogo, 12 pós-jogo, cena final |
| 12 | arte, cosméticos e minijogos | `story/12-arte-cosmeticos-minijogos` | 9 minijogos, 10 props de saga, estilo |
| 13 | revisão jurídica | `story/13-revisao-juridica` | auditoria e correções |
| 14 | integração | `story/14-integracao` | playthrough, índice, documentação |

Estado: fatias 00 a 10 integradas; 11 a 13 pendentes; 14 em andamento ([quests-v2.md §7](../../../docs/reference/quests-v2.md#7-estado-das-fatias-2026-11-22)). O spine é a única fatia que edita arquivos compartilhados. Cada livro edita somente
o próprio módulo, a própria pasta de conteúdo, os próprios 4 props, os próprios 6 cosméticos e os próprios testes; a
única exceção compartilhada é uma linha no `CHANGELOG.md` em `[Unreleased]`.

## Contrato de cada livro

- `packages/shared/src/game/quests-v2/books/book-<NN>.ts`: exporta `QUESTS`, `MILESTONES`, `NPCS`, `SPAWNS`,
  `INTERACTIONS`, `OBSTACLES`, `STATES`, `COSMETICS`.
- `content/proposals/quests-v2/book-<NN>/`: `quests.csv`, `dialogues.csv`, `npcs.csv`, `objects.csv`,
  `milestones.csv`, `cosmetics.csv`, `README.md`.
- `apps/client/src/scene/gen/quest-v2/book-<NN>/`: os 4 props novos.
- `apps/client/src/scene/gen/cosmetics/book-<NN>/`: os 6 modelos de cosmético.

### Cabeçalhos CSV

O validador lê por nome, não por posição. Use estes cabeçalhos:

```text
quests.csv: missao_id,cadeia_id,ordem,titulo_missao,descricao_missao,trilha,tipo_objetivo,tipo_objeto,nome_objeto,objeto_id,qtd_objetos,xp,npc_ativacao,npc_entrega,local,prerequisito_id,status_mecanica,notas,kind,book,region,theme,audience,metric_tag,accessibility,world_state,prerequisite_ids
dialogues.csv: missao_id,fala_oferta,fala_entrega
npcs.csv: npc_id,nome,papel,local_base,gerador,semente,x,z,rot,book,greeting
objects.csv: objeto_id,nome_objeto,tipo_objeto,status_build,gerador,categoria,usado_em,qtd_total,semente,orcamento_voxels,orcamento_faces,tamanho,interacao,colisao,notas
milestones.csv: corrente_id,titulo,contador,limiar,ordem,xp,recompensa,region,book
cosmetics.csv: cosmetic_id,slot,nome,origem,premium,recompensa,orcamento_voxels,orcamento_faces
```

`prerequisite_ids` aceita vários ids separados por `;`; `prerequisito_id` continua aceito para uma entrada linear.
Cada livro tem 45 entradas: 12 principais, 16 regionais, 5 secundárias e 12 marcos; 8 NPCs de quest; 4 props novos
(exatamente quatro linhas em `objects.csv`, sem listar objetos reutilizados); 6 cosméticos (3 grátis e 3 premium).

### Região

A região é derivada do id, porque as tabelas não têm coluna de região: `c1`, `c3`, `r1` e `m1` usam a primeira região
do livro; `c2`, `r2` e `m2` usam a segunda; uma secundária usa a região do capítulo do seu pré-requisito (`-c2-` na
segunda, senão na primeira). O manifesto e o validador usam a mesma regra.

### Marcos

Use `counterKey` em inglês. O mapeamento das frases da bíblia:

`missões concluídas`→`missions`, `trocas de ofício`→`trades`, `terrenos publicados visitados`→`houses`,
`vitórias no Jogo da Memória`→`memory-wins`, `cartas entregues`→`letters`, `sinos tocados`→`bells`,
`trilhas seguidas`→`trails`, `lanternas acesas`→`lanterns`, `despedidas vistas`→`departures`,
`promessas tecidas`→`threads`, `manhãs vistas`→`mornings`, `pegadas lidas`→`dew-footprints`,
`travessias concluídas`→`bridges`, `ecos devolvidos`→`echoes`, `flores de verão`→`summers`,
`estações visitadas`→`seasons`, `pedras nomeadas`→`foundations`, `páginas de origem lidas`→`origins`,
`horas vistas`→`hours`, `vigílias acompanhadas`→`vigils`.

Cada marco paga 10 XP. A sexta etapa carrega o cosmético de recompensa; as cinco primeiras têm `reward: null`.

### Alvos dos objetivos

Todo id de objetivo que não seja `deliver` precisa de um alvo no módulo, para o verificador de navegador jogar a
fatia: um `SPAWNS` com o mesmo id (coletas) ou um `INTERACTIONS` com o mesmo id (`prop`, `talk` ou `minigame`).
Interações `talk` nomeiam o NPC e registram o evento quando o diálogo abre; `minigame` abre o painel de jogos;
`prop` registra ao usar a ação do HUD. Entregas não têm evento.

### Cosméticos

Os dois `origem=marco` são exatamente as recompensas finais de `bNN-m1` e `bNN-m2`. O `origem=missao` nomeia a missão
que concede o terceiro cosmético grátis. Os três `premium=true` usam o slot do livro: 1 capacete, 2 blusa, 3 calça,
4 vestido, 5 sapato, 6 costas, 7 rosto, 8 mão esquerda, 9 mão direita, 10 especial. Orçamento por camada: 40 voxels e
140 faces. Nada é comprado: premium é catálogo e prévia.

## Validação

```bash
node content/proposals/quests-v2/validate-slice.mjs --kind=spine
node content/proposals/quests-v2/validate-slice.mjs content/proposals/quests-v2/book-01
node content/proposals/quests-v2/validate-slice.mjs --kind=epilogue content/proposals/quests-v2/epilogue
node content/proposals/quests-v2/validate-slice.mjs --kind=art
node content/proposals/quests-v2/validate-slice.mjs --all
```

O verificador de navegador recebe `http://localhost:5173` e a fatia:

```bash
node apps/client/scripts/verify-story.mjs http://localhost:5173 book-01
node apps/client/scripts/verify-story.mjs http://localhost:5173 epilogue
```
