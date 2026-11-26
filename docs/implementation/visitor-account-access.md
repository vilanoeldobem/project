# N4.1 · Quando a Vila pede conta e o que volta com o jogador

**Para Augusto e Pedro · 20/11/2026 · [main examinada, 2c29476](https://github.com/vilanoeldobem/project/tree/2c294767aa7756ceaf759eadb4799b7175dedc73) · [Refs #65](https://github.com/vilanoeldobem/project/issues/65)**

Explorar continua livre nos dois pedidos. O formulário de cidadão já existe. Hoje, entrar recupera a conta e sincroniza os eventos de progresso compatíveis deste navegador. O link de acesso aponta para a entrada do jogo e não carrega a ação que o visitante estava tentando fazer. Essa distinção afeta as quatro ações da #65. [Tela de conta](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/ui/Account.tsx) · [Inicialização e sincronização](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/lib/account.ts)

**Atualização de 22/11/2026.** O roteiro abaixo documenta a revisão de 20/11. A API passou a exigir conta para emitir um novo Pix. A consulta do painel, as cobranças anônimas anteriores e o clique em link externo conservam seus contratos. O retorno ao painel pelo cliente continua pendente. [Contrato atual de emissão](../decisions/0034-authenticated-pix-issuance.md)

## Roteiro executado

Em Chromium 155, usamos o cliente compilado em modo `workers` e o handler real da API servido por HTTP em loopback no Node 24. Banco descartável do projeto (`createD1`, SQLite em memória com as migrations até a 0015). Contas ligadas em `ENVIRONMENT=test`, Resend sem chave e doações desligadas. Identidade fictícia. Não foi usado D1 remoto. [Fixture de banco](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/api/test/d1.mjs) · [Testes da API](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/api/src/accounts.test.ts)

| Passo executado | Resposta observada |
|---|---|
| 1. Abrir a Vila como visitante, abrir Explorar ONGs, iniciar Memória e fechar a partida. Abrir Doação global. | `GET /me` → `200 {user:null}`. O tabuleiro abriu sem conta. Ler o painel global concluiu a missão rápida `causes-global-donation/panel`, com 20 XP locais e nenhuma cobrança. |
| 2. Abrir e fechar Conta. Reabrir, preencher nome, nickname, cidade e e-mail e enviar **Criar conta**. | Cancelar manteve o visitante com 20 XP. O cadastro respondeu `202` com `ok` e `devLink`. Antes de consumir o link, `/me` ainda retornava `user:null`. |
| 3. Clicar **Abrir link (só em desenvolvimento)** na mesma página. Recarregar essa aba. | O clique só mudou o fragmento. Não houve `POST /auth/verify` e a pessoa continuou visitante. Ao recarregar, `/auth/verify` respondeu `200`, o fragmento saiu da URL e o navegador recebeu o cookie de sessão `HttpOnly; Secure; SameSite=Lax`. O jogo abriu sem painel de ação. O link vale 15 minutos. |
| 4. Conferir o progresso e recarregar o jogo com a sessão. | `GET /progress` e `POST /progress/events` responderam `200`. A conta recebeu os 20 XP. Recarregar recuperou a mesma conta e a pontuação, sem pedir outro link. A sessão tem prazo de 30 dias. |
| 5. Escolher **Sair** e abrir o link anterior em uma nova navegação. | `POST /auth/logout` → `204`. Em seguida, `GET /me` → `200 {user:null}` e o visitante voltou a 0 XP. Reabrir o link usado respondeu `400 invalid_token` e não abriu sessão. |
| 6. Em **Já tenho conta**, pedir novo link e abri-lo em uma página recém-carregada. | `POST /auth/link` → `202`, `POST /auth/verify` → `200`. Mesma conta, mesmos 20 XP, uma linha em `progress_events`. |

O atalho de desenvolvimento na mesma página e a abertura do link recebido em uma página nova exercitam caminhos distintos. Para repetir o percurso, use os passos da tabela em uma origem local com contas habilitadas em modo de teste, sem chave de e-mail. A suíte de navegador do repositório também abre o link em navegação nova. [Fluxo de navegador existente](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/scripts/verify-accounts.mjs)

**Testes focais na mesma revisão.** Foram aprovados 40 testes. Foram 20 de contas na API, 11 de conta e provador no cliente, um de integração do progresso, quatro de equipamento e quatro de doação com provedor simulado. No teste de integração, a conta manteve 40 XP e a missão ativa `harness-bells` depois de recarregar. O aceite de `lake-lanterns` trazido pelo visitante era incompatível e foi omitido. Com dependências instaladas, os comandos equivalentes a partir da raiz são os seguintes.

```sh
pnpm --filter @vila/api exec vitest run src/accounts.test.ts --maxWorkers=1 \
  -t 'feature flag and origin|registration and magic link|is idempotent per event|accepts a full quest chain once|sets the session cookie|treats an expired session|keeps progress apart between accounts|refuses writes meant for another account'
pnpm --filter @vila/client exec vitest run src/lib/account.test.ts src/ui/Wardrobe.test.tsx --maxWorkers=1
pnpm --filter @vila/api exec vitest run ../../tests/progress-account.test.mjs --maxWorkers=1
pnpm --filter @vila/client exec vitest run src/game/store.test.ts --maxWorkers=1 -t 'the avatar look'
pnpm --filter @vila/api exec vitest run src/donations.test.ts --maxWorkers=1 \
  -t "keeps a visitor's donation|is only usable after the admin validates the HTTPS link|answers a retry with the same key|answers 409 when a key"
```

**O que falta em homologação.** Nicolas e Augusto precisam indicar o ambiente isolado e quem recebe a mensagem de teste. A configuração de staging versionada mantém contas desligadas, sem origem de navegador nem chave Resend. Com contas, remetente, origem e entrega habilitados pela equipe nesse ambiente, o teste é pedir um link para uma caixa controlada, recebê-lo e abri-lo no navegador para conferir a sessão e a segunda abertura. O atalho local prova o consumo do link. A chegada à caixa, o destino no ambiente e o cookie entre os hosts reais exigem essa etapa. [Envio de e-mail](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/api/src/mail.ts) · [Configuração de staging](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/api/wrangler.jsonc)

## Matriz do visitante

A coluna de controle localiza a ação na versão examinada. O ponto para pedir login é uma proposta de integração para a #65. A coluna de retorno descreve o comportamento atual. Hoje o login é voluntário nesses caminhos.

| Ação | Hoje | Pedido da #65 e ponto para pedir login | Quem controla hoje | Entrar, cancelar ou repetir hoje |
|---|---|---|---|---|
| Explorar | Pode andar, abrir o mapa e visitar casas sem conta. Algumas visitas já geram evento de missão. | Manter a entrada, o mapa e as visitas livres. Se uma visita completar uma missão, decidir sobre a recompensa sem impedir a visita. | Movimento e interação no jogo. A casa registra a visita elegível pelo ID do terreno. Consultas públicas dispensam sessão. | Fechar Conta devolve o controle à Vila. Ao entrar no mesmo navegador, eventos de visita compatíveis podem ir para a conta. O link não guarda destino, painel nem posição para retomar o passeio. |
| Trocar skin | Avatar e provador permitem provar e equipar peças grátis liberadas. O visual equipado fica neste navegador. Desbloqueios dependem do progresso. Compra paga indisponível. | Pedir conta ao **equipar**. Confirmar se provar continua livre e se salvar a aparência básica entra na mesma regra. | O provador compartilhado pelo avatar e lojas chama `setLook`. O editor de aparência chama `setAppearance`. Não há gravação do visual na API. | Entrar revalida as peças pelo progresso da conta. O visual é local e uma prévia aberta não é reaplicada pelo link. Ao fechar, a prévia se perde e a troca já salva continua local. Para tentar outra vez, abrir o provador e escolher a peça. |
| Doar | Com doações desligadas, o jogo só informa a indisponibilidade. Com a função ligada e destino configurado, visitante pode gerar Pix global/da ONG ou abrir a página externa validada da ONG. | Manter a consulta pública. Pedir conta **antes de gerar o Pix** ou **antes de registrar o clique e sair para o site da ONG**, conforme rota acordada. | Painéis de doação/casa e API. `POST /donations/pix` e `POST /donations/redirect` aceitam visitante. O Pix associa a cobrança ao doador conhecido na criação. Clique externo só registra saída. | Entrar não recupera o valor em edição nem atribui à conta um Pix já criado como visitante. Fechar antes de gerar não cobra. Fechar depois não cancela um Pix existente. Enquanto o formulário mantém a mesma operação, um erro recuperável reutiliza a chave. Após desmontar o painel, não há retomada garantida. Doação não concede XP. |
| Concluir missão | Missão rápida pode concluir no evento da atividade e dar XP local. Nas quests encadeadas habilitadas, a entrega final usa `turn-in`. | A #65 pede conta para **concluir**. Decidir com Pedro se objetivos seguem locais e só a última transição pede login, incluindo conclusões automáticas durante exploração. | O jogo aplica `record(missionId, eventId)`. A API exige sessão e confere a conta para gravar eventos em D1. As quests propostas dependem das flags de cliente e servidor. | Ao entrar, a API reaplica os eventos compatíveis e devolve o progresso da conta. Reenvio aceito não repete XP. Fechar Conta conserva o progresso local. Um passo ainda não executado não fica reservado para depois do link. Conflitos de quest seguem a regra descrita abaixo. |
| Iniciar minijogo | Tanto o catálogo quanto a casa com atalho abrem Memória para visitantes. Cartas, pares e jogadas ficam na memória do painel. A vitória registra progresso. | Se prevalecer a #65, pedir conta em **Jogar**, nos dois acessos, antes de montar o tabuleiro. Pela OQ-02, o visitante pode iniciar e vencer localmente. | O jogo abre o painel `memory`. Não existe chamada de início de partida à API neste percurso. A vitória emite `play-memory/win` e pode avançar a quest ativa com `memory-win`. | Entrar pode sincronizar uma vitória já registrada. O link não abre uma partida nem restaura as cartas. Fechar antes de jogar deixa a Vila disponível. Sair de uma partida desmonta o tabuleiro. Um novo toque em Jogar começa outra rodada. |

**Onde conferir os controles.** Exploração e minijogo usam [casa e atalho](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/ui/Lot.tsx), [catálogo](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/ui/Games.tsx) e [partida](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/ui/MemoryGame.tsx). Aparência e equipamento usam [editor](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/ui/AvatarPanel.tsx), [provador](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/ui/Wardrobe.tsx) e [armazenamento do jogo](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/game/store.ts). Doação passa pelo [formulário Pix](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/ui/PixDonation.tsx) e pelas [rotas de cobrança e saída](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/api/src/donations.ts). Missões passam pelo [diálogo com NPC](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/ui/NpcDialog.tsx), pelo [redutor de progresso](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/packages/shared/src/game/progress.ts) e pela [gravação na conta](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/api/src/progress.ts).

**Prova complementar da N6.1 na mesma revisão.** O visitante equipou o Gorro de tricô (`helmet-beanie`) e recarregou o jogo na mesma origem. O provador voltou a mostrar “Em uso”. O equipamento foi lido de `vila.look.v2`. O inventário gratuito deriva do progresso, e ainda falta decidir se o visual equipado deve acompanhar a conta em outro aparelho.

**Limite da prova de doação.** A N4.1 verificou o painel com a função desligada. Com o provedor simulado, os testes da API confirmaram Pix de visitante, registro do clique externo e repetição da mesma chave. Mudar o doador sob a mesma chave produziu conflito (409). A N3.1 testou a criação e a repetição de cobranças contra provedor simulado. [Prova financeira separada, PR #72](https://github.com/vilanoeldobem/project/pull/72)

## O que o jogador recupera

- **Mesmo navegador, sem entrar.** O jogo lê o progresso de visitante em `vila.progress.v2`. Fechar Conta ou desistir do cadastro antes de verificar o link conserva esse progresso. Fechar o painel depois de pedir um link também não revoga o link emitido.
- **Mesmo navegador, depois de entrar.** O cliente lê a conta, envia eventos compatíveis do visitante e pendências daquela conta e adota a resposta do servidor. Após a sincronização bem-sucedida, limpa o progresso enviado do visitante. Quests filtradas pelas flags ou incompatíveis com o estado atual podem ficar de fora. Não há fila para entregá-las depois de outra quest. Na falha de sincronização, o cliente sinaliza pendência e tenta novamente ao reconectar. [Sincronização](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/lib/account.ts) · [Decisão de persistência](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/docs/decisions/0019-progress-concurrency-and-acknowledgment.md)
- **Nova visita, outro navegador e saída.** Com cookie válido, `GET /me` restaura a sessão e `GET /progress` recupera o progresso da conta. Em outro navegador, é preciso entrar e só os eventos já sincronizados acompanham a conta de origem. Visual, rascunhos e tabuleiro têm armazenamento próprio. Depois de uma saída confirmada pela API, o cookie anterior perde a sessão. A tela volta ao progresso de visitante deste navegador, em geral vazio depois da migração. [Sessão](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/api/src/session.ts) · [Entrada e saída](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/api/src/auth.ts)
- **Intenção ainda não executada.** Nenhuma das quatro ações tem uma intenção persistente atravessando o link. Há um `then` em memória no painel da conta para candidatura de ONG. Ele não implementa retorno durável para as ações da #65. A chave de repetição do Pix também só se refere a uma operação de pagamento já iniciada. [Candidatura](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/ui/NgoApplication.tsx) · [Repetição do Pix](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/lib/donation-key.ts)

## Decisão que libera a N4.2

**Nicolas prioriza uma única ação com Augusto e Pedro.** Registrem qual regra vale para **jogar** e **concluir missões**. A OQ-02 registra a decisão de Augusto de permitir ambos com progresso local. A #65, de Bernard, pede cadastro para ambos. Se a revisão mudar a regra de produto, obtenham a ratificação de Bernard e vinculem a decisão à issue. [OQ-02](https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/docs/decisions/open-questions.md) · [#65](https://github.com/vilanoeldobem/project/issues/65)

Para a ação escolhida, registrem **o último gesto livre e o primeiro efeito protegido**, a identificação mínima para retomar o gesto depois do link e o destino dos eventos de visitante que já existiam. Isso inclui o caso de abrir o link em outra aba ou aparelho, onde a intenção original pode não estar disponível. Augusto confirma a entrada no jogo. Pedro confirma os eventos e identificadores que já existem. Nicolas responde pela sessão, autorização e persistência. O catálogo, as cadeias, os valores de XP e o epílogo proposto em #63 continuam sob responsabilidade de Pedro. [PR #63](https://github.com/vilanoeldobem/project/pull/63)

**Aceite da próxima story, uma ação por PR.** Cancelar deixa o jogador explorar, conserva o progresso anterior e descarta o gesto pendente sem produzir o efeito da ação escolhida. Entrar com sessão válida retoma a ação escolhida para a conta correta. Abrir o retorno duas vezes produz um único efeito. A API verifica a sessão quando há gravação remota. Para ação inteiramente local, Augusto e Pedro identificam o ponto equivalente no jogo. A política para progresso legado e a primeira ação ainda aguardam escolha.

## Ensaio local do retorno ao Pix

O visitante escolhe um destino e um valor e abre a conta. Ao voltar pelo link de e-mail no mesmo navegador, o jogo busca as condições atuais e pede uma confirmação explícita. Para uma casa, a retomada exige a ONG original no mesmo terreno. Cancelar antes de confirmar não gera Pix. Uma repetição após resposta incerta reusa a chave da mesma operação. Abrir o link em outro aparelho sem o rascunho requer uma nova escolha. O rascunho local vence em 30 minutos e não contém QR Code nem credencial. O ensaio de navegador usa os serviços simulados em loopback.

## Ensaio local das quatro ações da #65

O ensaio local permite comparar a exploração livre com a exigência de conta ao iniciar as quatro ações. Pedro
registrou a confirmação de Bernard para essas ações no [PR #114](https://github.com/vilanoeldobem/project/pull/114#issuecomment-7198977103).

Para comparar os modos em uma cópia descartável, aplique as migrações locais com `pnpm db:migrate:local`. Em um terminal, execute `pnpm --filter @vila/api run dev --var LOCAL_ACCOUNT_ACTIONS:true`. Em outro, execute `pnpm --filter @vila/client dev` e abra o endereço local indicado pelo Vite. Confira `http://localhost:8787/config` antes de começar. A resposta deve conter `localAccountActions: true`. Para repetir com o comportamento habitual, reinicie a API sem o argumento extra. A configuração normal de staging e produção ignora a opção.

| Ação a revisar | Critério observável |
|---|---|
| Abrir o link de uma ONG | Uma ONG fictícia publicada precisa ter link próprio validado. O visitante recebe o convite para entrar. É preciso escolher o link outra vez depois do login. O clique não gera doação nem título. |
| Equipar um visual | Com uma peça liberada, provar mantém o visual atual. Testar fechar o convite de conta, retornar e equipar a peça escolhida. |
| Concluir missão | Comparar uma missão por exploração com a entrega final de uma missão narrativa. Conferir os eventos e o XP antes de entrar, ao confirmar e ao repetir. |
| Iniciar minijogo | Usar o catálogo e o atalho de uma casa fictícia. Fechar o convite e voltar ao mapa. Entrar e repetir a ação para iniciar uma vez. |

O ensaio usa contas e dados fictícios. A migração do progresso do visitante também deve ser avaliada quando ele e a conta têm etapas parciais da mesma missão.

## Homologação das quatro ações

Pedro registrou a confirmação de Bernard em 26/11: explorar é livre. Equipar um visual, concluir uma missão, iniciar um minijogo e abrir o link da ONG pedem conta. [Confirmação no PR #114](https://github.com/vilanoeldobem/project/pull/114#issuecomment-7198977103).

Para testar a regra na homologação, o Worker precisa usar `ENVIRONMENT=staging`, `STAGING_ACCOUNT_ACTIONS=true` e `ACCOUNTS_ENABLED=true`.
A configuração versionada deixa a opção desligada. A build `staging` do jogo aceita `stagingAccountActions: true`
de `GET /config` na origem `https://play-staging.vilanoeldobem.com.br`. O login exige contas habilitadas e uma
caixa de teste que receba o link. Para conferir o link externo da ONG, habilite doações no ambiente do ensaio
e use uma ONG fictícia publicada com link validado. O clique registra o redirecionamento e não gera pagamento.

O comando `node apps/client/scripts/verify-account-actions.mjs --staging` verifica os dois modos em Chromium
local, com as origens de homologação interceptadas, os componentes do jogo e uma API simulada.
