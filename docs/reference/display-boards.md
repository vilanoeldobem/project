# Placas da Vila: formatos e tamanho das artes

> **Status:** Implementado (Unreleased) — **PROPOSTA** ([IMPL-0031](../decisions/0031-village-rings-zoning-civic-buildings-and-boards.md))
> · **Atualizado em:** 2026-11-19
> **Fonte de verdade:** `packages/shared/src/game/world.ts` (`BOARD_FORMATS`, `BILLBOARDS`, `VILLAGE_NOTICES`,
> `SHORT_NOTICES`), `apps/client/src/scene/boardAtlas.ts` (atlas), `apps/client/src/scene/Village.tsx` (desenho)

## 1. O que existe hoje

A Vila tem 37 placas em quatro formatos. **Todas mostram avisos da própria Vila**: texto fixo do repositório, sem
imagem, sem marca e sem conteúdo de terceiros. O que uma placa poderá mostrar além disso **não está decidido**
(PEN-008, OQ-18) e não há código para isso. Este documento fixa só as medidas, para que artes possam ser preparadas.

| Formato | Id | Painel no mundo | Proporção | Arte a entregar | Quantas | Onde ficam |
|---|---|---|---|---|---:|---|
| Placa de telhado | `billboard-NN` | 5 × 2 u | 5:2 | **1280 × 512 px** | 4 | telhado de cada loja da praça |
| Outdoor | `outdoor-NN` | 8 × 4 u | 2:1 | **2048 × 1024 px** | 7 | um em cada parque; um no fim de quatro avenidas |
| Placa de jardim | `lawn-NN` | 2 × 1,5 u | 4:3 | **512 × 384 px** | 21 | ao lado de cada prédio cívico; duas em cada parque e praça |
| Telão | `screen-NN` | 8 × 4,5 u | 16:9 | **1920 × 1080 px** | 5 | um em cada praça; telhado do cinema, da galeria e do ginásio |

Uma unidade do mundo (u) é um voxel. O avatar tem 2,7 u de altura.

## 2. Como preparar uma arte

- **Formato:** PNG ou WebP, sRGB, sem transparência, exatamente no tamanho da tabela.
- **Margem de segurança:** nada de essencial a menos de 6 % de cada borda. A moldura de voxels cobre a borda do
  outdoor e da placa de telhado, e o painel é visto de cima, em ângulo.
- **Tamanho na tela:** o jogo desenha cada placa numa célula menor do que a arte (um quarto de cada lado; um quinto
  no telão), porque uma placa nunca ocupa mais do que isso na tela. Numa captura de 1440 × 900 px na câmera padrão, um outdoor tem cerca de
  190 px de largura e uma placa de jardim cerca de 55 px. **Texto com menos de 1/8 da altura da arte não se lê.**
- **Placa de jardim:** uma palavra ou um símbolo. Os avisos atuais têm até 18 caracteres.
- **Telão:** uma sequência de imagens paradas (hoje duas), trocadas a cada 8 s. Não há vídeo nem animação. Quem
  liga "menos movimento" vê só a primeira.
- **Noite:** as placas impressas são iluminadas pela cena e ganham um brilho leve quando as luzes da Vila acendem;
  o telão brilha sempre. Arte muito escura some à noite numa placa impressa.
- **Orientação:** toda placa fica de frente para a câmera (para o sul do mapa), qualquer que seja a rua.

## 3. Como o jogo desenha

- Uma textura para todas as placas (`boardAtlas`): 2048 px de largura, as células em fileiras por formato.
- Duas chamadas de desenho: as placas impressas e os telões.
- O mesmo texto aparece no painel da placa como HTML ("Ler placa"), para quem não consegue ler na cena.

## 4. O que falta decidir antes de qualquer arte que não seja da Vila

Do dono do produto (OQ-18): se uma placa pode mostrar algo de parceiro, patrocinador ou ONG; a revisão jurídica
(publicidade que alcança crianças e adolescentes: CDC art. 37, Resolução Conanda nº 163/2014, ECA Digital); quem
aprova cada arte; e, se houver dinheiro envolvido, o fluxo de pagamento (PEN-004, PEN-006). Até lá, `AGENTS.md`
proíbe conteúdo de terceiros e marcas nas placas.

Do lado técnico, receber artes exigirá: carregar imagens no atlas no lugar do texto (hoje o atlas é desenhado em
canvas), decidir de onde vêm (arquivos do repositório ou um armazenamento com aprovação) e um texto alternativo por
arte para o painel.
