# Conteúdo procedural (voxels gerados por semente)

> **Status:** Fases 0–5 implementadas (núcleo, galeria, adereços, casas, moradores, animais, cosméticos) · **Atualizado em:** 2026-11-10
> **Fonte de verdade:** `apps/client/src/scene/gen/`, testes em `gen.test.ts`
> ([IMPL-0010](../decisions/0010-seeded-procedural-voxel-content.md))

## 1. Regras

- **Determinístico.** Cada gerador é uma função pura `(semente) → modelo`. Mesma semente, mesmo modelo, em qualquer
  aparelho e no servidor. Sem `Math.random` (um teste varre o código), sem relógio.
- **Por partes.** Receita de peças reutilizáveis (`parts.ts`: caixa, paredes, disco, neve no topo, rotação) e
  escolhas de paleta (`palette.ts`). Cores só da `PALETTE` ou de variações nomeadas dela (`shade`), nunca hex solto.
- **Mesmo renderizador.** Saída é `Voxel[]` inteiro, base em y = 0, pronta para `<Voxels>` (malha com AO, IMPL-0007).
  Papéis de material por cor: `emissive` (lâmpadas), `glow` (janelas), `sway` (folhagem).
- **Orçamento por categoria**, verificado em teste para 12 sementes de cada gerador.
- **Sem texto, logotipo ou marca** em nenhum modelo (placas são tábuas lisas). Nenhuma ONG, doador ou parceiro
  inventado.

## 2. Orçamentos

| Categoria | Voxels máx. | Faces máx. (após remoção) |
|---|---:|---:|
| Adereços (`props`) | 220 | 600 |
| Casas (`houses`) | 900 | 1.800 |
| Personagens (`characters`) | 160 | 420 |
| Animais (`animals`) | 140 | 380 |
| Cosméticos (`cosmetics`, por camada) | 40 | 140 |

## 3. Geradores

| Id | Nome | Categoria | Variação (por semente) | Máx. voxels / faces (8 sementes da galeria) |
|---|---|---|---|---|
| `gift` | Presente | props | papel (6 pares), padrão (listras, bolinhas, xadrez, liso), fita, laço, tamanho | 130 / 166 |
| `lantern` | Lanterna | props | moldura, altura do poste, largura, telhado, ponteira | 85 / 216 |
| `fence` | Cerca | props | tinta, comprimento, altura, estilo (trilhos, ripas, cruzada) | 49 / 166 |
| `sled` | Trenó | props | patins, assento, comprimento, encosto, carga | 80 / 250 |
| `mailbox` | Caixa de correio | props | cor, poste, altura, bandeira | 64 / 146 |
| `signpost` | Placa | props | 1–3 tábuas, direção, cores (sem texto) | 25 / 102 |
| `garland` | Guirlanda | props | comprimento, curvatura, lâmpadas, laços | 44 / 154 |
| `market-stall` | Barraca | props | toldo listrado, madeira, largura, mercadorias | 111 / 318 |
| `panettone-stand` | Barraca de panetone | props | toldo, madeira, largura (toque brasileiro) | 110 / 322 |
| `house` | Chalé | houses | planta 5×5 a 7×7, 1–2 andares, telhado (duas águas, quatro águas, chalé alpino), cores de parede/telhado/porta, varanda, guirlanda na porta, pingentes, neve no telhado, chaminé (âncora `chimney` = origem da fumaça) | 367 / 950 |
| `villager` | Morador | characters | corpo (largura, altura), casaco, calça, botas, luvas, cachecol, chapéu (gorro, cartola, protetor de orelha, boné, nenhum), cabelo, tom de pele (4 variações nomeadas) | 128 / 266 |
| `reindeer` | Rena | animals | pelagem, galhada, arreio, nariz (raro: vermelho) | 124 / 294 |
| `dog` | Cachorro | animals | pelagem, manchas, porte, orelhas, coleira | 80 / 190 |
| `cat` | Gato | animals | pelagem, listras, cauda | 59 / 160 |
| `bird` | Passarinho | animals | plumagem (6 pares), cauda, topete | 30 / 78 |
| `rabbit` | Coelho | animals | pelagem, orelhas (em pé/caídas) | 62 / 140 |
| `owl` | Coruja (noite) | animals | penas (nevada ou marrom), olhos que brilham, tufos | 58 / 106 |
| `hat` | Chapéu (camada) | cosmetics | estilo (Noel, tricô, protetor de orelha, azevinho, cartola), cores | 14 / 42 |
| `scarf` | Cachecol (camada) | cosmetics | listras, ponta | 19 / 76 |
| `sweater` | Suéter (camada) | cosmetics | padrão (floco de neve, listras, zigue-zague, bolinhas), cores | 12 / 38 |

Na Vila: os presentes escondidos usam `gift` com a semente = id do presente (`gift-palm`, `gift-bench`,
`gift-street`). Cada terreno com ONG publicada recebe um `house` com a semente = id do terreno (`plaza-01`…): a mesma
casa para todos, sem nome, logo ou cor de marca; janelas acendem com a hora real de São Paulo (papel `glow`); a
fumaça sai da âncora `chimney`. A casa cabe em 5 voxels do centro do terreno (a varanda termina na borda da rua).

Moradores e animais (PROPOSTA de decoração, `CRITTERS` em `packages/shared/src/game/world.ts`): 3 moradores, um
cachorro, um gato no banco, dois passarinhos nos postes, um coelho e uma coruja num pinheiro, cada um com semente
fixa. Respiram e olham em volta pelo material `idle` (shader de vértice; "Menos movimento" desliga). A coruja só
aparece com as luzes da Vila acesas (noite pela hora real de São Paulo). Moradores e cachorro bloqueiam o avatar;
animais pequenos não projetam sombra (economia de chamadas). Sem nomes nem rótulos. Os demais adereços ainda não têm lugar no mapa (layout é PEN-017/PEN-023).

## 4. Cosméticos do avatar (PROPOSTA)

Catálogo e regras em `packages/shared/src/game/cosmetics.ts`; camadas de voxels em
`apps/client/src/scene/gen/cosmetics.ts`. Cada item é uma camada (chapéu, cachecol, suéter) ou uma paleta de cores
pintada sobre `avatarParts()`; o visual escolhido fica salvo neste navegador (`vila.look.v1`) e é sempre conferido
contra o que o progresso já liberou.

| Item | Encaixe | Como libera |
|---|---|---|
| Gorro de Noel · Sem cachecol · Casaco liso · Clássico | — | Padrão |
| Gorro de tricô · Cachecol listrado | chapéu · cachecol | Missão "Encontre 2 presentes escondidos na praça" |
| Protetor de orelha · Suéter floco de neve | chapéu · suéter | Missão "Complete o Jogo da Memória" |
| Cachecol verde · Paleta Floresta | cachecol · cores | Missão "Visite um terreno e conheça o cadastro de ONGs" |
| Coroa de azevinho · Suéter listrado · Paleta Noite estrelada | chapéu · suéter · cores | Nível 2 |

Regras: libera só por missão ou nível (derivado do progresso; regras de XP inalteradas); tudo alcançável sem doar
(nenhum item ligado à missão sobre doação, mesmo sendo só leitura); sem compra, sorteio, recompensa por tempo online
ou contagem regressiva. Ao concluir uma missão que libera algo, o aviso diz "Novo visual: …". O painel "Caderno de
Missões" mostra "Visual do avatar", com cadeado e o requisito exato nos itens ainda fechados.

O visual viaja pela presença (IMPL-0008) como ids do catálogo: os outros visitantes veem seu chapéu, cachecol, suéter
e cores. Avatares remotos com o mesmo visual são desenhados juntos (5 chamadas por visual diferente presente).

## 5. Testes (contrato de todo gerador)

Determinismo por semente · orçamento · ≥ 6 variantes distintas em 12 sementes · coordenadas inteiras · base em
y = 0 · hash de saída para sementes fixas em snapshot (`__snapshots__/gen.test.ts.snap`): mudar a arte aparece
como diff a revisar (`vitest -u` depois de revisar na galeria).

## 6. Galeria (só desenvolvimento)

`?gallery` (localhost ou build de desenvolvimento) mostra cada categoria em 8 sementes girando, com voxels/faces
máximos contra o orçamento e custo de renderização. `?gallery&cat=props` abre uma categoria.
`node apps/client/scripts/gallery.mjs http://localhost:8799 [categoria…]` fotografa; `verify.mjs` também.

## Ver também

[IMPL-0010](../decisions/0010-seeded-procedural-voxel-content.md) · [IMPL-0007](../decisions/0007-voxel-mesher-fixed-step-simulation.md) ·
[architecture.md](architecture.md)
