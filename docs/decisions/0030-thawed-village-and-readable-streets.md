# IMPL-0030: Vila com menos neve, ruas legíveis e casas residenciais variadas

**Status:** Proposta — implementada, a validar. Direção de arte pedida pelo responsável técnico em 2026-11-19
("diminuir a quantidade de neve, a vila está muito poluída de branco"; "melhorar visibilidade dos caminhos, ruas e
passagens"; "diferenciar um ou outro modelo das casinhas residenciais"). Nenhuma DEC do repositório de documentação
cobre a direção de arte da cena: a paleta segue **PROPOSTA** (PEN-012) e a conciliação entre a vila nevada e o
"Natal brasileiro de verão" do guia visual segue aberta (cartão G16, OQ-07).
**Data:** 2026-11-19
**Fontes:** pedido do responsável técnico em 2026-11-19 e as escolhas dele na sessão de planejamento ("neve como
detalhe"); [IMPL-0006](0006-christmas-environment-real-time-procedural-weather.md) (vila nevada, clima procedural),
[IMPL-0010](0010-seeded-procedural-voxel-content.md) (geradores com semente), [IMPL-0024](0024-village-expansion-and-zoning.md)
(chão por `groundAt`, pistas das faixas residenciais, casas baixas); código:
`packages/shared/src/game/world.ts` (`PALETTE`, `STREET_LAMPS`), `packages/shared/src/environment/{weather,config,keyframes}.ts`,
`apps/client/src/scene/{groundRuns,villageModels,models,Props}.ts*`, `apps/client/src/scene/gen/{houses,shops,parts,palette}.ts`,
`apps/client/src/scene/environment/Snow.tsx`.

## Contexto

Medido na cena antes desta mudança:

- **Chão:** neve `#F3F5F7`, rua `#B9C6D2`. O contraste entre a rua e o que está ao lado dela ia de 1,19 a 1,59, no
  mesmo tom azul-acinzentado; de 14 % a 40 % das células de cada rua eram pintadas com um tom de neve; a rua
  econômica tinha quase a mesma luminância dos quintais ao lado. Nenhuma rua tinha borda.
- **Telhados:** três de cada quatro colunas do topo de cada chalé e de cada loja recebiam neve, e a câmera olha de
  cima.
- **Clima:** nevava em 85 % das janelas de 45 minutos, e a névoa do clima clareava o que a neve não cobria.
- **Casas:** as 112 casas residenciais tinham, dentro de cada faixa, a mesma pegada, a mesma altura e duas
  silhuetas (duas águas ou quatro águas).

## Decisão

1. **A neve passa a ser detalhe.** Dentro da Vila, o chão é grama com geada (`lawn`, `lawnDark`) com manchas de
   neve; a praça é pedra quente (`paver`). A neve volta a tomar o chão só na borda do mundo, onde começam o campo
   de neve e a floresta (a faixa de transição tem 8 u). Um teste mede: menos de um quinto do chão da Vila é tom de
   neve.
2. **As ruas são a coisa mais escura do chão.** Asfalto na rua redonda, nas avenidas e na rua padrão; paralelepípedo
   escuro na rua premium; terra batida na rua econômica; tijolo nas vielas. Nenhuma rua recebe mancha de neve.
   Todo tom de rua mantém contraste de pelo menos 3:1 contra todo tom de quintal, e um teste falha se um tom novo
   quebrar isso (`groundRuns.test.ts`).
3. **Meio-fio.** Toda célula sem calçamento encostada numa rua vira meio-fio claro (`kerb`). A rua mantém a largura
   inteira; a linha clara corre dos dois lados. As vielas, os caminhos até as portas e os terrenos não recebem
   meio-fio.
4. **Cruzamentos calçados.** Onde uma rua de anel cruza uma avenida, o chão da avenida é a mesma pedra da praça: o
   cruzamento aparece de cima como um pequeno largo. Não há faixa de pedestres nem marcação de pista: a Vila
   continua sem veículos (IMPL-0024).
5. **Telhados com a cor à vista.** A neve fica na cumeeira, com um vão de vez em quando; as águas do telhado não
   recebem cubos soltos (lidos como ruído na primeira tentativa). O telhado de ardósia e a chaminé usam um cinza
   escuro (`slate`): a pedra clara da paleta era lida como neve. Lojas: neve só ao longo do fundo do telhado.
   Pinheiros, árvore, muros, cercas-vivas e lenha: cerca de um terço da neve de antes.
6. **Clima v2.** Pesos por janela: céu limpo 42 %, neve leve 30 %, nevando 14 %, neve forte 7 %, nevasca 2 %,
   névoa 5 % (antes 12 / 30 / 32 / 18 / 5 / 3). A névoa do clima soma 0,012 à densidade por unidade (antes
   0,024). Flocos menores e mais transparentes. `WEATHER_ALGORITHM_VERSION` sobe para **2**.
7. **Casas residenciais com arquétipo.** Cada terreno sorteia, pela semente do seu id e num fluxo próprio, uma de
   quatro formas: chalé clássico (50 %), casa com água-furtada (20 %), sobrado (15 %) ou casa de laje com terraço
   (15 %). Todas mantêm as paredes onde a faixa manda (as fileiras continuam alinhadas e os colisores são os da
   faixa) e até 9 voxels de altura. Detalhes num segundo fluxo: parede em enxaimel, tábuas ou tijolos, base de
   pedra, venezianas e canteiro. Mais cores de parede (verde-sálvia, mostarda, azul, coral) e de telhado (ardósia,
   azul-escuro, musgo).
8. **Poste na rua econômica.** Um poste por lado, no canto oposto ao da rua padrão: sem luz, a rua não se
   distinguia dos quintais à noite.

## Substitui

A tabela de pistas das faixas da IMPL-0024 muda nestas linhas:

| | Premium | Padrão | Econômico |
|---|---|---|---|
| Rua | paralelepípedo escuro | asfalto | terra batida |
| Caminho até a porta | pedra | cascalho | nenhum |
| Poste na esquina com a avenida | nos dois cantos | em um canto | em um canto (o oposto) |

## Alternativas consideradas

- **Só escurecer as ruas, com o chão branco** ("toque leve"): resolve a leitura das ruas e não o excesso de branco.
  Oferecida ao responsável e não escolhida.
- **Tirar a neve** (o "Natal brasileiro de verão" do guia visual): reverte a direção registrada na OQ-07 e muda o
  clima, os bonecos de neve e o lago congelado. Oferecida e não escolhida.
- **Meio-fio em relevo** (voxels ao longo das ruas): mais chamadas de desenho e sombras para um ganho que a cor já
  dá. Fica como opção se a leitura em aparelhos pequenos pedir.
- **Faixa de pedestres nos cruzamentos:** sugere carros numa Vila sem veículos.
- **Manchas de neve nos telhados:** implementadas e retiradas depois de vistas na cena (cubos brancos isolados).

## Consequências

- **Implantação:** cliente e API calculam o clima com o mesmo código compartilhado. Um cliente na versão 2 recusa o
  retrato de uma API na versão 1 e fica "não sincronizado", com o relógio do aparelho: **publicar a API e o
  cliente juntos**.
- **Colisores e navegação:** inalterados, exceto os oito postes novos da rua econômica (cada um com o seu colisor).
- **Custo de desenho:** medido no relatório da mudança; o chão continua numa chamada de desenho.
- **Teste de oclusão:** nove das 48 amostras medidas na cena em 2026-11-13 mudaram de resposta com as casas novas
  (sobrado mais alto, laje e telhado sem neve mais baixos). Receberam a resposta do mesmo cálculo contra os
  modelos novos; **não foram medidas de novo no navegador**.
- **Fotos e vídeos de divulgação** feitos com a Vila branca deixam de corresponder ao jogo.
- **Pendente do dono do produto:** registrar a direção de arte como DEC (G16, OQ-07) e aprovar a paleta (PEN-012).
