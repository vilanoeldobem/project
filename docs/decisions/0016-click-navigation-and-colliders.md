# IMPL-0016: Navegação por clique com desvio de obstáculos e colisores medidos pelo que é desenhado

**Status:** Proposta — implementada, a validar (verificação em navegador real e em celular pelo responsável). O
layout do mundo continua **PROPOSTA** (PEN-017/PEN-023): este ADR não decide onde as peças ficam, só como o avatar
anda entre elas
**Data:** 2026-11-11
**Fontes:** pedido do responsável do repositório ("fix all game collisions", 2026-11-11); medição em navegador real
no `main` com `window.__vila.walkTo`; `vilanoeldobem/docs`: DEC-026, PEN-017, PEN-023, PEN-025; código:
`packages/shared/src/game/{collision,navigation,motion,world}.ts`, `apps/client/src/game/{sim,store,devtools}.ts`,
`apps/client/src/scene/{Player,World,Ground,Props,Scenery}.tsx`, `apps/client/src/scene/gen/houses.ts`,
`apps/client/scripts/verify-collisions.mjs`

## Contexto

Desde que andar passou a ser só por clique/toque, o avatar ia em linha reta até o ponto clicado, era empurrado para
fora dos colisores (círculos) e desistia depois de 0,5 s sem progresso (`stuckTime`). Medido no `main`, a partir do
spawn `(0, 9)`, com as quests desligadas:

| Clique | Onde parou | Faltou |
|---|---|---:|
| `(-2.5, 28.5)` | `(-0.15, 10.16)` | 18,5 u |
| `(-18.6, 0)` | `(-9.37, 5.45)` | 10,7 u |
| `(24.5, -2.5)` | `(8.11, 9.17)` | 20 u |

Qualquer obstáculo pequeno na linha reta (um poste, um banco, a árvore) encerrava a caminhada. Com um único jeito de
andar, isso é lido como "a colisão está quebrada".

A auditoria dos colisores contra os modelos desenhados (voxels abaixo da altura da cabeça do avatar) encontrou
diferenças nos dois sentidos:

- **Sólido que se atravessava:** cercas (raio 0), extremidades das barracas (círculo de raio 1 numa barraca de
  2,9 a 3,8 u de largura), cantos e runners do trenó, frente e traseira das renas, cabeça do cachorro, braços dos
  moradores, guirlanda dos postes, placa do poste de boas-vindas, caixa de correio, trenó pequeno, lanternas, gato e
  coelho, estacas e placa do terreno disponível, e as ramas dos pinheiros e da árvore (o avatar ficava com meio
  corpo dentro da folhagem). O chalé usava um círculo de raio 3 para paredes de até 7 × 7 u mais varanda: os cantos
  e a varanda eram atravessados.
- **Bloqueio invisível:** o círculo do banco sobrava 0,35 u na profundidade; o do trenó pequeno, 0,37 u.
- **Atravessar por aperto:** o empurrão para fora rodava uma vez por passo. Entre dois colisores mais próximos que
  a largura do avatar, cada um o empurrava para dentro do outro e ele passava (reproduzido em teste com uma única
  passada: vão de 0,7 u entre uma parede e um poste, avatar de 0,9 u). O teste antigo "click across the plaza" só
  passava por isso: o avatar se espremia entre o morador e o cachorro, a 0,88 u um do outro.

## Decisão

1. **Um só formato de colisor: retângulo arredondado** (`collision.ts`). `{ x, z, r }` é o círculo de sempre; com
   `hx`/`hz` (meias-medidas do núcleo) e `ux`/`uz` (direção do eixo) vira cápsula ou caixa orientada. A mesma função
   de distância (`distanceTo`) alimenta o empurrão físico (`motion.ts`) e a grade de navegação (`navigation.ts`):
   os dois nunca discordam sobre o que é sólido.
2. **Colisor medido pelo desenho.** Cada peça sólida declara a sua pegada em unidades locais do modelo
   (`Solid = [x0, x1, z0, z1, raio do canto]`, em `world.ts`), girada com a peça. A árvore e os pinheiros bloqueiam
   na rama mais baixa, com 0,3 u de folga (o avatar encosta nas agulhas, não entra na folhagem). O chalé usa a
   pegada do próprio modelo gerado (`GenModel.solid`: paredes e varanda); o terreno disponível, as quatro estacas e
   a placa. Presentes, itens de quest, o lago e os pássaros empoleirados continuam sem colisor, de propósito.
   `apps/client/src/scene/colliders.test.ts` confere os dois sentidos para todas as peças.
3. **Empurrão em até três passadas, sem atravessar por aperto.** Se depois das passadas o corpo ainda está dentro
   de algum colisor (vão mais estreito que ele), ele fica onde estava e para.
4. **Rota planejada uma vez por clique** (`navigation.ts`):
   - **Campo** (`createNavField`, refeito só quando o conjunto de colisores muda: casa publicada, bandeira das
     quests): grade de 0,25 u sobre o disco do mundo. Uma célula é livre quando um avatar centrado nela fica a pelo
     menos 0,25 u de todo colisor. As células livres são agrupadas em regiões; a maior é a Vila caminhável.
   - **Destino resolvido** (`resolve`): o ponto clicado, se for chão livre; senão o ponto caminhável mais próximo
     (dentro do mundo, fora do obstáculo), do lado de quem chega quando há empate. O marcador e o brilho do clique
     aparecem no destino resolvido.
   - **Plano** (`planRoute`): linha reta quando o destino está à vista (nenhuma busca); senão A* na grade (8
     vizinhos, sem cortar canto, heurística octil) e depois "puxar a corda": de cada ponto mantido, pula-se até o
     último ponto ainda à vista. O resultado são poucos trechos retos.
   - **Caminhada** (`stepWalk`, a cada passo fixo): mira no ponto atual da rota e passa ao seguinte assim que ele
     fica à vista ou a 0,3 u. A desaceleração conta o caminho que falta, então o avatar só freia no destino.
5. **Desistir é o último recurso.** Sem progresso por 0,5 s, a rota é replanejada de onde o corpo está (até duas
   vezes); só então o destino é abandonado. Um corpo espremido entre colisores, sem célula livre à vista, recebe
   primeiro uma saída célula a célula (`escape`, até 6 u).
6. **Alcances.** `LOT_INTERACT_DISTANCE = 6` para terrenos (a varanda do chalé termina a 4,5 u do centro, então o
   avatar fica a quase 5 u na porta); NPCs, atril e árvore seguem com `INTERACT_DISTANCE = 4.5`
   (`TREE_RADIUS + INTERACT_DISTANCE` para a árvore). Dois sinos e uma lanterna de quest saíram de baixo das ramas
   dos pinheiros (ids inalterados).

### Custo

| Momento | Custo | Limite |
|---|---|---|
| Parado | nenhum planejamento; o passo fixo só confere os colisores, como antes | — |
| Andando | um teste de linha de visão por passo fixo (amostras a cada 0,125 u), sem alocação | comprimento do trecho / 0,125 |
| Clique com destino à vista | um teste de linha de visão | idem |
| Clique com desvio | A* + duas passadas de "puxar a corda" | no máximo as células caminháveis: ≈ 44 000 sem casas (teto geométrico 58 000); medido: 50 a 12 500 expansões, 0,1 a 2 ms |
| Clique num obstáculo ou fora do mundo | duas varreduras da grade (74 529 células) para achar o ponto caminhável mais próximo | ≈ 0,6 ms medido |
| Mudança de colisores | reconstrução do campo | ≈ 3 ms medido (≈ 90 colisores) |

Os tempos foram medidos em Node (vitest) na máquina de desenvolvimento, não em celular; os limites em número de
células valem em qualquer aparelho. Memória: dois vetores por campo (≈ 370 kB) e um rascunho de busca compartilhado
(≈ 2,7 MB), alocado na primeira busca.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Só aumentar o deslize e o `stuckTime` | Não resolve obstáculo no meio da linha reta: o avatar contorna círculos pequenos por acaso e continua preso em caixas, cantos e na árvore |
| Grafo de visibilidade com tangentes entre círculos | Caminho ótimo e poucos nós, mas só vale para círculos: arcos, círculos sobrepostos e formatos longos (barracas, trenó, chalés, cercas) exigiriam casos especiais; a auditoria mostrou que círculo não descreve essas peças |
| Anel de pontos de passagem em volta de cada obstáculo + A* | Simples, mas a qualidade depende de quantos pontos por obstáculo; vãos estreitos e formatos côncavos (casa com varanda) geram rotas ruins ou inexistentes |
| Malha de navegação (navmesh) | Melhor caminho e menos nós, mas precisa de triangulação e de manutenção quando uma casa é publicada; excessivo para um disco de 34 u com ≈ 90 obstáculos |
| Campo de fluxo / direção por quadro | Custo por quadro mesmo parado e oscilação perto de obstáculos; o pedido era planejar no clique |
| **Grade + A* + linha de visão (escolhida)** | Vale para qualquer formato com uma função de distância; custo limitado e medido; a mesma grade responde "qual o ponto caminhável mais próximo" e "há algum bolsão fechado" |

## Consequências

- **Positivas:** todo clique em chão caminhável chega ao destino; clique em obstáculo ou fora do mundo termina ao
  lado, com o marcador no lugar certo; nada sólido é atravessado e nada invisível bloqueia (conferido por teste
  contra os modelos); o avatar não passa mais por vãos menores que ele; o custo fica no clique.
- **Negativas / riscos:** a rota mantém 0,25 u de folga, então vãos entre 0,9 u e ≈ 1,4 u são fisicamente
  passáveis mas não entram em rota (ex.: entre as duas barracas do oeste; entre o pinheiro `(-11, 10)` e a lanterna
  a 135°, o que fecha a rua nesse ponto e leva a rota pela praça ou por fora). Os colisores maiores mudam o caminho
  em volta da árvore (4,95 u do eixo, antes 3,5 u) e dos pinheiros.
- **Em aberto (visual, fora deste ADR):** a coruja fica 4 u acima do pinheiro pequeno em `(26, 18)`; o gato fica
  meio para fora do banco; as lâmpadas dos cordões descem até 2,25 u no meio do vão (a ponta do gorro encosta); as
  pedras de neve da borda do lago (0,5 u de altura) são atravessadas porque o lago é caminhável. O layout é
  PEN-017/PEN-023.
- **Jogadores remotos:** sem mudança. Não há colisão entre jogadores e o servidor só limita a pose ao raio do mundo
  e à velocidade ([IMPL-0008](0008-multiplayer-presence-durable-objects.md)).

## Relacionados

- [IMPL-0007](0007-voxel-mesher-fixed-step-simulation.md): simulação em passo fixo; o item 4 (colisão com círculos,
  destino abandonado após 0,5 s) é complementado por este ADR.
- [IMPL-0010](0010-seeded-procedural-voxel-content.md): geradores por semente; `house()` passa a devolver `solid`.
- [IMPL-0013](0013-quests-v1-runtime.md): `QUEST_OBSTACLES` continua fora de `OBSTACLES` e só entra com as quests
  ligadas.
- Referência: [architecture.md §2.1 e §2.2](../reference/architecture.md#21-loop-por-quadro-player),
  [quests.md §6](../reference/quests.md#6-mundo-packagessharedsrcgameworldts).
- Testes: `packages/shared/src/game/{collision,navigation,motion}.test.ts`,
  `apps/client/src/scene/colliders.test.ts`; navegador: `apps/client/scripts/verify-collisions.mjs`.
