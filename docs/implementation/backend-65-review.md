# Revisão das 21 tarefas de backoffice e integrações

Em 24/11, a base desta revisão é a `main` após a integração do [#112](https://github.com/vilanoeldobem/project/pull/112). A [issue #65](https://github.com/vilanoeldobem/project/issues/65) reúne as atribuições de Nicolas. O quadro indica a evidência de cada tarefa e quem pode dar o próximo aceite.

O PR de backend reúne o cadastro, o retorno do Pix, os indicadores e o inventário gratuito. As quatro propostas de login no jogo (GAME-02 a GAME-05) têm revisão própria, na branch `feat/65-local-account-actions`. A equipe ainda precisa escolher as regras de lançamento.

| Tarefa | Entrega disponível para revisão | Próximo aceite |
|---|---|---|
| PIX-01 · contrato | A regra da emissão exige uma sessão válida. A recuperação de um Pix anônimo antigo preserva o fluxo histórico. | Conferir a regra com a implementação recuperada. |
| PIX-02 · emissão | Regra restaurada do #101 para as doações global e dirigida. A confirmação do cliente inclui conta e condições esperadas. | Augusto revisar a emissão e a retomada antes do merge. |
| PIX-03 · regressões | Testes com banco e provedor fictício verificam recusa, repetição, isolamento de conta e compatibilidade. | Conferir o resultado da CI na revisão publicada. |
| PIX-04 · revisão | O PR #101 passou pela revisão anterior. A comparação com a main revelou que o conteúdo não chegou à versão conferida. | Augusto revisar a recuperação antes de habilitar Pix. |
| FIN-01 · conciliação local | Consulta para confrontar o registro da Vila com um extrato sintético. A conferência cobre diferenças de um centavo para mais e para menos, ID repetido e cobrança ausente no D1. A consulta parte das linhas do extrato. Um registro só no D1 exige a comparação inversa com o extrato completo do período. | Conferir a leitura do diagnóstico com Bernard. |
| ENC-01 · quadro do turno | Quadro das 21 tarefas com entregas, testes e decisões abertas. | Nicolas definir a ordem de integração depois da revisão. |
| GAME-01 · retorno do Pix | Voltar do link de entrada recupera destino e valor do rascunho. Antes de emitir, o jogador revê a conta e confirma. O rascunho fica na mesma origem e perfil do navegador por 30 minutos. Duas abas e tentativas dentro desse prazo reutilizam a chave. Abrir o e-mail em outro dispositivo exige escolher o destino novamente. | Augusto e Pedro revisar a experiência no jogo. |
| GAME-02 · link externo da ONG | Alternativa local de login antes de seguir o link validado. O registro é um clique, sem valor de doação nem crédito de título. | Bernard e Augusto escolher a regra para links externos. |
| GAME-03 · equipar | Alternativa local para comparar provar o visual livremente e pedir conta ao equipar. | Augusto e Pedro decidir o gesto que exige conta. |
| GAME-04 · conclusão de missão | Alternativa local para comparar exploração livre e entrega de missão vinculada à conta. | Augusto e Pedro decidir sobre conclusão automática, reentrada e XP já existente. |
| GAME-05 · minijogo | Alternativa local de entrada identificada no jogo escolhido, mantendo o acesso livre à Vila. | Augusto e Pedro escolher o que conta como início de partida. |
| ONG-01 · campos da candidatura | Matriz de 34 campos e fluxo atual disponíveis. | Bernard confirmar quais campos e comprovantes são exigidos no cadastro ou somente ao habilitar recebimentos. |
| ONG-02 · candidatura e terreno | Ensaio com candidata e operador distintos, pedido de ajuste, reenvio, aprovação e vínculo público ao lote. | Augusto liberar ambiente, operador e caixa postal para aceite de ponta a ponta. |
| CTA-01 · cadastro de cidadão | Ensaio local verifica cadastro, link de uso único, saída, recusa da sessão encerrada e reentrada com progresso na mesma conta. A chamada do Resend é interceptada em memória. | Conferir chegada e abertura do e-mail numa caixa controlada pela equipe. |
| SUB-01 · subconta | Contrato e teste de retomada após a interrupção do vínculo. | Bernard e titular do provedor decidir quando provisionar e o que fazer com ONGs de link próprio. |
| FIN-02 · extrato do provedor | Cenários locais de confirmação e estorno disponíveis. | Titular fornecer sandbox e extrato higienizado para comparar global e ONG. |
| MET-01 · dinheiro | Consulta por destino recuperada do #103. Painel corrige a unidade monetária e distingue zero de indisponível. | Bernard definir bruto ou líquido, tratamento de estorno e período. Nicolas e Augusto definir o público. |
| MET-02 · presença | Duas abas podem ser duas conexões. A legenda do jogo identifica a medida por praça. | Nicolas e Augusto definir se haverá histórico, como contar e por quanto tempo guardar. |
| MET-03 · visitas e partidas | O ensaio de navegador documenta os sinais disponíveis nos dez jogos e na casa de ONG, inclusive abandono, repetição e troca de ocupante. | Pedro e Augusto decidir se contam início, conclusão, visita ou visitante único e definir os IDs. |
| LOJA-00 · checkout | Quatro lojas conferidas no desktop e no celular. O catálogo atual tem 110 peças gratuitas e 50 pagas ocultas. | Bernard confirmar venda, responsável e condições. Pedro informar a peça e o preço para testar o checkout. |
| LOJA-01 · compra e entrega | Roteiro de aceite cobre confirmação, repetição do evento, cancelamento, estorno e inventário ao reentrar. | Com checkout e SKU de teste, provar a compra e a concessão única em sandbox. |

## Como revisar

1. Percorrer cadastro, reentrada e candidatura com duas identidades de teste. A ONG pode ajustar e reenviar os dados. Conferir a publicação no terreno e o contador somente após a aprovação. O teste automatizado intercepta a chamada de envio ao Resend. A entrega em caixa postal pertence à homologação. [Guia do ambiente](../guides/staging-database.md)
2. Gerar um Pix fictício global e outro dirigido, abrir o link de acesso no mesmo navegador e conferir conta, destino e valor antes de confirmar. O ensaio inclui duas abas e perda da resposta. O [roteiro de navegador](../../apps/client/scripts/verify-pix-return.mjs) inclui os comandos de execução. A regra da emissão do [#101](https://github.com/vilanoeldobem/project/pull/101) e a consulta por destino do [#103](https://github.com/vilanoeldobem/project/pull/103) voltam neste PR porque seus conteúdos estavam ausentes na base integrada.
3. Conferir os valores monetários, a distinção entre zero e indisponível e o que o cliente registra nos dez jogos. Comparar os dados com a [fonte dos indicadores](../reference/indicator-sources.md). O contador de presença mede conexões por praça.
4. Conferir as quatro lojas e o visual após recarregar. A compra depende das definições comerciais e de um checkout de teste. [Inventário e critérios de compra](wardrobe-inventory-qa.md)
5. Avaliar as decisões sobre as rotas de recebimento da ONG e a conferência com o extrato do provedor. [Contrato das beneficiárias](../reference/ngo-beneficiary-contract.md)
