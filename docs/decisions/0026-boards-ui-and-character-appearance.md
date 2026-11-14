# IMPL-0026: As pranchas P01–P15 no jogo (barra com a marca, folhas de tela e aparência do personagem)

**Status:** Proposta — implementada, a validar. O item 2 **substitui em parte** os itens 2 e 4 da
[IMPL-0022](0022-immersive-entry-and-game-menu.md) (a marca volta ao topo da tela de jogo e os caminhos passam a
quatro); o restante da IMPL-0022 continua valendo, e a ratificação segue em [OQ-16](open-questions.md)
**Data:** 2026-11-14
**Fontes:** pedido do responsável pelo produto em 2026-11-14 (as 15 pranchas `P01`–`P15`, cada uma com a versão de
computador e a de celular, implementadas no jogo); [IMPL-0022](0022-immersive-entry-and-game-menu.md) (chegada sem
modal, HUD, menu), [IMPL-0010](0010-seeded-procedural-voxel-content.md) (camadas cosméticas do avatar),
[IMPL-0008](0008-multiplayer-presence-durable-objects.md) (protocolo de presença, 96 caracteres por mensagem),
[IMPL-0018](0018-ngo-files-reconciliation.md) (fotos públicas de ONG, atrás de bandeira),
[IMPL-0023](0023-donations-abacatepay.md) (doações e Título); decisões DEC-027 (indicador sem fonte),
DEC-038 (quatro campos da conta), DEC-041 (Título evolui com doação confirmada), DEC-042 (jogar nunca é doar);
[OQ-11](open-questions.md) (sanções), OQ-16 (marca na tela de jogo), OQ-17 (terrenos residenciais); PEN-004/PEN-006
(parceira e provedor de pagamento), PEN-026 (faixas do Título); código:
`apps/client/src/ui/{Panel,sheet,Hud,Invite,Indicators,Lot,AvatarPanel,AvatarPortrait,Games,MapPanel,Account,NgoApplication,Missions,Badges}.tsx`,
`apps/client/src/scene/{models,Player}.tsx`, `packages/shared/src/game/appearance.ts`,
`apps/client/src/game/{store,map}.ts`, `apps/client/scripts/verify-boards.mjs`

## Contexto

O responsável pelo produto entregou 15 pranchas de estudo (`P01`–`P15`) desenhadas duas vezes: à esquerda a tela de
computador, à direita a de celular. Elas definem uma linguagem visual (fundo verde-pinho, folhas creme com filete
tan, círculos dourados numerando as seções, botão principal vermelho, abas em pílula, faixa de fluxo no pé) e telas
que o jogo ainda não tinha: convite a uma ONG, catálogo de minijogos, mapa da Vila, aparência do personagem e
badges do doador. As pranchas trazem também telas que o repositório não pode entregar hoje:

- **P05** (chat) e **P06** (emoji sobre o avatar): o protocolo de presença proíbe texto livre e o `VillageRoom`
  não guarda nada (`AGENTS.md`, `packages/shared/src/net/protocol.ts`); a política de sanções é OQ-11.
- **P08** (loja): itens pagos exigem provedor de pagamento (PEN-004, PEN-006) e a IMPL-0002 proíbe simular
  pagamento; a metade gratuita (visuais desbloqueados por missão e nível) já existe.
- **P04** (áreas de atuação, projetos, indicadores da ONG): a projeção pública de `/lots` devolve nome, resumo e
  logo; ampliá-la é uma decisão de produto sobre o que fica público.
- **P11** (empresa): não há programa de empresas nem destino para o convite.
- **P09** (catálogo): existem os jogos do repositório, não os oito títulos de referência da prancha (dois são
  marcas de terceiros, proibidas por `AGENTS.md`).
- **P15** ("Exibir na Vila"): mostrar nome ou badge sobre avatares está fora do escopo (IMPL-0008) e exigiria um
  campo novo no protocolo.

## Decisão

### 1. Uma linguagem só: tokens da prancha e a folha de tela

`styles.css` passa a usar a paleta das pranchas (`--pine #0C352A`, `--cream #FCF4E4`, `--red #A82024`,
`--gold #F5B31A`, `--sheet-line #E7C79A`, `--ink #231F1A`). `ui/sheet.tsx` oferece as peças comuns: seção
numerada (`SheetSection`), etapas (`SheetSteps`), abas em pílula (`SheetTabs`), aviso (`SheetNotice`), barra de
progresso (`SheetProgress`) e a faixa de fluxo (`SheetFlow`). `Panel` ganha `icon`, `subtitle`, `sheet`, `footer` e
`board` (o id da prancha, usado pelas verificações); o `sheet` é mais largo que o painel comum e, no celular, vira
uma folha ancorada no pé da tela. Nenhum painel perde o diálogo modal, o foco preso nem a ordem do Esc
(IMPL-0022, item 7).

### 2. A marca volta ao topo e os caminhos passam a quatro (substitui a IMPL-0022, itens 2 e 4)

A barra do topo leva a marca provisória (`Wordmark`, DEC-024/PEN-016), os quatro caminhos — "Explorar ONGs",
"Jogar", "Doação global" e "Indicar uma ONG" (vermelho, como na prancha) — e o grupo de sistema (ambiente,
indicadores, conta, moderação, menu). No celular a barra tem duas linhas: marca e sistema na primeira, os quatro
caminhos em duas colunas na segunda. A marca continua sem ser botão e o `<h1>` da página continua existindo para
leitores de tela.

### 3. Telas novas, com os dados que existem

- **P11 — convite**: mensagem editável (texto padrão da prancha), link do site público, WhatsApp e e-mail
  (`lib/invite.ts`, função pura); nada vai para a API e "Indicação não garante aprovação." fica no rodapé. A
  metade "empresa" não é desenhada.
- **P09 — catálogo**: lista só o Jogo da Memória, com o aviso de que outros jogos entram quando definidos; "Jogar"
  no HUD abre o catálogo.
- **P10 — mapa**: desenho esquemático de `VILLAGE_PLAN` (praça, anel, frente das casas, 12 terrenos, 4 lojas e 112
  lotes residenciais) com o estado dos terrenos vindo de `/lots` e "Você está aqui" na posição do avatar; "Voltar à
  praça" anda até o ponto de chegada. Um terreno que a API não respondeu é "sem informação", nunca "disponível".
- **P15 — badges**: as quatro faixas de `TITLE_TIERS` (PROPOSTA, PEN-026) e a faixa da conta em
  `/donations/my-title`, com contagem e próxima faixa; sem doações ligadas, o aviso honesto; visitante vê o convite
  para entrar. O "Exibir na Vila" não é desenhado.

### 4. Aparência do personagem (P07) é local ao navegador

`packages/shared/src/game/appearance.ts` define base do rosto, cabelo, cor do cabelo, pele, olhos, altura (só
visual) e barba/bigode. A escolha é guardada em `vila.appearance.v1` e usada pelo avatar local
(`scene/models.ts`, `scene/Player.tsx`) e pelo retrato em SVG (`ui/AvatarPortrait.tsx`).

**Não é transmitida.** O protocolo de presença carrega quatro ids de cosméticos e limita a mensagem a 96 caracteres;
o desenho remoto é instanciado **por conjunto de visuais** (cinco chamadas por conjunto, `RemotePlayers.tsx`). Enviar
a aparência multiplicaria os conjuntos por visitante e estouraria o orçamento de 150 chamadas por quadro com a sala
cheia. Quem visita vê a aparência no próprio avatar; os outros continuam vendo o visual da Vila. O painel diz isso
em uma linha. Fazer o contrário exige uma mudança à parte (mensagem nova e instanciação por visitante dentro do
orçamento, ou uma decisão de elevar o orçamento).

### 5. As telas existentes seguem as pranchas, sem inventar dado

Indicadores (P02) mostram só os cinco indicadores da API, "—" e a nota quando não há fonte; a linha "Fonte/Período"
diz "A definir" e "Atualizado" usa a data da API. Terreno e casa (P03/P04) mantêm todas as decisões de doação e de
candidatura e ganham as seções da prancha; "Fotos" só aparece quando a API já devolve fotos públicas (IMPL-0018,
bandeira desligada em produção). Conta (P13) mantém os quatro campos e o fluxo de link mágico, agora com a prévia
pública ao lado. Candidatura (P12) mantém as quatro etapas e o fluxo de situação. Missões (P14) mantêm as missões,
o XP e o caderno, com a missão ativa, as abas por trilha e "Ver no mapa" só onde há lugar.

### 6. O que a entrega não faz

Chat (P05), emoji sobre avatar (P06), itens pagos (P08), projetos/áreas públicas (P04), convite a empresa (P11),
outros jogos (P09) e o interruptor "Exibir na Vila" (P15). Nenhuma bandeira é ligada, nenhuma migração é criada,
nenhum número é inventado. Cada item depende de uma decisão registrada (OQ-11; PEN-004/PEN-006; uma decisão sobre a
projeção pública; uma decisão sobre o protocolo de presença; PEN-026).

## Consequências

- A tela de jogo passa a mostrar a marca e quatro caminhos; a IMPL-0022 fica parcialmente substituída e a OQ-16
  continua aberta para ratificar (ou reverter com uma regra de CSS).
- A aparência é um dado local: trocar de navegador muda o avatar; ninguém mais a vê. É o preço de manter o orçamento
  de desenho e o protocolo de presença como estão.
- `verify.mjs` passa a exigir a marca na barra e os quatro caminhos; `verify-boards.mjs` abre cada prancha nas duas
  larguras e guarda as capturas em `apps/client/verify-output/`.
- As pranchas continuam sendo estudo de layout e texto: onde o repositório já tinha uma frase aprovada, ela fica.

## Alternativas

- **Trocar só as cores, sem a barra com a marca**: mais perto da IMPL-0022, mas não é o que as pranchas pedem e
  deixaria P11/P13/P15 sem o topo que lhes dá contexto.
- **Enviar a aparência pela presença**: corrige a diferença entre o avatar local e o remoto, mas estoura o orçamento
  de chamadas com a sala cheia; fica para uma mudança própria.
- **Desenhar as telas que dependem de decisão com dados de exemplo**: violaria a regra de não inventar número, ONG
  ou pagamento; por isso elas não são desenhadas.
