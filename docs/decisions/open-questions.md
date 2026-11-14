# Perguntas abertas ao dono do produto

> **Status:** 13 abertas · **Atualizado em:** 2026-11-13
> **Fonte de verdade:** este arquivo; pendências oficiais em `vilanoeldobem/docs/docs/decisions/registro-de-decisoes.md`

Perguntas que o código não decide. Cada uma tem a escolha conservadora usada até a resposta. Respondida → vira ADR
(se técnica) ou DEC no repositório de documentação, e desce para "Resolvidas".

## Abertas

| ID | Pergunta | Opções | Recomendação conservadora (estado atual) | Bloqueia | Fonte |
|---|---|---|---|---|---|
| OQ-01 | A stack React + Three.js + Cloudflare está aprovada? | aprovar / trocar | Seguir com IMPL-0001 como proposta | G11, D01 | doc 23 |
| OQ-04 | Rota de entrega: A (integral) ou B (núcleo)? | A / B | Implementar B primeiro | ROADMAP | doc 23, M01 |
| OQ-05 | Ângulo, zoom e controles finais da câmera; orçamento de desempenho em celular | — | Diagonal de cima, deslocamento (0,24,21) com zoom do jogador 0,55–1,6×; andar só por clique/toque; vista opcional "Olhar o céu" (IMPL-0006) | G12 | doc 17, G12 |
| OQ-09 | Uma missão aceita pode ser abandonada? Como apresentar uma divergência entre a quest de visitante e a quest já ativa da conta? Hoje não há transição de abandono. `newest-house-visit` pede a visita a uma casa publicada: se a única ONG publicada sair da Vila depois do `accept`, a missão não termina e, como só há uma missão ativa por vez, nenhuma outra pode ser aceita | permitir abandonar (volta a "disponível") / concluir ou liberar a missão automaticamente quando o objetivo deixa de existir / manter como está | Sem transição de abandono nem fila automática de quests; ao entrar, carregar o estado autoritativo da conta e omitir eventos incompatíveis. A missão só é oferecida enquanto existe uma casa publicada; `quests-v1` desligada em produção (IMPL-0013) | Ligar `quests-v1` em produção (PEN-025) | revisões dos PRs #19/#30; [IMPL-0019](0019-progress-concurrency-and-acknowledgment.md); [IMPL-0013](0013-quests-v1-runtime.md) |
| OQ-11 | Painel administrativo: quais sanções existem e quem as aplica (DEC-037)? O bloqueio de conta (PROPOSTA, [IMPL-0021](0021-administrator-role-and-moderation.md)) é uma delas? Com que duração, recurso e aviso? Consultas de admin (auditoria, lista de contas) também devem ser auditadas? As seções do painel são as certas? | ratificar o mecanismo de bloqueio / mudar quem bloqueia, prazo, recurso, aviso ou retenção / não ter bloqueio | Sem sanção em produção: **`ACCOUNT_BLOCK_ENABLED = "false"`** em produção e homologação, nenhum bloqueio acontece. O código, se ligado, faz o que está descrito abaixo; nada disso é decisão de produto. Mutações gravam `audit_events`, e a leitura de comprovantes já é auditada conforme IMPL-0017; demais consultas e menu seguem PROPOSTA | ligar o bloqueio de conta em homologação ou produção; seção "Usuários" do painel; ligar as contas com o painel no ar | [IMPL-0021](0021-administrator-role-and-moderation.md), [IMPL-0015](0015-dash-backoffice-app.md), [IMPL-0017](0017-ngo-files-r2.md), DEC-037 |
| OQ-12 | Arquivos das candidaturas de ONG: quais documentos a organização deve enviar (PEN-019)? Por quanto tempo ficam guardados depois da decisão (aprovação ou rejeição)? Quem, além dos admins, pode lê-los? | lista fechada de documentos / só opcionais; prazo fixo depois da decisão / até a exclusão da conta | Nenhum documento obrigatório nem nomeado; até 5 opcionais; ficam até a pessoa remover (fora de análise/publicação) ou excluir a conta; só quem enviou e admins leem, com leitura administrativa auditada e disponível com bucket ligado mesmo se o envio estiver desligado; envio desligado em produção (`NGO_FILES_ENABLED`) | ligar o envio de arquivos; revisão LGPD / ECA Digital | [IMPL-0017](0017-ngo-files-r2.md), PEN-019 |
| OQ-13 | Medição com Google: desde 2026-11-12 a tag do Google (GTM) tenta enviar dados também para `analytics.google.com`, `www.google.com`, `stats.g.doubleclick.net` e `google.com.br/ads/ga-audiences` (Google Signals / públicos de anúncios). A CSP do jogo bloqueia esses destinos: cada bloqueio é um erro de console, parte da medição se perde e `verify.mjs` / `verify-live.mjs` falham. O que fazer? | desligar o Google Signals e os recursos de publicidade na propriedade do Google Analytics / liberar esses hosts na CSP | **Não liberar**: menores são público provável (ECA Digital, LGPD) e esses destinos servem a publicidade. Desligar Google Signals e personalização de anúncios no Google Analytics; a CSP fica como está | medição confiável; `verify.mjs` e `verify-live.mjs` voltarem a passar | conferência em produção de 2026-11-12; [deploy §5](../guides/deploy.md#5-site-público-e-domínios) |
| OQ-14 | Retirada de ONG publicada (PROPOSTA, [IMPL-0020](0020-ngo-publication-withdrawal.md)): o que a retirada significa para a conta do responsável e para o CNPJ? Pode ser desfeita? A organização pode voltar? O terreno é liberado para outra ONG? O que é guardado, por quanto tempo, e o que é dito à organização? | ratificar o comportamento atual / permitir nova candidatura depois da retirada (da mesma conta, do mesmo CNPJ, ou de ambos) / criar restauração por admin / definir prazo e descarte dos dados | **Bandeira desligada** (`NGO_WITHDRAWAL_ENABLED = "false"` em produção e homologação): nenhuma retirada acontece. O código, se ligado, faz o que está descrito abaixo; nada disso é decisão de produto | ligar a retirada em homologação ou produção | [IMPL-0020](0020-ngo-publication-withdrawal.md), DEC-028/037, PEN-019; revisão do PR #33 |
| OQ-15 | Galeria institucional conciliada: ratificar quantidade, tamanho, PNG/JPEG, dimensões, direitos de imagem, consentimentos, retenção e procedimento para órfãos? Como tratar fotos depois da exclusão da conta? | Ratificar a proposta ou ajustar antes de receber arquivos reais; definir retenção por estado editorial | Galeria com revisão individual, no bucket privado `FILES`, separada de logo/comprovantes; PNG/JPEG tratados pelo parser compartilhado; `NGO_PHOTOS_ENABLED` desligada. Sem WebP nesta versão. Exclusão da conta remove toda a galeria, inclusive fotos aprovadas; leitura pública exige terreno publicado. Texto/versionamento da declaração e conferência de direitos de imagem aguardam decisão operacional | Ativar galeria e receber fotos reais; integração visual posterior | [IMPL-0018](0018-ngo-files-reconciliation.md), DEC-028/037, PEN-019 |
| OQ-16 | Chegada sem tela de boas-vindas (PROPOSTA, [IMPL-0022](0022-immersive-entry-and-game-menu.md)): o visitante cai direto na praça, os três caminhos (Explorar ONGs, Jogar, Doação global) ficam no HUD com nome, a marca provisória não aparece durante o jogo (só no título, no carregamento e no site) e a promessa da Vila passou para "Ajuda", no menu do jogo. Isso atende à DEC-008 e à P01? A marca deve voltar à tela de jogo quando a logo for aprovada (DEC-022/024)? | ratificar / manter uma tela de boas-vindas na primeira visita / pôr a marca aprovada num canto do HUD | Seguir com a IMPL-0022 como proposta: nada bloqueia a praça, os três caminhos e a doação global continuam visíveis desde a chegada, e a marca volta quando houver logo aprovada | Tratar a chegada e o HUD como decisão; arte final do HUD | [IMPL-0022](0022-immersive-entry-and-game-menu.md), DEC-008, DEC-022, DEC-024, PEN-016, P01 |
| OQ-17 | Terrenos residenciais (PROPOSTA, [IMPL-0024](0024-village-expansion-and-zoning.md)): um jogador pode ter um terreno na Vila? A DEC-028 reserva terrenos a ONGs aprovadas e nenhuma decisão registrada fala de jogadores. Se puder, o que cada faixa exige? (No código as faixas se chamam `premium`, `standard` e `economy`; na tela são bairros: "Bairro do Centro", "Bairro do Meio" e "Bairro da Floresta", nomes sem sentido de preço e também PROPOSTA.) | Não permitir (as casas seguem como cenário) / permitir por desbloqueio jogando, com requisito por faixa / outro modelo | **Posse desligada** (`RESIDENTIAL_PLOTS_ENABLED = "false"` em produção e homologação): os 112 terrenos aparecem, todos "indisponíveis", e o painel diz só o terreno, o bairro e "Os terrenos residenciais não têm dono. A posse por jogadores é uma proposta em estudo e ainda não foi decidida." Nada na tela diz que a posse vem aí: sem "em breve", sem requisito e sem nível enquanto a bandeira está desligada. Não existe rota nem esquema de posse. O requisito no código é um marcador (nível 5, 3 e 2) e só aparece com a bandeira ligada; com as missões abertas em produção hoje só o nível 2 é alcançável, e o painel diz quando um nível não é. Nunca um preço: não há moeda nem compra (DEC-042, IMPL-0002) | Fase de posse de terrenos | IMPL-0024, DEC-028, DEC-042 |
| OQ-18 | Placas das lojas (PROPOSTA, [IMPL-0024](0024-village-expansion-and-zoning.md)): elas podem um dia mostrar algo de patrocinadores ou parceiros (PEN-008 não decidiu patrocínio)? Com que regras, sabendo que o público provável inclui crianças e adolescentes? | Só avisos da Vila, sempre / conteúdo de parceiros aprovados, com regras e revisão / não ter placas | **Só avisos da própria Vila**, texto fixo escrito no repositório, sem marca e sem conteúdo de terceiros. O painel da placa diz só "As placas mostram avisos da própria Vila.": nenhuma palavra sobre aluguel, nem para negar. Nenhum código de aluguel existe | Qualquer uso das placas por terceiros | IMPL-0024, PEN-008 |
| OQ-19 | Plano final de terrenos (PEN-017/PEN-023): quantos terrenos de ONG, quantos residenciais por faixa, quantas lojas, e em que disposição? | Ratificar o plano em vigor / ajustar contagens e medidas / outro desenho | Plano em vigor em `VILLAGE_PLAN` (PROPOSTA): 12 terrenos de ONG, 4 lojas, 16 + 32 + 64 residenciais, raio de 82,5 u. O que muda só mexendo num número: quantos terrenos por faixa (ou tirar uma faixa), o tamanho deles e das casas, a largura das ruas dos anéis, o quintal e a borda. O que pede também revisar à mão o cenário da praça: número de lados (hoje só 8 é aceito), tamanho da praça, largura de avenidas e travessas, terrenos por lado na fachada e espaçamento das lojas. Os ids são posicionais: depois da migração 0012 aplicada, qualquer mudança que mova ou renumere terrenos exige uma migração nova | Aplicar a migração 0012 em produção com números definitivos | IMPL-0024, PEN-017, PEN-023 |
| OQ-20 | Vida na Vila (IMPL-0025): qual é o elenco final, com que nomes, com que rotinas, e o que o Papai Noel, os duendes, os lojistas, o lenhador e os moradores podem dizer? | Ratificar o elenco e as falas em vigor / ajustar quem aparece, onde, a que horas e com que texto / esconder os personagens até a decisão | Em vigor como PROPOSTA do responsável técnico, visível a todos: 30 personagens numa tabela (`LIFE_CAST`: Papai Noel, 3 duendes, 4 lojistas, o lenhador, 6 moradores, 3 visitantes da temporada, 2 renas, 2 cachorros, 2 gatos, 4 passarinhos, um coelho e a coruja), sem nome de pessoa (o painel diz "Papai Noel", "Duende", "Lojista", "Lenhador", "Morador da Vila", "Visitante"), com horários fixos (pessoas em casa das 22:00 às 7:00; lojistas no ponto das 9:00 às 19:00). As falas são texto fixo, duas ou três linhas, sem IA; nenhuma vende, dá preço, promete data, pressiona a ficar, voltar, doar ou gastar, nem pergunta nada a quem visita. A decidir: (1) se o Papai Noel aparece como personagem e o que ele pode dizer a uma criança; (2) nomes próprios para alguém do elenco, ou nenhum; (3) se os lojistas ficam à porta de lojas que "ainda não abriram" (o painel da loja diz o mesmo; OQ-18 e IMPL-0024); (4) se um morador pode apontar a "Doação global" (hoje aponta um dos três caminhos do HUD, com "Doar é sempre uma escolha."); (5) horários e clima em que a Vila fica vazia; (6) se personagens devem ficar ocultos por padrão até esta resposta. Fora desta fase e sem código: falas por IA, catálogos de loja, lenha e lareiras, inventário | Nada no código; a ratificação do elenco e das falas antes de divulgar a Vila como "viva" | [IMPL-0025](0025-village-life.md), DEC-029, DEC-042, IMPL-0002 |

**OQ-11, o que só o dono do produto responde sobre o bloqueio de conta.** O bloqueio é PROPOSTA e fica desligado
(**`ACCOUNT_BLOCK_ENABLED = "false"` até a resposta**). O código entrega só o mecanismo
([IMPL-0021](0021-administrator-role-and-moderation.md)). Se fosse ligado hoje, faria o seguinte; cada item precisa
ser ratificado ou mudado, e nenhum foi decidido pelo código:

1. **Quem pode bloquear.** Qualquer administrador bloqueia e desbloqueia qualquer conta de papel Padrão, sozinho,
   sem segunda aprovação; um administrador não é bloqueado (é preciso rebaixá-lo antes). Não há papel de
   moderador. É esse o conjunto de pessoas que pode aplicar uma sanção? Com que critérios escritos? Precisa de uma
   segunda pessoa?
2. **Duração.** O bloqueio não tem prazo: vale até um administrador desfazê-lo. Deve haver bloqueio por tempo
   determinado, prazo máximo ou revisão periódica?
3. **Recurso.** Não existe caminho de contestação dentro da Vila: a pessoa bloqueada só lê a mensagem, sai e
   exclui a conta. Como ela contesta, para quem, e em quanto tempo recebe resposta?
4. **Aviso.** A pessoa não é avisada por e-mail. Ela é desconectada e só descobre ao entrar de novo pelo link,
   quando lê a mensagem que o administrador escreveu (10 a 1000 caracteres, mostrada como foi escrita; não há
   anotação interna separada nem texto padrão). Esse é o canal certo? É preciso um aviso por e-mail, um texto
   padrão, um registro interno do motivo?
5. **Conta de menor de idade.** Menores são público provável (ECA Digital, LGPD) e a Vila não guarda idade nem
   responsável. O que o responsável por um menor bloqueado pode fazer: ler o motivo, contestar, pedir os dados,
   pedir a exclusão? Por qual canal, e como se confirma que é o responsável? A mensagem a um menor precisa de
   cuidado ou revisão antes de ser enviada?
6. **O que a pessoa bloqueada ainda pode fazer.** Hoje: ler os próprios dados e o motivo (`GET /me`), sair e
   excluir a conta. Não pode corrigir os dados cadastrais, ver o próprio progresso, ver ou remover a própria
   candidatura, arquivos e fotos (a exclusão da conta os remove). Esse conjunto é o certo, considerando os
   direitos de acesso e de correção?
7. **O bloqueio é da conta, não da pessoa.** Excluir a conta apaga também o registro do bloqueio e **nada guarda
   o e-mail**: ele pode ser cadastrado de novo, e outro e-mail sempre pode criar outra conta. Isso é aceitável? Se
   o bloqueio deve sobreviver à exclusão, é preciso guardar o e-mail (ou um hash) de quem foi bloqueado: com que
   base legal e por quanto tempo?
8. **Retenção.** O registro do bloqueio (com a mensagem) fica enquanto a conta existir, mesmo depois de desfeito;
   a auditoria (ids, sem o texto) fica sem prazo; um cadastro bloqueado que nunca confirmou o link deixa de
   expirar em 24 horas. Por quanto tempo cada item deve ficar?
9. **ONG da conta bloqueada.** O bloqueio não muda a candidatura nem a ONG: uma ONG publicada continua
   publicada, e a administração ainda decide uma candidatura em aberto. Bloquear o responsável deve ter algum
   efeito sobre a organização (ver OQ-14)?
10. **Remoção de visitante de uma sala** (PROPOSTA, `PRESENCE_MODERATION_ENABLED` desligada): é uma cortesia sobre
    uma conexão anônima, sem conta, e o visitante pode voltar. Ela conta como sanção? Quem pode usá-la, e com que
    critério?

**OQ-15, o que só o dono do produto responde (revisão do PR #35).** O código da galeria é PROPOSTA e não decide
nenhum destes pontos; **`NGO_PHOTOS_ENABLED` fica `"false"` até a resposta**:

1. **Direitos de imagem e consentimento:** hoje o envio de uma foto **não pede nem registra** declaração de
   direitos de imagem ou de consentimento das pessoas retratadas (menores são público provável: ECA Digital,
   LGPD). Qual é o texto, quem declara, e como a declaração é versionada e guardada?
2. **Retenção depois de rejeitar a candidatura da ONG:** a rejeição bloqueia novos envios e mantém as fotos
   privadas, mas **não apaga** os bytes (a rejeição individual de uma foto apaga). Por quanto tempo ficam, e quem
   descarta? Até a resposta, só o responsável (remoção foto a foto ou exclusão da conta) ou um admin as remove;
   não se presume retenção indefinida aprovada.
3. **Retenção dos registros** de fotos rejeitadas ou removidas (linhas sem legenda nem bytes, mantidas para a
   auditoria): prazo e descarte.

**OQ-14, o que só o dono do produto responde (revisão do PR #33).** A retirada é PROPOSTA e fica desligada
(**`NGO_WITHDRAWAL_ENABLED = "false"` até a resposta**). Se fosse ligada hoje, o código faria o seguinte; cada
item precisa ser ratificado ou mudado, e nenhum foi decidido pelo código:

1. **Conta do responsável bloqueada.** Depois da retirada, a conta que enviou a candidatura não consegue enviar
   outra, nem para outra organização com outro CNPJ (`409 application_withdrawn`; a linha retirada continua
   ocupando a vaga de "uma candidatura ativa por pessoa" da migration 0005). Isso é uma sanção sobre a conta? Se
   for, quem a aplica e com que critério (ver OQ-11)? Se não for, a conta deve poder se candidatar de novo?
2. **CNPJ continua em uso.** Nenhuma outra conta consegue candidatar o mesmo CNPJ (`409 cnpj_in_use`). A
   organização pode voltar à Vila? Com nova análise completa? Depois de quanto tempo?
3. **Sem desfazer.** Não existe restauração nem decisão aplicável a uma ONG retirada: um engano só se corrige
   com intervenção manual no banco. Deve existir uma restauração por administrador, auditada?
4. **Bloqueio contornável.** Excluir a conta e criar outra permite candidatar-se de novo com outro CNPJ. Isso é
   aceitável, ou a regra deve valer para a pessoa ou a organização e não para a conta?
5. **Terreno liberado na hora.** O terreno volta a `available` e outra ONG pode pedi-lo. A equipe informou em
   2026-11-12 que esse é o comportamento desejado; **falta o registro como DEC** no repositório de documentação.
6. **Mensagem para a organização.** O texto que o administrador escreve (10 a 1000 caracteres) é mostrado ao
   responsável exatamente como foi escrito, na tela da candidatura; não há anotação interna separada nem aviso
   por e-mail. Esse é o canal certo? É preciso um texto padrão, um registro interno do motivo, ou os dois?
7. **Retenção por omissão.** A candidatura, o registro da retirada (com a mensagem), os arquivos e as fotos
   ficam guardados sem prazo. O responsável pode remover os próprios arquivos e fotos; a exclusão da conta apaga
   documentos, galeria e o logo da ONG retirada, mas o registro e a mensagem ficam. Por quanto tempo cada item
   deve ficar, e quem descarta (ver também OQ-12 e OQ-15)?
8. **Cenas abertas e missões.** Quem já está na Vila continua vendo a casa até recarregar, e a missão
   `newest-house-visit` pode ficar sem objetivo se a última casa sair (OQ-09). Isso precisa de tratamento antes
   de ligar a retirada?

**OQ-17, o que só o dono do produto responde sobre os terrenos residenciais.** A posse é PROPOSTA e fica desligada
(**`RESIDENTIAL_PLOTS_ENABLED = "false"` até a resposta**). O código entrega só o lugar: os terrenos no layout, a
tabela com as colunas de posse vazias e uma leitura pública que nunca diz quem é o dono.

1. **Pode existir.** Um jogador pode ter um terreno? Isso convive com a DEC-028 (terrenos são de ONGs aprovadas) ou
   pede uma decisão nova?
2. **Requisito por faixa.** Se puder: o que cada faixa exige? Hoje o marcador é um nível (5, 3 e 2). Os níveis vêm
   só de missões e quests, e do nível 3 em diante dependem das quests, que estão desligadas em produção.
3. **Limites.** Um terreno por conta? Dá para trocar? O terreno volta a ficar livre depois de quanto tempo sem
   uso? (Sem recompensa por tempo online: é regra do projeto.)
4. **Menores de idade.** O público provável inclui crianças e adolescentes (ECA Digital, LGPD): ter um terreno
   exige conta, e as contas dependem da revisão já pendente. Algo a mais para esta função?
5. **O que o dono faz com o terreno.** Só a casa gerada, ou escolhas de aparência? As lojas entram nisso (itens
   liberados jogando)?
6. **Exclusão da conta.** Hoje o banco só libera o terreno. É o esperado?

**OQ-18, o que só o dono do produto responde sobre as placas.** Enquanto não houver resposta, as quatro placas
mostram avisos da Vila e nada mais.

1. **Terceiros.** Uma placa pode mostrar o nome ou a mensagem de um patrocinador, de um parceiro ou de uma ONG da
   Vila? A PEN-008 (patrocínio) segue sem decisão.
2. **Crianças.** Publicidade que alcança crianças tem regras próprias. Que revisão jurídica precisa existir antes
   de qualquer conteúdo de terceiros? (A conferir por quem fizer a revisão, entre outras normas: Código de Defesa
   do Consumidor, art. 37; Resolução Conanda nº 163/2014; ECA Digital.)
3. **Dinheiro.** "Aluguel" de placa seria um fluxo de pagamento: depende de PEN-004 e PEN-006, como as doações.
4. **Quem aprova.** Quem escreve e quem aprova cada aviso, mesmo os da própria Vila?

## Resolvidas

- **OQ-10** (2026-11-11, Augusto): **sem Cloudflare Access na frente de `dash.*`.** O painel administrativo usa só o
  login próprio (link mágico, sessão e papel `admin` conferidos pela API), conforme
  [IMPL-0015](0015-dash-backoffice-app.md). O Zero Trust fica para o site interno de documentação e gestão
  (`docs.*`, no repositório de documentação).

- **OQ-08** (2026-11-11, Augusto): o **Resend** envia o link de acesso (segredo `RESEND_API_KEY`, remetente
  `acesso@vilanoeldobem.com.br`, só a mensagem do link), conforme [IMPL-0012](0012-resend-transactional-email.md).
  A resposta anterior do mesmo dia (Cloudflare Email Service, [IMPL-0011](0011-accounts-magic-link-ngo-review.md))
  foi revista. Falta verificar o domínio no Resend e gravar a chave no Worker. **Continua pendente** a revisão LGPD / ECA Digital (idade mínima, consentimentos, retenção): até ela ser
  registrada, as contas ficam desligadas em produção (`ACCOUNTS_ENABLED = "false"`).

- **OQ-02** (2026-11-09, Augusto): **explorar a Vila não exige conta.** Visitante anda, joga e faz missões com
  progresso local; criar conta (P13) serve para guardar o progresso no servidor, candidatar uma ONG e, no futuro,
  doar. Ao criar conta, o progresso local é migrado uma única vez, com eventos idempotentes (DEC-038, DEC-042).
- **OQ-03** (2026-11-09, Augusto): **login por link mágico no e-mail** (sem senha). Coleta só o e-mail que o P13 já
  pede, não guarda senha e não usa login social (evita OAuth de terceiros e conta Google de menores). Link de uso
  único com validade curta; sessão em cookie `HttpOnly`, `Secure`, `SameSite=Lax`. Depende de um provedor de envio
  de e-mail (OQ-08, resolvida) e da revisão LGPD / ECA Digital. Implementado em
  [IMPL-0011](0011-accounts-magic-link-ngo-review.md) (15 minutos, uso único; desligado em produção).
- **OQ-07** (2026-11-09, Augusto): direção de arte **vila nevada** (substitui o estudo "Natal brasileiro de verão").
  Implementada em [IMPL-0006](0006-christmas-environment-real-time-procedural-weather.md). Falta registrar como DEC no
  repositório de documentação, onde o guia visual ainda traz o verão como PROPOSTA.
- **OQ-06** (2026-11-08, Augusto): o código fica no repositório `vilanoeldobem`, separado da documentação; o
  repositório Git `vilanoeldobem_docs` substitui a pasta `D:\VILA NOEL DO BEM` — registrado como DEC-045 no
  repositório de documentação (PR #1, aguardando revisão). **Atualização 10/11/2026:** os repositórios atuais são
  `vilanoeldobem/project` (código) e `vilanoeldobem/docs` (documentação); os nomes acima registram o contexto original.
