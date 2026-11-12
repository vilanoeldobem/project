# Referências visuais dos objetos de `quests-v1`

> **Status: PROPOSTA** (DEC-039 a DEC-042; catálogo inicial pendente em PEN-025).
> Pesquisa feita em inglês, com as páginas e imagens abertas e conferidas. Nenhum asset, textura, imagem ou
> modelo de terceiros foi baixado, copiado ou incorporado ao repositório, e nenhuma dependência foi adicionada.
> Os links servem apenas de inspiração visual; os geradores em `apps/client/src/scene/gen/quest-items.ts`
> produzem voxels próprios a partir de `PALETTE`, `V` e `parts.ts` (IMPL-0010).
> Medidas de voxels e faces: `measure` de `apps/client/src/scene/gen/budget.ts`, máximas nas 12 sementes de
> teste e nas 8 sementes da galeria.

## Como ler cada ficha

- **Base / Corpo / Topo** descrevem a silhueta em três camadas, na ordem em que o olho a lê.
- **Proporção** usa a convenção `largura x altura x profundidade` em voxels, sem a rotação de um quarto de volta
  que algumas sementes aplicam (a rotação troca largura por profundidade, nunca a altura).
- **Paleta** lista de cinco a sete papéis de cor retirados de `PALETTE` (`P`) ou de `V` (`gen/palette.ts`).
- **Sobrevive / fica de fora** separa o que continua legível a 0,18–0,20 unidade de mundo do que viraria ruído.
- **Erros que não repetimos** registra o que as referências fazem e que não funciona neste tamanho.

---

## 1. `reindeer-bell` — Sino do arreio

**Referências consultadas**

- <https://tersco.itch.io/voxel-japanese-shrine-village-pack> — o sino do santuário e a torre do sino mostram
  como uma boca alargada, uma cintura estreita e uma alça se leem em grade voxel de baixa resolução.
- <https://theodd1in.itch.io/xmas> — pacote MagicaVoxel de Natal: contraste de dourado, vermelho e pinheiro, e
  gorros de neve de um voxel que não viram "tampa".
- <https://www.cgtrader.com/3d-models/various/various-models/christmas-bell-rigged> — anatomia clássica do sino de
  arreio natalino: boca, faixa na cintura, cúpula e alça com laço frontal. Usada só para proporção e anatomia.
- <https://sketchfab.com/3d-models/voxel-lamp-aa6ef4c8d1804c2ba7b71712b88deda1> — como um objeto pequeno ganha
  topo escalonado sem perder a leitura de volume único.

**Silhueta em três camadas**

- **Base:** boca 5x5 chamfrada (cantos `±2, ±2` vazios), formando um octógono; badalo de carvão pendurado no
  centro, visível por baixo e pela ranhura frontal.
- **Corpo:** cintura 3x3 com faixa horizontal contrastante, aresta frontal iluminada e cantos traseiros em sombra;
  coroa em cruz de 5 voxels que afina para dentro.
- **Topo:** alça de couro em laço aberto (o centro do arco fica vazio), laço no colar frontal e um único floco de
  neve no ápice. Deve ser reconhecido à primeira vista como sino, não como presente nem lanterna.

**Proporção**

- 5 x 7 x 5 a 5 x 8 x 5 voxels (largura x altura x profundidade). A 0,18 u, entre 0,90 e 1,44 u de altura.
- Medido: máximo de 57 voxels e 138 faces; 12 variantes distintas em 12 sementes.

**Paleta (7 papéis)**

| Papel | Cor |
|---|---|
| corpo | `P.gold` ou `V.goldDeep` (tom trocado por semente) |
| brilho | `V.goldDeep` ou `P.gold`, mais `P.cream` na aresta frontal |
| sombra | `V.crust` (boca interna e cantos traseiros) |
| badalo | `P.coal` |
| alça | `P.wood` e `V.woodDark` (ou `V.woodLight`) |
| laço | `P.red`, `P.pine` ou `V.redDeep`; nó em `P.gold` ou `P.red` |
| neve | `P.snow` |

**Sobrevive a 0,18 u**

- Boca chamfrada, ranhura frontal escura, faixa da cintura, cúpula, alça em arco e laço frontal.
- Detalhes de um voxel: a aresta `P.cream` na boca, o nó do laço, o floco de neve.

**Fica de fora**

- Gravações, arabescos e rebites: viram ruído em 5 voxels de largura.
- Alça fechada como bloco: some a leitura de "alça"; o laço tem de ser aberto.
- Boca com um único voxel saliente por lado: vira espinho e quebra o octógono.

**Erros das referências que não repetimos**

- Sinos realistas com boca circular perfeita e muitos anéis de decoração: impossível em 5 voxels.
- Laço gigante que cobre a cúpula: o sino deixa de ser sino e vira presente.
- Badalo escondido dentro do corpo: sem o carvão aparecendo embaixo, o objeto perde a leitura de sino.

---

## 2. `lucky-charm` — Patuá da sorte

**Referências consultadas**

- <https://randomadjective.itch.io/medievox> — pacote voxel medieval com saque (`Sack`): silhueta de bolsa bojuda,
  gargalo franzido e boca arrepiada, que é a base do patuá.
- <https://www.cgtrader.com/3d-models/household/other/leather-pouch-model-pack-with-drawstring-closure> — fechamento
  de cordão e posição do nó/tassel lateral. Usado só para anatomia.
- <https://theodd1in.itch.io/xmas> — como um raminho de pinheiro e um laço aparecem sobre superfícies vermelhas e
  creme sem competir com o volume principal.

**Silhueta em três camadas**

- **Base:** fundo 3x3 com cantos sombreados; bochechas laterais deixam o corpo bojudo.
- **Corpo:** barriga de 5 voxels de largura com selo estelar dourado na frente; gargalo franzido por um cordão
  dourado em cruz de 5 voxels, com nó e tassel frontais.
- **Topo:** boca arrepiada em anel, abertura escura ao centro, raminho de pinheiro lateral e um toque de neve.
  Deve ser reconhecido como saquinho amarrado, não como caixa.

**Proporção**

- 5 x 4 x 4 a 5 x 5 x 4 voxels. A 0,18 u, entre 0,72 e 0,90 u de altura.
- Medido: máximo de 50 voxels e 108 faces; 11 variantes distintas em 12 sementes.

**Paleta (6 papéis)**

| Papel | Cor |
|---|---|
| corpo | `P.red`, `V.redDeep`, `P.cream` ou `V.blueNight` |
| sombra | `V.redDeep`, `P.red`, `V.creamShade` ou `P.pine` (par oposto ao corpo) |
| cordão e selo | `P.gold` e `V.goldDeep` |
| abertura | `V.woodDark` |
| raminho | `P.pine` e `P.leaf` |
| neve | `P.snow` |

**Sobrevive a 0,18 u**

- Bochechas laterais, gargalo mais estreito que a barriga, cordão dourado, boca arrepiada, selo frontal.
- O raminho fica legível porque tem três voxels conectados e cores distintas do corpo.

**Fica de fora**

- Bordado, letras e símbolos desenhados: viram pixels aleatórios.
- Cordão fino de um voxel ao redor do corpo inteiro: some na silhueta; só o gargalo é marcado.
- Tassel comprido: ultrapassa o orçamento e desequilibra a leitura.

**Erros das referências que não repetimos**

- Sacos realistas com dobras e tecido: em voxels, a dobra vira degrau e o saco vira caixa.
- Boca de saco totalmente fechada: sem o anel arrepiado e a abertura escura, perde-se o "amarrado".
- Excesso de pingentes: três volumes pequenos já saturam um objeto de 0,18 u.

---

## 3. `ornament-crate` — Caixa de enfeites

**Referências consultadas**

- <https://sketchfab.com/3d-models/stylized-crate-e3af60c703a84826adfaf2934b7f8877> — contraste entre postes de
  canto escuros e ripas horizontais claras; é o que faz o engradado se ler como aberto.
- <https://sketchfab.com/3d-models/voxel-medieval-village-props-collection-a0a7cb9f491442ad8c64c590b23d5878> —
  caixas e caixotes vistos de câmera elevada, com laterais vazadas e alças.
- <https://www.megavoxels.com/learn/how-to-create-lights-in-magicavoxel-using-emission> — núcleo emissivo colorido
  dentro de uma moldura escura, sem lavar a cor das ripas.

**Silhueta em três camadas**

- **Base:** piso de tábuas 5x3 ou 5x4, com cantos escuros e leito de palha creme por dentro.
- **Corpo:** quatro postes de canto escuros, ripas horizontais espaçadas na frente e atrás, e vazado lateral que
  funciona como alça de transporte.
- **Topo:** bolas de Natal emissivas apoiadas na palha, um floco de neve e um enfeite escolhido por semente.
  Deve ser reconhecido como engradado aberto com a festa à mostra, não como presente fechado.

**Proporção**

- 5 x 3 x 3 a 5 x 4 x 4 voxels. A 0,20 u, entre 0,60 e 0,80 u de altura.
- Medido: máximo de 68 voxels e 156 faces; 11 variantes distintas em 12 sementes.

**Paleta (7 papéis)**

| Papel | Cor |
|---|---|
| ripas | `P.wood` e `V.woodLight` (alternadas) |
| postes e sombra | `V.woodDark` |
| palha | `P.cream` e `V.creamShade` |
| enfeites | `P.gold`, `P.bulbRed`, `P.bulbGreen`, `P.bulbBlue` (papel emissivo) |
| neve | `P.snow` |

**Sobrevive a 0,20 u**

- Piso listrado, postes escuros, vão entre ripas, alça lateral vazada, bolas coloridas e palha.
- As bolas usam uma cor cada, com no máximo quatro cores na caixa.

**Fica de fora**

- Ripas de um voxel com espaçamento de um voxel: a caixa vira peneira e perde o volume.
- Tampa: mataria a leitura de "aberta com enfeites à mostra".
- Laço e fita: transformariam o engradado em presente.

**Erros das referências que não repetimos**

- Caixotes realistas com tábuas irregulares: em 5 voxels, irregularidade vira ruído.
- Conteúdo escondido dentro de caixa fechada: o brief pede a festa visível.
- Enfeites todos da mesma cor: o contraste entre as quatro cores é o que vende "enfeites".

---

## 4. `donation-panel` — Painel de doação global

**Referências consultadas**

- <https://vox-fox.itch.io/wooden-bulletin-board-t1> — murais de madeira em MagicaVoxel: postes laterais, superfície
  de leitura emoldurada e teto/aba superior.
- <https://www.cgtrader.com/3d-models/architectural/decoration/lectern-big> — geometria do atril inclinado, com
  tampo em degraus virado para o leitor. Usado só para proporção e inclinação.
- <https://sketchfab.com/3d-models/voxel-lamp-aa6ef4c8d1804c2ba7b71712b88deda1> — lâmpada compacta coroando uma
  estrutura vertical de madeira.

**Silhueta em três camadas**

- **Base:** dois patins de madeira no chão e um limiar frontal; nada flutua.
- **Corpo:** duas colunas laterais que terminam **sob** a prancha (se passarem dela, o móvel vira banco), travessa
  e avental frontal que pode receber uma guirlanda de pinheiro com centro vermelho.
- **Topo:** prancha inclinada em três degraus, com superfície creme limpa (sem texto), moldura pinheiro/vermelho,
  lâmpada emissiva com capuz no alto e neve na borda superior. Deve ser reconhecido como atril de leitura.

**Proporção**

- 5 x 6 x 4 a 7 x 7 x 4 voxels. A 0,20 u, entre 1,20 e 1,40 u de altura (na altura do peito do avatar de 2,4 u).
- Medido: máximo de 77 voxels e 196 faces; 12 variantes distintas em 12 sementes.

**Paleta (7 papéis)**

| Papel | Cor |
|---|---|
| estrutura | `P.wood` e `V.woodDark` (troca por semente) |
| moldura | `P.pine` ou `P.red`, com acento no oposto |
| superfície de leitura | `P.cream` e `V.creamShade` |
| guirlanda | `P.pineLight` com centro `P.red` ou `P.pine` |
| lâmpada | `P.gold` ou `V.goldDeep` (papel emissivo) |
| neve | `P.snow` |

**Sobrevive a 0,20 u**

- Dois patins, duas colunas, prancha inclinada espessa, moldura colorida, lâmpada no alto e neve.
- A inclinação é lida porque cada degrau sobe um voxel e recua um voxel, com costas de madeira.

**Fica de fora**

- Texto, números, logotipo e símbolos de ONG: o painel é mudo, como todas as placas da Vila.
- Colunas acima da prancha: destroem a leitura de atril.
- Prancha de um voxel de espessura: vira tábua solta; o reforço traseiro dá o volume.

**Erros das referências que não repetimos**

- Atrils realistas com pés em X e entalhes: em 5–7 voxels, viram ruído.
- Prancha quase horizontal: lê-se como banco ou trenó. A inclinação tem de ser explícita.
- Lâmpada grande: rouba a atenção da superfície de leitura; aqui ela é um único voxel emissivo.

---

## 5. `story-page` — Página da história

**Referências consultadas**

- <https://sketchfab.com/3d-models/minecraft-style-scroll-blockbench-71ad2da73cd9409a81c8e17721fc797e> — pergaminho
  voxel com bordas enroladas, que é o que separa "papel" de "caixa".
- <https://sketchfab.com/3d-models/parchment-letter-with-seal-272fd60f75a84341bdc52355bd08e9f0> — carta de pergaminho
  com fita e lacre de cera central; referência de proporção e do lacre saliente.
- <https://superhivemarket.com/products/aged-parchment-sheet---scroll> — perfil de borda curvada e contraste entre
  papel creme e debruado dourado.

**Silhueta em três camadas**

- **Base:** folha 4–5 x 5–6 voxels, creme aos quadriculados, debruado dourado fino e **uma** faixa de fita vermelha.
- **Corpo:** bordas curtas sobem em cor de papel a `y = 1` (dourado ali leria como borda de bandeja).
- **Topo:** uma ponta enrola a `y = 2` e o lacre de cera sobe sobre a fita. Deve ser reconhecido como fólio ou
  pergaminho, não como presente achatado.

**Proporção**

- 4 x 3 x 5 a 5 x 3 x 6 voxels. A 0,18 u, 0,54 u de altura e até 1,08 u de comprimento.
- Medido: máximo de 47 voxels e 130 faces; 11 variantes distintas em 12 sementes.

**Paleta (6 papéis)**

| Papel | Cor |
|---|---|
| papel | `P.cream` e `V.creamShade` |
| debruado | `P.gold` e `V.goldDeep` |
| fita e lacre | `P.red` e `V.redDeep` |
| sombra do lacre | `V.redDeep` ou `P.red` |
| borda enrolada | `P.cream` e `V.creamShade` |

**Sobrevive a 0,18 u**

- Faixa vermelha única, lacre saliente, debruado dourado no plano e ponta enrolada.
- A assimetria (uma ponta enrolada, a outra só com cantos levantados) é o sinal de "papel".

**Fica de fora**

- Texto, linhas de escrita e símbolos: viram ruído e poderiam sugerir conteúdo inventado.
- Fita em cruz: é exatamente o código visual de presente; por isso a página usa faixa única.
- Neve sobre o papel: o objeto é de interior e a neve o faria parecer um pacote deixado ao relento.

**Erros das referências que não repetimos**

- Pergaminho com muitas ondas e dobras: em 4–5 voxels, cada onda consome uma linha inteira.
- Lacre do tamanho da página: esconde a fita e o debruado.
- Borda dourada também nos voxels levantados: transforma o fólio em uma bandeja.

---

## 6. `village-mailbox` — Caixa de correio (`reuse` → `mailbox`)

**Referências consultadas**

- <https://sketchfab.com/3d-models/voxel-medieval-village-props-collection-a0a7cb9f491442ad8c64c590b23d5878> —
  proporção de poste e volume suspenso em adereços de beira de estrada.
- <https://theodd1in.itch.io/xmas> — contraste de adereços natalinos com neve no topo.

**Silhueta em três camadas**

- **Base:** poste de madeira ou ferro.
- **Corpo:** caixa abaulada de 3 voxels de largura, bandeleta lateral e puxador.
- **Topo:** tampa abaulada com neve.

**Proporção e semente**

- Semente `village-mail`: 4 x 8 x 6 voxels (bandeleta recolhida), 48 voxels e 114 faces a 0,20 u.
- A leitura no tamanho final é boa: caixa creme sobre poste escuro, bandeleta vermelha abaixada (o gelo de
  `frozen-mailbox`), puxador dourado e neve. **Semente mantida.**

**Paleta (5 papéis)**

| Papel | Cor |
|---|---|
| corpo | `P.cream` |
| poste | `V.woodDark` |
| bandeleta | `P.red` |
| puxador | `P.gold` |
| neve | `P.snow` |

**Fica de fora**

- Nome da Vila, números e símbolos: a caixa é muda.
- Bandeleta erguida: a missão fala de caixa congelada; abaixada, ela lê melhor o estado.

**Erros das referências que não repetimos**

- Caixas realistas com arestas arredondadas: em 3 voxels de largura viram bolha.
- Bandeleta de dois voxels: dobra o custo e não melhora a leitura a 0,20 u.

---

## 7. `lake-lantern` — Lanterna do lago (`reuse` → `lantern`)

**Referências consultadas**

- <https://narogame.itch.io/voxel-gun-and-lantern> — lanterna MagicaVoxel com quatro hastes de canto, núcleo
  recuado e chapéu escalonado.
- <https://www.megavoxels.com/learn/how-to-create-lights-in-magicavoxel-using-emission> — núcleo emissivo amarelo
  emoldurado por postes escuros, sem estourar a cor.

**Silhueta em três camadas**

- **Base:** base baixa de 3x3.
- **Corpo:** núcleo luminoso largo cercado por quatro hastes de canto.
- **Topo:** chapéu escalonado com neve.

**Proporção e semente**

- Semente `lake-lantern`: `post = 0`, ou seja, lanterna de chão sem poste; 5 x 6 x 5 voxels, 78 voxels e 162 faces
  (dentro do teto de item de quest), a 0,22 u. **Semente mantida.**
- A leitura no tamanho final é boa: moldura vermelha, núcleo dourado emissivo e neve no chapéu. A mesma função com
  a semente `ring-lantern` produz o poste alto da rua, o que confirma a variação por semente.

**Paleta (5 papéis)**

| Papel | Cor |
|---|---|
| moldura | `P.red` |
| núcleo emissivo | `V.goldDeep` com `P.gold` |
| base e hastes | `P.red` |
| neve | `P.snow` |

**Fica de fora**

- Chama desenhada ou vidro: o papel emissivo já resolve o brilho.
- Poste alto: mudaria o uso de item de quest (carregado/pickup) para adereço de rua.

**Erros das referências que não repetimos**

- Lanternas realistas com vidro fino: em voxels, vidro vira moldura.
- Núcleo apagado: a lanterna do lago precisa do papel emissivo para se destacar na neve.

---

## 8. `kids-sled` — Trenó pequeno (`reuse` → `sled`)

**Referências consultadas**

- <https://theodd1in.itch.io/xmas> — trenó voxel com patins curvos na frente e assento de ripas contrastantes.
- <https://sketchfab.com/3d-models/voxel-medieval-village-props-collection-a0a7cb9f491442ad8c64c590b23d5878> —
  alternância de ripas de madeira em veículos baixos.

**Silhueta em três camadas**

- **Base:** dois patins com ponta dianteira enrolada.
- **Corpo:** assento ripado.
- **Topo:** encosto ou carga opcionais (desligados nesta semente).

**Proporção e semente**

- Semente `kids-sled`: 9 x 4 x 3 voxels, 47 voxels e 170 faces, a 0,22 u, com assento aberto e sem carga — o que
  combina com a missão de dar uma volta (`kids-sled-run`). **Semente mantida.**

**Paleta (6 papéis)**

| Papel | Cor |
|---|---|
| patins | `P.red` |
| assento | `P.cream` e `V.woodDark` |
| estrutura | `P.wood` |
| neve | `P.snow` (quando a semente gera) |

**Fica de fora**

- Renas, sinos e cordas: adereços de outro objeto.
- Carga fechada: o trenó da missão é para brincar, não para transportar presente.

**Erros das referências que não repetimos**

- Trenós realistas com muitas ripas finas: em 9 voxels de comprimento, viram listras.
- Patins sem a curva frontal: o trenó passa a ler como banco.

---

## 9. Decisão sobre as sementes dos objetos `reuse`

| Objeto | Gerador | Semente | Medido (voxels / faces) | Leitura a 0,18–0,22 u | Decisão |
|---|---|---|---:|---|---|
| `village-mailbox` | `mailbox` | `village-mail` | 48 / 114 | Caixa creme, poste escuro, bandeleta abaixada e neve | Mantida |
| `lake-lantern` | `lantern` | `lake-lantern` | 78 / 162 | Lanterna de chão, moldura vermelha e núcleo emissivo | Mantida |
| `kids-sled` | `sled` | `kids-sled` | 47 / 170 | Patins curvos e assento aberto | Mantida |

Nenhuma semente precisou mudar; `objects.csv` mantém `village-mail`, `lake-lantern` e `kids-sled`.

## 10. Erros comuns das referências que valem para todos

- **Silhueta antes do detalhe.** Nenhum objeto aqui depende de textura: a leitura vem da base, do corpo e do topo.
- **Detalhe de um voxel só.** Aresta iluminada, nó de laço, floco de neve e lacre funcionam; gravuras e dobras não.
- **Paleta curta.** De cinco a sete papéis, com um par corpo/sombra e um acento metálico ou emissivo.
- **Contraste de valor, não só de matiz.** `P.cream` e `V.woodDark` separam planos mesmo em tela pequena.
- **Sem texto, número, logotipo ou marca.** Vale para o sino, o patuá, a caixa, o painel e a página.
- **Sem asset de terceiros.** Os links acima são estudo visual; os modelos são gerados por semente, com partes de
  `parts.ts` e cores de `palette.ts`.
