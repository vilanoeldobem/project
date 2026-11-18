# Pesquisa — missões e voxels para o epílogo "O ramo da chegada"

> **Status:** notas de trabalho (2026-11-18). Sustentam a decisão em
> [`../proposals/quests-v1/epilogue-bough/README.md`](../proposals/quests-v1/epilogue-bough/README.md).
> Nada aqui é decisão de produto; o epílogo continua **PROPOSTA** (PEN-025) e atrás das bandeiras existentes.

## Método

Pesquisa na web em 2026-11-18, com leitura das páginas abertas por `read` (não só o resultado da busca).
O foco foi: estrutura de missões em jogos de exploração/cozy, clareza de objetivo e acessibilidade, ética
de recompensa, folclore natalino de domínio público e leitura de silhueta em voxel de baixa resolução.
Nenhum modelo, textura, imagem, áudio ou trecho de código de terceiro foi baixado ou incorporado.

## Fontes lidas

| # | Fonte | Aprendizado | Impacto na decisão |
|---|---|---|---|
| 1 | [Quest Design: Structures, Types, and Patterns — GameDesign.gg](https://gamedesign.gg/articles/quest-design/) | Uma missão é convite → objetivo → obstáculo → resolução → recompensa; o objetivo precisa usar verbos que o jogador já tem e caber em uma linha; contar sem motivo vira tarefa. | Cadeia curta de três missões, objetivos de uma linha, sem contador além dos dois ramos. |
| 2 | [Four Steps to Detailed Quest Lines — Game Developer](https://www.gamedeveloper.com/design/four-steps-to-detailed-quest-lines) | Primeiro o caminho feliz, depois os detalhes; perguntas "e se" antes de ramificar. | Caminho linear e uma entrega cruzada; sem ramificação nesta fatia. |
| 3 | [Q&A: Designing for empathy in wholesome life-sim Cozy Grove — Game Developer](https://www.gamedeveloper.com/design/q-a-designing-for-empathy-in-wholesome-life-sim-i-cozy-grove-i-) | Histórias cozy são servidas em pedaços pequenos, sem pressão para jogar todo dia; o vínculo com o personagem importa mais que a recompensa. | Epílogo curto depois da história; nenhum timer, sequência diária ou laço de retorno. |
| 4 | [Xbox Accessibility Guideline 109 — Objective clarity](https://docs.xbox.com/build/game-principles/accessibility/xag-deep-dives/xag-109-objective-clarity) | O jogador precisa poder revisar o objetivo atual e o progresso a qualquer momento; a descrição deve ser clara e prescritiva. | Caderno de missões existente; progresso `x/y` explícito; nenhum objetivo escondido. |
| 5 | [Game Accessibility Guidelines — Full list](https://gameaccessibilityguidelines.com/full-list/) | Linguagem simples, nenhuma informação essencial só por cor, nada de tempo preciso, texto no ritmo do jogador e leitura por leitor de tela. | Texto + símbolo, sem cronômetro, painel em DOM, mesmo controle das outras missões. |
| 6 | [How to Create Voxel Characters That Read Clearly — Mega Voxels](https://www.megavoxels.com/learn/how-to-create-voxel-characters) | Silhueta primeiro; paleta de três a cinco cores; acessório precisa ler no tamanho final; detalhe demais vira ruído. | Ramo com haste diagonal, leque de agulhas e bagas; paleta restrita a pinheiro, vermelho, madeira e neve. |
| 7 | [Silhouette and Readability — Neverknights](https://neverknights.de/en/tutorials/silhouette-readability/) | Teste de preenchimento preto; vãos carregam informação; apagar pixels órfãos; testar no fundo real. | Ramo conferido como silhueta preta sobre a neve; nada de voxel solto abaixo de 0,20 u. |
| 8 | [Christmas plants and flowers — Natural History Museum](https://www.nhm.ac.uk/discover/christmas-plants-traditions-science-festive-flora.html) | Ramos verdes, azevinho e hera são costumes de solstício de inverno anteriores ao Natal cristão; não pertencem a uma marca. | O epílogo é um ramo de boas-vindas da Vila; nenhum personagem, imagem ou marca licenciada. |
| 9 | [The Holly and the Ivy — Wikisource, English Folk-Carols, 1911](https://en.wikisource.org/wiki/English_Folk-Carols/The_Holly_and_the_Ivy) | O texto de domínio público usa azevinho, hera, baga e inverno como imagens; a letra é de autor desconhecido. | Só a imagem genérica de folhagem de inverno; a letra não é citada nem adaptada. |
| 10 | [Manipulative designs in online games and on gaming platforms — vzbv, 2025](https://www.vzbv.de/sites/default/files/2025-04/25-03-11_Additional_information_vzbv_manipulative_design_online-games.pdf) | Login diário, contagem regressiva, FOMO, loot box e pressão de compra são padrões manipulativos, especialmente para jovens. | Nenhuma diária, contagem, sorte, compra ou doação no epílogo; o ramo é um gesto de tempo, não de dinheiro. |

## Descartadas e por quê

- [A Short History of Christmas Greenery — English Heritage](https://www.english-heritage.org.uk/learn/histories/christmas-greenery-history/):
  a página respondeu HTTP 403 (proteção contra bots); não foi lida e não é citada como fonte de conteúdo.
- [Wreath — Britannica](https://www.britannica.com/art/wreath-floral-decoration): também respondeu HTTP 403;
  substituída pelo artigo do Natural History Museum.
- Páginas de marketing de editores voxel (por exemplo, "o que são voxels"): rasas para decisão de arte;
  usadas apenas como apoio visual, nunca como regra.
- Arte, modelo, textura, imagem ou código de portfólio de terceiros: descartados por licença e por
  proibição do repositório; nenhum foi copiado.

## Conclusão curta

O incremento que cabe na sessão é um **epílogo de três missões** depois de `story-page-delivery`, com
objetivos de uma linha, sem novo NPC nem novo lugar, e **um** objeto voxel novo (o ramo de pinheiro). A
pesquisa sustenta a forma (convite → complicação → entrega), a acessibilidade (texto, símbolo, sem tempo) e
a leitura do modelo (silhueta diagonal, paleta curta, sem ruído). O que foi descartado — cadeia com novo
NPC, evento sazonal, missão rápida sempre ligada e catálogo v2 — está justificado na decisão.
