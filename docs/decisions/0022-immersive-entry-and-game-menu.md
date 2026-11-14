# IMPL-0022: Chegada sem tela de boas-vindas, HUD enxuto e menu do jogo (Esc)

**Status:** Proposta — implementada, a validar. É uma **PROPOSTA** do responsável técnico: a chegada sem tela de
boas-vindas, a marca fora da tela de jogo e o menu do jogo só viram decisão quando o responsável pelo produto
ratificar ([OQ-16](open-questions.md)). Substituída em parte por [IMPL-0026](0026-boards-ui-and-character-appearance.md):
a marca volta ao topo da tela de jogo e os caminhos passam a quatro; o restante continua valendo
**Data:** 2026-11-12 (itens 11 a 13 e ajustes dos itens 3 e 5 em 2026-11-13, depois da revisão)
**Fontes:** pedido do responsável técnico em 2026-11-12 (entrar direto na Vila, tirar os botões de zoom e a marca
da tela de jogo, menu no Esc); `vilanoeldobem/docs`: DEC-008 (solidariedade presente desde a chegada), DEC-022
(projeto e logo em 3D), DEC-024 e PEN-016 (logo A3 em teste, sem aprovação final), DEC-026 (praça e doação global),
DEC-029 (jogar nunca é doar), prancha P01 (`docs/specs/plano-de-wireframes.md`: praça como ponto de chegada, "acesso
imediato a Explorar ONGs, Jogar e Doação global", "em celular, mantenha os três caminhos visíveis sem cobrir a
cena"); [IMPL-0002](0002-donations-disabled-until-partner-contract.md),
[IMPL-0016](0016-click-navigation-and-colliders.md), [IMPL-0021](0021-administrator-role-and-moderation.md);
[padrão de diálogo modal do W3C APG](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/); código:
`apps/client/src/game/{store,sim}.ts`, `apps/client/src/lib/{hud-keys,escape,controls,zoom-gestures,dialog-focus,veil,confirm,endpoints}.ts`,
`apps/client/src/ui/{Hud,Menu,Panel,Confirm,Account,Environment,Wordmark}.tsx`, `apps/client/src/App.tsx`,
`apps/client/src/styles.css`, `apps/client/scripts/{arrive,verify,verify-live,verify-collisions,verify-quests,verify-accounts}.mjs`

## Contexto

Até aqui o jogo abria com um painel modal de boas-vindas a cada carregamento (`panel: { kind: "welcome" }` no
estado inicial): a marca provisória, a promessa, os três caminhos (Explorar ONGs, Jogar, Doação global), o botão
"Entrar na Vila" e a dica de como andar. Ninguém andava antes de fechar o painel, em toda visita.

O HUD tinha:

- a marca provisória (`Wordmark`, um marcador de nome: a logo final não está aprovada, DEC-024/PEN-016) como botão
  que reabria o painel de boas-vindas;
- dois botões "＋" e "－" de zoom, embora o zoom já funcionasse pela roda do mouse, pela pinça e pelas teclas;
- os caminhos "Explorar ONGs" e "Jogar" (a "Doação global" só estava no painel de boas-vindas e na árvore); no
  celular, uma coluna de ícones sem nome à direita;
- avisos (`toast`) em posição fixa, que podiam ficar em cima dos botões quando o topo ocupava mais de uma linha.

A tecla Esc só fechava painéis; não havia um lugar único para opções, controles, ajuda e saída.

A prancha P01 pede a praça como ponto de chegada, com acesso imediato aos três caminhos e, no celular, os três
visíveis sem cobrir a cena. A DEC-008 pede a solidariedade presente desde a chegada. Nenhuma das duas pede um
modal.

## Decisão

Tudo abaixo é **PROPOSTA** até a ratificação (OQ-16).

1. **Chegada sem modal.** O estado inicial é `panel: { kind: "none" }`. O visitante chega na praça e o primeiro
   clique ou toque no chão já anda. Não existe mais o painel de boas-vindas (`ui/Welcome.tsx` saiu, e `welcome`
   deixou de ser um tipo de painel).
2. **Os três caminhos continuam a um toque, com nome, desde o primeiro segundo.** No HUD, num único grupo de
   navegação: "🏡 Explorar ONGs", "🎲 Jogar" e "🎄 Doação global" (`PATHS`, `ui/Hud.tsx`), que abrem os mesmos
   painéis de antes. A "Doação global" ganhou botão no HUD porque o único outro acesso sem andar era o modal. No
   celular os três ficam numa linha própria, com o nome escrito (P01). No mundo continua o que já existia: clicar
   ou chegar perto da grande árvore abre a doação global; clicar ou chegar perto de uma casa ou terreno abre o
   painel dele. Não há ponto de minijogo no mundo (o Jogo da Memória abre por "Jogar" e pelo painel da casa) e a
   placa de boas-vindas ao lado do ponto de chegada é cenário: **nenhum objeto novo foi criado** nesta mudança.
3. **Como andar, em uma linha.** Quem ainda não andou neste navegador vê "Clique ou toque no chão para andar." no
   pé da tela, assim que a cena aparece (não durante o carregamento). Não é diálogo, não recebe cliques
   (`pointer-events: none`), some no primeiro passo e também 20 s depois de a cena aparecer (o store conta o
   prazo uma vez; abrir painéis ou o menu não o reinicia). Depois do primeiro passo não volta mais: o navegador
   guarda só a chave `vila.moved.v1` com o valor `1` (nenhum dado pessoal), gravada no primeiro passo mesmo que a
   linha já tenha saído. Fora das telas de toque a linha também diz o que ajuda sem mouse ("“Explorar ONGs” leva
   até uma casa e Esc abre o menu", com a tecla tirada do mapa de teclas), e a frase é anunciada uma vez a
   leitores de tela por uma região de status que já está na página quando o texto chega.
4. **HUD sem botões de zoom e sem a marca.** O zoom segue pela roda do mouse, pela pinça de dois dedos e pelas
   teclas `+`, `=` e `-`; a tela "Controles" do menu diz isso. A marca fica onde identifica o projeto sem ocupar a
   tela de jogo: título da página, tela de carregamento (o `Wordmark` aparece enquanto a Vila carrega) e site
   público. A página ganhou um `<h1>` só para leitores de tela.
5. **HUD em fluxo, sem sobreposição.** Topo: "agora na Vila" (hora e clima, visitantes, olhar o céu) e a navegação
   (caminhos; depois indicadores, conta, moderação e menu). Abaixo: bolsa de missão, avisos e o bloco de moderação;
   o aviso passageiro (`toast`) entra nesse fluxo. Pé: ação contextual e Missões. Nenhum bloco tem posição
   absoluta (só as dicas flutuantes, que não ocupam lugar): o que não cabe quebra de linha, de 320 px ao desktop.
   A faixa "Modo moderação" continua no topo e o HUD começa abaixo dela. Dica flutuante (`data-tip`) só onde o
   controle fica sem nome visível ou, no botão da conta, com o apelido abreviado; ela é posicionada pelo grupo do
   controle e fica sempre dentro da tela. O topo e o pé não encolhem: em tela baixa (celular deitado) é o bloco
   do meio que encolhe, e o bloco de moderação rola por dentro.
6. **Menu do jogo.** Esc sem nada aberto abre o menu; Esc de novo, ou "Continuar", fecha. O botão "☰ Menu" do HUD
   faz o mesmo sem teclado. Entradas, só com conteúdo real: **Continuar**; **Configurações** (as mesmas opções do
   painel "Ambiente": qualidade, conforto, som e outros visitantes, pelo mesmo componente `EnvironmentSettings`);
   **Controles** (teclas, mouse e toque); **Ajuda** (o que é a Vila, onde estão ONGs, missões e conta, link para o
   site); **Sair da Vila** (vai para o site público depois da confirmação protegida `Confirm`, a mesma da
   moderação). Não há seção de áudio: o som é uma opção das configurações.
7. **Ordem do Esc: um toque, uma camada.** Confirmação aberta → cancela a confirmação (o painel de baixo fica);
   painel aberto → fecha o painel; nada aberto → abre o menu; menu numa tela interna → volta à lista; menu na lista
   → fecha. Digitando num campo de texto, o Esc nunca abre o menu. Tecla mantida pressionada conta uma vez. Uma
   única escuta de teclado decide (`pressEscape`, `lib/escape.ts`; a regra é `escapeAction`, pura), então o Esc que
   fecha um painel não abre o menu.
8. **O menu não pausa nada.** Ele não é um `Panel` do estado (`menu` é um campo à parte): o laço por quadro só lê
   `panel` (`walkRoute`, `game/sim.ts`), então o avatar segue a rota, os outros visitantes continuam andando, a
   conexão de presença e o ambiente seguem como estavam. Um teste confere isso (`game/menu-runs.test.ts`). Os
   painéis continuam segurando a caminhada, como antes.
9. **Uma fonte para as teclas e os gestos.** `KEY_BINDINGS` (`lib/hud-keys.ts`) é lido pelo tratador de teclas e
   pela tela "Controles"; os gestos de zoom (`ZOOM_GESTURES`, `lib/zoom-gestures.ts`) carregam os próprios
   ouvintes e o texto mostrado; o chão usa `WALK.accepts` (`lib/controls.ts`). A única linha escrita à mão é a do
   clique na árvore, na casa ou no terreno (são `onClick` dos modelos 3D).
10. **Foco.** Painéis e menu usam o mesmo diálogo (`ui/Panel.tsx` + `lib/dialog-focus.ts`): o foco entra, Tab fica
    dentro, e ao fechar o foco volta para o botão que abriu.
11. **Enter pertence ao controle em foco.** Com o foco num botão, link ou campo, Enter aciona esse controle; só
    com o foco fora de um controle (na página, na cena) ele abre o que está perto do avatar. A tecla E abre o que
    está perto com qualquer foco. Tecla mantida pressionada abre uma vez, e um Enter segurado que chega a um botão
    do HUD é descartado (`hudKeyAction`, `onControl`, `heldOnControl`, puras). **Substitui** a regra da IMPL-0021,
    em que só os controles de moderação ficavam com o próprio Enter e os demais botões do HUD abriam o que estava
    perto: com o menu no HUD, Enter sobre "☰ Menu" ao lado da árvore abria a doação global, e Enter segurado em
    "Continuar" reabria o menu.
12. **Clique no véu.** Um toque ou clique fora do diálogo fecha o painel ou o menu no `click`, e só quando o toque
    também começou no véu (`lib/veil.ts`). Fechar no `pointerdown` deixava o `click` do mesmo toque cair no botão
    do HUD que estava embaixo.
13. **Avisos passageiros com prazo próprio.** O `toast` sai da página 3,6 s depois de desenhado (`TOAST_MS`), com
    ou sem animação; com `prefers-reduced-motion` ele aparece sem animação (antes ficava invisível).

### O que saiu e por quê

| Saiu | Por quê | Onde ficou |
|---|---|---|
| Painel de boas-vindas automático e o botão "Entrar na Vila" | Bloqueava a praça a cada visita | Os três caminhos no HUD; a promessa e o aviso de versão em desenvolvimento em "Ajuda" |
| Botões "＋" e "－" | Repetiam roda, pinça e teclas e ocupavam o canto da tela | Roda, pinça, teclas `+` `=` `-` (listadas em "Controles") |
| Marca provisória no HUD (botão "Início") | Só servia para reabrir as boas-vindas; a logo final não está aprovada (DEC-024) | Título da página, tela de carregamento, site público |
| Coluna de ícones sem nome no celular | Os caminhos ficavam sem nome | Linha própria com o nome dos três caminhos |

### Por que o acesso continua imediato

Antes: carregar → ler o modal → escolher um caminho ou "Entrar na Vila". Agora: carregar → os três caminhos já
estão na tela, com nome, e a praça já responde. Cada caminho continua a um toque; andar passou de dois toques para
um. A doação global continua aparecendo desde a chegada (DEC-008): no HUD e na árvore, com os botões de doar
desabilitados e a nota honesta de sempre (IMPL-0002; nada mudou no painel de doação).

## Alternativas consideradas

- **Mostrar as boas-vindas só na primeira visita.** Ainda é um modal na frente da praça, justamente para quem
  chega pela primeira vez. Rejeitada.
- **Tirar os caminhos do HUD e deixá-los só no mundo.** Fere a P01 (acesso imediato) e obriga a andar para achar
  a doação global e o jogo. Rejeitada.
- **Pôr os caminhos dentro do menu.** Um toque a mais e fora da vista. Rejeitada.
- **Fazer do menu um painel comum.** Pausaria a caminhada (painéis seguram a rota) e misturaria duas camadas no
  Esc. Rejeitada: estado próprio.
- **Manter os botões de zoom só no celular.** No celular a pinça é o gesto esperado e os botões ocupavam o lado
  do polegar. Rejeitada; se a validação em aparelho real mostrar que falta, volta como opção em "Configurações".
- **Pausar o jogo com o menu aberto.** A Vila é compartilhada e em tempo real; pausar só um lado seria fingir.
  Rejeitada.

## Consequências

- Quem chega anda de imediato; nada cobre a cena na chegada.
- A promessa ("Um lugar para viver o Natal…") deixou de aparecer sozinha: está em "Ajuda". A marca não aparece
  durante o jogo. São os dois pontos que o responsável pelo produto deve avaliar (OQ-16, DEC-008, DEC-022/024).
- Sem roda, pinça nem teclado (por exemplo, mouse sem roda e sem teclado) não há como mudar o zoom. O zoom é
  conforto: nada no jogo depende dele.
- Esc numa confirmação agora cancela a confirmação em vez de fechar o painel inteiro; com a ação em envio
  ("Cancelar" desabilitado), o Esc não faz nada.
- O topo quebra de linha conforme a largura, a conta e o papel. Medido no Chrome com a fonte Nunito carregada, em
  2026-11-13: a 320 e a 390 px, duas linhas (três para um administrador, pelo botão "Moderação"); a 360 px, duas;
  a 641 px, duas (três com as contas ligadas); a 768 px, duas (três com apelido de 20 caracteres); a 1024 px, uma
  (duas com apelido de 20 caracteres ou para um administrador); a 1280, 1360 e 1440 px, uma.
- Enter com o foco num botão do HUD não abre mais o que está perto (item 11). Depois de "Explorar ONGs → Ir até
  lá" o foco volta para o botão "Explorar ONGs": quem joga pelo teclado abre a casa com a tecla E.
- Todos os scripts de navegador deixaram de clicar em "Entrar na Vila" e passaram a conferir a chegada
  (`scripts/arrive.mjs`: HUD presente, nenhum diálogo aberto). O `verify-live.mjs` desta versão **falha contra uma
  produção que ainda tenha a tela de boas-vindas**: use-o depois de publicar o jogo.
- `endpoints.ts` passou a conhecer a origem do site público (`site`), só como link; a CSP não muda (navegar não
  é `connect-src`).
- Nenhuma bandeira, rota da API, regra de jogo ou migration mudou.

## Relacionados

- [IMPL-0002](0002-donations-disabled-until-partner-contract.md): doação desabilitada com nota honesta (inalterada).
- [IMPL-0006](0006-christmas-environment-real-time-procedural-weather.md): opções do "Ambiente", agora também em
  "Configurações".
- [IMPL-0016](0016-click-navigation-and-colliders.md): andar só por clique ou toque.
- [IMPL-0021](0021-administrator-role-and-moderation.md): confirmação protegida, faixa e bloco de moderação.
- [Arquitetura §2.3](../reference/architecture.md#23-chegada-hud-e-menu-do-jogo).
- [OQ-05 e OQ-16](open-questions.md): câmera e zoom finais; ratificação desta proposta.
